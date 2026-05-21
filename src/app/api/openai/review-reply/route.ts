import { NextResponse } from "next/server";
import { z } from "zod";

import { requireActiveAgentAccess, safeApiErrorResponse } from "@/lib/api-security";
import type { ReviewReplyInput } from "@/lib/openai";
import { generateReviewReply } from "@/lib/openai";
import { getProfileReplyDefaults } from "@/lib/reply-profile-defaults";
import { resolveUser } from "@/lib/user-from-req";

/** Core review fields; at least one of text/reviewText required for generation. */
const RequestSchema = z
  .object({
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
      return t.length > 0;
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

/** Request wins if non-empty; then saved profile; then normalized defaults. */
function mergeWithProfileDefaults(
  raw: z.infer<typeof RequestSchema>,
  normalized: ReviewReplySettings,
  saved: Awaited<ReturnType<typeof getProfileReplyDefaults>>
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
  const isSampleRequest =
    req.headers.get("x-sample-review") === "true" ||
    (typeof rawBody === "object" && rawBody !== null && (rawBody as { mode?: string }).mode === "sample");

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
    return NextResponse.json({ reply: mockReply });
  }

  // Sample-review test mode: no auth, no GBP/location/plan required; validate payload only
  if (isSampleRequest) {
    const parsed = RequestSchema.safeParse(rawBody);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      const message = first ? `${first.path.join(".")}: ${first.message}` : "Invalid input";
      return NextResponse.json({ error: message }, { status: 400 });
    }
    try {
      const input = normalizeBody(parsed.data);
      const reply = await generateReviewReply(input);
      return NextResponse.json({ reply });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Server error";
      if (message.includes("OPENAI_API_KEY") || message.includes("Missing credentials")) {
        return NextResponse.json(
          { error: "Missing OpenAI API key. Configure OPENAI_API_KEY to generate replies." },
          { status: 500 }
        );
      }
      return NextResponse.json(
        { error: "Reply generation failed. Please try again." },
        { status: 500 }
      );
    }
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

  try {
    const email = "email" in user ? user.email : null;
    await requireActiveAgentAccess(user.id, email, "review_replies");
    const normalized = normalizeBody(parsed.data);
    const saved = await getProfileReplyDefaults(user.id);
    const input = mergeWithProfileDefaults(parsed.data, normalized, saved);
    const reply = await generateReviewReply(input);
    return NextResponse.json({ reply });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Server error";
    if (message.includes("OPENAI_API_KEY") || message.includes("Missing credentials")) {
      return NextResponse.json(
        { error: "Missing OpenAI API key. Configure OPENAI_API_KEY to generate replies." },
        { status: 500 }
      );
    }
    return safeApiErrorResponse(err, "openai.review_reply.post");
  }
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

