import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateAuditReports,
  evaluateAuditResults,
  parseAuditOutput,
} from "../scripts/security-audit.mjs";

const LEVELS = ["info", "low", "moderate", "high", "critical"] as const;
type Severity = (typeof LEVELS)[number];

function report(findings: Record<string, Severity> = {}) {
  const vulnerabilities = Object.fromEntries(Object.entries(findings).map(([name, severity]) => [name, { severity }]));
  const counts = Object.fromEntries(LEVELS.map((severity) => [severity, 0])) as Record<Severity, number>;
  for (const severity of Object.values(findings)) counts[severity] += 1;
  return {
    auditReportVersion: 2,
    vulnerabilities,
    metadata: {
      vulnerabilities: {
        ...counts,
        total: Object.keys(findings).length,
      },
    },
  };
}

const clean = report();
const retiredAdvisory = "https://github.com/advisories/GHSA-vfj7-8cjw-p6xm";

test("accepts a consistent clean full audit and a clean production audit", () => {
  const result = evaluateAuditReports(clean, clean);
  assert.equal(result.ok, true);
  assert.deepEqual(result.fullCounts, { info: 0, low: 0, moderate: 0, high: 0, critical: 0 });
  assert.deepEqual(result.productionCounts, result.fullCounts);
});

test("rejects every full-audit finding regardless of package, severity, or advisory ancestry", () => {
  for (const severity of LEVELS) {
    const full = report({
      ...(severity === "high" ? { braces: "high" as const, micromatch: "high" as const } : {}),
      [`unrelated-${severity}`]: severity,
    });
    const result = evaluateAuditReports(full, clean);
    assert.equal(result.ok, false, `${severity} finding must fail the full audit`);
    assert.match(result.errors[0], /Full audit contains/);
  }
});

test("rejects the retired GHSA advisory and its transitive ancestry without a time exception", () => {
  const advisory = {
    source: 123,
    name: "braces",
    severity: "high",
    url: retiredAdvisory,
  };
  const full = report({ braces: "high", micromatch: "high" });
  Object.assign(full.vulnerabilities.braces, { via: [advisory] });
  Object.assign(full.vulnerabilities.micromatch, { via: ["braces"] });

  const result = evaluateAuditReports(full, clean);
  assert.equal(result.ok, false);
  assert.match(result.errors[0], /Full audit contains 2 vulnerabilities/);
  assert.equal(evaluateAuditReports(clean, clean).ok, true);
});

test("preserves the production high and critical finding gate", () => {
  assert.equal(evaluateAuditReports(clean, report({ production: "high" })).ok, false);
  assert.equal(evaluateAuditReports(clean, report({ production: "critical" })).ok, false);
  assert.equal(evaluateAuditReports(clean, report({ production: "moderate" })).ok, true);
});

test("rejects malformed audit shapes, entries, severities, and metadata counts", () => {
  const malformedReports = [
    null,
    [],
    { ...clean, auditReportVersion: 1 },
    { vulnerabilities: clean.vulnerabilities, metadata: clean.metadata },
    { error: { code: "ECONNRESET" } },
    { vulnerabilities: null, metadata: { vulnerabilities: {} } },
    { vulnerabilities: {}, metadata: null },
    { vulnerabilities: { x: null }, metadata: { vulnerabilities: {} } },
    { vulnerabilities: { x: { severity: "urgent" } }, metadata: { vulnerabilities: {} } },
    { ...clean, metadata: { vulnerabilities: { ...clean.metadata.vulnerabilities, high: "0" } } },
    { ...clean, metadata: { vulnerabilities: { ...clean.metadata.vulnerabilities, moderate: -1 } } },
    { ...clean, metadata: { vulnerabilities: { ...clean.metadata.vulnerabilities, critical: 0.5 } } },
    { ...clean, metadata: { vulnerabilities: { ...clean.metadata.vulnerabilities, total: 1 } } },
    { ...clean, metadata: { vulnerabilities: { ...clean.metadata.vulnerabilities, moderate: 1 } } },
  ];
  for (const malformed of malformedReports) {
    assert.equal(evaluateAuditReports(malformed, clean).ok, false);
    assert.equal(evaluateAuditReports(clean, malformed).ok, false);
  }
});

test("rejects network failures, malformed JSON, bad npm exits, and status/report contradictions", () => {
  const failedNetwork = { error: "Could not run npm audit: ECONNRESET" };
  assert.equal(evaluateAuditResults(failedNetwork, { report: clean, status: 0 }).ok, false);
  assert.equal(evaluateAuditResults({ report: clean, status: 0 }, failedNetwork).ok, false);
  assert.match(parseAuditOutput("{invalid", 1, "registry error").error!, /Could not parse npm audit JSON/);
  assert.equal(evaluateAuditResults({ report: clean, status: 2 }, { report: clean, status: 0 }).ok, false);
  assert.equal(evaluateAuditResults({ report: clean, status: null }, { report: clean, status: 0 }).ok, false);
  assert.equal(evaluateAuditResults({ report: report({ x: "moderate" }), status: 0 }, { report: clean, status: 0 }).ok, false);
  assert.equal(evaluateAuditResults({ report: clean, status: 1 }, { report: clean, status: 0 }).ok, false);
});

test("allows a production moderate finding only when npm reports its nonzero status", () => {
  const result = evaluateAuditResults(
    { report: clean, status: 0 },
    { report: report({ production: "moderate" }), status: 1 },
  );
  assert.equal(result.ok, true);
});

test("rejects npm error objects even when their message is empty", () => {
  assert.equal(evaluateAuditReports({ error: {} }, clean).ok, false);
  assert.equal(evaluateAuditReports(clean, { error: "failure" }).ok, false);
});
