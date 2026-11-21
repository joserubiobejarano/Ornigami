import { createHash, randomBytes } from "node:crypto";
import { readFileSync, readlinkSync } from "node:fs";
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
/**
 * Sidecar evidence for assisted minimisation. It contains record ids and
 * categories only: never labels, invite tokens, session tokens or request
 * content. It is written under the same store lock as identity-store.json.
 */
export const BUILDER_MINIMIZATION_JOURNAL_VERSION = 1 as const;
export const BUILDER_MINIMIZATION_JOURNAL_FILE = "minimization-journal.json";
export const BUILDER_RESTORE_REPLAY_GATE_FILE = "restore-replay-gate.json";
export const BUILDER_RESTORE_REPLAY_RECEIPT_FILE = "restore-replay-receipt.json";
export const BUILDER_MINIMIZED_LABEL = "[minimized]";
/**
 * A stable non-secret tombstone. It is not a valid credential hash: every
 * record carrying it is already revoked or otherwise unusable.
 */
export const BUILDER_MINIMIZED_TOKEN_HASH = "minimized";
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

/**
 * The stable logical host identity written into builder store lock metadata.
 * A container replacement normally changes the OS hostname, so set this to the
 * same constant for the runtime and every operator process that shares a store
 * volume. A changed value makes existing locks foreign and unprovable; it does
 * not authorize automatic takeover.
 */
export const BUILDER_STORE_HOST_ID = STORE_HOST_ID;

/**
 * Process liveness is only comparable inside the same PID namespace and the
 * same boot. A runtime and an operator container can share the logical store
 * host id while having distinct PID namespaces, so a remote PID must never be
 * treated as live or dead from this process. Cross-scope locks are recovered by
 * the explicit operator command instead of automatic reaping.
 */
const TEST_HOOKS_ENABLED = process.env.BUILDER_RUNTIME_ALLOW_TEST_HOOKS === "1";
const TEST_PID_NAMESPACE = TEST_HOOKS_ENABLED
  ? process.env.BUILDER_RUNTIME_TEST_PID_NAMESPACE
  : undefined;
const TEST_BOOT_ID = TEST_HOOKS_ENABLED
  ? process.env.BUILDER_RUNTIME_TEST_BOOT_ID
  : undefined;
const BOOT_ID =
  TEST_BOOT_ID !== undefined
    ? TEST_BOOT_ID
    : (() => {
        try {
          return readFileSync("/proc/sys/kernel/random/boot_id", "utf8")
            .trim()
            .slice(0, 64);
        } catch {
          return "";
        }
      })();
const PID_NAMESPACE =
  TEST_PID_NAMESPACE !== undefined
    ? TEST_PID_NAMESPACE
    : (() => {
        try {
          return readlinkSync("/proc/self/ns/pid").slice(0, 128);
        } catch {
          return "";
        }
      })();
const PROCESS_BOOT_MS = Date.now() - Math.max(0, os.uptime()) * 1000;

export type BuilderStoreProcessScopeInfo = Readonly<{
  proven: boolean;
  scope: string | null;
  token: string | null;
  reason: "proven" | "linux_missing_pid_namespace" | "linux_missing_boot_id";
}>;

/**
 * Linux liveness is comparable only when both the PID namespace and boot id are
 * available. If either read fails, the process scope is unproven: ordinary
 * acquisition/release still works by token, but no automatic lock reaping or
 * orphan-temp cleanup is allowed. Windows keeps the supported single-host
 * fallback because PIDs are comparable across processes on that host.
 */
export function deriveBuilderStoreProcessScope(input: {
  platform: NodeJS.Platform;
  hostId: string;
  pidNamespace: string | null;
  bootId: string | null;
}): BuilderStoreProcessScopeInfo {
  if (input.platform === "linux") {
    if (!input.pidNamespace) {
      return {
        proven: false,
        scope: null,
        token: null,
        reason: "linux_missing_pid_namespace",
      };
    }
    if (!input.bootId) {
      return {
        proven: false,
        scope: null,
        token: null,
        reason: "linux_missing_boot_id",
      };
    }
  }
  const scope =
    input.platform === "linux"
      ? `${input.hostId}|${input.pidNamespace}|${input.bootId}`
      : `${input.hostId}|host|unknown-boot`;
  return {
    proven: true,
    scope,
    token: createHash("sha256").update(scope).digest("hex").slice(0, 16),
    reason: "proven",
  };
}

const PROCESS_SCOPE_INFO = deriveBuilderStoreProcessScope({
  platform: process.platform,
  hostId: STORE_HOST_ID,
  pidNamespace: PID_NAMESPACE || null,
  bootId: BOOT_ID || null,
});
const PROCESS_SCOPE_PROVEN = PROCESS_SCOPE_INFO.proven;
const PROCESS_SCOPE = PROCESS_SCOPE_INFO.scope;
const PROCESS_SCOPE_TOKEN = PROCESS_SCOPE_INFO.token;
const PROCESS_SCOPE_SEGMENT = PROCESS_SCOPE_TOKEN
  ? `.${PROCESS_SCOPE_TOKEN}`
  : ".unproven";

export const BUILDER_STORE_PROCESS_SCOPE = PROCESS_SCOPE;
export const BUILDER_STORE_PROCESS_SCOPE_PROVEN = PROCESS_SCOPE_PROVEN;
export const BUILDER_STORE_PROCESS_SCOPE_REASON = PROCESS_SCOPE_INFO.reason;
export const BUILDER_STORE_SCOPE_TOKEN = PROCESS_SCOPE_TOKEN;

export type BuilderStoreLockOptions = Readonly<{
  /** Bounded wait, primarily for focused tests and operator diagnostics. */
  lockWaitMs?: number;
}>;

type BuilderLockMetadata = {
  version: typeof LOCK_METADATA_VERSION;
  token: string;
  pid: number;
  hostname: string;
  /** Present on new locks; missing means the owner scope is unprovable. */
  scope?: string;
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

/**
 * Accounting evidence captured before and after a minimisation or replay. The
 * minimisation path must never change any of these values.
 */
export type BuilderMinimizationAccountingSnapshot = Readonly<{
  usageRecords: number;
  requestKeys: number;
  reservedRecords: number;
  succeededRecords: number;
  failedRecords: number;
  unknownRecords: number;
  settledCostMicros: number;
  reservedCostMicros: number;
  unknownCostMicros: number;
  effectiveCostMicros: number;
  usageHash: string;
}>;

export type BuilderMinimizationSubjectEffect = Readonly<{
  id: string;
  revoke: boolean;
  minimizeLabel: boolean;
}>;

export type BuilderMinimizationInviteEffect = Readonly<{
  id: string;
  revoke: boolean;
  minimizeLabel: boolean;
  minimizeToken: boolean;
}>;

export type BuilderMinimizationSessionEffect = Readonly<{
  id: string;
  revoke: boolean;
  minimizeToken: boolean;
}>;

/**
 * The exact record ids a reviewed plan may touch. `usageIds` is evidence that
 * these accounting rows are preserved, not a mutation list.
 */
export type BuilderMinimizationEffects = Readonly<{
  subject: BuilderMinimizationSubjectEffect;
  invites: readonly BuilderMinimizationInviteEffect[];
  sessions: readonly BuilderMinimizationSessionEffect[];
  usageIds: readonly string[];
}>;

export type BuilderMinimizationCategory =
  | "subject.revoke"
  | "subject.label"
  | "invite.revoke"
  | "invite.label"
  | "invite.token_hash"
  | "session.revoke"
  | "session.token_hash"
  | "usage.preserve";

export type BuilderMinimizationAffectedRecords = Readonly<{
  subject: Readonly<{
    id: string;
    categories: readonly BuilderMinimizationCategory[];
  }>;
  invites: readonly Readonly<{
    id: string;
    categories: readonly BuilderMinimizationCategory[];
  }>[];
  sessions: readonly Readonly<{
    id: string;
    categories: readonly BuilderMinimizationCategory[];
  }>[];
  usage: Readonly<{
    ids: readonly string[];
    categories: readonly BuilderMinimizationCategory[];
  }>;
}>;

export type BuilderMinimizationSummary = Readonly<{
  subjectsAffected: number;
  invitesAffected: number;
  sessionsAffected: number;
  inviteRevocations: number;
  sessionRevocations: number;
  labelsMinimized: number;
  tokensMinimized: number;
  usageRecordsPreserved: number;
}>;

export type BuilderMinimizationJournalEvent = {
  version: typeof BUILDER_MINIMIZATION_JOURNAL_VERSION;
  id: string;
  kind: "subject_minimization";
  /**
   * pending means the durable request exists but its store effects may not be
   * complete. Any ordinary store writer must fail closed until it is resolved.
   */
  phase: "pending" | "completed";
  subjectId: string;
  planId: string;
  plannedStoreHash: string;
  expectedResultHash: string;
  effectAt: string;
  createdAt: string;
  completedAt?: string;
  resultStoreHash?: string;
  replayedAt?: string;
  replayedStoreHash?: string;
  effects: BuilderMinimizationEffects;
  summary: BuilderMinimizationSummary;
  accounting: BuilderMinimizationAccountingSnapshot;
};

export type BuilderMinimizationJournal = {
  version: typeof BUILDER_MINIMIZATION_JOURNAL_VERSION;
  events: BuilderMinimizationJournalEvent[];
};

export type BuilderRestoreReplayGate = {
  version: 1;
  journalHash: string;
  startedAt: string;
  storeBeforeHash: string;
};

export type BuilderRestoreReplayInvariants = Readonly<{
  usageUnchanged: boolean;
  accountingPreserved: boolean;
  relationshipsValid: boolean;
  effectsComplete: boolean;
}>;

export type BuilderRestoreReplayReceipt = {
  version: 1;
  kind: "builder-minimization-replay";
  receiptId: string;
  journalFile: string;
  journalHash: string;
  journalEventCount: number;
  appliedEventIds: string[];
  alreadyAppliedEventIds: string[];
  absentSubjectIds: string[];
  storeBeforeHash: string;
  storeAfterHash: string;
  accountingBefore: BuilderMinimizationAccountingSnapshot;
  accountingAfter: BuilderMinimizationAccountingSnapshot;
  invariants: BuilderRestoreReplayInvariants;
  status: "complete";
  createdAt: string;
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

/** The canonical store serialization used for both writes and plan hashes. */
export function serializeBuilderIdentityStore(store: BuilderIdentityStore): string {
  return `${JSON.stringify(store, null, 2)}\n`;
}

export function emptyBuilderMinimizationJournal(): BuilderMinimizationJournal {
  return {
    version: BUILDER_MINIMIZATION_JOURNAL_VERSION,
    events: [],
  };
}

export function serializeBuilderMinimizationJournal(
  journal: BuilderMinimizationJournal,
): string {
  return `${JSON.stringify(journal, null, 2)}\n`;
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

const HASH_PATTERN = /^[a-f0-9]{64}$/;
const EVENT_ID_PATTERN = /^mnj_[a-f0-9]{24}$/;
const RECORD_ID_PATTERN = /^[A-Za-z0-9_.:-]{1,160}$/;
function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasOnlyKeys(
  record: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = [],
): boolean {
  const allowed = new Set([...required, ...optional]);
  return (
    required.every((key) => key in record) &&
    Object.keys(record).every((key) => allowed.has(key))
  );
}

function boundedId(value: unknown): value is string {
  return typeof value === "string" && RECORD_ID_PATTERN.test(value);
}

function validDate(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function validHash(value: unknown): value is string {
  return typeof value === "string" && HASH_PATTERN.test(value);
}

function uniqueBoundedIds(value: unknown): value is string[] {
  if (!Array.isArray(value) || value.length > 20_000) return false;
  const seen = new Set<string>();
  for (const item of value) {
    if (!boundedId(item) || seen.has(item)) return false;
    seen.add(item);
  }
  return true;
}

export function validBuilderMinimizationEffects(
  value: unknown,
): value is BuilderMinimizationEffects {
  if (!isRecord(value)) return false;
  if (!hasOnlyKeys(value, ["subject", "invites", "sessions", "usageIds"])) return false;
  const subject = value.subject;
  if (
    !isRecord(subject) ||
    !hasOnlyKeys(subject, ["id", "revoke", "minimizeLabel"]) ||
    !boundedId(subject.id) ||
    typeof subject.revoke !== "boolean" ||
    typeof subject.minimizeLabel !== "boolean"
  ) {
    return false;
  }
  if (!Array.isArray(value.invites) || !Array.isArray(value.sessions)) return false;
  if (value.invites.length > 20_000 || value.sessions.length > 20_000) return false;
  const inviteIds = new Set<string>();
  for (const invite of value.invites) {
    if (
      !isRecord(invite) ||
      !hasOnlyKeys(invite, ["id", "revoke", "minimizeLabel", "minimizeToken"]) ||
      !boundedId(invite.id) ||
      inviteIds.has(invite.id) ||
      typeof invite.revoke !== "boolean" ||
      typeof invite.minimizeLabel !== "boolean" ||
      typeof invite.minimizeToken !== "boolean"
    ) {
      return false;
    }
    inviteIds.add(invite.id);
  }
  const sessionIds = new Set<string>();
  for (const session of value.sessions) {
    if (
      !isRecord(session) ||
      !hasOnlyKeys(session, ["id", "revoke", "minimizeToken"]) ||
      !boundedId(session.id) ||
      sessionIds.has(session.id) ||
      typeof session.revoke !== "boolean" ||
      typeof session.minimizeToken !== "boolean"
    ) {
      return false;
    }
    sessionIds.add(session.id);
  }
  return uniqueBoundedIds(value.usageIds);
}

export function validBuilderMinimizationAccountingSnapshot(
  value: unknown,
): value is BuilderMinimizationAccountingSnapshot {
  if (!isRecord(value)) return false;
  const keys = [
    "usageRecords",
    "requestKeys",
    "reservedRecords",
    "succeededRecords",
    "failedRecords",
    "unknownRecords",
    "settledCostMicros",
    "reservedCostMicros",
    "unknownCostMicros",
    "effectiveCostMicros",
  ];
  if (!hasOnlyKeys(value, [...keys, "usageHash"])) return false;
  for (const key of keys) {
    const item = value[key];
    if (!Number.isSafeInteger(item) || (item as number) < 0) return false;
  }
  return validHash(value.usageHash);
}

export function validBuilderMinimizationSummary(
  value: unknown,
): value is BuilderMinimizationSummary {
  if (!isRecord(value)) return false;
  const keys = [
    "subjectsAffected",
    "invitesAffected",
    "sessionsAffected",
    "inviteRevocations",
    "sessionRevocations",
    "labelsMinimized",
    "tokensMinimized",
    "usageRecordsPreserved",
  ];
  if (!hasOnlyKeys(value, keys)) return false;
  return keys.every(
    (key) => Number.isSafeInteger(value[key]) && (value[key] as number) >= 0,
  );
}

function validJournalEvent(value: unknown): value is BuilderMinimizationJournalEvent {
  if (!isRecord(value)) return false;
  const required = [
    "version",
    "id",
    "kind",
    "phase",
    "subjectId",
    "planId",
    "plannedStoreHash",
    "expectedResultHash",
    "effectAt",
    "createdAt",
    "effects",
    "summary",
    "accounting",
  ];
  const optional = [
    "completedAt",
    "resultStoreHash",
    "replayedAt",
    "replayedStoreHash",
  ];
  if (!hasOnlyKeys(value, required, optional)) return false;
  if (value.version !== BUILDER_MINIMIZATION_JOURNAL_VERSION) return false;
  if (typeof value.id !== "string" || !EVENT_ID_PATTERN.test(value.id)) return false;
  if (value.kind !== "subject_minimization") return false;
  if (value.phase !== "pending" && value.phase !== "completed") return false;
  if (!boundedId(value.subjectId)) return false;
  if (!validHash(value.planId)) return false;
  if (!validHash(value.plannedStoreHash)) return false;
  if (!validHash(value.expectedResultHash)) return false;
  if (!validDate(value.effectAt) || !validDate(value.createdAt)) return false;
  if (value.completedAt !== undefined && !validDate(value.completedAt)) return false;
  if (value.resultStoreHash !== undefined && !validHash(value.resultStoreHash)) return false;
  if (value.replayedAt !== undefined && !validDate(value.replayedAt)) return false;
  if (value.replayedStoreHash !== undefined && !validHash(value.replayedStoreHash)) return false;
  if (value.phase === "completed" && !value.resultStoreHash) return false;
  if (value.replayedAt !== undefined && !value.replayedStoreHash) return false;
  if (value.phase === "completed" && !value.completedAt) return false;
  if (!validBuilderMinimizationEffects(value.effects)) return false;
  if (value.effects.subject.id !== value.subjectId) return false;
  const summary = value.summary;
  if (!validBuilderMinimizationSummary(summary)) return false;
  if (!validBuilderMinimizationAccountingSnapshot(value.accounting)) return false;
  const effects = value.effects;
  const expectedSummary = {
    subjectsAffected: 1,
    invitesAffected: effects.invites.length,
    sessionsAffected: effects.sessions.length,
    inviteRevocations: effects.invites.filter((item) => item.revoke).length,
    sessionRevocations: effects.sessions.filter((item) => item.revoke).length,
    labelsMinimized:
      (effects.subject.minimizeLabel ? 1 : 0) +
      effects.invites.filter((item) => item.minimizeLabel).length,
    tokensMinimized:
      effects.invites.filter((item) => item.minimizeToken).length +
      effects.sessions.filter((item) => item.minimizeToken).length,
    usageRecordsPreserved: effects.usageIds.length,
  };
  return (Object.keys(expectedSummary) as Array<keyof typeof expectedSummary>).every(
    (key) => summary[key] === expectedSummary[key],
  );
}

export function validBuilderMinimizationJournal(
  value: unknown,
): value is BuilderMinimizationJournal {
  if (!isRecord(value)) return false;
  if (!hasOnlyKeys(value, ["version", "events"])) return false;
  if (value.version !== BUILDER_MINIMIZATION_JOURNAL_VERSION) return false;
  if (!Array.isArray(value.events) || value.events.length > 100_000) return false;
  const ids = new Set<string>();
  const planIds = new Set<string>();
  for (const event of value.events) {
    if (!validJournalEvent(event)) return false;
    if (ids.has(event.id) || planIds.has(event.planId)) return false;
    ids.add(event.id);
    planIds.add(event.planId);
  }
  return true;
}

function validReplayGate(value: unknown): value is BuilderRestoreReplayGate {
  if (!isRecord(value)) return false;
  return (
    hasOnlyKeys(value, ["version", "journalHash", "startedAt", "storeBeforeHash"]) &&
    value.version === 1 &&
    validHash(value.journalHash) &&
    validDate(value.startedAt) &&
    validHash(value.storeBeforeHash)
  );
}

function validReplayReceipt(value: unknown): value is BuilderRestoreReplayReceipt {
  if (!isRecord(value)) return false;
  const required = [
    "version",
    "kind",
    "receiptId",
    "journalFile",
    "journalHash",
    "journalEventCount",
    "appliedEventIds",
    "alreadyAppliedEventIds",
    "absentSubjectIds",
    "storeBeforeHash",
    "storeAfterHash",
    "accountingBefore",
    "accountingAfter",
    "invariants",
    "status",
    "createdAt",
  ];
  if (!hasOnlyKeys(value, required)) return false;
  if (value.version !== 1 || value.kind !== "builder-minimization-replay") return false;
  if (typeof value.receiptId !== "string" || !boundedId(value.receiptId)) return false;
  if (
    typeof value.journalFile !== "string" ||
    value.journalFile.length === 0 ||
    value.journalFile.length > 255
  ) {
    return false;
  }
  if (!validHash(value.journalHash)) return false;
  if (!Number.isSafeInteger(value.journalEventCount) || (value.journalEventCount as number) < 0) {
    return false;
  }
  if (!uniqueBoundedIds(value.appliedEventIds)) return false;
  if (!uniqueBoundedIds(value.alreadyAppliedEventIds)) return false;
  if (!uniqueBoundedIds(value.absentSubjectIds)) return false;
  if (!validHash(value.storeBeforeHash) || !validHash(value.storeAfterHash)) return false;
  if (!validBuilderMinimizationAccountingSnapshot(value.accountingBefore)) return false;
  if (!validBuilderMinimizationAccountingSnapshot(value.accountingAfter)) return false;
  if (!isRecord(value.invariants) || !hasOnlyKeys(value.invariants, [
    "usageUnchanged",
    "accountingPreserved",
    "relationshipsValid",
    "effectsComplete",
  ])) {
    return false;
  }
  if (Object.values(value.invariants).some((item) => typeof item !== "boolean")) {
    return false;
  }
  if (value.status !== "complete" || !validDate(value.createdAt)) return false;
  return true;
}

function hashBytes(bytes: Buffer | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function readStoreSnapshotUnlocked(
  storeDir: string,
): Promise<{ store: BuilderIdentityStore; bytes: Buffer; hash: string }> {
  const file = storePath(storeDir);
  let bytes: Buffer;
  try {
    bytes = await readFile(file);
  } catch (error) {
    if (errnoCode(error) === "ENOENT") {
      const store = emptyStore();
      const payload = serializeBuilderIdentityStore(store);
      return { store, bytes: Buffer.from(payload, "utf8"), hash: hashBytes(payload) };
    }
    throw new BuilderStoreUnavailable();
  }

  try {
    const parsed: unknown = JSON.parse(bytes.toString("utf8"));
    if (!validStore(parsed)) throw new Error("unsupported store shape");
    return { store: parsed, bytes, hash: hashBytes(bytes) };
  } catch {
    throw new BuilderStoreUnavailable(
      "Builder identity storage is corrupt or has an unsupported version.",
    );
  }
}

async function readStoreUnlocked(storeDir: string): Promise<BuilderIdentityStore> {
  return (await readStoreSnapshotUnlocked(storeDir)).store;
}

export async function readBuilderIdentityStoreHash(storeDir: string): Promise<string> {
  return (await readStoreSnapshotUnlocked(storeDir)).hash;
}

export type BuilderMinimizationJournalRead = Readonly<{
  journal: BuilderMinimizationJournal;
  present: boolean;
  hash: string | null;
}>;

export async function readBuilderMinimizationJournalUnlocked(
  storeDir: string,
): Promise<BuilderMinimizationJournalRead> {
  const file = path.join(path.resolve(storeDir), BUILDER_MINIMIZATION_JOURNAL_FILE);
  let bytes: Buffer;
  try {
    bytes = await readFile(file);
  } catch (error) {
    if (errnoCode(error) === "ENOENT") {
      return { journal: emptyBuilderMinimizationJournal(), present: false, hash: null };
    }
    throw new BuilderStoreUnavailable(
      "Builder minimisation journal is unreadable; stop and restore it before continuing.",
    );
  }
  try {
    const parsed: unknown = JSON.parse(bytes.toString("utf8"));
    if (!validBuilderMinimizationJournal(parsed)) {
      throw new Error("unsupported journal shape");
    }
    return { journal: parsed, present: true, hash: hashBytes(bytes) };
  } catch {
    throw new BuilderStoreUnavailable(
      "Builder minimisation journal is corrupt or has an unsupported version.",
    );
  }
}

export async function readBuilderMinimizationJournal(
  storeDir: string,
): Promise<BuilderMinimizationJournalRead> {
  return readBuilderMinimizationJournalUnlocked(storeDir);
}

export function builderMinimizationJournalHasPending(
  journal: BuilderMinimizationJournal,
): boolean {
  return journal.events.some((event) => event.phase === "pending");
}

export async function assertNoPendingBuilderMinimization(
  storeDir: string,
): Promise<void> {
  const { journal } = await readBuilderMinimizationJournalUnlocked(storeDir);
  if (builderMinimizationJournalHasPending(journal)) {
    throw new BuilderStoreUnavailable(
      "A pending builder minimisation journal entry must be completed before the store accepts another write.",
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

async function writeJsonFileAtomic(
  directory: string,
  fileName: string,
  payload: string,
): Promise<string> {
  await mkdir(directory, { recursive: true });
  const temporary = path.join(
    directory,
    `.${fileName}.${process.pid}${PROCESS_SCOPE_SEGMENT}.${randomBytes(6).toString("hex")}.tmp`,
  );
  try {
    const handle = await open(temporary, "wx", 0o600);
    try {
      await handle.writeFile(payload, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temporary, path.join(directory, fileName));
    await syncDirectory(directory);
    return hashBytes(payload);
  } catch {
    try {
      await rm(temporary, { force: true });
    } catch {
      // The original write failure remains the actionable error.
    }
    throw new BuilderStoreUnavailable();
  }
}

async function writeStoreUnlocked(
  storeDir: string,
  store: BuilderIdentityStore,
): Promise<string> {
  const directory = path.resolve(storeDir);
  return writeJsonFileAtomic(
    directory,
    BUILDER_IDENTITY_STORE_FILE,
    serializeBuilderIdentityStore(store),
  );
}

export async function writeBuilderMinimizationJournalUnlocked(
  storeDir: string,
  journal: BuilderMinimizationJournal,
): Promise<string> {
  if (!validBuilderMinimizationJournal(journal)) {
    throw new BuilderStoreUnavailable(
      "Refusing to write an invalid builder minimisation journal.",
    );
  }
  return writeJsonFileAtomic(
    path.resolve(storeDir),
    BUILDER_MINIMIZATION_JOURNAL_FILE,
    serializeBuilderMinimizationJournal(journal),
  );
}

export async function writeBuilderRestoreReplayGateUnlocked(
  storeDir: string,
  gate: BuilderRestoreReplayGate,
): Promise<string> {
  if (!validReplayGate(gate)) {
    throw new BuilderStoreUnavailable("Refusing to write an invalid restore replay gate.");
  }
  return writeJsonFileAtomic(
    path.resolve(storeDir),
    BUILDER_RESTORE_REPLAY_GATE_FILE,
    `${JSON.stringify(gate, null, 2)}\n`,
  );
}

export async function removeBuilderRestoreReplayGate(storeDir: string): Promise<void> {
  await rm(path.join(path.resolve(storeDir), BUILDER_RESTORE_REPLAY_GATE_FILE), {
    force: true,
  });
}

export async function writeBuilderRestoreReplayReceiptUnlocked(
  storeDir: string,
  receipt: BuilderRestoreReplayReceipt,
): Promise<string> {
  if (!validReplayReceipt(receipt)) {
    throw new BuilderStoreUnavailable("Refusing to write an invalid restore replay receipt.");
  }
  return writeJsonFileAtomic(
    path.resolve(storeDir),
    BUILDER_RESTORE_REPLAY_RECEIPT_FILE,
    `${JSON.stringify(receipt, null, 2)}\n`,
  );
}

async function readJsonEvidence(
  file: string,
): Promise<{ present: boolean; value: unknown; error: string | null }> {
  try {
    return { present: true, value: JSON.parse(await readFile(file, "utf8")), error: null };
  } catch (error) {
    if (errnoCode(error) === "ENOENT") return { present: false, value: null, error: null };
    return { present: true, value: null, error: "unreadable" };
  }
}

export async function readBuilderRestoreReplayGate(
  storeDir: string,
): Promise<
  Readonly<{
    present: boolean;
    valid: boolean;
    value: BuilderRestoreReplayGate | null;
    error: string | null;
  }>
> {
  const read = await readJsonEvidence(
    path.join(path.resolve(storeDir), BUILDER_RESTORE_REPLAY_GATE_FILE),
  );
  return {
    present: read.present,
    valid: !read.error && validReplayGate(read.value),
    value: validReplayGate(read.value) ? read.value : null,
    error: read.error,
  };
}

export async function readBuilderRestoreReplayReceipt(
  storeDir: string,
): Promise<
  Readonly<{
    present: boolean;
    valid: boolean;
    value: BuilderRestoreReplayReceipt | null;
    error: string | null;
  }>
> {
  const read = await readJsonEvidence(
    path.join(path.resolve(storeDir), BUILDER_RESTORE_REPLAY_RECEIPT_FILE),
  );
  return {
    present: read.present,
    valid: !read.error && validReplayReceipt(read.value),
    value: validReplayReceipt(read.value) ? read.value : null,
    error: read.error,
  };
}

/**
 * Startup/restore gate. A normal primary store has no gate. A failed or
 * interrupted offline replay leaves the gate behind, so the restored store
 * cannot be opened until a complete receipt for the same journal and store
 * hash exists.
 */
export async function assertBuilderStoreReplayReady(storeDir: string): Promise<void> {
  const directory = path.resolve(storeDir);
  const gateRead = await readJsonEvidence(
    path.join(directory, BUILDER_RESTORE_REPLAY_GATE_FILE),
  );
  if (!gateRead.present) return;
  if (gateRead.error || !validReplayGate(gateRead.value)) {
    throw new BuilderStoreUnavailable(
      "Restore replay gate is present but unreadable; run the offline replay again.",
    );
  }
  const receiptRead = await readJsonEvidence(
    path.join(directory, BUILDER_RESTORE_REPLAY_RECEIPT_FILE),
  );
  if (!receiptRead.present || receiptRead.error || !validReplayReceipt(receiptRead.value)) {
    throw new BuilderStoreUnavailable(
      "Restored store has no valid replay receipt; do not open it.",
    );
  }
  const receipt = receiptRead.value;
  const gate = gateRead.value;
  if (receipt.journalHash !== gate.journalHash) {
    throw new BuilderStoreUnavailable(
      "Restore replay receipt does not match the pending replay gate.",
    );
  }
  const currentHash = await readBuilderIdentityStoreHash(directory);
  if (receipt.storeAfterHash !== currentHash) {
    throw new BuilderStoreUnavailable(
      "Restored store changed after replay; run the offline replay again.",
    );
  }
  if (Object.values(receipt.invariants).some((item) => item !== true)) {
    throw new BuilderStoreUnavailable(
      "Restore replay receipt reports a failed accounting invariant.",
    );
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
    ...(PROCESS_SCOPE ? { scope: PROCESS_SCOPE } : {}),
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
  const temporary = `${filePath}.${process.pid}${PROCESS_SCOPE_SEGMENT}.${randomBytes(6).toString("hex")}.tmp`;
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
      (record.scope !== undefined &&
        (typeof record.scope !== "string" ||
          record.scope.length === 0 ||
          record.scope.length > 512)) ||
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
        ...(record.scope === undefined ? {} : { scope: record.scope }),
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
  if (!PROCESS_SCOPE_PROVEN || !PROCESS_SCOPE) return false;
  const acquiredAt = Date.parse(metadata.acquiredAt);
  return (
    metadata.hostname === STORE_HOST_ID &&
    metadata.scope === PROCESS_SCOPE &&
    Number.isFinite(acquiredAt) &&
    acquiredAt >= PROCESS_BOOT_MS &&
    processOwnerState(metadata.pid) === "dead"
  );
}

export type BuilderStoreLockOwnerState =
  | "missing"
  | "invalid"
  | "live"
  | "dead"
  | "foreign_host"
  | "foreign_scope"
  | "unproven_scope"
  | "unprovable";

export type BuilderStoreLockSnapshot = Readonly<{
  name: string;
  present: boolean;
  valid: boolean;
  owner: BuilderStoreLockOwnerState;
  metadata: Readonly<{
    version: 1;
    token: string;
    pid: number;
    hostname: string;
    scope: string | null;
    acquiredAt: string;
  }> | null;
}>;

export type BuilderStoreInspection = Readonly<{
  storeDir: string;
  hostId: string;
  storePresent: boolean;
  storeVersion: number | null;
  storeError: string | null;
  lock: BuilderStoreLockSnapshot;
  reapLock: BuilderStoreLockSnapshot;
  journal: Readonly<{
    present: boolean;
    valid: boolean;
    eventCount: number;
    pendingCount: number;
    hash: string | null;
    error: string | null;
  }>;
  restore: Readonly<{
    gatePresent: boolean;
    receiptPresent: boolean;
    replayReady: boolean;
  }>;
  temporaryFiles: readonly string[];
}>;

/**
 * Read-only diagnostics for the operator CLI. It never removes or rewrites a
 * lock. A same-host PID can look live after a container replacement because a
 * fresh container reuses low PIDs, so `recover-lock` requires an explicit
 * no-writer confirmation and the observed token instead of trusting this state.
 */
export async function inspectBuilderStoreLock(
  storeDir: string,
  fileName: string = BUILDER_IDENTITY_LOCK_FILE,
): Promise<BuilderStoreLockSnapshot> {
  const name = path.basename(fileName);
  const observed = await readLockMetadata(path.join(path.resolve(storeDir), name));
  if (observed.kind === "missing") {
    return { name, present: false, valid: false, owner: "missing", metadata: null };
  }
  if (observed.kind === "invalid") {
    return { name, present: true, valid: false, owner: "invalid", metadata: null };
  }
  const metadata = observed.metadata;
  const acquiredAt = Date.parse(metadata.acquiredAt);
  let owner: BuilderStoreLockOwnerState;
  if (metadata.hostname !== STORE_HOST_ID) {
    owner = "foreign_host";
  } else if (!PROCESS_SCOPE_PROVEN || !PROCESS_SCOPE) {
    owner = "unproven_scope";
  } else if (
    metadata.scope !== PROCESS_SCOPE ||
    !Number.isFinite(acquiredAt) ||
    acquiredAt < PROCESS_BOOT_MS
  ) {
    owner = "foreign_scope";
  } else {
    const state = processOwnerState(metadata.pid);
    owner = state === "alive" ? "live" : state === "dead" ? "dead" : "unprovable";
  }
  return {
    name,
    present: true,
    valid: true,
    owner,
    metadata: {
      version: metadata.version,
      token: metadata.token,
      pid: metadata.pid,
      hostname: metadata.hostname,
      scope: metadata.scope ?? null,
      acquiredAt: metadata.acquiredAt,
    },
  };
}

export async function inspectBuilderStore(
  storeDir: string,
): Promise<BuilderStoreInspection> {
  const directory = path.resolve(storeDir);
  let storePresent = false;
  let storeVersion: number | null = null;
  let storeError: string | null = null;
  try {
    const parsed: unknown = JSON.parse(
      await readFile(path.join(directory, BUILDER_IDENTITY_STORE_FILE), "utf8"),
    );
    storePresent = true;
    if (validStore(parsed)) storeVersion = parsed.version;
    else storeError = "unsupported_store_shape";
  } catch (error) {
    if (errnoCode(error) !== "ENOENT") {
      storePresent = true;
      storeError = "unreadable_store";
    }
  }

  let temporaryFiles: string[] = [];
  try {
    temporaryFiles = (await readdir(directory))
      .filter(
        (entry) =>
          entry.endsWith(".tmp") &&
          (entry.includes(BUILDER_IDENTITY_STORE_FILE) ||
            entry.includes(BUILDER_IDENTITY_LOCK_FILE) ||
            entry.includes(REAP_LOCK_FILE) ||
            entry.includes(BUILDER_MINIMIZATION_JOURNAL_FILE) ||
            entry.includes(BUILDER_RESTORE_REPLAY_GATE_FILE) ||
            entry.includes(BUILDER_RESTORE_REPLAY_RECEIPT_FILE)),
      )
      .sort();
  } catch {
    // A missing directory is reported by the store fields.
  }

  let journal: {
    present: boolean;
    valid: boolean;
    eventCount: number;
    pendingCount: number;
    hash: string | null;
    error: string | null;
  } = { present: false, valid: false, eventCount: 0, pendingCount: 0, hash: null, error: null };
  try {
    const read = await readBuilderMinimizationJournalUnlocked(directory);
    journal = {
      present: read.present,
      valid: true,
      eventCount: read.journal.events.length,
      pendingCount: read.journal.events.filter((event) => event.phase === "pending").length,
      hash: read.hash,
      error: null,
    };
  } catch {
    journal = { present: true, valid: false, eventCount: 0, pendingCount: 0, hash: null, error: "invalid_journal" };
  }

  let replayReady = true;
  try {
    await assertBuilderStoreReplayReady(directory);
  } catch {
    replayReady = false;
  }

  return {
    storeDir: directory,
    hostId: STORE_HOST_ID,
    storePresent,
    storeVersion,
    storeError,
    lock: await inspectBuilderStoreLock(directory),
    reapLock: await inspectBuilderStoreLock(directory, REAP_LOCK_FILE),
    journal,
    restore: {
      gatePresent: (await readJsonEvidence(path.join(directory, BUILDER_RESTORE_REPLAY_GATE_FILE))).present,
      receiptPresent: (await readJsonEvidence(path.join(directory, BUILDER_RESTORE_REPLAY_RECEIPT_FILE))).present,
      replayReady,
    },
    temporaryFiles,
  };
}

export type BuilderStoreLockRecovery = Readonly<{
  storeDir: string;
  hostId: string;
  recovered: readonly string[];
  quarantined: readonly string[];
  storeHash: string;
  storeUnchanged: boolean;
}>;

/**
 * Operator-only recovery for a lock that the automatic reaper cannot prove
 * dead (a changed host id, a corrupt owner, or a replaced container whose PID
 * namespace now maps an old owner to a live PID).
 *
 * Safety properties:
 * - requires an explicit no-writer confirmation;
 * - binds to the token observed by `lock-status`, so a successor lock is not
 *   silently displaced;
 * - refuses to proceed when `identity-store.json` is missing or unreadable;
 * - renames locks to timestamped quarantine files instead of deleting them;
 * - verifies that the store bytes did not change during recovery.
 */
export async function recoverBuilderStoreLock(input: {
  storeDir: string;
  expectedToken: string;
  expectedReapToken?: string;
  confirmNoWriters: boolean;
}): Promise<BuilderStoreLockRecovery> {
  if (!input.confirmNoWriters) {
    throw new BuilderStoreUnavailable(
      "Lock recovery requires an explicit no-writer confirmation.",
    );
  }

  const directory = path.resolve(input.storeDir);
  const storePath = path.join(directory, BUILDER_IDENTITY_STORE_FILE);
  let storeBytes: Buffer;
  try {
    storeBytes = await readFile(storePath);
  } catch {
    throw new BuilderStoreUnavailable(
      "identity-store.json is missing or unreadable; restore the store before lock recovery.",
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(storeBytes.toString("utf8"));
  } catch {
    throw new BuilderStoreUnavailable(
      "identity-store.json is not valid JSON; restore it before lock recovery.",
    );
  }
  if (!validStore(parsed)) {
    throw new BuilderStoreUnavailable(
      "identity-store.json has an unsupported shape; restore it before lock recovery.",
    );
  }
  const beforeHash = createHash("sha256").update(storeBytes).digest("hex");

  const mainPath = path.join(directory, BUILDER_IDENTITY_LOCK_FILE);
  const reapPath = path.join(directory, REAP_LOCK_FILE);
  const mainToken = input.expectedToken?.trim() ?? "";
  const reapToken = input.expectedReapToken?.trim();
  const mainObserved = await readLockMetadata(mainPath);
  const reapObserved = await readLockMetadata(reapPath);

  if (mainObserved.kind === "invalid") {
    throw new BuilderStoreUnavailable(
      "identity-store.lock metadata is unreadable; inspect it manually before recovery.",
    );
  }
  if (mainObserved.kind === "valid" && !mainToken) {
    throw new BuilderStoreUnavailable(
      "The observed identity-store.lock token is required.",
    );
  }
  if (mainObserved.kind === "valid" && mainToken !== mainObserved.metadata.token) {
    throw new BuilderStoreUnavailable(
      "identity-store.lock changed; run lock-status again before recovery.",
    );
  }
  if (reapObserved.kind === "invalid") {
    throw new BuilderStoreUnavailable(
      "identity-store.reap.lock metadata is unreadable; inspect it manually before recovery.",
    );
  }
  if (reapObserved.kind === "valid" && (!reapToken || reapToken !== reapObserved.metadata.token)) {
    throw new BuilderStoreUnavailable(
      "identity-store.reap.lock is present or changed; pass its observed token as --reap-token.",
    );
  }

  const quarantined: string[] = [];
  const recovered: string[] = [];
  const quarantine = async (
    filePath: string,
    name: string,
    token: string,
  ): Promise<void> => {
    const observed = await readLockMetadata(filePath);
    if (observed.kind === "missing") return;
    if (observed.kind !== "valid" || observed.metadata.token !== token) {
      throw new BuilderStoreUnavailable(
        `${name} changed during recovery; another writer may be active.`,
      );
    }
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const target = `${filePath}.recovered.${stamp}.${process.pid}.${randomBytes(4).toString("hex")}`;
    try {
      await rename(filePath, target);
    } catch (error) {
      if (errnoCode(error) === "ENOENT") return;
      throw new BuilderStoreUnavailable();
    }
    const moved = await readLockMetadata(target);
    if (moved.kind !== "valid" || moved.metadata.token !== token) {
      try {
        await link(target, filePath);
      } catch {
        // The mismatch is reported below; the quarantine file is preserved.
      }
      await rm(target, { force: true });
      throw new BuilderStoreUnavailable(
        `${name} changed during recovery; another writer may be active.`,
      );
    }
    quarantined.push(target);
    recovered.push(name);
  };

  if (reapObserved.kind === "valid") {
    await quarantine(reapPath, REAP_LOCK_FILE, reapToken as string);
  }
  if (mainObserved.kind === "valid") {
    await quarantine(mainPath, BUILDER_IDENTITY_LOCK_FILE, mainToken);
  }

  let afterHash: string;
  try {
    afterHash = createHash("sha256").update(await readFile(storePath)).digest("hex");
  } catch {
    throw new BuilderStoreUnavailable(
      "identity-store.json disappeared during lock recovery; stop and restore the store.",
    );
  }

  return {
    storeDir: directory,
    hostId: STORE_HOST_ID,
    recovered,
    quarantined,
    storeHash: beforeHash,
    storeUnchanged: beforeHash === afterHash,
  };
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
  if (!PROCESS_SCOPE_PROVEN || !PROCESS_SCOPE_TOKEN) return;
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
      !entry.name.includes(REAP_LOCK_FILE) &&
      !entry.name.includes(BUILDER_MINIMIZATION_JOURNAL_FILE) &&
      !entry.name.includes(BUILDER_RESTORE_REPLAY_GATE_FILE) &&
      !entry.name.includes(BUILDER_RESTORE_REPLAY_RECEIPT_FILE)
    ) {
      continue;
    }
    const match = /\.(\d+)\.([a-f0-9]{16})\.[a-f0-9]+\.tmp$/.exec(entry.name);
    if (!match || match[2] !== PROCESS_SCOPE_TOKEN) continue;
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

export type BuilderStoreFileTransaction = Readonly<{
  directory: string;
  store: BuilderIdentityStore;
  storeBytes: Buffer;
  storeHash: string;
  journal: BuilderMinimizationJournal;
  journalPresent: boolean;
  journalHash: string | null;
  /** Writes the current store atomically and returns its new SHA-256 hash. */
  writeStore: () => Promise<string>;
  /** Writes a complete journal atomically and returns its SHA-256 hash. */
  writeJournal: (journal: BuilderMinimizationJournal) => Promise<string>;
}>;

/**
 * Low-level locked transaction used by the minimisation/replay path. Unlike
 * withBuilderIdentityStore it does not auto-write, and it deliberately permits
 * a pending journal so the same command can finish an interrupted request.
 */
async function withStoreLockFiles<T>(
  storeDir: string,
  operation: (transaction: BuilderStoreFileTransaction) => Promise<T> | T,
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
    const snapshot = await readStoreSnapshotUnlocked(directory);
    const journalRead = await readBuilderMinimizationJournalUnlocked(directory);
    const transaction: BuilderStoreFileTransaction = {
      directory,
      store: snapshot.store,
      storeBytes: snapshot.bytes,
      storeHash: snapshot.hash,
      journal: journalRead.journal,
      journalPresent: journalRead.present,
      journalHash: journalRead.hash,
      writeStore: () => writeStoreUnlocked(directory, snapshot.store),
      writeJournal: (journal) =>
        writeBuilderMinimizationJournalUnlocked(directory, journal),
    };
    return await operation(transaction);
  } finally {
    await releaseOwnedFile(lockPath, token);
  }
}

async function withStoreLock<T>(
  storeDir: string,
  operation: (store: BuilderIdentityStore) => Promise<T> | T,
  options: BuilderStoreLockOptions = {},
): Promise<T> {
  return withStoreLockFiles(
    storeDir,
    async (transaction) => {
      if (builderMinimizationJournalHasPending(transaction.journal)) {
        throw new BuilderStoreUnavailable(
          "A pending builder minimisation journal entry must be completed before the store accepts another write.",
        );
      }
      const result = await operation(transaction.store);
      await transaction.writeStore();
      return result;
    },
    options,
  );
}

/**
 * Locked store+journal transaction for operator recovery. The caller controls
 * whether and when the store is written, which is required for the durable
 * pending-journal / store-write / completion ordering.
 */
export async function withBuilderIdentityStoreFiles<T>(
  storeDir: string,
  operation: (transaction: BuilderStoreFileTransaction) => Promise<T> | T,
  options: BuilderStoreLockOptions = {},
): Promise<T> {
  return withStoreLockFiles(storeDir, operation, options);
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
    const journal = await readBuilderMinimizationJournalUnlocked(input.storeDir);
    if (builderMinimizationJournalHasPending(journal.journal)) {
      return "unavailable";
    }
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
  const journal = await readBuilderMinimizationJournalUnlocked(input.storeDir);
  if (builderMinimizationJournalHasPending(journal.journal)) {
    throw new BuilderStoreUnavailable(
      "Builder storage is waiting for a minimisation journal replay.",
    );
  }
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
