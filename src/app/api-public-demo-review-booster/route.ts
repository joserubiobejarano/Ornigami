import { createHash, randomBytes } from "node:crypto";

import { NextResponse } from "next/server";
import { z } from "zod";

import { sql } from "@/lib/db/neon";
import { getOptionalEnv, getServerAppUrl } from "@/lib/env";
import {
  checkAndIncrementPublicDemoLimit,
  checkAndIncrementPublicDemoLimitDurable,
  getRequestIp,
  hashValue,
} from "@/lib/public-demo-limiter";
import { safeLogger } from "@/lib/safe-logger";
import { generateFollowupEmailBody } from "@/modules/review-booster/services/followup-email-generator.service";
import { sendWithResend } from "@/modules/review-booster/services/resend.provider";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const toneOptions = ["warm and friendly", "professional", "casual", "grateful"] as const;

function isAllowedGoogleReviewUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return false;
    if (url.hostname === "g.page") return url.pathname.toLowerCase().endsWith("/review");
    if (url.hostname === "search.google.com") return url.pathname === "/local/writereview";
    return ["google.com", "www.google.com", "maps.google.com", "www.google.es"].includes(url.hostname) && url.pathname.startsWith("/maps/");
  } catch {
    return false;
  }
}

const PublicDemoSchema = z.object({
  business_name: z.string().trim().min(1).max(120),
  business_type: z.string().trim().max(80).optional().nullable(),
  city: z.string().trim().max(80).optional().nullable(),
  customer_name: z.string().trim().max(80).optional().nullable(),
  recipient_email: z.string().trim().email().max(254),
  google_review_url: z.string().trim().url().max(500).refine(isAllowedGoogleReviewUrl, "Use a direct Google review link."),
  rebooking_url: z.string().trim().url().max(500).optional().nullable(),
  tone: z.enum(toneOptions).optional().nullable(),
});

function normalizeOptional(value?: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

async function sendConfirmationEmail(recipientEmail: string, confirmationUrl: string) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${getRequiredResendApiKey()}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: `Ornigami <${getRequiredEmailFrom()}>`,
      to: recipientEmail,
      subject: "Confirm your Ornigami demo email",
      text: `Confirm that you control this address to receive the sample demo email: ${confirmationUrl}`,
      html: `<p>Confirm that you control this address to receive the sample demo email.</p><p><a href="${confirmationUrl}">Confirm demo email</a></p>`,
    }),
  });
  if (!response.ok) throw new Error(`Resend request failed (${response.status})`);
}

function getRequiredResendApiKey(): string {
  const value = getOptionalEnv("RESEND_API_KEY");
  if (!value) throw new Error("RESEND_API_KEY is not set");
  return value;
}

function getRequiredEmailFrom(): string {
  const value = getOptionalEnv("EMAIL_FROM");
  if (!value) throw new Error("EMAIL_FROM is not set");
  return value;
}

export async function POST(req: Request) {
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const parsed = PublicDemoSchema.safeParse(payload);
  if (!parsed.success) return NextResponse.json({ error: "Please check your inputs and try again." }, { status: 400 });
  const input = parsed.data;

  const globallyAllowed = await checkAndIncrementPublicDemoLimitDurable({ keyType: "global", keyHash: "review_booster_demo", maxPerDay: 100 }).catch(() => checkAndIncrementPublicDemoLimit("review_booster:global", 100));
  if (!globallyAllowed) return NextResponse.json({ error: "Daily demo capacity has been reached. Please try again tomorrow." }, { status: 429 });
  const emailHash = hashValue(input.recipient_email.toLowerCase());
  const emailAllowed = await checkAndIncrementPublicDemoLimitDurable({ keyType: "email", keyHash: emailHash, maxPerDay: 2 }).catch(() => checkAndIncrementPublicDemoLimit(`review_booster:email:${emailHash}`, 2));
  if (!emailAllowed) return NextResponse.json({ error: "You have reached the daily demo limit for this email." }, { status: 429 });
  const requestIp = getRequestIp(req.headers);
  if (requestIp) {
    const ipHash = hashValue(requestIp);
    const ipAllowed = await checkAndIncrementPublicDemoLimitDurable({ keyType: "ip", keyHash: ipHash, maxPerDay: 20 }).catch(() => checkAndIncrementPublicDemoLimit(`review_booster:ip:${ipHash}`, 20));
    if (!ipAllowed) return NextResponse.json({ error: "Too many demo attempts. Please try again tomorrow." }, { status: 429 });
  }

  if (!getOptionalEnv("RESEND_API_KEY") || !getOptionalEnv("EMAIL_FROM")) return NextResponse.json({ error: "Demo email sending is temporarily unavailable." }, { status: 503 });

  const confirmationToken = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(confirmationToken).digest("hex");
  await sql`
    INSERT INTO public.public_demo_email_challenges (token_hash, recipient_email, payload, expires_at)
    VALUES (${tokenHash}, ${input.recipient_email.toLowerCase()}, ${JSON.stringify(input)}::jsonb, now() + interval '20 minutes')
  `;
  const confirmationUrl = `${getServerAppUrl()}/api-public-demo-review-booster?token=${encodeURIComponent(confirmationToken)}`;
  try {
    await sendConfirmationEmail(input.recipient_email, confirmationUrl);
  } catch (error) {
    safeLogger.error("public_demo.review_booster.confirmation_failed", { error: error instanceof Error ? error.message : "unknown" });
    return NextResponse.json({ error: "We could not send the confirmation email right now." }, { status: 503 });
  }

  return NextResponse.json({ ok: false, confirmationRequired: true, message: "Check your inbox to confirm this address before the demo email is sent." }, { status: 202 });
}

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token")?.trim();
  if (!token) return new NextResponse("Invalid confirmation link.", { status: 400 });
  const tokenHash = hashValue(token);
  const rows = await sql`
    UPDATE public.public_demo_email_challenges
    SET confirmed_at = now()
    WHERE token_hash = ${tokenHash} AND expires_at > now() AND used_at IS NULL AND confirmed_at IS NULL
    RETURNING recipient_email, payload
  `;
  const challenge = rows[0] as { recipient_email: string; payload: Record<string, unknown> } | undefined;
  if (!challenge) return new NextResponse("This confirmation link is invalid or expired.", { status: 410 });

  const input = PublicDemoSchema.parse(challenge.payload);
  const body = await generateFollowupEmailBody({
    business_name: input.business_name,
    business_type: normalizeOptional(input.business_type),
    city: normalizeOptional(input.city),
    customer_name: normalizeOptional(input.customer_name),
    service_name: null,
    google_review_url: input.google_review_url,
    tone_setting: normalizeOptional(input.tone),
    language: "en",
  });
  const subject = "A sample follow-up email from Ornigami";
  const demoBody = `${body}\n\n-\nSample sent by Ornigami for demonstration purposes.`;
  try {
    await sendWithResend({ business_name: "Ornigami Demo", customer_email: challenge.recipient_email, subject, body: demoBody, google_review_url: input.google_review_url, email_from_name: "Ornigami Demo" });
    await sql`UPDATE public.public_demo_email_challenges SET used_at = now() WHERE token_hash = ${tokenHash}`;
  } catch (error) {
    safeLogger.error("public_demo.review_booster.send_failed", { error: error instanceof Error ? error.message : "unknown" });
    await sql`UPDATE public.public_demo_email_challenges SET confirmed_at = NULL WHERE token_hash = ${tokenHash}`;
    return new NextResponse("We could not send the demo email. Please request a new confirmation link.", { status: 503 });
  }

  return NextResponse.redirect(new URL("/demo/review-booster?confirmed=1", getServerAppUrl()));
}
