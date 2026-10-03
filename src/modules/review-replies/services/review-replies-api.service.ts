import { z } from "zod";

import type { ReviewApiRow, ReviewDraft, ReviewLocation } from "@/modules/review-replies/types/review.types";

const LocationSchema = z.object({
  locationName: z.string(),
  title: z.string().optional(),
  selected: z.boolean().optional(),
});

const ReviewApiRowSchema = z.object({
  google_review_id: z.string(),
  reviewer_name: z.string().nullable().optional(),
  star_rating: z.number().nullable().optional(),
  comment: z.string().nullable().optional(),
  status: z.string(),
  review_update_time: z.string().nullable().optional(),
  draft_reply: z.string().nullable().optional(),
  draftReply: z.string().nullable().optional(),
  draftState: z.enum(["new", "ai_drafted", "human_edited", "approved", "posted"]).optional(),
  draftVersion: z.number().int().nonnegative().optional(),
  draftUpdatedAt: z.string().nullable().optional(),
});

const DraftSchema = z.object({
  replyId: z.number().int().nullable(),
  reviewId: z.string(),
  reply: z.string().nullable(),
  state: z.enum(["new", "ai_drafted", "human_edited", "approved", "posted"]),
  version: z.number().int().nonnegative(),
  updatedAt: z.string().nullable(),
}) satisfies z.ZodType<ReviewDraft>;

export class DraftVersionConflictError extends Error {
  readonly currentDraft: ReviewDraft | null;
  readonly code = "conflict";

  constructor(message: string, currentDraft: ReviewDraft | null) {
    super(message);
    this.name = "DraftVersionConflictError";
    this.currentDraft = currentDraft;
  }
}

async function readJson<T>(response: Response, schema: z.ZodType<T>): Promise<T> {
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(
      body && typeof body === "object" && "error" in body && typeof body.error === "string"
        ? body.error
        : "Request failed. Please try again in a moment."
    );
  }
  return schema.parse(body);
}

const ReplySettingsSchema = z.object({
  businessId: z.string().optional(),
  role: z.enum(["owner", "member"]).optional(),
  isOwner: z.boolean().optional(),
  canManageAutoReply: z.boolean().optional(),
  readOnly: z.boolean().optional(),
  businessName: z.string().optional(),
  tone: z.string().optional(),
  ownerName: z.string().optional(),
  contactPreference: z.string().optional(),
  autoReplyAllReviews: z.boolean().optional(),
});

export type ReplySettings = z.infer<typeof ReplySettingsSchema>;

export type ReplySettingsUpdate = {
  businessId?: string;
  businessName?: string;
  tone?: string;
  ownerName?: string;
  contactPreference?: string;
  autoReplyAllReviews?: boolean;
};

export async function fetchReplySettings(): Promise<ReplySettings | null> {
  const response = await fetch("/api/settings/reply");
  if (!response.ok) return null;
  const body: unknown = await response.json().catch(() => null);
  const parsed = ReplySettingsSchema.safeParse(body);
  return parsed.success ? parsed.data : null;
}

export async function updateReplySettings(input: ReplySettingsUpdate): Promise<void> {
  const response = await fetch("/api/settings/reply", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (response.ok) return;
  const body: unknown = await response.json().catch(() => null);
  throw new Error(
    body && typeof body === "object" && "error" in body && typeof body.error === "string"
      ? body.error
      : "Something went wrong. Try again in a moment."
  );
}

export async function fetchReviewLocations(businessId?: string): Promise<ReviewLocation[]> {
  const query = businessId ? `?businessId=${encodeURIComponent(businessId)}` : "";
  const response = await fetch(`/api/google/locations/list${query}`);
  const body = await readJson(response, z.object({ locations: z.array(LocationSchema).optional() }));
  return (body.locations ?? []).map((location) => ({
    name: location.locationName,
    locationName: location.locationName,
    title: location.title,
    selected: location.selected,
  }));
}

export async function fetchReviews(locationName: string, businessId?: string): Promise<ReviewApiRow[]> {
  const query = new URLSearchParams({ loc: locationName });
  if (businessId) query.set("businessId", businessId);
  const response = await fetch(`/api/reviews?${query.toString()}`);
  const body = await readJson(response, z.object({ items: z.array(ReviewApiRowSchema).optional() }));
  return (body.items ?? []) as ReviewApiRow[];
}

export async function saveReviewDraft(input: {
  businessId?: string;
  reviewId: string;
  reply: string;
  expectedVersion: number;
}): Promise<ReviewDraft> {
  const response = await fetch("/api/reviews/draft", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const body: unknown = await response.json().catch(() => null);
  if (response.status === 409) {
    const parsed = z.object({ error: z.string().optional(), currentDraft: DraftSchema.nullable().optional() }).safeParse(body);
    throw new DraftVersionConflictError(
      parsed.success ? parsed.data.error ?? "This draft changed in another session." : "This draft changed in another session.",
      parsed.success ? parsed.data.currentDraft ?? null : null
    );
  }
  if (!response.ok) {
    throw new Error(body && typeof body === "object" && "error" in body && typeof body.error === "string"
      ? body.error
      : "We couldn't save this draft. Try again in a moment.");
  }
  const parsed = z.object({ ok: z.literal(true), draft: DraftSchema }).parse(body);
  return parsed.draft;
}

export async function postReviewReply(input: {
  businessId?: string;
  reviewId: string;
  locationName: string;
  reply: string;
  expectedVersion: number;
}): Promise<ReviewDraft | null> {
  const response = await fetch("/api/google/replies", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...input, intent: "manual" }),
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 409) {
      const parsed = z.object({ error: z.string().optional(), currentDraft: DraftSchema.nullable().optional() }).safeParse(body);
      throw new DraftVersionConflictError(
        parsed.success ? parsed.data.error ?? "This draft changed in another session." : "This draft changed in another session.",
        parsed.success ? parsed.data.currentDraft ?? null : null
      );
    }
    throw new Error(body && typeof body === "object" && "error" in body && typeof body.error === "string"
      ? body.error
      : "We couldn't post this reply to Google. Try again in a moment.");
  }
  const parsed = z.object({ ok: z.boolean().optional(), draft: DraftSchema.optional() }).safeParse(body);
  return parsed.success ? parsed.data.draft ?? null : null;
}
