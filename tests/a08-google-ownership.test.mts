import assert from "node:assert/strict";
import test from "node:test";
import { fakeSql, loadTs } from "./a02-test-support.mts";
import type { BusinessContext } from "../src/lib/business-context.ts";

const actor = "11111111-1111-4111-8111-111111111111";
const owner = actor;
const member = "22222222-2222-4222-8222-222222222222";
const businessId = "33333333-3333-4333-8333-333333333333";
const locationId = "44444444-4444-4444-8444-444444444444";
const locationName = "accounts/987654321/locations/123456789";
const connectionVersion = "77777777-7777-4777-8777-777777777777";
const businessContext = {
  actorUserId: actor, businessId, business: { id: businessId, owner_user_id: owner }, role: "owner" as const,
  ownerUserId: owner, billingOwnerUserId: owner, integrationOwnerUserId: owner,
  replyPolicyOwnerUserId: owner, usageOwnerUserId: owner,
} as unknown as BusinessContext;

function isStatus(error: unknown, status: number): error is Error & { status: number } {
  return error instanceof Error && "status" in error && error.status === status;
}

test("selected location lookup uses the integration owner and fails closed on missing/mismatched selection", async () => {
  const db = fakeSql((query) => query.includes("FROM public.business_google_locations")
    ? [{ id: locationId, location_name: locationName, title: "Acme", connected: true, connection_version: connectionVersion }]
    : []);
  const mod = loadTs<typeof import("../src/lib/google-business.ts")>("src/lib/google-business.ts", {
    "@/lib/db/neon": { sql: db.sql },
    "@/lib/business-context": { BusinessAccessError: class BusinessAccessError extends Error { status = 403; } },
    "@/lib/google-discovery": { discoverGoogleLocations: async () => [] },
    "@/lib/plan-server": { getBusinessPlanInfo: async () => ({ hasAccess: true }) },
  });

  const selected = await mod.getSelectedGoogleLocation(businessContext, locationName);
  assert.equal(selected.location_name, locationName);
  assert.equal(selected.connection_version, connectionVersion);
  assert.deepEqual(db.calls[0].values, [owner, owner, businessId]);
  const callsAfterValidLookup = db.calls.length;
  await assert.rejects(mod.getSelectedGoogleLocation(businessContext, "accounts/a/locations/x?bad"), (e: unknown) => isStatus(e, 403));
  assert.equal(db.calls.length, callsAfterValidLookup, "invalid requested names are rejected before database/provider access");
  await assert.rejects(mod.getSelectedGoogleLocation(businessContext, "accounts/987654321/locations/other"), (e: unknown) => isStatus(e, 403));
  assert.equal(db.calls.length, callsAfterValidLookup + 1, "a canonical but unselected name performs only the selected-name lookup");

  const missing = loadTs<typeof import("../src/lib/google-business.ts")>("src/lib/google-business.ts", {
    "@/lib/db/neon": { sql: fakeSql(() => []).sql },
    "@/lib/business-context": { BusinessAccessError: class BusinessAccessError extends Error { status = 403; } },
    "@/lib/google-discovery": { discoverGoogleLocations: async () => [] },
    "@/lib/plan-server": { getBusinessPlanInfo: async () => ({ hasAccess: true }) },
  });
  await assert.rejects(missing.getSelectedGoogleLocation(businessContext), (e: unknown) => isStatus(e, 409));

  const unavailable = loadTs<typeof import("../src/lib/google-business.ts")>("src/lib/google-business.ts", {
    "@/lib/db/neon": { sql: async () => { throw new Error("relation does not exist: public.business_google_locations"); } },
    "@/lib/business-context": { BusinessAccessError: class BusinessAccessError extends Error { status = 403; } },
    "@/lib/google-discovery": { discoverGoogleLocations: async () => [] },
    "@/lib/plan-server": { getBusinessPlanInfo: async () => ({ hasAccess: true }) },
  });
  await assert.rejects(unavailable.getSelectedGoogleLocation(businessContext), (e: unknown) =>
    isStatus(e, 503) && !e.message.includes("relation does not exist"));

  const staleDb = fakeSql(() => []);
  const stale = loadTs<typeof import("../src/lib/google-business.ts")>("src/lib/google-business.ts", {
    "@/lib/db/neon": { sql: staleDb.sql },
    "@/lib/business-context": { BusinessAccessError: class BusinessAccessError extends Error { status = 403; } },
    "@/lib/google-discovery": { discoverGoogleLocations: async () => [] },
    "@/lib/plan-server": { getBusinessPlanInfo: async () => ({ hasAccess: true }) },
  });
  await assert.rejects(stale.getSelectedGoogleLocation(businessContext), (e: unknown) => isStatus(e, 409));
  assert.match(staleDb.calls[0].query, /l\.connection_version = c\.connection_version/);

  const malformed = loadTs<typeof import("../src/lib/google-business.ts")>("src/lib/google-business.ts", {
    "@/lib/db/neon": { sql: fakeSql(() => [{ id: locationId, location_name: locationName, connection_version: null }]).sql },
    "@/lib/business-context": { BusinessAccessError: class extends Error { status = 403; } },
    "@/lib/google-discovery": { discoverGoogleLocations: async () => [] },
    "@/lib/plan-server": { getBusinessPlanInfo: async () => ({ hasAccess: true }) },
  });
  await assert.rejects(malformed.getSelectedGoogleLocation(businessContext), (e: unknown) => isStatus(e, 409));
});

test("explicit business IDs reject empty, malformed body values, and conflicting query/body values", () => {
  const mod = loadTs<typeof import("../src/lib/google-business.ts")>("src/lib/google-business.ts", {
    "@/lib/db/neon": { sql: fakeSql(() => []).sql },
    "@/lib/business-context": { BusinessAccessError: class BusinessAccessError extends Error { status = 403; } },
    "@/lib/google-discovery": { discoverGoogleLocations: async () => [] },
    "@/lib/plan-server": { getBusinessPlanInfo: async () => ({ hasAccess: true }) },
  });
  assert.deepEqual(mod.resolveRequestedBusinessId(null), { valid: true, businessId: null });
  assert.deepEqual(mod.resolveRequestedBusinessId(""), { valid: false });
  assert.deepEqual(mod.resolveRequestedBusinessId(null, null), { valid: false });
  assert.deepEqual(mod.resolveRequestedBusinessId(businessId, "55555555-5555-4555-8555-555555555555"), { valid: false });
  assert.deepEqual(mod.resolveRequestedBusinessId(businessId, businessId), { valid: true, businessId });
});

test("member discovery listing is limited to the selected business location", async () => {
  const db = fakeSql((query) => query.includes("FROM public.gbp_locations l")
    ? [{ id: locationId, location_name: locationName, title: "Acme", selected: true, connection_version: connectionVersion }]
    : []);
  const mod = loadTs<typeof import("../src/lib/google-business.ts")>("src/lib/google-business.ts", {
    "@/lib/db/neon": { sql: db.sql },
    "@/lib/business-context": { BusinessAccessError: class BusinessAccessError extends Error { status = 403; } },
    "@/lib/google-discovery": { discoverGoogleLocations: async () => [] },
    "@/lib/plan-server": { getBusinessPlanInfo: async () => ({ hasAccess: true }) },
  });
  const memberContext = { ...businessContext, role: "member" as const };
  const locations = await mod.listBusinessGoogleLocations(memberContext);
  assert.equal(locations.length, 1);
  assert.equal(locations[0].selected, true);
  assert.match(db.calls[0].query, /AND \(\$4 OR selection\.location_id = l\.id\)/);
  assert.deepEqual(db.calls[0].values, [owner, businessId, owner, false]);
});

test("complete discovery marks stale owner cache rows disconnected", async () => {
  const staleId = "66666666-6666-4666-8666-666666666666";
  const db = fakeSql((query) => query.includes("SELECT connection_version FROM public.gbp_connections")
    ? [{ connection_version: connectionVersion }]
    : query.includes("SELECT id, location_name")
      ? [{ id: staleId, location_name: locationName }]
      : []);
  let providerOwner = "";
  const mod = loadTs<typeof import("../src/lib/google-business.ts")>("src/lib/google-business.ts", {
    "@/lib/db/neon": { sql: db.sql },
    "@/lib/business-context": { BusinessAccessError: class BusinessAccessError extends Error { status = 403; } },
    "@/lib/google-discovery": { discoverGoogleLocations: async (ownerUserId: string) => { providerOwner = ownerUserId; return []; } },
    "@/lib/plan-server": { getBusinessPlanInfo: async () => ({ hasAccess: true }) },
  });
  const result = await mod.syncBusinessGoogleLocations(businessContext);
  assert.equal(providerOwner, owner);
  assert.deepEqual(result, { locations: [], imported: 0 });
  const staleUpdate = db.calls.find((call) => call.query.includes("SET connected = false"));
  assert.deepEqual(staleUpdate?.values, [staleId, owner, connectionVersion]);
});

test("provider discovery failures are sanitized as HTTP 502", async () => {
  const db = fakeSql((query) => query.includes("SELECT connection_version FROM public.gbp_connections")
    ? [{ connection_version: connectionVersion }]
    : []);
  const mod = loadTs<typeof import("../src/lib/google-business.ts")>("src/lib/google-business.ts", {
    "@/lib/db/neon": { sql: db.sql },
    "@/lib/business-context": { BusinessAccessError: class BusinessAccessError extends Error { status = 403; } },
    "@/lib/google-discovery": { discoverGoogleLocations: async () => { throw new Error("provider token and response details"); } },
    "@/lib/plan-server": { getBusinessPlanInfo: async () => ({ hasAccess: true }) },
  });
  let failure: unknown;
  try {
    await mod.syncBusinessGoogleLocations(businessContext);
  } catch (error) {
    failure = error;
  }
  assert.ok(isStatus(failure, 502));
  const response = mod.googleBusinessErrorResponse(failure);
  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), { error: "Google location provider request failed." });
  assert.equal(db.calls.some((call) => call.query.includes("INSERT INTO public.gbp_locations")), false);
});

test("a disconnected cached location stays unauthorized until a fresh discovery revalidates it", async () => {
  let connected = false;
  const db = fakeSql((query) => {
    if (query.includes("FROM public.business_google_locations selection")) {
      return connected ? [{ id: locationId, location_name: locationName, title: "Acme", connection_version: connectionVersion }] : [];
    }
    if (query.includes("SELECT connection_version FROM public.gbp_connections")) return [{ connection_version: connectionVersion }];
    if (query.includes("SELECT id, location_name FROM public.gbp_locations")) return [{ id: locationId, location_name: locationName }];
    if (query.includes("INSERT INTO public.gbp_locations")) { connected = true; return [{ id: locationId }]; }
    if (query.includes("FROM public.gbp_locations l")) return connected
      ? [{ id: locationId, location_name: locationName, title: "Acme", selected: true, connection_version: connectionVersion }]
      : [];
    return [];
  });
  const mod = loadTs<typeof import("../src/lib/google-business.ts")>("src/lib/google-business.ts", {
    "@/lib/db/neon": { sql: db.sql },
    "@/lib/business-context": { BusinessAccessError: class BusinessAccessError extends Error { status = 403; } },
    "@/lib/google-discovery": { discoverGoogleLocations: async (ownerUserId: string) => {
      assert.equal(ownerUserId, owner);
      return [{ locationName, title: "Acme", accountName: "accounts/987654321", informationName: "locations/123456789", storeCode: null, placeId: null, reviewUrl: null, address: null, raw: {} }];
    } },
    "@/lib/plan-server": { getBusinessPlanInfo: async () => ({ hasAccess: true }) },
  });
  await assert.rejects(mod.getSelectedGoogleLocation(businessContext), (e: unknown) => isStatus(e, 409));
  await mod.syncBusinessGoogleLocations(businessContext);
  assert.equal((await mod.getSelectedGoogleLocation(businessContext)).location_name, locationName);
});

test("a discovery that crosses an OAuth generation change cannot restore old-account cache rows", async () => {
  const nextVersion = "88888888-8888-4888-8888-888888888888";
  let currentVersion = connectionVersion;
  let versionReads = 0;
  const db = fakeSql((query) => {
    if (query.includes("SELECT connection_version FROM public.gbp_connections")) {
      versionReads++;
      if (versionReads === 2) currentVersion = nextVersion;
      return [{ connection_version: currentVersion }];
    }
    if (query.includes("FROM public.business_google_locations selection")) return [];
    return [];
  });
  const mod = loadTs<typeof import("../src/lib/google-business.ts")>("src/lib/google-business.ts", {
    "@/lib/db/neon": { sql: db.sql },
    "@/lib/business-context": { BusinessAccessError: class BusinessAccessError extends Error { status = 403; } },
    "@/lib/google-discovery": { discoverGoogleLocations: async () => [
      { locationName, title: "Account X", accountName: "accounts/987654321", informationName: "locations/123456789", storeCode: null, placeId: null, reviewUrl: null, address: null, raw: {} },
    ] },
    "@/lib/plan-server": { getBusinessPlanInfo: async () => ({ hasAccess: true }) },
  });
  await assert.rejects(mod.syncBusinessGoogleLocations(businessContext), (error: unknown) => isStatus(error, 409));
  assert.equal(db.calls.some((call) => call.query.includes("INSERT INTO public.gbp_locations")), false);
  await assert.rejects(mod.getSelectedGoogleLocation(businessContext), (error: unknown) => isStatus(error, 409));
});

test("generation-fenced insert rejects a credential switch after the post-discovery check", async () => {
  let currentVersion = connectionVersion;
  let versionReads = 0;
  const db = fakeSql((query) => {
    if (query.includes("SELECT connection_version FROM public.gbp_connections")) {
      versionReads++;
      return [{ connection_version: connectionVersion }];
    }
    if (query.includes("SELECT id, location_name FROM public.gbp_locations")) {
      currentVersion = "88888888-8888-4888-8888-888888888888";
      return [];
    }
    if (query.includes("INSERT INTO public.gbp_locations")) {
      assert.match(query, /FROM public\.gbp_connections gc[\s\S]*gc\.connection_version = \$\d+/);
      assert.notEqual(currentVersion, connectionVersion);
      return [];
    }
    if (query.includes("FROM public.business_google_locations selection")) return [];
    return [];
  });
  const mod = loadTs<typeof import("../src/lib/google-business.ts")>("src/lib/google-business.ts", {
    "@/lib/db/neon": { sql: db.sql },
    "@/lib/business-context": { BusinessAccessError: class BusinessAccessError extends Error { status = 403; } },
    "@/lib/google-discovery": { discoverGoogleLocations: async () => [
      { locationName, title: "Account X", accountName: "accounts/987654321", informationName: "locations/123456789", storeCode: null, placeId: null, reviewUrl: null, address: null, raw: {} },
    ] },
    "@/lib/plan-server": { getBusinessPlanInfo: async () => ({ hasAccess: true }) },
  });
  await assert.rejects(mod.syncBusinessGoogleLocations(businessContext), (error: unknown) => isStatus(error, 409));
  assert.equal(versionReads, 2);
  assert.equal(db.calls.some((call) => call.query.includes("UPDATE public.gbp_locations SET connected = false")), false);
});

test("provider operations require an active business entitlement rather than actor plan", async () => {
  const calls: string[] = [];
  const mod = loadTs<typeof import("../src/lib/google-business.ts")>("src/lib/google-business.ts", {
    "@/lib/db/neon": { sql: fakeSql(() => []).sql },
    "@/lib/business-context": { BusinessAccessError: class BusinessAccessError extends Error { status = 403; } },
    "@/lib/google-discovery": { discoverGoogleLocations: async () => [] },
    "@/lib/plan-server": { getBusinessPlanInfo: async (context: BusinessContext, agentId: string) => {
      assert.equal(context, businessContext);
      calls.push(agentId);
      return { hasAccess: false };
    } },
  });
  await assert.rejects(mod.requireGoogleWorkflowEntitlement(businessContext), (e: unknown) => isStatus(e, 403));
  assert.deepEqual(calls.sort(), ["review_booster", "review_replies"]);
});

test("member sync reports only their selected location count", async () => {
  const db = fakeSql((query) => query.includes("SELECT connection_version FROM public.gbp_connections")
    ? [{ connection_version: connectionVersion }]
    : query.includes("INSERT INTO public.gbp_locations")
      ? [{ id: locationId }]
      : query.includes("FROM public.gbp_locations l")
        ? [{ id: locationId, location_name: locationName, title: "Acme", selected: true }]
        : []);
  const mod = loadTs<typeof import("../src/lib/google-business.ts")>("src/lib/google-business.ts", {
    "@/lib/db/neon": { sql: db.sql },
    "@/lib/business-context": { BusinessAccessError: class BusinessAccessError extends Error { status = 403; } },
    "@/lib/google-discovery": { discoverGoogleLocations: async () => [
      { locationName, title: "Acme", accountName: "accounts/987654321", informationName: "locations/123456789", storeCode: null, placeId: null, reviewUrl: null, address: null, raw: {} },
      { locationName: "accounts/987654321/locations/222222222", title: "Other", accountName: "accounts/987654321", informationName: "locations/222222222", storeCode: null, placeId: null, reviewUrl: null, address: null, raw: {} },
    ] },
    "@/lib/plan-server": { getBusinessPlanInfo: async () => ({ hasAccess: true }) },
  });
  const result = await mod.syncBusinessGoogleLocations({ ...businessContext, role: "member" });
  assert.equal(result.imported, 1);
  assert.equal(result.locations.length, 1);
});

test("OAuth state binds actor, business and owner; legacy, tampered and suffixed states fail", async () => {
  const crypto = await import("node:crypto");
  const state = loadTs<typeof import("../src/lib/google-oauth-state.ts")>("src/lib/google-oauth-state.ts", {
    "@/lib/env": { getOptionalEnv: () => undefined },
    "node:crypto": { default: crypto },
  });
  const signed = state.buildGoogleOAuthState(actor, businessId, owner);
  assert.deepEqual(state.parseGoogleOAuthState(signed), {
    valid: true, userId: actor, businessId, ownerUserId: owner,
  });
  assert.equal(state.parseGoogleOAuthState(`${signed}.suffix`).valid, false);
  assert.equal(state.parseGoogleOAuthState(`${signed.slice(0, -1)}x`).valid, false);

  const payload = Buffer.from(JSON.stringify({ uid: actor, nonce: "a".repeat(32), exp: Math.floor(Date.now() / 1000) + 60 })).toString("base64url");
  const signature = crypto.createHmac("sha256", "local-dev-google-oauth-secret").update(payload).digest("base64url");
  assert.equal(state.parseGoogleOAuthState(`${payload}.${signature}`).valid, false, "signed actor-only legacy state is rejected");
});

test("selection route denies a member before Google discovery or database access", async () => {
  const db = fakeSql(() => { throw new Error("database must not be touched"); });
  let providerCalls = 0;
  class AccessError extends Error { status = 403; }
  const route = loadTs<typeof import("../src/app/api/google/locations/selection/route.ts")>(
    "src/app/api/google/locations/selection/route.ts",
    {
      "next/server": { NextResponse: { json: Response.json } },
      "@/lib/user-from-req": { resolveUser: async () => ({ id: member }) },
      "@/lib/db/neon": { sql: db.sql },
      "@/lib/google-discovery": { discoverGoogleLocations: async () => { providerCalls++; return []; } },
      "@/lib/safe-logger": { safeLogger: { error() {} } },
      "@/lib/google-business": {
        assertGoogleBusinessOwner: () => { throw new AccessError("owner required"); },
        googleBusinessErrorResponse: (error: Error & { status?: number }) => Response.json({ error: "denied" }, { status: error.status }),
        requireGoogleBusinessContext: async () => ({ ...businessContext, actorUserId: member, role: "member" }),
        requireGoogleWorkflowEntitlement: async () => {},
        resolveRequestedBusinessId: (queryId: string | null, bodyId?: unknown) => ({ valid: true, businessId: bodyId ?? queryId }),
      },
    }
  );
  const request = new Request("https://app.test/api/google/locations/selection", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ businessId, locationId }),
  }) as Request & { nextUrl: URL };
  request.nextUrl = new URL(request.url);
  const response = await route.POST(request as never);
  assert.equal(response.status, 403);
  assert.equal(providerCalls, 0);
  assert.equal(db.calls.length, 0);
});

test("owner selection validates a live owner discovery and inserts an idempotent business mapping", async () => {
  const db = fakeSql((query) => {
    if (query.includes("FROM public.gbp_locations l")) return [{ id: locationId, location_name: locationName, title: "Acme", connection_version: connectionVersion }];
    if (query.includes("FROM public.business_google_locations") && query.includes("SELECT location_id")) return [{ location_id: locationId }];
    if (query.includes("SELECT connection_version FROM public.gbp_connections")) return [{ connection_version: connectionVersion }];
    if (query.includes("SELECT 1 FROM public.gbp_connections c")) return [{ "?column?": 1 }];
    return [];
  });
  let providerCalls = 0;
  const route = loadTs<typeof import("../src/app/api/google/locations/selection/route.ts")>(
    "src/app/api/google/locations/selection/route.ts",
    {
      "next/server": { NextResponse: { json: Response.json } },
      "@/lib/user-from-req": { resolveUser: async () => ({ id: owner }) },
      "@/lib/db/neon": { sql: db.sql },
      "@/lib/google-discovery": { discoverGoogleLocations: async (ownerUserId: string) => {
        providerCalls++;
        assert.equal(ownerUserId, owner);
        return [{ locationName, title: "Acme" }];
      } },
      "@/lib/safe-logger": { safeLogger: { error() {} } },
      "@/lib/google-business": {
        assertGoogleBusinessOwner: () => {},
        googleBusinessErrorResponse: (error: Error & { status?: number }) => Response.json({ error: "denied" }, { status: error.status }),
        requireGoogleBusinessContext: async () => businessContext,
        requireGoogleWorkflowEntitlement: async () => {},
        resolveRequestedBusinessId: (queryId: string | null, bodyId?: unknown) => ({ valid: true, businessId: bodyId ?? queryId }),
      },
    }
  );
  const request = new Request("https://app.test/api/google/locations/selection", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ businessId, locationId }),
  }) as Request & { nextUrl: URL };
  request.nextUrl = new URL(request.url);
  const response = await route.POST(request as never);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { selectedLocation: { id: locationId, locationName, title: "Acme" } });
  assert.equal(providerCalls, 1);
  assert.ok(db.calls.some((call) => call.query.includes("UPDATE public.business_google_locations")));
});

test("selection switch returns conflict before a provider call", async () => {
  const otherLocation = "55555555-5555-4555-8555-555555555555";
  const db = fakeSql((query) => {
    if (query.includes("FROM public.gbp_locations l")) return [{ id: locationId, location_name: locationName, title: "Acme", connection_version: connectionVersion }];
    if (query.includes("FROM public.business_google_locations") && query.includes("SELECT location_id")) return [{ location_id: otherLocation }];
    return [];
  });
  let providerCalls = 0;
  const route = loadTs<typeof import("../src/app/api/google/locations/selection/route.ts")>(
    "src/app/api/google/locations/selection/route.ts",
    {
      "next/server": { NextResponse: { json: Response.json } },
      "@/lib/user-from-req": { resolveUser: async () => ({ id: owner }) },
      "@/lib/db/neon": { sql: db.sql },
      "@/lib/google-discovery": { discoverGoogleLocations: async () => { providerCalls++; return []; } },
      "@/lib/safe-logger": { safeLogger: { error() {} } },
      "@/lib/google-business": {
        assertGoogleBusinessOwner: () => {},
        googleBusinessErrorResponse: (error: Error & { status?: number }) => Response.json({ error: "denied" }, { status: error.status }),
        requireGoogleBusinessContext: async () => businessContext,
        requireGoogleWorkflowEntitlement: async () => {},
        resolveRequestedBusinessId: (queryId: string | null, bodyId?: unknown) => ({ valid: true, businessId: bodyId ?? queryId }),
      },
    }
  );
  const request = new Request("https://app.test/api/google/locations/selection", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ businessId, locationId }),
  }) as Request & { nextUrl: URL };
  request.nextUrl = new URL(request.url);
  const response = await route.POST(request as never);
  assert.equal(response.status, 409);
  assert.equal(providerCalls, 0);
});

test("selection rejects a reconnect that occurs during live provider verification", async () => {
  let liveConnectionVersion = connectionVersion;
  const db = fakeSql((query) => {
    if (query.includes("FROM public.gbp_locations l")) {
      return [{ id: locationId, location_name: locationName, title: "Acme", connection_version: connectionVersion }];
    }
    if (query.includes("FROM public.business_google_locations") && query.includes("SELECT location_id")) return [];
    if (query.includes("SELECT connection_version FROM public.gbp_connections")) {
      return [{ connection_version: liveConnectionVersion }];
    }
    return [];
  });
  const route = loadTs<typeof import("../src/app/api/google/locations/selection/route.ts")>(
    "src/app/api/google/locations/selection/route.ts",
    {
      "next/server": { NextResponse: { json: Response.json } },
      "@/lib/user-from-req": { resolveUser: async () => ({ id: owner }) },
      "@/lib/db/neon": { sql: db.sql },
      "@/lib/google-discovery": { discoverGoogleLocations: async () => {
        liveConnectionVersion = "88888888-8888-4888-8888-888888888888";
        return [{ locationName, title: "Acme" }];
      } },
      "@/lib/safe-logger": { safeLogger: { error() {} } },
      "@/lib/google-business": {
        assertGoogleBusinessOwner: () => {},
        googleBusinessErrorResponse: () => Response.json({ error: "denied" }, { status: 403 }),
        requireGoogleBusinessContext: async () => businessContext,
        requireGoogleWorkflowEntitlement: async () => {},
        resolveRequestedBusinessId: (queryId: string | null, bodyId?: unknown) => ({ valid: true, businessId: bodyId ?? queryId }),
      },
    }
  );
  const request = new Request("https://app.test/api/google/locations/selection", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ businessId, locationId }),
  }) as Request & { nextUrl: URL };
  request.nextUrl = new URL(request.url);
  const response = await route.POST(request as never);
  assert.equal(response.status, 409);
  assert.equal(db.calls.some((call) => call.query.includes("INSERT INTO public.business_google_locations")), false);
});

test("empty-body disconnect remains compatible while a member cannot delete owner's token", async () => {
  const db = fakeSql(() => { throw new Error("member must not delete credentials"); });
  class AccessError extends Error { status = 403; }
  const route = loadTs<typeof import("../src/app/api/google/disconnect/route.ts")>(
    "src/app/api/google/disconnect/route.ts",
    {
      "next/server": { NextResponse: { json: Response.json } },
      "@/lib/user-from-req": { resolveUser: async () => ({ id: member }) },
      "@/lib/db/neon": { sql: db.sql },
      "@/lib/safe-logger": { safeLogger: { error() {} } },
      "@/lib/google-business": {
        assertGoogleBusinessOwner: () => { throw new AccessError("owner required"); },
        googleBusinessErrorResponse: (error: Error & { status?: number }) => Response.json({ error: "denied" }, { status: error.status }),
        requireGoogleBusinessContext: async () => ({ ...businessContext, actorUserId: member, role: "member" }),
        resolveRequestedBusinessId: (queryId: string | null) => ({ valid: true, businessId: queryId }),
      },
    }
  );
  const request = new Request("https://app.test/api/google/disconnect", { method: "POST" }) as Request & { nextUrl: URL };
  request.nextUrl = new URL(request.url);
  const response = await route.POST(request as never);
  assert.equal(response.status, 403);
  assert.equal(db.calls.length, 0);
});

test("owner disconnect atomically removes the shared credential and invalidates every owner cache row", async () => {
  const db = fakeSql(() => []);
  const cookieWrites: unknown[][] = [];
  const jsonWithCookies = (value: unknown, init?: ResponseInit) => {
    const response = Response.json(value, init);
    Object.defineProperty(response, "cookies", { value: { set: (...args: unknown[]) => cookieWrites.push(args) } });
    return response;
  };
  const route = loadTs<typeof import("../src/app/api/google/disconnect/route.ts")>(
    "src/app/api/google/disconnect/route.ts",
    {
      "next/server": { NextResponse: { json: jsonWithCookies } },
      "@/lib/user-from-req": { resolveUser: async () => ({ id: owner }) },
      "@/lib/db/neon": { sql: db.sql },
      "@/lib/safe-logger": { safeLogger: { error() {} } },
      "@/lib/google-business": {
        assertGoogleBusinessOwner: () => {},
        googleBusinessErrorResponse: () => Response.json({ error: "denied" }, { status: 403 }),
        requireGoogleBusinessContext: async () => businessContext,
        resolveRequestedBusinessId: (queryId: string | null) => ({ valid: true, businessId: queryId }),
      },
    }
  );
  const request = new Request("https://app.test/api/google/disconnect", { method: "POST" }) as Request & { nextUrl: URL };
  request.nextUrl = new URL(request.url);
  const response = await route.POST(request as never);
  assert.equal(response.status, 200);
  assert.deepEqual(cookieWrites, [["ll_gbp_oauth_state", "", { path: "/", maxAge: 0 }]]);
  assert.match(db.calls[0].query, /WITH deleted AS \(\s*DELETE FROM public\.gbp_connections/);
  assert.match(db.calls[0].query, /UPDATE public\.gbp_locations SET connected = false/);
  assert.equal(db.calls[0].values.length, 2);
  assert.deepEqual(db.calls[0].values, [owner, owner]);
});

test("OAuth callback rechecks live ownership before token exchange", async () => {
  const state = loadTs<typeof import("../src/lib/google-oauth-state.ts")>("src/lib/google-oauth-state.ts", {
    "@/lib/env": { getOptionalEnv: () => undefined },
    "node:crypto": { default: await import("node:crypto") },
  });
  const signed = state.buildGoogleOAuthState(actor, businessId, owner);
  let exchangeCalls = 0;
  class AccessError extends Error { status = 403; }
  const redirect = (url: string | URL) => {
    const response = Response.redirect(url);
    (response as Response & { cookies: { set: () => void } }).cookies = { set() {} };
    return response;
  };
  const route = loadTs<typeof import("../src/app/api/google/oauth/callback/route.ts")>(
    "src/app/api/google/oauth/callback/route.ts",
    {
      "next/server": { NextResponse: { redirect } },
      "@/lib/google": { exchangeCodeForTokens: async () => { exchangeCalls++; return {}; } },
      "@/lib/db/gbp": { upsertGbpConnection: async () => {} },
      "@/lib/db/neon": { sql: fakeSql(() => []).sql },
      "@/lib/env": { getServerAppUrl: () => "https://app.test" },
      "@/lib/google-oauth-state": state,
      "@/lib/user-from-req": { resolveUser: async () => ({ id: actor }) },
      "@/lib/google-business": {
        assertGoogleBusinessOwner: () => {},
        requireGoogleBusinessContext: async () => { throw new AccessError("owner access removed"); },
        requireGoogleWorkflowEntitlement: async () => {},
      },
      "@/lib/safe-logger": { safeLogger: { error() {} } },
    }
  );
  const request = new Request(`https://app.test/api/google/oauth/callback?code=code&state=${encodeURIComponent(signed)}`, {
    headers: { cookie: `ll_gbp_oauth_state=${encodeURIComponent(signed)}` },
  });
  const response = await route.GET(request);
  assert.equal(response.status, 302);
  assert.equal(exchangeCalls, 0);
  const malformedCookie = new Request("https://app.test/api/google/oauth/callback?code=code&state=%25", {
    headers: { cookie: "ll_gbp_oauth_state=%" },
  });
  assert.equal((await route.GET(malformedCookie)).status, 302);
  assert.equal(exchangeCalls, 0, "malformed cookie encoding is rejected before exchange");
});

test("OAuth reconnect invalidates the old owner cache before replacing credentials", async () => {
  const crypto = await import("node:crypto");
  const state = loadTs<typeof import("../src/lib/google-oauth-state.ts")>("src/lib/google-oauth-state.ts", {
    "@/lib/env": { getOptionalEnv: () => undefined },
    "node:crypto": { default: crypto },
  });
  const signed = state.buildGoogleOAuthState(actor, businessId, owner);
  const events: string[] = [];
  const db = fakeSql(() => { events.push("invalidate"); return []; });
  const redirect = (url: string | URL) => {
    const response = Response.redirect(url);
    (response as Response & { cookies: { set: () => void } }).cookies = { set() {} };
    return response;
  };
  const route = loadTs<typeof import("../src/app/api/google/oauth/callback/route.ts")>(
    "src/app/api/google/oauth/callback/route.ts",
    {
      "next/server": { NextResponse: { redirect } },
      "@/lib/google": { exchangeCodeForTokens: async () => ({ access_token: "access", refresh_token: "refresh", expires_in: 3600, token_type: "Bearer" }) },
      "@/lib/db/gbp": { upsertGbpConnection: async (input: { userId: string }) => { assert.equal(input.userId, owner); events.push("save"); } },
      "@/lib/db/neon": { sql: db.sql },
      "@/lib/env": { getServerAppUrl: () => "https://app.test" },
      "@/lib/google-oauth-state": state,
      "@/lib/user-from-req": { resolveUser: async () => ({ id: actor }) },
      "@/lib/google-business": {
        assertGoogleBusinessOwner: () => {},
        requireGoogleBusinessContext: async () => businessContext,
        requireGoogleWorkflowEntitlement: async () => {},
      },
      "@/lib/safe-logger": { safeLogger: { error() {} } },
      "@/lib/business-context": {},
    }
  );
  const request = new Request(`https://app.test/api/google/oauth/callback?code=code&state=${encodeURIComponent(signed)}`, {
    headers: { cookie: `ll_gbp_oauth_state=${encodeURIComponent(signed)}` },
  });
  assert.equal((await route.GET(request)).status, 302);
  assert.deepEqual(events, ["invalidate", "save"]);
});
