import { spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { existsSync, readFileSync, readdirSync, realpathSync, writeFileSync, mkdirSync, unlinkSync, lstatSync } from "node:fs";
import { createServer } from "node:net";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createA10LiveRunIntent, secureA10PrivateDirectory, secureA10PrivateFile, stageA10LiveAdapters } from "./a10-live-resend-guards.mjs";
import { validateA20Marker, validateA20PostgresIdentity } from "./a20-app-fixture-core.mjs";
import { authenticateA10FixtureOwner, createA10SyntheticVisit, runA10AuthenticatedNow } from "./a10-live-app-auth.mjs";
import { createA10Endpoint, A10_RESEND_EVENTS } from "./a10-resend-endpoint.mjs";
import { readA10LiveResendApiKey, listA10LiveWebhooks, verifyA10LiveWebhookPin, deleteA10LiveWebhook, getA10LiveEmailEvidence } from "./a10-live-provider-control.mjs";
import { createA10WebhookProxy } from "./a10-live-webhook-proxy.mjs";
import { startA10LiveTunnel } from "./a10-live-tunnel.mjs";
import { readA10LiveDeliveryEvidence } from "./a10-live-delivery-evidence.mjs";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const FIXTURE = resolve(ROOT, ".a20-fixture");
const ADAPTED_FIXTURE = resolve(FIXTURE, "a10-live", "a20-app-fixture.mjs");
const PRIVATE_STATE = resolve(ROOT, ".env.a10-live-resend");
const BUILD_RECEIPT = resolve(FIXTURE, "a10-live", "build-receipt.json");
const OWNER_BUSINESS = "a2000000-0000-4000-8000-000000000003";
const OUTSIDER_BUSINESS = "a2000000-0000-4000-8000-000000000005";
const SENDER = "acceptance@reviews.ornigami.com";
const SENDER_DOMAIN = "reviews.ornigami.com";
const OWNER_REVIEW_URL = "https://search.google.com/local/writereview?placeid=a20-fixture";

async function availableLoopbackPort() {
  const server = createServer();
  await new Promise((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("could not allocate a loopback app port");
  await new Promise((resolveClose, reject) => server.close((error) => error ? reject(error) : resolveClose()));
  return address.port;
}

function childEnvironment(overrides = {}) {
  const inherited = Object.fromEntries(["PATH", "Path", "SystemRoot", "ComSpec", "TEMP", "TMP", "WINDIR", "PATHEXT"]
    .filter((key) => process.env[key]).map((key) => [key, process.env[key]]));
  if (process.env.A20_PG_BIN) inherited.A20_PG_BIN = process.env.A20_PG_BIN;
  return { ...inherited, ...overrides };
}

function postgresExecutable(name) {
  const configured = process.env.A20_PG_BIN;
  if (process.platform === "win32") return resolve(configured || "C:/Program Files/PostgreSQL/17/bin", `${name}.exe`);
  return configured ? resolve(configured, name) : name;
}

function psql(sqlText, port) {
  const env = childEnvironment({
    PGCLIENTENCODING: "UTF8",
    PGSERVICEFILE: resolve(FIXTURE, "no-pg-service.conf"),
    PGPASSFILE: resolve(FIXTURE, "no-pgpass"),
  });
  const result = spawnSync(postgresExecutable("psql"), ["-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-h", "127.0.0.1", "-p", String(port), "-U", "postgres", "-d", "a20_browser_fixture", "-f", "-"], {
    cwd: ROOT, env, input: sqlText, encoding: "utf8", windowsHide: true, timeout: 30_000, maxBuffer: 128 * 1024,
  });
  if (result.error || result.status !== 0) throw new Error("synthetic PostgreSQL verification failed; no database output is retained by the runner");
  return String(result.stdout || "").trim();
}

function verifySyntheticPostgres({ requireFresh = false } = {}) {
  const markerPath = resolve(FIXTURE, "marker.json");
  const marker = JSON.parse(readFileSync(markerPath, "utf8"));
  const fixtureRealPath = realpathSync(FIXTURE);
  const dataPath = realpathSync(resolve(FIXTURE, "postgres", "data"));
  validateA20Marker(marker, { database: "a20_browser_fixture", port: marker.port, fixtureRoot: fixtureRealPath, clusterPath: dataPath });
  const markerFile = JSON.parse(readFileSync(resolve(FIXTURE, "postgres", "port.json"), "utf8"));
  if (markerFile.database !== "a20_browser_fixture" || markerFile.port !== marker.port) throw new Error("synthetic PostgreSQL marker and port file disagree");
  const identity = JSON.parse(psql(`SELECT json_build_object('database',current_database(),'host',host(inet_server_addr()),'port',inet_server_port(),'dataDirectory',current_setting('data_directory'))::text;`, marker.port));
  validateA20PostgresIdentity(identity, { database: "a20_browser_fixture", port: marker.port, clusterPath: dataPath });
  const counts = JSON.parse(psql(`SELECT json_build_object(
    'users',(SELECT count(*) FROM public.users WHERE id IN ('a2000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000002','a2000000-0000-4000-8000-000000000004')),
    'businesses',(SELECT count(*) FROM public.businesses WHERE id='a2000000-0000-4000-8000-000000000003'),
    'visits',(SELECT count(*) FROM public.followup_visits),
    'ownerVisits',(SELECT count(*) FROM public.followup_visits WHERE business_id='a2000000-0000-4000-8000-000000000003'),
    'deliveries',(SELECT count(*) FROM public.booster_followup_deliveries),
    'events',(SELECT count(*) FROM public.booster_delivery_events),
    'suppressions',(SELECT count(*) FROM public.booster_delivery_suppressions)
  );`, marker.port));
  if (counts.users !== 3 || counts.businesses !== 1) throw new Error("synthetic PostgreSQL fixture seed identity did not match");
  if (requireFresh && (counts.visits !== 0 || counts.deliveries !== 0 || counts.events !== 0 || counts.suppressions !== 0)) {
    throw new Error("synthetic PostgreSQL fixture already contains visit, delivery, event, or suppression rows; refusing live acceptance");
  }
  return Object.freeze({ port: marker.port, identity, counts });
}

function readOutsiderSuppressionEvidence(visitId, recipient) {
  if (!safeId(visitId) || typeof recipient !== "string" || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(recipient)) throw new Error("A10 suppression evidence pins are invalid");
  const marker = JSON.parse(readFileSync(resolve(FIXTURE, "marker.json"), "utf8"));
  verifySyntheticPostgres();
  const sql = `SELECT json_build_object(
    'visitId',v.id::text,'visitStatus',v.followup_status,
    'deliveryRows',(SELECT count(*) FROM public.booster_followup_deliveries d WHERE d.visit_id=v.id AND d.business_id=v.business_id),
    'deliveryStates',(SELECT COALESCE(json_agg(d.state),'[]'::json) FROM public.booster_followup_deliveries d WHERE d.visit_id=v.id AND d.business_id=v.business_id),
    'suppressionCount',(SELECT count(*) FROM public.booster_delivery_suppressions s WHERE s.email_normalized=lower(trim(${sqlLiteral(recipient)}))),
    'quotaUsage',(SELECT q.usage FROM public.booster_monthly_quota(${sqlLiteral(OUTSIDER_BUSINESS)}::uuid) q),
    'quotaAllowance',(SELECT q.allowance FROM public.booster_monthly_quota(${sqlLiteral(OUTSIDER_BUSINESS)}::uuid) q)
  )::text FROM public.followup_visits v WHERE v.id=${sqlLiteral(visitId)}::uuid AND v.business_id=${sqlLiteral(OUTSIDER_BUSINESS)}::uuid;`;
  const raw = psql(sql, marker.port);
  if (!raw) throw new Error("A10 outsider suppression evidence was not found");
  return JSON.parse(raw);
}

async function readOwnedRecipient() {
  const path = resolve(PRIVATE_STATE, "owned-recipient.txt");
  try {
    const { checkPrivateArtifact } = await import("./a12-support-access-verify.mjs");
    await checkPrivateArtifact(path);
  } catch { throw new Error("A10 controlled recipient file is missing or not private to the current user"); }
  const raw = readFileSync(path, "utf8");
  if (Buffer.byteLength(raw, "utf8") > 512) throw new Error("A10 controlled recipient file is invalid");
  const lines = raw.trim().split(/\r?\n/);
  if (lines.length !== 1 || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(lines[0]) || lines[0].toLowerCase() === "bounced@resend.dev") {
    throw new Error("A10 controlled recipient file must contain one authorized owned mailbox");
  }
  return lines[0].toLowerCase();
}

function runFixture(action, env) {
  const result = spawnSync(process.execPath, [ADAPTED_FIXTURE, action], {
    cwd: ROOT,
    env,
    encoding: "utf8",
    windowsHide: true,
    timeout: action === "start" ? 15 * 60_000 : 3 * 60_000,
    maxBuffer: 2 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) {
    throw new Error(`task-local fixture ${action} failed (exit ${result.status ?? "spawn error"}); private task logs are retained for inspection`);
  }
  return String(result.stdout || "").trim();
}

function runCanonicalFixture(action, env) {
  const result = spawnSync(process.execPath, [resolve(ROOT, "scripts", "a20-app-fixture.mjs"), action], {
    cwd: ROOT, env, encoding: "utf8", windowsHide: true, timeout: 3 * 60_000, maxBuffer: 2 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) throw new Error(`canonical A20 fixture ${action} failed (exit ${result.status ?? "spawn error"}); private task logs are retained for inspection`);
  return String(result.stdout || "").trim();
}

function parseLastJson(output) {
  try { return JSON.parse(output.trim()); } catch {}
  const lines = output.split(/\r?\n/).filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    try { return JSON.parse(lines[index]); } catch {}
  }
  throw new Error("task-local fixture returned no sanitized JSON receipt");
}

function gitOutput(args) {
  const result = spawnSync("git", args, { cwd: ROOT, encoding: "utf8", windowsHide: true, timeout: 15_000 });
  if (result.error || result.status !== 0) throw new Error("could not verify task-local build source identity");
  return String(result.stdout || "").trim();
}

function appSourceFingerprint() {
  const changed = gitOutput(["status", "--porcelain", "--", "src", "neon/migrations", "package.json", "package-lock.json", "next.config.ts"]);
  if (changed) throw new Error("shared application source/configuration changed after the local build; rebuild review is required");
  const parts = ["src", "neon/migrations", "package.json", "package-lock.json", "next.config.ts"]
    .map((path) => `${path}:${gitOutput(["rev-parse", `HEAD:${path}`])}`);
  return createHash("sha256").update(parts.join("\n")).digest("hex");
}

function hashBuildTree(buildDir) {
  const digest = createHash("sha256");
  function walk(dir, prefix = "") {
    for (const item of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (!prefix && item.name === "cache") continue;
      const absolute = resolve(dir, item.name);
      const name = `${prefix}${item.name}`;
      if (item.isDirectory()) walk(absolute, `${name}/`);
      else if (item.isFile()) digest.update(name).update("\0").update(createHash("sha256").update(readFileSync(absolute)).digest()).update("\0");
    }
  }
  walk(buildDir);
  return digest.digest("hex");
}

function readBuildReceipt() {
  if (!existsSync(BUILD_RECEIPT)) return null;
  const receipt = JSON.parse(readFileSync(BUILD_RECEIPT, "utf8"));
  const expectedSource = appSourceFingerprint();
  if (receipt.schema !== "ornigami.a10.live-build.v1" || receipt.candidateCommit !== gitOutput(["rev-parse", "HEAD"]) ||
      receipt.buildTree !== gitOutput(["rev-parse", "HEAD^{tree}"]) || receipt.sourceFingerprint !== expectedSource ||
      !Number.isInteger(receipt.appPort) || receipt.appPort < 1024 || receipt.appPort > 65535 ||
      receipt.buildHash !== hashBuildTree(resolve(ROOT, ".next")) || receipt.buildId !== readFileSync(resolve(ROOT, ".next", "BUILD_ID"), "utf8").trim()) {
    throw new Error("existing Next build receipt does not match the current application source/artifact; refusing live startup");
  }
  return receipt;
}

async function saveBuildReceipt(startReceipt, sourceFingerprint, port) {
  const receipt = {
    schema: "ornigami.a10.live-build.v1",
    appPort: port,
    buildId: startReceipt.buildId,
    buildHash: startReceipt.buildHash,
    buildTree: startReceipt.buildTree,
    candidateCommit: startReceipt.candidateCommit,
    sourceFingerprint,
    capturedBeforeServerStart: true,
    recordedAt: new Date().toISOString(),
  };
  writeFileSync(BUILD_RECEIPT, `${JSON.stringify(receipt, null, 2)}\n`, { flag: "wx", mode: 0o600 });
  await secureA10PrivateFile(BUILD_RECEIPT);
  return receipt;
}

export async function prepareA10LocalSyntheticApp() {
  if (existsSync(resolve(PRIVATE_STATE, "run-intent.json"))) throw new Error("A10 live run intent already exists; do not rerun the provider acceptance");
  await stageA10LiveAdapters({ workspaceRoot: ROOT, sourceRoot: ROOT });
  const existingBuild = readBuildReceipt();
  const sourceFingerprint = appSourceFingerprint();
  const port = existingBuild?.appPort ?? await availableLoopbackPort();
  let setup;
  const markerPath = resolve(FIXTURE, "marker.json");
  if (existsSync(markerPath)) {
    const marker = JSON.parse(readFileSync(markerPath, "utf8"));
    validateA20Marker(marker, {
      database: "a20_browser_fixture",
      port: marker.port,
      fixtureRoot: realpathSync(FIXTURE),
      clusterPath: realpathSync(resolve(FIXTURE, "postgres", "data")),
    });
    setup = { pgVersion: marker.postgresVersion, migrations: marker.migrations, reused: true };
  } else {
    setup = parseLastJson(runFixture("setup", childEnvironment()));
  }
  const database = verifySyntheticPostgres({ requireFresh: true });
  const taskEnv = childEnvironment({
    A10_LIVE_APP_PORT: String(port),
    A10_LIVE_REUSE_BUILD: existingBuild ? "1" : "0",
    A10_TASK_AUTH_SECRET: randomBytes(32).toString("base64url"),
    A10_TASK_TOKEN_KEY: randomBytes(32).toString("base64url"),
    A10_TASK_UNSUBSCRIBE_SECRET: randomBytes(32).toString("base64url"),
    // Provider credentials are deliberately omitted during this build/bootstrap phase.
  });
  let startReceipt;
  let startError;
  try {
    startReceipt = parseLastJson(runFixture("start", taskEnv));
    if (startReceipt.url !== `http://127.0.0.1:${port}` || !startReceipt.buildHash || !startReceipt.buildTree) {
      throw new Error("task-local app bootstrap receipt did not match the selected loopback target");
    }
    if (existingBuild && (startReceipt.buildHash !== existingBuild.buildHash || startReceipt.buildId !== existingBuild.buildId)) {
      throw new Error("reused Next build did not match its pre-start task receipt");
    }
    if (!existingBuild) await saveBuildReceipt(startReceipt, sourceFingerprint, port);
  } catch (error) {
    startError = error;
  }
  try { runFixture("stop", childEnvironment()); }
  catch (stopError) {
    if (startError) throw new AggregateError([startError, stopError], "A10 local app bootstrap and shutdown both need inspection");
    throw stopError;
  }
  if (startError) throw startError;
  return Object.freeze({
    status: "local_synthetic_app_built_and_stopped",
    postgresVersion: setup.pgVersion,
    migrationCount: Array.isArray(setup.migrations) ? setup.migrations.length : null,
    appUrl: startReceipt.url,
    appPort: port,
    buildHash: startReceipt.buildHash,
    buildTree: startReceipt.buildTree,
    candidateCommit: startReceipt.candidateCommit,
    syntheticUsers: database.counts.users,
    syntheticBusinesses: database.counts.businesses,
    providerCalls: 0,
    publicTunnel: false,
  });
}

async function seedKnownBuildReceipt(args) {
  const values = new Map();
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];
    if (!key?.startsWith("--") || !value || values.has(key)) throw new Error("Usage: seed-build --commit <previously-recorded-commit> --tree <previously-recorded-tree> --hash <pre-start-build-hash> --port <loopback-port>");
    values.set(key, value);
  }
  const candidateCommit = values.get("--commit");
  const buildTree = values.get("--tree");
  const buildHash = values.get("--hash");
  const appPort = Number(values.get("--port"));
  if (!/^[0-9a-f]{40}$/i.test(candidateCommit || "") || !/^[0-9a-f]{40}$/i.test(buildTree || "") ||
      !/^[0-9a-f]{64}$/i.test(buildHash || "") || !Number.isInteger(appPort) || appPort < 1024 || appPort > 65535) {
    throw new Error("previously recorded local build receipt fields are invalid");
  }
  if (existsSync(BUILD_RECEIPT)) throw new Error("a local build receipt already exists; refusing overwrite");
  if (existsSync(resolve(FIXTURE, "runtime.json"))) throw new Error("the A20 app runtime must be stopped before recording a build receipt");
  const candidateNow = gitOutput(["rev-parse", "HEAD"]);
  const treeNow = gitOutput(["rev-parse", "HEAD^{tree}"]);
  const sourceFingerprint = appSourceFingerprint();
  const actualHash = hashBuildTree(resolve(ROOT, ".next"));
  const buildId = readFileSync(resolve(ROOT, ".next", "BUILD_ID"), "utf8").trim();
  const fixtureCredentials = JSON.parse(readFileSync(resolve(FIXTURE, "credentials.json"), "utf8"));
  let credentialUrl;
  try { credentialUrl = new URL(fixtureCredentials.url); } catch { throw new Error("A20 local fixture URL metadata is invalid"); }
  if (candidateNow !== candidateCommit || treeNow !== buildTree || actualHash !== buildHash ||
      credentialUrl.protocol !== "http:" || credentialUrl.hostname !== "127.0.0.1" || Number(credentialUrl.port) !== appPort) {
    throw new Error("the prior local build receipt no longer matches this stopped app artifact/source; refusing reuse");
  }
  const receipt = {
    schema: "ornigami.a10.live-build.v1", appPort, buildId, buildHash, buildTree,
    candidateCommit, sourceFingerprint, capturedBeforeServerStart: true,
    recordedAt: new Date().toISOString(), receiptSource: "prior-prepare-local-output",
  };
  writeFileSync(BUILD_RECEIPT, `${JSON.stringify(receipt, null, 2)}\n`, { flag: "wx", mode: 0o600 });
  await secureA10PrivateFile(BUILD_RECEIPT);
  return { recorded: true, appPort, buildHash, buildTree, candidateCommit };
}

export async function preflightA10AuthenticatedApp() {
  if (existsSync(resolve(PRIVATE_STATE, "run-intent.json"))) throw new Error("A10 live run intent already exists; refusing to repeat preflight after live actions");
  await stageA10LiveAdapters({ workspaceRoot: ROOT, sourceRoot: ROOT });
  const build = readBuildReceipt();
  if (!build) throw new Error("a verified task-local build receipt is required before app preflight");
  const database = verifySyntheticPostgres({ requireFresh: true });
  const taskEnv = childEnvironment({
    A10_LIVE_APP_PORT: String(build.appPort),
    A10_LIVE_REUSE_BUILD: "1",
    A10_TASK_AUTH_SECRET: randomBytes(32).toString("base64url"),
    A10_TASK_TOKEN_KEY: randomBytes(32).toString("base64url"),
    A10_TASK_UNSUBSCRIBE_SECRET: randomBytes(32).toString("base64url"),
  });
  let startReceipt;
  let preflightError;
  let actorAuthenticated = false;
  let visitsStatus;
  let visitCount;
  try {
    startReceipt = parseLastJson(runFixture("start", taskEnv));
    if (startReceipt.url !== `http://127.0.0.1:${build.appPort}` || startReceipt.buildHash !== build.buildHash || startReceipt.buildId !== build.buildId) {
      throw new Error("authenticated preflight app did not use the exact receipted build/port");
    }
    const owner = await authenticateA10FixtureOwner({ appUrl: startReceipt.url, credentialsPath: resolve(FIXTURE, "credentials.json") });
    actorAuthenticated = Boolean(owner.actorId);
    const response = await owner.request("/api/review-booster/visits?limit=5");
    visitsStatus = response.status;
    if (!response.ok) throw new Error(`authenticated fixture visits read failed with HTTP ${response.status}`);
    const body = JSON.parse(await response.text());
    if (!Array.isArray(body.items)) throw new Error("authenticated fixture visits response was invalid");
    visitCount = body.items.length;
    if (visitCount !== 0) throw new Error("fresh synthetic fixture unexpectedly contains visit candidates");
  } catch (error) { preflightError = error; }
  try { runFixture("stop", childEnvironment()); }
  catch (stopError) {
    if (preflightError) throw new AggregateError([preflightError, stopError], "A10 app preflight and shutdown both need inspection");
    throw stopError;
  }
  if (preflightError) throw preflightError;
  return Object.freeze({
    status: "authenticated_local_preflight_passed",
    postgresHost: database.identity.host,
    postgresDatabase: database.identity.database,
    syntheticSeedCounts: { users: database.counts.users, businesses: database.counts.businesses },
    actorAuthenticated,
    visitsStatus,
    visitCandidatesBeforeSend: visitCount,
    providerCalls: 0,
    publicTunnel: false,
  });
}

function safeId(value) {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function readProviderAttempts() {
  const path = resolve(PRIVATE_STATE, "provider-attempts");
  if (!existsSync(path)) return [];
  return readdirSync(path).filter((name) => /^attempt-[12]\.json$/.test(name)).sort()
    .map((name) => JSON.parse(readFileSync(resolve(path, name), "utf8")));
}

function findDeliveryId(businessId, visitId) {
  if (!safeId(businessId) || !safeId(visitId)) throw new Error("A10 SQL evidence identifiers are invalid");
  verifySyntheticPostgres();
  const sql = `SELECT d.id::text FROM public.followup_visits v JOIN public.booster_followup_deliveries d ON d.visit_id=v.id AND d.business_id=v.business_id WHERE v.id=${sqlLiteral(visitId)}::uuid AND v.business_id=${sqlLiteral(businessId)}::uuid;`;
  const raw = psql(sql, JSON.parse(readFileSync(resolve(FIXTURE, "marker.json"), "utf8")).port);
  return raw && safeId(raw) ? raw : null;
}

async function readSafeDeliveryEvidence(businessId, visitId, pins = {}) {
  const deliveryId = findDeliveryId(businessId, visitId);
  if (!deliveryId) return null;
  const marker = JSON.parse(readFileSync(resolve(FIXTURE, "marker.json"), "utf8"));
  return readA10LiveDeliveryEvidence((sql) => Promise.resolve(psql(sql, marker.port)), { businessId, visitId, deliveryId, ...pins });
}

function sqlLiteral(value) { return `'${String(value).replaceAll("'", "''")}'`; }

function savePrivateJson(path, value, exclusive = true) {
  mkdirSync(resolve(path, ".."), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { flag: exclusive ? "wx" : "w", mode: 0o600 });
}

export async function prepareKnownPreproviderContinuation() {
  const originalIntentPath = resolve(PRIVATE_STATE, "run-intent.json");
  const firstReceiptPath = resolve(PRIVATE_STATE, "live-acceptance-receipt.json");
  const diagnosticPath = resolve(PRIVATE_STATE, "pre-continuation-diagnostic.json");
  const continuationBuildPath = resolve(PRIVATE_STATE, "continuation-build-receipt.json");
  if (!existsSync(originalIntentPath) || !existsSync(firstReceiptPath) || existsSync(diagnosticPath) || existsSync(continuationBuildPath)) {
    throw new Error("A10 known-preprovider continuation requires one unarchived prior run and no existing diagnostic");
  }
  const originalIntent = JSON.parse(readFileSync(originalIntentPath, "utf8"));
  const prior = JSON.parse(readFileSync(firstReceiptPath, "utf8"));
  if (originalIntent.schema !== "ornigami.a10.live-run-intent.v1" || prior.schema !== "ornigami.a10.live-resend-acceptance.v1" ||
      prior.status !== "incomplete" || prior.providerSendAttempts !== 0 || prior.endpoint?.deleted !== true ||
      prior.publicWebhookProbe?.status !== 401 || prior.app?.stopConfirmed !== true || prior.tunnelStarted !== false ||
      prior.taskSecretsRemoved !== true || existsSync(resolve(PRIVATE_STATE, "continuation-1-intent.json"))) {
    throw new Error("prior live receipt does not prove a cleaned, zero-email-attempt preprovider failure");
  }
  const attemptDir = resolve(PRIVATE_STATE, "provider-attempts");
  const attemptFiles = existsSync(attemptDir) ? readdirSync(attemptDir).filter((name) => /^attempt-[0-9]+\.json$/.test(name)) : [];
  if (attemptFiles.length !== 0) throw new Error("a durable provider email attempt exists; refusing continuation");
  if (!existsSync(resolve(FIXTURE, "marker.json"))) throw new Error("the original isolated A20 fixture is unavailable for failure classification");
  const initial = verifySyntheticPostgres();
  const sql = `SELECT json_build_object(
    'businessId',d.business_id::text,'visitId',d.visit_id::text,'deliveryId',d.id::text,
    'state',d.state,'sendAttemptCount',d.send_attempt_count,'providerMessageIdPresent',d.provider_message_id IS NOT NULL,
    'knownGuardRejection',d.error_message='A10 live Resend idempotency key does not match its delivery tag',
    'events',(SELECT count(*) FROM public.booster_delivery_events e WHERE e.delivery_id=d.id),
    'suppressions',(SELECT count(*) FROM public.booster_delivery_suppressions),
    'visits',(SELECT count(*) FROM public.followup_visits),
    'deliveries',(SELECT count(*) FROM public.booster_followup_deliveries)
  )::text FROM public.booster_followup_deliveries d WHERE d.business_id=${sqlLiteral(OWNER_BUSINESS)}::uuid;`;
  const row = JSON.parse(psql(sql, initial.port));
  if (row.businessId !== OWNER_BUSINESS || !safeId(row.visitId) || !safeId(row.deliveryId) || row.state !== "unknown" ||
      row.sendAttemptCount !== 1 || row.providerMessageIdPresent !== false || row.knownGuardRejection !== true ||
      row.events !== 0 || row.suppressions !== 0 || row.visits !== 1 || row.deliveries !== 1) {
    throw new Error("retained A20 database does not match the one known preprovider guard rejection; preserving it for review");
  }
  // The canonical fixture cleanup removes .a20-fixture, including its verified build
  // receipt. Preserve that non-secret provenance first; the exact receipt is rechecked
  // against the current app source and .next tree after the fresh fixture is staged.
  const verifiedBuild = readBuildReceipt();
  if (!verifiedBuild || verifiedBuild.buildId !== prior.app?.buildId || verifiedBuild.buildHash !== prior.app?.buildHash ||
      verifiedBuild.candidateCommit !== prior.app?.candidateCommit) {
    throw new Error("the prior verified local app build cannot be validated before fixture cleanup");
  }
  savePrivateJson(continuationBuildPath, verifiedBuild);
  await secureA10PrivateFile(continuationBuildPath);
  const diagnostic = {
    schema: "ornigami.a10.live-preprovider-diagnostic.v1",
    status: "known_pre_provider_failure",
    originalIntentPreserved: true,
    oldVisitId: row.visitId,
    oldDeliveryId: row.deliveryId,
    oldDeliveryState: row.state,
    oldSendAttemptCount: row.sendAttemptCount,
    causeClass: "guard-idempotency-key-format-mismatch",
    providerEmailAttempts: 0,
    providerMessageIdPresent: false,
    eventCount: row.events,
    suppressionCount: row.suppressions,
    endpointDeleted: prior.endpoint.deleted,
    publicVerifierProbeStatus: prior.publicWebhookProbe.status,
    appStopped: prior.app.stopConfirmed,
    tunnelClosed: !prior.tunnelStarted,
    originalBuildId: prior.app.buildId,
    originalBuildHash: prior.app.buildHash,
    originalCandidateCommit: prior.app.candidateCommit,
    verifiedAt: new Date().toISOString(),
    oldFixtureRemoved: false,
    freshFixturePrepared: false,
  };
  savePrivateJson(diagnosticPath, diagnostic);
  await secureA10PrivateFile(diagnosticPath);

  runCanonicalFixture("cleanup", childEnvironment());
  if (existsSync(resolve(FIXTURE, "marker.json"))) throw new Error("old isolated A20 database cleanup did not remove its fixture marker");
  diagnostic.oldFixtureRemoved = true;
  writeFileSync(diagnosticPath, `${JSON.stringify(diagnostic, null, 2)}\n`, { flag: "w", mode: 0o600 });
  await secureA10PrivateFile(diagnosticPath);
  const setup = parseLastJson(runCanonicalFixture("setup", childEnvironment()));
  await stageA10LiveAdapters({ workspaceRoot: ROOT, sourceRoot: ROOT });
  const preservedBuild = JSON.parse(readFileSync(continuationBuildPath, "utf8"));
  writeFileSync(BUILD_RECEIPT, `${JSON.stringify(preservedBuild, null, 2)}\n`, { flag: "wx", mode: 0o600 });
  await secureA10PrivateFile(BUILD_RECEIPT);
  const build = readBuildReceipt();
  if (!build || build.buildId !== diagnostic.originalBuildId || build.buildHash !== diagnostic.originalBuildHash || build.candidateCommit !== diagnostic.originalCandidateCommit) {
    throw new Error("the exact previously verified app build/source receipt cannot be reused for continuation");
  }
  const fresh = verifySyntheticPostgres({ requireFresh: true });
  diagnostic.freshFixturePrepared = true;
  diagnostic.freshPostgresHost = fresh.identity.host;
  diagnostic.freshPostgresDatabase = fresh.identity.database;
  diagnostic.freshPostgresVersion = setup.pgVersion ?? null;
  diagnostic.freshMigrationCount = Array.isArray(setup.migrations) ? setup.migrations.length : null;
  diagnostic.preparedAt = new Date().toISOString();
  writeFileSync(diagnosticPath, `${JSON.stringify(diagnostic, null, 2)}\n`, { flag: "w", mode: 0o600 });
  await secureA10PrivateFile(diagnosticPath);
  return Object.freeze({ status: "known_preprovider_failure_archived_fresh_fixture_prepared", oldVisitId: diagnostic.oldVisitId, oldDeliveryId: diagnostic.oldDeliveryId, providerEmailAttempts: 0, freshDatabase: fresh.identity.database, migrationCount: diagnostic.freshMigrationCount, reusedBuildId: build.buildId });
}

async function waitForEvidence(read, predicate, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  let latest;
  while (Date.now() < deadline) {
    latest = await read();
    if (predicate(latest)) return latest;
    await new Promise((resolveWait) => setTimeout(resolveWait, 2_000));
  }
  throw new Error(`A10 live event evidence timed out${latest?.deliveryState ? ` (${latest.deliveryState})` : ""}`);
}

async function waitForWebhookEvidence(read, predicate, eventType, receipts, timeoutMs = 120_000) {
  return waitForEvidence(read, (row) => {
    if (!predicate(row)) return false;
    const matching = row.events.find((event) => event.evidenceSource === "webhook" && eventType === event.eventType);
    return Boolean(matching && receipts().some((receipt) => receipt.svixId === matching.providerEventId && receipt.status === 200));
  }, timeoutMs);
}

async function probePublicWebhook(url) {
  let lastStatus = null;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: "POST", redirect: "manual", signal: AbortSignal.timeout(20_000),
        headers: { "content-type": "application/json", "svix-id": `msg_probe_${randomBytes(8).toString("hex")}`, "svix-timestamp": String(Math.floor(Date.now() / 1000)), "svix-signature": "v1,invalid" },
        body: "{}",
      });
      void response.body?.cancel().catch(() => undefined);
      lastStatus = response.status;
      if (lastStatus === 401) return { status: lastStatus, reachedApplicationVerifier: true, attempts: attempt + 1 };
    } catch { /* Retry only this unauthenticated reachability probe. */ }
    await new Promise((resolveWait) => setTimeout(resolveWait, 2_000));
  }
  throw new Error(`public HTTPS webhook did not reach the application verifier (last HTTP status ${lastStatus ?? "unavailable"})`);
}

async function readWebhookSecret(path) {
  const { checkPrivateArtifact } = await import("./a12-support-access-verify.mjs");
  await checkPrivateArtifact(path);
  const text = readFileSync(path, "utf8");
  const match = /^RESEND_WEBHOOK_SECRET=(whsec_[A-Za-z0-9+/]+=*)\r?\n?$/.exec(text);
  if (!match) throw new Error("A10 task webhook signing secret file is invalid");
  return match[1];
}

async function createLiveAcceptance(args, { continuation = false } = {}) {
  const credentialFlag = args.indexOf("--credential-env");
  if (credentialFlag < 0 || !args[credentialFlag + 1] || args.length !== credentialFlag + 2) {
    throw new Error("Usage: run-live --credential-env <private source env file>");
  }
  const continuationDiagnosticPath = resolve(PRIVATE_STATE, "pre-continuation-diagnostic.json");
  const continuationIntentPath = resolve(PRIVATE_STATE, "continuation-1-intent.json");
  if (!continuation && existsSync(resolve(PRIVATE_STATE, "run-intent.json"))) throw new Error("A10 live run intent already exists; reconcile the prior attempt instead of retrying");
  if (continuation) {
    if (!existsSync(resolve(PRIVATE_STATE, "run-intent.json")) || !existsSync(resolve(PRIVATE_STATE, "live-acceptance-receipt.json")) ||
        !existsSync(continuationDiagnosticPath) || existsSync(continuationIntentPath)) {
      throw new Error("A10 continuation requires a preserved original intent, failed receipt and fresh diagnostic without a prior continuation intent");
    }
    const diagnostic = JSON.parse(readFileSync(continuationDiagnosticPath, "utf8"));
    const prior = JSON.parse(readFileSync(resolve(PRIVATE_STATE, "live-acceptance-receipt.json"), "utf8"));
    if (diagnostic.schema !== "ornigami.a10.live-preprovider-diagnostic.v1" || diagnostic.status !== "known_pre_provider_failure" ||
        diagnostic.freshFixturePrepared !== true || diagnostic.providerEmailAttempts !== 0 || prior.providerSendAttempts !== 0 || prior.endpoint?.deleted !== true) {
      throw new Error("A10 continuation proof does not establish a fresh fixture and zero prior provider email attempts");
    }
    const attemptDir = resolve(PRIVATE_STATE, "provider-attempts");
    const attemptFiles = existsSync(attemptDir) ? readdirSync(attemptDir).filter((name) => /^attempt-[0-9]+\.json$/.test(name)) : [];
    if (attemptFiles.length !== 0) throw new Error("a durable provider email attempt exists; refusing continuation");
  }
  const build = readBuildReceipt();
  if (!build) throw new Error("A verified local Next build receipt is required for live acceptance");
  const database = verifySyntheticPostgres({ requireFresh: true });
  const credentialPath = resolve(args[credentialFlag + 1]);
  const credentialStat = lstatSync(credentialPath);
  if (!credentialStat.isFile() || credentialStat.isSymbolicLink() || realpathSync(credentialPath) !== credentialPath) throw new Error("A10 credential source must be a regular nonsymlink file");
  const apiKey = readA10LiveResendApiKey(credentialPath);
  const ownedRecipient = await readOwnedRecipient();
  if (existsSync(resolve(FIXTURE, "runtime.json"))) throw new Error("A20 app runtime already exists; stop it before live acceptance");

  await stageA10LiveAdapters({ workspaceRoot: ROOT, sourceRoot: ROOT });
  let runIntentPath;
  if (continuation) {
    savePrivateJson(continuationIntentPath, { schema: "ornigami.a10.live-continuation-intent.v1", status: "started", originalIntentPreserved: true, causeClass: "guard-idempotency-key-format-mismatch", createdAt: new Date().toISOString() });
    await secureA10PrivateFile(continuationIntentPath);
    runIntentPath = continuationIntentPath;
  } else runIntentPath = await createA10LiveRunIntent(ROOT);
  const eventReceipts = [];
  let webhookProxy;
  let tunnel;
  let appStarted = false;
  let apiEndpoint;
  let endpointHost;
  let endpointReceiptPath;
  let endpointStateDir = resolve(PRIVATE_STATE, continuation ? "provider-create-2" : "provider-create");
  const liveReceiptPath = resolve(PRIVATE_STATE, continuation ? "live-acceptance-continuation-1.json" : "live-acceptance-receipt.json");
  let createAttempted = false;
  let appEnv;
  let finalStatus = "incomplete";
  const report = {
    schema: "ornigami.a10.live-resend-acceptance.v1",
    status: "running",
    ...(continuation ? { continuationOf: "known_pre_provider_failure", oldAttemptNotRetried: true } : {}),
    recipientLabels: [],
    endpoint: null,
    publicWebhookProbe: null,
    app: { postgresDatabase: database.identity.database, postgresHost: database.identity.host, syntheticUsers: database.counts.users, syntheticBusinesses: database.counts.businesses },
    deliveries: [],
    tunnelStarted: false,
    tunnelEverStarted: false,
    tunnelClosed: false,
    endpointCreated: false,
    providerSendAttempts: 0,
    completedAt: null,
  };
  try {
    const appUrl = `http://127.0.0.1:${build.appPort}`;
    webhookProxy = await createA10WebhookProxy({ appBaseUrl: appUrl, onReceipt: (receipt) => eventReceipts.push(receipt) });
    tunnel = await startA10LiveTunnel({ workspaceRoot: ROOT, webhookProxy });
    report.tunnelStarted = true;
    report.tunnelEverStarted = true;
    endpointHost = new URL(tunnel.webhookUrl).hostname;
    const beforeCreate = await listA10LiveWebhooks(apiKey);
    if (beforeCreate.hasMore || beforeCreate.endpoints.some((item) => item.host.toLowerCase() === endpointHost.toLowerCase())) throw new Error("unique A10 Quick Tunnel host metadata is not complete or is already in use; refusing endpoint creation");
    await secureA10PrivateDirectory(endpointStateDir);
    createAttempted = true;
    apiEndpoint = await createA10Endpoint({ endpoint: tunnel.webhookUrl, apiKey, isolatedTarget: true, stateDir: endpointStateDir });
    report.endpointCreated = true;
    endpointReceiptPath = resolve(PRIVATE_STATE, continuation ? "webhook-cleanup-receipt-2.json" : "webhook-cleanup-receipt.json");
    const cleanupReceipt = { schema: "ornigami.a10.live-webhook-receipt.v1", status: "created", webhookId: apiEndpoint.webhookId, endpointHost, events: [...A10_RESEND_EVENTS], createdAt: new Date().toISOString() };
    savePrivateJson(endpointReceiptPath, cleanupReceipt);
    await secureA10PrivateFile(endpointReceiptPath);
    const metadata = await listA10LiveWebhooks(apiKey);
    verifyA10LiveWebhookPin(metadata, { webhookId: apiEndpoint.webhookId, endpointHost, events: A10_RESEND_EVENTS });
    const webhookSecret = await readWebhookSecret(apiEndpoint.secretPath);

    appEnv = childEnvironment({
      A10_LIVE_APP_PORT: String(build.appPort), A10_LIVE_REUSE_BUILD: "1",
      A10_TASK_AUTH_SECRET: randomBytes(32).toString("base64url"),
      A10_TASK_TOKEN_KEY: randomBytes(32).toString("base64url"),
      A10_TASK_UNSUBSCRIBE_SECRET: randomBytes(32).toString("base64url"),
      A10_LIVE_RESEND_API_KEY: apiKey, A10_LIVE_RESEND_WEBHOOK_SECRET: webhookSecret,
      A10_LIVE_EMAIL_FROM: SENDER, A10_LIVE_OWNED_RECIPIENT: ownedRecipient,
    });
    appStarted = true;
    const startReceipt = parseLastJson(runFixture("start", appEnv));
    if (startReceipt.url !== appUrl || startReceipt.buildHash !== build.buildHash || startReceipt.buildId !== build.buildId) {
      throw new Error("live acceptance app did not use the verified local build and selected loopback port");
    }
    report.app.appPort = build.appPort;
    report.app.buildId = build.buildId;
    report.app.buildHash = build.buildHash;
    report.app.buildTree = build.buildTree;
    report.app.candidateCommit = build.candidateCommit;
    report.publicWebhookProbe = await probePublicWebhook(tunnel.webhookUrl);
    eventReceipts.length = 0;

    const owner = await authenticateA10FixtureOwner({ appUrl, credentialsPath: resolve(FIXTURE, "credentials.json") });
    const createdAt = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    const firstVisit = await createA10SyntheticVisit(owner, { recipient: ownedRecipient, label: "owned-test-inbox", visitedAt: createdAt });
    const firstRun = await runA10AuthenticatedNow(owner);
    if (firstRun.sent !== 1 || firstRun.failed !== 0 || firstRun.unknown !== 0 || firstRun.deferred !== 0) throw new Error("owner run-now did not report exactly one successful provider handoff");
    const firstEvidence = await waitForWebhookEvidence(() => readSafeDeliveryEvidence(OWNER_BUSINESS, firstVisit.visitId, { expectedTerminalStatus: "delivered" }), (row) =>
      row?.delivery.state === "accepted" && row.delivery.deliveryStatus === "delivered" && typeof row.delivery.providerMessageId === "string" && row.proof.terminalEventMatched === true && row.quota.usage === 1,
      "email.delivered", () => eventReceipts);
    const firstAttempt = readProviderAttempts()[0];
    if (!firstAttempt || firstAttempt.status !== "accepted" || firstAttempt.providerMessageId !== firstEvidence.delivery.providerMessageId) throw new Error("first provider response could not be reconciled to the durable guarded attempt");
    const firstProvider = await getA10LiveEmailEvidence(apiKey, firstEvidence.delivery.providerMessageId, { recipient: ownedRecipient, deliveryId: firstEvidence.delivery.id, senderDomain: SENDER_DOMAIN });
    if (firstProvider.lastEvent !== "delivered" || !firstProvider.recipientMatch || !firstProvider.deliveryTagMatch || !firstProvider.expectedSenderDomainMatch) throw new Error("Resend GET email evidence did not match the controlled first delivery");
    const expectedReviewHash = createHash("sha256").update(OWNER_REVIEW_URL, "utf8").digest("hex");
    if (!firstEvidence.snapshots.reviewUrlPresent || firstEvidence.snapshots.reviewUrlSha256 !== expectedReviewHash) throw new Error("owner delivery did not preserve the canonical synthetic review URL snapshot");
    const firstEvent = firstEvidence.events.find((event) => event.eventType === "email.delivered" && event.evidenceSource === "webhook");
    if (!eventReceipts.some((receipt) => receipt.svixId === firstEvent.providerEventId && receipt.status === 200)) throw new Error("the public proxy did not record the accepted signed delivery callback");
    const firstProxyReceipt = eventReceipts.find((receipt) => receipt.svixId === firstEvent.providerEventId && receipt.status === 200);
    report.deliveries.push({ recipientLabel: "owned-test-inbox", visitId: firstVisit.visitId, deliveryId: firstEvidence.delivery.id, providerMessageId: firstEvidence.delivery.providerMessageId, deliveryStatus: firstEvidence.delivery.deliveryStatus, terminalEvidenceMatched: firstEvidence.proof.terminalEventMatched, runNow: firstRun, eventId: firstEvent.providerEventId, eventCreatedAt: firstEvent.eventCreatedAt, eventReceivedAt: firstEvent.receivedAt, proxyReceivedAt: firstProxyReceipt.receivedAt, webhookStatus: 200, providerLastEvent: firstProvider.lastEvent, providerRecipientMatch: firstProvider.recipientMatch, providerTagMatch: firstProvider.deliveryTagMatch, senderDomainMatch: firstProvider.expectedSenderDomainMatch, quotaUsage: firstEvidence.quota.usage, quotaAllowance: firstEvidence.quota.allowance, reviewSnapshotPresent: firstEvidence.snapshots.reviewUrlPresent, reviewSnapshotSha256: firstEvidence.snapshots.reviewUrlSha256 });

    const bounceVisit = await createA10SyntheticVisit(owner, { recipient: "bounced@resend.dev", label: "resend-bounce-test", visitedAt: createdAt });
    const bounceRun = await runA10AuthenticatedNow(owner);
    if (bounceRun.sent !== 1 || bounceRun.failed !== 0 || bounceRun.unknown !== 0) throw new Error("controlled bounce run did not report exactly one successful provider handoff");
    const bounceEvidence = await waitForWebhookEvidence(() => readSafeDeliveryEvidence(OWNER_BUSINESS, bounceVisit.visitId, { expectedTerminalStatus: "bounced" }), (row) =>
      row?.delivery.state === "accepted" && row.delivery.deliveryStatus === "bounced" && typeof row.delivery.providerMessageId === "string" && row.suppression.present && row.proof.terminalEventMatched === true && row.quota.usage === 2,
      "email.bounced", () => eventReceipts);
    const secondAttempt = readProviderAttempts()[1];
    if (!secondAttempt || secondAttempt.status !== "accepted" || secondAttempt.providerMessageId !== bounceEvidence.delivery.providerMessageId) throw new Error("bounce provider response did not match the second and final guarded attempt");
    const bounceProvider = await getA10LiveEmailEvidence(apiKey, bounceEvidence.delivery.providerMessageId, { recipient: "bounced@resend.dev", deliveryId: bounceEvidence.delivery.id, senderDomain: SENDER_DOMAIN });
    if (bounceProvider.lastEvent !== "bounced" || !bounceProvider.recipientMatch || !bounceProvider.deliveryTagMatch || !bounceProvider.expectedSenderDomainMatch) throw new Error("Resend GET email evidence did not match the controlled bounce delivery");
    const bounceEvent = bounceEvidence.events.find((event) => event.eventType === "email.bounced" && event.evidenceSource === "webhook");
    if (!eventReceipts.some((receipt) => receipt.svixId === bounceEvent.providerEventId && receipt.status === 200)) throw new Error("the public proxy did not record the accepted signed bounce callback");
    const bounceProxyReceipt = eventReceipts.find((receipt) => receipt.svixId === bounceEvent.providerEventId && receipt.status === 200);
    report.deliveries.push({ recipientLabel: "resend-bounce-test", visitId: bounceVisit.visitId, deliveryId: bounceEvidence.delivery.id, providerMessageId: bounceEvidence.delivery.providerMessageId, deliveryStatus: bounceEvidence.delivery.deliveryStatus, terminalEvidenceMatched: bounceEvidence.proof.terminalEventMatched, runNow: bounceRun, eventId: bounceEvent.providerEventId, eventCreatedAt: bounceEvent.eventCreatedAt, eventReceivedAt: bounceEvent.receivedAt, proxyReceivedAt: bounceProxyReceipt.receivedAt, webhookStatus: 200, providerLastEvent: bounceProvider.lastEvent, providerRecipientMatch: bounceProvider.recipientMatch, providerTagMatch: bounceProvider.deliveryTagMatch, senderDomainMatch: bounceProvider.expectedSenderDomainMatch, quotaUsage: bounceEvidence.quota.usage, quotaAllowance: bounceEvidence.quota.allowance, suppressionCount: bounceEvidence.suppression.count });

    const outsiderEntitlementCount = Number(psql(`SELECT count(*) FROM public.business_agents WHERE business_id=${sqlLiteral(OUTSIDER_BUSINESS)}::uuid AND agent_id='review_booster';`, database.port));
    if (outsiderEntitlementCount !== 0) throw new Error("A10 outsider fixture already had an entitlement row; refusing to alter preexisting synthetic state");
    psql(`INSERT INTO public.business_agents(business_id,agent_id,status,plan_id,billing_period,current_period_start,current_period_end,activated_at) VALUES (${sqlLiteral(OUTSIDER_BUSINESS)}::uuid,'review_booster','active','complete','monthly',now()-interval '1 day',now()+interval '29 days',now()-interval '1 day');`, database.port);
    const outsider = await authenticateA10FixtureOwner({ appUrl, credentialsPath: resolve(FIXTURE, "credentials.json"), actorRole: "outsider" });
    const suppressedVisit = await createA10SyntheticVisit(outsider, { recipient: "bounced@resend.dev", label: "resend-bounce-test", visitedAt: createdAt });
    const attemptsBeforeSuppressionCheck = readProviderAttempts().length;
    const suppressedRun = await runA10AuthenticatedNow(outsider);
    const suppressionCheck = readOutsiderSuppressionEvidence(suppressedVisit.visitId, "bounced@resend.dev");
    if (suppressedRun.sent !== 0 || suppressedRun.failed !== 0 || suppressedRun.unknown !== 0 || suppressedRun.deferred !== 0 || suppressedRun.skipped < 1 ||
        suppressionCheck.visitStatus !== "skipped" || Number(suppressionCheck.suppressionCount) < 1 || Number(suppressionCheck.deliveryRows) > 1 ||
        (Number(suppressionCheck.deliveryRows) === 1 && (!Array.isArray(suppressionCheck.deliveryStates) || suppressionCheck.deliveryStates.some((state) => state !== "non_sendable"))) ||
        Number(suppressionCheck.quotaUsage) !== 0 || readProviderAttempts().length !== attemptsBeforeSuppressionCheck) {
      throw new Error("cross-business suppression did not skip the controlled recipient without a provider attempt or quota use");
    }
    report.crossBusinessSuppression = {
      visitId: suppressedVisit.visitId, recipientLabel: "resend-bounce-test", runNow: suppressedRun,
      visitStatus: suppressionCheck.visitStatus, suppressionCount: Number(suppressionCheck.suppressionCount),
      deliveryRows: Number(suppressionCheck.deliveryRows), deliveryStates: suppressionCheck.deliveryStates,
      quotaUsage: Number(suppressionCheck.quotaUsage), quotaAllowance: Number(suppressionCheck.quotaAllowance),
      providerAttemptsBefore: attemptsBeforeSuppressionCheck, providerAttemptsAfter: readProviderAttempts().length,
    };
    report.providerSendAttempts = readProviderAttempts().length;
    if (report.providerSendAttempts !== 2) throw new Error("live provider attempt ledger did not contain exactly two bounded sends");
    report.recipientLabels = ["owned-test-inbox", "resend-bounce-test"];
    finalStatus = "live_delivery_and_bounce_verified";
    report.status = finalStatus;
    report.status = "verified_cleanup_pending";
    report.verifiedAt = new Date().toISOString();
    try {
      const verifiedReceiptPath = liveReceiptPath;
      savePrivateJson(verifiedReceiptPath, report);
      await secureA10PrivateFile(verifiedReceiptPath);
    } catch {
      finalStatus = "verified_receipt_persist_pending";
      throw new Error("live evidence was verified but could not be durably recorded before cleanup");
    }
  } finally {
    if (!apiEndpoint && createAttempted && tunnel && endpointHost) {
      try {
        const listed = await listA10LiveWebhooks(apiKey);
        const expected = new Set(A10_RESEND_EVENTS);
        const exact = listed.endpoints.filter((item) => item.host.toLowerCase() === endpointHost.toLowerCase() && item.events.length === expected.size && item.events.every((event) => expected.has(event)));
        if (!listed.hasMore && exact.length === 1) {
          apiEndpoint = { webhookId: exact[0].id };
          endpointReceiptPath = resolve(PRIVATE_STATE, continuation ? "webhook-cleanup-receipt-2.json" : "webhook-cleanup-receipt.json");
          savePrivateJson(endpointReceiptPath, { schema: "ornigami.a10.live-webhook-receipt.v1", status: "created", webhookId: exact[0].id, endpointHost, events: [...A10_RESEND_EVENTS], createdAt: new Date().toISOString(), recoveredByExactUniqueHost: true });
          await secureA10PrivateFile(endpointReceiptPath);
        } else {
          report.endpoint = { host: endpointHost, cleanupPending: true, matchingEndpointCount: exact.length };
          finalStatus = finalStatus === "incomplete" ? "endpoint_create_outcome_unknown" : `${finalStatus}_endpoint_create_outcome_unknown`;
        }
      } catch { report.endpoint = { host: endpointHost, cleanupPending: true, creationOutcome: "unknown" }; finalStatus = finalStatus === "incomplete" ? "endpoint_create_outcome_unknown" : `${finalStatus}_endpoint_create_outcome_unknown`; }
    }
    if (apiEndpoint && endpointReceiptPath && !existsSync(endpointReceiptPath)) {
      try {
        savePrivateJson(endpointReceiptPath, { schema: "ornigami.a10.live-webhook-receipt.v1", status: "created", webhookId: apiEndpoint.webhookId, endpointHost, events: [...A10_RESEND_EVENTS], recoveredAfterReceiptWriteFailure: true });
        await secureA10PrivateFile(endpointReceiptPath);
      } catch { finalStatus = finalStatus === "incomplete" ? "cleanup_pending" : `${finalStatus}_cleanup_pending`; }
    }
    if (apiEndpoint && endpointReceiptPath) {
      try {
        const deletion = await deleteA10LiveWebhook(apiKey, endpointReceiptPath, { expectedHost: endpointHost, events: A10_RESEND_EVENTS });
        report.endpoint = { webhookId: deletion.webhookId, host: deletion.host, events: [...A10_RESEND_EVENTS], deleted: deletion.deleted };
      } catch { report.endpoint = { webhookId: apiEndpoint.webhookId, host: endpointHost, deleted: false, cleanupPending: true }; finalStatus = finalStatus === "incomplete" ? "cleanup_pending" : `${finalStatus}_cleanup_pending`; }
    }
    if (appStarted) {
      try { runFixture("stop", childEnvironment()); report.app.stopConfirmed = true; }
      catch { report.app.stopConfirmed = false; finalStatus = finalStatus === "incomplete" ? "cleanup_pending" : `${finalStatus}_cleanup_pending`; }
    }
    if (finalStatus === "live_delivery_and_bounce_verified" && report.app.stopConfirmed && existsSync(resolve(FIXTURE, "marker.json"))) {
      try { runFixture("cleanup", childEnvironment()); report.app.syntheticDatabaseRemoved = true; }
      catch { report.app.syntheticDatabaseRemoved = false; finalStatus = finalStatus === "incomplete" ? "cleanup_pending" : `${finalStatus}_cleanup_pending`; }
    }
    if (tunnel) {
      try { await tunnel.close(); report.tunnelStarted = false; report.tunnelClosed = true; }
      catch { report.tunnelCleanupPending = true; finalStatus = finalStatus === "incomplete" ? "cleanup_pending" : `${finalStatus}_cleanup_pending`; }
    }
    if (webhookProxy) {
      try { await webhookProxy.close(); }
      catch { report.proxyCleanupPending = true; finalStatus = finalStatus === "incomplete" ? "cleanup_pending" : `${finalStatus}_cleanup_pending`; }
    }
    report.providerSendAttempts = readProviderAttempts().length;
    if (report.endpoint?.deleted === true && report.app.stopConfirmed === true) {
      try {
        const { checkPrivateArtifact } = await import("./a12-support-access-verify.mjs");
        const secretFile = resolve(endpointStateDir, "webhook-secret.env");
        if (existsSync(secretFile)) {
          await checkPrivateArtifact(secretFile);
          if (realpathSync(secretFile) !== secretFile || lstatSync(secretFile).isSymbolicLink()) throw new Error();
          unlinkSync(secretFile);
        }
        const recipientFile = resolve(PRIVATE_STATE, "owned-recipient.txt");
        if (existsSync(recipientFile)) {
          await checkPrivateArtifact(recipientFile);
          if (realpathSync(recipientFile) !== recipientFile || lstatSync(recipientFile).isSymbolicLink()) throw new Error();
          unlinkSync(recipientFile);
        }
        appEnv = undefined;
        report.taskSecretsRemoved = true;
      } catch { report.taskSecretsRemoved = false; finalStatus = finalStatus === "incomplete" ? "cleanup_pending" : `${finalStatus}_cleanup_pending`; }
    }
    report.status = finalStatus;
    report.completedAt = new Date().toISOString();
    try {
      savePrivateJson(liveReceiptPath, report, false);
      await secureA10PrivateFile(liveReceiptPath);
      const intent = JSON.parse(readFileSync(runIntentPath, "utf8"));
      intent.status = finalStatus;
      intent.completedAt = report.completedAt;
      writeFileSync(runIntentPath, `${JSON.stringify(intent, null, 2)}\n`, { flag: "w", mode: 0o600 });
      await secureA10PrivateFile(runIntentPath);
    } catch { finalStatus = finalStatus === "incomplete" ? "receipt_persist_pending" : `${finalStatus}_receipt_persist_pending`; }
  }
  if (finalStatus !== "live_delivery_and_bounce_verified") throw new Error(`A10 live acceptance did not complete cleanly (${finalStatus}); inspect only the private sanitized receipt`);
  return report;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const action = process.argv[2];
  if (action !== "prepare-local" && action !== "preflight-local" && action !== "prepare-known-preprovider" && action !== "seed-build" && action !== "run-live" && action !== "continue-live") {
    console.error("Usage: node scripts/a10-live-resend-runner.mjs <prepare-local|preflight-local|prepare-known-preprovider|seed-build ...|run-live|continue-live --credential-env <private env file>>");
    process.exitCode = 2;
  } else {
    (action === "prepare-local" ? prepareA10LocalSyntheticApp()
      : action === "preflight-local" ? preflightA10AuthenticatedApp()
      : action === "prepare-known-preprovider" ? prepareKnownPreproviderContinuation()
      : action === "run-live" ? createLiveAcceptance(process.argv.slice(3))
      : action === "continue-live" ? createLiveAcceptance(process.argv.slice(3), { continuation: true })
      : seedKnownBuildReceipt(process.argv.slice(3)))
      .then((receipt) => process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`))
      .catch((error) => {
        console.error(error instanceof Error ? error.message : "A10 local preparation failed");
        process.exitCode = 1;
      });
  }
}
