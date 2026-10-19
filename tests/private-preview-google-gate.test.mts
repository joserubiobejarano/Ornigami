import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { loadTs } from "./auth-test-harness.mts";

const stagingEnv = {
  VERCEL_ENV: "preview",
  ORNIGAMI_PRIVATE_STAGING_MODE: "true",
  VERCEL_GIT_COMMIT_REF: "codex/ornigami-staging-readiness-20261018",
};

function loadAuth(env: Record<string, string | undefined>) {
  const googleReads: string[] = [];
  const auth = loadTs<{ authConfig: { providers: Array<{ id: string }> } }>("src/auth.ts", {
    env,
    overrides: {
      "next-auth": { __esModule: true, default: () => ({ handlers: {}, auth: () => undefined, signIn: () => undefined, signOut: () => undefined }) },
      "next-auth/providers/google": { __esModule: true, default: () => ({ id: "google", type: "oauth" }) },
      "next-auth/providers/credentials": { __esModule: true, default: () => ({ id: "credentials", type: "credentials" }) },
      "@/lib/env": { getRequiredEnv: (name: string) => {
        googleReads.push(name);
        const value = env[name];
        if (!value) throw new Error(`missing fixture ${name}`);
        return value;
      } },
      "@/lib/db/users": { ensureUserFromOAuth: async () => null, findUserByEmail: async () => null, findUserById: async () => null },
      "@/lib/auth-rate-limit": { clearCredentialsLoginFailures: async () => undefined, isCredentialsLoginRateLimited: async () => false, recordCredentialsLoginFailure: async () => undefined },
    },
  });
  return { auth, googleReads };
}

test("matching private Preview omits Google Auth.js provider without reading Google credentials", () => {
  const { auth, googleReads } = loadAuth(stagingEnv);
  assert.deepEqual(Array.from(auth.authConfig.providers, ({ id }) => id), ["credentials"]);
  assert.deepEqual(googleReads, []);
});

test("missing or mismatched mode inputs retain Google in ordinary Preview and Production", () => {
  const cases = [
    { ...stagingEnv, VERCEL_GIT_COMMIT_REF: "other-branch" },
    { ...stagingEnv, VERCEL_GIT_COMMIT_REF: undefined },
    { ...stagingEnv, ORNIGAMI_PRIVATE_STAGING_MODE: "false" },
    { VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: stagingEnv.VERCEL_GIT_COMMIT_REF },
    { ORNIGAMI_PRIVATE_STAGING_MODE: "true", VERCEL_GIT_COMMIT_REF: stagingEnv.VERCEL_GIT_COMMIT_REF },
    { ...stagingEnv, VERCEL_ENV: "production" },
    { VERCEL_ENV: "development", ORNIGAMI_PRIVATE_STAGING_MODE: "true", VERCEL_GIT_COMMIT_REF: stagingEnv.VERCEL_GIT_COMMIT_REF },
  ];
  for (const mode of cases) {
    const env = { ...mode, GOOGLE_CLIENT_ID: "fixture-client-id", GOOGLE_CLIENT_SECRET: "fixture-client-secret" };
    const { auth, googleReads } = loadAuth(env);
    assert.deepEqual(Array.from(auth.authConfig.providers, ({ id }) => id), ["google", "credentials"]);
    assert.deepEqual(googleReads, ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"]);
  }
});

function loadProxy(env: Record<string, string | undefined>) {
  let accessLookups = 0;
  const proxyModule = loadTs<{ proxy: (request: unknown) => Promise<Response> }>("src/proxy.ts", {
    env,
    overrides: {
      "@/auth": { auth: (handler: (request: unknown) => Promise<Response>) => handler },
      "next/server": { NextResponse: {
        json: (body: unknown, init?: ResponseInit) => Response.json(body, init),
        next: () => new Response(null, { status: 204 }),
        redirect: (url: URL) => Response.redirect(url),
        rewrite: () => new Response(null, { status: 204 }),
      } },
      "@/lib/app-base-url": { getAppBaseUrl: () => "https://staging.ornigami.com" },
      "@/lib/db/access": { getMiddlewareAccessState: async () => { accessLookups += 1; return { hasGbp: false, hasRepliesAccess: false }; } },
      "@/lib/safe-logger": { safeLogger: { error() {} } },
      "@/lib/disconnected-access-policy": {
        shouldRedirectToGoogleConnect: () => false,
        shouldRedirectAfterAccessResolutionError: () => false,
      },
      "@/lib/security-headers": { buildContentSecurityPolicy: () => "default-src 'self'" },
    },
  });
  return { proxy: proxyModule.proxy, get accessLookups() { return accessLookups; } };
}

function proxyRequest(pathname: string, auth: Record<string, unknown> | null) {
  const url = new URL(`https://staging.ornigami.com${pathname}`);
  return {
    nextUrl: url,
    url: url.href,
    method: "GET",
    headers: new Headers(),
    cookies: { get: () => undefined },
    auth,
  };
}

test("authenticated private Preview rejects every Google/GBP route before handlers can call providers or write", async () => {
  const proxyHarness = loadProxy(stagingEnv);
  const endpoints = [
    "/api/google/connection", "/api/google/disconnect", "/api/google/locations",
    "/api/google/locations/list", "/api/google/locations/selection", "/api/google/locations/sync",
    "/api/google/oauth/start", "/api/google/oauth/callback", "/api/google/replies",
    "/api/google/reviews/process-pending", "/api/google/reviews/sync",
  ];
  for (const endpoint of endpoints) {
    const response = await proxyHarness.proxy(proxyRequest(endpoint, { user: { id: "synthetic-user" } }));
    assert.equal(response.status, 503, endpoint);
    assert.deepEqual(await response.json(), { error: "Google integrations are disabled in private staging." });
  }
  assert.equal(proxyHarness.accessLookups, 0);
});

test("production keeps lifecycle restrictions and unauthenticated route handling ahead of the private gate", async () => {
  const privateProxy = loadProxy(stagingEnv);
  const deleting = await privateProxy.proxy(proxyRequest("/api/google/disconnect", {
    accountLifecycle: "deleting", deletionUserId: "synthetic-user",
  }));
  assert.equal(deleting.status, 403);
  assert.deepEqual(await deleting.json(), { error: "Restricted account session" });
  assert.equal((await privateProxy.proxy(proxyRequest("/api/google/connection", null))).status, 204);

  const production = loadProxy({ ...stagingEnv, VERCEL_ENV: "production" });
  const response = await production.proxy(proxyRequest("/api/google/connection", { user: { id: "fixture-user" } }));
  assert.equal(response.status, 204);
  const ordinaryPreview = loadProxy({ ...stagingEnv, VERCEL_GIT_COMMIT_REF: "other-preview-branch" });
  assert.equal((await ordinaryPreview.proxy(proxyRequest("/api/google/connection", { user: { id: "fixture-user" } }))).status, 204);
});

test("unauthenticated Google API requests retain their route-level 401 before integration access", async () => {
  let integrationReads = 0;
  const route = loadTs<{ GET(request: unknown): Promise<Response> }>("src/app/api/google/connection/route.ts", {
    env: stagingEnv,
    overrides: {
      "next/server": { NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) } },
      "@/lib/user-from-req": { resolveUser: async () => null },
      "@/lib/db/neon": { sql: async () => { integrationReads += 1; return []; } },
      "@/lib/safe-logger": { safeLogger: { error() {} } },
      "@/lib/google-business": {
        googleBusinessErrorResponse: () => Response.json({ error: "failed" }, { status: 500 }),
        listBusinessGoogleLocations: async () => { integrationReads += 1; return []; },
        requireGoogleBusinessContext: async () => { integrationReads += 1; return {}; },
      },
    },
  });
  const request = { headers: new Headers(), nextUrl: new URL("https://staging.ornigami/api/google/connection") };
  assert.equal((await route.GET(request)).status, 401);
  assert.equal(integrationReads, 0);
});

test("private dashboard shows synthetic disconnected state without offering a Google connection", () => {
  const dashboard = loadTs<typeof import("../src/lib/private-preview.ts")>("src/lib/private-preview.ts");
  assert.equal(dashboard.isPrivatePreviewMode(stagingEnv), true);
  const step = dashboard.getDashboardGoogleStep({ privatePreview: true, hasGbp: false, isWorkspaceOwner: true });
  assert.equal(step.complete, false);
  assert.match(step.label, /disabled in private staging/);
  assert.equal(step.href, undefined);
  assert.equal(step.actionLabel, undefined);

  for (const mode of [
    { ...stagingEnv, VERCEL_GIT_COMMIT_REF: "wrong" },
    { ...stagingEnv, ORNIGAMI_PRIVATE_STAGING_MODE: undefined },
    { ...stagingEnv, ORNIGAMI_PRIVATE_STAGING_MODE: "false" },
    { ...stagingEnv, VERCEL_ENV: "production" },
  ]) assert.equal(dashboard.isPrivatePreviewMode(mode), false);

  const ordinary = dashboard.getDashboardGoogleStep({ privatePreview: false, hasGbp: false, isWorkspaceOwner: true });
  assert.equal(ordinary.href, "/connect");
  assert.equal(ordinary.actionLabel, "Connect Google");
  assert.match(ordinary.description, /Connect Google Business Profile/);
  const connectedOrdinary = dashboard.getDashboardGoogleStep({ privatePreview: false, hasGbp: true, isWorkspaceOwner: true });
  assert.equal(connectedOrdinary.href, "/connect");
  assert.equal(connectedOrdinary.actionLabel, "Connect Google");
});

function renderDashboardPage(privatePreview: boolean) {
  const filename = resolve("src/app/(dashboard)/dashboard/page.tsx");
  const compiled = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    fileName: filename,
  }).outputText;
  const session = { user: { id: "synthetic-user", name: "Fictional User" } };
  const business = { id: "fictional-business", name: "Example Workshop", tone: null };
  let gbpLookups = 0;
  const jsx = (type: unknown, props: Record<string, unknown>) => ({ type, props });
  const wrapper = (name: string) => (props: Record<string, unknown>) => ({ component: name, props });
  const Link = wrapper("Link");
  const components = Object.fromEntries([
    "DashboardCallout", "DashboardPage", "DashboardPageHeader", "StatusBadge", "ActivationChecklist",
    "ChangePlanButton", "Badge", "Button", "Card", "CardContent", "CardDescription", "CardHeader", "CardTitle",
  ].map((name) => [name, wrapper(name)]));
  const helper = loadTs<typeof import("../src/lib/private-preview.ts")>("src/lib/private-preview.ts");
  const mocks: Record<string, unknown> = {
    "next/link": { __esModule: true, default: Link },
    "@/components/dashboard": components,
    "@/components/dashboard/activation-checklist": { ActivationChecklist: wrapper("ActivationChecklist") },
    "@/components/dashboard/change-plan-button": { ChangePlanButton: wrapper("ChangePlanButton") },
    "@/components/ui/badge": { Badge: wrapper("Badge") },
    "@/components/ui/button": { Button: wrapper("Button") },
    "@/components/ui/card": Object.fromEntries(["Card", "CardContent", "CardDescription", "CardHeader", "CardTitle"].map((name) => [name, wrapper(name)])),
    "@/lib/agents/registry": { AGENT_REGISTRY: [{ id: "review_replies", name: "Review Replies", shortDescription: "Synthetic reviews", basePath: "/review-replies" }] },
    "@/lib/auth": { requireUser: async () => session },
    "@/lib/db/businesses": { getBusinessAgents: async () => [] },
    "@/lib/db/gbp": { userHasGbpConnection: async () => { gbpLookups += 1; return false; } },
    "@/lib/db/neon": { sql: async () => [] },
    "@/lib/dashboard-metrics": { getDashboardMetrics: async () => ({ repliesPostedThisMonth: 3, unansweredReviews: 2, followupsSent: 1, criticalError: null }) },
    "@/lib/billing/plans": { isPlanId: () => false },
    "@/lib/dashboard-access": { getDashboardAgentAccess: async () => ({ context: { business, role: "owner", integrationOwnerUserId: "synthetic-user" }, entitlement: { hasAccess: false } }) },
    "@/lib/plan-server": { getBusinessPlanInfo: async () => ({ hasAccess: true }) },
    "@/lib/private-preview": {
      isPrivatePreviewMode: () => privatePreview,
      getDashboardGoogleStep: helper.getDashboardGoogleStep,
    },
  };
  const moduleRecord: { exports: Record<string, unknown> } = { exports: {} };
  const localRequire = (id: string): unknown => {
    if (Object.hasOwn(mocks, id)) return mocks[id];
    if (id === "react/jsx-runtime") return { jsx, jsxs: jsx, Fragment: "fragment" };
    throw new Error(`Unmocked dashboard dependency: ${id}`);
  };
  const execute = vm.runInThisContext(`(function(exports, require, module) { ${compiled}\n})`, { filename }) as
    (exports: object, require: typeof localRequire, module: { exports: Record<string, unknown> }) => void;
  execute(moduleRecord.exports, localRequire, moduleRecord);
  return { render: (moduleRecord.exports.default as () => Promise<unknown>)(), Link, get gbpLookups() { return gbpLookups; } };
}

function flatten(node: unknown, elements: Array<{ type?: unknown; props?: Record<string, unknown> }> = []): string {
  if (Array.isArray(node)) return node.map((item) => flatten(item, elements)).join(" ");
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (!node || typeof node !== "object") return "";
  const element = node as { type?: unknown; props?: Record<string, unknown>; component?: string };
  elements.push(element);
  return Object.values(element.props ?? node as Record<string, unknown>).map((value) => flatten(value, elements)).join(" ");
}

test("actual dashboard page renders synthetic workspace data without GBP lookup or connection CTA", async () => {
  const dashboard = renderDashboardPage(true);
  const tree = await dashboard.render;
  const elements: Array<{ type?: unknown; props?: Record<string, unknown>; component?: string }> = [];
  const text = flatten(tree, elements);
  assert.match(text, /Welcome back, Fictional\./);
  assert.match(text, /Google profile disabled in private staging/);
  assert.match(text, /Google Business Profile operations are disabled/);
  assert.equal(dashboard.gbpLookups, 0);
  const links = elements.filter((element) => element.type === dashboard.Link);
  assert.equal(links.some((link) => link.props?.href === "/connect"), false);
});
