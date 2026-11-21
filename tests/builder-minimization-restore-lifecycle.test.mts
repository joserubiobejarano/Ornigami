import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  BUILDER_MINIMIZED_LABEL,
  BUILDER_MINIMIZED_TOKEN_HASH,
  BUILDER_MINIMIZATION_JOURNAL_FILE,
  BUILDER_RESTORE_REPLAY_GATE_FILE,
  BUILDER_RESTORE_REPLAY_RECEIPT_FILE,
  BuilderStoreUnavailable,
  issueBuilderInvite,
  readBuilderAdmissionStatus,
  serializeBuilderIdentityStore,
  validateBuilderSession,
  type BuilderIdentityStore,
} from "../builder-runtime/lib/identity-store.ts";
import {
  BuilderMinimizationRejected,
  applyBuilderSubjectMinimization,
  computeBuilderMinimizationAccounting,
  planBuilderSubjectMinimization,
  prepareBuilderRestoreReplay,
  replayBuilderMinimizationJournal,
} from "../builder-runtime/lib/minimization.ts";
import { assertBuilderRuntimeStartupConfiguration } from "../builder-runtime/lib/runtime-config.ts";

const root = process.cwd();
const tempRoot = path.join(root, ".local", "test-builder-minimization-lifecycle");
const hostId = "builder-minimization-lifecycle-host";
rmSync(tempRoot, { recursive: true, force: true });
mkdirSync(tempRoot, { recursive: true });

const SUBJECT_A = "sub_aaaaaaaaaaaaaaaaaaaaaaaa";
const SUBJECT_B = "sub_bbbbbbbbbbbbbbbbbbbbbbbb";
const SUBJECT_C = "sub_cccccccccccccccccccccccc";
const SESSION_A = "ses_aaaaaaaaaaaaaaaaaaaaaaaa";
const SESSION_A2 = "ses_abababababababababababab";
const SESSION_B = "ses_bbbbbbbbbbbbbbbbbbbbbbbb";
const SESSION_C = "ses_cccccccccccccccccccccccc";
const INVITE_A = "inv_aaaaaaaaaaaaaaaaaaaaaaaa";
const INVITE_B = "inv_bbbbbbbbbbbbbbbbbbbbbbbb";
const INVITE_C = "inv_cccccccccccccccccccccccc";
const USAGE_A_RESERVED = "use_aaaaaaaaaaaaaaaaaaaaaaaa";
const USAGE_A_UNKNOWN = "use_abababababababababababab";
const USAGE_A_SETTLED = "use_acacacacacacacacacacacac";
const USAGE_B_SETTLED = "use_bbbbbbbbbbbbbbbbbbbbbbbb";
const USAGE_C_SETTLED = "use_cccccccccccccccccccccccc";
const CREATED_AT = "2026-11-20T10:00:00.000Z";
const EXPIRES_AT = "2030-01-01T00:00:00.000Z";
const EFFECT_AT = "2026-11-21T12:00:00.000Z";

type AbortMarker =
  | "gate_closed"
  | "gate_prepared"
  | "store_written"
  | "journal_written"
  | "receipt_written"
  | "gate_removed";

function storeDir(name: string): string {
  return mkdtempSync(path.join(tempRoot, `${name}-`));
}

function fixtureStore(): BuilderIdentityStore {
  return {
    version: 1,
    subjects: [
      { id: SUBJECT_A, label: "Target A", createdAt: CREATED_AT },
      { id: SUBJECT_B, label: "Target B", createdAt: CREATED_AT },
      { id: SUBJECT_C, label: "Control C", createdAt: CREATED_AT },
    ],
    invites: [
      {
        id: INVITE_A,
        subjectId: SUBJECT_A,
        label: "Invite A",
        tokenHash: "hash-a",
        createdAt: CREATED_AT,
        expiresAt: EXPIRES_AT,
      },
      {
        id: INVITE_B,
        subjectId: SUBJECT_B,
        label: "Invite B",
        tokenHash: "hash-b",
        createdAt: CREATED_AT,
        expiresAt: EXPIRES_AT,
      },
      {
        id: INVITE_C,
        subjectId: SUBJECT_C,
        label: "Invite C",
        tokenHash: "hash-c",
        createdAt: CREATED_AT,
        expiresAt: EXPIRES_AT,
      },
    ],
    sessions: [
      {
        id: SESSION_A,
        subjectId: SUBJECT_A,
        tokenHash: "session-a",
        createdAt: CREATED_AT,
        expiresAt: EXPIRES_AT,
      },
      {
        id: SESSION_A2,
        subjectId: SUBJECT_A,
        tokenHash: "session-a2",
        createdAt: CREATED_AT,
        expiresAt: EXPIRES_AT,
      },
      {
        id: SESSION_B,
        subjectId: SUBJECT_B,
        tokenHash: "session-b",
        createdAt: CREATED_AT,
        expiresAt: EXPIRES_AT,
      },
      {
        id: SESSION_C,
        subjectId: SUBJECT_C,
        tokenHash: "session-c",
        createdAt: CREATED_AT,
        expiresAt: EXPIRES_AT,
      },
    ],
    usage: [
      {
        id: USAGE_A_RESERVED,
        subjectId: SUBJECT_A,
        sessionId: SESSION_A,
        generationId: "gen_a_reserved",
        recordedAt: CREATED_AT,
        state: "reserved",
        costMicros: 50_000,
        reservedCostMicros: 50_000,
        requestKey: "request-a-reserved",
        leaseExpiresAt: EXPIRES_AT,
      },
      {
        id: USAGE_A_UNKNOWN,
        subjectId: SUBJECT_A,
        sessionId: SESSION_A2,
        generationId: "gen_a_unknown",
        recordedAt: CREATED_AT,
        state: "unknown",
        costMicros: 60_000,
        reservedCostMicros: 60_000,
        requestKey: "request-a-unknown",
      },
      {
        id: USAGE_A_SETTLED,
        subjectId: SUBJECT_A,
        sessionId: SESSION_A,
        generationId: "gen_a_settled",
        recordedAt: CREATED_AT,
        state: "succeeded",
        costMicros: 30_000,
        reservedCostMicros: 50_000,
        requestKey: "request-a-settled",
        settledAt: CREATED_AT,
      },
      {
        id: USAGE_B_SETTLED,
        subjectId: SUBJECT_B,
        sessionId: SESSION_B,
        generationId: "gen_b_settled",
        recordedAt: CREATED_AT,
        state: "succeeded",
        costMicros: 20_000,
        reservedCostMicros: 20_000,
        requestKey: "request-b-settled",
        settledAt: CREATED_AT,
      },
      {
        id: USAGE_C_SETTLED,
        subjectId: SUBJECT_C,
        sessionId: SESSION_C,
        generationId: "gen_c_settled",
        recordedAt: CREATED_AT,
        state: "succeeded",
        costMicros: 20_000,
        reservedCostMicros: 20_000,
        requestKey: "request-c-settled",
        settledAt: CREATED_AT,
      },
    ],
  };
}

function writeStore(directory: string, store: BuilderIdentityStore): void {
  mkdirSync(directory, { recursive: true });
  writeFileSync(
    path.join(directory, "identity-store.json"),
    serializeBuilderIdentityStore(store),
  );
}

function readStore(directory: string): BuilderIdentityStore {
  return JSON.parse(
    readFileSync(path.join(directory, "identity-store.json"), "utf8"),
  ) as BuilderIdentityStore;
}

function hashStore(directory: string): string {
  return createHash("sha256")
    .update(readFileSync(path.join(directory, "identity-store.json")))
    .digest("hex");
}

function copyStore(from: string, to: string): void {
  mkdirSync(to, { recursive: true });
  copyFileSync(
    path.join(from, "identity-store.json"),
    path.join(to, "identity-store.json"),
  );
}

function copyDirectory(from: string, to: string): void {
  mkdirSync(to, { recursive: true });
  for (const entry of readdirSync(from)) {
    cpSync(path.join(from, entry), path.join(to, entry), { recursive: true });
  }
}

function copyJournal(from: string, to: string): void {
  copyFileSync(
    path.join(from, BUILDER_MINIMIZATION_JOURNAL_FILE),
    to,
  );
}

function receiptPath(directory: string): string {
  return path.join(directory, BUILDER_RESTORE_REPLAY_RECEIPT_FILE);
}

function attemptReceiptPath(directory: string, attemptId: string): string {
  return path.join(directory, `restore-replay-receipt.${attemptId}.json`);
}

function readReceipt(directory: string) {
  return JSON.parse(readFileSync(receiptPath(directory), "utf8")) as {
    version: 2;
    attemptId: string;
    receiptId: string;
    previousReceiptIds: string[];
    journalHash: string;
    journalEventIds: string[];
    appliedEventIds: string[];
    alreadyAppliedEventIds: string[];
    storeBeforeHash: string;
    storeAfterHash: string;
  };
}

function readJournalEventIds(journalPath: string): string[] {
  return JSON.parse(readFileSync(journalPath, "utf8")).events.map(
    (event: { id: string }) => event.id,
  );
}

function startupEnv(directory: string) {
  return {
    BUILDER_RUNTIME_MODE: "invite",
    BUILDER_RUNTIME_STORE_DIR: directory,
    BUILDER_RUNTIME_STORE_HOST_ID: hostId,
    NEXT_PUBLIC_APP_URL: "http://127.0.0.1:3041",
  };
}

async function assertStartupBlocked(directory: string): Promise<void> {
  await assert.rejects(
    assertBuilderRuntimeStartupConfiguration(startupEnv(directory)),
    /restore|replay|receipt|closed/i,
  );
}

async function assertStartupAccepted(directory: string): Promise<void> {
  await assertBuilderRuntimeStartupConfiguration(startupEnv(directory));
}

async function withAbort<T>(
  marker: AbortMarker,
  operation: () => Promise<T>,
): Promise<T> {
  const previousHooks = process.env.BUILDER_RUNTIME_ALLOW_TEST_HOOKS;
  const previousMarker = process.env.BUILDER_MINIMIZATION_TEST_ABORT_AFTER;
  process.env.BUILDER_RUNTIME_ALLOW_TEST_HOOKS = "1";
  process.env.BUILDER_MINIMIZATION_TEST_ABORT_AFTER = marker;
  try {
    return await operation();
  } finally {
    if (previousHooks === undefined) delete process.env.BUILDER_RUNTIME_ALLOW_TEST_HOOKS;
    else process.env.BUILDER_RUNTIME_ALLOW_TEST_HOOKS = previousHooks;
    if (previousMarker === undefined) {
      delete process.env.BUILDER_MINIMIZATION_TEST_ABORT_AFTER;
    } else {
      process.env.BUILDER_MINIMIZATION_TEST_ABORT_AFTER = previousMarker;
    }
  }
}

async function setupPrimaryWithA(name: string) {
  const base = storeDir(name);
  const primary = path.join(base, "primary");
  const evidence = path.join(base, "evidence");
  mkdirSync(evidence, { recursive: true });
  writeStore(primary, fixtureStore());
  const plan = await planBuilderSubjectMinimization({
    storeDir: primary,
    subjectId: SUBJECT_A,
    now: new Date(EFFECT_AT),
  });
  await applyBuilderSubjectMinimization({ storeDir: primary, plan });
  const journal = path.join(evidence, "journal-A.json");
  copyJournal(primary, journal);
  return { base, primary, evidence, journal };
}

function assertUsagePreserved(store: BuilderIdentityStore): void {
  assert.deepEqual(store.usage, fixtureStore().usage);
  assert.deepEqual(
    computeBuilderMinimizationAccounting(store),
    computeBuilderMinimizationAccounting(fixtureStore()),
  );
  assert.equal(
    store.usage.find((item) => item.id === USAGE_A_RESERVED)?.state,
    "reserved",
  );
  assert.equal(
    store.usage.find((item) => item.id === USAGE_A_UNKNOWN)?.state,
    "unknown",
  );
}

function assertControlIntact(store: BuilderIdentityStore): void {
  assert.equal(
    store.subjects.find((item) => item.id === SUBJECT_C)?.label,
    "Control C",
  );
  assert.equal(
    store.subjects.find((item) => item.id === SUBJECT_C)?.revokedAt,
    undefined,
  );
  assert.equal(
    store.sessions.find((item) => item.id === SESSION_C)?.tokenHash,
    "session-c",
  );
  assert.equal(
    store.invites.find((item) => item.id === INVITE_C)?.tokenHash,
    "hash-c",
  );
}

test("two-cycle restore accepts a newer journal, revokes B, and preserves the previous receipt", async () => {
  const { primary, journal: journalA } = await setupPrimaryWithA("two-cycle");
  const base = path.dirname(primary);
  const restore1 = path.join(base, "restore1");
  const restore2 = path.join(base, "restore2");
  copyStore(primary, restore1);
  await prepareBuilderRestoreReplay({ storeDir: restore1, journalPath: journalA });
  await replayBuilderMinimizationJournal({ storeDir: restore1, journalPath: journalA });
  await assertStartupAccepted(restore1);
  const receiptA = readReceipt(restore1);
  assert.equal(receiptA.previousReceiptIds.length, 0);
  assert.equal(existsSync(attemptReceiptPath(restore1, receiptA.attemptId)), true);

  // A backup taken after restore A but before minimization B. Copy only the
  // stable latest receipt, not the attempt-specific history file.
  copyStore(restore1, restore2);
  copyFileSync(
    path.join(restore1, BUILDER_MINIMIZATION_JOURNAL_FILE),
    path.join(restore2, BUILDER_MINIMIZATION_JOURNAL_FILE),
  );
  copyFileSync(receiptPath(restore1), receiptPath(restore2));
  assert.equal(existsSync(attemptReceiptPath(restore2, receiptA.attemptId)), false);
  assert.equal(
    readStore(restore2).subjects.find((item) => item.id === SUBJECT_B)?.revokedAt,
    undefined,
  );

  // Ordinary operation after restore A adds minimization B.
  const planB = await planBuilderSubjectMinimization({
    storeDir: restore1,
    subjectId: SUBJECT_B,
    now: new Date(EFFECT_AT),
  });
  await applyBuilderSubjectMinimization({ storeDir: restore1, plan: planB });
  const journalAB = path.join(base, "journal-AB.json");
  copyFileSync(
    path.join(restore1, BUILDER_MINIMIZATION_JOURNAL_FILE),
    journalAB,
  );
  assert.equal(readJournalEventIds(journalAB).length, 2);

  const prepared = await prepareBuilderRestoreReplay({
    storeDir: restore2,
    journalPath: journalAB,
  });
  assert.equal(prepared.prepared, true);
  assert.equal(prepared.alreadyReplayed, false);
  assert.notEqual(prepared.attemptId, receiptA.attemptId);
  assert.equal(
    existsSync(path.join(restore2, BUILDER_RESTORE_REPLAY_GATE_FILE)),
    true,
  );
  await assertStartupBlocked(restore2);

  const receiptB = await replayBuilderMinimizationJournal({
    storeDir: restore2,
    journalPath: journalAB,
  });
  assert.equal(receiptB.attemptId, prepared.attemptId);
  assert.equal(receiptB.previousReceiptIds.includes(receiptA.receiptId), true);
  assert.equal(receiptB.journalEventIds.length, 2);
  assert.equal(receiptB.appliedEventIds.length, 1);
  assert.equal(receiptB.alreadyAppliedEventIds.length, 1);
  assert.equal(existsSync(attemptReceiptPath(restore2, receiptA.attemptId)), true);
  assert.equal(existsSync(attemptReceiptPath(restore2, receiptB.attemptId)), true);
  assert.equal(
    existsSync(path.join(restore2, BUILDER_RESTORE_REPLAY_GATE_FILE)),
    false,
  );
  await assertStartupAccepted(restore2);

  const restored = readStore(restore2);
  assert.equal(
    restored.subjects.find((item) => item.id === SUBJECT_A)?.label,
    BUILDER_MINIMIZED_LABEL,
  );
  assert.equal(
    restored.subjects.find((item) => item.id === SUBJECT_B)?.revokedAt,
    EFFECT_AT,
  );
  assert.equal(
    restored.sessions.find((item) => item.id === SESSION_B)?.tokenHash,
    BUILDER_MINIMIZED_TOKEN_HASH,
  );
  assertControlIntact(restored);
  assertUsagePreserved(restored);
});

test("same image and prepared attempt with changed journal intent stays closed and preserves control access", async () => {
  const { primary, journal: journalA } = await setupPrimaryWithA("changed-intent");
  const base = path.dirname(primary);
  const restore1 = path.join(base, "restore1");
  const restore2 = path.join(base, "restore2");
  copyStore(primary, restore1);
  await prepareBuilderRestoreReplay({ storeDir: restore1, journalPath: journalA });
  await replayBuilderMinimizationJournal({ storeDir: restore1, journalPath: journalA });
  const receiptA = readReceipt(restore1);

  // Snapshot restore A before B, then grow the journal to A+B.
  copyStore(restore1, restore2);
  copyFileSync(
    path.join(restore1, BUILDER_MINIMIZATION_JOURNAL_FILE),
    path.join(restore2, BUILDER_MINIMIZATION_JOURNAL_FILE),
  );
  copyFileSync(receiptPath(restore1), receiptPath(restore2));
  const planB = await planBuilderSubjectMinimization({
    storeDir: restore1,
    subjectId: SUBJECT_B,
    now: new Date(EFFECT_AT),
  });
  await applyBuilderSubjectMinimization({ storeDir: restore1, plan: planB });
  const journalAB = path.join(base, "journal-AB.json");
  copyJournal(restore1, journalAB);

  const prepared = await prepareBuilderRestoreReplay({
    storeDir: restore2,
    journalPath: journalAB,
  });
  assert.equal(prepared.prepared, true);
  const beforeChangedIntent = hashStore(restore2);
  assert.equal(
    existsSync(path.join(restore2, BUILDER_RESTORE_REPLAY_GATE_FILE)),
    true,
  );

  // Same image, same attempt and same event-id sequence, but changed intent.
  // Replay must not silently rebind the prepared attempt; the gate stays closed.
  const changed = JSON.parse(readFileSync(journalAB, "utf8")) as {
    events: Array<{ effectAt: string }>;
  };
  changed.events[0]!.effectAt = "2026-11-21T13:00:00.000Z";
  const changedJournal = path.join(base, "journal-changed-intent.json");
  writeFileSync(changedJournal, `${JSON.stringify(changed, null, 2)}\n`);

  await assert.rejects(
    replayBuilderMinimizationJournal({
      storeDir: restore2,
      journalPath: changedJournal,
    }),
    (error) =>
      error instanceof BuilderMinimizationRejected &&
      error.code === "replay_conflict",
  );
  assert.equal(hashStore(restore2), beforeChangedIntent);
  assert.equal(
    existsSync(path.join(restore2, BUILDER_RESTORE_REPLAY_GATE_FILE)),
    true,
  );
  assert.equal(
    existsSync(attemptReceiptPath(restore2, prepared.attemptId)),
    false,
  );
  await assertStartupBlocked(restore2);
  const blocked = readStore(restore2);
  assertControlIntact(blocked);
  assert.equal(
    blocked.subjects.find((item) => item.id === SUBJECT_B)?.revokedAt,
    undefined,
  );

  // The exact prepared journal still completes the same attempt.
  const receiptB = await replayBuilderMinimizationJournal({
    storeDir: restore2,
    journalPath: journalAB,
  });
  assert.equal(receiptB.attemptId, prepared.attemptId);
  assert.equal(receiptB.previousReceiptIds.includes(receiptA.receiptId), true);
  assert.equal(receiptB.appliedEventIds.length, 1);
  assert.equal(
    existsSync(path.join(restore2, BUILDER_RESTORE_REPLAY_GATE_FILE)),
    false,
  );
  await assertStartupAccepted(restore2);
  const restored = readStore(restore2);
  assert.equal(
    restored.subjects.find((item) => item.id === SUBJECT_A)?.label,
    BUILDER_MINIMIZED_LABEL,
  );
  assert.equal(
    restored.subjects.find((item) => item.id === SUBJECT_B)?.revokedAt,
    EFFECT_AT,
  );
  assertControlIntact(restored);
  assertUsagePreserved(restored);
});

test("missing or corrupt journal leaves the first restore attempt closed", async () => {
  const { primary, journal } = await setupPrimaryWithA("missing-corrupt");
  const base = path.dirname(primary);
  const missingBackup = path.join(base, "missing-backup");
  const corruptBackup = path.join(base, "corrupt-backup");
  copyStore(primary, missingBackup);
  copyStore(primary, corruptBackup);
  const beforeMissing = hashStore(missingBackup);
  const beforeCorrupt = hashStore(corruptBackup);

  await assert.rejects(
    replayBuilderMinimizationJournal({
      storeDir: missingBackup,
      journalPath: path.join(base, "does-not-exist.json"),
    }),
    (error) =>
      error instanceof BuilderMinimizationRejected &&
      error.code === "invalid_journal",
  );
  assert.equal(hashStore(missingBackup), beforeMissing);
  assert.equal(
    existsSync(path.join(missingBackup, BUILDER_RESTORE_REPLAY_GATE_FILE)),
    true,
  );
  assert.equal(existsSync(receiptPath(missingBackup)), false);
  await assertStartupBlocked(missingBackup);

  const corrupt = path.join(base, "corrupt-journal.json");
  writeFileSync(corrupt, "{not json\n");
  await assert.rejects(
    prepareBuilderRestoreReplay({
      storeDir: corruptBackup,
      journalPath: corrupt,
    }),
    (error) =>
      error instanceof BuilderMinimizationRejected &&
      error.code === "invalid_journal",
  );
  assert.equal(hashStore(corruptBackup), beforeCorrupt);
  assert.equal(
    existsSync(path.join(corruptBackup, BUILDER_RESTORE_REPLAY_GATE_FILE)),
    true,
  );
  await assertStartupBlocked(corruptBackup);

  // A closed attempt with no journal binding may retry with correct evidence.
  const receipt = await replayBuilderMinimizationJournal({
    storeDir: missingBackup,
    journalPath: journal,
  });
  assert.equal(receipt.status, "complete");
  await assertStartupAccepted(missingBackup);
});

test("journal growth is accepted but incomplete or divergent history stays closed", async () => {
  const { primary, journal: journalA } = await setupPrimaryWithA("history");
  const base = path.dirname(primary);
  const restoreA = path.join(base, "restore-a");
  copyStore(primary, restoreA);
  await prepareBuilderRestoreReplay({ storeDir: restoreA, journalPath: journalA });
  await replayBuilderMinimizationJournal({ storeDir: restoreA, journalPath: journalA });
  const receiptA = readReceipt(restoreA);

  const planB = await planBuilderSubjectMinimization({
    storeDir: primary,
    subjectId: SUBJECT_B,
    now: new Date(EFFECT_AT),
  });
  await applyBuilderSubjectMinimization({ storeDir: primary, plan: planB });
  const journalAB = path.join(base, "journal-AB.json");
  copyJournal(primary, journalAB);

  // Incomplete history: a journal that starts at B omits the receipted A event.
  const primaryBOnly = path.join(base, "primary-b-only");
  writeStore(primaryBOnly, fixtureStore());
  const planBOnly = await planBuilderSubjectMinimization({
    storeDir: primaryBOnly,
    subjectId: SUBJECT_B,
    now: new Date(EFFECT_AT),
  });
  await applyBuilderSubjectMinimization({ storeDir: primaryBOnly, plan: planBOnly });
  const journalBOnly = path.join(base, "journal-B-only.json");
  copyJournal(primaryBOnly, journalBOnly);
  assert.equal(readJournalEventIds(journalBOnly).length, 1);

  // Divergent history: A+C is a different branch from the backup's A+B.
  const primaryAC = path.join(base, "primary-a-c");
  copyDirectory(restoreA, primaryAC);
  const planC = await planBuilderSubjectMinimization({
    storeDir: primaryAC,
    subjectId: SUBJECT_C,
    now: new Date(EFFECT_AT),
  });
  await applyBuilderSubjectMinimization({ storeDir: primaryAC, plan: planC });
  const journalAC = path.join(base, "journal-A-C.json");
  copyJournal(primaryAC, journalAC);
  assert.equal(readJournalEventIds(journalAC).length, 2);
  assert.equal(
    readJournalEventIds(journalAC)[0],
    readJournalEventIds(journalA)[0],
  );

  // Backup after B: its own journal is A+B and receipt history is A.
  const restoreAB = path.join(base, "restore-ab");
  copyStore(primary, restoreAB);
  copyFileSync(
    path.join(primary, BUILDER_MINIMIZATION_JOURNAL_FILE),
    path.join(restoreAB, BUILDER_MINIMIZATION_JOURNAL_FILE),
  );
  copyFileSync(receiptPath(restoreA), receiptPath(restoreAB));
  const beforeDivergent = hashStore(restoreAB);

  await assert.rejects(
    replayBuilderMinimizationJournal({
      storeDir: restoreAB,
      journalPath: journalAC,
    }),
    (error) =>
      error instanceof BuilderMinimizationRejected &&
      error.code === "incomplete_replay",
  );
  assert.equal(hashStore(restoreAB), beforeDivergent);
  assert.equal(
    existsSync(path.join(restoreAB, BUILDER_RESTORE_REPLAY_GATE_FILE)),
    true,
  );
  await assertStartupBlocked(restoreAB);

  const beforeIncomplete = hashStore(restoreAB);
  await assert.rejects(
    replayBuilderMinimizationJournal({
      storeDir: restoreAB,
      journalPath: journalBOnly,
    }),
    (error) =>
      error instanceof BuilderMinimizationRejected &&
      error.code === "incomplete_replay",
  );
  assert.equal(hashStore(restoreAB), beforeIncomplete);
  await assertStartupBlocked(restoreAB);

  // Corrupt historical receipt must also keep the gate closed.
  const corruptReceiptBackup = path.join(base, "restore-corrupt-receipt");
  copyDirectory(restoreAB, corruptReceiptBackup);
  writeFileSync(receiptPath(corruptReceiptBackup), "{broken\n");
  await assert.rejects(
    replayBuilderMinimizationJournal({
      storeDir: corruptReceiptBackup,
      journalPath: journalAB,
    }),
    (error) =>
      error instanceof BuilderMinimizationRejected &&
      error.code === "incomplete_replay",
  );
  assert.equal(
    existsSync(path.join(corruptReceiptBackup, BUILDER_RESTORE_REPLAY_GATE_FILE)),
    true,
  );
  await assertStartupBlocked(corruptReceiptBackup);

  // Corrected evidence requires an explicit re-prepare; replay never rebinds.
  await prepareBuilderRestoreReplay({
    storeDir: restoreAB,
    journalPath: journalAB,
  });
  const receiptAB = await replayBuilderMinimizationJournal({
    storeDir: restoreAB,
    journalPath: journalAB,
  });
  assert.equal(receiptAB.previousReceiptIds.includes(receiptA.receiptId), true);
  assert.equal(receiptAB.journalEventIds.length, 2);
  await assertStartupAccepted(restoreAB);
});

test("each durable replay transition either keeps the store closed or has a verified receipt", async () => {
  const markers: AbortMarker[] = [
    "gate_closed",
    "gate_prepared",
    "store_written",
    "journal_written",
    "receipt_written",
    "gate_removed",
  ];
  for (const marker of markers) {
    const { primary, journal } = await setupPrimaryWithA(`transition-${marker}`);
    const base = path.dirname(primary);
    const backup = path.join(base, "backup");
    // The backup predates minimization A, so every effect transition has work.
    writeStore(backup, fixtureStore());

    await assert.rejects(
      withAbort(marker, () =>
        replayBuilderMinimizationJournal({
          storeDir: backup,
          journalPath: journal,
        }),
      ),
      /simulated interruption/,
    );

    if (marker === "receipt_written" || marker === "gate_removed") {
      await assertStartupAccepted(backup);
    } else {
      assert.equal(
        existsSync(path.join(backup, BUILDER_RESTORE_REPLAY_GATE_FILE)),
        true,
        marker,
      );
      assert.equal(
        existsSync(receiptPath(backup)),
        false,
        marker,
      );
      await assertStartupBlocked(backup);
    }

    const retried = await replayBuilderMinimizationJournal({
      storeDir: backup,
      journalPath: journal,
    });
    assert.equal(retried.status, "complete");
    await assertStartupAccepted(backup);
    assert.equal(
      existsSync(path.join(backup, BUILDER_RESTORE_REPLAY_GATE_FILE)),
      false,
      marker,
    );
    const store = readStore(backup);
    assert.equal(
      store.subjects.find((item) => item.id === SUBJECT_A)?.revokedAt,
      EFFECT_AT,
    );
    assertControlIntact(store);
    assertUsagePreserved(store);
  }
});

test("repeated preparation and replay preserve attempt history and idempotent effects", async () => {
  const { primary, journal } = await setupPrimaryWithA("repeated");
  const base = path.dirname(primary);
  const backup = path.join(base, "backup");
  copyStore(primary, backup);

  const firstPrepare = await prepareBuilderRestoreReplay({
    storeDir: backup,
    journalPath: journal,
  });
  const secondPrepare = await prepareBuilderRestoreReplay({
    storeDir: backup,
    journalPath: journal,
  });
  assert.equal(firstPrepare.prepared, true);
  assert.equal(secondPrepare.prepared, false);
  assert.equal(firstPrepare.attemptId, secondPrepare.attemptId);
  assert.equal(
    existsSync(path.join(backup, BUILDER_RESTORE_REPLAY_GATE_FILE)),
    true,
  );

  assert.equal(
    await readBuilderAdmissionStatus({
      storeDir: backup,
      sessionId: SESSION_C,
      subjectId: SUBJECT_C,
    }),
    "unavailable",
  );
  await assert.rejects(
    issueBuilderInvite({
      storeDir: backup,
      subjectId: SUBJECT_C,
      label: "Blocked while closed",
      inviteTtlSeconds: 60,
    }),
    (error) => error instanceof BuilderStoreUnavailable,
  );
  await assert.rejects(
    validateBuilderSession({ storeDir: backup, token: "synthetic-token" }),
    (error) => error instanceof BuilderStoreUnavailable,
  );
  await assert.rejects(
    planBuilderSubjectMinimization({
      storeDir: backup,
      subjectId: SUBJECT_C,
    }),
    (error) =>
      error instanceof BuilderMinimizationRejected &&
      error.code === "restore_pending",
  );

  const firstReceipt = await replayBuilderMinimizationJournal({
    storeDir: backup,
    journalPath: journal,
  });
  await assertStartupAccepted(backup);
  const secondReceipt = await replayBuilderMinimizationJournal({
    storeDir: backup,
    journalPath: journal,
  });
  assert.equal(secondReceipt.storeBeforeHash, firstReceipt.storeAfterHash);
  assert.equal(secondReceipt.storeAfterHash, firstReceipt.storeAfterHash);
  assert.equal(secondReceipt.appliedEventIds.length, 0);
  assert.equal(
    secondReceipt.previousReceiptIds.includes(firstReceipt.receiptId),
    true,
  );
  assert.equal(
    existsSync(attemptReceiptPath(backup, firstReceipt.attemptId)),
    true,
  );
  assert.equal(
    existsSync(attemptReceiptPath(backup, secondReceipt.attemptId)),
    true,
  );

  const repeatPrepare = await prepareBuilderRestoreReplay({
    storeDir: backup,
    journalPath: journal,
  });
  assert.equal(repeatPrepare.alreadyReplayed, true);
  assert.equal(
    existsSync(path.join(backup, BUILDER_RESTORE_REPLAY_GATE_FILE)),
    false,
  );
  await assertStartupAccepted(backup);

  const store = readStore(backup);
  assert.equal(
    store.subjects.find((item) => item.id === SUBJECT_A)?.revokedAt,
    EFFECT_AT,
  );
  assertControlIntact(store);
  assertUsagePreserved(store);
  const receiptFiles = readdirSync(backup).filter((name) =>
    name.startsWith("restore-replay-receipt."),
  );
  assert.ok(receiptFiles.length >= 2);

  assert.equal(
    await readBuilderAdmissionStatus({
      storeDir: backup,
      sessionId: SESSION_C,
      subjectId: SUBJECT_C,
    }),
    "active",
  );
  const issued = await issueBuilderInvite({
    storeDir: backup,
    subjectId: SUBJECT_C,
    label: "Control after replay",
    inviteTtlSeconds: 60,
  });
  assert.match(issued.invite.id, /^inv_/);
});

test.after(() => {
  rmSync(tempRoot, { recursive: true, force: true });
});
