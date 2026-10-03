import assert from "node:assert/strict";
import test from "node:test";

import { loadTs } from "./auth-test-harness.mts";

test("retention cleanup is bounded, per-table observable, and continues after a recoverable failure", async () => {
  const queries: Array<{ query: string; values: unknown[] }> = [];
  const events: string[] = [];
  const service = loadTs<typeof import("../src/lib/privacy-retention-cleanup.js")>("src/lib/privacy-retention-cleanup.ts", { overrides: {
    "@/lib/db/neon": { sql: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const query = strings.join(" ");
      queries.push({ query, values });
      if (query.includes("public.leads")) throw new Error("transient database error");
      return [{ deleted: 2 }];
    } },
    "@/lib/safe-logger": { safeLogger: {
      error: (event: string) => events.push(event),
      info: (event: string) => events.push(event),
    } },
  } });

  const result = await service.runPrivacyRetentionCleanup({ batchSize: 5000, now: new Date("2026-10-03T00:00:00.000Z") });
  assert.equal(result.attempted, 11);
  assert.equal(result.failed, 1);
  assert.equal(result.deleted, 20);
  assert.equal(result.batchSize, 1000);
  assert.equal(result.operations[0]?.table, "leads");
  assert.equal(result.operations[0]?.failed, true);
  assert.equal(result.operations[1]?.deleted, 2);
  assert.ok(queries.every(({ query }) => /LIMIT/i.test(query)));
  assert.ok(queries.every(({ values }) => values.includes(1000)));
  assert.ok(events.includes("privacy.retention.operation_failed"));
  assert.ok(events.includes("privacy.retention.completed"));
  assert.ok(!queries.some(({ query }) => /followup_visits|followup_messages|booster_followup_deliveries|booster_quota_legacy_usage|public\.reviews|review_replies|review_reply_draft_state|review_reply_usage_reservations|followup_unsubscribes|billing_trial_(owner|business)_history|privacy_account_deletion_operations/.test(query)));
});

test("retention policy keeps the approved windows and names preserved histories explicitly", () => {
  const policy = loadTs<typeof import("../src/lib/privacy-retention.js")>("src/lib/privacy-retention.ts");
  assert.deepEqual(JSON.parse(JSON.stringify(policy.PRIVACY_RETENTION_DAYS)), {
    leads: 90,
    feedback: 365,
    publicDemoEvents: 90,
    reviewLinkClicks: 365,
    followupIntegrationEvents: 365,
    cronRuns: 30,
    rateLimitState: 2,
  });
  for (const history of [
    "followup_visits", "followup_messages", "reviews", "review_replies",
    "booster_followup_deliveries", "booster_quota_legacy_usage",
    "review_reply_draft_state", "review_reply_usage_reservations",
    "billing_checkout_intents", "billing_webhook_events", "billing_trial_owner_history",
    "billing_trial_business_history", "team_invitations", "unsubscribe_suppressions",
    "billing_trial_reservations", "billing_customer_provisioning", "billing_reconciliation_leases",
    "privacy_account_deletion_operations",
    "booster_booking_credentials",
    "privacy_reply_post_outcomes",
  ]) assert.ok(policy.PRIVACY_PRESERVED_HISTORY_CLASSES.includes(history as never));
  assert.equal(policy.PRIVACY_CLEANUP_OPERATIONS.length, 10);
  assert.equal(policy.PRIVACY_CLEANUP_TABLES.length, 11);
});
