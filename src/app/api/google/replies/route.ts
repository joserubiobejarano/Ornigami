export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";

import { requireActiveAgentAccess, safeApiErrorResponse } from "@/lib/api-security";
import { resolveUser } from "@/lib/user-from-req";

import { postReplyToGoogleAndPersist } from "@/lib/review-reply-server";
import { canUseReviewAutomation } from "@/lib/plan";
import { getUserPlan } from "@/lib/plan-server";

export async function POST(req: NextRequest) {
  const isDemo = req.headers.get("x-demo") === "true";

  if (isDemo) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return NextResponse.json({ ok: true });
  }

  const user = await resolveUser(req);

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const plan = await getUserPlan(user.id);
  if (!canUseReviewAutomation(plan)) {
    return NextResponse.json(
      { error: "Posting replies to Google is only available on paid plans" },
      { status: 403 }
    );
  }

  const { reviewId, locationName, reply } = await req.json();

  if (!reviewId || !locationName || !reply) {
    return NextResponse.json({ error: "reviewId, locationName, reply required" }, { status: 400 });
  }

  try {
    const email = "email" in user ? user.email : null;
    await requireActiveAgentAccess(user.id, email, "review_replies");
    const result = await postReplyToGoogleAndPersist(user.id, reviewId, locationName, reply);

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status ?? 502 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    return safeApiErrorResponse(e, "google.replies.post");
  }
}
