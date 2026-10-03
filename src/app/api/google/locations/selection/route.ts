export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { resolveUser } from "@/lib/user-from-req";
import { sql } from "@/lib/db/neon";
import { discoverGoogleLocations } from "@/lib/google-discovery";
import { safeLogger } from "@/lib/safe-logger";
import {
  assertGoogleBusinessOwner,
  googleBusinessErrorResponse,
  requireGoogleBusinessContext,
  requireGoogleWorkflowEntitlement,
  resolveRequestedBusinessId,
} from "@/lib/google-business";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LOCATION_RE = /^accounts\/[A-Za-z0-9_-]+\/locations\/[A-Za-z0-9_-]+$/;

export async function POST(req: NextRequest) {
  const user = await resolveUser(req);
  if (!user || user.demo) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    const parsed = await req.json() as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("bad_body");
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const requested = resolveRequestedBusinessId(req.nextUrl.searchParams.get("businessId"), body.businessId);
  if (!requested.valid) return NextResponse.json({ error: "Conflicting or invalid business selection." }, { status: 400 });
  if (typeof body.locationId !== "string" || !UUID_RE.test(body.locationId)) {
    return NextResponse.json({ error: "Invalid Google location selection." }, { status: 400 });
  }

  try {
    const context = await requireGoogleBusinessContext(user.id, requested.businessId);
    assertGoogleBusinessOwner(context);
    await requireGoogleWorkflowEntitlement(context);

    const localRows = await sql`
      SELECT l.id, l.location_name, l.title
        , c.connection_version
      FROM public.gbp_locations l
      INNER JOIN public.gbp_connections c ON c.user_id = ${context.integrationOwnerUserId}
      WHERE l.id = ${body.locationId} AND l.user_id = ${context.integrationOwnerUserId}
        AND l.connected IS TRUE AND l.connection_version = c.connection_version
      LIMIT 1
    `;
    const local = localRows[0] as { id: string; location_name: string; title: string | null; connection_version: string } | undefined;
    if (!local || !LOCATION_RE.test(local.location_name)) {
      return NextResponse.json({ error: "Google location access denied." }, { status: 403 });
    }

    const existingRows = await sql`
      SELECT location_id FROM public.business_google_locations
      WHERE business_id = ${context.businessId} LIMIT 1
    `;
    const existing = existingRows[0] as { location_id: string } | undefined;
    if (existing && existing.location_id !== local.id) {
      return NextResponse.json({ error: "This business already has a selected Google location." }, { status: 409 });
    }

    // Selection is owner-authorized and must still be visible in a fresh provider discovery.
    let liveLocations;
    try {
      liveLocations = await discoverGoogleLocations(context.integrationOwnerUserId, {
        actorUserId: user.id, businessId: context.businessId,
      });
    } catch {
      return NextResponse.json({ error: "Google location verification failed." }, { status: 502 });
    }
    if (!liveLocations.some((location) => location.locationName === local.location_name && LOCATION_RE.test(location.locationName))) {
      return NextResponse.json({ error: "Google location access denied." }, { status: 403 });
    }

    // The OAuth account can change while live verification is in flight. Bind
    // this selection to the generation observed with the local cached row.
    const currentRows = await sql`
      SELECT connection_version FROM public.gbp_connections
      WHERE user_id = ${context.integrationOwnerUserId} LIMIT 1
    `;
    const current = currentRows[0] as { connection_version: string } | undefined;
    if (!current || current.connection_version !== local.connection_version) {
      return NextResponse.json({ error: "Google connection changed during location verification." }, { status: 409 });
    }

    if (existing) {
      await sql`
        WITH business_lock AS MATERIALIZED (
          SELECT id,owner_user_id FROM public.businesses WHERE id=${context.businessId}::uuid
            AND owner_user_id=${context.ownerUserId}::uuid FOR UPDATE
        ), lifecycle_user AS MATERIALIZED (
          SELECT u.id FROM public.users u JOIN business_lock b ON b.owner_user_id=u.id
            WHERE u.privacy_deletion_requested_at IS NULL FOR UPDATE OF u
        )
        UPDATE public.business_google_locations selection SET updated_at = now()
        FROM public.gbp_locations l, public.gbp_connections c, business_lock b, lifecycle_user u
        WHERE selection.business_id = ${context.businessId} AND selection.location_id = ${local.id}
          AND b.id=selection.business_id AND u.id=b.owner_user_id
          AND l.id = selection.location_id AND l.user_id = ${context.integrationOwnerUserId}
          AND l.connected IS TRUE AND l.connection_version = ${local.connection_version}
          AND c.user_id = ${context.integrationOwnerUserId} AND c.connection_version = ${local.connection_version}
      `;
    } else {
      await sql`
        WITH business_lock AS MATERIALIZED (
          SELECT id,owner_user_id FROM public.businesses WHERE id=${context.businessId}::uuid
            AND owner_user_id=${context.ownerUserId}::uuid FOR UPDATE
        ), lifecycle_user AS MATERIALIZED (
          SELECT u.id FROM public.users u JOIN business_lock b ON b.owner_user_id=u.id
            WHERE u.privacy_deletion_requested_at IS NULL FOR UPDATE OF u
        )
        INSERT INTO public.business_google_locations (business_id, location_id)
        SELECT b.id, l.id
        FROM business_lock b JOIN lifecycle_user u ON u.id=b.owner_user_id
        JOIN public.gbp_locations l ON true
        INNER JOIN public.gbp_connections c ON c.user_id = ${context.integrationOwnerUserId}
          AND c.connection_version = ${local.connection_version}
        WHERE l.id = ${local.id} AND l.user_id = ${context.integrationOwnerUserId}
          AND l.connected IS TRUE AND l.connection_version = ${local.connection_version}
        ON CONFLICT (business_id) DO NOTHING
        RETURNING location_id
      `;
      const afterInsert = await sql`
        SELECT location_id FROM public.business_google_locations
        WHERE business_id = ${context.businessId} LIMIT 1
      `;
      const selected = afterInsert[0] as { location_id: string } | undefined;
      if (!selected) throw new Error("selection_write_failed");
      if (selected.location_id !== local.id) {
        return NextResponse.json({ error: "This business already has a selected Google location." }, { status: 409 });
      }
    }

    // A generation can change after the guarded write. The schema trigger and
    // versioned read keep any resulting mapping unauthorized; return conflict.
    const stillCurrent = await sql`
      SELECT 1 FROM public.gbp_connections c
      INNER JOIN public.gbp_locations l ON l.user_id = c.user_id
        AND l.id = ${local.id} AND l.connected IS TRUE
        AND l.connection_version = c.connection_version
      WHERE c.user_id = ${context.integrationOwnerUserId}
        AND c.connection_version = ${local.connection_version}
      LIMIT 1
    `;
    if (!stillCurrent.length) {
      return NextResponse.json({ error: "Google connection changed during location selection." }, { status: 409 });
    }

    return NextResponse.json({
      selectedLocation: { id: local.id, locationName: local.location_name, title: local.title },
    });
  } catch (error) {
    if (error instanceof Error && "status" in error) return googleBusinessErrorResponse(error);
    safeLogger.error("google.locations.selection.post.failed", { error: error instanceof Error ? error.message : "unknown" });
    return NextResponse.json({ error: "Google location selection is unavailable." }, { status: 503 });
  }
}
