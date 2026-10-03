import { sql } from "@/lib/db/neon";
import { safeLogger } from "@/lib/safe-logger";
import { evaluateCronAlerts } from "@/lib/cron-alerts";
import { PRIVACY_CLEANUP_TABLES } from "@/lib/privacy-retention";

export type CronRunStatus = "running" | "succeeded" | "partial" | "failed" | "no_work";
export type CronJobName = "review_booster" | "review_replies" | "privacy_retention";

export class CronLeaseBusyError extends Error {
  readonly retryAfterSeconds: number;
  constructor(retryAfterSeconds = 30) {
    super("Cron job already has an active lease");
    this.name = "CronLeaseBusyError";
    this.retryAfterSeconds = Math.max(1, Math.ceil(retryAfterSeconds));
  }
}

export class CronFenceLostError extends Error {
  constructor() { super("Cron run lease is no longer current"); this.name = "CronFenceLostError"; }
}

export type CronRunLease = {
  runId: string;
  fence: number;
  cursor: unknown;
  deadlineAt: Date;
  batchLimit: number;
  budgetMs: number;
};
export type CronUnitCursor = { businessId: string; cursor: unknown | null };

const JOBS = new Set<CronJobName>(["review_booster", "review_replies", "privacy_retention"]);
const DEFAULT_BUDGET_MS = 45_000;
const DEFAULT_LEASE_MS = 90_000;
const DEFAULT_BATCH_LIMIT = 100;

function assertJobName(jobName: string): asserts jobName is CronJobName {
  if (!JOBS.has(jobName as CronJobName)) throw new Error("Unsupported cron job");
}

/** Atomically acquires the sole lease for a fixed scheduled job; all DB errors fail closed. */
export async function acquireCronJobRun(
  jobName: CronJobName,
  options: { leaseMs?: number; budgetMs?: number; batchLimit?: number } = {},
): Promise<CronRunLease> {
  assertJobName(jobName);
  const finite = (value: number | undefined, fallback: number) => Number.isFinite(value) ? Math.floor(value as number) : fallback;
  const budgetMs = Math.min(240_000, Math.max(1_000, finite(options.budgetMs, DEFAULT_BUDGET_MS)));
  const leaseMs = Math.min(300_000, Math.max(budgetMs + 15_000, finite(options.leaseMs, Math.max(DEFAULT_LEASE_MS, budgetMs + 15_000))));
  const batchLimit = Math.min(1_000, Math.max(1, finite(options.batchLimit, DEFAULT_BATCH_LIMIT)));
  try {
    const rows = await sql`
      WITH expired_owner AS MATERIALIZED (
        SELECT job_name, lease_owner_run_id, fence FROM public.cron_job_state
        WHERE job_name = ${jobName} AND lease_owner_run_id IS NOT NULL AND lease_until <= clock_timestamp()
        FOR UPDATE
      ), abandoned AS (
        UPDATE public.cron_runs r SET finished_at = clock_timestamp(), status = 'failed',
          failed_count = GREATEST(r.failed_count, 1), error_message = 'job_failed'
        FROM expired_owner s WHERE r.id = s.lease_owner_run_id AND r.fence = s.fence AND r.status = 'running'
        RETURNING r.id
      ), claim AS (
        INSERT INTO public.cron_job_state (job_name, fence, lease_owner_run_id, lease_until, deadline_at, last_started_at, budget_ms, batch_limit, lease_ms)
        SELECT ${jobName}, 1, gen_random_uuid(), clock_timestamp() + (${leaseMs} * interval '1 millisecond'),
          clock_timestamp() + (${budgetMs} * interval '1 millisecond'), clock_timestamp(), ${budgetMs}, ${batchLimit}, ${leaseMs}
        FROM (SELECT count(*) FROM abandoned) AS barrier
        ON CONFLICT (job_name) DO UPDATE SET
          fence = public.cron_job_state.fence + 1,
          lease_owner_run_id = gen_random_uuid(),
          lease_until = clock_timestamp() + (${leaseMs} * interval '1 millisecond'),
          deadline_at = clock_timestamp() + (${budgetMs} * interval '1 millisecond'),
          last_started_at = clock_timestamp(), budget_ms = EXCLUDED.budget_ms, batch_limit = EXCLUDED.batch_limit, lease_ms = EXCLUDED.lease_ms,
          heartbeat_at = clock_timestamp()
        WHERE public.cron_job_state.lease_until IS NULL OR public.cron_job_state.lease_until <= clock_timestamp()
        RETURNING job_name, fence, lease_owner_run_id, cursor, clock_timestamp() + (${budgetMs} * interval '1 millisecond') AS deadline_at
      ), run AS (
        INSERT INTO public.cron_runs (id, job_name, status, budget_ms, batch_limit, fence)
        SELECT lease_owner_run_id, job_name, 'running', ${budgetMs}, ${batchLimit}, fence FROM claim
        RETURNING id, job_name
      )
      SELECT run.id, claim.fence, claim.cursor, claim.deadline_at
      FROM run JOIN claim USING (job_name)
    `;
    const row = rows[0] as { id?: string; fence?: number | string; cursor?: unknown; deadline_at?: string | Date } | undefined;
    if (row?.id && row.fence !== undefined && row.deadline_at) {
      return { runId: row.id, fence: Number(row.fence), cursor: row.cursor ?? null, deadlineAt: new Date(row.deadline_at), batchLimit, budgetMs };
    }
    const state = await sql`SELECT ceil(extract(epoch FROM (lease_until - clock_timestamp()))) AS retry_after FROM public.cron_job_state WHERE job_name = ${jobName}`;
    const retry = Number((state[0] as { retry_after?: number | string } | undefined)?.retry_after ?? 30);
    throw new CronLeaseBusyError(retry);
  } catch (error) {
    if (error instanceof CronLeaseBusyError) throw error;
    safeLogger.error("cron.health.acquire_failed", { jobName, errorCode: "health_store_unavailable" });
    throw new Error("Cron health store unavailable");
  }
}

/** Stores a restart cursor and renews the lease only while both run id and fence remain current. */
export async function checkpointCronJobRun(input: {
  runId: string; fence: number; cursor: unknown; processedCount: number; unitCursor?: CronUnitCursor;
}): Promise<void> {
  const unitCursorJson = input.unitCursor?.cursor == null ? null : JSON.stringify(input.unitCursor.cursor);
  const rows = await sql`
    WITH saved AS (
      UPDATE public.cron_job_state s SET cursor = ${JSON.stringify(input.cursor)}::jsonb,
        checkpoint_at = clock_timestamp(), heartbeat_at = clock_timestamp(),
        lease_until = LEAST(s.deadline_at + interval '15 seconds', clock_timestamp() + (s.lease_ms * interval '1 millisecond'))
      FROM public.cron_runs r
      WHERE r.id = ${input.runId} AND r.status = 'running' AND r.fence = ${input.fence}
        AND s.job_name = r.job_name AND s.lease_owner_run_id = r.id AND s.fence = ${input.fence}
        AND s.lease_until > clock_timestamp() AND s.deadline_at > clock_timestamp()
      RETURNING r.id, r.job_name
    ), run_update AS (
      UPDATE public.cron_runs r SET processed_count = ${Math.max(0, Math.floor(input.processedCount))}
      FROM saved WHERE r.id = saved.id RETURNING r.id, r.job_name
    ), unit_upsert AS (
      INSERT INTO public.cron_unit_state (job_name, business_id, cursor, updated_at)
      SELECT run_update.job_name, ${input.unitCursor?.businessId ?? null}::uuid, ${unitCursorJson}::jsonb, clock_timestamp()
      FROM run_update WHERE ${unitCursorJson !== null}
      ON CONFLICT (job_name, business_id) DO UPDATE SET cursor = EXCLUDED.cursor, updated_at = clock_timestamp()
      RETURNING business_id
    ), unit_delete AS (
      DELETE FROM public.cron_unit_state u USING run_update
      WHERE u.job_name = run_update.job_name AND u.business_id = ${input.unitCursor?.businessId ?? null}::uuid
        AND ${Boolean(input.unitCursor && unitCursorJson === null)}
      RETURNING u.business_id
    ) SELECT run_update.id FROM run_update
      CROSS JOIN (SELECT count(*) FROM unit_upsert) upserted
      CROSS JOIN (SELECT count(*) FROM unit_delete) deleted
  `;
  if (!rows.length) throw new CronFenceLostError();
}

/** Fenced terminal update. Error details are restricted to a fixed code, never exception text. */
export async function finishCronJobRun(input: {
  runId: string; fence: number; status: Exclude<CronRunStatus, "running">;
  processedCount: number; failedCount: number; errorCode?: "job_failed" | "partial_failures" | "budget_exhausted" | "health_store_unavailable";
  clearCursor?: boolean;
  outcomes?: Record<string, { deleted: number; failed: boolean; complete: boolean }>;
}): Promise<void> {
  const rows = await sql`
    WITH owned AS MATERIALIZED (
      SELECT s.job_name, s.lease_owner_run_id, s.fence
      FROM public.cron_job_state s
      WHERE s.lease_owner_run_id = ${input.runId} AND s.fence = ${input.fence}
        AND s.lease_until > clock_timestamp()
      FOR UPDATE
    ), finish AS (
      UPDATE public.cron_runs r SET finished_at = clock_timestamp(), status = ${input.status},
        processed_count = ${Math.max(0, Math.floor(input.processedCount))}, failed_count = ${Math.max(0, Math.floor(input.failedCount))},
        error_message = ${input.errorCode ?? null}, outcomes = ${JSON.stringify(sanitizeOutcomes(input.outcomes))}::jsonb
      FROM owned s
      WHERE r.id = ${input.runId} AND r.fence = ${input.fence} AND r.status = 'running'
        AND s.job_name = r.job_name AND s.lease_owner_run_id = r.id AND s.fence = ${input.fence}
      RETURNING r.job_name, r.status
    ), state_update AS (
      UPDATE public.cron_job_state s SET lease_owner_run_id = NULL, lease_until = NULL, deadline_at = NULL,
        last_finished_at = clock_timestamp(), last_status = f.status,
        last_success_at = CASE WHEN f.status IN ('succeeded', 'no_work') THEN clock_timestamp() ELSE s.last_success_at END,
        cursor = CASE WHEN ${Boolean(input.clearCursor)} OR f.status IN ('succeeded', 'no_work') THEN NULL ELSE s.cursor END
      FROM finish f WHERE s.job_name = f.job_name AND s.lease_owner_run_id = ${input.runId} AND s.fence = ${input.fence}
      RETURNING s.job_name
    ), unit_cleanup AS (
      DELETE FROM public.cron_unit_state u USING finish f
      WHERE u.job_name = f.job_name AND (${Boolean(input.clearCursor)} OR f.status IN ('succeeded', 'no_work'))
      RETURNING u.business_id
    ) SELECT finish.job_name, finish.status FROM finish JOIN state_update USING (job_name)
      CROSS JOIN (SELECT count(*) FROM unit_cleanup) cleanup
  `;
  if (!rows.length) throw new CronFenceLostError();
  await evaluateCronAlerts();
}

function sanitizeOutcomes(value: Record<string, { deleted: number; failed: boolean; complete: boolean }> | undefined) {
  if (!value || typeof value !== "object") return {};
  const output: Record<string, { deleted: number; failed: boolean; complete: boolean }> = {};
  for (const [key, item] of Object.entries(value)) {
    if (!(PRIVACY_CLEANUP_TABLES as readonly string[]).includes(key) || !item || typeof item !== "object") continue;
    output[key] = { deleted: Math.max(0, Math.floor(Number.isFinite(item.deleted) ? item.deleted : 0)), failed: Boolean(item.failed), complete: Boolean(item.complete) };
  }
  return output;
}
