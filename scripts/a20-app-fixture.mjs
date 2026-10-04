import { spawn, spawnSync } from "node:child_process";
import { createCipheriv, createHash, randomBytes } from "node:crypto";
import { createServer } from "node:net";
import {
  appendFileSync, chmodSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync,
  realpathSync, rmSync, statSync, writeFileSync,
} from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { baseA20ChildEnv, isExpectedA20App, resolveFixturePath, validateA20Marker } from "./a20-app-fixture-core.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURE = resolve(ROOT, ".a20-fixture");
const PG_ROOT = resolve(FIXTURE, "postgres");
const DATA = resolve(PG_ROOT, "data");
const MARKER = resolve(FIXTURE, "marker.json");
const CREDENTIALS = resolve(FIXTURE, "credentials.json");
const RUNTIME = resolve(FIXTURE, "runtime.json");
const OUT = resolve(FIXTURE, "output.log");
const POSTGRES_BIN = process.env.A20_PG_BIN ?? "C:/Program Files/PostgreSQL/17/bin";
const PG_DATABASE = "a20_browser_fixture";
const DB_APP_URL = "postgresql://a20_fixture:a20_fixture@ep-a20-fixture.neon.tech/a20_fixture?sslmode=require";
const PG_PORT_FILE = resolve(PG_ROOT, "port.json");
const BASE_COMMIT = "f0bb5e9e75a88bffcdbcce682e0b416566d3f02d";
const ACTORS = {
  owner: { id: "a2000000-0000-4000-8000-000000000001", email: "owner@a20.example.test", name: "A20 Workspace Owner" },
  member: { id: "a2000000-0000-4000-8000-000000000002", email: "member@a20.example.test", name: "A20 Workspace Member" },
  outsider: { id: "a2000000-0000-4000-8000-000000000004", email: "outsider@a20.example.test", name: "A20 Unrelated Owner" },
};
const IDS = {
  business: "a2000000-0000-4000-8000-000000000003",
  outsiderBusiness: "a2000000-0000-4000-8000-000000000005",
  review: "a20-authenticated-browser-review",
};

function die(message) { console.error(`A20 fixture: ${message}`); process.exit(1); }
function pgExe(name) {
  if (process.platform === "win32") return join(POSTGRES_BIN, `${name}.exe`);
  return process.env.A20_PG_BIN ? join(process.env.A20_PG_BIN, name) : name;
}
function ensureWithinFixture(path) {
  return resolveFixturePath(FIXTURE, path);
}
function privateWrite(path, value) {
  ensureWithinFixture(path);
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  if (process.platform !== "win32") chmodSync(path, 0o600);
}
function pgEnv() {
  const keys = ["PATH", "SystemRoot", "ComSpec", "TEMP", "TMP", "WINDIR"];
  const env = Object.fromEntries(keys.filter((key) => process.env[key]).map((key) => [key, process.env[key]]));
  return { ...env, PGCLIENTENCODING: "UTF8", PGSERVICEFILE: resolve(FIXTURE, "no-pg-service.conf"), PGPASSFILE: resolve(FIXTURE, "no-pgpass") };
}
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: ROOT, encoding: "utf8", windowsHide: true, timeout: 60_000, env: pgEnv(), ...options });
  if (result.error || result.status !== 0) {
    const detail = String(result.stderr ?? "");
    if (detail && existsSync(FIXTURE)) appendFileSync(join(FIXTURE, "process-error.log"), detail, { mode: 0o600 });
    throw new Error(`${command} failed (${result.status ?? "spawn error"}); details, if any, are in the ignored private fixture log`);
  }
  return String(result.stdout ?? "").trim();
}
function psqlArgs(port, db = "postgres") {
  return ["-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-h", "127.0.0.1", "-p", String(port), "-U", "postgres", "-d", db];
}
function psql(port, sql, db = "postgres") {
  return run(pgExe("psql"), [...psqlArgs(port, db), "-f", "-"], { input: sql });
}
function sqlQuote(input) { return `'${String(input).replaceAll("'", "''")}'`; }
function checkNoSharedEnvFiles() {
  const forbidden = [".env", ".env.local", ".env.production", ".env.production.local", ".env.development", ".env.development.local"];
  const found = forbidden.filter((name) => existsSync(join(ROOT, name)));
  if (found.length) throw new Error(`Next.js env-file loading must be disabled; found ${found.join(", ")}`);
}
function childBaseEnv(appPort, preload) {
  return {
    ...baseA20ChildEnv(process.env, { appPort, preload }),
    NEXT_PUBLIC_APP_URL: `http://127.0.0.1:${appPort}`,
    AUTH_URL: `http://127.0.0.1:${appPort}`,
    NEXTAUTH_URL: `http://127.0.0.1:${appPort}`,
    AUTH_SECRET: "a20-local-only-auth-secret-32-characters-minimum",
    NEXTAUTH_SECRET: "a20-local-only-auth-secret-32-characters-minimum",
    GOOGLE_CLIENT_ID: "a20-fixture.apps.googleusercontent.com",
    GOOGLE_CLIENT_SECRET: "a20-local-google-secret-never-valid",
    DATABASE_URL: DB_APP_URL,
    A20_DATABASE_URL: "",
    TOKEN_ENCRYPTION_KEY: "a20-local-only-token-encryption-key-never-valid",
    REVIEW_BOOSTER_UNSUBSCRIBE_SECRET: "a20-local-only-unsubscribe-secret-never-valid",
    STRIPE_SECRET_KEY: "sk_test_a20_local_only_never_valid",
    STRIPE_WEBHOOK_SECRET: "whsec_a20_local_only_never_valid",
    RESEND_API_KEY: "re_a20_local_only_never_valid",
    RESEND_WEBHOOK_SECRET: "a20_local_only_resend_secret_never_valid",
    OPENAI_API_KEY: "sk-a20-local-only-never-valid",
    CRON_SECRET: "a20-local-only-cron-secret-never-valid",
    EMAIL_FROM: "fixture@example.test",
    REPLY_TO_EMAIL: "fixture@example.test",
    SENTRY_DSN: "",
    SENTRY_AUTH_TOKEN: "",
    SENTRY_ORG: "",
    SENTRY_PROJECT: "",
    STRIPE_PRICE_REPLIES_MONTHLY: "price_a20_replies_monthly",
    STRIPE_PRICE_REPLIES_ANNUAL: "price_a20_replies_annual",
    STRIPE_PRICE_BOOSTER_MONTHLY: "price_a20_booster_monthly",
    STRIPE_PRICE_BOOSTER_ANNUAL: "price_a20_booster_annual",
    STRIPE_PRICE_COMPLETE_MONTHLY: "price_a20_complete_monthly",
    STRIPE_PRICE_COMPLETE_ANNUAL: "price_a20_complete_annual",
  };
}
function ensurePrivateFixtureLocation() {
  if (existsSync(FIXTURE)) {
    const st = statSync(FIXTURE);
    if (!st.isDirectory()) throw new Error("A20 fixture path already exists and is not a directory");
  } else mkdirSync(FIXTURE, { recursive: true, mode: 0o700 });
  if (realpathSync(FIXTURE) !== FIXTURE) throw new Error("A20 fixture root must not be a symlink/junction");
  // Local-only ignore prevents credentials and runtime files from entering Git.
  const exclude = resolve(ROOT, run("git", ["rev-parse", "--git-path", "info/exclude"]));
  const prior = existsSync(exclude) ? readFileSync(exclude, "utf8") : "";
  if (!prior.split(/\r?\n/).includes("/.a20-fixture/")) appendFileSync(exclude, `${prior.endsWith("\n") || !prior ? "" : "\n"}/.a20-fixture/\n`);
}
async function availablePort() {
  const server = createServer();
  await new Promise((ok, fail) => { server.once("error", fail); server.listen(0, "127.0.0.1", ok); });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("could not reserve a loopback port");
  const port = address.port;
  await new Promise((ok, fail) => server.close((error) => error ? fail(error) : ok()));
  return port;
}
function verifyPostgres() {
  const version = run(pgExe("postgres"), ["--version"]);
  if (!/PostgreSQL\)?\s+17\./i.test(version)) throw new Error(`expected PostgreSQL 17; found ${version}`);
  for (const exe of ["initdb", "pg_ctl", "psql", "createdb", "postgres"]) run(pgExe(exe), ["--version"]);
  return version;
}
function assertSafeFixturePaths(requireData = false) {
  if (!existsSync(FIXTURE) || realpathSync(FIXTURE) !== FIXTURE || !FIXTURE.startsWith(`${ROOT}${sep}`)) throw new Error("A20 fixture root identity failed");
  if (existsSync(PG_ROOT) && realpathSync(PG_ROOT) !== PG_ROOT) throw new Error("A20 PostgreSQL root must not be a symlink/junction");
  if (existsSync(DATA) && realpathSync(DATA) !== DATA) throw new Error("A20 PostgreSQL data path must not be a symlink/junction");
  if (requireData && !existsSync(DATA)) throw new Error("A20 PostgreSQL data directory missing");
}
function encryptLocalToken(value) {
  const key = createHash("sha256").update("a20-local-only-token-encryption-key-never-valid").digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(":");
}
async function waitForHttp(url, pid, timeoutMs = 90_000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (!existsSync(RUNTIME)) throw new Error("server runtime metadata missing");
    try {
      process.kill(pid, 0);
      const response = await fetch(url, { signal: AbortSignal.timeout(1500), redirect: "manual" });
      if (response.status < 500) return response.status;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("production app did not become ready within 90 seconds; inspect private output.log");
}

async function setupDatabase() {
  ensurePrivateFixtureLocation();
  checkNoSharedEnvFiles();
  const pgVersion = verifyPostgres();
  if (existsSync(DATA)) throw new Error("fixture database already exists; inspect .a20-fixture and use stop/cleanup before recreating");
  mkdirSync(PG_ROOT, { recursive: true, mode: 0o700 });
  const port = await availablePort();
  run(pgExe("initdb"), ["-D", DATA, "-U", "postgres", "-A", "trust", "--no-locale", "--encoding=UTF8"]);
  assertSafeFixturePaths(true);
  appendFileSync(join(DATA, "postgresql.conf"), "\nunix_socket_directories = ''\nlog_min_error_statement = 'panic'\nlog_statement = 'none'\nlog_parameter_max_length_on_error = 0\n");
  privateWrite(MARKER, { task: "A20", version: 1, state: "starting", database: PG_DATABASE, host: "127.0.0.1", port, clusterPath: realpathSync(DATA), fixtureRoot: realpathSync(FIXTURE), baseCommit: BASE_COMMIT });
  run(pgExe("pg_ctl"), ["-D", DATA, "-l", join(FIXTURE, "postgres.log"), "-o", `-h 127.0.0.1 -p ${port} -F`, "-w", "start"], { stdio: "ignore" });
  assertSafeFixturePaths(true);
  run(pgExe("createdb"), ["-h", "127.0.0.1", "-p", String(port), "-U", "postgres", PG_DATABASE]);
  const marker = {
    task: "A20", version: 1, state: "provisioning", database: PG_DATABASE, host: "127.0.0.1", port,
    clusterPath: realpathSync(DATA), fixtureRoot: realpathSync(FIXTURE),
    baseCommit: BASE_COMMIT, createdAt: new Date().toISOString(), postgresVersion: pgVersion,
  };
  privateWrite(MARKER, marker);
  const migrationsDir = join(ROOT, "neon", "migrations");
  const migrations = readdirSync(migrationsDir).filter((name) => /^\d{3}_.+\.sql$/.test(name))
    .sort((a, b) => Number(a.slice(0, 3)) - Number(b.slice(0, 3)));
  if (!migrations.length || migrations.some((name) => Number(name.slice(0, 3)) > 38)) throw new Error("canonical migration set is missing or extends beyond reviewed migration 038");
  for (const migration of migrations) psql(port, readFileSync(join(migrationsDir, migration), "utf8"), PG_DATABASE);
  const bcrypt = await import("bcryptjs");
  const accounts = {};
  for (const [role, actor] of Object.entries(ACTORS)) {
    const password = `A20-${randomBytes(24).toString("base64url")}!aA7`;
    const passwordHash = await bcrypt.hash(password, 10);
    accounts[role] = { email: actor.email, password };
    psql(port, `INSERT INTO public.users(id,email,name,email_verified,password_hash) VALUES (${sqlQuote(actor.id)},${sqlQuote(actor.email)},${sqlQuote(actor.name)},now(),${sqlQuote(passwordHash)});
      INSERT INTO public.profiles(id,full_name,business_name,city,country,plan,plan_type,plan_status)
      VALUES (${sqlQuote(actor.id)},${sqlQuote(actor.name)},${sqlQuote(actor.name)},'Madrid','ES','free','free','free');`, PG_DATABASE);
  }
  const owner = ACTORS.owner.id; const member = ACTORS.member.id; const outsider = ACTORS.outsider.id;
  const connectionVersion = "a2000000-0000-4000-8000-000000000006";
  const locationId = "a2000000-0000-4000-8000-000000000007";
  psql(port, `
    INSERT INTO public.businesses(id,owner_user_id,name,business_type,city,country,website,phone,google_review_url,rebooking_url,tone,language,email_from_name)
    VALUES (${sqlQuote(IDS.business)},${sqlQuote(owner)},'A20 Studio','salon','Madrid','ES','https://a20.example.test','+34000000000','https://search.google.com/local/writereview?placeid=a20-fixture','https://a20.example.test/book','warm and friendly','en','A20 Studio');
    INSERT INTO public.business_members(business_id,user_id,role) VALUES
      (${sqlQuote(IDS.business)},${sqlQuote(owner)},'owner'),(${sqlQuote(IDS.business)},${sqlQuote(member)},'member');
    INSERT INTO public.business_agents(business_id,agent_id,status,plan_id,billing_period,current_period_start,current_period_end,activated_at)
    VALUES (${sqlQuote(IDS.business)},'review_booster','active','complete','monthly',now()-interval '1 day',now()+interval '29 days',now()-interval '1 day'),
      (${sqlQuote(IDS.business)},'review_replies','active','complete','monthly',now()-interval '1 day',now()+interval '29 days',now()-interval '1 day');
    INSERT INTO public.businesses(id,owner_user_id,name,business_type,city,country,google_review_url,language)
    VALUES (${sqlQuote(IDS.outsiderBusiness)},${sqlQuote(outsider)},'A20 Outsider Workshop','studio','Valencia','ES','https://search.google.com/local/writereview?placeid=a20-outsider','en');
    INSERT INTO public.business_members(business_id,user_id,role) VALUES (${sqlQuote(IDS.outsiderBusiness)},${sqlQuote(outsider)},'owner');
    INSERT INTO public.gbp_locations(id,user_id,location_name,title,address,place_id,raw,connected,connection_version)
    VALUES (${sqlQuote(locationId)},${sqlQuote(owner)},'accounts/a20-fixture/locations/a20-disconnected','A20 Synthetic Studio','Madrid, ES','a20-local-fixture',
      '{"fixture":"A20","providerData":false}'::jsonb,false,${sqlQuote(connectionVersion)});
    WITH review AS (
      INSERT INTO public.reviews(user_id,business_id,location_name,google_review_id,reviewer_name,star_rating,comment,language_code,status)
      VALUES (${sqlQuote(owner)},${sqlQuote(IDS.business)},'accounts/a20-fixture/locations/a20-disconnected',${sqlQuote(IDS.review)},'A20 Sample Reviewer',5,'Synthetic fixture review for authenticated draft persistence.','en','new')
      RETURNING id
    ), reply AS (
      INSERT INTO public.review_replies(user_id,business_id,review_id,draft_markdown,posted)
      SELECT ${sqlQuote(owner)},${sqlQuote(IDS.business)},review.id,'Thanks for sharing your feedback. We appreciate your visit and hope to see you again soon.',false FROM review
      RETURNING id,review_id
    )
    INSERT INTO public.review_reply_draft_state(review_id,business_id,reply_id,state,version)
    SELECT review_id,${sqlQuote(IDS.business)},id,'human_edited',1 FROM reply;
  `, PG_DATABASE);
  const checks = psql(port, `SELECT json_build_object(
    'users',(SELECT count(*) FROM public.users WHERE id IN (${sqlQuote(owner)},${sqlQuote(member)},${sqlQuote(outsider)})),
    'verified',(SELECT count(*) FROM public.users WHERE id IN (${sqlQuote(owner)},${sqlQuote(member)},${sqlQuote(outsider)}) AND email_verified IS NOT NULL AND password_hash IS NOT NULL),
    'canonical_members',(SELECT count(*) FROM public.business_members WHERE business_id=${sqlQuote(IDS.business)}),
    'complete_agents',(SELECT count(*) FROM public.business_agents WHERE business_id=${sqlQuote(IDS.business)} AND plan_id='complete' AND status='active'),
    'outsider_business',(SELECT count(*) FROM public.businesses WHERE id=${sqlQuote(IDS.outsiderBusiness)}),
    'review_draft',(SELECT count(*) FROM public.review_reply_draft_state WHERE business_id=${sqlQuote(IDS.business)} AND state='human_edited')
  );`, PG_DATABASE);
  const seed = JSON.parse(checks);
  if (Object.values(seed).some((count) => Number(count) < 1) || seed.users !== 3 || seed.verified !== 3 || seed.canonical_members !== 2 || seed.complete_agents !== 2) {
    throw new Error("fixture seed identity/role assertion failed");
  }
  const migrationsApplied = psql(port, "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'", PG_DATABASE);
  privateWrite(CREDENTIALS, {
    task: "A20", warning: "PRIVATE LOCAL FIXTURE ONLY. Do not print, commit, screenshot or upload this file.",
    url: null, credentials: accounts,
    actors: Object.fromEntries(Object.entries(ACTORS).map(([role, actor]) => [role, { id: actor.id, email: actor.email }])),
    business: { id: IDS.business, name: "A20 Studio", owner: "owner", member: "member", disconnectedGoogle: true },
    outsiderBusiness: { id: IDS.outsiderBusiness, owner: "outsider" },
    review: { googleReviewId: IDS.review, locationName: "accounts/a20-fixture/locations/a20-disconnected", synthetic: true, initialDraftState: "human_edited", initialVersion: 1 },
    syntheticGoogleMetadata: { locationId, connectionVersion, initiallyDisconnected: true, invalidEncryptedCredentials: true, providerData: false },
    removedMemberPlan: "login as member, revoke through owner team UI, then verify direct URLs/APIs fail while existing sessions persist",
  });
  privateWrite(PG_PORT_FILE, { port, database: PG_DATABASE });
  marker.migrations = migrations;
  marker.state = "ready";
  marker.syntheticLocationId = locationId;
  marker.syntheticConnectionVersion = connectionVersion;
  marker.publicTableCount = Number(migrationsApplied);
  marker.seedCounts = seed;
  privateWrite(MARKER, marker);
  return { port, pgVersion, migrations };
}

function hashBuildTree(buildDir) {
  const digest = createHash("sha256");
  function walk(dir, prefix = "") {
    for (const item of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (!prefix && item.name === "cache") continue;
      const absolute = join(dir, item.name); const name = `${prefix}${item.name}`;
      if (item.isDirectory()) walk(absolute, `${name}/`);
      else if (item.isFile()) digest.update(name).update("\0").update(createHash("sha256").update(readFileSync(absolute)).digest()).update("\0");
    }
  }
  walk(buildDir);
  return digest.digest("hex");
}
function buildAndStart(appPort, keepAlive = false) {
  checkNoSharedEnvFiles();
  const marker = JSON.parse(readFileSync(MARKER, "utf8"));
  const resolvedFixture = realpathSync(FIXTURE);
  validateA20Marker(marker, { database: PG_DATABASE, port: marker.port, fixtureRoot: resolvedFixture, clusterPath: realpathSync(DATA) });
  if (marker.task !== "A20" || marker.version !== 1 || marker.state !== "ready" || marker.database !== PG_DATABASE || marker.host !== "127.0.0.1") throw new Error("fixture marker did not identify this isolated local cluster");
  const pg = JSON.parse(readFileSync(PG_PORT_FILE, "utf8"));
  const runtimePort = Number(pg.port);
  if (!Number.isInteger(runtimePort) || runtimePort < 1024 || pg.database !== PG_DATABASE) throw new Error("fixture port identity invalid");
  const runtimeDatabaseUrl = `postgresql://postgres@127.0.0.1:${runtimePort}/${PG_DATABASE}`;
  const preload = join(ROOT, "scripts", "a20-preload.mjs");
  if (!existsSync(preload)) throw new Error("A20 bridge/preload must be integrated before building the app");
  const env = { ...childBaseEnv(appPort, preload), PORT: String(appPort), A20_DATABASE_URL: runtimeDatabaseUrl };
  const preloadUrl = pathToFileURL(preload).href;
  const nodeArgs = ["--import", preloadUrl];
  const nextBin = join(ROOT, "node_modules", "next", "dist", "bin", "next");
  const buildEnv = {
    ...env,
    NEXT_FONT_GOOGLE_MOCKED_RESPONSES: join(ROOT, "scripts", "a20-google-font-mocks.cjs"),
    SENTRY_TEST_OUT_DIR: join(FIXTURE, "sentry-telemetry"),
  };
  const logFd = openOutputLog();
  try {
    // Use NODE_OPTIONS alone during build: Next propagates it to workers, and
    // also inherits process.execArgv. Passing --import both ways duplicates it.
    run(process.execPath, [nextBin, "build", "--webpack"], { env: buildEnv, stdio: ["ignore", logFd, logFd], timeout: 600_000, maxBuffer: 20 * 1024 * 1024 });
    run(process.execPath, [join(ROOT, "scripts", "generate-static-csp-hashes.mjs")], { env: buildEnv, stdio: ["ignore", logFd, logFd] });
  } finally { closeLog(logFd); }
  const buildId = readFileSync(join(ROOT, ".next", "BUILD_ID"), "utf8").trim();
  const buildHash = hashBuildTree(join(ROOT, ".next"));
  const candidateCommit = run("git", ["rev-parse", "HEAD"]);
  const buildTree = run("git", ["rev-parse", "HEAD^{tree}"]);
  const serverLog = openSync(join(FIXTURE, "server.log"), "a", 0o600);
  let server;
  const serverEnv = { ...env };
  delete serverEnv.NODE_OPTIONS;
  serverEnv.A20_REQUEST_DIAGNOSTICS = "1";
  try {
    server = spawn(process.execPath, [...nodeArgs, nextBin, "start", "-H", "127.0.0.1", "-p", String(appPort)], {
      cwd: ROOT, env: serverEnv, detached: true, windowsHide: true, stdio: ["ignore", serverLog, serverLog],
    });
  } finally { closeSync(serverLog); }
  if (!server.pid) throw new Error("could not launch the loopback production server");
  if (!keepAlive) server.unref();
  privateWrite(RUNTIME, { task: "A20", pid: server.pid, port: appPort, url: `http://127.0.0.1:${appPort}`, buildId, buildHash, buildTree, candidateCommit, baseCommit: BASE_COMMIT, startedAt: new Date().toISOString() });
  return { serverProcess: server, serverPid: server.pid, url: `http://127.0.0.1:${appPort}`, buildId, buildHash, buildTree, candidateCommit };
}
function openOutputLog() {
  ensureWithinFixture(OUT);
  return openSync(OUT, "w", 0o600);
}
function closeLog(fd) { closeSync(fd); }

async function start(keepAlive = false) {
  const setup = existsSync(MARKER) ? { reused: true } : await setupDatabase();
  if (existsSync(RUNTIME)) throw new Error("A20 server metadata already exists; stop this fixture before another start");
  const appPort = await availablePort();
  const server = buildAndStart(appPort, keepAlive);
  const credentials = JSON.parse(readFileSync(CREDENTIALS, "utf8"));
  credentials.url = server.url;
  privateWrite(CREDENTIALS, credentials);
  const status = await waitForHttp(server.url, server.serverPid);
  const result = { ...setup, serverPid: server.serverPid, url: server.url, buildId: server.buildId, buildHash: server.buildHash, buildTree: server.buildTree, candidateCommit: server.candidateCommit, httpStatus: status, credentialsPath: CREDENTIALS, runtimePath: RUNTIME, markerPath: MARKER };
  console.log(JSON.stringify(result, null, 2));
  if (keepAlive && server.serverProcess.exitCode === null) await new Promise((resolveExit) => server.serverProcess.once("exit", resolveExit));
}
function validateRuntime() {
  if (!existsSync(RUNTIME)) return null;
  const runtime = JSON.parse(readFileSync(RUNTIME, "utf8"));
  if (runtime.task !== "A20" || !Number.isInteger(runtime.pid) || !Number.isInteger(runtime.port) || runtime.url !== `http://127.0.0.1:${runtime.port}`) throw new Error("runtime metadata does not identify A20 server");
  return runtime;
}
function powershell(script) {
  const env = Object.fromEntries(["PATH", "SystemRoot", "ComSpec", "TEMP", "TMP", "WINDIR"].filter((key) => process.env[key]).map((key) => [key, process.env[key]]));
  const result = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], { cwd: ROOT, encoding: "utf8", windowsHide: true, env });
  if (result.error || result.status !== 0) throw new Error("could not verify A20 app process identity");
  return String(result.stdout ?? "").trim();
}
function appProcessCommandLine(pid) {
  if (process.platform === "win32") return powershell(`$ErrorActionPreference = 'Stop'; if (-not (Get-Command Get-CimInstance -ErrorAction SilentlyContinue)) { exit 2 }; try { $p = Get-CimInstance Win32_Process -Filter 'ProcessId = ${pid}' -ErrorAction Stop; if ($p) { $p.CommandLine }; exit 0 } catch { exit 3 }`);
  try { return readFileSync(`/proc/${pid}/cmdline`, "utf8").replaceAll("\0", " ").trim(); } catch { return ""; }
}
function appPortOwner(port) {
  let output;
  if (process.platform === "win32") output = powershell(`$ErrorActionPreference = 'Stop'; if (-not (Get-Command Get-NetTCPConnection -ErrorAction SilentlyContinue)) { exit 2 }; try { $listeners = Get-NetTCPConnection -State Listen -ErrorAction Stop; $c = $listeners | Where-Object { $_.LocalPort -eq ${port} }; if ($c) { ($c | Select-Object -First 1 -ExpandProperty OwningProcess) }; exit 0 } catch { exit 3 }`);
  else {
    const result = spawnSync("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"], { encoding: "utf8", windowsHide: true, env: pgEnv() });
    if (result.error || ![0, 1].includes(result.status)) throw new Error("could not verify A20 loopback port ownership (lsof required)");
    output = result.stdout;
  }
  return Number(output) || null;
}
function stopServer() {
  const runtime = validateRuntime();
  if (!runtime) return false;
  assertSafeFixturePaths(true);
  const preload = join(ROOT, "scripts", "a20-preload.mjs");
  const nextBin = join(ROOT, "node_modules", "next", "dist", "bin", "next");
  const commandLine = appProcessCommandLine(runtime.pid);
  if (!commandLine && appPortOwner(runtime.port) === null) {
    rmSync(ensureWithinFixture(RUNTIME), { force: true });
    return true;
  }
  if (!isExpectedA20App(commandLine, { preload, nextBin })) {
    throw new Error("runtime PID does not match this worktree's A20 Next server; preserved runtime metadata");
  }
  const owner = appPortOwner(runtime.port);
  if (owner !== runtime.pid) throw new Error("A20 loopback port is not owned by the recorded server PID; preserved runtime metadata");
  try { process.kill(runtime.pid, "SIGTERM"); } catch (error) {
    if (error?.code !== "ESRCH") throw error;
  }
  const stopAt = Date.now() + 20_000;
  while (Date.now() < stopAt) {
    if (!appProcessCommandLine(runtime.pid) && appPortOwner(runtime.port) === null) break;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250);
  }
  if (appProcessCommandLine(runtime.pid) || appPortOwner(runtime.port) !== null) throw new Error("A20 app server did not exit cleanly; preserved runtime metadata");
  rmSync(ensureWithinFixture(RUNTIME), { force: true });
  return true;
}
function cleanup() {
  if (existsSync(MARKER)) {
    assertSafeFixturePaths(true);
    const marker = JSON.parse(readFileSync(MARKER, "utf8"));
    if (marker.task !== "A20" || marker.version !== 1 || marker.database !== PG_DATABASE || marker.host !== "127.0.0.1"
      || marker.fixtureRoot !== realpathSync(FIXTURE) || marker.clusterPath !== DATA) throw new Error("refusing cleanup: marker does not match this task-owned fixture");
    try { stopServer(); } catch { throw new Error("server shutdown failed; fixture data preserved under .a20-fixture"); }
    const pgStatus = spawnSync(pgExe("pg_ctl"), ["-D", DATA, "status"], { encoding: "utf8", windowsHide: true, env: pgEnv() });
    if (pgStatus.status === 0) {
      try { run(pgExe("pg_ctl"), ["-D", DATA, "-m", "fast", "-w", "stop"], { stdio: "ignore" }); }
      catch { throw new Error("PostgreSQL shutdown failed; fixture data preserved under .a20-fixture"); }
    } else if (pgStatus.status !== 3) throw new Error("PostgreSQL status uncertain; fixture data preserved under .a20-fixture");
  } else if (existsSync(FIXTURE)) {
    throw new Error("A20 cleanup marker missing; fixture data preserved for manual inspection");
  }
  const resolved = realpathSync(FIXTURE);
  if (resolved !== FIXTURE || !resolved.startsWith(`${ROOT}${sep}`)) throw new Error("refusing recursive cleanup because fixture path escaped worktree root");
  rmSync(resolved, { recursive: true, force: true });
  console.log("A20 fixture server/database stopped and task-local fixture directory removed.");
}
function fixtureDatabase() {
  const marker = JSON.parse(readFileSync(MARKER, "utf8"));
  const port = Number(marker.port);
  validateA20Marker(marker, { database: PG_DATABASE, port, fixtureRoot: realpathSync(FIXTURE), clusterPath: realpathSync(DATA) });
  if (!Number.isInteger(port) || marker.syntheticLocationId !== "a2000000-0000-4000-8000-000000000007") throw new Error("A20 database marker fields invalid");
  return { marker, port };
}
function connectSyntheticLocation() {
  const { marker, port } = fixtureDatabase();
  const connectionVersion = marker.syntheticConnectionVersion;
  const owner = ACTORS.owner.id;
  psql(port, `INSERT INTO public.gbp_connections(user_id,provider,access_token,refresh_token,expires_at,scope,connection_version)
    VALUES (${sqlQuote(owner)},'google',${sqlQuote(encryptLocalToken("A20_LOCAL_ONLY_INVALID_ACCESS_TOKEN"))},${sqlQuote(encryptLocalToken("A20_LOCAL_ONLY_INVALID_REFRESH_TOKEN"))},now()+interval '365 days','https://www.googleapis.com/auth/business.manage',${sqlQuote(connectionVersion)})
    ON CONFLICT(user_id) DO UPDATE SET provider=EXCLUDED.provider,access_token=EXCLUDED.access_token,refresh_token=EXCLUDED.refresh_token,
      expires_at=EXCLUDED.expires_at,scope=EXCLUDED.scope,connection_version=EXCLUDED.connection_version,updated_at=now();
    UPDATE public.gbp_locations SET connected=true WHERE id=${sqlQuote(marker.syntheticLocationId)} AND user_id=${sqlQuote(owner)} AND connection_version=${sqlQuote(connectionVersion)};
    INSERT INTO public.business_google_locations(business_id,location_id)
    VALUES (${sqlQuote(IDS.business)},${sqlQuote(marker.syntheticLocationId)})
    ON CONFLICT(business_id) DO UPDATE SET location_id=EXCLUDED.location_id,updated_at=now();`, PG_DATABASE);
  console.log("Synthetic A20 Google metadata enabled locally. Tokens are unusable fixture values; no Google request was made.");
}
function disconnectSyntheticLocation() {
  const { marker, port } = fixtureDatabase();
  psql(port, `DELETE FROM public.business_google_locations WHERE business_id=${sqlQuote(IDS.business)} AND location_id=${sqlQuote(marker.syntheticLocationId)};
    UPDATE public.gbp_locations SET connected=false WHERE id=${sqlQuote(marker.syntheticLocationId)};
    DELETE FROM public.gbp_connections WHERE user_id=${sqlQuote(ACTORS.owner.id)};`, PG_DATABASE);
  console.log("A20 Google metadata returned to disconnected state and local dummy credentials removed.");
}
function snapshot() {
  const { port } = fixtureDatabase();
  const sql = `SELECT json_build_object(
    'actors',(SELECT count(*) FROM public.users WHERE id IN (${sqlQuote(ACTORS.owner.id)},${sqlQuote(ACTORS.member.id)},${sqlQuote(ACTORS.outsider.id)})),
    'canonicalMembers',(SELECT count(*) FROM public.business_members WHERE business_id=${sqlQuote(IDS.business)}),
    'outsiderBusinesses',(SELECT count(*) FROM public.businesses WHERE owner_user_id=${sqlQuote(ACTORS.outsider.id)}),
    'ownerVisits',(SELECT count(*) FROM public.followup_visits WHERE business_id=${sqlQuote(IDS.business)}),
    'outsiderVisits',(SELECT count(*) FROM public.followup_visits WHERE business_id=${sqlQuote(IDS.outsiderBusiness)}),
    'ownerReviews',(SELECT count(*) FROM public.reviews WHERE business_id=${sqlQuote(IDS.business)}),
    'outsiderReviews',(SELECT count(*) FROM public.reviews WHERE business_id=${sqlQuote(IDS.outsiderBusiness)}),
    'draft',(SELECT json_build_object('state',s.state,'version',s.version,'sha256',encode(digest(coalesce(rr.draft_markdown,''),'sha256'),'hex')) FROM public.review_reply_draft_state s LEFT JOIN public.review_replies rr ON rr.id=s.reply_id WHERE s.business_id=${sqlQuote(IDS.business)} AND s.review_id=(SELECT id FROM public.reviews WHERE business_id=${sqlQuote(IDS.business)} AND google_review_id=${sqlQuote(IDS.review)})),
    'memberPresent',(SELECT count(*) FROM public.business_members WHERE business_id=${sqlQuote(IDS.business)} AND user_id=${sqlQuote(ACTORS.member.id)}),
    'pendingInvitations',(SELECT count(*) FROM public.team_invitations WHERE business_id=${sqlQuote(IDS.business)} AND status='pending'),
    'ownerBusinessSettingsSha256',(SELECT encode(digest(concat_ws('|',name,business_type,city,country,website,phone,google_review_url,rebooking_url,tone,language,email_from_name),'sha256'),'hex') FROM public.businesses WHERE id=${sqlQuote(IDS.business)}),
    'ownerProfileSettingsSha256',(SELECT encode(digest(concat_ws('|',full_name,business_name,city,country,reply_tone,owner_name,contact_preference,auto_reply_all_reviews,plan,plan_type,plan_status),'sha256'),'hex') FROM public.profiles WHERE id=${sqlQuote(ACTORS.owner.id)}),
    'ownerAgentEntitlementsSha256',(SELECT encode(digest(coalesce(string_agg(concat_ws('|',agent_id,status,plan_id,billing_period,current_period_start,current_period_end),E'\\n' ORDER BY agent_id),''),'sha256'),'hex') FROM public.business_agents WHERE business_id=${sqlQuote(IDS.business)}),
    'ownerGbpConnections',(SELECT count(*) FROM public.gbp_connections WHERE user_id=${sqlQuote(ACTORS.owner.id)}),
    'syntheticLocationConnected',(SELECT COALESCE(bool_or(connected),false) FROM public.gbp_locations WHERE id='a2000000-0000-4000-8000-000000000007'),
    'syntheticLocationSelected',(SELECT count(*) FROM public.business_google_locations WHERE business_id=${sqlQuote(IDS.business)} AND location_id='a2000000-0000-4000-8000-000000000007')
  );`;
  console.log(psql(port, sql, PG_DATABASE));
}

async function main() {
  const action = process.argv[2];
  if (action === "setup") { const result = await setupDatabase(); console.log(JSON.stringify(result)); return; }
  if (action === "start") { await start(process.argv.includes("--serve")); return; }
  if (action === "stop") { console.log(stopServer() ? "A20 app server stopped." : "A20 app server was not running."); return; }
  if (action === "cleanup") { cleanup(); return; }
  if (action === "connect") { connectSyntheticLocation(); return; }
  if (action === "disconnect") { disconnectSyntheticLocation(); return; }
  if (action === "snapshot") { snapshot(); return; }
  if (action === "assert") {
    fixtureDatabase();
    const ledger = resolve(FIXTURE, "outbound-blocked.jsonl");
    if (existsSync(ledger) && readFileSync(ledger, "utf8").trim()) throw new Error("blocked outbound attempts were recorded; inspect the sanitized outbound-blocked.jsonl artifact");
    console.log("No blocked outbound attempts recorded by A20 build/app processes.");
    return;
  }
  die("usage: node scripts/a20-app-fixture.mjs <setup|start [--serve]|connect|disconnect|snapshot|stop|cleanup|assert>");
}
main().catch((error) => { die(error instanceof Error ? error.message : "unknown error"); });
