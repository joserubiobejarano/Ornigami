import assert from "node:assert/strict";
import test from "node:test";
import type { BusinessContext } from "../src/lib/business-context.ts";
import { hasActiveBusinessEntitlement, isWithinPastDueGracePeriod } from "../src/lib/business-access-policy.ts";
import { fakeSql, loadTs } from "./a02-test-support.mts";

type ContextModule = typeof import("../src/lib/business-context.ts");
type ApiModule = typeof import("../src/lib/api-security.ts");
type BusinessModule = typeof import("../src/lib/db/businesses.ts");
type PlanModule = typeof import("../src/lib/plan-server.ts");
const owner = "11111111-1111-4111-8111-111111111111";
const member = "22222222-2222-4222-8222-222222222222";
const businessId = "33333333-3333-4333-8333-333333333333";
const business = {
  id: businessId, owner_user_id: owner, name: "Acme", business_type: null, city: null,
  country: null, website: null, phone: null, google_review_url: null, rebooking_url: null,
  tone: null, language: "en", email_from_name: null,
  created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
};
const validators = {
  DbBusinessRowSchema: { parse: (row: unknown) => row },
  DbBusinessAgentRowSchema: { parse: (row: unknown) => row },
  UserPlanViewRowSchema: { parse: (row: unknown) => row },
};
function contextWith(db: ReturnType<typeof fakeSql>) {
  return loadTs<ContextModule>("src/lib/business-context.ts", {
    "@/lib/db/neon": { sql: db.sql }, "@/lib/validators": validators,
  });
}
function isStatus(error: unknown, status: number) {
  return error instanceof Error && "status" in error && error.status === status;
}
function makeApi(context: ContextModule, canAccess: boolean, bootstrap: (actor: string) => Promise<unknown>) {
  return loadTs<ApiModule>("src/lib/api-security.ts", {
    "next/server": { NextResponse: { json: Response.json } },
    "@/auth": { auth: async () => ({ user: { id: member } }) },
    "@/lib/db/businesses": { canAccessAgent: async () => canAccess, getOrCreateBusinessForUser: bootstrap },
    "@/lib/business-context": context,
    "@/lib/safe-logger": { safeLogger: { error() {} } },
  });
}
test("member context uses canonical business owner; owner guard rejects member and forged role", async () => {
  const db = fakeSql(() => [{ ...business, actor_role: "member" }]);
  const context = contextWith(db);
  const ctx = await context.resolveBusinessContext(member, businessId);
  assert.ok(ctx);
  assert.equal(ctx.role, "member");
  for (const key of ["ownerUserId", "billingOwnerUserId", "integrationOwnerUserId", "replyPolicyOwnerUserId", "usageOwnerUserId"] as const) assert.equal(ctx[key], owner);
  assert.deepEqual(db.calls[0].values, [businessId, member]);
  assert.throws(() => context.assertBusinessOwner(ctx), (error: unknown) => isStatus(error, 403));
  assert.throws(() => context.assertBusinessOwner({ ...ctx, role: "owner" }), (error: unknown) => isStatus(error, 403));
  const ownerContext = contextWith(fakeSql(() => [{ ...business, actor_role: "owner" }]));
  const owned = await ownerContext.requireBusinessOwner(owner, businessId);
  assert.equal(owned.role, "owner");
});
test("selected-business denial never falls back; invalid actors and IDs never query", async () => {
  const db = fakeSql(() => []);
  const context = contextWith(db);
  assert.equal(await context.resolveBusinessContext(member, businessId), null);
  assert.equal(db.calls.length, 1);
  assert.equal(await context.resolveBusinessContext("member@example.com"), null);
  assert.equal(await context.resolveBusinessContext(member, ""), null);
  assert.equal(db.calls.length, 1);
  const api = makeApi(context, true, async () => { throw new Error("must not bootstrap explicit denial"); });
  await assert.rejects(api.requireActiveAgentAccess(member, null, "review_replies", businessId), (error: unknown) => isStatus(error, 403));
});
test("business lookup seeds canonical owner membership and does not edit teammate placeholder name", async () => {
  const placeholder = { ...business, name: "member@example.com" };
  const db = fakeSql((query) => {
    if (query.includes("privacy_ensure_business_defaults")) return [{ allowed: true }];
    if (query.includes("FROM public.users u")) return [{ id: member, email: "member@example.com", business_name: null }];
    if (query.includes("FROM public.businesses") && query.includes("INNER JOIN public.users actor")) return [placeholder];
    return [];
  });
  const mod = loadTs<BusinessModule>("src/lib/db/businesses.ts", {
    "@/lib/db/neon": { sql: db.sql },
    "@/lib/validators": validators,
    "@/lib/business-access-policy": { isWithinPastDueGracePeriod, PAST_DUE_GRACE_DAYS: 7, hasActiveBusinessEntitlement },
  });
  await mod.getOrCreateBusinessForUser(member);
  const guardedDefaults = db.calls.find(call => call.query.includes("privacy_ensure_business_defaults"));
  assert.ok(guardedDefaults);
  assert.deepEqual(guardedDefaults.values, [businessId, member, owner, false]);
  assert.equal(db.calls.some(call => call.query.includes("UPDATE public.businesses")), false,
    "placeholder cleanup is inside the guarded SQL function");
});
test("active member uses shared entitlement and wrapper preserves actor plus additive context", async () => {
  const db = fakeSql(() => [{ ...business, actor_role: "member" }]);
  const api = makeApi(contextWith(db), true, async () => { throw new Error("must not bootstrap existing member"); });
  assert.equal((await api.requireActiveAgentAccess(member, "member@example.com", "review_replies")).id, businessId);
  assert.deepEqual(db.calls[0].values, [member]);
  let received: BusinessContext | undefined;
  const route = api.withActiveAgent("review_replies", async (_request, ctx) => {
    assert.equal(ctx.session.user?.id, member);
    received = ctx.businessContext;
    return new Response("ok");
  });
  assert.equal((await route(new Request("https://example.test/api"))).status, 200);
  assert.equal(received?.role, "member");
  assert.equal(received?.integrationOwnerUserId, owner);
});
test("inactive member denied; deleted UUID is never recreated from email; typed errors map to HTTP", async () => {
  const context = contextWith(fakeSql(() => [{ ...business, actor_role: "member" }]));
  const inactive = makeApi(context, false, async () => { throw new Error("unexpected"); });
  await assert.rejects(inactive.requireActiveAgentAccess(member, null, "review_replies"), (error: unknown) => isStatus(error, 403));
  const absent = contextWith(fakeSql(() => []));
  const calls: string[] = [];
  const api = makeApi(absent, true, async actor => { calls.push(actor); throw new Error("Could not resolve user in public.users for business creation."); });
  await assert.rejects(api.requireActiveAgentAccess(owner, "owner@example.com", "review_booster"), (error: unknown) => isStatus(error, 401));
  assert.deepEqual(calls, [owner]);
  const res = api.safeApiErrorResponse(new absent.BusinessAccessError(403, "Business access denied."), "test");
  assert.equal(res.status, 403);
  assert.deepEqual(await res.json(), { error: "Business access denied." });
});
test("business subscription is shared and inactive or expired metadata cannot grant a paid plan", async () => {
  let status = "active";
  const calls: string[][] = [];
  const plan = loadTs<PlanModule>("src/lib/plan-server.ts", {
    "@/lib/db/neon": { sql: async () => { throw new Error("must not consult actor personal plan"); } },
    "@/lib/validators": validators,
    "@/lib/plan-policy": { normalizePlanIdValue: (value: unknown) => value === "complete" ? "complete" : "free" },
    "@/lib/db/businesses": { getBusinessAgentStatus: async (id: string, agent: string) => { calls.push([id, agent]); return { status, plan_id: "complete", billing_period: "annual", current_period_end: "2020-01-01T00:00:00Z" }; } },
    "@/lib/business-access-policy": { hasActiveBusinessEntitlement },
  });
  const ctx = await contextWith(fakeSql(() => [{ ...business, actor_role: "member" }])).requireBusinessContext(member, businessId);
  assert.equal((await plan.getBusinessPlanInfo(ctx, "review_replies")).planId, "complete");
  for (status of ["canceled", "inactive", "past_due"]) {
    const info = await plan.getBusinessPlanInfo(ctx, "review_replies");
    assert.equal(info.planId, "free", status);
    assert.equal(info.storedPlanId, "complete");
    assert.equal(info.hasAccess, false);
    assert.equal(info.billingPeriod, "annual");
  }
  assert.deepEqual(calls[0], [businessId, "review_replies"]);
});
