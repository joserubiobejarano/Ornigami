import { sql } from "@/lib/db/neon";
import { safeLogger } from "@/lib/safe-logger";

export async function startCronRun(jobName: string): Promise<string | null> {
  try {
    const rows = await sql`
      INSERT INTO public.cron_runs (job_name)
      VALUES (${jobName})
      RETURNING id
    `;
    return (rows[0] as { id?: string } | undefined)?.id ?? null;
  } catch (error) {
    safeLogger.warn("cron.health.start_failed", { jobName, error: error instanceof Error ? error.message : "unknown" });
    return null;
  }
}

export async function finishCronRun(input: {
  runId: string | null;
  status: "succeeded" | "failed";
  processedCount: number;
  failedCount: number;
  errorMessage?: string | null;
}): Promise<void> {
  if (!input.runId) return;
  try {
    await sql`
      UPDATE public.cron_runs
      SET finished_at = now(), status = ${input.status}, processed_count = ${input.processedCount},
          failed_count = ${input.failedCount}, error_message = ${input.errorMessage ?? null}
      WHERE id = ${input.runId}
    `;
  } catch (error) {
    safeLogger.warn("cron.health.finish_failed", { error: error instanceof Error ? error.message : "unknown" });
  }
}