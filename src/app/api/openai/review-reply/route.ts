import { NextResponse } from "next/server";
import { z } from "zod";

import { requireActiveAgentBusinessContext, safeApiErrorResponse } from "@/lib/api-security";
import type { ReviewReplyInput } from "@/lib/openai";
import { sanitizeReviewReply, streamReviewReply } from "@/lib/openai";
import { getBusinessReplyDefaults, type ProfileReplyRow } from "@/lib/reply-profile-defaults";
import { resolveUser } from "@/lib/user-from-req";
import { reserveReviewReplyUsage, commitReviewReplyUsage, releaseReviewReplyUsage, getReplyDraft } from "@/lib/review-draft-policy";
import { BusinessGoogleError, resolveRequestedBusinessId, getSelectedGoogleLocation } from "@/lib/google-business";
import { sql } from "@/lib/db/neon";
import { processReviewDraft } from "@/lib/review-draft-processing";
import type { ReviewRowForReply } from "@/lib/review-reply-server";
import { randomUUID } from "node:crypto";
import { isSameOriginMutation } from "@/lib/team-lifecycle";

/** Core review fields; at least one of text/reviewText required for generation. */
const RequestSchema = z
  .object({
    businessId: z.string().optional(),
    reviewId: z.string().optional(),
    locationName: z.string().optional(),
    text: z.string().optional(),
    reviewText: z.string().optional(),
    businessName: z.string().optional(),
    city: z.string().optional(),
    rating: z.number().int().min(1).max(5).optional(),
    tone: z.string().optional(),
    ownerName: z.string().optional(),
    teamName: z.string().optional(),
    contactPreference: z.string().optional(),
  })
  .refine(
    (data) => {
      const t = (data.text ?? data.reviewText ?? "").trim();
      return t.length > 0 || Boolean(data.reviewId?.trim());
    },
    { message: "text or reviewText is required" }
  );

export type ReviewReplySettings = {
  businessName: string;
  city: string;
  rating: number;
  text: string;
  tone: string;
  ownerName?: string;
  teamName?: string;
  contactPreference?: string;
};

/** Normalize request body into a single shape for generation. Missing optional fields are not filled with placeholders. */
function normalizeBody(raw: z.infer<typeof RequestSchema>): ReviewReplySettings {
  const text = (raw.text ?? raw.reviewText ?? "").trim();
  return {
    businessName: raw.businessName?.trim() ?? "",
    city: raw.city?.trim() ?? "",
    rating: raw.rating ?? 5,
    text,
    tone: raw.tone?.trim() ?? "friendly and professional",
    ownerName: raw.ownerName?.trim() || undefined,
    teamName: raw.teamName?.trim() || undefined,
    contactPreference: raw.contactPreference?.trim() || undefined,
  };
}

function parseBody(req: Request): Promise<unknown> {
  return req.json().catch(() => null);
}

function reservedStreamResponse(
  stream: AsyncIterable<{ choices?: Array<{ delta?: { content?: string | null } }> }>,
  reservationId: string,
): Response {
  const encoder = new TextEncoder();
  let settled = false;
  const iterator = stream[Symbol.asyncIterator]();
  let fullText = "";
  const release = async () => {
    if (settled) return;
    settled = true;
    await releaseReviewReplyUsage(reservationId).catch(() => undefined);
  };
  const responseStream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const next = await iterator.next();
        if (settled) return;
        if (!next.done) {
          const part = next.value.choices?.[0]?.delta?.content ?? "";
          if (part) {
            fullText += part;
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(part)}\n\n`));
          }
          return;
        }
        const clean = sanitizeReviewReply(fullText);
        if (!clean) {
          await release();
          controller.enqueue(encoder.encode(`event: error\ndata: ${JSON.stringify("Reply generation returned no usable text.")}\n\n`));
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
          return;
        }
        const committed = await commitReviewReplyUsage(reservationId);
        if (settled) return;
        if (!committed) {
          await release();
          controller.enqueue(encoder.encode(`event: error\ndata: ${JSON.stringify("Reply usage reservation expired; please try again.")}\n\n`));
        } else {
          settled = true;
          controller.enqueue(encoder.encode(`event: final\ndata: ${JSON.stringify(clean)}\n\n`));
        }
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      } catch {
        await release();
        try {
          controller.enqueue(encoder.encode(`event: error\ndata: ${JSON.stringify("Reply generation failed. Please try again.")}\n\n`));
          controller.close();
        } catch { /* Client cancellation already closed the stream. */ }
      }
    },
    async cancel() {
      await release();
      try {
        await iterator?.return?.();
      } catch {
        // Provider iterator teardown must not keep cancellation or usage release pending.
      }
    },
  });
  return new Response(responseStream, { headers: {
    "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive",
  } });
}

/** Request wins if non-empty; then saved profile; then normalized defaults. */
function mergeWithProfileDefaults(
  raw: z.infer<typeof RequestSchema>,
  normalized: ReviewReplySettings,
  saved: ProfileReplyRow | null
): ReviewReplyInput {
  const businessName =
    raw.businessName?.trim() ||
    (saved?.business_name?.trim() ?? "") ||
    normalized.businessName;

  const city = raw.city?.trim() || normalized.city;

  const tone =
    raw.tone?.trim() ||
    (saved?.reply_tone?.trim() ?? "") ||
    normalized.tone;

  const ownerName =
    raw.ownerName?.trim() ||
    (saved?.owner_name?.trim() ?? "") ||
    normalized.ownerName ||
    undefined;

  const teamName = raw.teamName?.trim() || normalized.teamName;

  const contactPreference =
    raw.contactPreference?.trim() ||
    (saved?.contact_preference?.trim() ?? "") ||
    normalized.contactPreference ||
    undefined;

  return {
    businessName,
    city,
    rating: normalized.rating,
    text: normalized.text,
    tone,
    ownerName,
    teamName: teamName || undefined,
    contactPreference: contactPreference || undefined,
  };
}

export async function POST(req: Request) {
  const rawBody = await parseBody(req);
  if (rawBody === null) {
    return NextResponse.json(
      { error: "Invalid request body (JSON required)" },
      { status: 400 }
    );
  }

  const isDemo = req.headers.get("x-demo") === "true";
  if (isDemo) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const parsed = RequestSchema.safeParse(rawBody);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      const message = first ? `${first.path.join(".")}: ${first.message}` : "Invalid input";
      return NextResponse.json({ error: message }, { status: 400 });
    }
    const json = rawBody as Record<string, unknown>;
    const rating = (typeof json.rating === "number" ? json.rating : 5) as number;
    let mockReply = "";
    if (rating >= 4) {
      mockReply = `Thank you so much for your kind words! We're thrilled to hear you had a great experience with ${String(json.businessName || "us")}. We look forward to serving you again soon!`;
    } else if (rating === 3) {
      mockReply = `Thank you for your feedback. We appreciate you visiting ${String(json.businessName || "us")}. We're always looking to improve, so please let us know if there's anything specific we can do better next time.`;
    } else {
      mockReply = `We're sorry to hear about your experience. At ${String(json.businessName || "our business")}, we strive for excellence and it seems we missed the mark. Please contact us directly so we can make it right.`;
    }
    return new Response(`data: ${JSON.stringify(mockReply)}\n\nevent: final\ndata: ${JSON.stringify(mockReply)}\n\ndata: [DONE]\n\n`, {
      headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform" },
    });
  }

  if (!isSameOriginMutation(req)) {
    return NextResponse.json({ error: "Cross-origin request rejected." }, { status: 403 });
  }

  const user = await resolveUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = RequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const message = first ? `${first.path.join(".")}: ${first.message}` : "Invalid input";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  let pendingReservationId: string | null = null;
  try {
    const email = "email" in user ? user.email : null;
    const requested = resolveRequestedBusinessId(new URL(req.url).searchParams.get("businessId"), parsed.data.businessId);
    if (!requested.valid) return NextResponse.json({ error: "Conflicting or invalid businessId" }, { status: 400 });
    const context = await requireActiveAgentBusinessContext(user.id, email, "review_replies", requested.businessId);
    const saved = await getBusinessReplyDefaults(user.id, context.businessId);

    if (parsed.data.reviewId) {
      const reviewRows = await sql`
        SELECT id, google_review_id, comment, star_rating, location_name
        FROM public.reviews
        WHERE business_id = ${context.businessId} AND google_review_id = ${parsed.data.reviewId}
        LIMIT 1
      ` as (ReviewRowForReply & { location_name: string })[];
      const row = reviewRows[0];
      if (!row) return NextResponse.json({ error: "Review not found" }, { status: 404 });
      if (parsed.data.locationName && parsed.data.locationName !== row.location_name) {
        return NextResponse.json({ error: "Google location access denied." }, { status: 403 });
      }
      await getSelectedGoogleLocation(context, row.location_name);
      const result = await processReviewDraft({
        actorUserId: user.id, businessId: context.businessId, locationName: row.location_name,
        row, profile: saved, source: "individual",
      });
      if (result.outcome === "limit") return NextResponse.json({ error: "Reply generation is temporarily paused after reaching the current safety threshold." }, { status: 429 });
      if (result.outcome === "failed") return NextResponse.json({ error: "Reply generation failed. Please try again." }, { status: 502 });
      if (result.outcome === "skipped") {
        const currentDraft = await getReplyDraft(context.businessId, parsed.data.reviewId);
        const status = result.reason === "existing-draft" || result.reason === "busy" ? 409 : 404;
        return NextResponse.json({ error: "Review already has a saved reply or could not be generated.", code: result.reason, currentDraft }, { status });
      }
      return NextResponse.json({ ok: true, draft: result.draft });
    }

    const normalized = normalizeBody(parsed.data);
    const input = mergeWithProfileDefaults(parsed.data, normalized, saved);
    const reservation = await reserveReviewReplyUsage(user.id, context.businessId, randomUUID());
    if (!reservation.ok) return NextResponse.json({ error: "Reply generation is temporarily paused after reaching the current safety threshold." }, { status: 429 });
    pendingReservationId = reservation.reservationId;
    const stream = await streamReviewReply(input);
    const response = reservedStreamResponse(stream, reservation.reservationId);
    pendingReservationId = null;
    return response;
  } catch (err: unknown) {
    if (pendingReservationId) await releaseReviewReplyUsage(pendingReservationId).catch(() => undefined);
    if (err instanceof BusinessGoogleError) return NextResponse.json({ error: err.message }, { status: err.status });
    const message = err instanceof Error ? err.message : "Server error";
    if (message.includes("OPENAI_API_KEY") || message.includes("Missing credentials")) {
      return NextResponse.json(
        { error: "Reply generation is not configured. Please contact support." },
        { status: 500 }
      );
    }
    return safeApiErrorResponse(err, "openai.review_reply.post");
  }
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

