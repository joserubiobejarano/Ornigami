import { NextResponse } from "next/server";
import { runEligibleFollowups } from "@/server/services/followup-runner";
import { isCronRequestAuthorized } from "@/server/auth";

async function handle(request: Request) {
  if (!isCronRequestAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  return NextResponse.json(await runEligibleFollowups());
}

export const GET = handle;
export const POST = handle;
