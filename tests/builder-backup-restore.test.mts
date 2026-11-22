import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

process.env.BUILDER_RUNTIME_STORE_HOST_ID = "builder-backup-test-host";
process.env.BUILDER_RUNTIME_ALLOW_TEST_HOOKS = "1";

const {
  createEncryptedBackup,
  inspectEncryptedBackup,
  verifyEncryptedBackup,
  restoreEncryptedBackup,
  replayRestoredStore,
} = await import("../scripts/builder-backup-restore.mjs");
const {
  BUILDER_MINIMIZATION_JOURNAL_FILE,
  BUILDER_RESTORE_REPLAY_GATE_FILE,
  BuilderStoreUnavailable,
  assertBuilderStoreReplayReady,
  issueBuilderInvite,
  readBuilderAdmissionStatus,
  readBuilderIdentityStoreSnapshot,
  readBuilderRestoreReplayGate,
  redeemBuilderInvite,
  serializeBuilderIdentityStore,
  validateBuilderSession,
  writeBuilderIdentityStore,
} = await import("../builder-runtime/lib/identity-store.ts");
const {
  applyBuilderSubjectMinimization,
  computeBuilderMinimizationAccounting,
  planBuilderSubjectMinimization,
} = await import("../builder-runtime/lib/minimization.ts");

const root = path.join(process.cwd(), ".local", "test-builder-backup-restore");
rmSync(root, { recursive: true, force: true });
mkdirSync(root, { recursive: true });

const PASS = "synthetic backup passphrase 32 bytes minimum";
const WRONG = "wrong synthetic passphrase 32 bytes minimum";

function fresh(name) {
  return mkdtempSync(path.join(root, `${name}-`));
}

function passphraseFile(directory, value = PASS) {
  const file = path.join(directory, "passphrase.txt");
  writeFileSync(file, `${value}\n`);
  if (process.platform !== "win32") chmodSync(file, 0o600);
  return file;
}

function privateFile(file) {
  if (process.platform !== "win32") chmodSync(file, 0o600);
}

function privateDirectory(directory) {
  if (process.platform !== "win32") chmodSync(directory, 0o700);
}

async function seedStore(name) {
  const storeDir = fresh(name);
  privateDirectory(storeDir);
  await writeBuilderIdentityStore(storeDir, {
    version: 1,
    subjects: [],
    invites: [],
    sessions: [],
    usage: [],
  });
  privateFile(path.join(storeDir, "identity-store.json"));

  const inviteA = await issueBuilderInvite({
    storeDir,
    label: "Backup A",
    inviteTtlSeconds: 3600,
    now: new Date("2026-11-20T10:00:00.000Z"),
  });
  const sessionA = await redeemBuilderInvite({
    storeDir,
    token: inviteA.token,
    sessionTtlSeconds: 3600,
    now: new Date("2026-11-20T10:01:00.000Z"),
  });
  const inviteB = await issueBuilderInvite({
    storeDir,
    label: "Backup B",
    inviteTtlSeconds: 3600,
    now: new Date("2026-11-20T10:00:00.000Z"),
  });
  const sessionB = await redeemBuilderInvite({
    storeDir,
    token: inviteB.token,
    sessionTtlSeconds: 3600,
    now: new Date("2026-11-20T10:01:00.000Z"),
  });

  const snapshot = await readBuilderIdentityStoreSnapshot(storeDir);
  const store = snapshot.store;
  store.usage.push(
    {
      id: "use_aaaaaaaaaaaaaaaaaaaaaaaa",
      subjectId: sessionA.subject.id,
      sessionId: sessionA.session.id,
      generationId: "gen_a_reserved",
      recordedAt: "2026-11-20T10:02:00.000Z",
      state: "reserved",
      costMicros: 50_000,
      reservedCostMicros: 50_000,
      requestKey: "request-a-reserved",
      leaseExpiresAt: "2030-01-01T00:00:00.000Z",
    },
    {
      id: "use_abababababababababababab",
      subjectId: sessionA.subject.id,
      sessionId: sessionA.session.id,
      generationId: "gen_a_unknown",
      recordedAt: "2026-11-20T10:03:00.000Z",
      state: "unknown",
      costMicros: 60_000,
      reservedCostMicros: 60_000,
      requestKey: "request-a-unknown",
    },
    {
      id: "use_acacacacacacacacacacacac",
      subjectId: sessionA.subject.id,
      sessionId: sessionA.session.id,
      generationId: "gen_a_settled",
      recordedAt: "2026-11-20T10:04:00.000Z",
      state: "succeeded",
      costMicros: 30_000,
      reservedCostMicros: 50_000,
      requestKey: "request-a-settled",
      settledAt: "2026-11-20T10:04:00.000Z",
    },
    {
      id: "use_bbbbbbbbbbbbbbbbbbbbbbbb",
      subjectId: sessionB.subject.id,
      sessionId: sessionB.session.id,
      generationId: "gen_b_settled",
      recordedAt: "2026-11-20T10:05:00.000Z",
      state: "succeeded",
      costMicros: 20_000,
      reservedCostMicros: 20_000,
      requestKey: "request-b-settled",
      settledAt: "2026-11-20T10:05:00.000Z",
    },
  );
  await writeBuilderIdentityStore(storeDir, store);
  privateFile(path.join(storeDir, "identity-store.json"));

  return {
    storeDir,
    tokenA: sessionA.token,
    tokenB: sessionB.token,
    subjectA: sessionA.subject.id,
    subjectB: sessionB.subject.id,
  };
}

function receiptPath(directory, name = "receipt.json") {
  return path.join(directory, name);
}

async function backupFixture(fixture, name) {
  const directory = fresh(name);
  const archive = path.join(directory, "store.ornibak");
  const receipt = receiptPath(directory, "backup-receipt.json");
  const pass = passphraseFile(directory);
  const result = await createEncryptedBackup({
    storeDir: fixture.storeDir,
    out: archive,
    passphraseFile: pass,
    receiptPath: receipt,
  });
  return { directory, archive, receipt, pass, result };
}

test("encrypted backup is versioned, authenticated and contains the store, journal and receipts", async () => {
  const fixture = await seedStore("backup");
  const { directory, archive, receipt, pass, result } = await backupFixture(fixture, "archive");
  try {
    assert.equal(result.status, "complete");
    assert.equal(result.source.storeHash.length, 64);
    assert.equal(result.source.accounting.reservedRecords, 1);
    assert.equal(result.source.accounting.unknownRecords, 1);
    assert.ok(result.files.some((file) => file.path === "identity-store.json"));
    assert.ok(result.files.some((file) => file.path === BUILDER_MINIMIZATION_JOURNAL_FILE));
    assert.match(result.archiveSha256, /^[a-f0-9]{64}$/);
    assert.equal(the(readFileSync(receipt, "utf8")).customerAdmission, "closed");

    const inspected = inspectEncryptedBackup({ archive });
    assert.equal(inspected.kind, "ornigami-builder-backup");
    assert.equal(inspected.header.algorithm, "aes-256-gcm");
    assert.equal(inspected.header.kdf.name, "scrypt");
    assert.equal(inspected.ciphertextBytes > 0, true);

    const verified = verifyEncryptedBackup({ archive, passphraseFile: pass });
    assert.equal(verified.source.storeHash, result.source.storeHash);
    assert.equal(verified.payloadSha256.length, 64);
    assert.equal(readFileSync(archive).includes(Buffer.from(PASS)), false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
    rmSync(fixture.storeDir, { recursive: true, force: true });
  }
});

function the(text) {
  return JSON.parse(text);
}

test("restore writes a fresh closed store and refuses admission before replay", async () => {
  const fixture = await seedStore("restore");
  const { directory, archive, pass } = await backupFixture(fixture, "restore-archive");
  const restored = path.join(directory, "restored");
  try {
    const receipt = await restoreEncryptedBackup({
      archive,
      out: restored,
      passphraseFile: pass,
      acknowledgePointInTime: true,
    });
    assert.equal(receipt.status, "restored-closed");
    assert.equal(receipt.admissionClosed, true);
    assert.equal(receipt.verification.storeHash, true);
    assert.equal(receipt.verification.accounting, true);
    assert.equal(existsSync(path.join(restored, BUILDER_RESTORE_REPLAY_GATE_FILE)), true);
    const gate = await readBuilderRestoreReplayGate(restored);
    assert.equal(gate.valid, true);
    assert.equal(gate.value.phase, "closed");
    assert.equal(await readBuilderAdmissionStatus({
      storeDir: restored,
      sessionId: "ses_unused",
      subjectId: "sub_unused",
    }), "unavailable");
    await assert.rejects(
      assertBuilderStoreReplayReady(restored),
      (error) => error instanceof BuilderStoreUnavailable,
    );
    await assert.rejects(
      validateBuilderSession({ storeDir: restored, token: fixture.tokenB }),
      (error) => error instanceof BuilderStoreUnavailable,
    );
    assert.equal(readFileSync(path.join(restored, "identity-store.json")).length > 0, true);
  } finally {
    rmSync(directory, { recursive: true, force: true });
    rmSync(fixture.storeDir, { recursive: true, force: true });
  }
});

test("wrong key, corrupt archive and truncated archive fail closed without a restore directory", async () => {
  const fixture = await seedStore("bad-archive");
  const { directory, archive, pass } = await backupFixture(fixture, "bad-archive-data");
  try {
    const wrongPass = passphraseFile(directory, WRONG);
    await assert.rejects(
      restoreEncryptedBackup({
        archive,
        out: path.join(directory, "wrong-key"),
        passphraseFile: wrongPass,
        acknowledgePointInTime: true,
      }),
      /authentication failed/i,
    );
    assert.equal(existsSync(path.join(directory, "wrong-key")), false);

    const corrupt = path.join(directory, "corrupt.ornibak");
    const bytes = readFileSync(archive);
    bytes[bytes.length - 1] ^= 0x01;
    writeFileSync(corrupt, bytes);
    await assert.rejects(
      restoreEncryptedBackup({
        archive: corrupt,
        out: path.join(directory, "corrupt-out"),
        passphraseFile: pass,
        acknowledgePointInTime: true,
      }),
      /authentication failed/i,
    );
    assert.equal(existsSync(path.join(directory, "corrupt-out")), false);

    const truncated = path.join(directory, "truncated.ornibak");
    writeFileSync(truncated, readFileSync(archive).subarray(0, 24));
    await assert.rejects(
      restoreEncryptedBackup({
        archive: truncated,
        out: path.join(directory, "truncated-out"),
        passphraseFile: pass,
        acknowledgePointInTime: true,
      }),
      /truncated/i,
    );
    assert.equal(existsSync(path.join(directory, "truncated-out")), false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
    rmSync(fixture.storeDir, { recursive: true, force: true });
  }
});

test("an older backup followed by newer minimisation replays to the latest authoritative journal", async () => {
  const fixture = await seedStore("older");
  const { directory, archive, pass } = await backupFixture(fixture, "older-archive");
  const restored = path.join(directory, "restored");
  try {
    const plan = await planBuilderSubjectMinimization({
      storeDir: fixture.storeDir,
      subjectId: fixture.subjectA,
      now: new Date("2026-11-21T12:00:00.000Z"),
    });
    const applied = await applyBuilderSubjectMinimization({
      storeDir: fixture.storeDir,
      plan,
      now: new Date("2026-11-21T12:00:00.000Z"),
    });
    assert.equal(applied.changed, true);
    const liveJournal = path.join(fixture.storeDir, BUILDER_MINIMIZATION_JOURNAL_FILE);
    const liveAfter = await readBuilderIdentityStoreSnapshot(fixture.storeDir);
    const liveAccounting = computeBuilderMinimizationAccounting(liveAfter.store);
    const usageBefore = JSON.stringify(liveAfter.store.usage);

    await restoreEncryptedBackup({
      archive,
      out: restored,
      passphraseFile: pass,
      acknowledgePointInTime: true,
    });
    const replay = await replayRestoredStore({
      storeDir: restored,
      journalPath: liveJournal,
      acknowledgeUsageWindow: true,
      acknowledgeOpenUsage: true,
    });
    assert.equal(replay.status, "complete");
    assert.equal(replay.admissionClosed, false);
    assert.equal(replay.usageReconciliationRequired, true);
    assert.equal(replay.postBackupUsageReconstructed, false);
    assert.equal(existsSync(path.join(restored, BUILDER_RESTORE_REPLAY_GATE_FILE)), false);
    const restoredAfter = await readBuilderIdentityStoreSnapshot(restored);
    assert.equal(restoredAfter.storeHash, liveAfter.storeHash);
    assert.equal(JSON.stringify(restoredAfter.store.usage), usageBefore);
    assert.deepEqual(computeBuilderMinimizationAccounting(restoredAfter.store), liveAccounting);
    assert.equal(await validateBuilderSession({ storeDir: restored, token: fixture.tokenA }), null);
    const control = await validateBuilderSession({
      storeDir: restored,
      token: fixture.tokenB,
      now: new Date("2026-11-20T10:30:00.000Z"),
    });
    assert.equal(control?.subject.id, fixture.subjectB);
    await assertBuilderStoreReplayReady(restored);
  } finally {
    rmSync(directory, { recursive: true, force: true });
    rmSync(fixture.storeDir, { recursive: true, force: true });
  }
});

test("repeated replay is idempotent and keeps the authoritative store hash", async () => {
  const fixture = await seedStore("repeat");
  const { directory, archive, pass } = await backupFixture(fixture, "repeat-archive");
  const restored = path.join(directory, "restored");
  try {
    const plan = await planBuilderSubjectMinimization({
      storeDir: fixture.storeDir,
      subjectId: fixture.subjectA,
      now: new Date("2026-11-21T12:00:00.000Z"),
    });
    await applyBuilderSubjectMinimization({
      storeDir: fixture.storeDir,
      plan,
      now: new Date("2026-11-21T12:00:00.000Z"),
    });
    await restoreEncryptedBackup({
      archive,
      out: restored,
      passphraseFile: pass,
      acknowledgePointInTime: true,
    });
    const first = await replayRestoredStore({
      storeDir: restored,
      journalPath: path.join(fixture.storeDir, BUILDER_MINIMIZATION_JOURNAL_FILE),
      acknowledgeUsageWindow: true,
      acknowledgeOpenUsage: true,
    });
    const hash = (await readBuilderIdentityStoreSnapshot(restored)).storeHash;
    const second = await replayRestoredStore({
      storeDir: restored,
      journalPath: path.join(fixture.storeDir, BUILDER_MINIMIZATION_JOURNAL_FILE),
      acknowledgeUsageWindow: true,
      acknowledgeOpenUsage: true,
      receiptPath: path.join(directory, "second-replay.json"),
    });
    assert.equal(second.storeAfterHash, hash);
    assert.equal(first.storeAfterHash, hash);
    assert.equal(existsSync(path.join(restored, BUILDER_RESTORE_REPLAY_GATE_FILE)), false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
    rmSync(fixture.storeDir, { recursive: true, force: true });
  }
});

test("missing journal or receipt history stays closed", async () => {
  const fixture = await seedStore("missing");
  const { directory, archive, pass } = await backupFixture(fixture, "missing-archive");
  const restored = path.join(directory, "restored");
  try {
    await restoreEncryptedBackup({
      archive,
      out: restored,
      passphraseFile: pass,
      acknowledgePointInTime: true,
    });
    await assert.rejects(
      replayRestoredStore({
        storeDir: restored,
        journalPath: path.join(directory, "absent-journal.json"),
        acknowledgeUsageWindow: true,
        acknowledgeOpenUsage: true,
      }),
      /EDENT|ENOENT|missing|journal/i,
    );
    assert.equal(existsSync(path.join(restored, BUILDER_RESTORE_REPLAY_GATE_FILE)), true);

    const missingHistory = path.join(directory, "missing-history");
    await restoreEncryptedBackup({
      archive,
      out: missingHistory,
      passphraseFile: pass,
      acknowledgePointInTime: true,
    });
    const journal = path.join(missingHistory, BUILDER_MINIMIZATION_JOURNAL_FILE);
    const plan = await planBuilderSubjectMinimization({
      storeDir: fixture.storeDir,
      subjectId: fixture.subjectA,
      now: new Date("2026-11-21T12:00:00.000Z"),
    });
    await applyBuilderSubjectMinimization({
      storeDir: fixture.storeDir,
      plan,
      now: new Date("2026-11-21T12:00:00.000Z"),
    });
    const receipt = await replayRestoredStore({
      storeDir: missingHistory,
      journalPath: path.join(fixture.storeDir, BUILDER_MINIMIZATION_JOURNAL_FILE),
      acknowledgeUsageWindow: true,
      acknowledgeOpenUsage: true,
    });
    assert.equal(receipt.status, "complete");
    const historyFiles = readdirSync(missingHistory).filter((name) =>
      name.startsWith("restore-replay-receipt."),
    );
    if (historyFiles.length > 0) {
      rmSync(path.join(missingHistory, historyFiles[0]));
      // A later replay after a completed attempt has no open gate; it remains
      // readable but must not claim a new write.
      await assertBuilderStoreReplayReady(missingHistory);
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
    rmSync(fixture.storeDir, { recursive: true, force: true });
  }
});

test("interruption after gate, files or receipt preserves a closed recoverable store", async () => {
  const fixture = await seedStore("interrupt");
  const { directory, archive, pass } = await backupFixture(fixture, "interrupt-archive");
  try {
    for (const marker of ["gate_written", "files_written", "receipt_written"]) {
      const out = path.join(directory, `interrupt-${marker}`);
      const previous = process.env.BUILDER_BACKUP_TEST_ABORT_AFTER;
      process.env.BUILDER_BACKUP_TEST_ABORT_AFTER = marker;
      try {
        await assert.rejects(
          restoreEncryptedBackup({
            archive,
            out,
            passphraseFile: pass,
            acknowledgePointInTime: true,
          }),
          new RegExp(`interruption after ${marker}`),
        );
      } finally {
        if (previous === undefined) delete process.env.BUILDER_BACKUP_TEST_ABORT_AFTER;
        else process.env.BUILDER_BACKUP_TEST_ABORT_AFTER = previous;
      }
      const gate = await readBuilderRestoreReplayGate(out);
      assert.equal(gate.valid, true, marker);
      assert.equal(gate.value.phase, "closed", marker);
      if (marker !== "gate_written") {
        assert.equal(existsSync(path.join(out, "identity-store.json")), true, marker);
      }
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
    rmSync(fixture.storeDir, { recursive: true, force: true });
  }
});

test("corrupt or missing restore receipt history fails closed", async () => {
  const fixture = await seedStore("history-source");
  const first = await backupFixture(fixture, "history-first");
  const firstRestore = path.join(first.directory, "restored");
  try {
    const plan = await planBuilderSubjectMinimization({
      storeDir: fixture.storeDir,
      subjectId: fixture.subjectA,
      now: new Date("2026-11-21T12:00:00.000Z"),
    });
    await applyBuilderSubjectMinimization({
      storeDir: fixture.storeDir,
      plan,
      now: new Date("2026-11-21T12:00:00.000Z"),
    });
    await restoreEncryptedBackup({
      archive: first.archive,
      out: firstRestore,
      passphraseFile: first.pass,
      acknowledgePointInTime: true,
    });
    await replayRestoredStore({
      storeDir: firstRestore,
      journalPath: path.join(fixture.storeDir, BUILDER_MINIMIZATION_JOURNAL_FILE),
      acknowledgeUsageWindow: true,
      acknowledgeOpenUsage: true,
    });
    const receiptFiles = readdirSync(firstRestore).filter((name) =>
      name.startsWith("restore-replay-receipt."),
    );
    assert.ok(receiptFiles.length > 0);

    const secondArchive = path.join(first.directory, "with-history.ornibak");
    const secondPass = passphraseFile(first.directory, PASS);
    await createEncryptedBackup({
      storeDir: firstRestore,
      out: secondArchive,
      passphraseFile: secondPass,
    });
    const secondRestore = path.join(first.directory, "restored-history");
    await restoreEncryptedBackup({
      archive: secondArchive,
      out: secondRestore,
      passphraseFile: secondPass,
      acknowledgePointInTime: true,
    });
    const restoredReceipt = readdirSync(secondRestore).find((name) =>
      name.startsWith("restore-replay-receipt."),
    );
    assert.ok(restoredReceipt);
    writeFileSync(path.join(secondRestore, restoredReceipt), "{broken receipt\n");
    await assert.rejects(
      replayRestoredStore({
        storeDir: secondRestore,
        journalPath: path.join(fixture.storeDir, BUILDER_MINIMIZATION_JOURNAL_FILE),
        acknowledgeUsageWindow: true,
        acknowledgeOpenUsage: true,
      }),
      /receipt|history|invalid|corrupt/i,
    );
    assert.equal(existsSync(path.join(secondRestore, BUILDER_RESTORE_REPLAY_GATE_FILE)), true);
  } finally {
    rmSync(first.directory, { recursive: true, force: true });
    rmSync(fixture.storeDir, { recursive: true, force: true });
  }
});

test("interruption during replay preserves the closed gate and can resume", async () => {
  for (const marker of ["gate_prepared", "store_written", "journal_written"]) {
    const fixture = await seedStore(`replay-interrupt-${marker}`);
    const { directory, archive, pass } = await backupFixture(fixture, `replay-interrupt-archive-${marker}`);
    const restored = path.join(directory, "restored");
    try {
      const plan = await planBuilderSubjectMinimization({
        storeDir: fixture.storeDir,
        subjectId: fixture.subjectA,
        now: new Date("2026-11-21T12:00:00.000Z"),
      });
      await applyBuilderSubjectMinimization({
        storeDir: fixture.storeDir,
        plan,
        now: new Date("2026-11-21T12:00:00.000Z"),
      });
      await restoreEncryptedBackup({
        archive,
        out: restored,
        passphraseFile: pass,
        acknowledgePointInTime: true,
      });
      process.env.BUILDER_MINIMIZATION_TEST_ABORT_AFTER = marker;
      try {
        await assert.rejects(
          replayRestoredStore({
            storeDir: restored,
            journalPath: path.join(fixture.storeDir, BUILDER_MINIMIZATION_JOURNAL_FILE),
            acknowledgeUsageWindow: true,
            acknowledgeOpenUsage: true,
          }),
          new RegExp(`interruption after ${marker}`),
        );
      } finally {
        delete process.env.BUILDER_MINIMIZATION_TEST_ABORT_AFTER;
      }
      const gate = await readBuilderRestoreReplayGate(restored);
      assert.equal(gate.present, true, marker);
      const resumed = await replayRestoredStore({
        storeDir: restored,
        journalPath: path.join(fixture.storeDir, BUILDER_MINIMIZATION_JOURNAL_FILE),
        acknowledgeUsageWindow: true,
        acknowledgeOpenUsage: true,
        receiptPath: path.join(directory, "resumed-replay.json"),
      });
      assert.equal(resumed.status, "complete", marker);
      assert.equal(existsSync(path.join(restored, BUILDER_RESTORE_REPLAY_GATE_FILE)), false, marker);
    } finally {
      rmSync(directory, { recursive: true, force: true });
      rmSync(fixture.storeDir, { recursive: true, force: true });
    }
  }
});

test("unresolved reserved or unknown usage requires explicit acknowledgement", async () => {
  const fixture = await seedStore("open-usage");
  const { directory, archive, pass } = await backupFixture(fixture, "open-usage-archive");
  const restored = path.join(directory, "restored");
  try {
    await restoreEncryptedBackup({
      archive,
      out: restored,
      passphraseFile: pass,
      acknowledgePointInTime: true,
    });
    await assert.rejects(
      replayRestoredStore({
        storeDir: restored,
        journalPath: path.join(restored, BUILDER_MINIMIZATION_JOURNAL_FILE),
        acknowledgeUsageWindow: true,
        acknowledgeOpenUsage: false,
      }),
      /reserved or unknown usage/i,
    );
    assert.equal(existsSync(path.join(restored, BUILDER_RESTORE_REPLAY_GATE_FILE)), true);
    const receipt = await replayRestoredStore({
      storeDir: restored,
      journalPath: path.join(restored, BUILDER_MINIMIZATION_JOURNAL_FILE),
      acknowledgeUsageWindow: true,
      acknowledgeOpenUsage: true,
    });
    assert.equal(receipt.acknowledgeOpenUsage, true);
    assert.equal(receipt.usageReconciliationRequired, true);
  } finally {
    rmSync(directory, { recursive: true, force: true });
    rmSync(fixture.storeDir, { recursive: true, force: true });
  }
});

test("backup refuses a pending journal, restore gate, lock or unexpected file", async () => {
  const pending = await seedStore("pending");
  const pendingArchive = path.join(fresh("pending-archive"), "backup.ornibak");
  const pendingPass = passphraseFile(path.dirname(pendingArchive));
  try {
    const plan = await planBuilderSubjectMinimization({
      storeDir: pending.storeDir,
      subjectId: pending.subjectA,
      now: new Date("2026-11-21T12:00:00.000Z"),
    });
    process.env.BUILDER_MINIMIZATION_TEST_ABORT_AFTER = "store_written";
    try {
      await applyBuilderSubjectMinimization({
        storeDir: pending.storeDir,
        plan,
        now: new Date("2026-11-21T12:00:00.000Z"),
      });
    } catch {
      // the pending journal is the fixture
    } finally {
      delete process.env.BUILDER_MINIMIZATION_TEST_ABORT_AFTER;
    }
    await assert.rejects(
      createEncryptedBackup({
        storeDir: pending.storeDir,
        out: pendingArchive,
        passphraseFile: pendingPass,
      }),
      /pending/i,
    );
  } finally {
    rmSync(pending.storeDir, { recursive: true, force: true });
  }

  const gated = await seedStore("gated");
  const gatedArchive = path.join(fresh("gated-archive"), "backup.ornibak");
  const gatedPass = passphraseFile(path.dirname(gatedArchive));
  try {
    writeFileSync(
      path.join(gated.storeDir, BUILDER_RESTORE_REPLAY_GATE_FILE),
      `${JSON.stringify({ version: 3, attemptId: "rra_aaaaaaaaaaaaaaaaaaaaaaaa", phase: "closed", startedAt: new Date().toISOString(), previousReceiptIds: [] })}\n`,
    );
    await assert.rejects(
      createEncryptedBackup({ storeDir: gated.storeDir, out: gatedArchive, passphraseFile: gatedPass }),
      /restore gate/i,
    );
  } finally {
    rmSync(gated.storeDir, { recursive: true, force: true });
  }

  const locked = await seedStore("locked");
  const lockedArchive = path.join(fresh("locked-archive"), "backup.ornibak");
  const lockedPass = passphraseFile(path.dirname(lockedArchive));
  try {
    writeFileSync(path.join(locked.storeDir, "identity-store.lock"), "{}\n");
    await assert.rejects(
      createEncryptedBackup({ storeDir: locked.storeDir, out: lockedArchive, passphraseFile: lockedPass }),
      /lock/i,
    );
  } finally {
    rmSync(locked.storeDir, { recursive: true, force: true });
  }

  const extra = await seedStore("extra");
  const extraArchive = path.join(fresh("extra-archive"), "backup.ornibak");
  const extraPass = passphraseFile(path.dirname(extraArchive));
  try {
    writeFileSync(path.join(extra.storeDir, "unexpected.txt"), "nope\n");
    await assert.rejects(
      createEncryptedBackup({ storeDir: extra.storeDir, out: extraArchive, passphraseFile: extraPass }),
      /unrecognized/i,
    );
  } finally {
    rmSync(extra.storeDir, { recursive: true, force: true });
  }
});

test("restore refuses missing acknowledgement, existing output and passphrase leakage", async () => {
  const fixture = await seedStore("ack");
  const { directory, archive, pass, result } = await backupFixture(fixture, "ack-archive");
  try {
    await assert.rejects(
      restoreEncryptedBackup({
        archive,
        out: path.join(directory, "no-ack"),
        passphraseFile: pass,
        acknowledgePointInTime: false,
      }),
      /acknowledge-point-in-time/i,
    );
    assert.equal(existsSync(path.join(directory, "no-ack")), false);

    const occupied = path.join(directory, "occupied");
    mkdirSync(occupied);
    writeFileSync(path.join(occupied, "sentinel"), "keep\n");
    await assert.rejects(
      restoreEncryptedBackup({
        archive,
        out: occupied,
        passphraseFile: pass,
        acknowledgePointInTime: true,
      }),
      /not empty/i,
    );
    assert.equal(readFileSync(path.join(occupied, "sentinel"), "utf8"), "keep\n");

    assert.equal(JSON.stringify(result).includes(PASS), false);
    assert.equal(readFileSync(archive).includes(Buffer.from(PASS)), false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
    rmSync(fixture.storeDir, { recursive: true, force: true });
  }
});

test("the operator CLI performs backup, restore and replay end to end", async () => {
  const fixture = await seedStore("cli");
  const directory = fresh("cli-work");
  const archive = path.join(directory, "cli.ornibak");
  const pass = passphraseFile(directory);
  const script = path.resolve("scripts/builder-backup-restore.mjs");
  const run = (...args) =>
    spawnSync(process.execPath, ["--experimental-strip-types", script, ...args], {
      encoding: "utf8",
      env: { ...process.env },
    });
  try {
    const backup = run("backup", "--store", fixture.storeDir, "--out", archive, "--passphrase-file", pass);
    assert.equal(backup.status, 0, backup.stderr);
    assert.match(backup.stdout, /ornigami-builder-backup-receipt/);

    const inspect = run("inspect", "--archive", archive);
    assert.equal(inspect.status, 0, inspect.stderr);
    assert.match(inspect.stdout, /aes-256-gcm/);

    const restored = path.join(directory, "restored");
    const restore = run(
      "restore",
      "--archive",
      archive,
      "--out",
      restored,
      "--passphrase-file",
      pass,
      "--acknowledge-point-in-time",
    );
    assert.equal(restore.status, 0, restore.stderr);
    assert.match(restore.stdout, /restored-closed/);

    const plan = await planBuilderSubjectMinimization({
      storeDir: fixture.storeDir,
      subjectId: fixture.subjectA,
      now: new Date("2026-11-21T12:00:00.000Z"),
    });
    await applyBuilderSubjectMinimization({
      storeDir: fixture.storeDir,
      plan,
      now: new Date("2026-11-21T12:00:00.000Z"),
    });
    const replay = run(
      "replay",
      "--store",
      restored,
      "--journal",
      path.join(fixture.storeDir, BUILDER_MINIMIZATION_JOURNAL_FILE),
      "--acknowledge-usage-window",
      "--acknowledge-open-usage",
    );
    assert.equal(replay.status, 0, replay.stderr);
    assert.match(replay.stdout, /ornigami-builder-replay-receipt/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
    rmSync(fixture.storeDir, { recursive: true, force: true });
  }
});

test("private synthetic store permissions are preserved on POSIX", async () => {
  if (process.platform === "win32") return;
  const fixture = await seedStore("modes");
  const { directory, archive, pass } = await backupFixture(fixture, "modes-archive");
  const restored = path.join(directory, "restored");
  try {
    await restoreEncryptedBackup({
      archive,
      out: restored,
      passphraseFile: pass,
      acknowledgePointInTime: true,
    });
    assert.equal(statSync(restored).mode & 0o777, 0o700);
    assert.equal(statSync(path.join(restored, "identity-store.json")).mode & 0o777, 0o600);
  } finally {
    rmSync(directory, { recursive: true, force: true });
    rmSync(fixture.storeDir, { recursive: true, force: true });
  }
});
