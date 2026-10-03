export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { resolveUser } from "@/lib/user-from-req";
import { sql } from "@/lib/db/neon";
import { resolveBusinessForSessionUserStrict } from "@/lib/api-security";
import { BusinessAccessError } from "@/lib/business-context";
import { safeLogger } from "@/lib/safe-logger";

export async function GET(req: Request) {
  try {
    const user = await resolveUser(req);
    if (!user) {
      return new NextResponse(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      });
    }

    const context = await resolveBusinessForSessionUserStrict(user.id);
    const [projectsRows, reviewsRows, locationsRows] = await Promise.all([
      sql`SELECT count(*)::int AS c FROM public.projects WHERE user_id = ${user.id}`,
      sql`SELECT count(*)::int AS c FROM public.reviews WHERE business_id = ${context.businessId}`,
      sql`SELECT count(*)::int AS c
        FROM public.business_google_locations selected
        INNER JOIN public.gbp_locations location
          ON location.id = selected.location_id
          AND location.user_id = ${context.integrationOwnerUserId}
          AND location.connected IS TRUE
        INNER JOIN public.gbp_connections connection
          ON connection.user_id = location.user_id
          AND connection.connection_version = location.connection_version
        WHERE selected.business_id = ${context.businessId}`,
    ]);
    const projectsRow = projectsRows[0];
    const reviewsRow = reviewsRows[0];
    const locationsRow = locationsRows[0];

    return NextResponse.json({
      projectsCount: Number((projectsRow as { c: number }).c ?? 0),
      reviewsCount: Number((reviewsRow as { c: number }).c ?? 0),
      locationsCount: Number((locationsRow as { c: number }).c ?? 0),
    });
  } catch (e: unknown) {
    safeLogger.error("dashboard.summary.get.failed", { error: e instanceof Error ? e.message : "unknown" });
    if (e instanceof BusinessAccessError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
