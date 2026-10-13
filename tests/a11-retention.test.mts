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
  const policy = loadTs<typeof import("../src/lib/privacy-retention.js")>("src/lib/privacy-retention.ts");
  assert.equal(result.attempted, policy.PRIVACY_CLEANUP_TABLES.length);
  assert.equal(result.failed, 1);
  assert.equal(result.deleted, (policy.PRIVACY_CLEANUP_TABLES.length - 1) * 2);
  assert.equal(result.batchSize, 1000);
  assert.equal(result.operations[0]?.table, "leads");
  assert.equal(result.operations[0]?.failed, true);
  assert.equal(result.operations[1]?.deleted, 2);
  assert.ok(queries.every(({ query }) => /LIMIT/i.test(query)));
  assert.ok(queries.every(({ values }) => values.includes(1000)));
  assert.ok(events.includes("privacy.retention.operation_failed"));
  assert.ok(events.includes("privacy.retention.completed"));
  assert.ok(!queries.some(({ query }) => /unsubscribe_suppressions|booster_delivery_suppressions|booster_quota_legacy_usage|public\.reviews|review_replies|review_reply_draft_state|review_reply_usage_reservations|billing_trial_(owner|business)_history|billing_trial_reservations|billing_webhook_events/.test(query)));
});

test("retention policy keeps the approved windows and names preserved histories explicitly", () => {
  const policy = loadTs<typeof import("../src/lib/privacy-retention.js")>("src/lib/privacy-retention.ts");
  assert.deepEqual(JSON.parse(JSON.stringify(policy.PRIVACY_RETENTION_DAYS)), {
    leads: 90,
    feedback: 365,
    publicDemoEvents: 90,
    reviewLinkClicks: 90,
    followupIntegrationEvents: 90,
    followupIntegrationEventKeys: 365,
    contactContent: 90,
    rawDeliveryDiagnostics: 30,
    deliveryEvidence: 365,
    permissionEvidence: 365,
    resolvedOperationEvidence: 365,
    terminatedWorkspace: 90,
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
  assert.equal(policy.PRIVACY_CLEANUP_TABLES.length, policy.PRIVACY_CLEANUP_OPERATIONS.length + 1);
  for (const table of [
    "review_link_clicks", "followup_integration_event_details", "followup_integration_event_keys",
    "followup_messages", "followup_message_diagnostics", "followup_message_evidence", "followup_visit_diagnostics",
    "followup_visits", "booster_delivery_content", "booster_delivery_diagnostics", "booster_delivery_events",
    "booster_delivery_provider_correlations", "privacy_account_deletion_operations",
  ]) assert.ok(policy.PRIVACY_GUARDED_CLEANUP_OPERATIONS.includes(table as never));
});

test("new retention classes default to bounded candidate-only dry run while legacy cleanup remains operational", async () => {
  const seen: Array<{ query: string; values: unknown[] }> = [];
  const policy = loadTs<typeof import("../src/lib/privacy-retention.js")>("src/lib/privacy-retention.ts");
  const service = loadTs<typeof import("../src/lib/privacy-retention-cleanup.js")>("src/lib/privacy-retention-cleanup.ts", { overrides: {
    "@/lib/db/neon": { sql: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      seen.push({ query: strings.join(" "), values });
      return [{ candidates: 2, deleted: 0, changed: 0 }];
    } },
    "@/lib/safe-logger": { safeLogger: { error() {}, info() {} } },
  } });
  const result = await service.runPrivacyRetentionCleanup({ batchSize: 2, now: new Date("2026-10-03T00:00:00.000Z") });
  assert.equal(result.guardedDryRun, true);
  assert.equal(result.dryRun, false);
  assert.equal(result.candidates, seen.length * 2);
  assert.equal(result.deleted, 0);
  for (const item of seen) {
    if (!policy.PRIVACY_GUARDED_CLEANUP_OPERATIONS.some((table) => item.query.includes(`public.${table}`)
      || (table === "followup_integration_event_keys" && item.query.includes("public.followup_integration_events")))) continue;
    assert.ok(item.values.includes(false), `guarded SQL must bind a false mutation gate: ${item.query}`);
  }
});

test("explicit global dry run binds false mutation gates for legacy and guarded classes", async () => {
  const seen: unknown[][] = [];
  const service = loadTs<typeof import("../src/lib/privacy-retention-cleanup.js")>("src/lib/privacy-retention-cleanup.ts", { overrides: {
    "@/lib/db/neon": { sql: async (_strings: TemplateStringsArray, ...values: unknown[]) => { seen.push(values); return [{ candidates: 1, deleted: 0 }]; } },
    "@/lib/safe-logger": { safeLogger: { error() {}, info() {} } },
  } });
  const result = await service.runPrivacyRetentionCleanup({ dryRun: true, maxOperations: 4, batchSize: 1 });
  assert.equal(result.dryRun, true);
  assert.equal(result.deleted, 0);
  assert.ok(seen.every((values) => values.includes(false)));
});

test("explicit dry run reports legacy expirations as candidates, never as deletions", async () => {
  const service = loadTs<typeof import("../src/lib/privacy-retention-cleanup.js")>("src/lib/privacy-retention-cleanup.ts", { overrides: {
    "@/lib/db/neon": { sql: async () => [{ deleted: 0, candidates: 3 }] },
    "@/lib/safe-logger": { safeLogger: { error() {}, info() {} } },
  } });
  const result = await service.runPrivacyRetentionCleanup({ dryRun: true, maxOperations: 1, cursor: 0, batchSize: 10 });
  assert.equal(result.candidates, 3);
  assert.equal(result.deleted, 0);
  assert.equal(result.changed, 0);
  assert.equal(result.affected, 0);
});
