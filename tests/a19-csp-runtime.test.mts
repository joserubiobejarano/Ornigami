import assert from "node:assert/strict";
import test from "node:test";

import {
  TRUSTED_TYPES_REPORT_ONLY_POLICY,
  TRUSTED_TYPES_REPORTING_ENDPOINT,
  buildContentSecurityPolicy,
} from "../src/lib/security-headers.ts";

function directives(policy: string): Map<string, string[]> {
  return new Map(policy.split(";").map((directive) => {
    const [name, ...values] = directive.trim().split(/\s+/);
    return [name, values];
  }));
}

test("runtime CSP keeps script execution nonce-bound and blocks form exfiltration", () => {
  const environment = process.env as Record<string, string | undefined>;
  const previousNodeEnv = environment.NODE_ENV;
  let policy: Map<string, string[]>;
  try {
    environment.NODE_ENV = "production";
    policy = directives(buildContentSecurityPolicy("c2VjdXJlLW5uY2U"));
  } finally {
    if (previousNodeEnv === undefined) delete environment.NODE_ENV;
    else environment.NODE_ENV = previousNodeEnv;
  }

  assert.deepEqual(policy.get("form-action"), [
    "'self'",
    "https://checkout.stripe.com",
    "https://billing.stripe.com",
    "https://accounts.google.com",
  ]);
  assert.deepEqual(policy.get("base-uri"), ["'self'"]);
  assert.deepEqual(policy.get("frame-ancestors"), ["'none'"]);
  assert.deepEqual(policy.get("object-src"), ["'none'"]);
  assert.ok(policy.get("script-src")?.includes("'nonce-c2VjdXJlLW5uY2U'"));
  assert.ok(policy.get("script-src")?.includes("https://js.stripe.com"));
  assert.ok(!policy.get("script-src")?.includes("'unsafe-inline'"));
  assert.ok(!policy.get("script-src")?.includes("'unsafe-eval'"));
  assert.ok(policy.get("style-src")?.includes("'unsafe-inline'"));
});

test("Trusted Types remains report-only and the reporting endpoint remains declared", () => {
  assert.match(TRUSTED_TYPES_REPORT_ONLY_POLICY, /^require-trusted-types-for 'script';/);
  assert.match(TRUSTED_TYPES_REPORT_ONLY_POLICY, /trusted-types default/);
  assert.match(TRUSTED_TYPES_REPORT_ONLY_POLICY, /report-to csp-endpoint$/);
  assert.equal(TRUSTED_TYPES_REPORTING_ENDPOINT, 'csp-endpoint="/api/csp-report"');
  assert.doesNotMatch(TRUSTED_TYPES_REPORT_ONLY_POLICY, /Content-Security-Policy:/i);
});
