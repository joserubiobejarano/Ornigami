import { NextRequest, NextResponse } from "next/server";
import { fetchAllGoogleReviews } from "@/lib/google-review-sync";
import { persistGoogleReviews } from "@/lib/google-review-persistence";
import { sql } from "@/lib/db/neon";
import { getProfileReplyDefaults } from "@/lib/reply-profile-defaults";
import type { ReviewRowForReply } from "@/lib/review-reply-server";
import { processReviewDraft } from "@/lib/review-draft-processing";
import { safeLogger } from "@/lib/safe-logger";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";
import { sendNewReviewAlert } from "@/lib/review-alerts";
import { acquireCronJobRun, checkpointCronJobRun, CronLeaseBusyError, finishCronJobRun } from "@/lib/cron-health";
import { providerWindow } from "@/lib/cron-budget";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type LocationRow = { business_id: string; user_id: string; business_name: string; location_name: string; connection_version: string; unit_cursor?: unknown };
type NewReview = { reviewerName: string | null; starRating: number | null; comment: string | null };
type RepliesCursor = { businessId: string | null; locationName: string | null; sweepFailures: number; sweepSuccesses: number; needsAnotherPass: boolean } | null;
type RepliesUnitCursor = { locationName: string; stage: "sync" | "alert" | "drafts"; lastReviewId: string | null; connectionVersion: string; sweepFailures: number; sweepSuccesses: number } | null;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LOCATION_NAME = /^accounts\/[A-Za-z0-9_-]+\/locations\/[A-Za-z0-9_-]+$/;
const BUDGET_MS = 45_000;
const LOCATION_BATCH_LIMIT = 20;
const DRAFT_BATCH_LIMIT = 10;
const LOCATION_ADMISSION_MS = 15_000;

function readCursor(value: unknown): RepliesCursor {
  if (!value || typeof value !== "object") return null;
  const c = value as Partial<NonNullable<RepliesCursor>>;
  if (!(c.businessId === null || (typeof c.businessId === "string" && UUID.test(c.businessId)))
    || !(c.locationName === null || (typeof c.locationName === "string" && LOCATION_NAME.test(c.locationName)))) return null;
  return { businessId: c.businessId ?? null, locationName: c.locationName ?? null,
    sweepFailures: Number.isSafeInteger(c.sweepFailures) ? Math.max(0, Number(c.sweepFailures)) : 0,
    sweepSuccesses: Number.isSafeInteger(c.sweepSuccesses) ? Math.max(0, Number(c.sweepSuccesses)) : 0,
    needsAnotherPass: c.needsAnotherPass === true };
}

function readUnitCursor(value: unknown): RepliesUnitCursor {
  if (!value || typeof value !== "object") return null;
  const c = value as Partial<NonNullable<RepliesUnitCursor>>;
  if (typeof c.locationName !== "string" || !LOCATION_NAME.test(c.locationName)
    || !["sync", "alert", "drafts"].includes(String(c.stage)) || typeof c.connectionVersion !== "string"
    || (c.lastReviewId !== null && c.lastReviewId !== undefined
      && (!/^\d{1,19}$/.test(c.lastReviewId) || BigInt(c.lastReviewId) > BigInt("9223372036854775807")))) return null;
  return { locationName: c.locationName, stage: c.stage!, lastReviewId: c.lastReviewId ?? null,
    connectionVersion: c.connectionVersion,
    sweepFailures: Number.isSafeInteger(c.sweepFailures) ? Math.max(0, Number(c.sweepFailures)) : 0,
    sweepSuccesses: Number.isSafeInteger(c.sweepSuccesses) ? Math.max(0, Number(c.sweepSuccesses)) : 0 };
}

async function listLocationBatch(cursor: RepliesCursor, limit: number): Promise<LocationRow[]> {
  const afterBusiness = cursor?.businessId ?? null;
  const afterLocation = cursor?.locationName ?? null;
  return await sql`
    SELECT DISTINCT b.id AS business_id, b.owner_user_id AS user_id, b.name AS business_name,
      l.location_name, gc.connection_version, units.cursor AS unit_cursor
    FROM public.business_google_locations selected
    INNER JOIN public.businesses b ON b.id = selected.business_id
    INNER JOIN public.gbp_locations l ON l.id = selected.location_id
      AND l.user_id = b.owner_user_id AND l.connected IS TRUE
    INNER JOIN public.gbp_connections gc ON gc.user_id = b.owner_user_id
      AND l.connection_version = gc.connection_version
    INNER JOIN public.business_agents ba ON ba.business_id = b.id
    LEFT JOIN public.cron_unit_state units ON units.job_name = 'review_replies' AND units.business_id = b.id
    WHERE ba.agent_id = 'review_replies' AND lower(ba.status) IN ('active', 'trialing')
      AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = b.owner_user_id AND u.privacy_deletion_requested_at IS NOT NULL)
      AND (${afterBusiness}::uuid IS NULL OR (b.id, l.location_name) > (${afterBusiness}::uuid, ${afterLocation}::text))
    ORDER BY b.id, l.location_name
    LIMIT ${limit}
  ` as LocationRow[];
}

function withProviderTimeout(deadlineAt: Date, maxMs = 8_000, reserveMs = 5_000): { signal: AbortSignal; clear: () => void } | null {
  const timeoutMs = providerWindow(deadlineAt, { maxMs, reserveMs });
  if (timeoutMs === null) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error("Cron provider deadline reached")), timeoutMs);
  return { signal: controller.signal, clear: () => clearTimeout(timer) };
}

async function syncLocation(location: LocationRow, signal: AbortSignal): Promise<{ synced: number; newReviews: NewReview[] }> {
  const reviews = await fetchAllGoogleReviews(location.user_id, location.location_name, undefined, location.connection_version, signal);
  return persistGoogleReviews(location.user_id, location.business_id, location.location_name, reviews);
}

async function draftPending(
  location: LocationRow,
  unit: NonNullable<RepliesUnitCursor>,
  deadlineAt: Date,
  onProgress: (lastReviewId: string, outcome: "saved" | "failed" | "skipped") => Promise<void>,
): Promise<{ drafted: number; failed: number; deferred: number; lastReviewId: string | null; interrupted: boolean; hasMore: boolean }> {
  const profile = await getProfileReplyDefaults(location.user_id);
  const afterReviewId = unit.lastReviewId;
  const rows = (await sql`
    SELECT r.id, r.google_review_id, r.comment, r.star_rating
    FROM public.reviews r
    WHERE r.business_id = ${location.business_id} AND r.location_name = ${location.location_name}
      AND (r.status IS NULL OR lower(r.status) <> 'replied') AND NULLIF(BTRIM(r.comment), '') IS NOT NULL
      AND (${afterReviewId}::bigint IS NULL OR r.id > ${afterReviewId}::bigint)
      AND NOT EXISTS (SELECT 1 FROM public.review_replies rr WHERE rr.review_id = r.id AND rr.business_id = r.business_id AND rr.posted IS FALSE)
    ORDER BY r.id ASC
    LIMIT ${DRAFT_BATCH_LIMIT}
  `) as ReviewRowForReply[];
  let drafted = 0;
  let failed = 0;
  let deferred = 0;
  let lastReviewId = afterReviewId;
  for (const row of rows) {
    if (Date.now() + LOCATION_ADMISSION_MS > deadlineAt.getTime()) return { drafted, failed, deferred, lastReviewId, interrupted: true, hasMore: true };
    const timeoutMs = providerWindow(deadlineAt, { maxMs: 8_000, reserveMs: 5_000 });
    if (timeoutMs === null) return { drafted, failed, deferred, lastReviewId, interrupted: true, hasMore: true };
    const result = await processReviewDraft({ actorUserId: location.user_id, businessId: location.business_id, locationName: location.location_name, row, profile, source: "scheduled", providerTimeoutMs: timeoutMs });
    if (result.outcome === "limit") {
      deferred += rows.length;
      return { drafted, failed, deferred, lastReviewId, interrupted: false, hasMore: false };
    }
    if (result.outcome === "failed") failed += 1;
    else if (result.outcome === "saved") drafted += 1;
    lastReviewId = String(row.id);
    await onProgress(lastReviewId, result.outcome === "failed" ? "failed" : result.outcome === "saved" ? "saved" : "skipped");
  }
  return { drafted, failed, deferred, lastReviewId, interrupted: false, hasMore: rows.length === DRAFT_BATCH_LIMIT };
}

function jsonResponse(body: Record<string, unknown>, status: number, retryAfter?: number) {
  return NextResponse.json(body, { status, headers: retryAfter ? { "Retry-After": String(retryAfter) } : undefined });
}

class CronCheckpointError extends Error { constructor() { super("Cron checkpoint failed"); } }
async function persistCheckpoint(input: Parameters<typeof checkpointCronJobRun>[0]): Promise<void> {
  try { await checkpointCronJobRun(input); } catch { throw new CronCheckpointError(); }
}
async function persistRouteCheckpoint(input: { runId: string; fence: number; cursor: RepliesCursor; processedCount: number; unitCursor?: { businessId: string; cursor: RepliesUnitCursor } }): Promise<void> {
  await persistCheckpoint(input as Parameters<typeof checkpointCronJobRun>[0]);
}

export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) return jsonResponse({ ok: false, error: "Unauthorized" }, 401);
  let lease;
  try { lease = await acquireCronJobRun("review_replies", { budgetMs: BUDGET_MS, batchLimit: LOCATION_BATCH_LIMIT }); }
  catch (error) {
    if (error instanceof CronLeaseBusyError) return jsonResponse({ ok: false, status: "already_running" }, 409, error.retryAfterSeconds);
    safeLogger.error("cron.review_replies.acquire_failed", { errorCode: "health_store_unavailable" });
    return jsonResponse({ ok: false, status: "failed", errorCode: "health_store_unavailable" }, 503);
  }

  const cursor = readCursor(lease.cursor);
  let checkpoint: RepliesCursor = cursor;
  let processedCount = 0;
  let locationsScanned = 0;
  let synced = 0;
  let drafted = 0;
  let deferred = 0;
  let failed = 0;
  let sweepFailures = cursor?.sweepFailures ?? 0;
  let sweepSuccesses = cursor?.sweepSuccesses ?? 0;
  let needsAnotherPass = cursor?.needsAnotherPass ?? false;
  let interrupted = false;
  let continuation = false;
  let terminalAttempted = false;
  const finishOnce = async (input: Parameters<typeof finishCronJobRun>[0]) => { terminalAttempted = true; await finishCronJobRun(input); };

  try {
    const locations = await listLocationBatch(cursor, lease.batchLimit);
    if (!locations.length) {
      const pending = await sql`
        SELECT 1
        FROM public.cron_unit_state units
        INNER JOIN public.businesses b ON b.id = units.business_id
        INNER JOIN public.business_agents ba ON ba.business_id = b.id AND ba.agent_id = 'review_replies' AND lower(ba.status) IN ('active', 'trialing')
        INNER JOIN public.business_google_locations selected ON selected.business_id = b.id
        INNER JOIN public.gbp_locations l ON l.id = selected.location_id AND l.user_id = b.owner_user_id AND l.connected IS TRUE
          AND l.location_name = units.cursor->>'locationName'
        INNER JOIN public.gbp_connections gc ON gc.user_id = b.owner_user_id AND gc.connection_version = l.connection_version
        WHERE units.job_name = 'review_replies'
          AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = b.owner_user_id AND u.privacy_deletion_requested_at IS NOT NULL)
        LIMIT 1
      `;
      // Only wrap for resumable units that are still eligible. A frozen/disconnected
      // owner can leave a child cursor behind; it must not keep the cron returning 202.
      if (pending.length > 0) {
        checkpoint = { businessId: null, locationName: null, sweepFailures, sweepSuccesses, needsAnotherPass: false };
        await persistRouteCheckpoint({ runId: lease.runId, fence: lease.fence, cursor: checkpoint, processedCount });
        const status = sweepFailures > 0 ? (sweepSuccesses > 0 ? "partial" : "failed") : "partial";
        await finishOnce({ runId: lease.runId, fence: lease.fence, status, processedCount, failedCount: sweepFailures, errorCode: sweepFailures ? "partial_failures" : "budget_exhausted" });
        return jsonResponse({ ok: false, status, continuation: true, locations_scanned: 0, reviews_synced: 0, drafts_created: 0, deferred, failed: sweepFailures }, sweepFailures ? 500 : 202);
      }
      if (sweepFailures > 0) {
        const status = sweepSuccesses > 0 ? "partial" : "failed";
        await finishOnce({ runId: lease.runId, fence: lease.fence, status, processedCount, failedCount: sweepFailures, errorCode: "partial_failures", clearCursor: true });
        return jsonResponse({ ok: false, status, continuation: false, locations_scanned: 0, reviews_synced: 0, drafts_created: 0, deferred, failed: sweepFailures }, 500);
      }
      const status = cursor ? "succeeded" : "no_work";
      await finishOnce({ runId: lease.runId, fence: lease.fence, status, processedCount, failedCount: 0 });
      return jsonResponse({ ok: true, status, locations_scanned: 0, reviews_synced: 0, drafts_created: 0, deferred: 0, failed: 0 }, 200);
    }

    for (const location of locations) {
      if (Date.now() + LOCATION_ADMISSION_MS > lease.deadlineAt.getTime()) { interrupted = true; break; }
      locationsScanned += 1;
      const storedUnit = readUnitCursor(location.unit_cursor);
      const matchingUnit = storedUnit?.locationName === location.location_name;
      if (matchingUnit && storedUnit.stage === "sync") {
        // A prior process may have persisted part/all of a sync before losing its local
        // new-review notification list. The lack of an outbox makes that outcome unknown.
        failed += 1;
        sweepFailures += 1;
      }
      let unit: NonNullable<RepliesUnitCursor> = matchingUnit && storedUnit.connectionVersion === location.connection_version
        ? storedUnit
        : { locationName: location.location_name, stage: "sync", lastReviewId: null, connectionVersion: location.connection_version,
          sweepFailures: storedUnit?.sweepFailures ?? sweepFailures, sweepSuccesses: storedUnit?.sweepSuccesses ?? sweepSuccesses };
      if (matchingUnit && storedUnit.stage === "alert" && storedUnit.connectionVersion !== location.connection_version) {
        sweepFailures += 1; failed += 1;
      }
      if (storedUnit) needsAnotherPass = true;
      try {
        if (unit.stage === "sync") {
          checkpoint = { businessId: location.business_id, locationName: location.location_name, sweepFailures, sweepSuccesses, needsAnotherPass: true };
          await persistRouteCheckpoint({ runId: lease.runId, fence: lease.fence, cursor: checkpoint, processedCount, unitCursor: { businessId: location.business_id, cursor: unit } });
          const provider = withProviderTimeout(lease.deadlineAt, 9_000, 12_000);
          if (!provider) { interrupted = true; continuation = true; break; }
          let syncResult: { synced: number; newReviews: NewReview[] };
          try { syncResult = await syncLocation(location, provider.signal); } finally { provider.clear(); }
          synced += syncResult.synced;
          sweepSuccesses += 1;
          checkpoint = { businessId: location.business_id, locationName: location.location_name, sweepFailures, sweepSuccesses, needsAnotherPass: true };
          if (syncResult.newReviews.length > 0) {
            const ownerRows = await sql`SELECT u.email FROM public.users u WHERE u.id = ${location.user_id} AND u.privacy_deletion_requested_at IS NULL LIMIT 1`;
            const owner = ownerRows[0] as { email?: string } | undefined;
            if (owner?.email) {
              unit = { ...unit, stage: "alert", sweepFailures, sweepSuccesses };
              await persistRouteCheckpoint({ runId: lease.runId, fence: lease.fence, cursor: checkpoint, processedCount, unitCursor: { businessId: location.business_id, cursor: unit } });
              const alert = withProviderTimeout(lease.deadlineAt, 8_000, 8_000);
              if (!alert) { interrupted = true; continuation = true; break; }
              try { await sendNewReviewAlert({ recipientEmail: owner.email, businessName: location.business_name || "your business", locationName: location.location_name, reviews: syncResult.newReviews, signal: alert.signal, required: true }); }
              catch { failed += 1; sweepFailures += 1; safeLogger.error("cron.review_replies.alert_failed", { errorCode: "job_failed" }); }
              finally { alert.clear(); }
            } else {
              failed += 1; sweepFailures += 1;
              safeLogger.error("cron.review_replies.alert_failed", { errorCode: "job_failed" });
            }
          }
          unit = { ...unit, stage: "drafts", lastReviewId: null, sweepFailures, sweepSuccesses };
          await persistRouteCheckpoint({ runId: lease.runId, fence: lease.fence, cursor: checkpoint, processedCount, unitCursor: { businessId: location.business_id, cursor: unit } });
        } else if (unit.stage === "alert") {
          // No durable notification outbox can distinguish a crash before acceptance from one after acceptance.
          failed += 1; sweepFailures += 1;
          safeLogger.error("cron.review_replies.alert_outcome_unknown", { errorCode: "partial_failures" });
          unit = { ...unit, stage: "drafts", sweepFailures, sweepSuccesses };
          await persistRouteCheckpoint({ runId: lease.runId, fence: lease.fence, cursor: checkpoint ?? cursor, processedCount, unitCursor: { businessId: location.business_id, cursor: unit } });
        }

        const draftResult = await draftPending(location, unit, lease.deadlineAt, async (lastReviewId, outcome) => {
          processedCount += 1;
          if (outcome === "failed") { sweepFailures += 1; failed += 1; }
          else sweepSuccesses += 1;
          unit = { ...unit, stage: "drafts", lastReviewId, sweepFailures, sweepSuccesses };
          checkpoint = { businessId: location.business_id, locationName: location.location_name, sweepFailures, sweepSuccesses, needsAnotherPass: true };
          await persistRouteCheckpoint({ runId: lease.runId, fence: lease.fence, cursor: checkpoint, processedCount, unitCursor: { businessId: location.business_id, cursor: unit } });
        });
        drafted += draftResult.drafted;
        deferred += draftResult.deferred;
        if (draftResult.interrupted || draftResult.hasMore) {
          needsAnotherPass = true;
          unit = { ...unit, stage: "drafts", lastReviewId: draftResult.lastReviewId, sweepFailures, sweepSuccesses };
          checkpoint = { businessId: location.business_id, locationName: location.location_name, sweepFailures, sweepSuccesses, needsAnotherPass: true };
          await persistRouteCheckpoint({ runId: lease.runId, fence: lease.fence, cursor: checkpoint, processedCount, unitCursor: { businessId: location.business_id, cursor: unit } });
          continuation = true;
          if (draftResult.interrupted) { interrupted = true; break; }
          continue;
        }
        checkpoint = { businessId: location.business_id, locationName: location.location_name, sweepFailures, sweepSuccesses, needsAnotherPass };
        processedCount += 1;
        await persistRouteCheckpoint({ runId: lease.runId, fence: lease.fence, cursor: checkpoint, processedCount, unitCursor: { businessId: location.business_id, cursor: null } });
      } catch (error) {
        if (error instanceof CronCheckpointError) throw error;
        failed += 1; sweepFailures += 1; processedCount += 1;
        safeLogger.error("cron.review_replies.location_failed", { errorCode: "job_failed" });
        checkpoint = { businessId: location.business_id, locationName: location.location_name, sweepFailures, sweepSuccesses, needsAnotherPass };
        await persistRouteCheckpoint({ runId: lease.runId, fence: lease.fence, cursor: checkpoint, processedCount, unitCursor: { businessId: location.business_id, cursor: null } });
      }
      if (Date.now() + LOCATION_ADMISSION_MS > lease.deadlineAt.getTime()) { interrupted = true; continuation = true; break; }
    }

    continuation ||= interrupted || locations.length >= lease.batchLimit || needsAnotherPass;
    const sweepFailed = sweepFailures > 0;
    const status = sweepFailed ? (sweepSuccesses > 0 ? "partial" : "failed") : continuation ? "partial" : processedCount === 0 ? "no_work" : "succeeded";
    await finishOnce({ runId: lease.runId, fence: lease.fence, status, processedCount, failedCount: sweepFailures, errorCode: sweepFailed ? "partial_failures" : continuation ? "budget_exhausted" : undefined, clearCursor: !continuation && sweepFailed });
    return jsonResponse({ ok: !sweepFailed && !continuation, status, continuation, locations_scanned: locationsScanned, reviews_synced: synced, drafts_created: drafted, deferred, failed, sweep_failed_count: sweepFailures }, sweepFailed ? 500 : continuation ? 202 : status === "no_work" ? 200 : 200);
  } catch (error) {
    if (error instanceof CronCheckpointError) {
      safeLogger.error("cron.review_replies.checkpoint_failed", { errorCode: "health_store_unavailable" });
      return jsonResponse({ ok: false, status: "failed", errorCode: "health_store_unavailable" }, 503);
    }
    if (terminalAttempted) {
      safeLogger.error("cron.review_replies.finish_failed", { errorCode: "health_store_unavailable" });
      return jsonResponse({ ok: false, status: "failed", errorCode: "health_store_unavailable" }, 503);
    }
    safeLogger.error("cron.review_replies.failed", { errorCode: "job_failed" });
    try { await finishOnce({ runId: lease.runId, fence: lease.fence, status: "failed", processedCount, failedCount: sweepFailures + 1, errorCode: "job_failed" }); }
    catch {
      safeLogger.error("cron.review_replies.health_finish_failed", { errorCode: "health_store_unavailable" });
      return jsonResponse({ ok: false, status: "failed", errorCode: "health_store_unavailable" }, 503);
    }
    return jsonResponse({ ok: false, status: "failed", error: "Cron run failed" }, 500);
  }
}
