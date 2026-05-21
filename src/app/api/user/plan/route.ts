import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { getUserPlanInfo } from "@/lib/plan-server";
import { safeLogger } from "@/lib/safe-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const planInfo = await getUserPlanInfo(session.user.id);
    return NextResponse.json(planInfo);
  } catch (e: unknown) {
    safeLogger.error("user.plan.get.failed", { error: e instanceof Error ? e.message : "unknown" });
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
