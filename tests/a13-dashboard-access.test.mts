import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import vm from "node:vm";
import ts from "typescript";
import { loadTs } from "./a02-test-support.mts";

const ownerId = "11111111-1111-4111-8111-111111111111";
const memberId = "22222222-2222-4222-8222-222222222222";
const businessId = "33333333-3333-4333-8333-333333333333";
class TestBusinessAccessError extends Error {
  status: number;
  constructor(message: string, status: number) { super(message); this.status = status; }
}
const context = {
  actorUserId: memberId,
  businessId,
  business: { id: businessId, owner_user_id: ownerId, name: "Workspace" },
  role: "member" as const,
  ownerUserId: ownerId,
  billingOwnerUserId: ownerId,
  integrationOwnerUserId: ownerId,
  replyPolicyOwnerUserId: ownerId,
  usageOwnerUserId: ownerId,
};

function renderTsx<T>(relative: string, mocks: Record<string, unknown>): T {
  const filename = resolve(relative);
  const source = readFileSync(filename, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    fileName: filename,
  }).outputText;
  const moduleRecord: { exports: Record<string, unknown> } = { exports: {} };
  const jsx = (type: unknown, props: Record<string, unknown>) => ({ type, props });
  const localRequire = (id: string): unknown => {
    if (Object.hasOwn(mocks, id)) return mocks[id];
    if (id === "react/jsx-runtime") return { jsx, jsxs: jsx, Fragment: "fragment" };
    throw new Error(`Unmocked component dependency: ${id}`);
  };
  const execute = vm.runInThisContext(`(function(exports, require, module) { ${compiled}\n})`, { filename }) as
    (exports: object, require: typeof localRequire, runtimeModule: { exports: Record<string, unknown> }) => void;
  execute(moduleRecord.exports, localRequire, moduleRecord);
  return moduleRecord.exports as T;
}

function collectText(node: unknown): string {
  if (Array.isArray(node)) return node.map(collectText).join(" ");
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (!node || typeof node !== "object") return "";
  return collectText((node as { props?: { children?: unknown } }).props?.children);
}

test("dashboard agent access uses owner business entitlement for both owners and members", async () => {
  const calls: unknown[][] = [];
  const access = loadTs<typeof import("../src/lib/dashboard-access.ts")>("src/lib/dashboard-access.ts", {
    "@/lib/api-security": { resolveBusinessForSessionUserStrict: async (actorId: string) => ({ ...context, actorUserId: actorId, role: actorId === ownerId ? "owner" : "member" }) },
    "@/lib/plan-server": { getBusinessPlanInfo: async (businessContext: unknown, agentId: string) => { calls.push([businessContext, agentId]); return { businessId, billingOwnerUserId: ownerId, agentId, planId: "replies", planStatus: "active", hasAccess: true, storedPlanId: "replies", billingPeriod: "annual", currentPeriodStart: null, currentPeriodEnd: null }; } },
  });
  for (const actorId of [ownerId, memberId]) {
    const result = await access.getDashboardAgentAccess(actorId, "review_replies");
    assert.equal(result.context.actorUserId, actorId);
    assert.equal(result.context.role, actorId === ownerId ? "owner" : "member");
    assert.equal(result.entitlement.hasAccess, true);
  }
  assert.deepEqual(calls.map((call) => call[1]), ["review_replies", "review_replies"]);
  assert.ok(calls.every((call) => (call[0] as typeof context).billingOwnerUserId === ownerId));
});

test("dashboard agent access propagates frozen workspace denial without a personal-plan fallback", async () => {
  const frozen = Object.assign(new Error("Business access denied."), { status: 403 });
  let personalLookup = false;
  const access = loadTs<typeof import("../src/lib/dashboard-access.ts")>("src/lib/dashboard-access.ts", {
    "@/lib/api-security": { resolveBusinessForSessionUserStrict: async () => { throw frozen; } },
    "@/lib/plan-server": { getBusinessPlanInfo: async () => { personalLookup = true; throw new Error("must not run"); } },
  });
  await assert.rejects(access.getDashboardAgentAccess(memberId, "review_replies"), (error: unknown) => error === frozen);
  assert.equal(personalLookup, false);
});

test("member dashboard metrics aggregate shared review data and keep personal projects actor-scoped", async () => {
  const calls: Array<{ query: string; values: unknown[] }> = [];
  const metrics = loadTs<typeof import("../src/lib/dashboard-metrics.ts")>("src/lib/dashboard-metrics.ts", {
    "@/auth": { auth: async () => ({ user: { id: memberId } }) },
    "@/lib/db/businesses": { getBusinessForUser: async () => ({ id: businessId }) },
    "@/lib/safe-logger": { safeLogger: { error: () => undefined } },
    "@/lib/db/neon": { sql: async (strings: TemplateStringsArray, ..._values: unknown[]) => {
      const query = strings.join(" ").replace(/\s+/g, " ");
      calls.push({ query, values: _values });
      return [{ c: query.includes("review_reply_draft_state") ? 2 : query.includes("followup_visits") ? 4 : 3 }];
    } },
  });
  const result = await metrics.getDashboardMetrics();
  assert.equal(result.totalReviewsSynced, 3);
  assert.equal(result.draftsCount, 2);
  assert.equal(result.followupsSent, 4);
  assert.equal(result.contentThisMonth, 3);
  assert.equal(result.auditsThisMonth, 0);
  assert.ok(calls.filter((call) => /public\.(reviews|review_reply_draft_state|followup_visits)/.test(call.query)).every((call) => call.values.includes(businessId)));
  const projects = calls.find((call) => call.query.includes("public.projects"));
  assert.equal(projects?.values[0], memberId);
  assert.equal(projects?.values.length, 3, "personal projects are scoped to the actor and current UTC month");
  assert.equal(calls.some((call) => call.query.includes("public.leads")), false);
});

test("follow-up aggregate failure remains visible without hiding successfully loaded review metrics", async () => {
  const metrics = loadTs<typeof import("../src/lib/dashboard-metrics.ts")>("src/lib/dashboard-metrics.ts", {
    "@/auth": { auth: async () => ({ user: { id: ownerId } }) },
    "@/lib/db/businesses": { getBusinessForUser: async () => ({ id: businessId }) },
    "@/lib/safe-logger": { safeLogger: { error: () => undefined } },
    "@/lib/db/neon": { sql: async (strings: TemplateStringsArray) => {
      const query = strings.join(" ");
      if (query.includes("public.followup_visits")) throw new Error("table unavailable");
      return [{ c: query.includes("review_reply_draft_state") ? 2 : 7 }];
    } },
  });
  const result = await metrics.getDashboardMetrics();
  assert.equal(result.totalReviewsSynced, 7);
  assert.equal(result.draftsCount, 2);
  assert.equal(result.followupsSent, 0);
  assert.match(result.criticalError ?? "", /follow-up stats/);
});

test("summary counts use the business owner's selected live Google location and return frozen denial", async () => {
  const calls: Array<{ query: string; values: unknown[] }> = [];
  let frozen = false;
  const route = loadTs<typeof import("../src/app/api/dashboard/summary/route.ts")>("src/app/api/dashboard/summary/route.ts", {
    "next/server": { NextResponse: { json: Response.json } },
    "@/lib/user-from-req": { resolveUser: async () => ({ id: memberId }) },
    "@/lib/api-security": { resolveBusinessForSessionUserStrict: async () => {
      if (frozen) throw new TestBusinessAccessError("Business access denied.", 403);
      return context;
    } },
    "@/lib/business-context": { BusinessAccessError: TestBusinessAccessError },
    "@/lib/safe-logger": { safeLogger: { error: () => undefined } },
    "@/lib/db/neon": { sql: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const query = strings.join(" ").replace(/\s+/g, " ");
      calls.push({ query, values });
      if (query.includes("business_google_locations")) return [{ c: 0 }];
      return [{ c: 5 }];
    } },
  });
  const response = await route.GET(new Request("https://example.test/api/dashboard/summary"));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { projectsCount: 5, reviewsCount: 5, locationsCount: 0 });
  const reviews = calls.find((call) => call.query.includes("public.reviews"));
  assert.deepEqual(reviews?.values, [businessId]);
  const locations = calls.find((call) => call.query.includes("business_google_locations"));
  assert.ok(locations?.query.includes("location.connected IS TRUE"));
  assert.ok(locations?.query.includes("connection.connection_version = location.connection_version"));
  assert.deepEqual(locations?.values, [ownerId, businessId]);
  frozen = true;
  const denied = await route.GET(new Request("https://example.test/api/dashboard/summary"));
  assert.equal(denied.status, 403);
});

test("disconnected member sees owner recovery guidance without a Google connect action", async () => {
  const dashboardComponents = Object.fromEntries([
    "DashboardCallout", "DashboardEmptyState", "DashboardPage", "DashboardPageHeader",
  ].map((name) => [name, name]));
  const loaded = renderTsx<{ ReviewRepliesDashboardPage(): Promise<unknown> }>("src/components/dashboard/review-replies-dashboard-page.tsx", {
    "next/headers": { cookies: async () => ({ get: () => undefined }) },
    "next/link": "a",
    "@/components/dashboard": dashboardComponents,
    "@/components/dashboard/review-replies-agent-nav": { ReviewRepliesAgentNav: "ReviewRepliesAgentNav" },
    "@/components/ui/card": { Card: "Card", CardContent: "CardContent", CardHeader: "CardHeader", CardTitle: "CardTitle" },
    "@/components/UpgradeBanner": { UpgradeBanner: "UpgradeBanner" },
    "@/lib/dashboard-metrics": { getDashboardMetrics: async () => ({ totalReviewsSynced: 0, unansweredReviews: 0, draftsCount: 0, repliesPostedThisMonth: 0, isDemo: false }) },
    "@/lib/dashboard-access": { getDashboardAgentAccess: async () => ({ context, entitlement: { planStatus: "active", currentPeriodEnd: null, hasAccess: true } }) },
    "@/lib/db/gbp": { userHasGbpConnection: async () => false },
    "@/auth": { auth: async () => ({ user: { id: memberId } }) },
    "@/components/dashboard/agent-activation-placeholder": { AgentActivationPlaceholder: "AgentActivationPlaceholder" },
    "@/lib/safe-logger": { safeLogger: { error: () => undefined } },
  });
  const tree = await loaded.ReviewRepliesDashboardPage();
  const text = collectText(tree);
  assert.match(text, /Ask the workspace owner to reconnect Google Business Profile/);
  assert.doesNotMatch(text, /Connect Google/);
});
