import { createHash, randomBytes } from "node:crypto";
import {
  link,
  mkdir,
  open,
  readdir,
  readFile,
  rename,
  rm,
  stat,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";

/**
 * Builder-only identity store. This is intentionally a local durable file
 * store: no reputation users, plans, database tables or provider accounts are
 * read. The stable subject ID is the contract future generation quotas and
 * usage reservations must use.
 */
export const BUILDER_IDENTITY_STORE_VERSION = 1 as const;
export const BUILDER_IDENTITY_STORE_FILE = "identity-store.json";
export const BUILDER_IDENTITY_LOCK_FILE = "identity-store.lock";
const REAP_LOCK_FILE = "identity-store.reap.lock";
const LOCK_WAIT_MS = 10_000;
const LOCK_RETRY_MS = 25;
const LOCK_METADATA_VERSION = 1;
const MAX_LOCK_METADATA_BYTES = 4_096;
const TOKEN_BYTES = 32;
/**
 * Stable identity for the local store host. Set
 * BUILDER_RUNTIME_STORE_HOST_ID to a constant in containers so a stale lock
 * from a replaced container can be proven dead. An empty or changed value
 * fails closed instead of stealing a live lock.
 */
const STORE_HOST_ID =
  process.env.BUILDER_RUNTIME_STORE_HOST_ID?.trim().slice(0, 255) ||
  os.hostname();

export type BuilderStoreLockOptions = Readonly<{
  /** Bounded wait, primarily for focused tests and operator diagnostics. */
  lockWaitMs?: number;
}>;

type BuilderLockMetadata = {
  version: typeof LOCK_METADATA_VERSION;
  token: string;
  pid: number;
  hostname: string;
  acquiredAt: string;
};

type LockMetadataRead =
  | { kind: "missing" }
  | { kind: "invalid" }
  | { kind: "valid"; metadata: BuilderLockMetadata };

export type BuilderSubjectRecord = {
  id: string;
  label: string;
  createdAt: string;
  /** A revoked subject cannot redeem or use any session. */
  revokedAt?: string;
};

export type BuilderInviteRecord = {
  id: string;
  subjectId: string;
  label: string;
  tokenHash: string;
  createdAt: string;
  expiresAt: string;
  usedAt?: string;
  revokedAt?: string;
  redeemedSessionId?: string;
};

export type BuilderSessionRecord = {
  id: string;
  subjectId: string;
  tokenHash: string;
  createdAt: string;
  expiresAt: string;
  revokedAt?: string;
};

/**
 * Builder-only generation ledger. `costMicros` is the effective spend for a
 * final record; `reservedCostMicros` preserves the original reservation for
 * audit. Older records without the optional fields remain readable.
 */
export type BuilderUsageRecord = {
  id: string;
  subjectId: string;
  sessionId: string;
  generationId: string;
  recordedAt: string;
  state: "reserved" | "succeeded" | "failed" | "unknown";
  costMicros: number | null;
  /** Client-supplied idempotency key, scoped to subject/session. */
  requestKey?: string;
  reservedCostMicros?: number;
  leaseExpiresAt?: string;
  settledAt?: string;
  settlementReason?: string;
  reconciledAt?: string;
};

export type BuilderIdentityStore = {
  version: typeof BUILDER_IDENTITY_STORE_VERSION;
  subjects: BuilderSubjectRecord[];
  invites: BuilderInviteRecord[];
  sessions: BuilderSessionRecord[];
  usage: BuilderUsageRecord[];
};

export class BuilderStoreUnavailable extends Error {
  constructor(message = "Builder identity storage is unavailable.") {
    super(message);
    this.name = "BuilderStoreUnavailable";
  }
}

export type BuilderInviteRedemptionCode =
  | "invalid"
  | "used"
  | "expired"
  | "revoked"
  | "subject_revoked";

export class BuilderInviteRedemptionError extends Error {
  readonly code: BuilderInviteRedemptionCode;

  constructor(code: BuilderInviteRedemptionCode) {
    super("This invitation cannot be used.");
    this.name = "BuilderInviteRedemptionError";
    this.code = code;
  }
}

export type IssuedBuilderInvite = {
  invite: BuilderInviteRecord;
  subject: BuilderSubjectRecord;
  /** Returned once to the operator. Only its SHA-256 hash is stored. */
  token: string;
};

export type RedeemedBuilderSession = {
  session: BuilderSessionRecord;
  subject: BuilderSubjectRecord;
  /** Returned once for the HTTP-only cookie. Only its hash is stored. */
  token: string;
};

export type ActiveBuilderSession = {
  session: BuilderSessionRecord;
  subject: BuilderSubjectRecord;
};

function nowIso(now: Date): string {
  return now.toISOString();
}

function tokenHash(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function newToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

function newId(prefix: "sub" | "inv" | "ses" | "use"): string {
  return `${prefix}_${randomBytes(12).toString("hex")}`;
}

function emptyStore(): BuilderIdentityStore {
  return {
    version: BUILDER_IDENTITY_STORE_VERSION,
    subjects: [],
    invites: [],
    sessions: [],
    usage: [],
  };
}

function storePath(storeDir: string): string {
  return path.join(path.resolve(storeDir), BUILDER_IDENTITY_STORE_FILE);
}

function validStore(value: unknown): value is BuilderIdentityStore {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    record.version === BUILDER_IDENTITY_STORE_VERSION &&
    Array.isArray(record.subjects) &&
    Array.isArray(record.invites) &&
    Array.isArray(record.sessions) &&
    Array.isArray(record.usage)
  );
}

async function readStoreUnlocked(storeDir: string): Promise<BuilderIdentityStore> {
  const file = storePath(storeDir);
  let raw: string;
  try {
    raw = await readFile(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyStore();
    throw new BuilderStoreUnavailable();
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!validStore(parsed)) throw new Error("unsupported store shape");
    return parsed;
  } catch {
    throw new BuilderStoreUnavailable(
      "Builder identity storage is corrupt or has an unsupported version.",
    );
  }
}

async function syncDirectory(directory: string): Promise<void> {
  try {
    const handle = await open(directory, "r");
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }
  } catch {
    // Windows and some filesystems do not support directory fsync.
  }
}

async function writeStoreUnlocked(
  storeDir: string,
  store: BuilderIdentityStore,
): Promise<void> {
  const directory = path.resolve(storeDir);
  await mkdir(directory, { recursive: true });
  const temporary = path.join(
    directory,
    `.${BUILDER_IDENTITY_STORE_FILE}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`,
  );
  const payload = `${JSON.stringify(store, null, 2)}\n`;
  try {
    const handle = await open(temporary, "wx", 0o600);
    try {
      await handle.writeFile(payload, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temporary, storePath(directory));
    await syncDirectory(directory);
  } catch {
    try {
      await rm(temporary, { force: true });
    } catch {
      // The original write failure remains the actionable error.
    }
    throw new BuilderStoreUnavailable();
  }
}

function errnoCode(error: unknown): string | null {
  return (error as NodeJS.ErrnoException | null)?.code ?? null;
}

function newLockMetadata(token: string, now: Date): BuilderLockMetadata {
  return {
    version: LOCK_METADATA_VERSION,
    token,
    pid: process.pid,
    hostname: STORE_HOST_ID,
    acquiredAt: now.toISOString(),
  };
}

/**
 * Creates a complete lock file with an atomic hard-link claim. The temporary
 * file is synced before linking, so a reader never observes a partial lock
 * owner record.
 */
async function writeExclusiveFile(
  filePath: string,
  metadata: BuilderLockMetadata,
): Promise<boolean> {
  const temporary = `${filePath}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`;
  try {
    const handle = await open(temporary, "wx", 0o600);
    try {
      await handle.writeFile(`${JSON.stringify(metadata)}\n`, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    try {
      await link(temporary, filePath);
      return true;
    } catch (error) {
      if (errnoCode(error) === "EEXIST") return false;
      throw new BuilderStoreUnavailable();
    }
  } catch (error) {
    if (error instanceof BuilderStoreUnavailable) throw error;
    throw new BuilderStoreUnavailable();
  } finally {
    try {
      await rm(temporary, { force: true });
    } catch {
      // The claim outcome is already established; a leftover temp is inert.
    }
  }
}

async function readLockMetadata(filePath: string): Promise<LockMetadataRead> {
  let size: number;
  try {
    const details = await stat(filePath);
    if (!details.isFile() || details.size > MAX_LOCK_METADATA_BYTES) {
      return { kind: "invalid" };
    }
    size = details.size;
  } catch (error) {
    return errnoCode(error) === "ENOENT"
      ? { kind: "missing" }
      : { kind: "invalid" };
  }
  if (size === 0) return { kind: "invalid" };

  let raw: string;
  try {
    raw = await readFile(filePath, "utf8");
  } catch (error) {
    return errnoCode(error) === "ENOENT"
      ? { kind: "missing" }
      : { kind: "invalid" };
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { kind: "invalid" };
    }
    const record = parsed as Record<string, unknown>;
    if (
      record.version !== LOCK_METADATA_VERSION ||
      typeof record.token !== "string" ||
      record.token.length === 0 ||
      record.token.length > 128 ||
      typeof record.pid !== "number" ||
      !Number.isInteger(record.pid) ||
      record.pid <= 0 ||
      typeof record.hostname !== "string" ||
      record.hostname.length === 0 ||
      record.hostname.length > 255 ||
      typeof record.acquiredAt !== "string" ||
      !Number.isFinite(Date.parse(record.acquiredAt))
    ) {
      return { kind: "invalid" };
    }
    return {
      kind: "valid",
      metadata: {
        version: LOCK_METADATA_VERSION,
        token: record.token,
        pid: record.pid,
        hostname: record.hostname,
        acquiredAt: record.acquiredAt,
      },
    };
  } catch {
    return { kind: "invalid" };
  }
}

function processOwnerState(pid: number): "alive" | "dead" | "unknown" {
  try {
    process.kill(pid, 0);
    return "alive";
  } catch (error) {
    return errnoCode(error) === "ESRCH" ? "dead" : "unknown";
  }
}

function ownerIsProvablyInactive(metadata: BuilderLockMetadata): boolean {
  return (
    metadata.hostname === STORE_HOST_ID &&
    processOwnerState(metadata.pid) === "dead"
  );
}

/**
 * Removes a file only when its recorded owner is provably dead on this host.
 * Age is never used: a live but paused owner keeps the lock, and a
 * different-host or corrupt owner is not auto-recovered.
 *
 * The file is first renamed to a unique quarantine path. If the moved bytes no
 * longer carry the observed token, a successor replaced the file between the
 * read and rename; the successor is restored rather than deleted.
 */
async function removeFileWithInactiveOwner(filePath: string): Promise<boolean> {
  const observed = await readLockMetadata(filePath);
  if (observed.kind !== "valid" || !ownerIsProvablyInactive(observed.metadata)) {
    return false;
  }

  const quarantine = `${filePath}.stale.${process.pid}.${randomBytes(6).toString("hex")}`;
  try {
    await rename(filePath, quarantine);
  } catch (error) {
    if (errnoCode(error) === "ENOENT") return false;
    throw new BuilderStoreUnavailable();
  }

  const moved = await readLockMetadata(quarantine);
  if (moved.kind !== "valid" || moved.metadata.token !== observed.metadata.token) {
    try {
      await link(quarantine, filePath);
    } catch {
      throw new BuilderStoreUnavailable(
        "Builder store lock recovery collided with a successor. Stop all writers and review the lock files.",
      );
    }
    await rm(quarantine, { force: true });
    return false;
  }

  await rm(quarantine, { force: true });
  return true;
}

/**
 * Releases only the file carrying this owner's token. A stale owner that
 * resumes after a successor acquired the lock cannot remove the successor.
 */
async function releaseOwnedFile(
  filePath: string,
  token: string,
): Promise<boolean> {
  const observed = await readLockMetadata(filePath);
  if (observed.kind !== "valid" || observed.metadata.token !== token) {
    return false;
  }

  const quarantine = `${filePath}.release.${process.pid}.${randomBytes(6).toString("hex")}`;
  try {
    await rename(filePath, quarantine);
  } catch (error) {
    if (errnoCode(error) === "ENOENT") return false;
    throw new BuilderStoreUnavailable();
  }

  const moved = await readLockMetadata(quarantine);
  if (moved.kind !== "valid" || moved.metadata.token !== token) {
    try {
      await link(quarantine, filePath);
    } catch {
      throw new BuilderStoreUnavailable(
        "Builder store lock release collided with a successor. Stop all writers and review the lock files.",
      );
    }
    await rm(quarantine, { force: true });
    return false;
  }

  await rm(quarantine, { force: true });
  return true;
}

async function reapInactiveLock(lockPath: string): Promise<boolean> {
  const reapPath = path.join(path.dirname(lockPath), REAP_LOCK_FILE);
  const token = newToken();
  if (!(await writeExclusiveFile(reapPath, newLockMetadata(token, new Date())))) {
    await removeFileWithInactiveOwner(reapPath);
    return false;
  }
  try {
    return await removeFileWithInactiveOwner(lockPath);
  } finally {
    await releaseOwnedFile(reapPath, token);
  }
}

async function cleanupOrphanTemporaryFiles(directory: string): Promise<void> {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".tmp")) continue;
    if (
      !entry.name.includes(BUILDER_IDENTITY_STORE_FILE) &&
      !entry.name.includes(BUILDER_IDENTITY_LOCK_FILE) &&
      !entry.name.includes(REAP_LOCK_FILE)
    ) {
      continue;
    }
    const match = /\.(\d+)\.[a-f0-9]+\.tmp$/.exec(entry.name);
    if (!match) continue;
    const pid = Number.parseInt(match[1], 10);
    if (!Number.isFinite(pid) || pid <= 0 || pid === process.pid) continue;
    if (processOwnerState(pid) !== "dead") continue;
    try {
      await rm(path.join(directory, entry.name), { force: true });
    } catch {
      // An orphan cleanup failure does not invalidate the current write.
    }
  }
}

async function withStoreLock<T>(
  storeDir: string,
  operation: (store: BuilderIdentityStore) => Promise<T> | T,
  options: BuilderStoreLockOptions = {},
): Promise<T> {
  const directory = path.resolve(storeDir);
  try {
    await mkdir(directory, { recursive: true });
  } catch {
    throw new BuilderStoreUnavailable();
  }

  const lockPath = path.join(directory, BUILDER_IDENTITY_LOCK_FILE);
  const waitMs =
    options.lockWaitMs === undefined || !Number.isFinite(options.lockWaitMs)
      ? LOCK_WAIT_MS
      : Math.max(1, Math.min(60_000, Math.floor(options.lockWaitMs)));
  const deadline = Date.now() + waitMs;
  const token = newToken();
  const metadata = newLockMetadata(token, new Date());

  let acquired = false;
  while (!acquired) {
    if (await writeExclusiveFile(lockPath, metadata)) {
      acquired = true;
      break;
    }
    await reapInactiveLock(lockPath);
    if (Date.now() >= deadline) {
      throw new BuilderStoreUnavailable(
        "Builder identity storage is locked by another writer.",
      );
    }
    await new Promise((resolve) => setTimeout(resolve, LOCK_RETRY_MS));
  }

  try {
    await cleanupOrphanTemporaryFiles(directory);
    const store = await readStoreUnlocked(directory);
    const result = await operation(store);
    await writeStoreUnlocked(directory, store);
    return result;
  } finally {
    await releaseOwnedFile(lockPath, token);
  }
}

export async function readBuilderIdentityStore(
  storeDir: string,
): Promise<BuilderIdentityStore> {
  return readStoreUnlocked(storeDir);
}

/**
 * Serialized read/write transaction over the builder-only store. Identity and
 * usage records share one lock so quota checks and reservations are atomic.
 */
export async function withBuilderIdentityStore<T>(
  storeDir: string,
  operation: (store: BuilderIdentityStore) => Promise<T> | T,
  options: BuilderStoreLockOptions = {},
): Promise<T> {
  return withStoreLock(storeDir, operation, options);
}

export type BuilderAdmissionStatus = "active" | "inactive" | "unavailable";

/**
 * Checks the server-side session and subject records without trusting a
 * client claim. Used both by reservation (inside the write transaction) and by
 * the final pre-dispatch recheck.
 */
export function builderAdmissionIsActiveInStore(
  store: BuilderIdentityStore,
  input: { sessionId: string; subjectId: string; now?: Date },
): boolean {
  const now = input.now ?? new Date();
  const session = store.sessions.find((item) => item.id === input.sessionId);
  if (
    !session ||
    session.subjectId !== input.subjectId ||
    session.revokedAt ||
    !Number.isFinite(Date.parse(session.expiresAt)) ||
    Date.parse(session.expiresAt) <= now.getTime()
  ) {
    return false;
  }
  const subject = store.subjects.find((item) => item.id === input.subjectId);
  return Boolean(subject && !subject.revokedAt);
}

export async function readBuilderAdmissionStatus(input: {
  storeDir: string;
  sessionId: string;
  subjectId: string;
  now?: Date;
}): Promise<BuilderAdmissionStatus> {
  try {
    const store = await readStoreUnlocked(input.storeDir);
    return builderAdmissionIsActiveInStore(store, input)
      ? "active"
      : "inactive";
  } catch {
    return "unavailable";
  }
}

export async function issueBuilderInvite(input: {
  storeDir: string;
  label: string;
  inviteTtlSeconds: number;
  subjectId?: string;
  subjectLabel?: string;
  now?: Date;
}): Promise<IssuedBuilderInvite> {
  const label = input.label.trim().slice(0, 120);
  if (!label) throw new Error("Invitation label is required.");
  if (!Number.isFinite(input.inviteTtlSeconds) || input.inviteTtlSeconds <= 0) {
    throw new Error("Invitation expiry must be a positive number of seconds.");
  }
  const now = input.now ?? new Date();

  return withStoreLock(input.storeDir, (store) => {
    let subject: BuilderSubjectRecord | undefined;
    if (input.subjectId) {
      subject = store.subjects.find((item) => item.id === input.subjectId);
      if (!subject) throw new Error("Subject does not exist.");
      if (subject.revokedAt) throw new Error("Subject is revoked.");
    } else {
      subject = {
        id: newId("sub"),
        label: (input.subjectLabel?.trim() || label).slice(0, 120),
        createdAt: nowIso(now),
      };
      store.subjects.push(subject);
    }

    const token = newToken();
    const invite: BuilderInviteRecord = {
      id: newId("inv"),
      subjectId: subject.id,
      label,
      tokenHash: tokenHash(token),
      createdAt: nowIso(now),
      expiresAt: new Date(
        now.getTime() + input.inviteTtlSeconds * 1000,
      ).toISOString(),
    };
    store.invites.push(invite);
    return { invite, subject, token };
  });
}

export async function redeemBuilderInvite(input: {
  storeDir: string;
  token: string;
  sessionTtlSeconds: number;
  now?: Date;
}): Promise<RedeemedBuilderSession> {
  const token = input.token.trim();
  if (!token || token.length > 512) {
    throw new BuilderInviteRedemptionError("invalid");
  }
  if (!Number.isFinite(input.sessionTtlSeconds) || input.sessionTtlSeconds <= 0) {
    throw new BuilderStoreUnavailable("Builder session expiry is invalid.");
  }
  const now = input.now ?? new Date();
  const digest = tokenHash(token);

  return withStoreLock(input.storeDir, (store) => {
    const invite = store.invites.find((item) => item.tokenHash === digest);
    if (!invite) throw new BuilderInviteRedemptionError("invalid");
    if (invite.revokedAt) throw new BuilderInviteRedemptionError("revoked");
    if (invite.usedAt) throw new BuilderInviteRedemptionError("used");
    if (Date.parse(invite.expiresAt) <= now.getTime()) {
      throw new BuilderInviteRedemptionError("expired");
    }

    const subject = store.subjects.find(
      (item) => item.id === invite.subjectId,
    );
    if (!subject || subject.revokedAt) {
      throw new BuilderInviteRedemptionError("subject_revoked");
    }

    const sessionToken = newToken();
    const session: BuilderSessionRecord = {
      id: newId("ses"),
      subjectId: subject.id,
      tokenHash: tokenHash(sessionToken),
      createdAt: nowIso(now),
      expiresAt: new Date(
        now.getTime() + input.sessionTtlSeconds * 1000,
      ).toISOString(),
    };
    invite.usedAt = nowIso(now);
    invite.redeemedSessionId = session.id;
    store.sessions.push(session);
    return { session, subject, token: sessionToken };
  });
}

export async function validateBuilderSession(input: {
  storeDir: string;
  token: string;
  now?: Date;
}): Promise<ActiveBuilderSession | null> {
  const token = input.token.trim();
  if (!token || token.length > 512) return null;
  const now = input.now ?? new Date();
  const digest = tokenHash(token);
  const store = await readStoreUnlocked(input.storeDir);
  const session = store.sessions.find((item) => item.tokenHash === digest);
  if (!session || session.revokedAt) return null;
  if (Date.parse(session.expiresAt) <= now.getTime()) return null;
  const subject = store.subjects.find((item) => item.id === session.subjectId);
  if (!subject || subject.revokedAt) return null;
  return { session, subject };
}

export async function revokeBuilderSession(input: {
  storeDir: string;
  sessionId?: string;
  token?: string;
  now?: Date;
}): Promise<boolean> {
  const now = input.now ?? new Date();
  const token = input.token?.trim();
  if (!input.sessionId && (!token || token.length > 512)) return false;
  const digest = token ? tokenHash(token) : null;
  return withStoreLock(input.storeDir, (store) => {
    const session = store.sessions.find(
      (item) =>
        (input.sessionId && item.id === input.sessionId) ||
        (digest && item.tokenHash === digest),
    );
    if (!session || session.revokedAt) return false;
    session.revokedAt = nowIso(now);
    return true;
  });
}

export async function revokeBuilderInvite(input: {
  storeDir: string;
  inviteId?: string;
  token?: string;
  now?: Date;
}): Promise<boolean> {
  const now = input.now ?? new Date();
  const digest = input.token ? tokenHash(input.token.trim()) : null;
  return withStoreLock(input.storeDir, (store) => {
    const invite = store.invites.find(
      (item) =>
        (input.inviteId && item.id === input.inviteId) ||
        (digest && item.tokenHash === digest),
    );
    if (!invite || invite.revokedAt) return false;
    invite.revokedAt = nowIso(now);
    return true;
  });
}

export async function revokeBuilderSubject(input: {
  storeDir: string;
  subjectId: string;
  now?: Date;
}): Promise<boolean> {
  const now = input.now ?? new Date();
  return withStoreLock(input.storeDir, (store) => {
    const subject = store.subjects.find((item) => item.id === input.subjectId);
    if (!subject) return false;
    if (!subject.revokedAt) subject.revokedAt = nowIso(now);
    for (const invite of store.invites) {
      if (invite.subjectId === subject.id && !invite.revokedAt) {
        invite.revokedAt = nowIso(now);
      }
    }
    for (const session of store.sessions) {
      if (session.subjectId === subject.id && !session.revokedAt) {
        session.revokedAt = nowIso(now);
      }
    }
    return true;
  });
}

export async function builderStoreIsWritable(storeDir: string): Promise<boolean> {
  try {
    await withStoreLock(storeDir, () => undefined);
    return true;
  } catch {
    return false;
  }
}
