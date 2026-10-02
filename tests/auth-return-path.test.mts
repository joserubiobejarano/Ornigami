import assert from "node:assert/strict";
import test from "node:test";
import { authPageHref, getAuthReturnPath, sanitizeAuthReturnPath } from "../src/lib/auth-return-path.ts";

test("accepts safe local callbacks and normalizes dot segments", () => {
  assert.equal(sanitizeAuthReturnPath("/team/settings?tab=members#invite"), "/team/settings?tab=members#invite");
  assert.equal(sanitizeAuthReturnPath("/a/../dashboard"), "/dashboard");
});

test("rejects external, protocol-relative, and normalized protocol-relative paths", () => {
  for (const value of ["https://evil.example", "//evil.example", "/foo/..//evil.com", "/a/..\\evil.com"]) {
    assert.equal(sanitizeAuthReturnPath(value), "/dashboard", value);
  }
});

test("rejects encoded slash, backslash, controls, nested encoding, malformed and oversized paths", () => {
  for (const value of ["/%2f%2fevil.example", "/%5cevil.example", "/%00admin", "/%252f%252fevil.example", "/%255c%255cevil.example", "/%250d%250a", "/%zz", `/${"a".repeat(2048)}`]) {
    assert.equal(sanitizeAuthReturnPath(value), "/dashboard", value);
  }
});

test("honors only safe fallback destinations", () => {
  assert.equal(sanitizeAuthReturnPath(null, "/pricing?from=auth"), "/pricing?from=auth");
  assert.equal(sanitizeAuthReturnPath(null, "//evil.example"), "/dashboard");
});

test("preserves callbackUrl and legacy invitation return navigation", () => {
  const params = (values: Record<string, string>) => ({ get: (key: string) => values[key] ?? null });
  assert.equal(getAuthReturnPath(params({ callbackUrl: "/billing?from=signup" })), "/billing?from=signup");
  assert.equal(getAuthReturnPath(params({ invite: "abc_123" })), "/team/invite/abc_123");
  assert.equal(getAuthReturnPath(params({ callbackUrl: "//evil.example", invite: "abc_123" })), "/dashboard");
  assert.equal(getAuthReturnPath(params({ invite: "../evil" })), "/dashboard");
});

test("auth links preserve the route query/hash and encode callback paths", () => {
  assert.equal(authPageHref("/login", "/team/invite/a?x=1"), "/login?callbackUrl=%2Fteam%2Finvite%2Fa%3Fx%3D1");
  const link = new URL(authPageHref("/login?source=expired#form", "/dashboard"), "https://ornigami.invalid");
  assert.equal(link.pathname, "/login");
  assert.equal(link.searchParams.get("source"), "expired");
  assert.equal(link.searchParams.get("callbackUrl"), "/dashboard");
  assert.equal(link.hash, "#form");
  assert.equal(authPageHref("//evil.example", "/dashboard").startsWith("/login?"), true);
});
