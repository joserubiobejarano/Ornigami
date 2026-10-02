import { NextRequest, NextResponse } from "next/server";
import { resolveUser } from "@/lib/user-from-req";
import { sql } from "@/lib/db/neon";
import { safeLogger } from "@/lib/safe-logger";
import { googleBusinessErrorResponse, listBusinessGoogleLocations, requireGoogleBusinessContext } from "@/lib/google-business";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  if (req.headers.get("x-demo") === "true") return NextResponse.json({ connected: false, locations: [] });
  const user = await resolveUser(req);
  if (!user || user.demo) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  try {
    const context = await requireGoogleBusinessContext(user.id, req.nextUrl.searchParams.get("businessId"));
    const connections = await sql`
      SELECT 1 AS connected FROM public.gbp_connections
      WHERE user_id = ${context.integrationOwnerUserId} LIMIT 1
    `;
    const canManage = context.role === "owner";
    if (!connections.length) return NextResponse.json({ connected: false, locations: [], canManage });
    const locations = await listBusinessGoogleLocations(context);
    const selections = await sql`
      SELECT 1 FROM public.business_google_locations
      WHERE business_id = ${context.businessId} LIMIT 1
    `;
    return NextResponse.json({
      connected: true,
      canManage,
      selectionLocked: selections.length > 0,
      locations: locations.map((location) => {
        const raw = location.raw ?? {};
        const primaryCategory =
          (raw.categories as { primaryCategory?: { displayName?: string } } | undefined)?.primaryCategory?.displayName ||
          (raw.primaryCategory as { displayName?: string } | undefined)?.displayName ||
          (raw.primaryCategoryId as string) ||
          (raw.storefront as { primaryCategoryId?: string } | undefined)?.primaryCategoryId || null;
        return {
          id: location.id,
          locationName: location.location_name,
          title: location.title,
          primaryCategory,
          isSuspended: raw.suspended === true,
          selected: location.selected,
        };
      }),
    });
  } catch (error) {
    if (error instanceof Error && "status" in error) return googleBusinessErrorResponse(error);
    safeLogger.error("google.connection.get.failed", { error: error instanceof Error ? error.message : "unknown" });
    return NextResponse.json({ error: "Google connection service is unavailable." }, { status: 500 });
  }
}
