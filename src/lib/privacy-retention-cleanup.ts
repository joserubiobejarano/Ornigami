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
};

export type PrivacyCleanupResult = {
  attempted: number;
  deleted: number;
  failed: number;
  batchSize: number;
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
      rows = await sql`WITH candidates AS (SELECT ctid FROM public.cron_runs WHERE started_at < ${cronRunsCutoff} ORDER BY started_at LIMIT ${batchSize}),
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
export async function runPrivacyRetentionCleanup(input: { batchSize?: number; now?: Date } = {}): Promise<PrivacyCleanupResult> {
  const requestedBatch = input.batchSize ?? PRIVACY_CLEANUP_BATCH_SIZE;
  const batchSize = Number.isFinite(requestedBatch)
    ? Math.max(1, Math.min(Math.trunc(requestedBatch), PRIVACY_CLEANUP_MAX_BATCH_SIZE))
    : PRIVACY_CLEANUP_BATCH_SIZE;
  const now = input.now ?? new Date();
  const operations: PrivacyCleanupOperation[] = [];

  for (const table of PRIVACY_CLEANUP_TABLES) {
    try {
      operations.push({ table, deleted: await deleteExpiredBatch(table, batchSize, now), failed: false });
    } catch (error) {
      operations.push({ table, deleted: 0, failed: true });
      safeLogger.error("privacy.retention.operation_failed", {
        table,
        error: error instanceof Error ? error.name : "unknown",
      });
    }
  }

  const result = {
    attempted: operations.length,
    deleted: operations.reduce((total, operation) => total + operation.deleted, 0),
    failed: operations.filter((operation) => operation.failed).length,
    batchSize,
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
