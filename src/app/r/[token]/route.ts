import { NextRequest, NextResponse } from "next/server";

import { sql } from "@/lib/db/neon";
import { verifyReviewLinkToken } from "@/lib/review-link-token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function escapeHtml(value: string) {
  const replacements: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  };
  return value.replace(/[&<>'"]/g, (character) => replacements[character] ?? character);
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;
  const payload = verifyReviewLinkToken(token);
  if (!payload) return new NextResponse("This link isn't active anymore.", { status: 404 });

  await sql`
    INSERT INTO public.review_link_clicks (business_id, visit_id, user_agent)
    VALUES (${payload.businessId}, ${payload.visitId}, ${request.headers.get("user-agent")})
  `;

  const businessRows = await sql`SELECT name FROM public.businesses WHERE id = ${payload.businessId} LIMIT 1`;
  const businessName = escapeHtml(String((businessRows[0] as { name?: string } | undefined)?.name || "this business"));
  const reviewUrl = escapeHtml(payload.reviewUrl);

  return new NextResponse(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Thanks for visiting ${businessName}</title><style>body{margin:0;background:#fbfaf6;color:#1b2a22;font-family:Inter,system-ui,sans-serif}main{min-height:100vh;display:grid;place-items:center;padding:24px}.card{max-width:520px;background:#fff;border:1.5px solid #e6e1d5;border-radius:24px;padding:40px;box-shadow:0 24px 48px -28px rgb(18 50 39/.38);text-align:center}.mark{display:inline-grid;place-items:center;width:48px;height:48px;border-radius:16px;background:#123227;color:#fbfaf6;font-weight:800;font-size:24px}.eyebrow{display:inline-block;margin-top:24px;padding:7px 12px;border-radius:999px;background:#f6efd9;color:#123227;font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase}h1{font-size:clamp(32px,6vw,52px);line-height:1.04;margin:18px 0 0;letter-spacing:-.04em}p{color:#5e6d63;font-size:18px;line-height:1.6;margin:18px 0 0}.button{display:inline-block;margin-top:28px;border-radius:999px;background:#efa33c;color:#123227;font-weight:800;padding:14px 22px;text-decoration:none}.note{font-size:12px;margin-top:18px}</style></head><body><main><section class="card"><div class="mark">O</div><div class="eyebrow">A note from ${businessName}</div><h1>Thanks for visiting ${businessName}.</h1><p>If you have a moment, we&apos;d really appreciate a quick review &mdash; it helps more than you know.</p><a class="button" href="${reviewUrl}">Leave a review</a><p class="note">You&apos;ll continue to Google to share your experience.</p></section></main></body></html>`,
    { status: 200, headers: { "Content-Type": "text/html; charset=utf-8", "X-Robots-Tag": "noindex, nofollow" } },
  );
}
