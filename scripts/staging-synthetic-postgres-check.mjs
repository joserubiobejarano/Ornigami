import { spawnSync } from "node:child_process";
import { createServer } from "node:net";
import { randomBytes } from "node:crypto";
import {
  existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { validateSyntheticStagingFixture } from "./staging-synthetic-fixture-core.mjs";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATIONS_DIR = join(REPO, "neon", "migrations");
const FIXTURE_PATH = join(REPO, "neon", "fixtures", "ornigami-staging-synthetic.sql");
const DEFAULT_PG_BIN = process.platform === "win32"
  ? "C:/Program Files/PostgreSQL/17/bin"
  : null;
const PG_BIN = resolve(readPgBinArg() ?? DEFAULT_PG_BIN ?? "");
const RISK_TABLES = [
  "gbp_connections", "gbp_locations", "business_google_locations", "user_billing", "subscriptions",
  "business_agents", "automation_prefs", "booster_booking_credentials", "followup_visits", "followup_messages",
  "followup_integration_events", "booster_followup_deliveries", "booster_delivery_provider_correlations",
  "booster_delivery_events", "booster_delivery_suppressions", "review_replies",
  "review_reply_draft_state", "review_reply_usage_reservations", "cron_job_state", "cron_unit_state",
];
const INTEGRATION_TABLES = new Set([
  "gbp_connections", "gbp_locations", "business_google_locations", "user_billing", "subscriptions",
  "business_agents", "booster_booking_credentials",
]);
const QUEUE_TABLES = new Set([
  "followup_visits", "followup_messages", "followup_integration_events", "booster_followup_deliveries",
  "review_replies", "review_reply_draft_state", "review_reply_usage_reservations",
]);

function readPgBinArg() {
  const index = process.argv.indexOf("--pg-bin");
  return index < 0 ? undefined : process.argv[index + 1];
}

function minimalEnv(extra = {}) {
  const env = {};
  for (const key of ["PATH", "SystemRoot", "WINDIR", "ComSpec", "TEMP", "TMP"]) {
    if (process.env[key]) env[key] = process.env[key];
  }
  return {
    ...env,
    PGCLIENTENCODING: "UTF8",
    PGCONNECT_TIMEOUT: "5",
    PGSERVICEFILE: join(tmpRoot ?? tmpdir(), "no-pg-service.conf"),
    PGPASSFILE: join(tmpRoot ?? tmpdir(), "no-pgpass"),
    ...extra,
  };
}

let tmpRoot;
let dataDir;
let port;
let role;
let database;
let password;
let serverStartAttempted = false;
let cleanupComplete = false;
let phase = "startup";

function exe(name) {
  const filename = process.platform === "win32" ? `${name}.exe` : name;
  return join(PG_BIN, filename);
}

function run(name, args, { input, timeout = 60_000, env = {}, stdio = "pipe" } = {}) {
  const result = spawnSync(exe(name), args, {
    cwd: REPO,
    encoding: "utf8",
    windowsHide: true,
    timeout,
    input,
    stdio,
    env: minimalEnv(env),
  });
  if (result.error || result.status !== 0) {
    const detail = String(result.stderr ?? result.stdout ?? "").trim().slice(-1800);
    const processError = result.error ? ` ${result.error.code ?? "spawn error"}: ${result.error.message}` : "";
    throw new Error(`${name} failed (status ${result.status ?? "null"}${result.signal ? `, signal ${result.signal}` : ""})${processError}${detail ? `: ${detail}` : ""}`);
  }
  return String(result.stdout ?? "").trim();
}

function psqlArgs(db) {
  return ["-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-h", "127.0.0.1", "-p", String(port), "-U", role, "-d", db];
}

function psql(db, sql) {
  return run("psql", [...psqlArgs(db), "-f", "-"], { input: sql, env: { PGPASSWORD: password } });
}

async function availablePort() {
  const server = createServer();
  await new Promise((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("could not reserve a loopback port");
  const selected = address.port;
  await new Promise((resolveClose, reject) => server.close((error) => error ? reject(error) : resolveClose()));
  return selected;
}

function migrationFiles() {
  const files = readdirSync(MIGRATIONS_DIR).filter((name) => /^\d{3}_[a-z0-9_-]+\.sql$/i.test(name));
  files.sort((left, right) => Number(left.slice(0, 3)) - Number(right.slice(0, 3)));
  if (!files.length || new Set(files.map((name) => name.slice(0, 3))).size !== files.length) {
    throw new Error("canonical migration filenames are missing or have duplicate numeric prefixes");
  }
  return files;
}

function assertLocalIdentity(identity, expectedDatabase) {
  const expectedPath = resolve(dataDir).toLowerCase();
  const actualPath = resolve(identity.dataDirectory).toLowerCase();
  if (identity.database !== expectedDatabase || identity.serverAddress !== "127.0.0.1"
      || Number(identity.serverPort) !== port || actualPath !== expectedPath
      || identity.listenAddresses !== "127.0.0.1") {
    throw new Error(`local PostgreSQL identity check failed; migrations were not started (databaseMatch=${identity.database === expectedDatabase}, serverAddress=${identity.serverAddress}, portMatch=${Number(identity.serverPort) === port}, dataDirectoryMatch=${actualPath === expectedPath}, loopbackBind=${identity.listenAddresses === "127.0.0.1"})`);
  }
}

function identityQuery(db) {
  return JSON.parse(psql(db, `SELECT json_build_object(
    'database', current_database(),
    'serverAddress', host(inet_server_addr()),
    'serverPort', inet_server_port(),
    'dataDirectory', current_setting('data_directory'),
    'listenAddresses', current_setting('listen_addresses'),
    'serverVersion', current_setting('server_version')
  )::text;`));
}

function countTables(db, tables) {
  const present = JSON.parse(psql(db, `SELECT COALESCE(json_agg(table_name ORDER BY table_name), '[]'::json)::text
    FROM information_schema.tables
    WHERE table_schema='public' AND table_type='BASE TABLE'
      AND table_name = ANY(ARRAY[${tables.map((table) => `'${table}'`).join(",")}]);`));
  const result = {};
  for (const table of present) {
    if (!/^[a-z_][a-z0-9_]*$/.test(table) || !tables.includes(table)) throw new Error("unexpected table name in local catalog result");
    result[table] = Number(psql(db, `SELECT count(*) FROM public.${table};`));
  }
  for (const table of tables) if (!(table in result)) result[table] = null;
  return result;
}

function fixtureTableCounts(db) {
  return JSON.parse(psql(db, `SELECT json_build_object(
    'users', (SELECT count(*) FROM public.users),
    'profiles', (SELECT count(*) FROM public.profiles),
    'businesses', (SELECT count(*) FROM public.businesses),
    'business_members', (SELECT count(*) FROM public.business_members),
    'reviews', (SELECT count(*) FROM public.reviews)
  )::text;`));
}

function activeCronJobs(db) {
  const cronJobTable = psql(db, "SELECT COALESCE(to_regclass('cron.job')::text, '');");
  return cronJobTable ? Number(psql(db, "SELECT count(*) FROM cron.job WHERE active IS TRUE;")) : 0;
}

function verifySeed(db, migrationBaseline, after, riskBefore, riskAfter) {
  const fixture = JSON.parse(psql(db, `SELECT json_build_object(
    'owner', (SELECT count(*) FROM public.users
      WHERE id='6f3a17d2-8ce1-4b51-9c6a-4d3c2b1a0001'
        AND email='preview.owner@ornigami.example.test'
        AND name='Example Preview Owner' AND password_hash IS NULL AND email_verified IS NULL),
    'profile', (SELECT count(*) FROM public.profiles WHERE id='6f3a17d2-8ce1-4b51-9c6a-4d3c2b1a0001' AND business_name='Example Studio 001'),
    'business', (SELECT count(*) FROM public.businesses
      WHERE id='6f3a17d2-8ce1-4b51-9c6a-4d3c2b1a0002'
        AND owner_user_id='6f3a17d2-8ce1-4b51-9c6a-4d3c2b1a0001'
        AND website='https://studio-001.example.test'
        AND google_review_url IS NULL AND rebooking_url IS NULL AND email_from_name IS NULL
        AND stripe_customer_id IS NULL),
    'membership', (SELECT count(*) FROM public.business_members
      WHERE business_id='6f3a17d2-8ce1-4b51-9c6a-4d3c2b1a0002'
        AND user_id='6f3a17d2-8ce1-4b51-9c6a-4d3c2b1a0001' AND role='owner'),
    'review', (SELECT count(*) FROM public.reviews
      WHERE user_id='6f3a17d2-8ce1-4b51-9c6a-4d3c2b1a0001'
        AND business_id='6f3a17d2-8ce1-4b51-9c6a-4d3c2b1a0002'
        AND google_review_id='synthetic-review-0001'
        AND reviewer_name='Example Reviewer 001' AND status='new'
        AND comment='This is fictional feedback for the private Preview display only.'),
    'activeAgents', (SELECT count(*) FROM public.business_agents WHERE status='active')
  )::text;`));
  const activeSchedules = activeCronJobs(db);
  if (Object.entries(fixture).some(([key, value]) => key !== "activeAgents" && value !== 1)
      || fixture.activeAgents !== 0 || activeSchedules !== 0) {
    throw new Error("synthetic row, ownership, login-credential, integration-reference, or active-agent verification failed");
  }
  for (const [table, initialCount] of Object.entries(migrationBaseline)) {
    if (after[table] !== initialCount + 1) throw new Error(`fixture count delta mismatch for ${table}`);
  }
  for (const table of RISK_TABLES) {
    if (riskAfter[table] !== riskBefore[table]) throw new Error(`fixture changed integration, agent, queue, or job-state table ${table}`);
  }
  return { ...fixture, activeSchedules };
}

function ensureOwnedTempPath() {
  const tempRoot = resolve(tmpdir());
  if (!tempRoot || !isAbsolute(tempRoot)) throw new Error("system temporary root could not be validated");
  tmpRoot = mkdtempSync(join(tempRoot, "ornigami-b6m-"));
  const resolvedRoot = realpathSync(tmpRoot);
  if (resolvedRoot !== resolve(tmpRoot) || dirname(resolvedRoot) !== tempRootParent()) {
    throw new Error("temporary cluster path identity check failed");
  }
  dataDir = join(tmpRoot, "data");
  mkdirSync(dataDir);
}

function tempRootParent() {
  return resolve(tmpdir());
}

function removeOwnedTempPath() {
  if (!tmpRoot || !existsSync(tmpRoot)) return true;
  const resolved = realpathSync(tmpRoot);
  if (resolved !== resolve(tmpRoot) || dirname(resolved) !== tempRootParent()
      || !resolved.split(sep).at(-1)?.startsWith("ornigami-b6m-")) return false;
  rmSync(resolved, { recursive: true, force: false });
  return !existsSync(resolved);
}

function cleanup() {
  if (!tmpRoot) return true;
  if (serverStartAttempted && existsSync(dataDir)) {
    try {
      run("pg_ctl", ["-D", dataDir, "-m", "fast", "-w", "stop"], { timeout: 30_000 });
    } catch (stopError) {
      try {
        run("pg_ctl", ["-D", dataDir, "status"], { timeout: 10_000 });
        console.error(`CLEANUP_UNPROVED: local PostgreSQL may still be running; private temp path retained: ${tmpRoot}`);
        return false;
      } catch {
        if (existsSync(join(dataDir, "postmaster.pid"))) {
          console.error(`CLEANUP_UNPROVED: postmaster.pid remains; private temp path retained: ${tmpRoot}`);
          return false;
        }
      }
    }
  }
  try {
    cleanupComplete = removeOwnedTempPath();
    if (cleanupComplete) console.log("Cleanup: own PostgreSQL cluster stopped and unique temporary directory removed.");
    else console.error(`CLEANUP_UNPROVED: own temporary path could not be safely removed: ${tmpRoot}`);
    return cleanupComplete;
  } catch {
    console.error(`CLEANUP_UNPROVED: own temporary path could not be removed: ${tmpRoot}`);
    return false;
  }
}

function requireBinaries() {
  if (!isAbsolutePath(PG_BIN)) throw new Error("PostgreSQL binary directory must be an absolute local path");
  for (const name of ["initdb", "pg_ctl", "createdb", "psql", "postgres", "pg_config"]) {
    if (!existsSync(exe(name))) throw new Error(`local PostgreSQL prerequisite unavailable: ${exe(name)}`);
  }
  return {
    postgres: run("postgres", ["--version"]),
    psql: run("psql", ["--version"]),
    pgConfig: run("pg_config", ["--version"]),
  };
}

function isAbsolutePath(value) {
  return Boolean(value && resolve(value) === value);
}

async function main() {
  let failure;
  try {
    const versions = requireBinaries();
    const files = migrationFiles();
    ensureOwnedTempPath();
    const suffix = randomBytes(6).toString("hex");
    database = `ornigami_b6m_${suffix}`;
    role = `ornigami_b6m_${suffix}`;
    password = randomBytes(32).toString("base64url");
    const passwordFile = join(tmpRoot, "initdb-password.txt");
    writeFileSync(passwordFile, `${password}\n`, { mode: 0o600, flag: "wx" });
    port = await availablePort();

    phase = "initdb";
    run("initdb", ["-D", dataDir, "-U", role, "--pwfile", passwordFile, "--auth-local=scram-sha-256", "--auth-host=scram-sha-256", "--no-locale", "--encoding=UTF8"], { timeout: 120_000 });
    rmSync(passwordFile);
    writeFileSync(join(dataDir, "postgresql.conf"), "\nlisten_addresses = '127.0.0.1'\nunix_socket_directories = ''\nlog_statement = 'none'\nlog_min_error_statement = 'panic'\nlog_parameter_max_length_on_error = 0\n", { flag: "a" });
    serverStartAttempted = true;
    phase = "start-local-postgres";
    run("pg_ctl", ["-D", dataDir, "-l", join(tmpRoot, "postgres.log"), "-o", `-h 127.0.0.1 -p ${port} -F`, "-w", "start"], { timeout: 60_000, stdio: "ignore" });
    phase = "verify-local-postgres-process";
    run("pg_ctl", ["-D", dataDir, "status"]);

    phase = "verify-local-postgres-identity-before-database-create";
    const serverIdentity = identityQuery("postgres");
    assertLocalIdentity(serverIdentity, "postgres");
    phase = "create-unique-local-database";
    run("createdb", ["-h", "127.0.0.1", "-p", String(port), "-U", role, "-O", role, database], { env: { PGPASSWORD: password } });
    phase = "verify-local-target-before-migrations";
    const databaseIdentity = identityQuery(database);
    assertLocalIdentity(databaseIdentity, database);

    phase = "confirm-new-database-has-no-public-fixture-or-risk-tables";
    const beforeMigrations = countTables(database, ["users", "profiles", "businesses", "business_members", "reviews", ...RISK_TABLES]);
    if (Object.values(beforeMigrations).some((count) => count !== null)) {
      throw new Error("new local target unexpectedly contains public application tables before migrations");
    }
    for (const filename of files) {
      phase = `apply-migration-${filename}`;
      const migration = readFileSync(join(MIGRATIONS_DIR, filename), "utf8");
      try {
        psql(database, migration);
      } catch (error) {
        throw new Error(`MIGRATION_FAILURE ${filename}: ${error instanceof Error ? error.message : "unknown local psql error"}`);
      }
    }

    const fixtureSql = readFileSync(FIXTURE_PATH, "utf8");
    phase = "run-offline-fixture-validator";
    const validation = validateSyntheticStagingFixture(fixtureSql, files.map((file) => readFileSync(join(MIGRATIONS_DIR, file), "utf8")));
    if (!validation.ok) throw new Error(`offline fixture validator failed: ${validation.errors.join("; ")}`);
    const migrationBaseline = fixtureTableCounts(database);
    const riskAfterMigrations = countTables(database, RISK_TABLES);
    phase = "execute-synthetic-fixture";
    psql(database, fixtureSql);
    phase = "verify-fixture-and-isolation";
    const afterFixture = fixtureTableCounts(database);
    const riskAfterFixture = countTables(database, RISK_TABLES);
    const seedCheck = verifySeed(database, migrationBaseline, afterFixture, riskAfterMigrations, riskAfterFixture);

    console.log(JSON.stringify({
      result: "PASS",
      postgres: versions.postgres,
      psql: versions.psql,
      pgConfig: versions.pgConfig,
      migrationFilesApplied: files.length,
      destination: { host: "127.0.0.1", port: "unique ephemeral loopback port", database: "unique generated local database (name omitted)", clusterPath: "temporary local cluster (path omitted)" },
      targetIdentityVerifiedBeforeMigrations: true,
      fixtureValidator: "pass",
      publicApplicationTablesBeforeMigrations: "none",
      countsAfterMigrationsBeforeFixture: migrationBaseline,
      countsAfterFixture: afterFixture,
      integrationAgentQueueJobCountsBeforeFixture: riskAfterMigrations,
      integrationAgentQueueJobCountsAfterFixture: riskAfterFixture,
      syntheticChecks: seedCheck,
      loginCredential: "password_hash and email_verified are NULL; no usable login credential",
      credentialsPrinted: false,
    }, null, 2));
  } catch (error) {
    failure = `${phase}: ${error instanceof Error ? error.message : String(error)}`;
  }
  const cleanupOk = cleanup();
  password = undefined;
  if (failure) {
    console.error(`FAIL: ${failure}`);
    if (!tmpRoot) console.error("No disposable cluster was created.");
    else if (cleanupOk) console.error("Cleanup verified for this block's unique temporary cluster.");
    process.exitCode = 1;
  } else if (!cleanupOk || !cleanupComplete) {
    console.error("FAIL: verification completed but cleanup is unproved.");
    process.exitCode = 1;
  }
}

await main();
