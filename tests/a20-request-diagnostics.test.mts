import assert from "node:assert/strict";
import test from "node:test";
import { sanitizeIncomingRequest, sanitizeInternalRequestOrigin } from "../scripts/a20-request-diagnostics.mjs";

test("A20 request diagnostics retain only origin decision metadata for approved writes", () => {
  const item = sanitizeIncomingRequest({
    method: "post",
    url: "/api/review-booster/settings?businessId=private-business&token=private-token",
    headers: {
      origin: "http://127.0.0.1:60953/path?secret=value",
      "sec-fetch-site": "same-origin",
      host: "127.0.0.1:60953",
      "x-forwarded-host": "127.0.0.1:60953, private-proxy.internal",
      "x-forwarded-proto": "http, private-value",
      cookie: "private-cookie",
      authorization: "Bearer private-secret",
    },
  });

  assert.deepEqual(item, {
    method: "POST",
    path: "/api/review-booster/settings",
    origin: "http://127.0.0.1:60953",
    secFetchSite: "same-origin",
    host: "127.0.0.1:60953",
    xForwardedHost: "127.0.0.1:60953",
    xForwardedProto: "http",
  });
  assert.doesNotMatch(JSON.stringify(item), /private|secret|token|businessId|cookie|authorization/);
});

test("A20 request diagnostics mask member ids and ignore unrelated routes", () => {
  const memberDelete = sanitizeIncomingRequest({
    method: "DELETE",
    url: "/api/team/members/a2000000-0000-4000-8000-000000000002?token=private",
    headers: { origin: "https://user:secret@example.test/path", "sec-fetch-site": "cross-site", host: "example.test/path?secret" },
  });
  assert.deepEqual(memberDelete, {
    method: "DELETE",
    path: "/api/team/members/:id",
    origin: "invalid",
    secFetchSite: "cross-site",
    host: "invalid",
    xForwardedHost: null,
    xForwardedProto: null,
  });
  assert.equal(sanitizeIncomingRequest({ method: "GET", url: "/api/review-booster/settings?secret=value", headers: {} }), null);
  assert.equal(sanitizeIncomingRequest({ method: "POST", url: "/api/auth/callback/credentials", headers: {} }), null);
  assert.doesNotMatch(JSON.stringify(memberDelete), /secret|private|token|a2000000/);
});

test("A20 request diagnostics reduce Next internal request metadata to origin only", () => {
  const request = {
    [Symbol.for("NextInternalRequestMeta")]: {
      initURL: "http://localhost:60953/api/review-booster/settings?businessId=private&token=secret",
    },
  };
  const origin = sanitizeInternalRequestOrigin(request);
  assert.equal(origin, "http://localhost:60953");
  assert.doesNotMatch(String(origin), /private|secret|businessId/);
  assert.equal(sanitizeInternalRequestOrigin({}), null);
});
