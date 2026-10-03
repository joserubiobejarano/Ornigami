import { sql } from "@/lib/db/neon";
import { BusinessAccessError, requireBusinessContext, type BusinessContext } from "@/lib/business-context";
import { discoverGoogleLocations } from "@/lib/google-discovery";
import { getBusinessPlanInfo } from "@/lib/plan-server";

export type SelectedGoogleLocation = {
  id: string;
  location_name: string;
  title: string | null;
  store_code: string | null;
  place_id: string | null;
  address: string | null;
  timezone: string | null;
  raw: Record<string, unknown> | null;
  connection_version: string;
};

export class BusinessGoogleError extends Error {
  readonly status: 403 | 409 | 502 | 503;
  constructor(status: 403 | 409 | 502 | 503, message: string) {
    super(message);
    this.name = "BusinessGoogleError";
    this.status = status;
  }
}

type LocationRow = SelectedGoogleLocation & { selected: boolean };

function canonicalLocationName(value: string): boolean {
  return /^accounts\/[A-Za-z0-9_-]+\/locations\/[A-Za-z0-9_-]+$/.test(value);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function selectedTableError(): BusinessGoogleError {
  // Until the reviewed schema proposal is installed, fail closed with no SQL detail.
  return new BusinessGoogleError(503, "Google location selection is unavailable.");
}

async function readConnectionVersion(ownerUserId: string): Promise<string | null> {
  try {
    const rows = await sql`
      SELECT connection_version FROM public.gbp_connections
      WHERE user_id = ${ownerUserId} LIMIT 1
    ` as { connection_version: string }[];
    return rows[0]?.connection_version ?? null;
  } catch {
    throw selectedTableError();
  }
}

/** Reads this business's durable selection from the canonical owner's cached discoveries. */
export async function getSelectedGoogleLocation(
  context: BusinessContext,
  requestedName?: string
): Promise<SelectedGoogleLocation> {
  if (requestedName !== undefined && !canonicalLocationName(requestedName)) {
    throw new BusinessGoogleError(403, "Google location access denied.");
  }

  let rows: Record<string, unknown>[];
  try {
    rows = await sql`
      SELECT l.id, l.location_name, l.title, l.store_code, l.place_id,
        l.address, l.timezone, l.raw, l.connection_version
      FROM public.business_google_locations selection
      INNER JOIN public.gbp_connections c ON c.user_id = ${context.integrationOwnerUserId}
      INNER JOIN public.gbp_locations l ON l.id = selection.location_id
        AND l.user_id = ${context.integrationOwnerUserId}
        AND l.connected IS TRUE
        AND l.connection_version = c.connection_version
      WHERE selection.business_id = ${context.businessId}
      LIMIT 1
    ` as Record<string, unknown>[];
  } catch {
    throw selectedTableError();
  }

  const row = rows[0];
  if (!row || typeof row.location_name !== "string" || !canonicalLocationName(row.location_name)) {
    throw new BusinessGoogleError(409, "No Google location is selected for this business.");
  }
  if (requestedName !== undefined && requestedName !== row.location_name) {
    throw new BusinessGoogleError(403, "Google location access denied.");
  }
  if (typeof row.connection_version !== "string" || !UUID_RE.test(row.connection_version)) {
    throw new BusinessGoogleError(409, "Google connection is unavailable; reconnect and sync again.");
  }
  return {
    id: String(row.id),
    location_name: row.location_name,
    title: typeof row.title === "string" ? row.title : null,
    store_code: typeof row.store_code === "string" ? row.store_code : null,
    place_id: typeof row.place_id === "string" ? row.place_id : null,
    address: typeof row.address === "string" ? row.address : null,
    timezone: typeof row.timezone === "string" ? row.timezone : null,
    raw: row.raw && typeof row.raw === "object" ? row.raw as Record<string, unknown> : null,
    connection_version: row.connection_version,
  };
}

/** Lists owner-cached discoveries visible to this authorized business context. */
export async function listBusinessGoogleLocations(context: BusinessContext): Promise<LocationRow[]> {
  try {
    const rows = await sql`
      SELECT l.id, l.location_name, l.title, l.store_code, l.place_id,
        l.address, l.timezone, l.raw, l.connection_version,
        (selection.location_id = l.id) AS selected
      FROM public.gbp_locations l
      INNER JOIN public.gbp_connections c ON c.user_id = ${context.integrationOwnerUserId}
      LEFT JOIN public.business_google_locations selection ON selection.business_id = ${context.businessId}
      WHERE l.user_id = ${context.integrationOwnerUserId} AND l.connected IS TRUE
        AND l.connection_version = c.connection_version
        AND (${context.role === "owner"} OR selection.location_id = l.id)
      ORDER BY l.title NULLS LAST, l.location_name ASC
    ` as (Record<string, unknown> & { selected: boolean })[];
    return rows.map((row) => ({
      id: String(row.id),
      location_name: String(row.location_name),
      title: typeof row.title === "string" ? row.title : null,
      store_code: typeof row.store_code === "string" ? row.store_code : null,
      place_id: typeof row.place_id === "string" ? row.place_id : null,
      address: typeof row.address === "string" ? row.address : null,
      timezone: typeof row.timezone === "string" ? row.timezone : null,
      raw: row.raw && typeof row.raw === "object" ? row.raw as Record<string, unknown> : null,
      connection_version: String(row.connection_version),
      selected: row.selected === true,
    }));
  } catch {
    throw selectedTableError();
  }
}

/** Refreshes the canonical owner's cached discoveries, then returns this business's selection state. */
async function syncBusinessGoogleLocationsImpl(context: BusinessContext): Promise<{ locations: LocationRow[]; imported: number }> {
  try {
    await sql`SELECT 1 FROM public.business_google_locations WHERE business_id = ${context.businessId} LIMIT 1`;
  } catch {
    throw selectedTableError();
  }
  const connectionVersion = await readConnectionVersion(context.integrationOwnerUserId);
  if (!connectionVersion || !UUID_RE.test(connectionVersion)) {
    throw new BusinessGoogleError(409, "Google connection is unavailable; reconnect and sync again.");
  }
  let discovered;
  try {
    discovered = await discoverGoogleLocations(context.integrationOwnerUserId, {
      actorUserId: context.actorUserId, businessId: context.businessId,
    });
  } catch {
    throw new BusinessGoogleError(502, "Google location discovery failed.");
  }
  const currentVersion = await readConnectionVersion(context.integrationOwnerUserId);
  if (currentVersion !== connectionVersion) {
    throw new BusinessGoogleError(409, "Google connection changed during location discovery.");
  }
  const existingRows = await sql`
    SELECT id, location_name FROM public.gbp_locations
    WHERE user_id = ${context.integrationOwnerUserId}
      AND connection_version = ${connectionVersion}
  ` as { id: string; location_name: string }[];
  const validDiscovered = discovered.filter((location) => canonicalLocationName(location.locationName));
  const liveNames = new Set(validDiscovered.map((location) => location.locationName));
  for (const location of validDiscovered) {
    const savedRows = await sql`
      WITH business_lock AS MATERIALIZED (
        SELECT id,owner_user_id FROM public.businesses
        WHERE id=${context.businessId}::uuid AND owner_user_id=${context.integrationOwnerUserId}::uuid
        FOR UPDATE
      ), lifecycle_user AS MATERIALIZED (
        SELECT u.id FROM public.users u JOIN business_lock b ON b.owner_user_id=u.id
        WHERE u.privacy_deletion_requested_at IS NULL FOR UPDATE OF u
      )
      INSERT INTO public.gbp_locations (
        user_id, location_name, title, address, store_code, place_id, raw, connected, connection_version, updated_at
      ) SELECT
        ${context.integrationOwnerUserId}, ${location.locationName}, ${location.title || null},
        ${location.address == null ? null : JSON.stringify(location.address)},
        ${location.storeCode}, ${location.placeId}, ${location.raw as unknown}, true,
        gc.connection_version, now()
      FROM public.gbp_connections gc
      JOIN lifecycle_user lu ON lu.id=gc.user_id
      JOIN business_lock ON true
      WHERE gc.user_id = ${context.integrationOwnerUserId}
        AND gc.connection_version = ${connectionVersion}
      ON CONFLICT (user_id, location_name) DO UPDATE SET
        title = EXCLUDED.title,
        address = EXCLUDED.address,
        store_code = EXCLUDED.store_code,
        place_id = EXCLUDED.place_id,
        raw = EXCLUDED.raw,
        connected = true,
        connection_version = EXCLUDED.connection_version,
        updated_at = now()
      RETURNING id
    `;
    if (!savedRows.length) throw new BusinessGoogleError(409, "Google connection changed during location discovery.");
  }
  for (const stale of existingRows) {
    if (!liveNames.has(stale.location_name)) {
      await sql`
        WITH business_lock AS MATERIALIZED (
          SELECT id FROM public.businesses
          WHERE id=${context.businessId}::uuid AND owner_user_id=${context.integrationOwnerUserId}::uuid
          FOR UPDATE
        ), lifecycle_user AS MATERIALIZED (
          SELECT u.id FROM public.users u WHERE u.id=${context.integrationOwnerUserId}::uuid
            AND u.privacy_deletion_requested_at IS NULL AND EXISTS (SELECT 1 FROM business_lock)
          FOR UPDATE OF u
        )
        UPDATE public.gbp_locations SET connected = false, updated_at = now()
        WHERE id = ${stale.id} AND user_id = ${context.integrationOwnerUserId}
          AND connection_version = ${connectionVersion}
          AND EXISTS (SELECT 1 FROM lifecycle_user)
      `;
    }
  }
  const visibleLocations = await listBusinessGoogleLocations(context);
  return {
    locations: visibleLocations,
    imported: context.role === "owner" ? validDiscovered.length : visibleLocations.length,
  };
}

export async function syncBusinessGoogleLocations(context: BusinessContext): Promise<{ locations: LocationRow[]; imported: number }> {
  const { randomUUID } = await import("node:crypto");
  const { beginAccountLifecycleOperation, finishAccountLifecycleOperation } = await import("@/lib/account-lifecycle");
  const operation = await beginAccountLifecycleOperation({
    userId: context.integrationOwnerUserId, actorUserId: context.actorUserId,
    businessId: context.businessId, kind: "google_location_sync", idempotencyKey: randomUUID(), leaseMs: 90000,
  });
  if (operation.result !== "claimed" || !operation.token) {
    throw new BusinessGoogleError(409, "Account lifecycle prevents Google location sync.");
  }
  try {
    const result = await syncBusinessGoogleLocationsImpl(context);
    if (!await finishAccountLifecycleOperation(operation.token, "done")) {
      throw new BusinessGoogleError(409, "Google location sync needs lifecycle reconciliation.");
    }
    return result;
  } catch (error) {
    await finishAccountLifecycleOperation(operation.token, "uncertain").catch(() => false);
    throw error;
  }
}

/** Resolve owner/member access using the selected workspace contract. */
export function assertGoogleBusinessOwner(context: BusinessContext): void {
  if (context.role !== "owner" || context.actorUserId !== context.ownerUserId ||
      context.business.owner_user_id !== context.ownerUserId || context.integrationOwnerUserId !== context.ownerUserId) {
    throw new BusinessAccessError(403, "Business owner access required.");
  }
}

/** Provider changes require an active entitlement on this business, never the actor's personal plan. */
export async function requireGoogleWorkflowEntitlement(context: BusinessContext): Promise<void> {
  const [replies, booster] = await Promise.all([
    getBusinessPlanInfo(context, "review_replies"),
    getBusinessPlanInfo(context, "review_booster"),
  ]);
  if (!replies.hasAccess && !booster.hasAccess) {
    throw new BusinessGoogleError(403, "Google Business Profile access requires an active business plan.");
  }
}

export async function requireGoogleBusinessContext(
  actorUserId: string,
  businessId: string | null | undefined
): Promise<BusinessContext> {
  return requireBusinessContext(actorUserId, businessId);
}

export function googleBusinessErrorResponse(error: unknown): Response {
  const status = error instanceof BusinessAccessError || error instanceof BusinessGoogleError ? error.status : 500;
  const message = status === 401 ? "Authentication required."
    : status === 403 ? "Business or Google location access denied."
      : status === 409 ? "No Google location is selected for this business."
        : status === 502 ? "Google location provider request failed."
          : "Google location service is unavailable.";
  return Response.json({ error: message }, { status });
}

/** Rejects conflicting query/body business selection and lets A02 choose its deterministic default if omitted. */
export function resolveRequestedBusinessId(queryId: string | null, bodyId?: unknown): { valid: boolean; businessId?: string | null } {
  if (bodyId !== undefined && typeof bodyId !== "string") return { valid: false };
  const queryProvided = queryId !== null;
  const bodyProvided = bodyId !== undefined;
  const normalizedBody = bodyProvided ? bodyId as string : null;
  if ((queryProvided && !queryId) || (bodyProvided && !normalizedBody)) return { valid: false };
  if (queryProvided && bodyProvided && queryId !== normalizedBody) return { valid: false };
  return { valid: true, businessId: bodyProvided ? normalizedBody : queryId };
}
