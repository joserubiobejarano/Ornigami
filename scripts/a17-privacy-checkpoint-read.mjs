import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const EXPECTED_FINGERPRINT = "2f2b3d476ccfbc62744b7891beaa6934e7eb964224ed2682c20abc5d7574259f";
const OUTCOME_TABLES = [
  "leads", "feedback", "public_demo_events", "public_demo_email_challenges", "api_rate_limits",
  "auth_login_attempts", "email_verification_tokens", "review_link_clicks",
  "followup_integration_events", "cron_runs", "password_reset_tokens",
];

/** @typedef {(command: string, args: string[], options: import('node:child_process').SpawnSyncOptionsWithStringEncoding) => import('node:child_process').SpawnSyncReturns<string>} PsqlSpawn */

export function configuredDatabaseFromSource(source) {
  if (Buffer.byteLength(source, "utf8") > 64_000) throw new Error("configuration_source_invalid");
  const values = source.split(/\r?\n/).flatMap((original) => {
    const line = original.trim();
    if (!line || line.startsWith("#")) return [];
    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match || match[1] !== "DATABASE_URL") return [];
    return [match[2].trim().replace(/^("|')(.*)\1$/, "$2").replace(/\s+#.*$/, "").trim()];
  });
  if (values.length !== 1) throw new Error("database_configuration_missing_or_ambiguous");
  const uri = new URL(values[0]);
  if (!/^postgres(?:ql)?:$/.test(uri.protocol)) throw new Error("database_configuration_invalid");
  const normalizedHost = uri.hostname.replace("-pooler", "");
  const databasePath = uri.pathname;
  const fingerprint = createHash("sha256").update(normalizedHost + databasePath).digest("hex");
  if (fingerprint !== EXPECTED_FINGERPRINT) throw new Error("production_database_identity_mismatch");
  return {
    fingerprint,
    host: normalizedHost,
    port: uri.port || "5432",
    database: decodeURIComponent(databasePath.slice(1)),
    username: decodeURIComponent(uri.username),
    password: decodeURIComponent(uri.password),
  };
}

/** @param {string} sql @param {{host: string, port: string, database: string, username: string, password: string}} database @param {string} executable @param {PsqlSpawn} spawn @param {NodeJS.ProcessEnv} inheritedEnv */
function query(sql, database, executable, spawn, inheritedEnv) {
  const env = Object.fromEntries(Object.entries(inheritedEnv).filter(([key]) => !/^PG/i.test(key)));
  Object.assign(env, {
    PGHOST: database.host,
    PGPORT: database.port,
    PGDATABASE: database.database,
    PGUSER: database.username,
    PGPASSWORD: database.password,
    PGSSLMODE: "require",
    PGCONNECT_TIMEOUT: "15",
  });
  const result = spawn(executable, ["-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-f", "-"], {
    env, input: sql, encoding: "utf8", maxBuffer: 1_000_000, timeout: 30_000,
  });
  if (result.status !== 0) throw new Error("read_only_database_observation_failed");
  return JSON.parse(result.stdout.trim());
}

/** @param {{host: string, port: string, database: string, username: string, password: string}} database @param {{executable?: string, spawn?: PsqlSpawn, inheritedEnv?: NodeJS.ProcessEnv}} [options] */
function runReadOnlyQuery(database, { executable, spawn, inheritedEnv = process.env } = {}) {
  const psql = executable || (process.platform === "win32" ? "C:/Program Files/PostgreSQL/17/bin/psql.exe" : "psql");
  const observation = query(buildObservationSql(), database, psql, spawn || /** @type {PsqlSpawn} */ (spawnSync), inheritedEnv);
  if (observation.transactionReadOnly !== true) throw new Error("read_only_transaction_not_confirmed");
  return observation;
}

/** @param {string} sourcePath @param {{executable?: string, spawn?: PsqlSpawn, inheritedEnv?: NodeJS.ProcessEnv}} [options] */
export function observeConfiguredDatabase(sourcePath, options = {}) {
  const database = configuredDatabaseFromSource(readFileSync(sourcePath, "utf8"));
  return { targetIdentityVerified: true, fingerprint: database.fingerprint, ...runReadOnlyQuery(database, options) };
}

/** @param {{host: string, port: string, database: string, username: string, password: string}} database @param {{executable?: string, spawn?: PsqlSpawn, inheritedEnv?: NodeJS.ProcessEnv}} [options] */
export function runReadOnlyQueryForTest(database, options = {}) {
  return runReadOnlyQuery(database, options);
}

export function buildObservationSql() {
  return `BEGIN READ ONLY;
SET LOCAL statement_timeout = '15s';
SELECT json_build_object(
  'transactionReadOnly', current_setting('transaction_read_only') = 'on',
  'observedAt', clock_timestamp(),
  'privacyState', (SELECT json_build_object(
    'lastStartedAt', last_started_at, 'lastFinishedAt', last_finished_at, 'lastSuccessAt', last_success_at,
    'lastStatus', last_status, 'checkpointAt', checkpoint_at, 'heartbeatAt', heartbeat_at,
    'leaseActive', lease_until > clock_timestamp() AND lease_owner_run_id IS NOT NULL,
    'cursorPresent', cursor IS NOT NULL
  ) FROM public.cron_job_state WHERE job_name = 'privacy_retention'),
  'recentRuns', COALESCE((SELECT json_agg(json_build_object(
    'startedAt', started_at, 'finishedAt', finished_at, 'status', status,
    'processedCount', processed_count, 'failedCount', failed_count,
    'outcomeTables', (SELECT count(*) FROM jsonb_object_keys(COALESCE(outcomes, '{}'::jsonb)) AS keys(key) WHERE key = ANY(ARRAY[${OUTCOME_TABLES.map((name) => `'${name}'`).join(",")} ])),
    'completedOutcomeTables', (SELECT count(*) FROM jsonb_each(COALESCE(outcomes, '{}'::jsonb)) AS o(key,value) WHERE key = ANY(ARRAY[${OUTCOME_TABLES.map((name) => `'${name}'`).join(",")} ]) AND value->>'complete' = 'true'),
    'failedOutcomeTables', (SELECT count(*) FROM jsonb_each(COALESCE(outcomes, '{}'::jsonb)) AS o(key,value) WHERE key = ANY(ARRAY[${OUTCOME_TABLES.map((name) => `'${name}'`).join(",")} ]) AND value->>'failed' = 'true')
  ) ORDER BY started_at DESC) FROM (SELECT * FROM public.cron_runs WHERE job_name = 'privacy_retention' ORDER BY started_at DESC LIMIT 10) AS recent), '[]'::json),
  'privacyAlerts', COALESCE((SELECT json_agg(json_build_object(
    'reason', reason, 'active', active, 'firstSeenAt', first_seen_at, 'lastSeenAt', last_seen_at,
    'lastSentAt', last_sent_at, 'resolvedAt', resolved_at, 'transportFailures', transport_failures,
    'lastTransportError', last_transport_error
  ) ORDER BY first_seen_at DESC) FROM public.cron_alert_state WHERE job_name = 'privacy_retention'), '[]'::json)
);
ROLLBACK;`;
}

function main() {
  const sourcePath = process.argv[2];
  if (!sourcePath) throw new Error("usage: node scripts/a17-privacy-checkpoint-read.mjs <explicit-production-env> [psql-executable]");
  const observation = observeConfiguredDatabase(sourcePath, { executable: process.argv[3] });
  process.stdout.write(`${JSON.stringify(observation)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { main(); }
  catch (error) {
    const safe = new Set([
      "usage: node scripts/a17-privacy-checkpoint-read.mjs <explicit-production-env> [psql-executable]",
      "configuration_source_invalid", "database_configuration_missing_or_ambiguous", "database_configuration_invalid",
      "production_database_identity_mismatch", "read_only_database_observation_failed", "read_only_transaction_not_confirmed",
    ]);
    process.stderr.write(`${safe.has(error?.message) ? error.message : "privacy_checkpoint_observation_failed"}\n`);
    process.exitCode = 2;
  }
}
