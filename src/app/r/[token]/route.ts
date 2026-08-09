import { NextRequest, NextResponse } from "next/server";

import { sql } from "@/lib/db/neon";
import { verifyReviewLinkToken } from "@/lib/review-link-token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ token: string }> }
) {
  const { token } = await context.params;
  const payload = verifyReviewLinkToken(token);
  if (!payload) return new NextResponse("Invalid review link", { status: 404 });

  await sql`
    INSERT INTO public.review_link_clicks (business_id, visit_id, user_agent)
    VALUES (${payload.businessId}, ${payload.visitId}, ${request.headers.get("user-agent")})
  `;

  return NextResponse.redirect(payload.reviewUrl, 307);
}