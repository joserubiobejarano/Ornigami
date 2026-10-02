export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { resolveUser } from "@/lib/user-from-req";
import { safeLogger } from "@/lib/safe-logger";
import {
  googleBusinessErrorResponse,
  requireGoogleBusinessContext,
  requireGoogleWorkflowEntitlement,
  resolveRequestedBusinessId,
  syncBusinessGoogleLocations,
} from "@/lib/google-business";

export async function POST(req: NextRequest) {
  if (req.headers.get("x-demo") === "true") return NextResponse.json({ locations: [] });
  const user = await resolveUser(req);
  if (!user || user.demo) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  let body: Record<string, unknown> = {};
  const rawBody = await req.text();
  if (rawBody.trim()) {
    try {
      const parsed = JSON.parse(rawBody) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
      body = parsed as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    }
  }
  const requested = resolveRequestedBusinessId(req.nextUrl.searchParams.get("businessId"), body.businessId);
  if (!requested.valid) return NextResponse.json({ error: "Conflicting or invalid business selection." }, { status: 400 });

  try {
    const context = await requireGoogleBusinessContext(user.id, requested.businessId);
    await requireGoogleWorkflowEntitlement(context);
    const result = await syncBusinessGoogleLocations(context);
    return NextResponse.json({
      locations: result.locations.map(({ id, location_name, title, store_code, place_id, selected }) => ({
        id, name: location_name, locationName: location_name, title, storeCode: store_code, placeId: place_id, selected,
      })),
      imported: result.imported,
    });
  } catch (error) {
    if (error instanceof Error && "status" in error) return googleBusinessErrorResponse(error);
    safeLogger.error("google.locations.sync.post.failed", { error: error instanceof Error ? error.message : "unknown" });
    return NextResponse.json({ error: "Google locations sync failed." }, { status: 502 });
  }
}
