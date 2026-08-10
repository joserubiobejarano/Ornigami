import * as Sentry from "@sentry/nextjs";
import { NextRequest, NextResponse } from "next/server";

import { isAuthorizedCronRequest } from "@/lib/cron-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Temporary production verification endpoint. Remove after Sentry is confirmed. */
export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const error = new Error("Temporary Sentry production integration test");
  Sentry.captureException(error, { tags: { verification: "temporary-production-test" } });
  await Sentry.flush(2000);

  return NextResponse.json({ ok: false, error: "Sentry test event sent" }, { status: 500 });
}
