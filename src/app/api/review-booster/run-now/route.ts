import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { requireActiveAgentAccess, safeApiErrorResponse } from "@/lib/api-security";
import {
  createFollowupRunnerDependencies,
  runEligibleFollowups
} from "@/modules/review-booster/services/followup-runner.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const business = await requireActiveAgentAccess(session.user.id, session.user.email, "review_booster");
    const deps = createFollowupRunnerDependencies(business.id);
    const result = await runEligibleFollowups(deps);
    return NextResponse.json(result);
  } catch (error) {
    return safeApiErrorResponse(error, "review_booster.run_now.post");
  }
}
