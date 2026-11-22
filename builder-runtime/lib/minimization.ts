import { createHash, randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  BUILDER_MINIMIZED_LABEL,
  BUILDER_MINIMIZED_TOKEN_HASH,
  BUILDER_MINIMIZATION_JOURNAL_VERSION,
  BuilderStoreUnavailable,
  assertBuilderStoreReplayReady,
  builderMinimizationIntentFromEvent,
  builderMinimizationJournalHasPending,
  canonicalBuilderJson,
  computeBuilderMinimizationIntentDigest,
  hashBuilderCanonicalJson,
  readBuilderIdentityStoreSnapshot,
  readBuilderMinimizationJournalUnlocked,
  readBuilderRestoreReplayGate,
  readBuilderRestoreReplayReceiptHistory,
  removeBuilderRestoreReplayGate,
  serializeBuilderIdentityStore,
  validBuilderMinimizationAccountingSnapshot,
  validBuilderMinimizationEffects,
  validBuilderMinimizationJournal,
  validBuilderMinimizationSummary,
  withBuilderIdentityStoreFiles,
  withBuilderStoreRawLock,
  writeBuilderIdentityStore,
  writeBuilderMinimizationJournalUnlocked,
  writeBuilderRestoreReplayGateUnlocked,
  writeBuilderRestoreReplayReceiptUnlocked,
  type BuilderIdentityStore,
  type BuilderMinimizationAccountingSnapshot,
  type BuilderMinimizationAffectedRecords,
  type BuilderMinimizationCategory,
  type BuilderMinimizationEffects,
  type BuilderMinimizationIntent,
  type BuilderMinimizationJournal,
  type BuilderMinimizationJournalEvent,
  type BuilderMinimizationSummary,
  type BuilderRestoreReplayCommitment,
  type BuilderRestoreReplayGate,
  type BuilderRestoreReplayReceipt,
} from "./identity-store.ts";
import { effectiveUsageCostMicros } from "./usage-ledger.ts";

export type BuilderMinimizationRejectionCode =
  | "invalid_plan"
  | "invalid_journal"
  | "stale_plan"
  | "incompatible_store"
  | "subject_missing"
  | "pending_journal"
  | "restore_pending"
  | "incomplete_replay"
  | "replay_conflict";

export class BuilderMinimizationRejected extends Error {
  readonly code: BuilderMinimizationRejectionCode;

  constructor(code: BuilderMinimizationRejectionCode, message: string) {
    super(message);
    this.name = "BuilderMinimizationRejected";
    this.code = code;
  }
}

export type BuilderSubjectMinimizationPlan = Readonly<{
  version: 1;
  kind: "builder-subject-minimization";
  planId: string;
  subjectId: string;
  storeHash: string;
  expectedResultHash: string;
  createdAt: string;
  effectAt: string;
  effects: BuilderMinimizationEffects;
  affected: BuilderMinimizationAffectedRecords;
  summary: BuilderMinimizationSummary;
  accounting: BuilderMinimizationAccountingSnapshot;
  expectedAccounting: BuilderMinimizationAccountingSnapshot;
}>;

export type BuilderSubjectMinimizationReceipt = Readonly<{
  version: 1;
  kind: "builder-subject-minimization";
  planId: string;
  subjectId: string;
  eventId: string | null;
  status: "applied" | "already_applied" | "no_change";
  changed: boolean;
  storeBeforeHash: string;
  storeAfterHash: string;
  accountingBefore: BuilderMinimizationAccountingSnapshot;
  accountingAfter: BuilderMinimizationAccountingSnapshot;
  summary: BuilderMinimizationSummary;
  appliedAt: string;
}>;

export type BuilderSubjectMinimizationReplayInput = Readonly<{
  storeDir: string;
  journalPath: string;
  now?: Date;
  lockWaitMs?: number;
  /**
   * Replay the journal but leave the restore gate in place. Admission remains
   * closed until a separate authoritative reconciliation releases it.
   */
  keepGateClosed?: boolean;
  /**
   * Test-only, requires BUILDER_RUNTIME_ALLOW_TEST_HOOKS=1. It simulates a
   * process death at a named durability boundary.
   */
  testAbortAfter?:
    | "gate_closed"
    | "gate_prepared"
    | "store_written"
    | "journal_written"
    | "receipt_written"
    | "gate_removed";
}>;

const HASH_PATTERN = /^[a-f0-9]{64}$/;
const CATEGORY_VALUES = new Set<BuilderMinimizationCategory>([
  "subject.revoke",
  "subject.label",
  "invite.revoke",
  "invite.label",
  "invite.token_hash",
  "session.revoke",
  "session.token_hash",
  "usage.preserve",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  required: readonly string[],
): boolean {
  return (
    required.every((key) => key in value) &&
    Object.keys(value).every((key) => required.includes(key))
  );
}

function boundedId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 160 &&
    /^[A-Za-z0-9_.:-]+$/.test(value)
  );
}

function validDate(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function validHash(value: unknown): value is string {
  return typeof value === "string" && HASH_PATTERN.test(value);
}

function hashBytes(bytes: Buffer | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function nowIso(now: Date): string {
  return now.toISOString();
}

function reject(
  code: BuilderMinimizationRejectionCode,
  message: string,
): never {
  throw new BuilderMinimizationRejected(code, message);
}

function testAbort(marker: string): void {
  if (
    process.env.BUILDER_RUNTIME_ALLOW_TEST_HOOKS === "1" &&
    process.env.BUILDER_MINIMIZATION_TEST_ABORT_AFTER === marker
  ) {
    throw new Error(`simulated interruption after ${marker}`);
  }
}

export function computeBuilderMinimizationAccounting(
  store: BuilderIdentityStore,
): BuilderMinimizationAccountingSnapshot {
  let requestKeys = 0;
  let reservedRecords = 0;
  let succeededRecords = 0;
  let failedRecords = 0;
  let unknownRecords = 0;
  let settledCostMicros = 0;
  let reservedCostMicros = 0;
  let unknownCostMicros = 0;
  let effectiveCostMicros = 0;

  for (const record of store.usage) {
    if (record.requestKey !== undefined) requestKeys += 1;
    const effective = effectiveUsageCostMicros(record);
    effectiveCostMicros += effective;
    if (record.state === "reserved") {
      reservedRecords += 1;
      reservedCostMicros += effective;
    } else if (record.state === "succeeded") {
      succeededRecords += 1;
      settledCostMicros += effective;
    } else if (record.state === "failed") {
      failedRecords += 1;
    } else if (record.state === "unknown") {
      unknownRecords += 1;
      unknownCostMicros += effective;
    }
  }

  return {
    usageRecords: store.usage.length,
    requestKeys,
    reservedRecords,
    succeededRecords,
    failedRecords,
    unknownRecords,
    settledCostMicros,
    reservedCostMicros,
    unknownCostMicros,
    effectiveCostMicros,
    usageHash: hashBytes(JSON.stringify(store.usage)),
  };
}

/**
 * The accounting relationships that must survive a minimisation or a restore
 * replay. A missing subject/session or duplicate idempotency key is treated as
 * incompatible evidence rather than repaired silently.
 */
export function verifyBuilderAccountingRelationships(
  store: BuilderIdentityStore,
): string[] {
  const errors: string[] = [];
  const subjectIds = new Set<string>();
  for (const subject of store.subjects) {
    if (!boundedId(subject.id)) errors.push("invalid_subject_id");
    else if (subjectIds.has(subject.id)) errors.push("duplicate_subject_id");
    subjectIds.add(subject.id);
  }

  const sessionById = new Map<string, string>();
  for (const session of store.sessions) {
    if (!boundedId(session.id)) errors.push("invalid_session_id");
    else if (sessionById.has(session.id)) errors.push("duplicate_session_id");
    sessionById.set(session.id, session.subjectId);
    if (!subjectIds.has(session.subjectId)) errors.push("session_subject_missing");
  }

  const inviteIds = new Set<string>();
  for (const invite of store.invites) {
    if (!boundedId(invite.id)) errors.push("invalid_invite_id");
    else if (inviteIds.has(invite.id)) errors.push("duplicate_invite_id");
    inviteIds.add(invite.id);
    if (!subjectIds.has(invite.subjectId)) errors.push("invite_subject_missing");
  }

  const usageIds = new Set<string>();
  const requestKeys = new Set<string>();
  for (const record of store.usage) {
    if (!boundedId(record.id)) errors.push("invalid_usage_id");
    else if (usageIds.has(record.id)) errors.push("duplicate_usage_id");
    usageIds.add(record.id);
    if (!subjectIds.has(record.subjectId)) errors.push("usage_subject_missing");
    const sessionSubject = sessionById.get(record.sessionId);
    if (sessionSubject === undefined) errors.push("usage_session_missing");
    else if (sessionSubject !== record.subjectId) {
      errors.push("usage_session_subject_mismatch");
    }
    if (!validDate(record.recordedAt)) errors.push("usage_recorded_at_invalid");
    if (
      record.costMicros !== null &&
      (!Number.isSafeInteger(record.costMicros) || record.costMicros < 0)
    ) {
      errors.push("usage_cost_invalid");
    }
    if (
      record.reservedCostMicros !== undefined &&
      (!Number.isSafeInteger(record.reservedCostMicros) ||
        record.reservedCostMicros < 0)
    ) {
      errors.push("usage_reserved_cost_invalid");
    }
    if (record.requestKey !== undefined) {
      const key = `${record.subjectId}\u0000${record.sessionId}\u0000${record.requestKey}`;
      if (requestKeys.has(key)) errors.push("duplicate_request_key");
      requestKeys.add(key);
    }
  }

  return errors;
}

function assertAccountingRelationships(store: BuilderIdentityStore): void {
  const errors = verifyBuilderAccountingRelationships(store);
  if (errors.length > 0) {
    throw new BuilderMinimizationRejected(
      "incompatible_store",
      `Builder accounting relationships are inconsistent (${errors.join(", ")}).`,
    );
  }
}

function assertAccountingPreserved(
  before: BuilderMinimizationAccountingSnapshot,
  after: BuilderMinimizationAccountingSnapshot,
): void {
  if (canonicalBuilderJson(before) !== canonicalBuilderJson(after)) {
    throw new BuilderMinimizationRejected(
      "incompatible_store",
      "Minimisation/replay would change usage accounting; refusing to continue.",
    );
  }
}

function categoriesForSubject(
  effect: BuilderMinimizationEffects["subject"],
): BuilderMinimizationCategory[] {
  const categories: BuilderMinimizationCategory[] = [];
  if (effect.revoke) categories.push("subject.revoke");
  if (effect.minimizeLabel) categories.push("subject.label");
  return categories;
}

function categoriesForInvite(
  effect: BuilderMinimizationEffects["invites"][number],
): BuilderMinimizationCategory[] {
  const categories: BuilderMinimizationCategory[] = [];
  if (effect.revoke) categories.push("invite.revoke");
  if (effect.minimizeLabel) categories.push("invite.label");
  if (effect.minimizeToken) categories.push("invite.token_hash");
  return categories;
}

function categoriesForSession(
  effect: BuilderMinimizationEffects["sessions"][number],
): BuilderMinimizationCategory[] {
  const categories: BuilderMinimizationCategory[] = [];
  if (effect.revoke) categories.push("session.revoke");
  if (effect.minimizeToken) categories.push("session.token_hash");
  return categories;
}

export function describeBuilderSubjectMinimization(
  effects: BuilderMinimizationEffects,
): BuilderMinimizationAffectedRecords {
  return {
    subject: {
      id: effects.subject.id,
      categories: categoriesForSubject(effects.subject),
    },
    invites: effects.invites.map((effect) => ({
      id: effect.id,
      categories: categoriesForInvite(effect),
    })),
    sessions: effects.sessions.map((effect) => ({
      id: effect.id,
      categories: categoriesForSession(effect),
    })),
    usage: {
      ids: [...effects.usageIds],
      categories: ["usage.preserve"],
    },
  };
}

function summarizeEffects(
  effects: BuilderMinimizationEffects,
): BuilderMinimizationSummary {
  return {
    subjectsAffected: 1,
    invitesAffected: effects.invites.length,
    sessionsAffected: effects.sessions.length,
    inviteRevocations: effects.invites.filter((effect) => effect.revoke).length,
    sessionRevocations: effects.sessions.filter((effect) => effect.revoke).length,
    labelsMinimized:
      (effects.subject.minimizeLabel ? 1 : 0) +
      effects.invites.filter((effect) => effect.minimizeLabel).length,
    tokensMinimized:
      effects.invites.filter((effect) => effect.minimizeToken).length +
      effects.sessions.filter((effect) => effect.minimizeToken).length,
    usageRecordsPreserved: effects.usageIds.length,
  };
}

function buildEffects(
  store: BuilderIdentityStore,
  subjectId: string,
): BuilderMinimizationEffects {
  const subject = store.subjects.find((item) => item.id === subjectId);
  if (!subject) {
    throw new BuilderMinimizationRejected(
      "subject_missing",
      "The requested builder subject does not exist.",
    );
  }
  const invites = store.invites.filter((invite) => invite.subjectId === subjectId);
  const sessions = store.sessions.filter((session) => session.subjectId === subjectId);
  return {
    subject: {
      id: subject.id,
      revoke: !subject.revokedAt,
      minimizeLabel: subject.label !== BUILDER_MINIMIZED_LABEL,
    },
    invites: invites.map((invite) => ({
      id: invite.id,
      revoke: !invite.usedAt && !invite.revokedAt,
      minimizeLabel: invite.label !== BUILDER_MINIMIZED_LABEL,
      minimizeToken: invite.tokenHash !== BUILDER_MINIMIZED_TOKEN_HASH,
    })),
    sessions: sessions.map((session) => ({
      id: session.id,
      revoke: !session.revokedAt,
      minimizeToken: session.tokenHash !== BUILDER_MINIMIZED_TOKEN_HASH,
    })),
    usageIds: store.usage
      .filter((record) => record.subjectId === subjectId)
      .map((record) => record.id),
  };
}

function applyPlanEffects(
  store: BuilderIdentityStore,
  effects: BuilderMinimizationEffects,
  effectAt: string,
): void {
  const subject = store.subjects.find((item) => item.id === effects.subject.id);
  if (!subject) {
    throw new BuilderMinimizationRejected(
      "incompatible_store",
      "The plan subject disappeared from the store.",
    );
  }
  if (effects.subject.revoke && !subject.revokedAt) subject.revokedAt = effectAt;
  if (effects.subject.minimizeLabel) subject.label = BUILDER_MINIMIZED_LABEL;

  for (const effect of effects.invites) {
    const invite = store.invites.find((item) => item.id === effect.id);
    if (!invite || invite.subjectId !== effects.subject.id) {
      throw new BuilderMinimizationRejected(
        "incompatible_store",
        "A planned invite is missing or belongs to another subject.",
      );
    }
    if (effect.revoke && !invite.revokedAt) invite.revokedAt = effectAt;
    if (effect.minimizeLabel) invite.label = BUILDER_MINIMIZED_LABEL;
    if (effect.minimizeToken) invite.tokenHash = BUILDER_MINIMIZED_TOKEN_HASH;
  }

  for (const effect of effects.sessions) {
    const session = store.sessions.find((item) => item.id === effect.id);
    if (!session || session.subjectId !== effects.subject.id) {
      throw new BuilderMinimizationRejected(
        "incompatible_store",
        "A planned session is missing or belongs to another subject.",
      );
    }
    if (effect.revoke && !session.revokedAt) session.revokedAt = effectAt;
    if (effect.minimizeToken) session.tokenHash = BUILDER_MINIMIZED_TOKEN_HASH;
  }
}

function effectsAreSatisfied(
  store: BuilderIdentityStore,
  effects: BuilderMinimizationEffects,
): boolean {
  const projected = structuredClone(store);
  applyPlanEffects(projected, effects, new Date(0).toISOString());
  return (
    serializeBuilderIdentityStore(projected) ===
    serializeBuilderIdentityStore(store)
  );
}

export async function planBuilderSubjectMinimization(input: {
  storeDir: string;
  subjectId: string;
  now?: Date;
  lockWaitMs?: number;
}): Promise<BuilderSubjectMinimizationPlan> {
  const subjectId = input.subjectId.trim();
  if (!subjectId) {
    throw new BuilderMinimizationRejected(
      "invalid_plan",
      "A exact subject id is required for a minimisation plan.",
    );
  }
  const now = input.now ?? new Date();
  return withBuilderIdentityStoreFiles(
    input.storeDir,
    async (transaction) => {
      if ((await readBuilderRestoreReplayGate(transaction.directory)).present) {
        throw new BuilderMinimizationRejected(
          "restore_pending",
          "The store is closed pending restore replay; no new minimisation plan is allowed.",
        );
      }
      if (builderMinimizationJournalHasPending(transaction.journal)) {
        throw new BuilderMinimizationRejected(
          "pending_journal",
          "A pending minimisation journal entry must be completed before a new plan.",
        );
      }
      assertAccountingRelationships(transaction.store);
      const effects = buildEffects(transaction.store, subjectId);
      const accounting = computeBuilderMinimizationAccounting(transaction.store);
      const effectAt = nowIso(now);
      const expectedStore = structuredClone(transaction.store);
      applyPlanEffects(expectedStore, effects, effectAt);
      const expectedResultHash = hashBytes(
        serializeBuilderIdentityStore(expectedStore),
      );
      const expectedAccounting =
        computeBuilderMinimizationAccounting(expectedStore);
      const body = {
        version: 1 as const,
        kind: "builder-subject-minimization" as const,
        subjectId,
        storeHash: transaction.storeHash,
        expectedResultHash,
        createdAt: effectAt,
        effectAt,
        effects,
        affected: describeBuilderSubjectMinimization(effects),
        summary: summarizeEffects(effects),
        accounting,
        expectedAccounting,
      };
      return { ...body, planId: hashBuilderCanonicalJson(body) };
    },
    input.lockWaitMs === undefined ? {} : { lockWaitMs: input.lockWaitMs },
  );
}

function validAffected(
  value: unknown,
): value is BuilderMinimizationAffectedRecords {
  if (!isRecord(value)) return false;
  if (!hasOnlyKeys(value, ["subject", "invites", "sessions", "usage"])) return false;
  if (!isRecord(value.subject)) return false;
  if (!hasOnlyKeys(value.subject, ["id", "categories"])) return false;
  if (!boundedId(value.subject.id) || !Array.isArray(value.subject.categories)) {
    return false;
  }
  if (
    !value.subject.categories.every(
      (item) =>
        typeof item === "string" &&
        CATEGORY_VALUES.has(item as BuilderMinimizationCategory),
    )
  ) {
    return false;
  }
  for (const key of ["invites", "sessions"] as const) {
    const list = value[key];
    if (!Array.isArray(list)) return false;
    for (const item of list) {
      if (!isRecord(item) || !hasOnlyKeys(item, ["id", "categories"])) return false;
      if (!boundedId(item.id) || !Array.isArray(item.categories)) return false;
      if (
        !item.categories.every(
          (category) =>
            typeof category === "string" &&
            CATEGORY_VALUES.has(category as BuilderMinimizationCategory),
        )
      ) {
        return false;
      }
    }
  }
  if (!isRecord(value.usage) || !hasOnlyKeys(value.usage, ["ids", "categories"])) {
    return false;
  }
  if (!Array.isArray(value.usage.ids) || !value.usage.ids.every(boundedId)) {
    return false;
  }
  return (
    Array.isArray(value.usage.categories) &&
    value.usage.categories.length === 1 &&
    value.usage.categories[0] === "usage.preserve"
  );
}

export function parseBuilderSubjectMinimizationPlan(
  input: string | unknown,
): BuilderSubjectMinimizationPlan {
  let value: unknown = input;
  if (typeof input === "string") {
    try {
      value = JSON.parse(input);
    } catch {
      reject("invalid_plan", "The minimisation plan is not valid JSON.");
    }
  }
  if (!isRecord(value)) reject("invalid_plan", "The minimisation plan is not an object.");
  if (
    !hasOnlyKeys(value, [
      "version",
      "kind",
      "planId",
      "subjectId",
      "storeHash",
      "expectedResultHash",
      "createdAt",
      "effectAt",
      "effects",
      "affected",
      "summary",
      "accounting",
      "expectedAccounting",
    ])
  ) {
    reject("invalid_plan", "The minimisation plan has unexpected fields.");
  }
  if (value.version !== 1 || value.kind !== "builder-subject-minimization") {
    reject("invalid_plan", "The minimisation plan version or kind is unsupported.");
  }
  if (!boundedId(value.subjectId)) reject("invalid_plan", "Plan subject id is invalid.");
  if (!validHash(value.planId)) reject("invalid_plan", "Plan id is invalid.");
  if (!validHash(value.storeHash)) reject("invalid_plan", "Plan store hash is invalid.");
  if (!validHash(value.expectedResultHash)) {
    reject("invalid_plan", "Plan expected result hash is invalid.");
  }
  if (!validDate(value.createdAt) || !validDate(value.effectAt)) {
    reject("invalid_plan", "Plan timestamps are invalid.");
  }
  if (!validBuilderMinimizationEffects(value.effects)) {
    reject("invalid_plan", "Plan effects are invalid.");
  }
  if (value.effects.subject.id !== value.subjectId) {
    reject("invalid_plan", "Plan subject id does not match its effects.");
  }
  if (!validAffected(value.affected)) {
    reject("invalid_plan", "Plan affected-record metadata is invalid.");
  }
  if (!validBuilderMinimizationSummary(value.summary)) {
    reject("invalid_plan", "Plan summary is invalid.");
  }
  if (!validBuilderMinimizationAccountingSnapshot(value.accounting)) {
    reject("invalid_plan", "Plan accounting snapshot is invalid.");
  }
  if (!validBuilderMinimizationAccountingSnapshot(value.expectedAccounting)) {
    reject("invalid_plan", "Plan expected accounting snapshot is invalid.");
  }
  const expectedAffected = describeBuilderSubjectMinimization(value.effects);
  if (canonicalBuilderJson(value.affected) !== canonicalBuilderJson(expectedAffected)) {
    reject("invalid_plan", "Plan affected-record metadata is not consistent.");
  }
  const expectedSummary = summarizeEffects(value.effects);
  if (canonicalBuilderJson(value.summary) !== canonicalBuilderJson(expectedSummary)) {
    reject("invalid_plan", "Plan summary is not consistent.");
  }
  if (canonicalBuilderJson(value.accounting) !== canonicalBuilderJson(value.expectedAccounting)) {
    reject("invalid_plan", "Plan accounting must be unchanged by minimisation.");
  }
  const { planId, ...body } = value;
  if (hashBuilderCanonicalJson(body) !== planId) {
    reject("invalid_plan", "Plan id does not match the reviewed plan content.");
  }
  return value as BuilderSubjectMinimizationPlan;
}

function journalEventMatchesPlan(
  event: BuilderMinimizationJournalEvent,
  plan: BuilderSubjectMinimizationPlan,
): boolean {
  const intent = builderMinimizationIntentFromEvent(event);
  return (
    event.intentDigest === computeBuilderMinimizationIntentDigest(intent) &&
    event.subjectId === plan.subjectId &&
    event.planId === plan.planId &&
    event.plannedStoreHash === plan.storeHash &&
    event.expectedResultHash === plan.expectedResultHash &&
    event.effectAt === plan.effectAt &&
    canonicalBuilderJson(event.effects) === canonicalBuilderJson(plan.effects) &&
    canonicalBuilderJson(event.summary) === canonicalBuilderJson(plan.summary) &&
    canonicalBuilderJson(event.accounting) === canonicalBuilderJson(plan.accounting)
  );
}

function newJournalEvent(
  plan: BuilderSubjectMinimizationPlan,
  now: Date,
): BuilderMinimizationJournalEvent {
  const intent: BuilderMinimizationIntent = {
    version: BUILDER_MINIMIZATION_JOURNAL_VERSION,
    id: `mnj_${randomBytes(12).toString("hex")}`,
    kind: "subject_minimization",
    subjectId: plan.subjectId,
    planId: plan.planId,
    plannedStoreHash: plan.storeHash,
    expectedResultHash: plan.expectedResultHash,
    effectAt: plan.effectAt,
    createdAt: nowIso(now),
    effects: plan.effects,
    summary: plan.summary,
    accounting: plan.accounting,
  };
  return {
    ...intent,
    intentDigest: computeBuilderMinimizationIntentDigest(intent),
    phase: "pending",
  };
}

export async function applyBuilderSubjectMinimization(input: {
  storeDir: string;
  plan: BuilderSubjectMinimizationPlan | string;
  now?: Date;
  lockWaitMs?: number;
}): Promise<BuilderSubjectMinimizationReceipt> {
  const plan = parseBuilderSubjectMinimizationPlan(input.plan);
  const now = input.now ?? new Date();
  return withBuilderIdentityStoreFiles(
    input.storeDir,
    async (transaction) => {
      if ((await readBuilderRestoreReplayGate(transaction.directory)).present) {
        throw new BuilderMinimizationRejected(
          "restore_pending",
          "The store is closed pending restore replay; apply is not allowed.",
        );
      }
      assertAccountingRelationships(transaction.store);
      const accountingBefore = computeBuilderMinimizationAccounting(transaction.store);
      const existingEvent = transaction.journal.events.find(
        (event) => event.planId === plan.planId,
      );
      const otherPending = transaction.journal.events.filter(
        (event) => event.phase === "pending" && event.planId !== plan.planId,
      );
      if (otherPending.length > 0) {
        throw new BuilderMinimizationRejected(
          "pending_journal",
          "Another minimisation request is pending; complete it before applying a new plan.",
        );
      }

      if (transaction.storeHash === plan.expectedResultHash) {
        if (!effectsAreSatisfied(transaction.store, plan.effects)) {
          throw new BuilderMinimizationRejected(
            "incompatible_store",
            "The store matches the plan result hash but not its effects.",
          );
        }
        if (existingEvent && !journalEventMatchesPlan(existingEvent, plan)) {
          throw new BuilderMinimizationRejected(
            "incompatible_store",
            "An existing journal event for this plan does not match its evidence.",
          );
        }
        if (
          existingEvent?.phase === "completed" &&
          existingEvent.resultStoreHash !== transaction.storeHash
        ) {
          throw new BuilderMinimizationRejected(
            "incompatible_store",
            "The completed journal event does not match the current store hash.",
          );
        }
        if (existingEvent?.phase === "pending") {
          existingEvent.phase = "completed";
          existingEvent.completedAt = nowIso(now);
          existingEvent.resultStoreHash = transaction.storeHash;
          await transaction.writeJournal(transaction.journal);
        }
        const accountingAfter =
          computeBuilderMinimizationAccounting(transaction.store);
        assertAccountingPreserved(accountingBefore, accountingAfter);
        return {
          version: 1 as const,
          kind: "builder-subject-minimization" as const,
          planId: plan.planId,
          subjectId: plan.subjectId,
          eventId: existingEvent?.id ?? null,
          status: existingEvent ? "already_applied" : "no_change",
          changed: false,
          storeBeforeHash: transaction.storeHash,
          storeAfterHash: transaction.storeHash,
          accountingBefore,
          accountingAfter,
          summary: plan.summary,
          appliedAt: nowIso(now),
        };
      }

      if (transaction.storeHash !== plan.storeHash) {
        throw new BuilderMinimizationRejected(
          "stale_plan",
          "The reviewed plan is stale: the store changed after the dry run.",
        );
      }
      if (
        canonicalBuilderJson(accountingBefore) !== canonicalBuilderJson(plan.accounting)
      ) {
        throw new BuilderMinimizationRejected(
          "incompatible_store",
          "The store accounting does not match the reviewed plan.",
        );
      }

      const expectedStore = structuredClone(transaction.store);
      applyPlanEffects(expectedStore, plan.effects, plan.effectAt);
      const expectedResultHash = hashBytes(
        serializeBuilderIdentityStore(expectedStore),
      );
      if (expectedResultHash !== plan.expectedResultHash) {
        throw new BuilderMinimizationRejected(
          "incompatible_store",
          "Applying the reviewed plan would not produce the reviewed result hash.",
        );
      }
      const expectedAccounting =
        computeBuilderMinimizationAccounting(expectedStore);
      assertAccountingPreserved(accountingBefore, expectedAccounting);
      if (
        canonicalBuilderJson(expectedAccounting) !==
        canonicalBuilderJson(plan.expectedAccounting)
      ) {
        throw new BuilderMinimizationRejected(
          "incompatible_store",
          "The projected accounting does not match the reviewed plan.",
        );
      }

      if (existingEvent) {
        if (!journalEventMatchesPlan(existingEvent, plan)) {
          throw new BuilderMinimizationRejected(
            "incompatible_store",
            "An existing journal event for this plan does not match its evidence.",
          );
        }
        if (
          existingEvent.phase === "completed" &&
          existingEvent.resultStoreHash !== expectedResultHash
        ) {
          throw new BuilderMinimizationRejected(
            "incompatible_store",
            "The completed journal event does not match this plan result.",
          );
        }
      }

      // A completed journal event with an old store hash is inconsistent
      // evidence. Re-applying the same reviewed effects is safe and repairs it
      // without inventing a second request.
      let event = existingEvent;
      if (!event) {
        event = newJournalEvent(plan, now);
        transaction.journal.events.push(event);
        await transaction.writeJournal(transaction.journal);
      }
      testAbort("journal_prepared");

      applyPlanEffects(transaction.store, plan.effects, plan.effectAt);
      const writtenHash = await transaction.writeStore();
      if (writtenHash !== expectedResultHash) {
        throw new BuilderStoreUnavailable(
          "The minimised store did not match its reviewed result hash.",
        );
      }
      testAbort("store_written");

      event.phase = "completed";
      event.completedAt = nowIso(now);
      event.resultStoreHash = writtenHash;
      await transaction.writeJournal(transaction.journal);

      const accountingAfter =
        computeBuilderMinimizationAccounting(transaction.store);
      assertAccountingPreserved(accountingBefore, accountingAfter);
      assertAccountingRelationships(transaction.store);
      return {
        version: 1 as const,
        kind: "builder-subject-minimization" as const,
        planId: plan.planId,
        subjectId: plan.subjectId,
        eventId: event.id,
        status: "applied" as const,
        changed: true,
        storeBeforeHash: plan.storeHash,
        storeAfterHash: writtenHash,
        accountingBefore,
        accountingAfter,
        summary: plan.summary,
        appliedAt: nowIso(now),
      };
    },
    input.lockWaitMs === undefined ? {} : { lockWaitMs: input.lockWaitMs },
  );
}

type ReplayEventOutcome = {
  changed: boolean;
  absent: boolean;
  effectsComplete: boolean;
};

function applyReplayEvent(
  store: BuilderIdentityStore,
  event: BuilderMinimizationJournalEvent,
): ReplayEventOutcome {
  const subject = store.subjects.find((item) => item.id === event.subjectId);
  const relatedSessions = store.sessions.filter(
    (session) => session.subjectId === event.subjectId,
  );
  const relatedInvites = store.invites.filter(
    (invite) => invite.subjectId === event.subjectId,
  );
  const relatedUsage = store.usage.filter(
    (record) => record.subjectId === event.subjectId,
  );

  for (const effect of event.effects.sessions) {
    const session = store.sessions.find((item) => item.id === effect.id);
    if (session && session.subjectId !== event.subjectId) {
      throw new BuilderMinimizationRejected(
        "incomplete_replay",
        "A journaled session id belongs to another subject in this backup.",
      );
    }
  }
  for (const effect of event.effects.invites) {
    const invite = store.invites.find((item) => item.id === effect.id);
    if (invite && invite.subjectId !== event.subjectId) {
      throw new BuilderMinimizationRejected(
        "incomplete_replay",
        "A journaled invite id belongs to another subject in this backup.",
      );
    }
  }

  if (!subject) {
    if (
      relatedSessions.length > 0 ||
      relatedInvites.length > 0 ||
      relatedUsage.length > 0
    ) {
      throw new BuilderMinimizationRejected(
        "incomplete_replay",
        "Journaled subject is absent but related records remain in this backup.",
      );
    }
    return { changed: false, absent: true, effectsComplete: true };
  }

  let changed = false;
  if (!subject.revokedAt) {
    subject.revokedAt = event.effectAt;
    changed = true;
  }
  if (subject.label !== BUILDER_MINIMIZED_LABEL) {
    subject.label = BUILDER_MINIMIZED_LABEL;
    changed = true;
  }
  for (const session of relatedSessions) {
    if (!session.revokedAt) {
      session.revokedAt = event.effectAt;
      changed = true;
    }
    if (session.tokenHash !== BUILDER_MINIMIZED_TOKEN_HASH) {
      session.tokenHash = BUILDER_MINIMIZED_TOKEN_HASH;
      changed = true;
    }
  }
  for (const invite of relatedInvites) {
    if (!invite.usedAt && !invite.revokedAt) {
      invite.revokedAt = event.effectAt;
      changed = true;
    }
    if (invite.label !== BUILDER_MINIMIZED_LABEL) {
      invite.label = BUILDER_MINIMIZED_LABEL;
      changed = true;
    }
    if (invite.tokenHash !== BUILDER_MINIMIZED_TOKEN_HASH) {
      invite.tokenHash = BUILDER_MINIMIZED_TOKEN_HASH;
      changed = true;
    }
  }

  const effectsComplete =
    Boolean(subject.revokedAt) &&
    subject.label === BUILDER_MINIMIZED_LABEL &&
    relatedSessions.every(
      (session) =>
        Boolean(session.revokedAt) &&
        session.tokenHash === BUILDER_MINIMIZED_TOKEN_HASH,
    ) &&
    relatedInvites.every(
      (invite) =>
        invite.label === BUILDER_MINIMIZED_LABEL &&
        invite.tokenHash === BUILDER_MINIMIZED_TOKEN_HASH &&
        (Boolean(invite.usedAt) || Boolean(invite.revokedAt)),
    );

  return { changed, absent: false, effectsComplete };
}

function readJournalFile(
  journalPath: string,
): Promise<{ bytes: Buffer; journal: BuilderMinimizationJournal; hash: string }> {
  return readFile(path.resolve(journalPath)).then(
    (bytes) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(bytes.toString("utf8"));
      } catch {
        throw new BuilderMinimizationRejected(
          "invalid_journal",
          "The minimisation journal is not valid JSON.",
        );
      }
      if (!validBuilderMinimizationJournal(parsed)) {
        throw new BuilderMinimizationRejected(
          "invalid_journal",
          "The minimisation journal is corrupt or has an unsupported version.",
        );
      }
      return { bytes, journal: parsed, hash: hashBytes(bytes) };
    },
    () => {
      throw new BuilderMinimizationRejected(
        "invalid_journal",
        "The minimisation journal is missing; the restored store must not be opened.",
      );
    },
  );
}

function deriveReplayJournal(
  source: BuilderMinimizationJournal,
  afterHash: string,
  replayedAt: string,
): BuilderMinimizationJournal {
  return {
    version: BUILDER_MINIMIZATION_JOURNAL_VERSION,
    events: source.events.map((event) => ({
      ...event,
      phase: "completed" as const,
      completedAt: event.completedAt ?? replayedAt,
      resultStoreHash: event.resultStoreHash ?? afterHash,
      replayedAt,
      replayedStoreHash: afterHash,
    })),
  };
}

function journalAlreadyReplayed(
  current: BuilderMinimizationJournal,
  source: BuilderMinimizationJournal,
  afterHash: string,
): boolean {
  if (current.events.length !== source.events.length) return false;
  return source.events.every((event) => {
    const found = current.events.find((item) => item.id === event.id);
    return Boolean(
      found &&
        found.phase === "completed" &&
        found.replayedAt &&
        found.replayedStoreHash === afterHash,
    );
  });
}

export type BuilderRestoreReplayPreparation = Readonly<{
  prepared: boolean;
  alreadyReplayed: boolean;
  attemptId: string;
  journalHash: string;
  storeHash: string;
  gate: BuilderRestoreReplayGate;
}>;

function newRestoreAttemptId(): string {
  return `rra_${randomBytes(12).toString("hex")}`;
}

function sourceCommitments(
  source: Awaited<ReturnType<typeof readJournalFile>>,
): BuilderRestoreReplayCommitment[] {
  return source.journal.events.map((event) => ({
    id: event.id,
    intentDigest: event.intentDigest,
  }));
}

function sameCommitmentSequence(
  left: readonly BuilderRestoreReplayCommitment[],
  right: readonly BuilderRestoreReplayCommitment[],
): boolean {
  return (
    left.length === right.length &&
    left.every((commitment, index) => {
      const other = right[index];
      return (
        Boolean(other) &&
        commitment.id === other.id &&
        commitment.intentDigest === other.intentDigest
      );
    })
  );
}

function commitmentPrefix(
  prefix: readonly BuilderRestoreReplayCommitment[],
  full: readonly BuilderRestoreReplayCommitment[],
): boolean {
  return (
    prefix.length <= full.length &&
    sameCommitmentSequence(prefix, full.slice(0, prefix.length))
  );
}

async function readRestoreReceiptHistory(
  directory: string,
): Promise<BuilderRestoreReplayReceipt[]> {
  const history = await readBuilderRestoreReplayReceiptHistory(directory);
  if (history.errors.length > 0) {
    throw new BuilderMinimizationRejected(
      "incomplete_replay",
      "The restored store has unreadable or conflicting replay receipt history; keep the gate closed.",
    );
  }
  return [...history.receipts];
}

function assertReceiptContinuity(
  priorReceipts: readonly BuilderRestoreReplayReceipt[],
  source: Awaited<ReturnType<typeof readJournalFile>>,
): void {
  const commitments = sourceCommitments(source);
  for (const receipt of priorReceipts) {
    if (!commitmentPrefix(receipt.journalCommitments, commitments)) {
      throw new BuilderMinimizationRejected(
        "incomplete_replay",
        "The supplied journal is missing or divergent from previously receipted restore commitments; keep the gate closed.",
      );
    }
  }
}

function receiptMatchesSource(
  receipt: BuilderRestoreReplayReceipt,
  source: Awaited<ReturnType<typeof readJournalFile>>,
  storeHash: string,
): boolean {
  return (
    receipt.journalHash === source.hash &&
    sameCommitmentSequence(receipt.journalCommitments, sourceCommitments(source)) &&
    receipt.storeAfterHash === storeHash &&
    Object.values(receipt.invariants).every((item) => item === true)
  );
}

async function ensureRestoreGate(
  directory: string,
  now: Date,
): Promise<BuilderRestoreReplayGate> {
  const existing = await readBuilderRestoreReplayGate(directory);
  if (existing.present) {
    if (!existing.valid || !existing.value) {
      throw new BuilderMinimizationRejected(
        "replay_conflict",
        "A restore replay gate is present but unreadable; stop and inspect it.",
      );
    }
    return existing.value;
  }
  const gate: BuilderRestoreReplayGate = {
    version: 3,
    attemptId: newRestoreAttemptId(),
    phase: "closed",
    startedAt: nowIso(now),
    previousReceiptIds: [],
  };
  await writeBuilderRestoreReplayGateUnlocked(directory, gate);
  testAbort("gate_closed");
  return gate;
}

async function prepareRestoreGate(
  directory: string,
  gate: BuilderRestoreReplayGate,
  source: Awaited<ReturnType<typeof readJournalFile>>,
  commitments: BuilderRestoreReplayCommitment[],
  storeHash: string,
  priorReceipts: readonly BuilderRestoreReplayReceipt[],
  now: Date,
  allowPreparedRebind: boolean,
): Promise<BuilderRestoreReplayGate> {
  if (gate.phase === "prepared") {
    if (
      gate.journalHash === source.hash &&
      sameCommitmentSequence(gate.journalCommitments ?? [], commitments)
    ) {
      return gate;
    }
    if (!allowPreparedRebind) {
      throw new BuilderMinimizationRejected(
        "replay_conflict",
        "This restore attempt is already prepared with different journal evidence; keep the gate closed and run restore-prepare explicitly before replaying corrected evidence.",
      );
    }
    if (gate.storeBeforeHash !== storeHash) {
      throw new BuilderMinimizationRejected(
        "replay_conflict",
        "This restore attempt is bound to different journal evidence and has already changed the store; keep the gate closed.",
      );
    }
    // No effects have been written yet. An explicit restore-prepare may bind
    // corrected evidence; replay itself may not silently change intent.
    const rebound: BuilderRestoreReplayGate = {
      ...gate,
      phase: "prepared",
      preparedAt: nowIso(now),
      journalHash: source.hash,
      journalCommitments: commitments,
      storeBeforeHash: storeHash,
      previousReceiptIds: priorReceipts.map((receipt) => receipt.receiptId),
    };
    await writeBuilderRestoreReplayGateUnlocked(directory, rebound);
    testAbort("gate_prepared");
    return rebound;
  }
  const prepared: BuilderRestoreReplayGate = {
    ...gate,
    phase: "prepared",
    preparedAt: nowIso(now),
    journalHash: source.hash,
    journalCommitments: commitments,
    storeBeforeHash: storeHash,
    previousReceiptIds: priorReceipts.map((receipt) => receipt.receiptId),
  };
  await writeBuilderRestoreReplayGateUnlocked(directory, prepared);
  testAbort("gate_prepared");
  return prepared;
}

async function readBackupJournalPrefix(
  directory: string,
  source: Awaited<ReturnType<typeof readJournalFile>>,
) {
  const backup = await readBuilderMinimizationJournalUnlocked(directory);
  const backupCommitments: BuilderRestoreReplayCommitment[] =
    backup.journal.events.map((event) => ({
      id: event.id,
      intentDigest: event.intentDigest,
    }));
  if (!commitmentPrefix(backupCommitments, sourceCommitments(source))) {
    throw new BuilderMinimizationRejected(
      "incomplete_replay",
      "The backup journal is not a commitment prefix of the supplied journal; keep the gate closed.",
    );
  }
  return backup;
}

function replayInvariants(
  accountingBefore: BuilderMinimizationAccountingSnapshot,
  accountingAfter: BuilderMinimizationAccountingSnapshot,
  store: BuilderIdentityStore,
  effectsComplete: boolean,
): BuilderRestoreReplayReceipt["invariants"] {
  return {
    usageUnchanged: accountingBefore.usageHash === accountingAfter.usageHash,
    accountingPreserved:
      canonicalBuilderJson(accountingBefore) === canonicalBuilderJson(accountingAfter),
    relationshipsValid: verifyBuilderAccountingRelationships(store).length === 0,
    effectsComplete,
  };
}

async function completeNoOpRestoreAttempt(input: {
  directory: string;
  preparedGate: BuilderRestoreReplayGate;
  source: Awaited<ReturnType<typeof readJournalFile>>;
  journalFile: string;
  storeHash: string;
  store: BuilderIdentityStore;
  priorReceipts: readonly BuilderRestoreReplayReceipt[];
  priorReceipt: BuilderRestoreReplayReceipt;
  replayedAt: string;
  keepGateClosed?: boolean;
}): Promise<BuilderRestoreReplayReceipt> {
  const commitments = sourceCommitments(input.source);
  const eventIds = commitments.map((commitment) => commitment.id);
  const accounting = computeBuilderMinimizationAccounting(input.store);
  const receipt: BuilderRestoreReplayReceipt = {
    version: 3,
    kind: "builder-minimization-replay",
    attemptId: input.preparedGate.attemptId,
    receiptId: `rrp_${randomBytes(12).toString("hex")}`,
    previousReceiptIds: input.priorReceipts.map((item) => item.receiptId),
    journalFile: input.journalFile,
    journalHash: input.source.hash,
    journalCommitments: commitments,
    journalEventCount: commitments.length,
    appliedEventIds: [],
    alreadyAppliedEventIds: eventIds,
    absentSubjectIds: input.priorReceipt.absentSubjectIds,
    storeBeforeHash: input.preparedGate.storeBeforeHash as string,
    storeAfterHash: input.storeHash,
    accountingBefore: accounting,
    accountingAfter: accounting,
    invariants: replayInvariants(accounting, accounting, input.store, true),
    status: "complete",
    createdAt: input.replayedAt,
  };
  if (Object.values(receipt.invariants).some((item) => item !== true)) {
    throw new BuilderMinimizationRejected(
      "incomplete_replay",
      "No-op restore attempt failed an accounting invariant; keep the gate closed.",
    );
  }
  await writeBuilderRestoreReplayReceiptUnlocked(input.directory, receipt);
  testAbort("receipt_written");
  await assertBuilderStoreReplayReady(input.directory, { cleanup: false });
  if (!input.keepGateClosed) await removeBuilderRestoreReplayGate(input.directory);
  testAbort("gate_removed");
  return receipt;
}

/**
 * Opens a durable closed restore attempt before loading any journal or receipt
 * evidence. A missing/corrupt journal, receipt history or store therefore
 * leaves the restored store unavailable to invite-mode startup.
 */
export async function prepareBuilderRestoreReplay(input: {
  storeDir: string;
  journalPath: string;
  now?: Date;
  lockWaitMs?: number;
}): Promise<BuilderRestoreReplayPreparation> {
  const now = input.now ?? new Date();
  const replayedAt = nowIso(now);
  const journalFile = path.basename(path.resolve(input.journalPath));
  return withBuilderStoreRawLock(
    input.storeDir,
    async (directory) => {
      const gate = await ensureRestoreGate(directory, now);
      const source = await readJournalFile(input.journalPath);
      const history = await readRestoreReceiptHistory(directory);
      const priorReceipts = history.filter(
        (receipt) => receipt.attemptId !== gate.attemptId,
      );
      assertReceiptContinuity(priorReceipts, source);
      const snapshot = await readBuilderIdentityStoreSnapshot(directory);
      assertAccountingRelationships(snapshot.store);
      const commitments = sourceCommitments(source);
      const currentReceipt = history.find(
        (receipt) => receipt.attemptId === gate.attemptId,
      );

      if (currentReceipt) {
        if (!receiptMatchesSource(currentReceipt, source, snapshot.storeHash)) {
          throw new BuilderMinimizationRejected(
            "incomplete_replay",
            "The current restore attempt receipt does not match the journal or store; keep the gate closed.",
          );
        }
        await assertBuilderStoreReplayReady(directory, { cleanup: false });
        await removeBuilderRestoreReplayGate(directory);
        testAbort("gate_removed");
        return {
          prepared: false,
          alreadyReplayed: true,
          attemptId: gate.attemptId,
          journalHash: source.hash,
          storeHash: snapshot.storeHash,
          gate,
        };
      }

      const alreadyAtPriorReceipt = priorReceipts.find((receipt) =>
        receiptMatchesSource(receipt, source, snapshot.storeHash),
      );
      if (alreadyAtPriorReceipt) {
        const prepared = await prepareRestoreGate(
          directory,
          gate,
          source,
          commitments,
          snapshot.storeHash,
          priorReceipts,
          now,
          true,
        );
        await completeNoOpRestoreAttempt({
          directory,
          preparedGate: prepared,
          source,
          journalFile,
          storeHash: snapshot.storeHash,
          store: snapshot.store,
          priorReceipts,
          priorReceipt: alreadyAtPriorReceipt,
          replayedAt,
        });
        return {
          prepared: gate.phase === "closed",
          alreadyReplayed: true,
          attemptId: prepared.attemptId,
          journalHash: source.hash,
          storeHash: snapshot.storeHash,
          gate: prepared,
        };
      }

      const prepared = await prepareRestoreGate(
        directory,
        gate,
        source,
        commitments,
        snapshot.storeHash,
        priorReceipts,
        now,
        true,
      );
      return {
        prepared: gate.phase === "closed",
        alreadyReplayed: false,
        attemptId: prepared.attemptId,
        journalHash: source.hash,
        storeHash: snapshot.storeHash,
        gate: prepared,
      };
    },
    input.lockWaitMs === undefined ? {} : { lockWaitMs: input.lockWaitMs },
  );
}

export async function replayBuilderMinimizationJournal(
  input: BuilderSubjectMinimizationReplayInput,
): Promise<BuilderRestoreReplayReceipt> {
  const now = input.now ?? new Date();
  const replayedAt = nowIso(now);
  const journalFile = path.basename(path.resolve(input.journalPath));

  return withBuilderStoreRawLock(
    input.storeDir,
    async (directory) => {
      const gate = await ensureRestoreGate(directory, now);
      const source = await readJournalFile(input.journalPath);
      const history = await readRestoreReceiptHistory(directory);
      const priorReceipts = history.filter(
        (receipt) => receipt.attemptId !== gate.attemptId,
      );
      assertReceiptContinuity(priorReceipts, source);
      const snapshot = await readBuilderIdentityStoreSnapshot(directory);
      assertAccountingRelationships(snapshot.store);
      const commitments = sourceCommitments(source);
      const currentReceipt = history.find(
        (receipt) => receipt.attemptId === gate.attemptId,
      );

      if (currentReceipt) {
        if (!receiptMatchesSource(currentReceipt, source, snapshot.storeHash)) {
          throw new BuilderMinimizationRejected(
            "incomplete_replay",
            "The current restore attempt receipt does not match the journal or store; keep the gate closed.",
          );
        }
        await assertBuilderStoreReplayReady(directory, { cleanup: false });
        if (!input.keepGateClosed) await removeBuilderRestoreReplayGate(directory);
        testAbort("gate_removed");
        return currentReceipt;
      }

      const preparedGate = await prepareRestoreGate(
        directory,
        gate,
        source,
        commitments,
        snapshot.storeHash,
        priorReceipts,
        now,
        false,
      );
      const backupJournal = await readBackupJournalPrefix(directory, source);

      const accountingBefore = computeBuilderMinimizationAccounting(
        snapshot.store,
      );
      const expectedStore = structuredClone(snapshot.store);
      const appliedEventIds: string[] = [];
      const alreadyAppliedEventIds: string[] = [];
      const absentSubjectIds: string[] = [];
      let effectsComplete = true;

      for (const event of source.journal.events) {
        const outcome = applyReplayEvent(expectedStore, event);
        effectsComplete = effectsComplete && outcome.effectsComplete;
        if (outcome.absent) {
          absentSubjectIds.push(event.subjectId);
          alreadyAppliedEventIds.push(event.id);
        } else if (outcome.changed) {
          appliedEventIds.push(event.id);
        } else {
          alreadyAppliedEventIds.push(event.id);
        }
      }

      const accountingAfter =
        computeBuilderMinimizationAccounting(expectedStore);
      assertAccountingPreserved(accountingBefore, accountingAfter);
      assertAccountingRelationships(expectedStore);
      const expectedHash = hashBytes(
        serializeBuilderIdentityStore(expectedStore),
      );
      const changed = expectedHash !== snapshot.storeHash;

      let storeAfterHash = snapshot.storeHash;
      if (changed) {
        storeAfterHash = await writeBuilderIdentityStore(
          directory,
          expectedStore,
        );
        if (storeAfterHash !== expectedHash) {
          throw new BuilderStoreUnavailable(
            "The replayed store did not match its verified result hash.",
          );
        }
        testAbort("store_written");
      }

      const derived = deriveReplayJournal(
        source.journal,
        storeAfterHash,
        replayedAt,
      );
      if (
        !journalAlreadyReplayed(
          backupJournal.journal,
          source.journal,
          storeAfterHash,
        )
      ) {
        await writeBuilderMinimizationJournalUnlocked(directory, derived);
        testAbort("journal_written");
      }

      const finalAccounting = computeBuilderMinimizationAccounting(expectedStore);
      const invariants = replayInvariants(
        accountingBefore,
        finalAccounting,
        expectedStore,
        effectsComplete,
      );
      const receipt: BuilderRestoreReplayReceipt = {
        version: 3,
        kind: "builder-minimization-replay",
        attemptId: preparedGate.attemptId,
        receiptId: `rrp_${randomBytes(12).toString("hex")}`,
        previousReceiptIds: priorReceipts.map((item) => item.receiptId),
        journalFile,
        journalHash: source.hash,
        journalCommitments: commitments,
        journalEventCount: commitments.length,
        appliedEventIds,
        alreadyAppliedEventIds,
        absentSubjectIds,
        storeBeforeHash: preparedGate.storeBeforeHash as string,
        storeAfterHash,
        accountingBefore,
        accountingAfter: finalAccounting,
        invariants,
        status: "complete",
        createdAt: replayedAt,
      };
      if (Object.values(receipt.invariants).some((item) => item !== true)) {
        throw new BuilderMinimizationRejected(
          "incomplete_replay",
          "Replay accounting invariants failed; the restored store must remain closed.",
        );
      }

      await writeBuilderRestoreReplayReceiptUnlocked(directory, receipt);
      testAbort("receipt_written");
      await assertBuilderStoreReplayReady(directory, { cleanup: false });
      if (!input.keepGateClosed) await removeBuilderRestoreReplayGate(directory);
      testAbort("gate_removed");
      return receipt;
    },
    input.lockWaitMs === undefined ? {} : { lockWaitMs: input.lockWaitMs },
  );
}
