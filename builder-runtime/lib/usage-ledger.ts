import { randomBytes } from "node:crypto";

import {
  withBuilderIdentityStore,
  type BuilderUsageRecord,
} from "./identity-store.ts";

export type BuilderGenerationLimits = Readonly<{
  windowSeconds: number;
  reservationLeaseSeconds: number;
  requestReserveMicros: number;
  subjectRequests: number;
  globalRequests: number;
  subjectConcurrency: number;
  globalConcurrency: number;
  subjectSpendMicros: number;
  globalSpendMicros: number;
}>;

export type BuilderUsageDenialCode =
  | "duplicate"
  | "subject_requests"
  | "global_requests"
  | "subject_concurrency"
  | "global_concurrency"
  | "subject_spend"
  | "global_spend";

export type BuilderUsageReservation =
  | {
      ok: true;
      record: BuilderUsageRecord;
    }
  | {
      ok: false;
      code: BuilderUsageDenialCode;
      retryAfterSeconds: number | null;
      existing?: BuilderUsageRecord;
    };

export type BuilderUsageSettlement =
  | "succeeded"
  | "failed"
  | "unknown";

function nowIso(now: Date): string {
  return now.toISOString();
}

function newUsageId(): string {
  return `use_${randomBytes(12).toString("hex")}`;
}

function newGenerationId(): string {
  return `gen_${randomBytes(12).toString("hex")}`;
}

export function effectiveUsageCostMicros(record: BuilderUsageRecord): number {
  const reserved = Math.max(
    0,
    record.reservedCostMicros ?? record.costMicros ?? 0,
  );
  if (record.state === "failed") return 0;
  if (record.state === "succeeded") {
    return Math.max(0, record.costMicros ?? reserved);
  }
  return Math.max(0, record.costMicros ?? reserved);
}

export function usageRecordIsActiveReservation(
  record: BuilderUsageRecord,
  now: Date = new Date(),
): boolean {
  if (record.state !== "reserved") return false;
  const lease = record.leaseExpiresAt
    ? Date.parse(record.leaseExpiresAt)
    : Date.parse(record.recordedAt) +
      (Number.isFinite(Date.parse(record.recordedAt)) ? 300_000 : 0);
  return !Number.isFinite(lease) || lease > now.getTime();
}

function expireStaleReservations(
  usage: BuilderUsageRecord[],
  now: Date,
  leaseSeconds: number,
): boolean {
  let changed = false;
  const fallbackLeaseMs = leaseSeconds * 1000;
  for (const record of usage) {
    if (record.state !== "reserved") continue;
    const recordedAt = Date.parse(record.recordedAt);
    const lease = record.leaseExpiresAt
      ? Date.parse(record.leaseExpiresAt)
      : Number.isFinite(recordedAt)
        ? recordedAt + fallbackLeaseMs
        : Number.NaN;
    if (Number.isFinite(lease) && lease > now.getTime()) continue;
    const reserved = Math.max(
      0,
      record.reservedCostMicros ?? record.costMicros ?? 0,
    );
    record.state = "unknown";
    record.costMicros = reserved;
    record.settledAt = nowIso(now);
    record.settlementReason = "reservation_lease_expired";
    changed = true;
  }
  return changed;
}

function requestRetryAfterSeconds(
  usage: readonly BuilderUsageRecord[],
  now: Date,
  windowSeconds: number,
): number {
  const windowStart = now.getTime() - windowSeconds * 1000;
  let oldest = Number.POSITIVE_INFINITY;
  for (const record of usage) {
    const at = Date.parse(record.recordedAt);
    if (!Number.isFinite(at) || at < windowStart) continue;
    oldest = Math.min(oldest, at);
  }
  if (!Number.isFinite(oldest)) return 1;
  return Math.max(
    1,
    Math.ceil((oldest + windowSeconds * 1000 - now.getTime()) / 1000),
  );
}

function concurrencyRetryAfterSeconds(
  usage: readonly BuilderUsageRecord[],
  now: Date,
): number {
  let soonest = Number.POSITIVE_INFINITY;
  for (const record of usage) {
    if (!usageRecordIsActiveReservation(record, now)) continue;
    const lease = record.leaseExpiresAt
      ? Date.parse(record.leaseExpiresAt)
      : Number.NaN;
    if (Number.isFinite(lease)) soonest = Math.min(soonest, lease);
  }
  if (!Number.isFinite(soonest)) return 5;
  return Math.min(
    60,
    Math.max(1, Math.ceil((soonest - now.getTime()) / 1000)),
  );
}

/**
 * Atomically checks idempotency, rolling request limits, active concurrency and
 * lifetime spend caps, then appends one reserved usage record.
 *
 * A duplicate request key returns the existing record and never creates a
 * second charge. A denial does not create a record. Stale reservations become
 * `unknown` so they stop occupying concurrency while preserving exposure.
 */
export async function reserveBuilderUsage(input: {
  storeDir: string;
  subjectId: string;
  sessionId: string;
  requestKey: string;
  limits: BuilderGenerationLimits;
  now?: Date;
}): Promise<BuilderUsageReservation> {
  const now = input.now ?? new Date();
  const requestKey = input.requestKey.trim().slice(0, 160);
  if (!requestKey) throw new Error("A generation idempotency key is required.");
  const windowStart = now.getTime() - input.limits.windowSeconds * 1000;

  return withBuilderIdentityStore(input.storeDir, (store) => {
    expireStaleReservations(
      store.usage,
      now,
      input.limits.reservationLeaseSeconds,
    );

    const existing = store.usage.find(
      (record) =>
        record.subjectId === input.subjectId &&
        record.sessionId === input.sessionId &&
        record.requestKey === requestKey,
    );
    if (existing) {
      return {
        ok: false as const,
        code: "duplicate" as const,
        retryAfterSeconds: null,
        existing,
      };
    }

    const subjectRecords = store.usage.filter(
      (record) => record.subjectId === input.subjectId,
    );
    const subjectWindow = subjectRecords.filter(
      (record) => Date.parse(record.recordedAt) >= windowStart,
    );
    const globalWindow = store.usage.filter(
      (record) => Date.parse(record.recordedAt) >= windowStart,
    );

    if (subjectWindow.length >= input.limits.subjectRequests) {
      return {
        ok: false as const,
        code: "subject_requests" as const,
        retryAfterSeconds: requestRetryAfterSeconds(
          subjectWindow,
          now,
          input.limits.windowSeconds,
        ),
      };
    }
    if (globalWindow.length >= input.limits.globalRequests) {
      return {
        ok: false as const,
        code: "global_requests" as const,
        retryAfterSeconds: requestRetryAfterSeconds(
          globalWindow,
          now,
          input.limits.windowSeconds,
        ),
      };
    }

    const subjectActive = subjectRecords.filter((record) =>
      usageRecordIsActiveReservation(record, now),
    );
    const globalActive = store.usage.filter((record) =>
      usageRecordIsActiveReservation(record, now),
    );
    if (subjectActive.length >= input.limits.subjectConcurrency) {
      return {
        ok: false as const,
        code: "subject_concurrency" as const,
        retryAfterSeconds: concurrencyRetryAfterSeconds(subjectActive, now),
      };
    }
    if (globalActive.length >= input.limits.globalConcurrency) {
      return {
        ok: false as const,
        code: "global_concurrency" as const,
        retryAfterSeconds: concurrencyRetryAfterSeconds(globalActive, now),
      };
    }

    const subjectSpend = subjectRecords.reduce(
      (total, record) => total + effectiveUsageCostMicros(record),
      0,
    );
    const globalSpend = store.usage.reduce(
      (total, record) => total + effectiveUsageCostMicros(record),
      0,
    );
    if (
      subjectSpend + input.limits.requestReserveMicros >
      input.limits.subjectSpendMicros
    ) {
      return {
        ok: false as const,
        code: "subject_spend" as const,
        retryAfterSeconds: null,
      };
    }
    if (
      globalSpend + input.limits.requestReserveMicros >
      input.limits.globalSpendMicros
    ) {
      return {
        ok: false as const,
        code: "global_spend" as const,
        retryAfterSeconds: null,
      };
    }

    const record: BuilderUsageRecord = {
      id: newUsageId(),
      subjectId: input.subjectId,
      sessionId: input.sessionId,
      generationId: newGenerationId(),
      requestKey,
      recordedAt: nowIso(now),
      state: "reserved",
      costMicros: input.limits.requestReserveMicros,
      reservedCostMicros: input.limits.requestReserveMicros,
      leaseExpiresAt: new Date(
        now.getTime() + input.limits.reservationLeaseSeconds * 1000,
      ).toISOString(),
    };
    store.usage.push(record);
    return { ok: true as const, record };
  });
}

/**
 * Idempotent settlement. Only a `reserved` record can transition. Repeating a
 * settlement (same or different outcome) returns the existing final record.
 * If reported actual cost exceeds the reservation, the record stays unknown at
 * the reserved exposure instead of silently understating or exceeding the cap.
 */
export async function settleBuilderUsage(input: {
  storeDir: string;
  usageId: string;
  outcome: BuilderUsageSettlement;
  costMicros?: number | null;
  reason?: string;
  now?: Date;
}): Promise<{ changed: boolean; record: BuilderUsageRecord }> {
  const now = input.now ?? new Date();
  return withBuilderIdentityStore(input.storeDir, (store) => {
    const record = store.usage.find((item) => item.id === input.usageId);
    if (!record) throw new Error("Builder usage reservation was not found.");
    if (record.state !== "reserved") {
      return { changed: false, record };
    }

    const reserved = Math.max(
      0,
      record.reservedCostMicros ?? record.costMicros ?? 0,
    );
    const requestedCost =
      input.costMicros === undefined ||
      input.costMicros === null ||
      !Number.isFinite(input.costMicros)
        ? reserved
        : Math.max(0, Math.trunc(input.costMicros));

    if (input.outcome === "failed") {
      record.state = "failed";
      record.costMicros = 0;
      record.settlementReason = input.reason ?? "failed";
    } else if (input.outcome === "unknown") {
      record.state = "unknown";
      record.costMicros = reserved;
      record.settlementReason = input.reason ?? "unknown";
    } else if (requestedCost > reserved) {
      record.state = "unknown";
      record.costMicros = reserved;
      record.settlementReason = "actual_cost_exceeded_reservation";
    } else {
      record.state = "succeeded";
      record.costMicros = requestedCost;
      record.settlementReason = input.reason ?? "succeeded";
    }
    record.settledAt = nowIso(now);
    return { changed: true, record };
  });
}

/**
 * Operator-authorized correction for an ambiguous charge. Only `unknown`
 * records can be reconciled. This is the only path allowed to replace the
 * reserved exposure with an externally reviewed actual cost.
 */
export async function reconcileBuilderUsage(input: {
  storeDir: string;
  usageId: string;
  outcome: "succeeded" | "failed";
  costMicros?: number | null;
  reason: string;
  now?: Date;
}): Promise<{ changed: boolean; record: BuilderUsageRecord }> {
  const now = input.now ?? new Date();
  return withBuilderIdentityStore(input.storeDir, (store) => {
    const record = store.usage.find((item) => item.id === input.usageId);
    if (!record) throw new Error("Builder usage record was not found.");
    if (record.state !== "unknown") {
      return { changed: false, record };
    }
    const reserved = Math.max(
      0,
      record.reservedCostMicros ?? record.costMicros ?? 0,
    );
    if (input.outcome === "failed") {
      record.state = "failed";
      record.costMicros = 0;
    } else {
      record.state = "succeeded";
      record.costMicros =
        input.costMicros === undefined ||
        input.costMicros === null ||
        !Number.isFinite(input.costMicros)
          ? reserved
          : Math.max(0, Math.trunc(input.costMicros));
    }
    record.reconciledAt = nowIso(now);
    record.settledAt = record.settledAt ?? nowIso(now);
    record.settlementReason = input.reason.slice(0, 240);
    return { changed: true, record };
  });
}
