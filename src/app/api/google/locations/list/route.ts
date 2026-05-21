import { NextRequest, NextResponse } from "next/server";

import { resolveUser } from "@/lib/user-from-req";
import { sql } from "@/lib/db/neon";
import { safeLogger } from "@/lib/safe-logger";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const isDemo = req.headers.get("x-demo") === "true";

  if (isDemo) {
    return NextResponse.json({ locations: [] });
  }

  const user = await resolveUser(req);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
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

      return {
        id: loc.id,
        locationName: loc.location_name,
        title: loc.title,
        primaryCategory,
      };
    });

    return NextResponse.json({
      locations: transformedLocations,
    });
  } catch (e: unknown) {
    safeLogger.error("google.locations.list.get.failed", { error: e instanceof Error ? e.message : "unknown" });
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
