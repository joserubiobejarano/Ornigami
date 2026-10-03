import * as Sentry from "@sentry/nextjs";
import { sql } from "@/lib/db/neon";
import { safeLogger } from "@/lib/safe-logger";

type AlertRow = { alert_key: string; job_name: string; reason: string };
export type CronAlertEvaluation = { ok: boolean; activeCount: number; transportFailures: number };

/** Claim/resolution runs under a database advisory lock in one PL/pgSQL call. */
export async function evaluateCronAlerts(): Promise<CronAlertEvaluation> {
  try {
    const rows = await sql`SELECT alert_key, job_name, reason FROM public.claim_cron_alerts()` as AlertRow[];
    for (const row of rows) await deliver(row);
    const status = await sql`SELECT count(*) FILTER (WHERE active) AS active_count,
      count(*) FILTER (WHERE active AND transport_failures > 0) AS transport_failures
      FROM public.cron_alert_state`;
    const counts = status[0] as { active_count?: number | string; transport_failures?: number | string } | undefined;
    return { ok: true, activeCount: Number(counts?.active_count ?? 0), transportFailures: Number(counts?.transport_failures ?? 0) };
  } catch {
    safeLogger.error("cron.alerts.evaluation_failed", { errorCode: "alert_store_unavailable" });
    return { ok: false, activeCount: 0, transportFailures: 0 };
  }
}

async function deliver(alert: AlertRow): Promise<void> {
  if (!process.env.NEXT_PUBLIC_SENTRY_DSN) {
    safeLogger.error("cron.alerts.transport_not_configured", { jobName: alert.job_name, reason: alert.reason, errorCode: "sentry_dsn_missing" });
    try { await sql`UPDATE public.cron_alert_state SET transport_failures = transport_failures + 1,
      last_transport_error = 'sentry_dsn_missing', last_sent_at = clock_timestamp() - interval '25 minutes'
      WHERE alert_key = ${alert.alert_key}`; }
    catch { safeLogger.error("cron.alerts.transport_state_failed", { errorCode: "alert_store_unavailable" }); }
    return;
  }

  try {
    await Sentry.withScope((scope) => {
      scope.clearBreadcrumbs();
      scope.clearAttachments();
      scope.setUser(null);
      scope.setLevel("error");
      scope.setTag("subsystem", "cron");
      scope.setTag("job", alert.job_name);
      scope.setTag("reason", alert.reason);
      scope.addEventProcessor((event) => ({
        event_id: event.event_id,
        timestamp: event.timestamp,
        sdk: event.sdk,
        message: `Scheduled job ${alert.job_name} needs attention (${alert.reason}).`,
        level: "error",
        platform: "javascript",
        tags: { subsystem: "cron", job: alert.job_name, reason: alert.reason },
      }));
      Sentry.captureMessage(`Scheduled job ${alert.job_name} needs attention (${alert.reason}).`, "error");
    });
    if (!await Sentry.flush(2_000)) throw new Error("transport_flush_timeout");
    await sql`UPDATE public.cron_alert_state SET transport_failures = 0, last_transport_error = NULL WHERE alert_key = ${alert.alert_key}`;
  } catch {
    safeLogger.error("cron.alerts.transport_failed", { jobName: alert.job_name, reason: alert.reason, errorCode: "alert_transport_failed" });
    try {
      await sql`UPDATE public.cron_alert_state SET transport_failures = transport_failures + 1,
        last_transport_error = 'alert_transport_failed', last_sent_at = clock_timestamp() - interval '25 minutes'
        WHERE alert_key = ${alert.alert_key}`;
    } catch { safeLogger.error("cron.alerts.retry_state_failed", { errorCode: "alert_store_unavailable" }); }
  }
}
