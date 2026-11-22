#!/usr/bin/env node
/**
 * Builder-only portable backup and restore.
 *
 * This tool encrypts a stopped-writer snapshot of the builder identity store,
 * its minimisation journal and restore-receipt history. It deliberately reuses
 * the existing store lock, store serialization, restore gate and minimisation
 * replay mechanics. It does not use a reputation database, job, scheduler or
 * provider.
 *
 * Commands:
 *   backup   --store <dir> --out <file> --passphrase-file <file> [--receipt <file>]
 *   inspect  --archive <file>
 *   verify   --archive <file> --passphrase-file <file>
 *   restore  --archive <file> --out <freshDir> --passphrase-file <file>
 *            [--receipt <file>] --acknowledge-point-in-time
 *   replay   --store <restoredDir> --journal <latestJournal> [--receipt <file>]
 *            --acknowledge-usage-window [--acknowledge-open-usage]
 *
 * The restored store is written with a closed restore-replay gate. Admission
 * remains unavailable until the latest authoritative journal is replayed.
 * A backup is a point-in-time snapshot; it does not reconstruct usage written
 * after the snapshot.
 */
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  scryptSync,
} from "node:crypto";
import {
  chmodSync,
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import {
  BUILDER_IDENTITY_LOCK_FILE,
  BUILDER_IDENTITY_STORE_FILE,
  BUILDER_MINIMIZATION_JOURNAL_FILE,
  BUILDER_RESTORE_REPLAY_GATE_FILE,
  BUILDER_RESTORE_REPLAY_RECEIPT_FILE,
  BUILDER_RESTORE_REPLAY_RECEIPT_PREFIX,
  BUILDER_STORE_HOST_ID,
  assertBuilderStoreReplayReady,
  builderMinimizationJournalHasPending,
  emptyBuilderMinimizationJournal,
  readBuilderIdentityStoreSnapshot,
  readBuilderMinimizationJournalUnlocked,
  readBuilderRestoreReplayGate,
  readBuilderRestoreReplayReceiptHistory,
  serializeBuilderMinimizationJournal,
  withBuilderStoreRawLock,
  writeBuilderRestoreReplayGateUnlocked,
} from "../builder-runtime/lib/identity-store.ts";
import {
  computeBuilderMinimizationAccounting,
  prepareBuilderRestoreReplay,
  replayBuilderMinimizationJournal,
} from "../builder-runtime/lib/minimization.ts";

const MAGIC = Buffer.from("ORNIBAK1", "ascii");
const FORMAT = "ornigami-builder-backup";
const VERSION = 1;
const ALGORITHM = "aes-256-gcm";
const KDF = Object.freeze({ name: "scrypt", N: 32768, r: 8, p: 1, keyLength: 32 });
const SALT_BYTES = 16;
const NONCE_BYTES = 12;
const TAG_BYTES = 16;
const HEADER_LENGTH_BYTES = 4;
const MAX_ARCHIVE_BYTES = 128 * 1024 * 1024;
const MIN_PASSPHRASE_BYTES = 16;
const REAP_LOCK_FILE = "identity-store.reap.lock";
const HASH_PATTERN = /^[a-f0-9]{64}$/;
const ATTEMPT_ID_PATTERN = /^rra_[a-f0-9]{24}$/;

export class BuilderBackupError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "BuilderBackupError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new BuilderBackupError(code, message);
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function canonicalJson(value) {
  return JSON.stringify(value);
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readPassphrase(file) {
  if (!file || !existsSync(file)) fail("passphrase_missing", "A passphrase file is required.");
  const stat = lstatSync(file);
  if (!stat.isFile()) fail("passphrase_invalid", "Passphrase input must be a regular file.");
  if (process.platform !== "win32" && (stat.mode & 0o077) !== 0) {
    fail("passphrase_permissions", "Passphrase file must not be group/other-readable.");
  }
  const firstLine = readFileSync(file, "utf8").split(/\r?\n/, 1)[0];
  if (Buffer.byteLength(firstLine, "utf8") < MIN_PASSPHRASE_BYTES) {
    fail("passphrase_too_short", `Passphrase must be at least ${MIN_PASSPHRASE_BYTES} bytes.`);
  }
  return firstLine;
}

function deriveKey(passphrase, salt, kdf) {
  if (
    !isRecord(kdf) ||
    kdf.name !== "scrypt" ||
    kdf.N !== KDF.N ||
    kdf.r !== KDF.r ||
    kdf.p !== KDF.p ||
    kdf.keyLength !== KDF.keyLength
  ) {
    fail("backup_kdf", "Unsupported backup key-derivation parameters.");
  }
  return scryptSync(passphrase, salt, KDF.keyLength, {
    N: KDF.N,
    r: KDF.r,
    p: KDF.p,
    maxmem: 128 * 1024 * 1024,
  });
}

function atomicWrite(file, bytes, mode = 0o600) {
  const parent = path.dirname(path.resolve(file));
  const parentStat = statSync(parent, { throwIfNoEntry: false });
  if (!parentStat || !parentStat.isDirectory()) {
    fail("output_parent", `Output parent directory is missing: ${parent}`);
  }
  if (existsSync(file)) fail("output_exists", `Refusing to overwrite existing file: ${file}`);
  const temporary = path.join(parent, `.${path.basename(file)}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`);
  let descriptor;
  try {
    descriptor = openSync(temporary, "wx", mode);
    let offset = 0;
    while (offset < bytes.length) offset += writeSync(descriptor, bytes, offset);
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    renameSync(temporary, file);
  } catch (error) {
    if (descriptor !== undefined) {
      try {
        closeSync(descriptor);
      } catch {}
    }
    try {
      rmSync(temporary, { force: true });
    } catch {}
    throw error;
  }
}

function writeJson(file, value, mode = 0o600) {
  atomicWrite(file, Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8"), mode);
}

function testAbort(marker) {
  if (
    process.env.BUILDER_RUNTIME_ALLOW_TEST_HOOKS === "1" &&
    process.env.BUILDER_BACKUP_TEST_ABORT_AFTER === marker
  ) {
    throw new Error(`simulated backup/restore interruption after ${marker}`);
  }
}

function requireFreshDirectory(directory) {
  if (existsSync(directory)) {
    const stat = statSync(directory);
    if (!stat.isDirectory()) fail("restore_output", `Restore output is not a directory: ${directory}`);
    if (readdirSync(directory).length > 0) {
      fail("restore_output_not_empty", `Restore output directory is not empty: ${directory}`);
    }
  } else {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
  }
  if (process.platform !== "win32") {
    const stat = statSync(directory);
    if ((stat.mode & 0o077) !== 0) fail("restore_permissions", "Restore output must be private.");
  }
}

function receiptPathOrDefault(explicit, storeDirectory, suffix) {
  return explicit ?? `${storeDirectory}${suffix}`;
}

function isInside(parent, child) {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function validateMode(mode, label) {
  if (!Number.isInteger(mode) || mode < 0 || mode > 0o777) {
    fail("backup_manifest", `Invalid ${label} mode.`);
  }
  if (process.platform !== "win32" && (mode & 0o077) !== 0) {
    fail("backup_permissions", `${label} must not be group/other-accessible.`);
  }
}

function allowedReceiptName(name) {
  return (
    name === BUILDER_RESTORE_REPLAY_RECEIPT_FILE ||
    (name.startsWith(BUILDER_RESTORE_REPLAY_RECEIPT_PREFIX) && name.endsWith(".json"))
  );
}

function inspectStoreInventory(directory, { allowOwnLock = false } = {}) {
  const names = readdirSync(directory).sort();
  for (const name of names) {
    const full = path.join(directory, name);
    const stat = lstatSync(full);
    if (stat.isSymbolicLink()) fail("backup_symlink", `Store contains a symlink: ${name}`);
    if (name === BUILDER_RESTORE_REPLAY_GATE_FILE) {
      fail("backup_restore_pending", "Store has an unresolved restore gate; restore/replay it first.");
    }
    if (name === BUILDER_IDENTITY_LOCK_FILE || name === REAP_LOCK_FILE) {
      if (allowOwnLock) continue;
      fail("backup_writer_present", `Store lock is present (${name}); stop writers and recover the lock.`);
    }
    if (name.startsWith(".") || name.endsWith(".tmp")) {
      fail("backup_temporary_state", `Store contains temporary state: ${name}`);
    }
    if (
      name === BUILDER_IDENTITY_STORE_FILE ||
      name === BUILDER_MINIMIZATION_JOURNAL_FILE ||
      allowedReceiptName(name)
    ) {
      if (!stat.isFile()) fail("backup_store_shape", `Store entry is not a regular file: ${name}`);
      continue;
    }
    fail("backup_unexpected_file", `Store contains an unrecognized file: ${name}`);
  }
}

function assertStorePermissions(directory, files) {
  if (process.platform === "win32") return;
  const root = statSync(directory);
  if ((root.mode & 0o077) !== 0) fail("backup_permissions", "Store directory must be private (0700).");
  for (const file of files) {
    if ((file.mode & 0o077) !== 0) fail("backup_permissions", `Store file must be private (0600): ${file.path}`);
  }
}

async function snapshotStore(storeDir) {
  const directory = path.resolve(storeDir);
  const stat = statSync(directory, { throwIfNoEntry: false });
  if (!stat || !stat.isDirectory()) fail("backup_store_missing", `Store directory is missing: ${directory}`);
  inspectStoreInventory(directory);

  return withBuilderStoreRawLock(
    directory,
    async (lockedDirectory) => {
      inspectStoreInventory(lockedDirectory, { allowOwnLock: true });
      const snapshot = await readBuilderIdentityStoreSnapshot(lockedDirectory);
      const journalRead = await readBuilderMinimizationJournalUnlocked(lockedDirectory);
      if (journalRead.present && builderMinimizationJournalHasPending(journalRead.journal)) {
        fail("backup_pending_journal", "Minimisation journal has a pending request; finish or restore it first.");
      }
      const history = await readBuilderRestoreReplayReceiptHistory(lockedDirectory);
      if (history.errors.length > 0) {
        fail("backup_receipt_history", `Restore receipt history is corrupt: ${history.errors.join(", ")}`);
      }

      const names = readdirSync(lockedDirectory).sort();
      const files = [];
      const addFile = (name, bytes, mode) => {
        files.push({
          path: name,
          mode,
          bytes: bytes.length,
          sha256: sha256(bytes),
          contentBase64: bytes.toString("base64"),
        });
      };

      const identityPath = path.join(lockedDirectory, BUILDER_IDENTITY_STORE_FILE);
      const identityBytes = readFileSync(identityPath);
      addFile(BUILDER_IDENTITY_STORE_FILE, identityBytes, statSync(identityPath).mode & 0o777);

      let journalBytes;
      if (journalRead.present) {
        journalBytes = readFileSync(path.join(lockedDirectory, BUILDER_MINIMIZATION_JOURNAL_FILE));
      } else {
        journalBytes = Buffer.from(serializeBuilderMinimizationJournal(emptyBuilderMinimizationJournal()), "utf8");
      }
      addFile(
        BUILDER_MINIMIZATION_JOURNAL_FILE,
        journalBytes,
        journalRead.present
          ? statSync(path.join(lockedDirectory, BUILDER_MINIMIZATION_JOURNAL_FILE)).mode & 0o777
          : 0o600,
      );

      for (const name of names.filter(allowedReceiptName)) {
        const full = path.join(lockedDirectory, name);
        addFile(name, readFileSync(full), statSync(full).mode & 0o777);
      }

      assertStorePermissions(lockedDirectory, files);
      const accounting = computeBuilderMinimizationAccounting(snapshot.store);
      const journalTimes = journalRead.journal.events
        .flatMap((event) => [event.createdAt, event.effectAt, event.completedAt])
        .filter((value) => typeof value === "string")
        .sort();
      const createdAt = new Date().toISOString();
      return {
        schemaVersion: VERSION,
        kind: FORMAT,
        createdAt,
        source: {
          hostId: BUILDER_STORE_HOST_ID,
          storeVersion: snapshot.store.version,
          storeHash: snapshot.storeHash,
          journalPresent: journalRead.present,
          journalHash: journalRead.hash,
          journalLatestEventAt: journalTimes.at(-1) ?? null,
          receiptIds: history.receipts.map((receipt) => receipt.receiptId),
          accounting,
          snapshotAsOf: createdAt,
        },
        limitations: {
          pointInTimeSnapshot: true,
          postBackupUsageReconstructed: false,
          postBackupSettlementReconstructed: false,
          restoreRequiresLatestAuthoritativeJournal: true,
          admissionClosedUntilReplay: true,
        },
        exclusions: {
          locks: [BUILDER_IDENTITY_LOCK_FILE, REAP_LOCK_FILE],
          restoreGate: BUILDER_RESTORE_REPLAY_GATE_FILE,
          temporaryFiles: true,
        },
        files,
      };
    },
    { lockWaitMs: 1_000 },
  );
}

function buildArchive(payload, passphrase) {
  const plaintext = Buffer.from(canonicalJson(payload), "utf8");
  const salt = randomBytes(SALT_BYTES);
  const nonce = randomBytes(NONCE_BYTES);
  const header = {
    format: FORMAT,
    version: VERSION,
    algorithm: ALGORITHM,
    kdf: KDF,
    salt: salt.toString("base64"),
    nonce: nonce.toString("base64"),
    createdAt: payload.createdAt,
    payloadBytes: plaintext.length,
  };
  const headerBytes = Buffer.from(canonicalJson(header), "utf8");
  const key = deriveKey(passphrase, salt, header.kdf);
  const cipher = createCipheriv(ALGORITHM, key, nonce);
  cipher.setAAD(headerBytes);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  const length = Buffer.alloc(HEADER_LENGTH_BYTES);
  length.writeUInt32BE(headerBytes.length, 0);
  return Buffer.concat([MAGIC, length, headerBytes, tag, ciphertext]);
}

function parseArchive(archive) {
  const bytes = readFileSync(archive);
  if (bytes.length > MAX_ARCHIVE_BYTES) fail("backup_archive_size", "Backup archive is too large.");
  if (bytes.length < MAGIC.length + HEADER_LENGTH_BYTES + TAG_BYTES) {
    fail("backup_archive_truncated", "Backup archive is truncated.");
  }
  if (!bytes.subarray(0, MAGIC.length).equals(MAGIC)) {
    fail("backup_archive_format", "Backup archive magic is invalid.");
  }
  const headerLength = bytes.readUInt32BE(MAGIC.length);
  const headerStart = MAGIC.length + HEADER_LENGTH_BYTES;
  const headerEnd = headerStart + headerLength;
  const tagEnd = headerEnd + TAG_BYTES;
  if (headerLength === 0 || headerEnd > bytes.length || tagEnd > bytes.length) {
    fail("backup_archive_truncated", "Backup archive header is truncated.");
  }
  const headerBytes = bytes.subarray(headerStart, headerEnd);
  const tag = bytes.subarray(headerEnd, tagEnd);
  const ciphertext = bytes.subarray(tagEnd);
  let header;
  try {
    header = JSON.parse(headerBytes.toString("utf8"));
  } catch {
    fail("backup_archive_format", "Backup archive header is not valid JSON.");
  }
  if (!isRecord(header) || header.format !== FORMAT || header.version !== VERSION) {
    fail("backup_archive_format", "Unsupported backup archive format or version.");
  }
  if (header.algorithm !== ALGORITHM || !isRecord(header.kdf)) {
    fail("backup_archive_format", "Unsupported backup archive algorithm.");
  }
  if (header.payloadBytes !== ciphertext.length) {
    fail("backup_archive_truncated", "Backup archive payload length does not match its header.");
  }
  const salt = Buffer.from(String(header.salt ?? ""), "base64");
  const nonce = Buffer.from(String(header.nonce ?? ""), "base64");
  if (salt.length !== SALT_BYTES || nonce.length !== NONCE_BYTES || tag.length !== TAG_BYTES) {
    fail("backup_archive_format", "Backup archive cryptographic parameters are invalid.");
  }
  return { bytes, header, headerBytes, tag, ciphertext, salt, nonce };
}

function decryptArchive(archive, passphraseFile) {
  const parsed = parseArchive(archive);
  const passphrase = readPassphrase(passphraseFile);
  const key = deriveKey(passphrase, parsed.salt, parsed.header.kdf);
  let plaintext;
  try {
    const decipher = createDecipheriv(ALGORITHM, key, parsed.nonce);
    decipher.setAAD(parsed.headerBytes);
    decipher.setAuthTag(parsed.tag);
    plaintext = Buffer.concat([decipher.update(parsed.ciphertext), decipher.final()]);
  } catch {
    fail("backup_authentication", "Backup authentication failed (wrong key or corrupt archive).");
  }
  let payload;
  try {
    payload = JSON.parse(plaintext.toString("utf8"));
  } catch {
    fail("backup_payload", "Backup payload is not valid JSON.");
  }
  validatePayload(payload);
  return { parsed, payload, payloadHash: sha256(plaintext) };
}

function validatePayload(payload) {
  if (!isRecord(payload) || payload.schemaVersion !== VERSION || payload.kind !== FORMAT) {
    fail("backup_payload", "Backup payload format is invalid.");
  }
  if (!isRecord(payload.source) || !isRecord(payload.limitations) || !isRecord(payload.exclusions)) {
    fail("backup_payload", "Backup payload is missing source, limitation or exclusion metadata.");
  }
  if (!Array.isArray(payload.files) || payload.files.length < 2) {
    fail("backup_payload", "Backup payload must contain the store and journal.");
  }
  const seen = new Set();
  for (const file of payload.files) {
    if (!isRecord(file) || typeof file.path !== "string" || file.path.length === 0) {
      fail("backup_payload", "Backup payload contains an invalid file entry.");
    }
    if (
      path.isAbsolute(file.path) ||
      file.path.includes("..") ||
      file.path.includes("/") ||
      file.path.includes("\\") ||
      seen.has(file.path)
    ) {
      fail("backup_payload", `Backup payload contains an unsafe or duplicate path: ${file.path}`);
    }
    seen.add(file.path);
    if (
      typeof file.contentBase64 !== "string" ||
      !Number.isInteger(file.bytes) ||
      file.bytes < 0 ||
      typeof file.sha256 !== "string" ||
      !HASH_PATTERN.test(file.sha256) ||
      !Number.isInteger(file.mode)
    ) {
      fail("backup_payload", `Backup payload file entry is invalid: ${file.path}`);
    }
    const bytes = Buffer.from(file.contentBase64, "base64");
    if (bytes.length !== file.bytes || sha256(bytes) !== file.sha256) {
      fail("backup_integrity", `Backup file integrity check failed: ${file.path}`);
    }
  }
  for (const required of [BUILDER_IDENTITY_STORE_FILE, BUILDER_MINIMIZATION_JOURNAL_FILE]) {
    if (!seen.has(required)) fail("backup_payload", `Backup payload is missing ${required}.`);
  }
  const source = payload.source;
  if (
    typeof source.storeHash !== "string" ||
    !HASH_PATTERN.test(source.storeHash) ||
    typeof source.snapshotAsOf !== "string" ||
    !Number.isFinite(Date.parse(source.snapshotAsOf)) ||
    typeof source.journalPresent !== "boolean" ||
    !Array.isArray(source.receiptIds) ||
    !isRecord(source.accounting)
  ) {
    fail("backup_payload", "Backup source metadata is invalid.");
  }
  const identity = payload.files.find((file) => file.path === BUILDER_IDENTITY_STORE_FILE);
  if (sha256(Buffer.from(identity.contentBase64, "base64")) !== source.storeHash) {
    fail("backup_integrity", "Backup identity-store hash does not match its manifest.");
  }
  const journal = payload.files.find((file) => file.path === BUILDER_MINIMIZATION_JOURNAL_FILE);
  if (source.journalPresent) {
    if (typeof source.journalHash !== "string" || source.journalHash !== journal.sha256) {
      fail("backup_integrity", "Backup journal hash does not match its manifest.");
    }
  } else if (source.journalHash !== null) {
    fail("backup_integrity", "Backup journal presence metadata is inconsistent.");
  }
  const receiptIds = new Set();
  for (const file of payload.files.filter((entry) => allowedReceiptName(entry.path))) {
    let receipt;
    try {
      receipt = JSON.parse(Buffer.from(file.contentBase64, "base64").toString("utf8"));
    } catch {
      fail("backup_payload", `Backup receipt history is not valid JSON: ${file.path}`);
    }
    if (!isRecord(receipt) || typeof receipt.receiptId !== "string") {
      fail("backup_payload", `Backup receipt history is invalid: ${file.path}`);
    }
    receiptIds.add(receipt.receiptId);
  }
  for (const receiptId of source.receiptIds) {
    if (typeof receiptId !== "string" || !receiptIds.has(receiptId)) {
      fail("backup_integrity", `Backup receipt history is missing ${receiptId}.`);
    }
  }
}

export async function createEncryptedBackup({ storeDir, out, passphraseFile, receiptPath }) {
  if (!out) fail("backup_output", "--out is required.");
  if (isInside(storeDir, out)) fail("backup_output_inside_store", "Backup archive must be outside the store directory.");
  if (receiptPath && isInside(storeDir, receiptPath)) fail("backup_receipt_inside_store", "Backup receipt must be outside the store directory.");
  if (existsSync(out)) fail("output_exists", `Refusing to overwrite existing archive: ${out}`);
  const payload = await snapshotStore(storeDir);
  const passphrase = readPassphrase(passphraseFile);
  const archiveBytes = buildArchive(payload, passphrase);
  atomicWrite(out, archiveBytes, 0o600);
  const receipt = {
    schemaVersion: 1,
    kind: "ornigami-builder-backup-receipt",
    status: "complete",
    archivePath: path.resolve(out),
    archiveSha256: sha256(archiveBytes),
    archiveBytes: archiveBytes.length,
    createdAt: payload.createdAt,
    source: payload.source,
    fileCount: payload.files.length,
    files: payload.files.map((file) => ({ path: file.path, bytes: file.bytes, sha256: file.sha256, mode: file.mode })),
    encryption: {
      algorithm: ALGORITHM,
      kdf: KDF,
      payloadSha256: sha256(Buffer.from(canonicalJson(payload))),
    },
    exclusions: payload.exclusions,
    limitations: payload.limitations,
    customerAdmission: "closed",
  };
  if (receiptPath) writeJson(receiptPath, receipt);
  return receipt;
}

export function inspectEncryptedBackup({ archive }) {
  const parsed = parseArchive(archive);
  return {
    schemaVersion: 1,
    kind: FORMAT,
    archivePath: path.resolve(archive),
    archiveSha256: sha256(parsed.bytes),
    archiveBytes: parsed.bytes.length,
    header: parsed.header,
    ciphertextBytes: parsed.ciphertext.length,
    headerSha256: sha256(parsed.headerBytes),
  };
}

export function verifyEncryptedBackup({ archive, passphraseFile }) {
  const { parsed, payload, payloadHash } = decryptArchive(archive, passphraseFile);
  return {
    schemaVersion: 1,
    kind: FORMAT,
    archivePath: path.resolve(archive),
    archiveSha256: sha256(parsed.bytes),
    archiveBytes: parsed.bytes.length,
    payloadSha256: payloadHash,
    createdAt: payload.createdAt,
    source: payload.source,
    files: payload.files.map((file) => ({ path: file.path, bytes: file.bytes, sha256: file.sha256, mode: file.mode })),
    limitations: payload.limitations,
  };
}

export async function restoreEncryptedBackup({
  archive,
  out,
  passphraseFile,
  receiptPath,
  acknowledgePointInTime = false,
}) {
  if (!out) fail("restore_output", "--out is required.");
  if (receiptPath && isInside(out, receiptPath)) fail("restore_receipt_inside_store", "Restore receipt must be outside the restored store directory.");
  if (!acknowledgePointInTime) {
    fail(
      "restore_acknowledgement",
      "Restore requires --acknowledge-point-in-time; a snapshot cannot reconstruct post-backup usage or settlement.",
    );
  }
  const { parsed, payload, payloadHash } = decryptArchive(archive, passphraseFile);
  requireFreshDirectory(out);
  const attemptId = `rra_${randomBytes(12).toString("hex")}`;
  const startedAt = new Date().toISOString();
  await writeBuilderRestoreReplayGateUnlocked(out, {
    version: 3,
    attemptId,
    phase: "closed",
    startedAt,
    previousReceiptIds: [],
  });
  if (process.platform !== "win32") {
    chmodSync(path.join(out, BUILDER_RESTORE_REPLAY_GATE_FILE), 0o600);
  }
  testAbort("gate_written");

  for (const file of payload.files) {
    const bytes = Buffer.from(file.contentBase64, "base64");
    if (sha256(bytes) !== file.sha256 || bytes.length !== file.bytes) {
      fail("backup_integrity", `Restore file integrity check failed: ${file.path}`);
    }
    atomicWrite(path.join(out, file.path), bytes, file.mode);
  }
  const restoredIdentity = readFileSync(path.join(out, BUILDER_IDENTITY_STORE_FILE));
  if (sha256(restoredIdentity) !== payload.source.storeHash) {
    fail("restore_integrity", "Restored identity-store hash changed.");
  }
  const restoredSnapshot = await readBuilderIdentityStoreSnapshot(out);
  if (restoredSnapshot.storeHash !== payload.source.storeHash) {
    fail("restore_integrity", "Restored store hash does not match the manifest.");
  }
  const restoredAccounting = computeBuilderMinimizationAccounting(restoredSnapshot.store);
  if (canonicalJson(restoredAccounting) !== canonicalJson(payload.source.accounting)) {
    fail("restore_accounting", "Restored accounting snapshot does not match the backup.");
  }
  const gate = await readBuilderRestoreReplayGate(out);
  if (!gate.present || !gate.valid || gate.value?.phase !== "closed") {
    fail("restore_gate", "Restored store is not closed by a valid restore gate.");
  }
  testAbort("files_written");

  const receipt = {
    schemaVersion: 1,
    kind: "ornigami-builder-restore-receipt",
    status: "restored-closed",
    archivePath: path.resolve(archive),
    archiveSha256: sha256(parsed.bytes),
    archiveBytes: parsed.bytes.length,
    payloadSha256: payloadHash,
    restoredAt: new Date().toISOString(),
    restoreAttemptId: attemptId,
    storeDir: path.resolve(out),
    storeHash: restoredSnapshot.storeHash,
    snapshotAsOf: payload.source.snapshotAsOf,
    files: payload.files.map((file) => ({ path: file.path, bytes: file.bytes, sha256: file.sha256, mode: file.mode })),
    verification: {
      manifest: true,
      fileHashes: true,
      storeHash: true,
      accounting: true,
      restoreGateClosed: true,
    },
    admissionClosed: true,
    replayRequired: true,
    acknowledgePointInTime: true,
    usageReconciliationRequired: true,
    postBackupUsageReconstructed: false,
    limitations: {
      pointInTimeSnapshot: true,
      postBackupUsageNotReconstructed: true,
      postBackupSettlementNotReconstructed: true,
      latestAuthoritativeJournalRequiredBeforeAdmission: true,
      rollback: "Keep the source volume and backup; this tool never deletes or overwrites the source.",
    },
    customerAdmission: "closed",
  };
  const resolvedReceipt = receiptPathOrDefault(receiptPath, out, ".restore-receipt.json");
  writeJson(resolvedReceipt, receipt);
  testAbort("receipt_written");
  return receipt;
}

export async function replayRestoredStore({
  storeDir,
  journalPath,
  receiptPath,
  acknowledgeUsageWindow = false,
  acknowledgeOpenUsage = false,
}) {
  if (!storeDir) fail("replay_store", "--store is required.");
  if (receiptPath && isInside(storeDir, receiptPath)) fail("replay_receipt_inside_store", "Replay receipt must be outside the restored store directory.");
  if (!journalPath) fail("replay_journal", "--journal is required; admission needs the latest authoritative journal.");
  if (!acknowledgeUsageWindow) {
    fail(
      "replay_acknowledgement",
      "Replay requires --acknowledge-usage-window; usage or settlement written after the snapshot cannot be reconstructed.",
    );
  }
  const gate = await readBuilderRestoreReplayGate(storeDir);
  if (!gate.present) {
    // A completed replay leaves no gate. Allow an idempotent second replay only
    // when the existing receipt history already proves the store is verified.
    await assertBuilderStoreReplayReady(storeDir);
  } else {
    if (!gate.valid || !gate.value) fail("replay_gate_invalid", "Restore gate is invalid or unreadable.");
    if (gate.value.phase !== "closed" && gate.value.phase !== "prepared") {
      fail("replay_gate_invalid", "Restore gate is not in a replayable phase.");
    }
  }
  const before = await readBuilderIdentityStoreSnapshot(storeDir);
  const accounting = computeBuilderMinimizationAccounting(before.store);
  if ((accounting.reservedRecords > 0 || accounting.unknownRecords > 0) && !acknowledgeOpenUsage) {
    fail(
      "replay_open_usage",
      "Restore has reserved or unknown usage; pass --acknowledge-open-usage after reconciling them.",
    );
  }
  const preparation = await prepareBuilderRestoreReplay({ storeDir, journalPath });
  let replayReceipt = null;
  if (!preparation.alreadyReplayed) {
    replayReceipt = await replayBuilderMinimizationJournal({ storeDir, journalPath });
  }
  await assertBuilderStoreReplayReady(storeDir);
  const after = await readBuilderIdentityStoreSnapshot(storeDir);
  const receipt = {
    schemaVersion: 1,
    kind: "ornigami-builder-replay-receipt",
    status: "complete",
    storeDir: path.resolve(storeDir),
    journalPath: path.resolve(journalPath),
    restoreAttemptId: preparation.attemptId,
    journalHash: preparation.journalHash,
    storeBeforeHash: before.storeHash,
    storeAfterHash: after.storeHash,
    replayReceiptId: replayReceipt?.receiptId ?? null,
    replayedAt: new Date().toISOString(),
    acknowledgeUsageWindow: true,
    acknowledgeOpenUsage,
    admissionClosed: false,
    admissionScope: "operator-acknowledged",
    usageReconciliationRequired: true,
    postBackupUsageReconstructed: false,
    limitations: {
      pointInTimeSnapshot: true,
      postBackupUsageNotReconstructed: true,
      postBackupSettlementNotReconstructed: true,
      reconciliationRequiredBeforeCustomerAdmission: true,
    },
    customerAdmission: "closed",
  };
  const resolvedReceipt = receiptPathOrDefault(receiptPath, storeDir, ".replay-receipt.json");
  writeJson(resolvedReceipt, receipt);
  return receipt;
}

function jsonOutput(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function parseCommandArgs(args) {
  return parseArgs({
    args,
    allowPositionals: false,
    strict: true,
    options: {
      store: { type: "string" },
      out: { type: "string" },
      archive: { type: "string" },
      "passphrase-file": { type: "string" },
      receipt: { type: "string" },
      journal: { type: "string" },
      "acknowledge-point-in-time": { type: "boolean", default: false },
      "acknowledge-usage-window": { type: "boolean", default: false },
      "acknowledge-open-usage": { type: "boolean", default: false },
      json: { type: "boolean", default: false },
    },
  }).values;
}

async function main(argv) {
  const [command, ...rest] = argv;
  const options = parseCommandArgs(rest);
  let result;
  if (command === "backup") {
    result = await createEncryptedBackup({
      storeDir: options.store,
      out: options.out,
      passphraseFile: options["passphrase-file"],
      receiptPath: options.receipt,
    });
  } else if (command === "inspect") {
    result = inspectEncryptedBackup({ archive: options.archive });
  } else if (command === "verify") {
    result = verifyEncryptedBackup({
      archive: options.archive,
      passphraseFile: options["passphrase-file"],
    });
  } else if (command === "restore") {
    result = await restoreEncryptedBackup({
      archive: options.archive,
      out: options.out,
      passphraseFile: options["passphrase-file"],
      receiptPath: options.receipt,
      acknowledgePointInTime: options["acknowledge-point-in-time"],
    });
  } else if (command === "replay") {
    result = await replayRestoredStore({
      storeDir: options.store,
      journalPath: options.journal,
      receiptPath: options.receipt,
      acknowledgeUsageWindow: options["acknowledge-usage-window"],
      acknowledgeOpenUsage: options["acknowledge-open-usage"],
    });
  } else {
    fail(
      "cli",
      "Usage: builder-backup-restore.mjs backup|inspect|verify|restore|replay ...",
    );
  }
  jsonOutput(result);
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  main(process.argv.slice(2)).catch((error) => {
    const code = error instanceof BuilderBackupError ? error.code : "error";
    process.stderr.write(`${code}: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
