import type { ErrorEvent } from "@sentry/nextjs";

/** Server telemetry contains only fixed messages and bounded operational tags. */
export function sanitizeServerEvent(event: ErrorEvent): ErrorEvent | null {
  const metadata = {
    event_id: event.event_id, timestamp: event.timestamp, platform: event.platform,
    sdk: event.sdk, release: event.release, environment: event.environment,
    type: undefined,
    level: "error" as const,
  };
  const job = event.tags?.job;
  const reason = event.tags?.reason;
  if (event.tags?.subsystem === "cron"
    && typeof job === "string" && ["review_booster", "review_replies", "privacy_retention"].includes(job)
    && typeof reason === "string" && ["never_run", "missed_schedule", "stale_running", "partial", "failed"].includes(reason)
    && event.message === `Scheduled job ${job} needs attention (${reason}).`) {
    return { ...metadata, message: event.message, tags: { subsystem: "cron", job, reason } };
  }
  if (event.tags?.error_boundary !== "server"
    || !event.exception?.values?.some((value) => value.value === "Ornigami server request failed")) return null;
  const digest = event.tags.error_digest;
  const safeDigest = typeof digest === "string" && /^\d{1,20}$/.test(digest) ? digest : undefined;
  return {
    ...metadata,
    exception: { values: [{ type: "Error", value: "Ornigami server request failed" }] },
    tags: { error_boundary: "server", ...(safeDigest ? { error_digest: safeDigest } : {}) },
    fingerprint: ["ornigami-server-error", safeDigest ?? "no-digest"],
  };
}
