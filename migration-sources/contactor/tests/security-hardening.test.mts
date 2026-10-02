import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

test("admin routes have middleware and layout defense in depth", () => {
  assert.match(read("src/proxy.ts"), /getInternalAdminDashboardSessionFromRequest/);
  assert.match(read("src/app/admin/layout.tsx"), /getInternalAdminDashboardSession/);
  assert.match(read("src/server/auth/internal-admin.ts"), /internal admin session is required/);
});

test("security headers and redacted logging are present", () => {
  assert.match(read("next.config.ts"), /Content-Security-Policy/);
  assert.match(read("next.config.ts"), /Strict-Transport-Security/);
  assert.match(read("src/lib/safe-logger.ts"), /password|authorization|cookie/);
});

test("privacy retention windows are centralized and used by cleanup", () => {
  assert.match(read("src/server/privacy-retention.ts"), /operationalRecords: 365/);
  assert.match(read("src/server/privacy-retention.ts"), /rateLimitState: 2/);
  assert.match(read("src/app/api/cron/privacy/route.ts"), /PRIVACY_RETENTION_DAYS/);
});
