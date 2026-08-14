import { z } from "zod";

import type { ReviewApiRow, ReviewLocation } from "@/modules/review-replies/types/review.types";

const LocationSchema = z.object({
  locationName: z.string(),
  title: z.string().optional(),
});

const ReviewApiRowSchema = z.object({
  google_review_id: z.string(),
  reviewer_name: z.string().optional(),
  star_rating: z.number().nullable().optional(),
  comment: z.string().nullable().optional(),
  status: z.string(),
  review_update_time: z.string().nullable().optional(),
  draft_reply: z.string().nullable().optional(),
});

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
  businessName: z.string().optional(),
  tone: z.string().optional(),
  ownerName: z.string().optional(),
  contactPreference: z.string().optional(),
  autoReplyAllReviews: z.boolean().optional(),
});

export type ReplySettings = z.infer<typeof ReplySettingsSchema>;

export type ReplySettingsUpdate = {
  businessName: string;
  tone: string;
  ownerName: string;
  contactPreference: string;
  autoReplyAllReviews: boolean;
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

export async function fetchReviewLocations(): Promise<ReviewLocation[]> {
  const response = await fetch("/api/google/locations/list");
  const body = await readJson(response, z.object({ locations: z.array(LocationSchema).optional() }));
  return (body.locations ?? []).map((location) => ({
    name: location.locationName,
    locationName: location.locationName,
    title: location.title,
  }));
}

export async function fetchReviews(locationName: string): Promise<ReviewApiRow[]> {
  const response = await fetch(`/api/reviews?loc=${encodeURIComponent(locationName)}`);
  const body = await readJson(response, z.object({ items: z.array(ReviewApiRowSchema).optional() }));
  return (body.items ?? []) as ReviewApiRow[];
}
