import assert from "node:assert/strict";
import test from "node:test";
import { loadTs } from "./auth-test-harness.mts";

class FakeNextResponse extends Response {
  static next() { return new FakeNextResponse("next"); }
  static redirect(url: URL, status = 307) { return new FakeNextResponse(null, { status, headers: { Location: url.href } }); }
  static rewrite(url: URL) { return new FakeNextResponse(url.href); }
  static json(value: unknown, init?: ResponseInit) { return new FakeNextResponse(JSON.stringify(value), { ...init, headers: { "Content-Type": "application/json", ...(init?.headers as Record<string, string> | undefined) } }); }
}

test("restricted session reaches recovery, deletion retry, and Auth.js only", async () => {
  const loaded = loadTs<{ proxy: (request: unknown) => Promise<Response> }>("src/proxy.ts", { overrides: {
    "next/server": { NextResponse: FakeNextResponse },
    "@/auth": { auth: (handler: (request: unknown) => Promise<Response>) => handler },
    "@/lib/app-base-url": { getAppBaseUrl: (request: { nextUrl: URL }) => request.nextUrl.origin },
    "@/lib/db/access": { getMiddlewareAccessState: async () => ({ hasGbp: false, hasRepliesAccess: false }) },
    "@/lib/safe-logger": { safeLogger: { error: () => {} } },
    "@/lib/disconnected-access-policy": { shouldRedirectToGoogleConnect: () => false, shouldRedirectAfterAccessResolutionError: () => false },
    "@/lib/security-headers": { buildContentSecurityPolicy: () => "default-src 'self'" },
  } });
  const request = (path: string, method = "GET") => ({
    url: `https://app.example.test${path}`, method, nextUrl: new URL(`https://app.example.test${path}`),
    headers: new Headers(), cookies: { get: () => undefined },
    auth: { user: {}, deletionUserId: "user-1", accountLifecycle: "deleting" },
  });
  assert.equal((await loaded.proxy(request("/account/deletion"))).status, 200);
  assert.equal((await loaded.proxy(request("/api/privacy/delete", "POST"))).status, 200);
  assert.equal((await loaded.proxy(request("/api/auth/signin/google", "POST"))).status, 200);
  assert.equal((await loaded.proxy(request("/api/auth/signout", "POST"))).status, 200);
  for (const path of ["/dashboard", "/api/privacy/export", "/api/team", "/api/google/oauth/callback", "/api/stripe/checkout", "/api/auth/register", "/demo/review-booster"]) {
    const response = await loaded.proxy(request(path));
    assert.ok(response.status === 403 || response.status === 302, `${path} denied with ${response.status}`);
  }
  assert.equal((await loaded.proxy(request("/api/privacy/delete", "GET"))).status, 403);
});
