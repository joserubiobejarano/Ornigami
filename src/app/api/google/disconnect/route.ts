export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { resolveUser } from "@/lib/user-from-req";
import { sql } from "@/lib/db/neon";
import { safeLogger } from "@/lib/safe-logger";
import {
  assertGoogleBusinessOwner,
  googleBusinessErrorResponse,
  requireGoogleBusinessContext,
  resolveRequestedBusinessId,
} from "@/lib/google-business";

export async function POST(req: NextRequest) {
  if (req.headers.get("x-demo") === "true") return NextResponse.json({ ok: true, scope: "demo" });
  const user = await resolveUser(req);
  if (!user || user.demo) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  let body: Record<string, unknown> = {};
  const rawBody = await req.text();
  if (rawBody.trim()) {
    try {
      const parsed = JSON.parse(rawBody) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) body = parsed as Record<string, unknown>;
      else return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    } catch {
      return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    }
  }
  const requested = resolveRequestedBusinessId(req.nextUrl.searchParams.get("businessId"), body.businessId);
  if (!requested.valid) return NextResponse.json({ error: "Conflicting or invalid business selection." }, { status: 400 });

  try {
    const context = await requireGoogleBusinessContext(user.id, requested.businessId);
    assertGoogleBusinessOwner(context);
    await sql`
      WITH deleted AS (
        DELETE FROM public.gbp_connections WHERE user_id = ${context.integrationOwnerUserId}
        RETURNING user_id
      ), invalidated AS (
        UPDATE public.gbp_locations SET connected = false, updated_at = now()
        WHERE user_id = ${context.integrationOwnerUserId}
        RETURNING id
      )
      SELECT (SELECT count(*) FROM deleted) AS deleted_connections,
        (SELECT count(*) FROM invalidated) AS invalidated_locations
    `;
    const response = NextResponse.json({ ok: true, scope: "owner_google_connection" });
    response.cookies.set("ll_gbp_oauth_state", "", { path: "/", maxAge: 0 });
    return response;
  } catch (error) {
    if (error instanceof Error && "status" in error) return googleBusinessErrorResponse(error);
    safeLogger.error("google.disconnect.post.failed", { error: error instanceof Error ? error.message : "unknown" });
    return NextResponse.json({ error: "Google connection service is unavailable." }, { status: 500 });
  }
}
