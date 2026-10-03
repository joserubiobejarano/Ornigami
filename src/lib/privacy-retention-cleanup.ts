import { sql } from "@/lib/db/neon";
import { safeLogger } from "@/lib/safe-logger";
import {
  dateDaysAgo,
  PRIVACY_CLEANUP_BATCH_SIZE,
  PRIVACY_CLEANUP_MAX_BATCH_SIZE,
  PRIVACY_CLEANUP_TABLES,
  PRIVACY_RETENTION_DAYS,
  PUBLIC_DEMO_CHALLENGE_EXPIRY_GRACE_DAYS,
} from "@/lib/privacy-retention";

export type PrivacyCleanupOperation = {
  table: typeof PRIVACY_CLEANUP_TABLES[number];
  deleted: number;
  failed: boolean;
  fullBatch: boolean;
};

export type PrivacyCleanupStatus = "succeeded" | "partial" | "failed" | "no_work";

export type PrivacyCleanupResult = {
  attempted: number;
  deleted: number;
  failed: number;
  batchSize: number;
  status: PrivacyCleanupStatus;
  nextCursor: number;
  backlog: boolean;
  operations: PrivacyCleanupOperation[];
};

async function deleteExpiredBatch(table: typeof PRIVACY_CLEANUP_TABLES[number], batchSize: number, now: Date): Promise<number> {
  const nowMs = now.getTime();
  const leadsCutoff = dateDaysAgo(PRIVACY_RETENTION_DAYS.leads, nowMs);
  const feedbackCutoff = dateDaysAgo(PRIVACY_RETENTION_DAYS.feedback, nowMs);
  const demoEventsCutoff = dateDaysAgo(PRIVACY_RETENTION_DAYS.publicDemoEvents, nowMs);
  const clicksCutoff = dateDaysAgo(PRIVACY_RETENTION_DAYS.reviewLinkClicks, nowMs);
  const integrationCutoff = dateDaysAgo(PRIVACY_RETENTION_DAYS.followupIntegrationEvents, nowMs);
  const cronRunsCutoff = dateDaysAgo(PRIVACY_RETENTION_DAYS.cronRuns, nowMs);
  const stateCutoff = dateDaysAgo(PRIVACY_RETENTION_DAYS.rateLimitState, nowMs);
  let rows: Array<{ deleted?: number }>;

  switch (table) {
    case "leads":
      rows = await sql`WITH candidates AS (SELECT ctid FROM public.leads WHERE created_at < ${leadsCutoff} ORDER BY created_at LIMIT ${batchSize}),
        deleted AS (DELETE FROM public.leads WHERE ctid IN (SELECT ctid FROM candidates) RETURNING 1)
        SELECT count(*)::int AS deleted FROM deleted`;
      break;
    case "feedback":
      rows = await sql`WITH candidates AS (SELECT ctid FROM public.feedback WHERE created_at < ${feedbackCutoff} ORDER BY created_at LIMIT ${batchSize}),
        deleted AS (DELETE FROM public.feedback WHERE ctid IN (SELECT ctid FROM candidates) RETURNING 1)
        SELECT count(*)::int AS deleted FROM deleted`;
      break;
    case "public_demo_events":
      rows = await sql`WITH candidates AS (SELECT ctid FROM public.public_demo_events WHERE event_date < ${demoEventsCutoff} ORDER BY event_date LIMIT ${batchSize}),
        deleted AS (DELETE FROM public.public_demo_events WHERE ctid IN (SELECT ctid FROM candidates) RETURNING 1)
        SELECT count(*)::int AS deleted FROM deleted`;
      break;
    case "public_demo_email_challenges":
      rows = await sql`WITH candidates AS (SELECT ctid FROM public.public_demo_email_challenges
        WHERE expires_at < ${now}::timestamptz - make_interval(days => ${PUBLIC_DEMO_CHALLENGE_EXPIRY_GRACE_DAYS})
        ORDER BY expires_at LIMIT ${batchSize}),
        deleted AS (DELETE FROM public.public_demo_email_challenges WHERE ctid IN (SELECT ctid FROM candidates) RETURNING 1)
        SELECT count(*)::int AS deleted FROM deleted`;
      break;
    case "api_rate_limits":
      rows = await sql`WITH candidates AS (SELECT ctid FROM public.api_rate_limits WHERE updated_at < ${stateCutoff} ORDER BY updated_at LIMIT ${batchSize}),
        deleted AS (DELETE FROM public.api_rate_limits WHERE ctid IN (SELECT ctid FROM candidates) RETURNING 1)
        SELECT count(*)::int AS deleted FROM deleted`;
      break;
    case "auth_login_attempts":
      rows = await sql`WITH candidates AS (SELECT ctid FROM public.auth_login_attempts WHERE updated_at < ${stateCutoff} ORDER BY updated_at LIMIT ${batchSize}),
        deleted AS (DELETE FROM public.auth_login_attempts WHERE ctid IN (SELECT ctid FROM candidates) RETURNING 1)
        SELECT count(*)::int AS deleted FROM deleted`;
      break;
    case "email_verification_tokens":
      rows = await sql`WITH candidates AS (SELECT ctid FROM public.email_verification_tokens WHERE expires_at < ${now}::timestamptz ORDER BY expires_at LIMIT ${batchSize}),
        deleted AS (DELETE FROM public.email_verification_tokens WHERE ctid IN (SELECT ctid FROM candidates) RETURNING 1)
        SELECT count(*)::int AS deleted FROM deleted`;
      break;
    case "password_reset_tokens":
      rows = await sql`WITH candidates AS (SELECT ctid FROM public.password_reset_tokens WHERE expires_at < ${now}::timestamptz ORDER BY expires_at LIMIT ${batchSize}),
        deleted AS (DELETE FROM public.password_reset_tokens WHERE ctid IN (SELECT ctid FROM candidates) RETURNING 1)
        SELECT count(*)::int AS deleted FROM deleted`;
      break;
    case "review_link_clicks":
      rows = await sql`WITH candidates AS (SELECT ctid FROM public.review_link_clicks WHERE clicked_at < ${clicksCutoff} ORDER BY clicked_at LIMIT ${batchSize}),
        deleted AS (DELETE FROM public.review_link_clicks WHERE ctid IN (SELECT ctid FROM candidates) RETURNING 1)
        SELECT count(*)::int AS deleted FROM deleted`;
      break;
    case "followup_integration_events":
      rows = await sql`WITH candidates AS (SELECT ctid FROM public.followup_integration_events WHERE created_at < ${integrationCutoff} ORDER BY created_at LIMIT ${batchSize}),
        deleted AS (DELETE FROM public.followup_integration_events WHERE ctid IN (SELECT ctid FROM candidates) RETURNING 1)
        SELECT count(*)::int AS deleted FROM deleted`;
      break;
    case "cron_runs":
      rows = await sql`WITH candidates AS (SELECT ctid FROM public.cron_runs WHERE status <> 'running' AND finished_at IS NOT NULL AND started_at < ${cronRunsCutoff} ORDER BY started_at LIMIT ${batchSize}),
        deleted AS (DELETE FROM public.cron_runs WHERE ctid IN (SELECT ctid FROM candidates) RETURNING 1)
        SELECT count(*)::int AS deleted FROM deleted`;
      break;
  }
  return Number(rows[0]?.deleted ?? 0);
}

/**
 * Remove one bounded batch per currently approved data class. Each statement
 * commits atomically and can be retried; failures are retained per table for
 * the cron health record and the next invocation resumes from remaining rows.
 */
export async function runPrivacyRetentionCleanup(input: {
  batchSize?: number;
  maxOperations?: number;
  cursor?: unknown;
  deadlineAt?: Date;
  now?: Date;
  checkpoint?: (cursor: number, processedCount: number) => Promise<void>;
} = {}): Promise<PrivacyCleanupResult> {
  const requestedBatch = input.batchSize ?? PRIVACY_CLEANUP_BATCH_SIZE;
  const batchSize = Number.isFinite(requestedBatch)
    ? Math.max(1, Math.min(Math.trunc(requestedBatch), PRIVACY_CLEANUP_MAX_BATCH_SIZE))
    : PRIVACY_CLEANUP_BATCH_SIZE;
  const now = input.now ?? new Date();
  const startCursor = typeof input.cursor === "number" && Number.isInteger(input.cursor)
    ? ((input.cursor % PRIVACY_CLEANUP_TABLES.length) + PRIVACY_CLEANUP_TABLES.length) % PRIVACY_CLEANUP_TABLES.length
    : 0;
  const maxOperations = Number.isFinite(input.maxOperations)
    ? Math.max(1, Math.min(Math.trunc(input.maxOperations!), PRIVACY_CLEANUP_TABLES.length))
    : PRIVACY_CLEANUP_TABLES.length;
  const operations: PrivacyCleanupOperation[] = [];

  let nextCursor = startCursor;
  let backlog = false;
  for (let offset = 0; offset < PRIVACY_CLEANUP_TABLES.length; offset += 1) {
    if (operations.length >= maxOperations || (input.deadlineAt && Date.now() >= input.deadlineAt.getTime())) {
      backlog = true;
      break;
    }
    const index = (startCursor + offset) % PRIVACY_CLEANUP_TABLES.length;
    const table = PRIVACY_CLEANUP_TABLES[index]!;
    try {
      const deleted = await deleteExpiredBatch(table, batchSize, now);
      operations.push({ table, deleted, failed: false, fullBatch: deleted >= batchSize });
    } catch {
      operations.push({ table, deleted: 0, failed: true, fullBatch: false });
      safeLogger.error("privacy.retention.operation_failed", {
        table,
        error: "operation_failed",
      });
    }
    nextCursor = (index + 1) % PRIVACY_CLEANUP_TABLES.length;
    await input.checkpoint?.(nextCursor, operations.reduce((total, operation) => total + operation.deleted, 0));
    if (operations.at(-1)?.fullBatch) backlog = true;
    if (input.deadlineAt && Date.now() >= input.deadlineAt.getTime()) backlog = true;
  }

  if (operations.length < PRIVACY_CLEANUP_TABLES.length && operations.length >= maxOperations) backlog = true;
  const deleted = operations.reduce((total, operation) => total + operation.deleted, 0);
  const failed = operations.filter((operation) => operation.failed).length;
  const status: PrivacyCleanupStatus = failed > 0
    ? (deleted > 0 || operations.some((operation) => !operation.failed) ? "partial" : "failed")
    : backlog ? "partial" : deleted === 0 ? "no_work" : "succeeded";
  const result = {
    attempted: operations.length,
    deleted,
    failed,
    batchSize,
    status,
    nextCursor,
    backlog,
    operations,
  };
  safeLogger.info("privacy.retention.completed", {
    attempted: result.attempted,
    deleted: result.deleted,
    failed: result.failed,
    batchSize: result.batchSize,
  });
  return result;
}
