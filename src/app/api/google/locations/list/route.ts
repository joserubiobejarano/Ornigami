export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { resolveUser } from "@/lib/user-from-req";
import { safeLogger } from "@/lib/safe-logger";
import { googleBusinessErrorResponse, listBusinessGoogleLocations, requireGoogleBusinessContext } from "@/lib/google-business";

export async function GET(req: NextRequest) {
  if (req.headers.get("x-demo") === "true") return NextResponse.json({ locations: [] });
  const user = await resolveUser(req);
  if (!user || user.demo) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  try {
    const context = await requireGoogleBusinessContext(user.id, req.nextUrl.searchParams.get("businessId"));
    const locations = await listBusinessGoogleLocations(context);
    return NextResponse.json({ locations: locations.map((location) => ({
      id: location.id,
      locationName: location.location_name,
      title: location.title,
      primaryCategory:
        (location.raw?.categories as { primaryCategory?: { displayName?: string } } | undefined)?.primaryCategory?.displayName ||
        (location.raw?.primaryCategory as { displayName?: string } | undefined)?.displayName ||
        (location.raw?.primaryCategoryId as string) ||
        (location.raw?.storefront as { primaryCategoryId?: string } | undefined)?.primaryCategoryId || null,
      selected: location.selected,
    })) });
  } catch (error) {
    if (error instanceof Error && "status" in error) return googleBusinessErrorResponse(error);
    safeLogger.error("google.locations.list.get.failed", { error: error instanceof Error ? error.message : "unknown" });
    return NextResponse.json({ error: "Google locations are unavailable." }, { status: 500 });
  }
}
