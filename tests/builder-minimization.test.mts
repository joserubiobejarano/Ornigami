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
import { spawnSync } from "node:child_process";
import test from "node:test";

import {
  BUILDER_MINIMIZED_LABEL,
  BUILDER_MINIMIZED_TOKEN_HASH,
  BUILDER_MINIMIZATION_JOURNAL_FILE,
  BUILDER_RESTORE_REPLAY_GATE_FILE,
  BUILDER_RESTORE_REPLAY_RECEIPT_FILE,
  BuilderStoreUnavailable,
  assertBuilderStoreReplayReady,
  issueBuilderInvite,
  readBuilderAdmissionStatus,
  readBuilderIdentityStore,
  serializeBuilderIdentityStore,
  validateBuilderSession,
  type BuilderIdentityStore,
} from "../builder-runtime/lib/identity-store.ts";
import {
  BuilderMinimizationRejected,
  applyBuilderSubjectMinimization,
  computeBuilderMinimizationAccounting,
  parseBuilderSubjectMinimizationPlan,
  planBuilderSubjectMinimization,
  prepareBuilderRestoreReplay,
  replayBuilderMinimizationJournal,
} from "../builder-runtime/lib/minimization.ts";
import { assertBuilderRuntimeStartupConfiguration } from "../builder-runtime/lib/runtime-config.ts";
import {
  effectiveUsageCostMicros,
  reserveBuilderUsage,
  type BuilderGenerationLimits,
} from "../builder-runtime/lib/usage-ledger.ts";

const root = process.cwd();
const tempRoot = path.join(root, ".local", "test-builder-minimization");
const hostId = "builder-minimization-test-host";
rmSync(tempRoot, { recursive: true, force: true });
mkdirSync(tempRoot, { recursive: true });

const SUBJECT_A = "sub_aaaaaaaaaaaaaaaaaaaaaaaa";
const SUBJECT_B = "sub_bbbbbbbbbbbbbbbbbbbbbbbb";
const INVITE_A_UNUSED = "inv_aaaaaaaaaaaaaaaaaaaaaaaa";
const INVITE_A_USED = "inv_abababababababababababab";
const INVITE_B = "inv_bbbbbbbbbbbbbbbbbbbbbbbb";
const SESSION_A_1 = "ses_aaaaaaaaaaaaaaaaaaaaaaaa";
const SESSION_A_2 = "ses_abababababababababababab";
const SESSION_B = "ses_bbbbbbbbbbbbbbbbbbbbbbbb";
const USAGE_A_RESERVED = "use_aaaaaaaaaaaaaaaaaaaaaaaa";
const USAGE_A_UNKNOWN = "use_abababababababababababab";
const USAGE_A_SETTLED = "use_acacacacacacacacacacacac";
const USAGE_A_FAILED = "use_adadadadadadadadadadadad";
const USAGE_B_SETTLED = "use_bbbbbbbbbbbbbbbbbbbbbbbb";
const CREATED_AT = "2026-11-20T10:00:00.000Z";
const EXPIRES_AT = "2030-01-01T00:00:00.000Z";
const EFFECT_AT = "2026-11-21T12:00:00.000Z";

function storeDir(name: string): string {
  return mkdtempSync(path.join(tempRoot, `${name}-`));
}

function fixtureStore(): BuilderIdentityStore {
  return {
    version: 1,
    subjects: [
      { id: SUBJECT_A, label: "Synthetic Target", createdAt: CREATED_AT },
      { id: SUBJECT_B, label: "Control Subject", createdAt: CREATED_AT },
    ],
    invites: [
      {
        id: INVITE_A_UNUSED,
        subjectId: SUBJECT_A,
        label: "Target unused",
        tokenHash: "hash-a-unused",
        createdAt: CREATED_AT,
        expiresAt: EXPIRES_AT,
      },
      {
        id: INVITE_A_USED,
        subjectId: SUBJECT_A,
        label: "Target used",
        tokenHash: "hash-a-used",
        createdAt: CREATED_AT,
        expiresAt: EXPIRES_AT,
        usedAt: CREATED_AT,
        redeemedSessionId: SESSION_A_1,
      },
      {
        id: INVITE_B,
        subjectId: SUBJECT_B,
        label: "Control invite",
        tokenHash: "hash-b",
        createdAt: CREATED_AT,
        expiresAt: EXPIRES_AT,
      },
    ],
    sessions: [
      {
        id: SESSION_A_1,
        subjectId: SUBJECT_A,
        tokenHash: "session-a-1",
        createdAt: CREATED_AT,
        expiresAt: EXPIRES_AT,
      },
      {
        id: SESSION_A_2,
        subjectId: SUBJECT_A,
        tokenHash: "session-a-2",
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
    ],
    usage: [
      {
        id: USAGE_A_RESERVED,
        subjectId: SUBJECT_A,
        sessionId: SESSION_A_1,
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
        sessionId: SESSION_A_2,
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
        sessionId: SESSION_A_1,
        generationId: "gen_a_settled",
        recordedAt: CREATED_AT,
        state: "succeeded",
        costMicros: 30_000,
        reservedCostMicros: 50_000,
        requestKey: "request-a-settled",
        settledAt: CREATED_AT,
      },
      {
        id: USAGE_A_FAILED,
        subjectId: SUBJECT_A,
        sessionId: SESSION_A_1,
        generationId: "gen_a_failed",
        recordedAt: CREATED_AT,
        state: "failed",
        costMicros: 0,
        reservedCostMicros: 50_000,
        requestKey: "request-a-failed",
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
  for (const entry of readdirSync(from)) {
    cpSync(path.join(from, entry), path.join(to, entry), { recursive: true });
  }
}

function readJournal(directory: string) {
  return JSON.parse(
    readFileSync(path.join(directory, BUILDER_MINIMIZATION_JOURNAL_FILE), "utf8"),
  ) as {
    version: 1;
    events: Array<{
      id: string;
      planId: string;
      phase: "pending" | "completed";
      resultStoreHash?: string;
      replayedAt?: string;
      replayedStoreHash?: string;
    }>;
  };
}

function controlLimits(): BuilderGenerationLimits {
  return {
    windowSeconds: 3_600,
    reservationLeaseSeconds: 300,
    requestReserveMicros: 1_000,
    subjectRequests: 100,
    globalRequests: 1_000,
    subjectConcurrency: 10,
    globalConcurrency: 20,
    subjectSpendMicros: 1_000_000,
    globalSpendMicros: 2_000_000,
  };
}

async function withAbort<T>(
  marker: "journal_prepared" | "store_written" | "receipt_written",
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

test("dry-run lists affected ids/categories without labels or token hashes; apply preserves accounting and control", async () => {
  const dir = storeDir("plan-apply");
  const original = fixtureStore();
  writeStore(dir, original);
  const beforeHash = hashStore(dir);
  const beforeAccounting = computeBuilderMinimizationAccounting(original);

  const plan = await planBuilderSubjectMinimization({
    storeDir: dir,
    subjectId: SUBJECT_A,
    now: new Date(EFFECT_AT),
  });
  assert.equal(plan.subjectId, SUBJECT_A);
  assert.equal(plan.storeHash, beforeHash);
  assert.deepEqual(plan.accounting, beforeAccounting);
  assert.deepEqual(plan.expectedAccounting, beforeAccounting);
  assert.ok(plan.affected.subject.categories.includes("subject.revoke"));
  assert.ok(plan.affected.subject.categories.includes("subject.label"));
  assert.deepEqual(
    plan.affected.invites.map((item) => item.id).sort(),
    [INVITE_A_UNUSED, INVITE_A_USED].sort(),
  );
  assert.ok(
    plan.affected.invites
      .find((item) => item.id === INVITE_A_UNUSED)
      ?.categories.includes("invite.revoke"),
  );
  assert.equal(
    plan.affected.invites
      .find((item) => item.id === INVITE_A_USED)
      ?.categories.includes("invite.revoke"),
    false,
  );
  assert.deepEqual(
    plan.affected.sessions.map((item) => item.id).sort(),
    [SESSION_A_1, SESSION_A_2].sort(),
  );
  assert.deepEqual([...plan.affected.usage.ids].sort(), [
    USAGE_A_FAILED,
    USAGE_A_RESERVED,
    USAGE_A_SETTLED,
    USAGE_A_UNKNOWN,
  ].sort());
  assert.deepEqual(plan.affected.usage.categories, ["usage.preserve"]);

  const planText = JSON.stringify(plan);
  for (const secret of [
    "Synthetic Target",
    "Target unused",
    "Target used",
    "hash-a-unused",
    "session-a-1",
  ]) {
    assert.equal(planText.includes(secret), false, secret);
  }

  const receipt = await applyBuilderSubjectMinimization({
    storeDir: dir,
    plan,
    now: new Date(EFFECT_AT),
  });
  assert.equal(receipt.status, "applied");
  assert.equal(receipt.changed, true);
  assert.equal(receipt.storeBeforeHash, beforeHash);
  assert.equal(receipt.storeAfterHash, plan.expectedResultHash);
  assert.deepEqual(receipt.accountingAfter, beforeAccounting);

  const after = readStore(dir);
  const subjectA = after.subjects.find((item) => item.id === SUBJECT_A);
  const subjectB = after.subjects.find((item) => item.id === SUBJECT_B);
  assert.equal(subjectA?.revokedAt, EFFECT_AT);
  assert.equal(subjectA?.label, BUILDER_MINIMIZED_LABEL);
  assert.deepEqual(subjectB, original.subjects[1]);
  for (const session of after.sessions.filter((item) => item.subjectId === SUBJECT_A)) {
    assert.equal(session.revokedAt, EFFECT_AT);
    assert.equal(session.tokenHash, BUILDER_MINIMIZED_TOKEN_HASH);
  }
  const controlSession = after.sessions.find((item) => item.id === SESSION_B);
  assert.equal(controlSession?.tokenHash, "session-b");
  assert.equal(controlSession?.revokedAt, undefined);

  const unused = after.invites.find((item) => item.id === INVITE_A_UNUSED);
  const used = after.invites.find((item) => item.id === INVITE_A_USED);
  assert.equal(unused?.revokedAt, EFFECT_AT);
  assert.equal(unused?.label, BUILDER_MINIMIZED_LABEL);
  assert.equal(unused?.tokenHash, BUILDER_MINIMIZED_TOKEN_HASH);
  assert.equal(used?.revokedAt, undefined);
  assert.equal(used?.label, BUILDER_MINIMIZED_LABEL);
  assert.equal(used?.tokenHash, BUILDER_MINIMIZED_TOKEN_HASH);
  assert.equal(
    after.invites.find((item) => item.id === INVITE_B)?.tokenHash,
    "hash-b",
  );
  assert.deepEqual(after.usage, original.usage);
  assert.equal(
    after.usage.reduce((total, record) => total + effectiveUsageCostMicros(record), 0),
    original.usage.reduce((total, record) => total + effectiveUsageCostMicros(record), 0),
  );

  const journal = readJournal(dir);
  assert.equal(journal.events.length, 1);
  assert.equal(journal.events[0].phase, "completed");
  assert.equal(journal.events[0].resultStoreHash, receipt.storeAfterHash);
  const journalText = JSON.stringify(journal);
  for (const secret of [
    "Synthetic Target",
    "Target unused",
    "hash-a-unused",
    "session-a-1",
  ]) {
    assert.equal(journalText.includes(secret), false, secret);
  }

  const targetAttempt = await reserveBuilderUsage({
    storeDir: dir,
    subjectId: SUBJECT_A,
    sessionId: SESSION_A_1,
    requestKey: "after-minimisation-target",
    limits: controlLimits(),
  });
  assert.equal(targetAttempt.ok, false);
  if (!targetAttempt.ok) assert.equal(targetAttempt.code, "session_inactive");

  const controlAttempt = await reserveBuilderUsage({
    storeDir: dir,
    subjectId: SUBJECT_B,
    sessionId: SESSION_B,
    requestKey: "control-after-minimisation",
    limits: controlLimits(),
  });
  assert.equal(controlAttempt.ok, true);
  const finalStore = await readBuilderIdentityStore(dir);
  assert.equal(
    finalStore.usage.filter((item) => item.subjectId === SUBJECT_A).length,
    4,
    "minimisation must not remove or add target usage",
  );
  assert.equal(
    finalStore.usage.find((item) => item.id === USAGE_A_RESERVED)?.state,
    "reserved",
  );
  assert.equal(
    finalStore.usage.find((item) => item.id === USAGE_A_UNKNOWN)?.state,
    "unknown",
  );
});

test("stale and tampered plans are rejected before any mutation", async () => {
  const dir = storeDir("stale");
  const original = fixtureStore();
  writeStore(dir, original);
  const plan = await planBuilderSubjectMinimization({
    storeDir: dir,
    subjectId: SUBJECT_A,
    now: new Date(EFFECT_AT),
  });
  await issueBuilderInvite({
    storeDir: dir,
    subjectId: SUBJECT_B,
    label: "Concurrent control invite",
    inviteTtlSeconds: 3_600,
  });
  const afterConcurrentWrite = hashStore(dir);
  await assert.rejects(
    applyBuilderSubjectMinimization({ storeDir: dir, plan }),
    (error) =>
      error instanceof BuilderMinimizationRejected &&
      error.code === "stale_plan",
  );
  assert.equal(hashStore(dir), afterConcurrentWrite);
  assert.equal(
    existsSync(path.join(dir, BUILDER_MINIMIZATION_JOURNAL_FILE)),
    false,
  );

  assert.throws(
    () =>
      parseBuilderSubjectMinimizationPlan({
        ...plan,
        expectedResultHash: "0".repeat(64),
      }),
    (error) =>
      error instanceof BuilderMinimizationRejected &&
      error.code === "invalid_plan",
  );
  await assert.rejects(
    applyBuilderSubjectMinimization({
      storeDir: dir,
      plan: { ...plan, expectedResultHash: "0".repeat(64) },
    }),
    (error) =>
      error instanceof BuilderMinimizationRejected &&
      error.code === "invalid_plan",
  );
  assert.equal(hashStore(dir), afterConcurrentWrite);
});

test("interrupted apply leaves durable evidence and resumes idempotently", async () => {
  const preparedDir = storeDir("interrupted-prepared");
  writeStore(preparedDir, fixtureStore());
  const preparedPlan = await planBuilderSubjectMinimization({
    storeDir: preparedDir,
    subjectId: SUBJECT_A,
    now: new Date(EFFECT_AT),
  });
  await assert.rejects(
    withAbort("journal_prepared", () =>
      applyBuilderSubjectMinimization({
        storeDir: preparedDir,
        plan: preparedPlan,
      }),
    ),
    /simulated interruption/,
  );
  assert.equal(hashStore(preparedDir), preparedPlan.storeHash);
  let journal = readJournal(preparedDir);
  assert.equal(journal.events.length, 1);
  assert.equal(journal.events[0].phase, "pending");
  await assert.rejects(
    issueBuilderInvite({
      storeDir: preparedDir,
      subjectId: SUBJECT_B,
      label: "Must wait",
      inviteTtlSeconds: 60,
    }),
    (error) => error instanceof BuilderStoreUnavailable,
  );
  assert.equal(
    await readBuilderAdmissionStatus({
      storeDir: preparedDir,
      sessionId: SESSION_B,
      subjectId: SUBJECT_B,
    }),
    "unavailable",
  );
  await assert.rejects(
    validateBuilderSession({
      storeDir: preparedDir,
      token: "synthetic-token",
    }),
    (error) => error instanceof BuilderStoreUnavailable,
  );
  const resumed = await applyBuilderSubjectMinimization({
    storeDir: preparedDir,
    plan: preparedPlan,
  });
  assert.equal(resumed.status, "applied");
  assert.equal(resumed.storeAfterHash, preparedPlan.expectedResultHash);
  journal = readJournal(preparedDir);
  assert.equal(journal.events[0].phase, "completed");

  const writtenDir = storeDir("interrupted-written");
  writeStore(writtenDir, fixtureStore());
  const writtenPlan = await planBuilderSubjectMinimization({
    storeDir: writtenDir,
    subjectId: SUBJECT_A,
    now: new Date(EFFECT_AT),
  });
  await assert.rejects(
    withAbort("store_written", () =>
      applyBuilderSubjectMinimization({
        storeDir: writtenDir,
        plan: writtenPlan,
      }),
    ),
    /simulated interruption/,
  );
  assert.equal(hashStore(writtenDir), writtenPlan.expectedResultHash);
  journal = readJournal(writtenDir);
  assert.equal(journal.events[0].phase, "pending");
  const retried = await applyBuilderSubjectMinimization({
    storeDir: writtenDir,
    plan: writtenPlan,
  });
  assert.equal(retried.status, "already_applied");
  assert.equal(retried.changed, false);
  journal = readJournal(writtenDir);
  assert.equal(journal.events[0].phase, "completed");
  assert.equal(journal.events[0].resultStoreHash, writtenPlan.expectedResultHash);
});

test("concurrent identical applies produce one request and one journal event", async () => {
  const dir = storeDir("concurrent-apply");
  writeStore(dir, fixtureStore());
  const plan = await planBuilderSubjectMinimization({
    storeDir: dir,
    subjectId: SUBJECT_A,
    now: new Date(EFFECT_AT),
  });
  const results = await Promise.all(
    Array.from({ length: 6 }, () =>
      applyBuilderSubjectMinimization({ storeDir: dir, plan }),
    ),
  );
  assert.equal(results.filter((item) => item.changed).length, 1);
  assert.equal(results.filter((item) => item.status === "applied").length, 1);
  const journal = readJournal(dir);
  assert.equal(journal.events.length, 1);
  assert.equal(journal.events[0].phase, "completed");
  const store = readStore(dir);
  assert.equal(
    store.subjects.find((item) => item.id === SUBJECT_A)?.revokedAt,
    EFFECT_AT,
  );
  assert.deepEqual(
    store.subjects.find((item) => item.id === SUBJECT_B),
    fixtureStore().subjects[1],
  );
});

test("concurrent operator activity either applies atomically or reports a stale plan", async () => {
  const dir = storeDir("concurrent-operator");
  writeStore(dir, fixtureStore());
  const plan = await planBuilderSubjectMinimization({
    storeDir: dir,
    subjectId: SUBJECT_A,
    now: new Date(EFFECT_AT),
  });
  const [applyResult, inviteResult] = await Promise.allSettled([
    applyBuilderSubjectMinimization({ storeDir: dir, plan }),
    issueBuilderInvite({
      storeDir: dir,
      subjectId: SUBJECT_B,
      label: "Concurrent control",
      inviteTtlSeconds: 60,
    }),
  ]);
  assert.equal(inviteResult.status, "fulfilled");
  if (applyResult.status === "rejected") {
    assert.ok(applyResult.reason instanceof BuilderMinimizationRejected);
    assert.equal(applyResult.reason.code, "stale_plan");
    assert.equal(
      existsSync(path.join(dir, BUILDER_MINIMIZATION_JOURNAL_FILE)),
      false,
    );
  } else {
    assert.equal(applyResult.value.status, "applied");
  }
  const store = readStore(dir);
  assert.equal(
    store.subjects.find((item) => item.id === SUBJECT_B)?.label,
    "Control Subject",
  );
  assert.equal(
    store.sessions.find((item) => item.id === SESSION_B)?.tokenHash,
    "session-b",
  );
  assert.equal(
    store.invites.filter((item) => item.subjectId === SUBJECT_B).length,
    2,
  );
  assert.equal(
    store.usage.filter((item) => item.subjectId === SUBJECT_B).length,
    1,
  );
});

test("offline replay resurrects an older backup, preserves accounting, and is idempotent", async () => {
  const primary = storeDir("replay-primary");
  const backup = storeDir("replay-backup");
  const evidence = storeDir("replay-evidence");
  const original = fixtureStore();
  writeStore(primary, original);
  copyStore(primary, backup);
  const backupHash = hashStore(backup);
  const plan = await planBuilderSubjectMinimization({
    storeDir: primary,
    subjectId: SUBJECT_A,
    now: new Date(EFFECT_AT),
  });
  const applied = await applyBuilderSubjectMinimization({
    storeDir: primary,
    plan,
  });
  const sourceJournal = path.join(evidence, "minimization-journal.json");
  copyFileSync(
    path.join(primary, BUILDER_MINIMIZATION_JOURNAL_FILE),
    sourceJournal,
  );

  const resurrected = readStore(backup);
  assert.equal(
    resurrected.subjects.find((item) => item.id === SUBJECT_A)?.revokedAt,
    undefined,
  );
  assert.equal(
    resurrected.sessions.find((item) => item.id === SESSION_A_1)?.tokenHash,
    "session-a-1",
  );

  const receipt = await replayBuilderMinimizationJournal({
    storeDir: backup,
    journalPath: sourceJournal,
    now: new Date(EFFECT_AT),
  });
  assert.equal(receipt.status, "complete");
  assert.equal(receipt.storeBeforeHash, backupHash);
  assert.equal(receipt.storeAfterHash, applied.storeAfterHash);
  assert.deepEqual(receipt.appliedEventIds, [journalEventId(sourceJournal)]);
  assert.deepEqual(receipt.absentSubjectIds, []);
  assert.deepEqual(receipt.invariants, {
    usageUnchanged: true,
    accountingPreserved: true,
    relationshipsValid: true,
    effectsComplete: true,
  });
  assert.deepEqual(
    receipt.accountingBefore,
    computeBuilderMinimizationAccounting(original),
  );
  assert.deepEqual(receipt.accountingAfter, receipt.accountingBefore);

  const restored = readStore(backup);
  assert.equal(
    restored.subjects.find((item) => item.id === SUBJECT_A)?.revokedAt,
    EFFECT_AT,
  );
  assert.equal(
    restored.subjects.find((item) => item.id === SUBJECT_A)?.label,
    BUILDER_MINIMIZED_LABEL,
  );
  for (const session of restored.sessions.filter(
    (item) => item.subjectId === SUBJECT_A,
  )) {
    assert.equal(session.revokedAt, EFFECT_AT);
    assert.equal(session.tokenHash, BUILDER_MINIMIZED_TOKEN_HASH);
  }
  assert.deepEqual(restored.usage, original.usage);
  assert.deepEqual(
    restored.subjects.find((item) => item.id === SUBJECT_B),
    original.subjects[1],
  );
  assert.equal(
    restored.sessions.find((item) => item.id === SESSION_B)?.tokenHash,
    "session-b",
  );
  assert.equal(
    existsSync(path.join(backup, BUILDER_RESTORE_REPLAY_GATE_FILE)),
    false,
  );
  assert.equal(
    existsSync(path.join(backup, BUILDER_RESTORE_REPLAY_RECEIPT_FILE)),
    true,
  );
  await assertBuilderStoreReplayReady(backup);

  const repeated = await replayBuilderMinimizationJournal({
    storeDir: backup,
    journalPath: sourceJournal,
    now: new Date(EFFECT_AT),
  });
  assert.equal(repeated.storeBeforeHash, receipt.storeAfterHash);
  assert.equal(repeated.storeAfterHash, receipt.storeAfterHash);
  assert.deepEqual(repeated.appliedEventIds, []);
  assert.deepEqual(repeated.alreadyAppliedEventIds, [journalEventId(sourceJournal)]);
  assert.equal(hashStore(backup), receipt.storeAfterHash);
});

test("missing, corrupt, incomplete, and internally inconsistent replay evidence fails closed", async () => {
  const primary = storeDir("replay-fail-primary");
  const backup = storeDir("replay-fail-backup");
  const evidence = storeDir("replay-fail-evidence");
  writeStore(primary, fixtureStore());
  copyStore(primary, backup);
  const plan = await planBuilderSubjectMinimization({
    storeDir: primary,
    subjectId: SUBJECT_A,
    now: new Date(EFFECT_AT),
  });
  await applyBuilderSubjectMinimization({ storeDir: primary, plan });
  const sourceJournal = path.join(evidence, "journal.json");
  copyFileSync(
    path.join(primary, BUILDER_MINIMIZATION_JOURNAL_FILE),
    sourceJournal,
  );
  const beforeHash = hashStore(backup);

  await assert.rejects(
    replayBuilderMinimizationJournal({
      storeDir: backup,
      journalPath: path.join(evidence, "missing.json"),
    }),
    (error) =>
      error instanceof BuilderMinimizationRejected &&
      error.code === "invalid_journal",
  );
  assert.equal(hashStore(backup), beforeHash);
  assert.equal(
    existsSync(path.join(backup, BUILDER_RESTORE_REPLAY_GATE_FILE)),
    true,
  );
  await assert.rejects(
    assertBuilderStoreReplayReady(backup),
    (error) => error instanceof BuilderStoreUnavailable,
  );

  const corruptJournal = path.join(evidence, "corrupt.json");
  writeFileSync(corruptJournal, "{not valid json\n");
  await assert.rejects(
    replayBuilderMinimizationJournal({
      storeDir: backup,
      journalPath: corruptJournal,
    }),
    (error) =>
      error instanceof BuilderMinimizationRejected &&
      error.code === "invalid_journal",
  );
  assert.equal(hashStore(backup), beforeHash);
  assert.equal(
    existsSync(path.join(backup, BUILDER_RESTORE_REPLAY_GATE_FILE)),
    true,
  );

  const incompleteBackup = storeDir("replay-incomplete-backup");
  copyStore(backup, incompleteBackup);
  const source = JSON.parse(readFileSync(sourceJournal, "utf8"));
  const extra = {
    ...source.events[0],
    id: `mnj_${"0".repeat(24)}`,
    planId: "1".repeat(64),
  };
  writeFileSync(
    path.join(incompleteBackup, BUILDER_MINIMIZATION_JOURNAL_FILE),
    `${JSON.stringify({ version: 1, events: [extra] }, null, 2)}\n`,
  );
  const incompleteHash = hashStore(incompleteBackup);
  await assert.rejects(
    replayBuilderMinimizationJournal({
      storeDir: incompleteBackup,
      journalPath: sourceJournal,
    }),
    (error) =>
      error instanceof BuilderMinimizationRejected &&
      error.code === "incomplete_replay",
  );
  assert.equal(hashStore(incompleteBackup), incompleteHash);
  assert.equal(
    existsSync(path.join(incompleteBackup, BUILDER_RESTORE_REPLAY_GATE_FILE)),
    true,
  );
  await assert.rejects(
    assertBuilderStoreReplayReady(incompleteBackup),
    (error) => error instanceof BuilderStoreUnavailable,
  );

  const inconsistentBackup = storeDir("replay-inconsistent-backup");
  const inconsistent = fixtureStore();
  inconsistent.usage.push({
    id: "use_cccccccccccccccccccccccc",
    subjectId: "sub_ffffffffffffffffffffffff",
    sessionId: SESSION_A_1,
    generationId: "gen_missing_subject",
    recordedAt: CREATED_AT,
    state: "unknown",
    costMicros: 10_000,
    reservedCostMicros: 10_000,
    requestKey: "request-missing-subject",
  });
  writeStore(inconsistentBackup, inconsistent);
  const inconsistentHash = hashStore(inconsistentBackup);
  await assert.rejects(
    replayBuilderMinimizationJournal({
      storeDir: inconsistentBackup,
      journalPath: sourceJournal,
    }),
    (error) =>
      error instanceof BuilderMinimizationRejected &&
      error.code === "incompatible_store",
  );
  assert.equal(hashStore(inconsistentBackup), inconsistentHash);
  assert.equal(
    existsSync(path.join(inconsistentBackup, BUILDER_RESTORE_REPLAY_GATE_FILE)),
    true,
  );
  await assert.rejects(
    assertBuilderStoreReplayReady(inconsistentBackup),
    (error) => error instanceof BuilderStoreUnavailable,
  );
});

test("restore-prepare closes a restored store before any replay is attempted", async () => {
  const primary = storeDir("restore-prepare-primary");
  const backup = storeDir("restore-prepare-backup");
  const evidence = storeDir("restore-prepare-evidence");
  writeStore(primary, fixtureStore());
  copyStore(primary, backup);
  const plan = await planBuilderSubjectMinimization({
    storeDir: primary,
    subjectId: SUBJECT_A,
    now: new Date(EFFECT_AT),
  });
  await applyBuilderSubjectMinimization({ storeDir: primary, plan });
  const sourceJournal = path.join(evidence, "journal.json");
  copyFileSync(
    path.join(primary, BUILDER_MINIMIZATION_JOURNAL_FILE),
    sourceJournal,
  );

  const prepared = await prepareBuilderRestoreReplay({
    storeDir: backup,
    journalPath: sourceJournal,
    now: new Date(EFFECT_AT),
  });
  assert.equal(prepared.prepared, true);
  assert.equal(prepared.alreadyReplayed, false);
  assert.equal(
    existsSync(path.join(backup, BUILDER_RESTORE_REPLAY_GATE_FILE)),
    true,
  );
  await assert.rejects(
    assertBuilderStoreReplayReady(backup),
    (error) => error instanceof BuilderStoreUnavailable,
  );

  const receipt = await replayBuilderMinimizationJournal({
    storeDir: backup,
    journalPath: sourceJournal,
  });
  assert.equal(receipt.status, "complete");
  await assertBuilderStoreReplayReady(backup);
  const repeatedPrepare = await prepareBuilderRestoreReplay({
    storeDir: backup,
    journalPath: sourceJournal,
  });
  assert.equal(repeatedPrepare.alreadyReplayed, true);
});

test("an interrupted replay keeps the restore gate closed until a complete receipt exists", async () => {
  const primary = storeDir("replay-gate-primary");
  const backup = storeDir("replay-gate-backup");
  const evidence = storeDir("replay-gate-evidence");
  writeStore(primary, fixtureStore());
  copyStore(primary, backup);
  const plan = await planBuilderSubjectMinimization({
    storeDir: primary,
    subjectId: SUBJECT_A,
    now: new Date(EFFECT_AT),
  });
  await applyBuilderSubjectMinimization({ storeDir: primary, plan });
  const sourceJournal = path.join(evidence, "journal.json");
  copyFileSync(
    path.join(primary, BUILDER_MINIMIZATION_JOURNAL_FILE),
    sourceJournal,
  );

  await assert.rejects(
    withAbort("store_written", () =>
      replayBuilderMinimizationJournal({
        storeDir: backup,
        journalPath: sourceJournal,
      }),
    ),
    /simulated interruption/,
  );
  assert.equal(
    existsSync(path.join(backup, BUILDER_RESTORE_REPLAY_GATE_FILE)),
    true,
  );
  assert.equal(
    existsSync(path.join(backup, BUILDER_RESTORE_REPLAY_RECEIPT_FILE)),
    false,
  );
  await assert.rejects(
    assertBuilderStoreReplayReady(backup),
    (error) => error instanceof BuilderStoreUnavailable,
  );
  const env = {
    BUILDER_RUNTIME_MODE: "invite",
    BUILDER_RUNTIME_STORE_DIR: backup,
    BUILDER_RUNTIME_STORE_HOST_ID: hostId,
    NEXT_PUBLIC_APP_URL: "http://127.0.0.1:3041",
  };
  await assert.rejects(
    assertBuilderRuntimeStartupConfiguration(env),
    /replay|receipt/i,
  );

  const receipt = await replayBuilderMinimizationJournal({
    storeDir: backup,
    journalPath: sourceJournal,
  });
  assert.equal(receipt.status, "complete");
  assert.equal(
    existsSync(path.join(backup, BUILDER_RESTORE_REPLAY_GATE_FILE)),
    false,
  );
  assert.equal(
    existsSync(path.join(backup, BUILDER_RESTORE_REPLAY_RECEIPT_FILE)),
    true,
  );
  await assertBuilderStoreReplayReady(backup);
  await assertBuilderRuntimeStartupConfiguration(env);
});

test("a pending apply journal blocks runtime reopening", async () => {
  const dir = storeDir("pending-startup");
  writeStore(dir, fixtureStore());
  const plan = await planBuilderSubjectMinimization({
    storeDir: dir,
    subjectId: SUBJECT_A,
    now: new Date(EFFECT_AT),
  });
  await assert.rejects(
    withAbort("journal_prepared", () =>
      applyBuilderSubjectMinimization({ storeDir: dir, plan }),
    ),
    /simulated interruption/,
  );
  await assert.rejects(
    assertBuilderRuntimeStartupConfiguration({
      BUILDER_RUNTIME_MODE: "invite",
      BUILDER_RUNTIME_STORE_DIR: dir,
      BUILDER_RUNTIME_STORE_HOST_ID: hostId,
      NEXT_PUBLIC_APP_URL: "http://127.0.0.1:3041",
    }),
  );
});

test("the supported operator CLI exposes dry-run, reviewed apply, and replay status", () => {
  const dir = storeDir("operator-cli");
  writeStore(dir, fixtureStore());
  const operatorScript = path.join(
    root,
    "scripts",
    "builder-invite-operator.mjs",
  );
  const run = (args: string[]) =>
    spawnSync(
      process.execPath,
      ["--experimental-strip-types", operatorScript, ...args, "--json"],
      {
        cwd: root,
        encoding: "utf8",
        env: { ...process.env, BUILDER_RUNTIME_STORE_HOST_ID: hostId },
      },
    );
  const planFile = path.join(dir, "reviewed-plan.json");
  const planned = run([
    "minimize",
    "--store",
    dir,
    "--subject",
    SUBJECT_A,
    "--plan-out",
    planFile,
  ]);
  assert.equal(planned.status, 0, planned.stderr || planned.stdout);
  const plan = JSON.parse(planned.stdout.trim());
  assert.equal(plan.subjectId, SUBJECT_A);
  assert.equal(existsSync(planFile), true);

  const mismatch = run([
    "minimize-apply",
    "--store",
    dir,
    "--plan",
    planFile,
    "--confirm-subject",
    SUBJECT_B,
  ]);
  assert.notEqual(mismatch.status, 0);

  const applied = run([
    "minimize-apply",
    "--store",
    dir,
    "--plan",
    planFile,
    "--confirm-subject",
    SUBJECT_A,
  ]);
  assert.equal(applied.status, 0, applied.stderr || applied.stdout);
  assert.equal(JSON.parse(applied.stdout.trim()).status, "applied");

  const status = run(["replay-status", "--store", dir]);
  assert.equal(status.status, 0, status.stderr || status.stdout);
  assert.equal(JSON.parse(status.stdout.trim()).replayReady, true);
});

test("a corrupt journal and incompatible store fail closed without partial mutation", async () => {
  const dir = storeDir("corrupt-journal");
  writeStore(dir, fixtureStore());
  const plan = await planBuilderSubjectMinimization({
    storeDir: dir,
    subjectId: SUBJECT_A,
    now: new Date(EFFECT_AT),
  });
  writeFileSync(path.join(dir, BUILDER_MINIMIZATION_JOURNAL_FILE), "{broken\n");
  const beforeHash = hashStore(dir);
  await assert.rejects(
    applyBuilderSubjectMinimization({ storeDir: dir, plan }),
    (error) => error instanceof BuilderStoreUnavailable,
  );
  assert.equal(hashStore(dir), beforeHash);

  const incompatible = storeDir("incompatible-store");
  writeFileSync(
    path.join(incompatible, "identity-store.json"),
    `${JSON.stringify({ version: 2, subjects: [], invites: [], sessions: [], usage: [] })}\n`,
  );
  await assert.rejects(
    planBuilderSubjectMinimization({
      storeDir: incompatible,
      subjectId: SUBJECT_A,
    }),
    (error) => error instanceof BuilderStoreUnavailable,
  );
});

function journalEventId(journalPath: string): string {
  return JSON.parse(readFileSync(journalPath, "utf8")).events[0].id;
}

test.after(() => {
  rmSync(tempRoot, { recursive: true, force: true });
});
