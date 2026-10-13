import assert from "node:assert/strict";
import test from "node:test";

import { decryptToken, encryptToken } from "../src/lib/encrypted-token.ts";
import { getTrustedRequestIp } from "../src/lib/trusted-request-ip.ts";
import {
  CSP_REPORT_POLICY,
  extractCspReports,
  normalizeCspReport,
} from "../src/lib/csp-report-policy.ts";
import {
  TRUSTED_TYPES_REPORT_ONLY_POLICY,
  TRUSTED_TYPES_REPORTING_ENDPOINT,
  buildContentSecurityPolicy,
} from "../src/lib/security-headers.ts";
import { SENTRY_OPTIONS } from "../src/lib/sentry-options.ts";
import {
  PRIVACY_CLEANUP_OPERATIONS,
  PRIVACY_PRESERVED_HISTORY_CLASSES,
  PRIVACY_RETENTION_DAYS,
  dateDaysAgo,
} from "../src/lib/privacy-retention.ts";
import {
  LEGAL_PROCESSOR_LIST,
  LEGAL_PROCESSORS,
} from "../src/lib/legal-processors.ts";

test("OAuth token encryption round-trips and does not expose plaintext", () => {
  const encrypted = encryptToken("refresh-token-value");
  assert.notEqual(encrypted, "refresh-token-value");
  assert.deepEqual(decryptToken(encrypted), { value: "refresh-token-value", legacy: false });
});

test("trusted IP extraction ignores the spoofable left-most forwarded hop", () => {
  const headers = new Headers({ "x-forwarded-for": "spoofed, proxy, trusted" });
  assert.equal(getTrustedRequestIp(headers), "trusted");
});

test("privacy retention policy exposes bounded windows and cleanup operations", () => {
  assert.equal(PRIVACY_RETENTION_DAYS.leads, 90);
  assert.equal(PRIVACY_RETENTION_DAYS.feedback, 365);
  assert.equal(PRIVACY_RETENTION_DAYS.publicDemoEvents, 90);
  assert.equal(PRIVACY_RETENTION_DAYS.reviewLinkClicks, 90);
  assert.equal(PRIVACY_RETENTION_DAYS.followupIntegrationEvents, 90);
  assert.equal(PRIVACY_RETENTION_DAYS.followupIntegrationEventKeys, 365);
  assert.equal(PRIVACY_RETENTION_DAYS.permissionEvidence, 365);
  assert.equal(PRIVACY_RETENTION_DAYS.deliveryEvidence, 365);
  assert.equal(PRIVACY_RETENTION_DAYS.cronRuns, 30);
  assert.ok(PRIVACY_CLEANUP_OPERATIONS.includes("followup_integration_event_details"));
  assert.ok(PRIVACY_CLEANUP_OPERATIONS.includes("followup_integration_event_keys"));
  assert.ok(PRIVACY_CLEANUP_OPERATIONS.includes("followup_visits"));
  assert.ok(PRIVACY_CLEANUP_OPERATIONS.includes("cron_runs"));
  assert.ok(PRIVACY_PRESERVED_HISTORY_CLASSES.includes("unsubscribe_suppressions"));
  assert.ok(PRIVACY_PRESERVED_HISTORY_CLASSES.includes("billing_trial_business_history"));
  assert.ok(PRIVACY_PRESERVED_HISTORY_CLASSES.includes("billing_trial_owner_history"));
  const cleanupOperations = PRIVACY_CLEANUP_OPERATIONS as readonly string[];
  assert.equal(cleanupOperations.includes("unsubscribe_suppressions"), false);
  assert.equal(cleanupOperations.includes("billing_trial_business_history"), false);
  assert.equal(cleanupOperations.includes("billing_trial_owner_history"), false);
  const now = Date.parse("2026-08-14T12:00:00.000Z");
  assert.equal(dateDaysAgo(PRIVACY_RETENTION_DAYS.leads, now).toISOString(), "2026-05-16T12:00:00.000Z");
});

test("Sentry configuration disables default PII", () => {
  assert.deepEqual(SENTRY_OPTIONS, { sendDefaultPii: false });
});

test("CSP builder binds nonces and keeps script policy strict", () => {
  const csp = buildContentSecurityPolicy("test-nonce");
  assert.match(csp, /script-src 'self' 'nonce-test-nonce'/);
  assert.doesNotMatch(csp, /script-src[^;]*'unsafe-inline'/);
  assert.match(csp, /https:\/\/\*\.sentry\.io/);
  assert.match(csp, /object-src 'none'/);
  assert.equal(TRUSTED_TYPES_REPORTING_ENDPOINT, 'csp-endpoint="/api/csp-report"');
  assert.match(TRUSTED_TYPES_REPORT_ONLY_POLICY, /require-trusted-types-for 'script'/);
});

test("legal processor disclosures use the approved provider list", () => {
  assert.deepEqual(LEGAL_PROCESSORS, ["Google", "OpenAI", "Resend", "Stripe", "Sentry", "Neon"]);
  assert.equal(LEGAL_PROCESSOR_LIST, "Google, OpenAI, Resend, Stripe, Sentry, Neon");
  assert.doesNotMatch(LEGAL_PROCESSOR_LIST, /Twilio/i);
});

test("CSP reports are bounded, normalized, and safe to log", () => {
  assert.equal(CSP_REPORT_POLICY.maxBodyBytes, 16_384);
  assert.equal(CSP_REPORT_POLICY.maxReportsPerRequest, 5);
  assert.equal(CSP_REPORT_POLICY.maxFieldLength, 500);
  assert.equal(CSP_REPORT_POLICY.rateLimit, 30);

  const reports = extractCspReports(
    Array.from({ length: 8 }, (_, index) => ({ body: { reportId: index, violatedDirective: "script-src" } }))
  );
  assert.equal(reports.length, 5);
  assert.deepEqual(extractCspReports({ "csp-report": { "violated-directive": "script-src" } }), [{ "violated-directive": "script-src" }]);
  assert.deepEqual(extractCspReports(null), []);

  assert.deepEqual(
    normalizeCspReport({
      documentURL: "https://example.com/path?secret=query",
      blockedURL: "https://blocked.example/resource.js?secret=query",
      sourceFile: "not-a-url",
      effectiveDirective: " script-src ",
      statusCode: 403,
      lineNumber: Number.POSITIVE_INFINITY,
    }),
    {
      documentScheme: "https",
      blockedScheme: "https",
      sourceScheme: "unparseable",
      effectiveDirective: "script-src",
      violatedDirective: undefined,
      disposition: undefined,
      statusCode: 403,
      lineNumber: undefined,
      columnNumber: undefined,
    }
  );
});
