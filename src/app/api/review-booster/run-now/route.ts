import { NextResponse } from "next/server";

import { withActiveAgent } from "@/lib/api-security";
import {
  createFollowupRunnerDependencies,
  runEligibleFollowups
} from "@/modules/review-booster/services/followup-runner.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = withActiveAgent("review_booster", async (_request, { session, business }) => {
  const deps = await createFollowupRunnerDependencies(business.id, session.user.id);
  const result = await runEligibleFollowups(deps);
  return NextResponse.json(result);
});
