import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test, { type TestContext } from "node:test";
import { fakeSql, loadTs } from "./a02-test-support.mts";

const { NextRequest } = createRequire(import.meta.url)("next/server") as {
  NextRequest: new (input: string, init?: RequestInit) => Request;
};

function guard(t: TestContext, appUrl: string) {
  const prior = process.env.NEXT_PUBLIC_APP_URL;
  process.env.NEXT_PUBLIC_APP_URL = appUrl;
  t.after(() => {
    if (prior === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
    else process.env.NEXT_PUBLIC_APP_URL = prior;
  });
  return loadTs<{ isSameOriginMutation(request: Request): boolean }>("src/lib/team-lifecycle.ts", {
    "@/lib/db/neon": { sql: fakeSql(() => []).sql },
    "next/server": { NextResponse: { json: Response.json } },
    "@/lib/safe-logger": { safeLogger: { error() {} } },
  }).isSameOriginMutation;
}

function nextMutation(url: string, origin: string, extra: Record<string, string> = {}) {
  return new NextRequest(url, { method: "POST", headers: { origin, "sec-fetch-site": "same-origin", ...extra } });
}

test("real NextRequest loopback normalization permits only the configured app origin", (t) => {
  const allowed = guard(t, "http://127.0.0.1:45120");
  const request = nextMutation("http://127.0.0.1:45120/api/team", "http://127.0.0.1:45120");
  assert.equal(new URL(request.url).origin, "http://localhost:45120", "installed Next normalizes the handler URL");
  assert.equal(allowed(request), true);
  for (const origin of ["http://localhost:45120", "http://127.0.0.1:45121", "https://127.0.0.1:45120", "https://evil.example", "null"]) {
    assert.equal(allowed(nextMutation(request.url, origin)), false, origin);
  }
  assert.equal(allowed(nextMutation(request.url, "http://127.0.0.1:45120", { "sec-fetch-site": "cross-site" })), false);
});

test("a configured loopback alias cannot authorize another server protocol or port", (t) => {
  const allowed = guard(t, "http://127.0.0.1:45120");
  assert.equal(allowed(nextMutation("http://127.0.0.1:45121/api/team", "http://127.0.0.1:45120")), false);
  assert.equal(allowed(nextMutation("https://127.0.0.1:45120/api/team", "http://127.0.0.1:45120")), false);
});

test("public request origins and cross-site checks remain strict despite forged forwarding headers", (t) => {
  const allowed = guard(t, "https://app.example.test");
  const target = "https://app.example.test/api/team";
  assert.equal(allowed(nextMutation(target, "https://app.example.test")), true);
  assert.equal(allowed(nextMutation(target, "https://evil.example", {
    host: "evil.example", "x-forwarded-host": "evil.example", "x-forwarded-proto": "https",
  })), false);
  assert.equal(allowed(nextMutation(target, "https://sub.app.example.test", { "sec-fetch-site": "same-site" })), false);
  assert.equal(allowed(new Request(target, { method: "POST" })), false);
});
