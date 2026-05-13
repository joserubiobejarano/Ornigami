import { NextResponse } from "next/server";
import { z } from "zod";

import { checkAndIncrementPublicDemoLimit, getRequestIp, hashValue } from "@/lib/public-demo-limiter";
import {
  buildSubject,
  generateFollowupEmailBody,
} from "@/modules/review-booster/services/followup-email-generator.service";
import { sendWithResend } from "@/modules/review-booster/services/resend.provider";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const toneOptions = ["warm and friendly", "professional", "casual", "grateful"] as const;

const PublicDemoSchema = z.object({
  business_name: z.string().trim().min(1).max(120),
  business_type: z.string().trim().max(80).optional().nullable(),
  city: z.string().trim().max(80).optional().nullable(),
  customer_name: z.string().trim().max(80).optional().nullable(),
  recipient_email: z.string().trim().email().max(254),
  google_review_url: z.string().trim().url().max(500).optional().nullable(),
  rebooking_url: z.string().trim().url().max(500).optional().nullable(),
  tone: z.enum(toneOptions).optional().nullable(),
});

function normalizeOptional(value?: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function POST(req: Request) {
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const parsed = PublicDemoSchema.safeParse(payload);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]?.path?.[0];
    if (firstIssue === "recipient_email") {
      return NextResponse.json({ error: "Please enter a valid email address." }, { status: 400 });
    }
    if (firstIssue === "business_name") {
      return NextResponse.json({ error: "Business name is required." }, { status: 400 });
    }
    return NextResponse.json({ error: "Please check your inputs and try again." }, { status: 400 });
  }

  const input = parsed.data;
  const emailHash = hashValue(input.recipient_email.toLowerCase());
  const emailLimiterKey = `review_booster:email:${emailHash}`;
  if (!checkAndIncrementPublicDemoLimit(emailLimiterKey, 2)) {
    return NextResponse.json(
      { error: "You have reached the daily demo limit for this email." },
      { status: 429 }
    );
  }

  const requestIp = getRequestIp(req.headers);
  if (requestIp) {
    const ipLimiterKey = `review_booster:ip:${hashValue(requestIp)}`;
    if (!checkAndIncrementPublicDemoLimit(ipLimiterKey, 20)) {
      return NextResponse.json(
        { error: "Too many demo attempts. Please try again tomorrow." },
        { status: 429 }
      );
    }
  }

  const businessName = input.business_name.trim();
  const googleReviewUrl =
    normalizeOptional(input.google_review_url) ?? "https://search.google.com/local/writereview";

  const subject = `[Demo] ${buildSubject(businessName)}`;
  const body = await generateFollowupEmailBody({
    business_name: businessName,
    business_type: normalizeOptional(input.business_type),
    city: normalizeOptional(input.city),
    customer_name: normalizeOptional(input.customer_name),
    service_name: null,
    google_review_url: googleReviewUrl,
    tone_setting: normalizeOptional(input.tone),
    language: "en",
  });

  if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) {
    return NextResponse.json(
      { error: "Demo email sending is temporarily unavailable." },
      { status: 503 }
    );
  }

  try {
    await sendWithResend({
      business_name: businessName,
      customer_email: input.recipient_email,
      subject,
      body: `[DEMO EMAIL]\n\n${body}`,
      google_review_url: googleReviewUrl,
      email_from_name: businessName,
    });
  } catch (error) {
    console.error("[public-demo/review-booster] send failed", error);
    return NextResponse.json(
      { error: "We could not send the demo email right now. Please try again shortly." },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, subject, body: `[DEMO EMAIL]\n\n${body}` });
}
