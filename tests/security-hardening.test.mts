import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { decryptToken, encryptToken } from "../src/lib/encrypted-token.ts";
import { getTrustedRequestIp } from "../src/lib/trusted-request-ip.ts";

test("OAuth token encryption round-trips and does not expose plaintext", () => {
  const encrypted = encryptToken("refresh-token-value");
  assert.notEqual(encrypted, "refresh-token-value");
  assert.deepEqual(decryptToken(encrypted), { value: "refresh-token-value", legacy: false });
});

test("trusted IP extraction ignores the spoofable left-most forwarded hop", () => {
  const headers = new Headers({ "x-forwarded-for": "spoofed, proxy, trusted" });
  assert.equal(getTrustedRequestIp(headers), "trusted");
});

test("privacy retention windows are explicit and wired to cleanup", () => {
  const retention = readFileSync("src/lib/privacy-retention.ts", "utf8");
  const route = readFileSync("src/app/api/cron/privacy/route.ts", "utf8");
  assert.match(retention, /leads: 90/);
  assert.match(retention, /feedback: 365/);
  assert.match(retention, /cronRuns: 30/);
  assert.match(route, /followup_integration_events/);
  assert.match(route, /cron_runs/);
});

test("Sentry is configured not to send default PII", () => {
  assert.match(readFileSync("sentry.client.config.ts", "utf8"), /sendDefaultPii: false/);
  assert.match(readFileSync("sentry.server.config.ts", "utf8"), /sendDefaultPii: false/);
  assert.match(readFileSync("sentry.edge.config.ts", "utf8"), /sendDefaultPii: false/);
});

test("CSP nonces cover every Next.js HTML route", () => {
  const proxy = readFileSync("src/proxy.ts", "utf8");
  const layout = readFileSync("src/app/layout.tsx", "utf8");
  const dashboardLayout = readFileSync("src/app/(dashboard)/layout.tsx", "utf8");
  assert.match(proxy, /requestHeaders\.set\("Content-Security-Policy", buildContentSecurityPolicy\(nonce\)\)/);
  assert.match(proxy, /script-src 'self'/);
  assert.doesNotMatch(proxy, /script-src[^\n]*'unsafe-inline'/);
  assert.match(proxy, /https:\/\/\*\.sentry\.io/);
  assert.match(layout, /export const dynamic = "force-dynamic"/);
  assert.match(dashboardLayout, /export const dynamic = "force-dynamic"/);
});

test("published legal pages disclose LocalLift processors consistently", () => {
  const privacy = readFileSync("src/app/privacy/page.tsx", "utf8");
  const terms = readFileSync("src/app/terms/page.tsx", "utf8");

  for (const provider of ["Google", "OpenAI", "Resend", "Stripe", "Sentry", "Neon"]) {
    assert.match(privacy, new RegExp(provider));
    assert.match(terms, new RegExp(provider));
  }
  assert.doesNotMatch(privacy, /Twilio/i);
  assert.doesNotMatch(terms, /Twilio/i);
  assert.match(privacy, /Leads and public demo\s+events are retained for 90 days/);
  assert.match(privacy, /feedback, review-link clicks, and integration events for\s+365 days/);
  assert.match(privacy, /cron history for 30 days/);
  assert.match(privacy, /rate-limit state for 2 days/);
});

test("Trusted Types reporting is wired to a bounded, rate-limited endpoint", () => {
  const config = readFileSync("next.config.ts", "utf8");
  const route = readFileSync("src/app/api/csp-report/route.ts", "utf8");

  assert.match(config, /Reporting-Endpoints/);
  assert.match(config, /csp-endpoint="\/api\/csp-report"/);
  assert.match(config, /require-trusted-types-for 'script'; trusted-types default; report-to csp-endpoint/);
  assert.match(route, /checkPublicWriteRateLimit/);
  assert.match(route, /getTrustedRequestIp/);
  assert.match(route, /safeLogger/);
  assert.match(route, /MAX_BODY_BYTES/);
  assert.match(route, /MAX_REPORTS_PER_REQUEST/);
});
