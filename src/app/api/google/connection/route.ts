import { NextRequest, NextResponse } from "next/server";

import { resolveUser } from "@/lib/user-from-req";
import { sql } from "@/lib/db/neon";
import { safeLogger } from "@/lib/safe-logger";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const isDemo = req.headers.get("x-demo") === "true";

  if (isDemo) {
    return NextResponse.json({ connected: false });
  }

  const user = await resolveUser(req);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const conn = await sql`
      SELECT user_id FROM public.gbp_connections WHERE user_id = ${user.id} LIMIT 1
    `;

    if (!conn.length) {
      return NextResponse.json({ connected: false });
    }

    const locations = await sql`
      SELECT id, location_name, title, raw
      FROM public.gbp_locations
      WHERE user_id = ${user.id}
      ORDER BY title NULLS LAST
    `;

    const transformedLocations = (locations as Record<string, unknown>[]).map((loc) => {
      const raw = (loc.raw as Record<string, unknown>) || {};

      const primaryCategory =
        (raw.primaryCategory as { displayName?: string } | undefined)?.displayName ||
        (raw.primaryCategoryId as string) ||
        (raw.storefront as { primaryCategoryId?: string } | undefined)?.primaryCategoryId ||
        null;

      const isSuspended = raw.suspended === true || false;

      return {
        id: loc.id,
        locationName: loc.location_name,
        title: loc.title,
        primaryCategory,
        isSuspended,
      };
    });

    return NextResponse.json({
      connected: true,
      locations: transformedLocations,
    });
  } catch (e: unknown) {
    safeLogger.error("google.connection.get.failed", { error: e instanceof Error ? e.message : "unknown" });
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
