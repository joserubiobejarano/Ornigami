import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { getOrCreateBusinessForUser } from "@/lib/db/businesses";
import {
  createFollowupRunnerDependencies,
  runEligibleFollowups
} from "@/modules/review-booster/services/followup-runner.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function resolveBusinessForSessionUser(userId: string, email?: string | null) {
  try {
    return await getOrCreateBusinessForUser(userId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("Could not resolve user in public.users") && email) {
      return getOrCreateBusinessForUser(email);
    }
    throw error;
  }
}

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const business = await resolveBusinessForSessionUser(session.user.id, session.user.email);
    const deps = createFollowupRunnerDependencies(business.id);
    const result = await runEligibleFollowups(deps);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
