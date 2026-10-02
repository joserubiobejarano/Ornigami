export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { resolveUser } from "@/lib/user-from-req";
import { safeLogger } from "@/lib/safe-logger";
import { googleBusinessErrorResponse, requireGoogleBusinessContext, requireGoogleWorkflowEntitlement, syncBusinessGoogleLocations } from "@/lib/google-business";

export async function GET(req: NextRequest) {
  if (req.headers.get("x-demo") === "true") return NextResponse.json({ locations: [] });
  const user = await resolveUser(req);
  if (!user || user.demo) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  try {
    const context = await requireGoogleBusinessContext(user.id, req.nextUrl.searchParams.get("businessId"));
    await requireGoogleWorkflowEntitlement(context);
    const result = await syncBusinessGoogleLocations(context);
    return NextResponse.json({ locations: result.locations.map(({ id, location_name, title, store_code, place_id, selected }) => ({
      id, name: location_name, locationName: location_name, title, storeCode: store_code, placeId: place_id, selected,
    })) });
  } catch (error) {
    if (error instanceof Error && "status" in error) return googleBusinessErrorResponse(error);
    safeLogger.error("google.locations.get.failed", { error: error instanceof Error ? error.message : "unknown" });
    return NextResponse.json({ error: "Google locations sync failed." }, { status: 502 });
  }
}
