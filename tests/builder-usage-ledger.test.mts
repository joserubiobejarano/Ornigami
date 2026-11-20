import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  BuilderStoreUnavailable,
  readBuilderIdentityStore,
} from "../builder-runtime/lib/identity-store.ts";
import {
  effectiveUsageCostMicros,
  reconcileBuilderUsage,
  reserveBuilderUsage,
  settleBuilderUsage,
  type BuilderGenerationLimits,
} from "../builder-runtime/lib/usage-ledger.ts";

const root = process.cwd();
const tempRoot = path.join(root, ".local", "test-usage-ledger");
rmSync(tempRoot, { recursive: true, force: true });
mkdirSync(tempRoot, { recursive: true });

function storeDir(name: string): string {
  return mkdtempSync(path.join(tempRoot, `${name}-`));
}

function limits(
  overrides: Partial<BuilderGenerationLimits> = {},
): BuilderGenerationLimits {
  return {
    windowSeconds: 3_600,
    reservationLeaseSeconds: 60,
    requestReserveMicros: 50_000,
    subjectRequests: 100,
    globalRequests: 1_000,
    subjectConcurrency: 10,
    globalConcurrency: 20,
    subjectSpendMicros: 1_000_000,
    globalSpendMicros: 2_000_000,
    ...overrides,
  };
}

async function reserve(
  dir: string,
  subjectId: string,
  sessionId: string,
  requestKey: string,
  limitConfig: BuilderGenerationLimits = limits(),
  now?: Date,
) {
  return reserveBuilderUsage({
    storeDir: dir,
    subjectId,
    sessionId,
    requestKey,
    limits: limitConfig,
    ...(now ? { now } : {}),
  });
}

test("a reservation is unique per request key and settlement is idempotent", async () => {
  const dir = storeDir("idempotent");
  const first = await reserve(dir, "sub_a", "ses_a", "request-1");
  assert.equal(first.ok, true);
  if (!first.ok) return;
  assert.equal(first.record.state, "reserved");
  assert.equal(first.record.costMicros, 50_000);

  const duplicate = await reserve(dir, "sub_a", "ses_a", "request-1");
  assert.equal(duplicate.ok, false);
  if (!duplicate.ok) {
    assert.equal(duplicate.code, "duplicate");
    assert.equal(duplicate.existing?.id, first.record.id);
  }

  const settled = await settleBuilderUsage({
    storeDir: dir,
    usageId: first.record.id,
    outcome: "succeeded",
    costMicros: 40_000,
    reason: "generated",
  });
  assert.equal(settled.changed, true);
  assert.equal(settled.record.state, "succeeded");
  assert.equal(settled.record.costMicros, 40_000);

  const repeated = await settleBuilderUsage({
    storeDir: dir,
    usageId: first.record.id,
    outcome: "succeeded",
    costMicros: 40_000,
    reason: "retry",
  });
  assert.equal(repeated.changed, false);
  assert.equal(repeated.record.costMicros, 40_000);

  const store = await readBuilderIdentityStore(dir);
  assert.equal(store.usage.length, 1);
  assert.equal(effectiveUsageCostMicros(store.usage[0]), 40_000);
});

test("concurrent reservations cannot exceed the active concurrency cap", async () => {
  const dir = storeDir("concurrency");
  const cap = limits({
    subjectConcurrency: 3,
    globalConcurrency: 3,
    subjectRequests: 100,
  });
  const attempts = await Promise.all(
    Array.from({ length: 20 }, (_, index) =>
      reserve(dir, "sub_a", "ses_a", `concurrent-${index}`, cap),
    ),
  );
  const allowed = attempts.filter((attempt) => attempt.ok);
  const denied = attempts.filter((attempt) => !attempt.ok);
  assert.equal(allowed.length, 3);
  assert.equal(denied.length, 17);
  for (const result of denied) {
    if (!result.ok) assert.equal(result.code, "subject_concurrency");
  }
  const store = await readBuilderIdentityStore(dir);
  assert.equal(store.usage.filter((record) => record.state === "reserved").length, 3);
});

test("concurrent reservations cannot cross the spend cap", async () => {
  const dir = storeDir("spend-race");
  const cap = limits({
    requestReserveMicros: 60_000,
    subjectSpendMicros: 100_000,
    globalSpendMicros: 1_000_000,
    subjectConcurrency: 10,
    globalConcurrency: 10,
  });
  const attempts = await Promise.all(
    Array.from({ length: 10 }, (_, index) =>
      reserve(dir, "sub_a", "ses_a", `spend-${index}`, cap),
    ),
  );
  const allowed = attempts.filter((attempt) => attempt.ok);
  assert.equal(allowed.length, 1);
  const reserved = await readBuilderIdentityStore(dir);
  const spend = reserved.usage.reduce(
    (total, record) => total + effectiveUsageCostMicros(record),
    0,
  );
  assert.equal(spend, 60_000);

  const next = await reserve(dir, "sub_a", "ses_a", "spend-next", cap);
  assert.equal(next.ok, false);
  if (!next.ok) assert.equal(next.code, "subject_spend");
});

test("request windows and global request caps are enforced atomically", async () => {
  const dir = storeDir("requests");
  const subjectCap = limits({ subjectRequests: 3, globalRequests: 100 });
  const subjectAttempts = await Promise.all(
    Array.from({ length: 5 }, (_, index) =>
      reserve(dir, "sub_a", "ses_a", `subject-${index}`, subjectCap),
    ),
  );
  assert.equal(subjectAttempts.filter((attempt) => attempt.ok).length, 3);
  assert.equal(
    subjectAttempts.filter(
      (attempt) => !attempt.ok && attempt.code === "subject_requests",
    ).length,
    2,
  );

  const globalDir = storeDir("global-requests");
  const globalCap = limits({ subjectRequests: 100, globalRequests: 2 });
  const first = await reserve(globalDir, "sub_a", "ses_a", "global-a", globalCap);
  const second = await reserve(globalDir, "sub_b", "ses_b", "global-b", globalCap);
  const third = await reserve(globalDir, "sub_c", "ses_c", "global-c", globalCap);
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(third.ok, false);
  if (!third.ok) assert.equal(third.code, "global_requests");
});

test("unknown outcomes remain reserved until an operator reconciles them", async () => {
  const dir = storeDir("unknown");
  const reservation = await reserve(dir, "sub_a", "ses_a", "unknown-1");
  assert.equal(reservation.ok, true);
  if (!reservation.ok) return;

  const unknown = await settleBuilderUsage({
    storeDir: dir,
    usageId: reservation.record.id,
    outcome: "unknown",
    reason: "timeout",
  });
  assert.equal(unknown.record.state, "unknown");
  assert.equal(unknown.record.costMicros, 50_000);

  const lateSuccess = await settleBuilderUsage({
    storeDir: dir,
    usageId: reservation.record.id,
    outcome: "succeeded",
    costMicros: 10_000,
  });
  assert.equal(lateSuccess.changed, false);
  assert.equal(lateSuccess.record.costMicros, 50_000);

  const reconciled = await reconcileBuilderUsage({
    storeDir: dir,
    usageId: reservation.record.id,
    outcome: "succeeded",
    costMicros: 27_000,
    reason: "provider invoice",
  });
  assert.equal(reconciled.changed, true);
  assert.equal(reconciled.record.state, "succeeded");
  assert.equal(reconciled.record.costMicros, 27_000);
  assert.equal(reconciled.record.reconciledAt !== undefined, true);

  const repeated = await reconcileBuilderUsage({
    storeDir: dir,
    usageId: reservation.record.id,
    outcome: "failed",
    reason: "duplicate correction",
  });
  assert.equal(repeated.changed, false);
  assert.equal(repeated.record.costMicros, 27_000);
});

test("stale reservations become unknown and free concurrency without hiding spend", async () => {
  const dir = storeDir("stale");
  const cap = limits({
    reservationLeaseSeconds: 30,
    subjectConcurrency: 1,
    globalConcurrency: 1,
  });
  const started = new Date("2026-11-20T10:00:00.000Z");
  const first = await reserve(dir, "sub_a", "ses_a", "stale-1", cap, started);
  assert.equal(first.ok, true);

  const duringLease = await reserve(
    dir,
    "sub_a",
    "ses_a",
    "stale-2",
    cap,
    new Date("2026-11-20T10:00:10.000Z"),
  );
  assert.equal(duringLease.ok, false);
  if (!duringLease.ok) assert.equal(duringLease.code, "subject_concurrency");

  const afterLease = await reserve(
    dir,
    "sub_a",
    "ses_a",
    "stale-3",
    cap,
    new Date("2026-11-20T10:00:31.000Z"),
  );
  assert.equal(afterLease.ok, true);

  const store = await readBuilderIdentityStore(dir);
  const firstRecord = store.usage.find((record) => record.id === (first.ok ? first.record.id : ""));
  assert.equal(firstRecord?.state, "unknown");
  assert.equal(firstRecord?.costMicros, 50_000);
  assert.equal(firstRecord?.settlementReason, "reservation_lease_expired");
  const spend = store.usage.reduce(
    (total, record) => total + effectiveUsageCostMicros(record),
    0,
  );
  assert.equal(spend, 100_000);
});

test("an over-reservation actual cost stays unknown at the reserved exposure", async () => {
  const dir = storeDir("over-reservation");
  const reservation = await reserve(dir, "sub_a", "ses_a", "over-1", limits({
    requestReserveMicros: 50_000,
  }));
  assert.equal(reservation.ok, true);
  if (!reservation.ok) return;
  const settled = await settleBuilderUsage({
    storeDir: dir,
    usageId: reservation.record.id,
    outcome: "succeeded",
    costMicros: 75_000,
  });
  assert.equal(settled.record.state, "unknown");
  assert.equal(settled.record.costMicros, 50_000);
  assert.equal(settled.record.settlementReason, "actual_cost_exceeded_reservation");
});

test("a corrupt or unavailable ledger fails closed", async () => {
  const filePath = path.join(tempRoot, "not-a-directory");
  writeFileSync(filePath, "not a store directory");
  await assert.rejects(
    reserve(filePath, "sub_a", "ses_a", "broken-1"),
    (error) => error instanceof BuilderStoreUnavailable,
  );

  const corrupt = storeDir("corrupt");
  writeFileSync(path.join(corrupt, "identity-store.json"), "{not json");
  await assert.rejects(
    reserve(corrupt, "sub_a", "ses_a", "broken-2"),
    (error) => error instanceof BuilderStoreUnavailable,
  );
});

test("accounting survives a fresh read of the same store", async () => {
  const dir = storeDir("restart");
  const reservation = await reserve(dir, "sub_a", "ses_a", "restart-1", limits({
    subjectRequests: 1,
  }));
  assert.equal(reservation.ok, true);
  if (!reservation.ok) return;
  await settleBuilderUsage({
    storeDir: dir,
    usageId: reservation.record.id,
    outcome: "succeeded",
    costMicros: 30_000,
  });

  const afterRestart = await readBuilderIdentityStore(dir);
  assert.equal(afterRestart.usage.length, 1);
  assert.equal(afterRestart.usage[0].state, "succeeded");
  assert.equal(afterRestart.usage[0].costMicros, 30_000);

  const denied = await reserve(dir, "sub_a", "ses_a", "restart-2", limits({
    subjectRequests: 1,
  }));
  assert.equal(denied.ok, false);
  if (!denied.ok) assert.equal(denied.code, "subject_requests");
});

test.after(() => {
  rmSync(tempRoot, { recursive: true, force: true });
});
