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

test("CSP nonces are passed to Next.js and Sentry ingest is allowed", () => {
  const proxy = readFileSync("src/proxy.ts", "utf8");
  const layout = readFileSync("src/app/layout.tsx", "utf8");
  assert.match(proxy, /requestHeaders\.set\("Content-Security-Policy", buildContentSecurityPolicy\(nonce\)\)/);
  assert.match(proxy, /https:\/\/\*\.sentry\.io/);
  assert.match(layout, /export const dynamic = "force-dynamic"/);
});
