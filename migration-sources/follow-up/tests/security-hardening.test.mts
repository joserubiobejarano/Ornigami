import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

test("standalone dashboard and APIs are protected", () => {
  assert.match(read("src/server/auth.ts"), /timingSafeEqual/);
  assert.match(read("src/server/auth.ts"), /FOLLOWUP_ADMIN/);
});

test("webhook and cron routes require separate secrets", () => {
  assert.match(read("src/app/api/webhooks/booking/route.ts"), /isBookingWebhookAuthorized/);
  assert.match(read("src/app/api/cron/send-followups/route.ts"), /isCronRequestAuthorized/);
  assert.match(read("src/app/api/cron/send-followups/route.ts"), /export const GET/);
  assert.match(read("src/app/api/cron/privacy/route.ts"), /isCronRequestAuthorized/);
  assert.match(read("src/app/api/cron/privacy/route.ts"), /export const GET/);
});

test("security headers, privacy cleanup, and no-index policy are present", () => {
  assert.match(read("next.config.ts"), /Strict-Transport-Security/);
  assert.match(read("src/app/robots.ts"), /disallow: "\/"/);
  assert.match(read("src/app/api/cron/privacy/route.ts"), /followup_messages/);
  assert.match(read("src/app/api/privacy/delete/route.ts"), /DELETE MY DATA/);
});
