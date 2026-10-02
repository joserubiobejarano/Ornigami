import { randomUUID } from "node:crypto";
import { sql } from "@/lib/db/neon";
import { resolveBusinessContext } from "@/lib/business-context";

export type ReplyDraftState = "new" | "ai_drafted" | "human_edited" | "approved" | "posted";
export type ReplyDraftRecord = {
  replyId: number | null;
  reviewId: string;
  reply: string | null;
  state: ReplyDraftState;
  version: number;
  updatedAt: string | null;
};
export type ReplyGenerationClaim = { token: string; fence: number; version: number };
export type DraftMutationFailure = { ok: false; error: string; code: "conflict" | "not-found" | "invalid" };
type DbDraft = { reply_id: number | string | null; google_review_id: string; draft_markdown: string | null;
  state: ReplyDraftState; version: number; updated_at: string | Date | null };
function toRecord(row: DbDraft): ReplyDraftRecord {
  return { replyId: row.reply_id === null ? null : Number(row.reply_id), reviewId: row.google_review_id,
    reply: row.draft_markdown, state: row.state, version: Number(row.version),
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null };
}

export async function getReplyDraft(businessId: string, googleReviewId: string): Promise<ReplyDraftRecord | null> {
  const rows = await sql`
    SELECT s.reply_id,r.google_review_id,rr.draft_markdown,
      COALESCE(s.state,CASE WHEN rr.id IS NOT NULL THEN 'human_edited' ELSE 'new' END) AS state,
      COALESCE(s.version,CASE WHEN rr.id IS NOT NULL THEN 1 ELSE 0 END) AS version,
      COALESCE(s.updated_at,rr.updated_at) AS updated_at
    FROM public.reviews r
    LEFT JOIN public.review_reply_draft_state s ON s.review_id=r.id AND s.business_id=r.business_id
    LEFT JOIN public.review_replies rr ON rr.id=s.reply_id AND rr.posted IS FALSE
    WHERE r.business_id=${businessId} AND r.google_review_id=${googleReviewId} LIMIT 1
  `;
  return rows[0] ? toRecord(rows[0] as DbDraft) : null;
}

export async function saveHumanReplyDraft(businessId: string, googleReviewId: string, markdown: string, expectedVersion: number):
  Promise<{ ok: true; draft: ReplyDraftRecord } | DraftMutationFailure> {
  const normalizedText = markdown.trim();
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 0 || !normalizedText || Buffer.byteLength(normalizedText, "utf8") > 4096) {
    return { ok: false, error: "Reply or version is invalid", code: "invalid" };
  }
  const rows = await sql`SELECT * FROM public.a09_save_human_reply_draft(${businessId}::uuid,${googleReviewId},${normalizedText},${expectedVersion})`;
  const result = rows[0] as { ok: boolean; code: string | null; reply_id: number | string | null;
    google_review_id: string; draft_markdown: string | null; state: ReplyDraftState | null; version: number | null; updated_at: string | Date | null } | undefined;
  if (!result?.ok) {
    const code = result?.code === "not-found" ? "not-found" : result?.code === "invalid" ? "invalid" : "conflict";
    return { ok: false, error: code === "not-found" ? "Review not found" : code === "invalid" ? "Reply or version is invalid" : "Draft changed; reload it before saving", code };
  }
  return { ok: true, draft: toRecord(result as DbDraft) };
}

export async function claimReplyGeneration(actorUserId: string, businessId: string, googleReviewId: string):
  Promise<{ ok: true; claim: ReplyGenerationClaim } | { ok: false; reason: "existing-draft" | "busy" | "not-found" }> {
  const context = await resolveBusinessContext(actorUserId, businessId);
  if (!context) return { ok: false, reason: "not-found" };
  const token = randomUUID();
  const rows = await sql`SELECT * FROM public.a09_claim_reply_generation(${context.businessId}::uuid,${googleReviewId},${token}::uuid)`;
  const result = rows[0] as { ok: boolean; reason: string | null; token: string | null; fence: number | string | null; version: number | null } | undefined;
  if (result?.ok && result.token && result.fence !== null) {
    return { ok: true, claim: { token: result.token, fence: Number(result.fence), version: Number(result.version ?? 0) } };
  }
  const reason = result?.reason === "existing-draft" ? "existing-draft" : result?.reason === "not-found" ? "not-found" : "busy";
  return { ok: false, reason };
}

export async function releaseReplyGenerationClaim(businessId: string, googleReviewId: string, claim: ReplyGenerationClaim): Promise<void> {
  await sql`UPDATE public.review_reply_draft_state s SET generation_token=NULL,generation_lease_until=NULL,updated_at=now()
    FROM public.reviews r WHERE r.id=s.review_id AND r.business_id=s.business_id AND s.business_id=${businessId}::uuid
      AND r.google_review_id=${googleReviewId} AND s.generation_token=${claim.token}::uuid AND s.generation_fence=${claim.fence}`;
}

type ReserveResult = { ok: true; reservationId: string } | { ok: false; reason: "limit" | "stale-claim" | "not-found" };
async function reserveUsage(actorUserId: string, businessId: string, requestId: string, googleReviewId?: string, claim?: ReplyGenerationClaim): Promise<ReserveResult> {
  const context = await resolveBusinessContext(actorUserId, businessId);
  if (!context) return { ok: false, reason: "not-found" };
  let reviewId: string | null = null;
  if (googleReviewId) {
    const reviews = await sql`SELECT id FROM public.reviews WHERE business_id=${context.businessId} AND google_review_id=${googleReviewId} LIMIT 1`;
    if (!reviews[0]) return { ok: false, reason: "not-found" };
    reviewId = String((reviews[0] as { id: string | number }).id);
  }
  const rows = await sql`SELECT * FROM public.a09_reserve_reply_usage(
    ${actorUserId}::uuid,${context.businessId}::uuid,${requestId}::uuid,${reviewId}::bigint,
    ${claim?.token ?? null}::uuid,${claim?.fence ?? null}::bigint)`;
  const result = rows[0] as { ok: boolean; reservation_id: string | null; reason: string | null } | undefined;
  if (result?.ok && result.reservation_id) return { ok: true, reservationId: result.reservation_id };
  const reason = result?.reason === "stale-claim" ? "stale-claim" : result?.reason === "not-found" ? "not-found" : "limit";
  return { ok: false, reason };
}
export function reserveReplyGenerationUsage(actorUserId: string, businessId: string, googleReviewId: string, claim: ReplyGenerationClaim) {
  return reserveUsage(actorUserId, businessId, randomUUID(), googleReviewId, claim);
}
export function reserveReviewReplyUsage(actorUserId: string, businessId: string, requestId: string) {
  return reserveUsage(actorUserId, businessId, requestId);
}

export async function releaseReplyGenerationUsage(reservationId: string, claim?: ReplyGenerationClaim): Promise<void> {
  await sql`SELECT public.a09_finish_reply_usage(${reservationId}::uuid,false)`;
  if (claim) await sql`UPDATE public.review_reply_draft_state SET generation_token=NULL,generation_lease_until=NULL,updated_at=now()
    WHERE generation_token=${claim.token}::uuid AND generation_fence=${claim.fence}`;
}
export async function commitReviewReplyUsage(reservationId: string): Promise<boolean> {
  const rows = await sql`SELECT public.a09_finish_reply_usage(${reservationId}::uuid,true) AS ok`;
  return Boolean((rows[0] as { ok?: boolean } | undefined)?.ok);
}
export function releaseReviewReplyUsage(reservationId: string): Promise<void> { return releaseReplyGenerationUsage(reservationId); }

export async function saveGeneratedReplyDraftAndCharge(input: { businessId: string; googleReviewId: string; markdown: string;
  claim: ReplyGenerationClaim; reservationId: string }): Promise<{ ok: true; draft: ReplyDraftRecord } |
  { ok: false; reason: "stale-claim" | "conflict" | "empty" }> {
  const normalizedText = input.markdown.trim();
  if (!normalizedText || Buffer.byteLength(normalizedText, "utf8") > 4096) return { ok: false, reason: "empty" };
  const rows = await sql`SELECT * FROM public.a09_save_generated_reply(${input.businessId}::uuid,${input.googleReviewId},
    ${normalizedText},${input.claim.token}::uuid,${input.claim.fence},${input.reservationId}::uuid)`;
  const result = rows[0] as { ok: boolean; reason: string | null; reply_id: number | string | null;
    google_review_id: string; draft_markdown: string | null; state: ReplyDraftState | null; version: number | null; updated_at: string | Date | null } | undefined;
  if (result?.ok) return { ok: true, draft: toRecord(result as DbDraft) };
  return { ok: false, reason: result?.reason === "empty" ? "empty" : result?.reason === "conflict" ? "conflict" : "stale-claim" };
}

export async function approveReplyDraft(businessId: string, googleReviewId: string, expectedVersion: number, expectedText: string):
  Promise<{ ok: true; draft: ReplyDraftRecord } | DraftMutationFailure> {
  const rows = await sql`SELECT * FROM public.a09_approve_reply_draft(${businessId}::uuid,${googleReviewId},${expectedVersion},${expectedText})`;
  const result = rows[0] as { ok: boolean; reply_id: number | string | null; google_review_id: string;
    draft_markdown: string | null; state: ReplyDraftState | null; version: number | null; updated_at: string | Date | null } | undefined;
  if (!result?.ok) return { ok: false, error: "Draft changed or is not available for approval", code: "conflict" };
  return { ok: true, draft: toRecord(result as DbDraft) };
}

export type ReplyPostIntent = "manual" | "automatic";
export async function claimReplyPost(businessId: string, googleReviewId: string, text: string, version: number, intent: ReplyPostIntent):
  Promise<{ ok: true; token: string } | { ok: false; reason: "not-found" | "approval-required" | "conflict" }> {
  const token = randomUUID();
  const rows = await sql`SELECT * FROM public.a09_claim_reply_post(${businessId}::uuid,${googleReviewId},${text},${version},${intent},${token}::uuid)`;
  const result = rows[0] as { ok: boolean; reason: string | null; token: string | null } | undefined;
  if (result?.ok && result.token) return { ok: true, token: result.token };
  const reason = result?.reason === "not-found" ? "not-found" : result?.reason === "approval-required" ? "approval-required" : "conflict";
  return { ok: false, reason };
}
export async function finishReplyPost(businessId: string, googleReviewId: string, text: string, token: string, success: boolean): Promise<boolean> {
  const rows = await sql`SELECT public.a09_finish_reply_post(${businessId}::uuid,${googleReviewId},${text},${token}::uuid,${success}) AS ok`;
  return Boolean((rows[0] as { ok?: boolean } | undefined)?.ok);
}
