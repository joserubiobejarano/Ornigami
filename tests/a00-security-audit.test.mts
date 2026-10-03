import assert from "node:assert/strict";
import test from "node:test";
import { ALLOWED_ADVISORY_URL, EXCEPTION_EXPIRES_AT, evaluateAuditReports } from "../scripts/security-audit.mjs";

const okProd = { vulnerabilities: {}, metadata: { vulnerabilities: { high: 0, critical: 0 } } };
const advisory = { source: 123, name: "brace-expansion", severity: "high", url: ALLOWED_ADVISORY_URL };

test("allows exact advisory with indirect ancestry only before expiration", () => {
  const full = { vulnerabilities: {
    "brace-expansion": { severity: "high", via: [advisory] },
    "glob-parent": { severity: "high", via: ["brace-expansion"] },
  } };
  const result = evaluateAuditReports(full, okProd, new Date("2026-10-09T23:59:59Z"));
  assert.equal(result.ok, true);
  assert.deepEqual(result.allowed.map(({ name }) => name), ["brace-expansion", "glob-parent"]);
  assert.equal(EXCEPTION_EXPIRES_AT, "2026-10-10T00:00:00Z");
});

test("rejects mixed advisory URLs, unknown package graph edges, and cycles", () => {
  const cases = [
    { vulnerabilities: { a: { severity: "high", via: [advisory, { ...advisory, url: "https://example.com/other" }] } } },
    { vulnerabilities: { a: { severity: "high", via: ["missing"] } } },
    { vulnerabilities: { a: { severity: "high", via: ["b"] }, b: { severity: "high", via: ["a", advisory] } } },
  ];
  for (const full of cases) assert.equal(evaluateAuditReports(full, okProd, new Date("2026-10-01T00:00:00Z")).ok, false);
});

test("rejects unknown full-report findings, production high findings, and expired exception", () => {
  const unknown = { vulnerabilities: { unrelated: { severity: "moderate", via: [{ url: "https://example.com/advisory" }] } } };
  assert.equal(evaluateAuditReports(unknown, okProd, new Date("2026-10-01T00:00:00Z")).ok, false);
  const prodHigh = { vulnerabilities: { prod: { severity: "high", via: [advisory] } } };
  assert.equal(evaluateAuditReports({ vulnerabilities: {} }, prodHigh, new Date("2026-10-01T00:00:00Z")).ok, false);
  assert.equal(evaluateAuditReports({ vulnerabilities: { "brace-expansion": { severity: "high", via: [advisory] } } }, okProd, new Date(EXCEPTION_EXPIRES_AT)).ok, false);
});

test("fails closed on npm error and malformed audit report shapes", () => {
  assert.equal(evaluateAuditReports({ error: { code: "ECONNRESET" } }, okProd).ok, false);
  assert.equal(evaluateAuditReports({ vulnerabilities: {} }, { vulnerabilities: null }).ok, false);
  assert.equal(evaluateAuditReports({ vulnerabilities: { x: { severity: "urgent", via: [advisory] } } }, okProd).ok, false);
});
