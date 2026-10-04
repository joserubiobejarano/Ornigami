import { createHash, createHmac, randomBytes } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, isAbsolute, join, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { validateA20Marker, validateA20PostgresIdentity } from "./a20-app-fixture-core.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURE = resolve(ROOT, ".a20-fixture");
const ADAPTER_DIR = resolve(FIXTURE, "a10-runtime");
const ADAPTER = resolve(ADAPTER_DIR, "a20-app-fixture.mjs");
const FIXTURE_SOURCE = resolve(ROOT, "scripts/a20-app-fixture.mjs");
const PRELOAD = resolve(ROOT, "scripts/a20-preload.mjs");
const DATABASE = "a20_browser_fixture";
const IDS = {
  business: "a2000000-0000-4000-8000-000000000003",
  outsiderBusiness: "a2000000-0000-4000-8000-000000000005",
  visitPrefix: "aa100000-0000-4000-8000-0000000001",
  deliveryPrefix: "aa100000-0000-4000-8000-0000000002",
};

const SOURCE_ROOT_LINE = 'const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");';
const SOURCE_CORE_IMPORT = 'from "./a20-app-fixture-core.mjs"';
const INVALID_SECRET_LINE = 'RESEND_WEBHOOK_SECRET: "a20_local_only_resend_secret_never_valid",';
const SECRET_OVERRIDE_LINE = 'RESEND_WEBHOOK_SECRET: process.env.A10_RESEND_WEBHOOK_SECRET,';

export function adaptA20FixtureSource(source, { root, coreModuleUrl }) {
  const checks = [
    ["fixture root declaration", SOURCE_ROOT_LINE],
    ["fixture core import", SOURCE_CORE_IMPORT],
    ["invalid local Resend secret", INVALID_SECRET_LINE],
  ];
  for (const [label, fragment] of checks) {
    const count = source.split(fragment).length - 1;
    if (count !== 1) throw new Error(`A20 fixture adaptation refused: expected one ${label} fragment, found ${count}`);
  }
  let coreUrl;
  try { coreUrl = new URL(coreModuleUrl); } catch { throw new Error("A20 fixture adaptation requires an absolute root and file URL"); }
  if (!isAbsolute(root) || coreUrl.protocol !== "file:") throw new Error("A20 fixture adaptation requires an absolute root and file URL");
  return source
    .replace(SOURCE_ROOT_LINE, `const ROOT = ${JSON.stringify(resolve(root))};`)
    .replace(SOURCE_CORE_IMPORT, `from ${JSON.stringify(coreModuleUrl)}`)
    .replace(INVALID_SECRET_LINE, SECRET_OVERRIDE_LINE);
}

function privateWrite(path, value) {
  writeFileSync(path, value, { mode: 0o600 });
  if (process.platform !== "win32") chmodSync(path, 0o600);
}

function cleanChildEnv(extra = {}) {
  const keep = ["PATH", "SystemRoot", "ComSpec", "TEMP", "TMP", "WINDIR", "A20_PG_BIN"];
  const inherited = Object.fromEntries(keep.filter((key) => process.env[key]).map((key) => [key, process.env[key]]));
  const pgBin = process.env.A10_PG_BIN ?? process.env.A20_PG_BIN;
  if (pgBin) inherited.A20_PG_BIN = pgBin;
  return { ...inherited, ...extra };
}

function run(command, args, { env = cleanChildEnv(), input, timeout = 180_000, maxBuffer = 4 * 1024 * 1024 } = {}) {
  const result = spawnSync(command, args, { cwd: ROOT, encoding: "utf8", windowsHide: true, env, input, timeout, maxBuffer });
  if (result.error || result.status !== 0) {
    const details = `${String(result.stderr ?? "")}\n${String(result.stdout ?? "")}`.trim();
    throw new Error(`${command} ${args.join(" ")} failed (${result.status ?? result.error?.message ?? "spawn error"})${details ? `: ${details.slice(-8000)}` : ""}`);
  }
  return String(result.stdout ?? "").trim();
}

function fixtureAction(action, secret) {
  return run(process.execPath, [ADAPTER, action], {
    env: cleanChildEnv(secret ? { A10_RESEND_WEBHOOK_SECRET: secret } : {}),
    timeout: action === "start" ? 900_000 : 180_000,
    maxBuffer: 8 * 1024 * 1024,
  });
}

function psql(sql, port) {
  const configuredBin = process.env.A10_PG_BIN ?? process.env.A20_PG_BIN;
  const pgBin = configuredBin ?? "C:/Program Files/PostgreSQL/17/bin";
  const executable = process.platform === "win32" ? join(pgBin, "psql.exe") : configuredBin ? join(pgBin, "psql") : "psql";
  const env = cleanChildEnv({ PGCLIENTENCODING: "UTF8", PGSERVICEFILE: resolve(FIXTURE, "no-pg-service.conf"), PGPASSFILE: resolve(FIXTURE, "no-pgpass") });
  return run(executable, ["-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-h", "127.0.0.1", "-p", String(port), "-U", "postgres", "-d", DATABASE, "-f", "-"], { input: sql, env, timeout: 60_000 });
}

function sqlQuote(value) { return `'${String(value).replaceAll("'", "''")}'`; }
function uuid(prefix, suffix) { return `${prefix}${String(suffix).padStart(2, "0")}`; }

function makeSecret() {
  return `whsec_${randomBytes(32).toString("base64")}`;
}

function signRequest(url, rawBody, { secret, id, timestamp = Math.floor(Date.now() / 1000), suffix = "", overrideSignature } = {}) {
  const key = Buffer.from(secret.slice("whsec_".length), "base64");
  const digest = createHmac("sha256", key).update(`${id}.${timestamp}.${rawBody}`, "utf8").digest("base64");
  const signature = overrideSignature ?? `v1,${digest}`;
  return fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", "svix-id": id, "svix-timestamp": String(timestamp), "svix-signature": signature },
    body: rawBody + suffix,
    redirect: "manual",
    signal: AbortSignal.timeout(10_000),
  });
}

function eventPayload(type, deliveryId, recipient, providerId, createdAt = "2026-10-03T12:00:00.000Z") {
  return {
    type,
    created_at: createdAt,
    data: { email_id: providerId, to: [recipient], tags: { ornigami_delivery_id: deliveryId } },
  };
}

async function assertJson(response, expected, label) {
  const actual = await response.json();
  if (response.status !== expected.status || JSON.stringify(actual) !== JSON.stringify(expected.body)) {
    throw new Error(`${label}: expected HTTP ${expected.status} ${JSON.stringify(expected.body)}, received HTTP ${response.status} ${JSON.stringify(actual)}`);
  }
}

function seed(port) {
  const cases = [
    { type: "email.sent", address: "sent@example.test", message: "a10-http-sent" },
    { type: "email.delivered", address: "delivered@example.test", message: "a10-http-delivered" },
    { type: "email.delivery_delayed", address: "delayed@example.test", message: "a10-http-delayed" },
    { type: "email.failed", address: "failed@example.test", message: "a10-http-failed" },
    { type: "email.bounced", address: "  Suppress.Me@Example.test  ", message: "a10-http-bounced" },
    { type: "email.complained", address: "complaint@example.test", message: "a10-http-complaint" },
    { type: "email.suppressed", address: "provider-suppressed@example.test", message: "a10-http-suppressed" },
  ];
  let sql = `INSERT INTO public.business_agents(business_id,agent_id,status,plan_id,billing_period,current_period_start,current_period_end)
    VALUES (${sqlQuote(IDS.outsiderBusiness)},'review_booster','active','booster','monthly',now()-interval '1 day',now()+interval '29 days');\n`;
  for (let index = 0; index < cases.length; index++) {
    const item = cases[index];
    const deliveryId = uuid(IDS.deliveryPrefix, index + 1);
    const visitId = uuid(IDS.visitPrefix, index + 1);
    const address = item.address.trim();
    const payload = JSON.stringify({ from: "Studio <sender@example.test>", to: address, reply_to: "sender@example.test", subject: `A10 HTTP ${item.type}`, text: `Synthetic ${item.type}`, tags: [{ name: "ornigami_delivery_id", value: deliveryId }] });
    sql += `INSERT INTO public.followup_visits(id,business_id,customer_email,visited_at,followup_status) VALUES (${sqlQuote(visitId)},${sqlQuote(IDS.business)},${sqlQuote(address)},now()-interval '2 days','pending');\n`;
    sql += `INSERT INTO public.booster_followup_deliveries(id,business_id,visit_id,state,provider_payload,review_url_snapshot,idempotency_key,lease_token,lease_until,first_attempt_at,send_attempt_count,reservation_month)
      VALUES (${sqlQuote(deliveryId)},${sqlQuote(IDS.business)},${sqlQuote(visitId)},'sending',${sqlQuote(payload)}::jsonb,'https://example.test/review',${sqlQuote(`a10-http-${deliveryId}`)},gen_random_uuid(),now()+interval '5 minutes',now(),1,date_trunc('month',now() AT TIME ZONE 'UTC')::date);\n`;
  }
  const admissionDeliveryId = uuid(IDS.deliveryPrefix, 20);
  const admissionVisitId = uuid(IDS.visitPrefix, 20);
  const admissionPayload = JSON.stringify({ from: "Studio <sender@example.test>", to: "suppress.me@example.test", reply_to: "sender@example.test", subject: "A10 HTTP later send", text: "Must be blocked", tags: [{ name: "ornigami_delivery_id", value: admissionDeliveryId }] });
  sql += `INSERT INTO public.followup_visits(id,business_id,customer_email,visited_at,followup_status) VALUES (${sqlQuote(admissionVisitId)},${sqlQuote(IDS.outsiderBusiness)},'suppress.me@example.test',now()-interval '2 days','pending');\n`;
  sql += `INSERT INTO public.booster_followup_deliveries(id,business_id,visit_id,state,provider_payload,review_url_snapshot,idempotency_key,lease_token,lease_until,send_attempt_count)
    VALUES (${sqlQuote(admissionDeliveryId)},${sqlQuote(IDS.outsiderBusiness)},${sqlQuote(admissionVisitId)},'prepared',${sqlQuote(admissionPayload)}::jsonb,'https://search.google.com/local/writereview?placeid=a20-outsider',${sqlQuote(`a10-http-${admissionDeliveryId}`)},gen_random_uuid(),now()+interval '5 minutes',0);`;
  psql(sql, port);
  return { cases, admissionDeliveryId };
}

async function verifyHttpAndPersistence({ url, port, secret }) {
  const { cases, admissionDeliveryId } = seed(port);
  const quotaBefore = psql(`SELECT usage FROM public.booster_monthly_quota(${sqlQuote(IDS.business)})`, port);
  const firstDelivery = uuid(IDS.deliveryPrefix, 1);
  const before = psql(`SELECT count(*) FROM public.booster_delivery_events`, port);
  const sentPayload = JSON.stringify(eventPayload("email.sent", firstDelivery, "sent@example.test", cases[0].message));

  const tampered = await signRequest(`${url}/api/webhooks/resend`, sentPayload, { secret, id: "a10-http-tampered", suffix: " " });
  if (tampered.status !== 401) throw new Error(`tampered body expected HTTP 401, got ${tampered.status}`);
  const stale = await signRequest(`${url}/api/webhooks/resend`, sentPayload, { secret, id: "a10-http-stale", timestamp: Math.floor(Date.now() / 1000) - 301 });
  if (stale.status !== 401) throw new Error(`stale event expected HTTP 401, got ${stale.status}`);
  const forged = await signRequest(`${url}/api/webhooks/resend`, sentPayload, { secret, id: "a10-http-forged", overrideSignature: "v1,AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=" });
  if (forged.status !== 401) throw new Error(`invalid signature expected HTTP 401, got ${forged.status}`);
  if (psql(`SELECT count(*) FROM public.booster_delivery_events`, port) !== before) throw new Error("invalid HTTP signatures wrote delivery events");

  for (let index = 0; index < cases.length; index++) {
    const item = cases[index];
    const deliveryId = uuid(IDS.deliveryPrefix, index + 1);
    const body = JSON.stringify(eventPayload(item.type, deliveryId, item.address, item.message));
    const response = await signRequest(`${url}/api/webhooks/resend`, body, { secret, id: `a10-http-event-${index + 1}` });
    await assertJson(response, { status: 200, body: { ok: true, duplicate: false } }, `${item.type} ingress`);
  }
  const statuses = psql(`SELECT string_agg(delivery_status,',' ORDER BY delivery_status_event_id) FROM public.booster_followup_deliveries WHERE id IN (${cases.map((_, index) => sqlQuote(uuid(IDS.deliveryPrefix, index + 1))).join(",")})`, port);
  if (statuses !== "sent,delivered,delayed,failed,bounced,complained,suppressed") throw new Error(`unexpected persisted statuses: ${statuses}`);
  if (psql(`SELECT count(*) FROM public.booster_delivery_events WHERE event_id LIKE 'a10-http-event-%'`, port) !== "7") throw new Error("seven accepted HTTP events were not durably recorded");

  const duplicateBody = JSON.stringify(eventPayload("email.bounced", uuid(IDS.deliveryPrefix, 5), cases[4].address, cases[4].message));
  await assertJson(await signRequest(`${url}/api/webhooks/resend`, duplicateBody, { secret, id: "a10-http-event-5" }), { status: 200, body: { ok: true, duplicate: true } }, "exact replay");
  const changedDuplicate = JSON.stringify(eventPayload("email.complained", uuid(IDS.deliveryPrefix, 5), "suppress.me@example.test", cases[4].message));
  if ((await signRequest(`${url}/api/webhooks/resend`, changedDuplicate, { secret, id: "a10-http-event-5" })).status !== 503) throw new Error("changed content reusing an event ID did not fail closed");
  const delayedOlder = JSON.stringify(eventPayload("email.delivery_delayed", uuid(IDS.deliveryPrefix, 2), cases[1].address, cases[1].message, "2026-10-02T12:00:00.000Z"));
  await assertJson(await signRequest(`${url}/api/webhooks/resend`, delayedOlder, { secret, id: "a10-http-old-delayed" }), { status: 200, body: { ok: true, duplicate: false } }, "out-of-order event");
  if (psql(`SELECT delivery_status FROM public.booster_followup_deliveries WHERE id=${sqlQuote(uuid(IDS.deliveryPrefix, 2))}`, port) !== "delivered") throw new Error("older delayed event downgraded confirmed delivery");
  const mismatchBody = JSON.stringify(eventPayload("email.bounced", uuid(IDS.deliveryPrefix, 5), "wrong@example.test", cases[4].message));
  if ((await signRequest(`${url}/api/webhooks/resend`, mismatchBody, { secret, id: "a10-http-mismatch" })).status !== 503) throw new Error("tagged recipient mismatch was not returned for retry");
  if (psql(`SELECT count(*) FROM public.booster_delivery_events WHERE event_id='a10-http-mismatch'`, port) !== "0") throw new Error("recipient mismatch was persisted");

  const lease = psql(`SELECT lease_token::text FROM public.booster_followup_deliveries WHERE id=${sqlQuote(admissionDeliveryId)}`, port);
  const admission = JSON.parse(psql(`SELECT public.begin_booster_delivery_send(${sqlQuote(admissionDeliveryId)},${sqlQuote(lease)},NULL)::text`, port));
  if (admission.kind !== "non_sendable") throw new Error(`cross-workspace suppressed address remained sendable (${admission.kind})`);
  if (psql(`SELECT state FROM public.booster_followup_deliveries WHERE id=${sqlQuote(admissionDeliveryId)}`, port) !== "non_sendable") throw new Error("suppressed cross-workspace delivery state was not closed");
  const suppressionError = psql(`SELECT last_error FROM public.followup_visits WHERE id=${sqlQuote(uuid(IDS.visitPrefix, 20))}`, port);
  if (suppressionError !== "Recipient suppressed by provider delivery feedback.") throw new Error(`cross-workspace send admission closed but unexpected visit reason: ${JSON.stringify(suppressionError)}`);
  const quotaAfter = psql(`SELECT usage FROM public.booster_monthly_quota(${sqlQuote(IDS.business)})`, port);
  if (quotaAfter !== quotaBefore) throw new Error(`provider events changed reserved quota (${quotaBefore} -> ${quotaAfter})`);
  return { invalidRejected: 3, accepted: 7, duplicateAcknowledged: 1, outOfOrderRetained: true, mismatchRejected: true, crossWorkspaceAdmissionBlocked: true, quotaRetained: quotaBefore };
}

async function main() {
  if (existsSync(FIXTURE)) throw new Error("A20 fixture path already exists; inspect it and clean it explicitly before running A10");
  if ([".env", ".env.local", ".env.production", ".env.production.local", ".env.development", ".env.development.local"].some((name) => existsSync(join(ROOT, name)))) throw new Error("Next.js env files must be absent for isolated A10 HTTP acceptance");
  if (!existsSync(PRELOAD)) throw new Error("A20 preload and local database bridge must exist in this worktree");
  const source = readFileSync(FIXTURE_SOURCE, "utf8");
  const sourceHash = createHash("sha256").update(source).digest("hex");
  const adapter = adaptA20FixtureSource(source, { root: ROOT, coreModuleUrl: pathToFileURL(resolve(ROOT, "scripts/a20-app-fixture-core.mjs")).href });
  mkdirSync(ADAPTER_DIR, { recursive: true, mode: 0o700 });
  privateWrite(ADAPTER, adapter);
  const secret = makeSecret();
  let result;
  try {
    fixtureAction("setup");
    // Build/start via the copied fixture's established lifecycle. Only its isolated app child receives the A10 synthetic key.
    const app = run(process.execPath, [ADAPTER, "start"], {
      env: cleanChildEnv({ A10_RESEND_WEBHOOK_SECRET: secret }),
      timeout: 900_000,
      maxBuffer: 8 * 1024 * 1024,
    });
    const server = JSON.parse(app);
    const response = await fetch(`${server.url}/api/webhooks/resend`, { method: "GET", redirect: "manual", signal: AbortSignal.timeout(10_000) });
    if (response.status !== 405) throw new Error(`Resend route GET should be 405; got ${response.status}`);
    const marker = JSON.parse(readFileSync(join(FIXTURE, "marker.json"), "utf8"));
    const port = Number(marker.port);
    const clusterPath = realpathSync(join(FIXTURE, "postgres", "data"));
    validateA20Marker(marker, { database: DATABASE, port, fixtureRoot: realpathSync(FIXTURE), clusterPath });
    const identity = JSON.parse(psql("SELECT json_build_object('database',current_database(),'host',host(inet_server_addr()),'port',inet_server_port(),'dataDirectory',current_setting('data_directory'))::text;", port));
    validateA20PostgresIdentity(identity, { database: DATABASE, port, clusterPath });
    const accepted = await verifyHttpAndPersistence({ url: server.url, port, secret });
    fixtureAction("assert");
    result = {
      task: "A10",
      mode: "local synthetic only; no Resend provider request was made",
      canonicalA20FixtureSha256: sourceHash,
      adapter: "A20 fixture copy with validated root/import/secret substitutions only",
      candidateCommit: server.candidateCommit,
      buildHash: server.buildHash,
      buildTree: server.buildTree,
      nextBuildId: server.buildId,
      appHttpStatus: response.status,
      ...accepted,
      outboundGuard: "clear",
    };
  } finally {
    const marker = join(FIXTURE, "marker.json");
    const runtime = join(FIXTURE, "runtime.json");
    const data = join(FIXTURE, "postgres", "data");
    if (existsSync(marker)) {
      if (existsSync(runtime)) {
        try { fixtureAction("stop"); } catch (error) { throw new Error(`A20 app fixture stop failed; preserving fixture: ${error instanceof Error ? error.message : "unknown error"}`); }
      }
      try { fixtureAction("cleanup"); } catch (error) { throw new Error(`A20 fixture cleanup failed; preserving fixture: ${error instanceof Error ? error.message : "unknown error"}`); }
    } else if (existsSync(data)) {
      throw new Error("A20 setup left an unmarked PostgreSQL data directory; preserving it for manual inspection");
    } else if (existsSync(FIXTURE)) {
      const resolved = realpathSync(FIXTURE);
      if (resolved !== FIXTURE || !resolved.startsWith(`${ROOT}${sep}`)) throw new Error("refusing cleanup because task-local fixture escaped this worktree");
      rmSync(resolved, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    }
  }
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => { console.error(`A10 HTTP acceptance: ${error instanceof Error ? error.message : "unknown error"}`); process.exitCode = 1; });
}
