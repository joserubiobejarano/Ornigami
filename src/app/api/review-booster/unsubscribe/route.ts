import { NextResponse } from "next/server";

import { unsubscribeCustomerFromBusinessFollowups } from "@/modules/review-booster/services/review-booster-db.service";
import { verifyUnsubscribeToken } from "@/modules/review-booster/services/unsubscribe-token.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function html(body: string, status = 200) {
  return new NextResponse(body, {
    status,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get("token");
  if (!token) {
    return html("<h1>Invalid unsubscribe link</h1><p>Missing token.</p>", 400);
  }

  const payload = verifyUnsubscribeToken(token);
  if (!payload) {
    return html("<h1>Invalid unsubscribe link</h1><p>Token is invalid.</p>", 400);
  }

  try {
    await unsubscribeCustomerFromBusinessFollowups({
      businessId: payload.businessId,
      customerEmail: payload.customerEmail,
    });
  } catch {
    return html("<h1>We could not process your request</h1><p>Please try again later.</p>", 500);
  }

  return html(
    "<h1>You are unsubscribed</h1><p>You will no longer receive Review Booster follow-up emails from this business.</p>"
  );
}
