import assert from "node:assert/strict";
import test from "node:test";
import { observePrivacyRun } from "../scripts/a12-privacy-run-observe.mjs";

test("privacy observer uses a read-only transaction and returns sanitized run evidence", async () => {
  const statements: string[] = [];
  const output = await observePrivacyRun("postgres://observer:secret@db.invalid/app", {
    sqlFactory: () => ({ transaction: async (build, options) => {
      assert.ok(options?.fetchOptions?.signal);
      const result = build((strings, ...values) => {
        const sql = strings.join(" ");
        statements.push(sql);
        return { sql, values };
      });
      const readOnlyStatement = result[0];
      const timeoutStatement = result[1];
      assert.ok(readOnlyStatement && typeof readOnlyStatement === "object" && "sql" in readOnlyStatement);
      assert.ok(timeoutStatement && typeof timeoutStatement === "object" && "sql" in timeoutStatement);
      assert.equal(readOnlyStatement.sql, "SET TRANSACTION READ ONLY");
      assert.match(String(timeoutStatement.sql), /statement_timeout/);
      assert.ok(statements.slice(2).every((sql) => /^SELECT\b/i.test(sql)));
      return [
        [],
        [],
        [{ transaction_read_only: "on", observed_at: "2026-10-03T16:00:00.000Z" }],
        [{ last_started_at: "2026-10-03T03:00:00.000Z", last_finished_at: "2026-10-03T03:00:03.000Z", last_success_at: null, last_status: "partial", checkpoint_at: "2026-10-03T03:00:02.000Z", heartbeat_at: "2026-10-03T03:00:02.000Z", lease_until: null, cursor_present: true, lease_active: false }],
        [{ started_at: "2026-10-03T03:00:00.000Z", finished_at: "2026-10-03T03:00:03.000Z", status: "partial", processed_count: 250, failed_count: 1, outcomes: { leads: { deleted: 10, failed: false, complete: true }, feedback: { deleted: 5, failed: true, complete: false }, secret_table: { email: "private@example.test" } }, error_message: "sensitive raw exception" }],
        [{ reason: "partial", active: true, first_seen_at: "2026-10-03T03:00:03.000Z", last_seen_at: "2026-10-03T03:00:03.000Z", last_sent_at: "2026-10-03T03:00:03.000Z", transport_failures: 0, last_transport_error: null, alert_key: "private-alert-key" }],
      ];
    } }),
  });

  assert.equal(output.transactionReadOnly, true);
  assert.equal(output.target, "main-checkout DATABASE_URL; deployment target identity unverified");
  assert.deepEqual(output.privacyState, {
    lastStartedAt: "2026-10-03T03:00:00.000Z",
    lastFinishedAt: "2026-10-03T03:00:03.000Z",
    lastSuccessAt: null,
    lastStatus: "partial",
    checkpointAt: "2026-10-03T03:00:02.000Z",
    heartbeatAt: "2026-10-03T03:00:02.000Z",
    leaseActive: false,
    cursorPresent: true,
  });
  assert.equal(output.recentRuns[0]?.outcomeTables, 2);
  assert.equal(output.recentRuns[0]?.completedOutcomeTables, 1);
  assert.equal(output.recentRuns[0]?.failedOutcomeTables, 1);
  assert.deepEqual(output.activePrivacyAlerts, [{ reason: "partial", firstSeenAt: "2026-10-03T03:00:03.000Z", lastSeenAt: "2026-10-03T03:00:03.000Z", lastSentAt: "2026-10-03T03:00:03.000Z", transportFailures: 0, lastTransportError: null }]);
  assert.doesNotMatch(JSON.stringify(output), /secret|private@example|sensitive raw|alert-key/);
});

test("privacy observer fails closed when PostgreSQL does not confirm read-only mode", async () => {
  await assert.rejects(() => observePrivacyRun("postgres://observer:secret@db.invalid/app", {
    sqlFactory: () => ({ transaction: async () => [[], [], [{ transaction_read_only: "off", observed_at: "2026-10-03T16:00:00.000Z" }], [], [], []] }),
  }), /read_only_transaction_not_confirmed/);
});
