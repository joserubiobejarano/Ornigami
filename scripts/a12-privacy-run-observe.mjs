import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { neon } from "@neondatabase/serverless";

const MAX_ENV_BYTES = 64_000;

/** @typedef {(strings: TemplateStringsArray, ...values: unknown[]) => {sql: string, values: unknown[]}} ReadOnlyQuery */
/** @typedef {{ transaction: (build: (tx: ReadOnlyQuery) => unknown[], options: { fetchOptions: { signal: AbortSignal } }) => Promise<unknown[][]> }} ObserverDatabase */

function loadConfiguredDatabase(path) {
  const source = readFileSync(path, "utf8");
  if (Buffer.byteLength(source, "utf8") > MAX_ENV_BYTES) throw new Error("configuration_source_invalid");
  let databaseUrl;
  for (const original of source.split(/\r?\n/)) {
    const line = original.trim();
    if (!line || line.startsWith("#")) continue;
    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match || match[1] !== "DATABASE_URL") continue;
    if (databaseUrl !== undefined) throw new Error("configuration_source_invalid");
    databaseUrl = match[2].trim().replace(/^(["'])(.*)\1$/, "$2").replace(/\s+#.*$/, "").trim();
  }
  if (!databaseUrl) throw new Error("database_configuration_missing");
  const parsed = new URL(databaseUrl);
  if (!/^postgres(?:ql)?:$/.test(parsed.protocol)) throw new Error("database_configuration_invalid");
  return databaseUrl;
}

function dateString(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.valueOf()) ? null : date.toISOString();
}

function number(value) { return Number.isFinite(Number(value)) ? Number(value) : 0; }

/** @param {string} databaseUrl @param {{sqlFactory?: (url: string) => ObserverDatabase, signal?: AbortSignal}} [options] */
export async function observePrivacyRun(databaseUrl, { sqlFactory, signal = AbortSignal.timeout(12_000) } = {}) {
  const sql = sqlFactory ? sqlFactory(databaseUrl) : /** @type {ObserverDatabase} */ (/** @type {unknown} */ (neon(databaseUrl)));
  const [, , readOnlyRows, stateRows, runRows, alertRows] = await sql.transaction((tx) => [
    tx`SET TRANSACTION READ ONLY`,
    tx`SET LOCAL statement_timeout = '10000'`,
    tx`SELECT current_setting('transaction_read_only') AS transaction_read_only, clock_timestamp() AS observed_at`,
    tx`SELECT last_started_at, last_finished_at, last_success_at, last_status,
        checkpoint_at, heartbeat_at, lease_until, cursor IS NOT NULL AS cursor_present,
        lease_owner_run_id IS NOT NULL AND lease_until > clock_timestamp() AS lease_active
      FROM public.cron_job_state WHERE job_name = 'privacy_retention'`,
    tx`SELECT started_at, finished_at, status, processed_count, failed_count, outcomes
      FROM public.cron_runs WHERE job_name = 'privacy_retention'
      ORDER BY started_at DESC LIMIT 5`,
    tx`SELECT reason, active, first_seen_at, last_seen_at, last_sent_at,
        transport_failures, last_transport_error
      FROM public.cron_alert_state WHERE job_name = 'privacy_retention' AND active IS TRUE
      ORDER BY first_seen_at DESC LIMIT 10`,
  ], { fetchOptions: { signal } });
  const transaction = readOnlyRows?.[0];
  if (transaction?.transaction_read_only !== "on") throw new Error("read_only_transaction_not_confirmed");
  const state = stateRows?.[0];
  const knownOutcomes = ["leads", "feedback", "public_demo_events", "public_demo_email_challenges", "api_rate_limits", "auth_login_attempts", "email_verification_tokens", "review_link_clicks", "followup_integration_events", "cron_runs", "password_reset_tokens"];
  const recentRuns = (runRows || []).map((row) => {
    const outcomes = row.outcomes && typeof row.outcomes === "object" ? row.outcomes : {};
    return {
      startedAt: dateString(row.started_at),
      finishedAt: dateString(row.finished_at),
      status: row.status,
      processedCount: number(row.processed_count),
      failedCount: number(row.failed_count),
      outcomeTables: knownOutcomes.filter((key) => Object.hasOwn(outcomes, key)).length,
      completedOutcomeTables: knownOutcomes.filter((key) => outcomes[key]?.complete === true).length,
      failedOutcomeTables: knownOutcomes.filter((key) => outcomes[key]?.failed === true).length,
    };
  });
  return {
    observedAt: dateString(transaction.observed_at),
    target: "main-checkout DATABASE_URL; deployment target identity unverified",
    transactionReadOnly: true,
    privacyState: state ? {
      lastStartedAt: dateString(state.last_started_at),
      lastFinishedAt: dateString(state.last_finished_at),
      lastSuccessAt: dateString(state.last_success_at),
      lastStatus: state.last_status,
      checkpointAt: dateString(state.checkpoint_at),
      heartbeatAt: dateString(state.heartbeat_at),
      leaseActive: state.lease_active === true,
      cursorPresent: state.cursor_present === true,
    } : null,
    recentRuns,
    activePrivacyAlerts: (alertRows || []).map((row) => ({
      reason: row.reason,
      firstSeenAt: dateString(row.first_seen_at),
      lastSeenAt: dateString(row.last_seen_at),
      lastSentAt: dateString(row.last_sent_at),
      transportFailures: number(row.transport_failures),
      lastTransportError: row.last_transport_error,
    })),
  };
}

async function main() {
  const source = process.argv[2];
  if (!source) throw new Error("usage: node scripts/a12-privacy-run-observe.mjs <explicit-main-env-local>");
  const output = await observePrivacyRun(loadConfiguredDatabase(source));
  process.stdout.write(`${JSON.stringify(output)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    const safeErrors = new Set(["configuration_source_invalid", "database_configuration_missing", "database_configuration_invalid", "read_only_transaction_not_confirmed"]);
    process.stderr.write(`${safeErrors.has(error?.message) ? error.message : "privacy_observation_failed"}\n`);
    process.exitCode = 2;
  });
}
