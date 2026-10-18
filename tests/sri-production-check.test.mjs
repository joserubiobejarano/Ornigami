import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { analyzeScriptTags, parseCspNonce, requiredHeaders, scriptTags } from "../scripts/sri-production-check.mjs";

test("script tag parser keeps quoted attributes and inline scripts distinct", () => {
  const tags = scriptTags(`<script src="/_next/a.js" integrity="sha256-abc==" crossorigin="anonymous"></script><script nonce='abc'>window.ok()</script>`);
  assert.equal(tags.length, 2);
  assert.equal(tags[0].attributes.get("src"), "/_next/a.js");
  assert.equal(tags[0].attributes.get("integrity"), "sha256-abc==");
  assert.equal(tags[1].attributes.get("nonce"), "abc");
});

test("same-origin SRI verifies bytes and accumulates every missing or invalid tag", async () => {
  const asset = Buffer.from("compiled asset bytes");
  const valid = createHash("sha256").update(asset).digest("base64");
  const html = [
    `<script src="/_next/valid.js" integrity="sha256-${valid}"></script>`,
    `<script src="/_next/missing.js"></script>`,
    `<script src="/_next/wrong.js" integrity="sha256-${Buffer.alloc(32, 1).toString("base64")}"></script>`,
    `<script src="https://cdn.example.invalid/ext.js"></script>`,
  ].join("");
  const fetched = [];
  const result = await analyzeScriptTags(html, "http://127.0.0.1:4311/", async (url) => {
    fetched.push(url.pathname);
    return asset;
  });
  assert.equal(result.sameOriginCount, 3);
  assert.equal(result.externalCount, 1);
  assert.deepEqual(result.issues.map((issue) => issue.issue), ["missing-integrity", "integrity-digest-mismatch", "external-script-source"]);
  assert.deepEqual(fetched, ["/_next/valid.js", "/_next/wrong.js"]);
});

test("invalid SRI syntax is reported while all other script tags are still checked", async () => {
  const html = `<script src="/one.js" integrity="nope"></script><script src="/two.js"></script>`;
  const result = await analyzeScriptTags(html, "http://127.0.0.1:4311/", async () => Buffer.from("unused"));
  assert.deepEqual(result.issues.map((issue) => issue.issue), ["invalid-integrity-format", "missing-integrity"]);
});

test("configured SHA-256 policy rejects stronger algorithms and unexpected external scripts without fetching them", async () => {
  const html = `<script src="/stronger.js" integrity="sha384-${Buffer.alloc(48, 2).toString("base64")}"></script><script src="https://cdn.invalid/lib.js"></script>`;
  const fetched = [];
  const result = await analyzeScriptTags(html, "http://127.0.0.1:4311/", async (url) => {
    fetched.push(url.href);
    return Buffer.from("unused");
  });
  assert.deepEqual(result.issues.map((issue) => issue.issue), ["unexpected-integrity-algorithm", "external-script-source"]);
  assert.deepEqual(fetched, []);
});

test("CSP nonce parser requires strict nonce-bound script-src", () => {
  assert.deepEqual(parseCspNonce("default-src 'self'; script-src 'self' 'nonce-abc123'"), { nonce: "abc123", error: null });
  assert.equal(parseCspNonce("script-src 'self' 'unsafe-inline' 'nonce-x'").error, "unsafe-script-policy");
  assert.equal(parseCspNonce("default-src 'self'").error, "missing-script-src");
});

test("security header validation rejects present but weakened policies", () => {
  const baseline = {
    "x-frame-options": "DENY",
    "x-content-type-options": "nosniff",
    "referrer-policy": "strict-origin-when-cross-origin",
    "permissions-policy": "camera=(), microphone=(), geolocation=()",
    "strict-transport-security": "max-age=31536000; includeSubDomains; preload",
    "content-security-policy-report-only": "default-src 'self'",
    "reporting-endpoints": "default=\"/api/csp-report\"",
  };
  assert.deepEqual(requiredHeaders(baseline), []);
  assert.ok(requiredHeaders({ ...baseline, "x-frame-options": "ALLOWALL" }).includes("unexpected-security-header:x-frame-options"));
});
