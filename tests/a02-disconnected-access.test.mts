import assert from "node:assert/strict";
import test from "node:test";
import { loadTs, fakeSql } from "./a02-test-support.mts";
import { isGoogleDependentRepliesPath, shouldRedirectToGoogleConnect, shouldRedirectAfterAccessResolutionError } from "../src/lib/disconnected-access-policy.ts";

type Req = { url: string; nextUrl: URL; headers: Headers; auth: { user: { id: string } } | null; cookies: { get(name: string): { value: string } | undefined } };
type Res = { kind: string; url?: URL; status: number; headers: Headers; requestHeaders?: Headers; body?: unknown };
type Options = { status?: number; request?: { headers?: Headers } };
type Handler = (req: Req) => Promise<Res>;
type Access = { hasGbp: boolean; hasRepliesAccess: boolean };
function response(kind: string, url?: URL, options?: Options): Res {
  return { kind, url, status: options?.status ?? (kind === "redirect" ? 307 : 200), headers: new Headers(), requestHeaders: options?.request?.headers };
}
function loadProxy(access: Access | Error) {
  const calls: string[] = [];
  const mod = loadTs<{ proxy: Handler }>("src/proxy.ts", {
    "next/server": { NextResponse: {
      next: (options?: Options) => response("next", undefined, options),
      rewrite: (url: URL, options?: Options) => response("rewrite", url, options),
      redirect: (url: URL, options?: number | Options) => response("redirect", url, typeof options === "number" ? { status: options } : options),
      json: (body: unknown, options?: Options) => ({ ...response("json", undefined, options), body }),
    } },
    "@/auth": { auth: (handler: Handler) => handler },
    "@/lib/app-base-url": { getAppBaseUrl: (req: Req) => req.nextUrl.origin },
    "@/lib/db/access": { getMiddlewareAccessState: async (id: string) => { calls.push(id); if (access instanceof Error) throw access; return access; } },
    "@/lib/safe-logger": { safeLogger: { error() {} } },
    "@/lib/security-headers": { buildContentSecurityPolicy: (nonce: string) => `default-src 'self'; script-src 'self' 'nonce-${nonce}'` },
    "@/lib/disconnected-access-policy": { isGoogleDependentRepliesPath, shouldRedirectToGoogleConnect, shouldRedirectAfterAccessResolutionError },
  });
  return { proxy: mod.proxy, calls };
}
function request(path: string, options: { userId?: string; demo?: boolean; headers?: Record<string, string> } = {}): Req {
  const url = new URL(`https://app.test${path}`);
  return { url: url.href, nextUrl: url, headers: new Headers(options.headers),
    auth: options.userId ? { user: { id: options.userId } } : null,
    cookies: { get: name => name === "ll_demo" && options.demo ? { value: "true" } : undefined },
  };
}
test("anonymous protected requests retain callback/CSP and skip access lookup", async () => {
  const { proxy, calls } = loadProxy({ hasGbp: false, hasRepliesAccess: true });
  const res = await proxy(request("/reviews?tab=new"));
  assert.equal(res.kind, "redirect");
  assert.equal(res.url?.pathname, "/login");
  assert.equal(res.url?.searchParams.get("callbackUrl"), "/reviews?tab=new");
  assert.match(res.headers.get("Content-Security-Policy") ?? "", /nonce-/);
  assert.equal(calls.length, 0);
});
test("connected member uses shared state; request and response retain same nonce", async () => {
  const { proxy, calls } = loadProxy({ hasGbp: true, hasRepliesAccess: true });
  const res = await proxy(request("/dashboard/agents/review-replies/reviews", { userId: "member" }));
  assert.equal(res.kind, "next");
  assert.deepEqual(calls, ["member"]);
  assert.equal(res.headers.get("Content-Security-Policy"), res.requestHeaders?.get("Content-Security-Policy"));
  assert.match(res.requestHeaders?.get("x-nonce") ?? "", /^[A-Za-z0-9_-]+$/);
});
test("entitled disconnected actors reach inbox recovery while other Google workflows redirect", async () => {
  const { proxy } = loadProxy({ hasGbp: false, hasRepliesAccess: true });
  for (const userId of ["owner", "member"]) {
    for (const path of ["/reviews/new", "/dashboard/agents/review-replies/new"]) {
      const res = await proxy(request(path, { userId }));
      assert.equal(res.url?.pathname, "/connect", path);
    }
    for (const path of ["/reviews", "/dashboard/agents/review-replies", "/dashboard/agents/review-replies/reviews", "/dashboard", "/dashboard/billing", "/dashboard/team", "/settings", "/connect", "/dashboard/agents/review-booster", "/dashboard/agents/review-booster/settings", "/dashboard/agents/review-replies/settings", "/dashboard/agents/review-replies/google-connection"]) {
      assert.equal((await proxy(request(path, { userId }))).kind, "next", path);
    }
  }
});
test("inactive Replies reaches activation and connected connect redirects to dashboard", async () => {
  for (const hasGbp of [true, false]) {
    const { proxy } = loadProxy({ hasGbp, hasRepliesAccess: false });
    assert.equal((await proxy(request("/reviews", { userId: "member" }))).kind, "next");
  }
  const { proxy } = loadProxy({ hasGbp: true, hasRepliesAccess: true });
  assert.equal((await proxy(request("/connect", { userId: "member" }))).url?.pathname, "/dashboard");
});
test("access outages fail closed on Google pages and preserve recovery without connect loop", async () => {
  const { proxy } = loadProxy(new Error("db unavailable"));
  assert.equal((await proxy(request("/reviews/new", { userId: "owner" }))).url?.pathname, "/connect");
  for (const path of ["/reviews", "/dashboard/agents/review-replies", "/dashboard/agents/review-replies/reviews", "/connect", "/settings", "/dashboard/billing", "/dashboard/agents/review-booster", "/dashboard/agents/review-replies/google-connection"]) {
    assert.equal((await proxy(request(path, { userId: "owner" }))).kind, "next", path);
  }
});
test("demo rewrites and internal header protection remain intact", async () => {
  const { proxy } = loadProxy({ hasGbp: false, hasRepliesAccess: false });
  assert.equal((await proxy(request("/demo/review-replies"))).url?.pathname, "/demo-review-replies");
  assert.equal((await proxy(request("/api/openai/review-reply", { demo: true }))).requestHeaders?.get("x-demo"), "true");
  assert.equal((await proxy(request("/api/google/oauth/start", { demo: true }))).status, 403);
  assert.equal((await proxy(request("/api/reviews", { userId: "member", headers: { "x-demo": "true" } }))).requestHeaders?.has("x-demo"), false);
});
test("middleware Google lookup uses selected integration owner rather than member personal connection", async () => {
  let ownerConnected = false;
  const db = fakeSql((_query, values) => [{ has_gbp: values[0] === "owner" ? ownerConnected : true }]);
  const agents: string[][] = [];
  const contexts: unknown[][] = [];
  const access = loadTs<typeof import("../src/lib/db/access.ts")>("src/lib/db/access.ts", {
    "@/lib/business-context": { resolveBusinessContext: async (...args: unknown[]) => { contexts.push(args); return { businessId: "selected", integrationOwnerUserId: "owner" }; } },
    "@/lib/db/businesses": { canAccessAgent: async (id: string, agent: string) => { agents.push([id, agent]); return true; } },
    "@/lib/db/neon": { sql: db.sql },
  });
  assert.equal((await access.getMiddlewareAccessState("member", "selected")).hasGbp, false);
  ownerConnected = true;
  const state = await access.getMiddlewareAccessState("member", "selected");
  assert.equal(state.hasGbp, true);
  assert.equal(state.hasRepliesAccess, true);
  assert.deepEqual(db.calls[0].values, ["owner"]);
  assert.deepEqual(agents[0], ["selected", "review_replies"]);
  assert.deepEqual(contexts[0], ["member", "selected"]);
});
test("missing middleware context returns no access without querying connections", async () => {
  const db = fakeSql(() => { throw new Error("must not query"); });
  const access = loadTs<typeof import("../src/lib/db/access.ts")>("src/lib/db/access.ts", {
    "@/lib/business-context": { resolveBusinessContext: async () => null },
    "@/lib/db/businesses": { canAccessAgent: async () => { throw new Error("must not query"); } },
    "@/lib/db/neon": { sql: db.sql },
  });
  assert.deepEqual(await access.getMiddlewareAccessState("deleted"), { hasGbp: false, hasRepliesAccess: false, businessId: null, ownerUserId: null });
});
