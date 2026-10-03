import assert from "node:assert/strict";
import test from "node:test";
import { loadTs } from "./auth-test-harness.mts";

function loadRoute(responder: (request: Request) => Promise<Response>) {
  return loadTs<{
    GET(request: Request): Promise<Response>;
    POST(request: Request): Promise<Response>;
  }>("src/app/api/auth/[...nextauth]/route.ts", {
    overrides: { "@/auth": { handlers: { GET: responder, POST: responder } } },
  });
}

test("Auth.js client session responses hide restricted identifiers for GET and POST", async () => {
  const restricted = JSON.stringify({
    user: { id: "user-uuid", email: "private@example.test", name: "Private Name", image: "https://example.test/avatar" },
    deletionUserId: "user-uuid",
    accountLifecycle: "deleting",
    expires: "2030-01-01T00:00:00.000Z",
  });
  const headers = new Headers({ "content-type": "application/json", "x-auth-marker": "preserved" });
  headers.append("set-cookie", "auth.session=rotated; Path=/; HttpOnly");
  headers.append("set-cookie", "auth.csrf=rotated; Path=/; SameSite=Lax");
  const route = loadRoute(async () => new Response(restricted, { status: 200, headers }));

  for (const [method, pathname] of [["GET", "/api/auth/session"], ["POST", "/api/auth/session/"]] as const) {
    const response = await route[method](new Request(`https://app.example${pathname}`));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("x-auth-marker"), "preserved");
    const getSetCookie = (response.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie;
    assert.deepEqual(getSetCookie?.call(response.headers), [
      "auth.session=rotated; Path=/; HttpOnly",
      "auth.csrf=rotated; Path=/; SameSite=Lax",
    ]);
    assert.deepEqual(await response.json(), {
      user: {},
      accountLifecycle: "deleting",
      expires: "2030-01-01T00:00:00.000Z",
    });
  }
});

test("bodyless session statuses pass through without constructing an invalid response", async () => {
  const route = loadRoute(async () => new Response(null, { status: 204, headers: { "x-auth-marker": "bodyless" } }));
  const response = await route.GET(new Request("https://app.example/api/auth/session"));
  assert.equal(response.status, 204);
  assert.equal(response.body, null);
  assert.equal(response.headers.get("x-auth-marker"), "bodyless");
});

test("active session responses remain byte-for-byte unchanged", async () => {
  const body = JSON.stringify({ user: { id: "active-id", email: "active@example.test", name: "Active" }, expires: "2030-01-01T00:00:00.000Z" });
  const route = loadRoute(async () => new Response(body, { status: 207, headers: { "content-type": "application/json", "x-auth-marker": "active" } }));
  const response = await route.GET(new Request("https://app.example/api/auth/session?update=1"));
  assert.equal(response.status, 207);
  assert.equal(response.headers.get("x-auth-marker"), "active");
  assert.equal(await response.text(), body);
});

test("anonymous Auth.js session responses remain JSON null for GET and POST", async () => {
  const route = loadRoute(async () => new Response("null", { status: 200, headers: { "content-type": "application/json" } }));
  for (const method of ["GET", "POST"] as const) {
    const response = await route[method](new Request("https://app.example/api/auth/session", { method }));
    assert.equal(await response.text(), "null");
  }
});

test("unexpected or malformed session projections fail closed", async () => {
  const cases = [
    { body: JSON.stringify({ user: { id: "leaked", email: "private@example.test" }, deletionUserId: 42, extra: "private" }), expected: { user: {} } },
    { body: "not-json-with-private-user-id", expected: null },
  ];
  for (const { body, expected } of cases) {
    const route = loadRoute(async () => new Response(body, { status: 200, headers: { "content-type": "application/json", "x-auth-marker": "preserved" } }));
    const response = await route.GET(new Request("https://app.example/api/auth/session"));
    assert.deepEqual(await response.json(), expected);
    assert.equal(response.headers.get("x-auth-marker"), "preserved");
  }
});

test("non-session Auth.js actions such as sign-out are passed through unchanged", async () => {
  const body = "csrf=ok";
  const route = loadRoute(async () => new Response(body, { status: 303, headers: { location: "https://app.example/login", "set-cookie": "auth.session=; Max-Age=0; Path=/" } }));
  const response = await route.POST(new Request("https://app.example/api/auth/signout", { method: "POST" }));
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), "https://app.example/login");
  assert.equal(response.headers.get("set-cookie"), "auth.session=; Max-Age=0; Path=/");
  assert.equal(await response.text(), body);
});
