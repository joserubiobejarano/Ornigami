import * as Sentry from "@sentry/nextjs";
import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const dsnConfigured = Boolean(
    process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN,
  );
  const clientInitialized = Boolean(Sentry.getClient());
  Sentry.captureException(new Error("Temporary Sentry diagnostic event"), {
    tags: { verification: "temporary-diagnostic" },
  });
  await Sentry.flush(2000);

  return NextResponse.json({
    ok: true,
    dsnConfigured,
    clientInitialized,
    eventId: Sentry.lastEventId() ?? null,
  });
}
