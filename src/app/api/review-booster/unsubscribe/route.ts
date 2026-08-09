import { NextResponse } from "next/server";

import { unsubscribeCustomerFromBusinessFollowups } from "@/modules/review-booster/services/review-booster-db.service";
import { verifyUnsubscribeToken } from "@/modules/review-booster/services/unsubscribe-token.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function html(body: string, status = 200) {
  return new NextResponse(body, {
    status,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}

function tokenFromRequest(req: Request, bodyToken?: string | null): string | null {
  return new URL(req.url).searchParams.get("token") || bodyToken || null;
}

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token");
  if (!token || !verifyUnsubscribeToken(token)) {
    return html("<h1>Invalid unsubscribe link</h1><p>The link is invalid or expired.</p>", 400);
  }
  return html(`<!doctype html><html><body><h1>Unsubscribe</h1><p>Confirm that you no longer want follow-up emails from this business.</p><form method="post"><input type="hidden" name="token" value="${encodeURIComponent(token)}" /><button type="submit">Confirm unsubscribe</button></form></body></html>`);
}

export async function POST(req: Request) {
  let bodyToken: string | null = null;
  try {
    const form = await req.formData();
    bodyToken = form.get("token")?.toString() ?? null;
  } catch {
    bodyToken = null;
  }
  const token = tokenFromRequest(req, bodyToken);
  if (!token) return html("<h1>Invalid unsubscribe link</h1><p>Missing token.</p>", 400);
  const payload = verifyUnsubscribeToken(token);
  if (!payload) return html("<h1>Invalid unsubscribe link</h1><p>The link is invalid or expired.</p>", 400);

  try {
    await unsubscribeCustomerFromBusinessFollowups({ businessId: payload.businessId, customerEmail: payload.customerEmail });
  } catch {
    return html("<h1>We could not process your request</h1><p>Please try again later.</p>", 500);
  }
  return html("<h1>You are unsubscribed</h1><p>You will no longer receive Review Booster follow-up emails from this business.</p>");
}