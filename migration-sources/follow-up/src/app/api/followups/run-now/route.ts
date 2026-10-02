import { NextResponse } from "next/server";
import { runEligibleFollowups } from "@/server/services/followup-runner";
import { safeLoggerError } from "@/server/safe-logger";

function isSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (!origin || !host) {
    return false;
  }

  try {
    const originUrl = new URL(origin);
    return originUrl.host === host;
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runEligibleFollowups();
    return NextResponse.json(result);
  } catch (error) {
    safeLoggerError("followups.run_now.failed", error);
    return NextResponse.json({ error: "Failed to run follow-ups" }, { status: 500 });
  }
}
