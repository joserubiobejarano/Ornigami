import { spawn, spawnSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { readStripeCliTestKey } from "./a17-stripe-test-acceptance.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURE = join(ROOT, ".a20-fixture");
const HANDOFF = join(FIXTURE, "a17-stripe-http-target.json");
const RUNTIME = join(FIXTURE, "a17-stripe-http-runtime.json");
const JOURNAL = join(FIXTURE, "a17-stripe-http-journal.json");
const CLI_LOG = join(FIXTURE, "a17-stripe-cli.log");
const APP_LOG = join(FIXTURE, "a17-next.log");
const ORIGIN_HOST = "127.0.0.1";

function requireIsolatedTestMode() {
  const inherited = process.env.STRIPE_SECRET_KEY || "";
  if (inherited.startsWith("sk_live_")) throw new Error("inherited live Stripe key blocks this target");
  const key = inherited || readStripeCliTestKey();
  if (!/^sk_test_[A-Za-z0-9_]{12,}$/.test(key || "")) throw new Error("a Stripe CLI test-mode key is required");
  if (process.env.A17_STRIPE_TARGET !== "isolated-test" || process.env.A17_STRIPE_CONFIRM !== "I_AUTHORIZE_TEST_MODE_PROVIDER_OBJECTS") {
    throw new Error("isolated-test marker and explicit test-resource authorization are required");
  }
  return key;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: ROOT, encoding: "utf8", windowsHide: true, timeout: 600_000, ...options });
  if (result.error || result.status !== 0) throw new Error(`${command} failed (${result.status ?? "spawn error"})`);
  return String(result.stdout || "").trim();
}

async function availablePort() {
  const server = createServer();
  await new Promise((ok, fail) => { server.once("error", fail); server.listen(0, ORIGIN_HOST, ok); });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("could not allocate local app port");
  const port = address.port;
  await new Promise((ok, fail) => server.close((error) => error ? fail(error) : ok()));
  return port;
}

function pgIdentity() {
  const marker = JSON.parse(readFileSync(join(FIXTURE, "marker.json"), "utf8"));
  const database = JSON.parse(readFileSync(join(FIXTURE, "postgres", "port.json"), "utf8"));
  if (marker.task !== "A20" || marker.version !== 1 || marker.state !== "ready" || marker.database !== "a20_browser_fixture" ||
      marker.host !== ORIGIN_HOST || marker.port !== database.port || database.database !== marker.database || !Number.isInteger(database.port)) {
    throw new Error("disposable PostgreSQL marker identity failed");
  }
  const url = `postgresql://postgres@${ORIGIN_HOST}:${database.port}/${database.database}`;
  return { marker, database, url };
}

function validateHandoff(handoff) {
  if (handoff?.schema !== "ornigami.a17.stripe-http-target.v1" || handoff.testMode !== true || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(handoff.runId || "") || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(handoff.ownerUserId || "") || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(handoff.businessId || "")) throw new Error("private handoff identifiers failed validation");
  const origin = new URL(handoff.origin);
  const port = Number(origin.port);
  if (origin.protocol !== "http:" || origin.hostname !== ORIGIN_HOST || !Number.isInteger(port) || port < 1024 || port > 65535 || origin.pathname !== "/" || origin.search || origin.hash || handoff.webhookPath !== "/api/stripe/webhook") throw new Error("private handoff origin/route failed validation");
  return { port };
}

function psql(pg, sql) {
  const psql = process.platform === "win32" ? "C:/Program Files/PostgreSQL/17/bin/psql.exe" : "psql";
  return run(psql, ["-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-h", ORIGIN_HOST, "-p", String(pg.database.port), "-U", "postgres", "-d", pg.database.database, "-f", "-"], { input: sql });
}

function saveJournal(journal) {
  writeFileSync(JOURNAL, `${JSON.stringify(journal, null, 2)}\n`, { mode: 0o600 });
}

async function createProviderResources(key, runId, journal) {
  const { default: Stripe } = await import("stripe");
  const stripe = new Stripe(key, { apiVersion: "2026-07-29.dahlia", maxNetworkRetries: 0, timeout: 20_000 });
  journal.phase = "create product"; journal.pending = { kind: "product", metadataRunId: runId }; saveJournal(journal);
  const product = await stripe.products.create({ name: `A17 annual billing acceptance ${runId}`, metadata: { a17_acceptance_run: runId } });
  if (product.livemode !== false) throw new Error("product was not confirmed as a Stripe test object");
  const providerProbe = await stripe.products.retrieve(product.id);
  if (providerProbe.id !== product.id || providerProbe.livemode !== false) throw new Error("Stripe SDK test-mode transport probe failed");
  journal.resources.productId = product.id; journal.pending = null; saveJournal(journal);
  const prices = {};
  for (const [plan, annual, monthly] of [["replies", 36000, 3900], ["booster", 36000, 3900], ["complete", 56000, 5900]]) {
    journal.phase = `create ${plan} annual price`; journal.pending = { kind: "price", metadataRunId: runId }; saveJournal(journal);
    const annualPrice = await stripe.prices.create({ product: product.id, currency: "eur", unit_amount: annual, recurring: { interval: "year" }, metadata: { a17_acceptance_run: runId, plan, period: "annual" } });
    journal.resources.priceIds.push(annualPrice.id); journal.pending = null; saveJournal(journal);
    journal.phase = `create ${plan} monthly price`; journal.pending = { kind: "price", metadataRunId: runId }; saveJournal(journal);
    const monthlyPrice = await stripe.prices.create({ product: product.id, currency: "eur", unit_amount: monthly, recurring: { interval: "month" }, metadata: { a17_acceptance_run: runId, plan, period: "monthly" } });
    journal.resources.priceIds.push(monthlyPrice.id); journal.pending = null; saveJournal(journal);
    if (annualPrice.livemode !== false || monthlyPrice.livemode !== false) throw new Error("price was not confirmed as a Stripe test object");
    prices[`${plan}Annual`] = annualPrice.id;
    prices[`${plan}Monthly`] = monthlyPrice.id;
  }
  return { stripe, productId: product.id, prices };
}

function seedOwner(pg, runId) {
  const userId = randomUUID();
  const businessId = randomUUID();
  const password = `A17-${randomBytes(24).toString("base64url")}!aA7`;
  const hash = run(process.execPath, ["--input-type=module", "-e", `import bcrypt from 'bcryptjs'; process.stdout.write(await bcrypt.hash(${JSON.stringify(password)}, 10));`]);
  if (!hash) throw new Error("synthetic account seed failed");
  const email = `annual-${runId}@example.test`;
  const q = (s) => `'${String(s).replaceAll("'", "''")}'`;
  psql(pg, `INSERT INTO public.users(id,email,name,email_verified,password_hash) VALUES ('${userId}',${q(email)},'A17 Annual Owner',now(),${q(hash)});
    INSERT INTO public.profiles(id,full_name,business_name,city,country,plan,plan_type,plan_status) VALUES ('${userId}','A17 Annual Owner','A17 Annual Studio','Madrid','ES','free','free','free');
    INSERT INTO public.businesses(id,owner_user_id,name,business_type,city,country,language) VALUES ('${businessId}','${userId}','A17 Annual Studio','studio','Madrid','ES','en');
    INSERT INTO public.business_members(business_id,user_id,role) VALUES ('${businessId}','${userId}','owner');
    INSERT INTO public.booster_quota_legacy_usage(business_id,month_start,accepted_count) VALUES ('${businessId}',date_trunc('month',now())::date,11);`);
  return { email, password, userId, businessId };
}

function cleanAppEnv(pg, port, webhookSecret, key, prices) {
  const env = {};
  for (const name of ["PATH", "SystemRoot", "ComSpec", "TEMP", "TMP", "WINDIR"]) if (process.env[name]) env[name] = process.env[name];
  const localPgUrl = pg.url;
  return {
    ...env, NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1", PORT: String(port),
    NEXT_PUBLIC_APP_URL: `http://${ORIGIN_HOST}:${port}`, AUTH_URL: `http://${ORIGIN_HOST}:${port}`, NEXTAUTH_URL: `http://${ORIGIN_HOST}:${port}`,
    AUTH_SECRET: randomBytes(32).toString("base64url"), NEXTAUTH_SECRET: randomBytes(32).toString("base64url"),
    GOOGLE_CLIENT_ID: "a17-local.apps.example.test", GOOGLE_CLIENT_SECRET: "a17-invalid-local-google-secret",
    DATABASE_URL: "postgresql://a20_fixture:a20_fixture@ep-a20-fixture.neon.tech/a20_fixture?sslmode=require", A20_DATABASE_URL: localPgUrl,
    TOKEN_ENCRYPTION_KEY: randomBytes(32).toString("base64url"), REVIEW_BOOSTER_UNSUBSCRIBE_SECRET: randomBytes(32).toString("base64url"),
    STRIPE_SECRET_KEY: key, STRIPE_WEBHOOK_SECRET: webhookSecret,
    STRIPE_PRICE_REPLIES_MONTHLY: prices.repliesMonthly, STRIPE_PRICE_REPLIES_ANNUAL: prices.repliesAnnual,
    STRIPE_PRICE_BOOSTER_MONTHLY: prices.boosterMonthly, STRIPE_PRICE_BOOSTER_ANNUAL: prices.boosterAnnual,
    STRIPE_PRICE_COMPLETE_MONTHLY: prices.completeMonthly, STRIPE_PRICE_COMPLETE_ANNUAL: prices.completeAnnual,
    RESEND_API_KEY: "re_a17_local_never_valid", RESEND_WEBHOOK_SECRET: randomBytes(32).toString("hex"),
    OPENAI_API_KEY: "sk-a17-local-never-valid", CRON_SECRET: randomBytes(32).toString("base64url"),
    EMAIL_FROM: "fixture@example.test", REPLY_TO_EMAIL: "fixture@example.test", SENTRY_DSN: "", SENTRY_AUTH_TOKEN: "", SENTRY_ORG: "", SENTRY_PROJECT: "",
  };
}

function startStripeForwarder(port, key) {
  const stripeExe = run("where.exe", ["stripe"]).split(/\r?\n/)[0];
  if (!stripeExe) throw new Error("Stripe CLI is unavailable");
  const cliEnv = {};
  for (const name of ["PATH", "SystemRoot", "ComSpec", "TEMP", "TMP", "WINDIR"]) if (process.env[name]) cliEnv[name] = process.env[name];
  cliEnv.STRIPE_API_KEY = key;
  const child = spawn(stripeExe, ["listen", "--forward-to", `http://${ORIGIN_HOST}:${port}/api/stripe/webhook`], { cwd: ROOT, env: cliEnv, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  let output = "";
  let settled = false;
  return new Promise((resolvePromise, rejectPromise) => {
    const timeout = setTimeout(() => { if (!settled) { settled = true; child.kill(); rejectPromise(new Error("Stripe CLI did not become ready")); } }, 45_000);
    const inspect = (chunk) => {
      const part = chunk.toString();
      appendFileSync(CLI_LOG, part.replace(/whsec_[A-Za-z0-9]+/g, "whsec_[redacted]"), { mode: 0o600 });
      output += part;
      const match = output.match(/whsec_[A-Za-z0-9]+/);
      if (match && !settled) { settled = true; clearTimeout(timeout); resolvePromise({ child, webhookSecret: match[0] }); }
      if (output.length > 16_000) output = output.slice(-4_000);
    };
    child.stdout.on("data", inspect);
    child.stderr.on("data", inspect);
    child.once("error", () => { if (!settled) { settled = true; clearTimeout(timeout); rejectPromise(new Error("Stripe CLI failed to start")); } });
    child.once("exit", (code) => { if (!settled) { settled = true; clearTimeout(timeout); rejectPromise(new Error(`Stripe CLI exited before readiness (${code ?? "signal"})`)); } });
  });
}

async function waitHttp(url, pid) {
  for (let i = 0; i < 120; i += 1) {
    try { process.kill(pid, 0); } catch { throw new Error("Next.js target exited before readiness"); }
    try { const response = await fetch(`${url}/api/auth/session`, { signal: AbortSignal.timeout(1500) }); if (response.ok) return; } catch {}
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 500));
  }
  throw new Error("Next.js target did not become ready");
}

async function start() {
  const key = requireIsolatedTestMode();
  if ([".env", ".env.local", ".env.production", ".env.development", ".env.production.local", ".env.development.local"].some((name) => existsSync(join(ROOT, name)))) {
    throw new Error("shared Next.js env files exist; target refuses to start");
  }
  if (!existsSync(join(FIXTURE, "marker.json"))) run(process.execPath, ["scripts/a20-app-fixture.mjs", "setup"]);
  const pg = pgIdentity();
  if (existsSync(HANDOFF) || existsSync(RUNTIME)) throw new Error("an A17 target handoff already exists; inspect the disposable fixture before another start");
  if (existsSync(JOURNAL)) {
    const prior = JSON.parse(readFileSync(JOURNAL, "utf8"));
    if (prior.status !== "failed" || !["test-prices-and-product-deactivated", "none-created"].includes(prior.cleanup)) {
      throw new Error("an earlier A17 journal has unresolved resources and must be recovered before a new run");
    }
    pgIdentity();
    const evidenceDir = resolve(".local/a17-stripe-evidence");
    mkdirSync(evidenceDir, { recursive: true });
    writeFileSync(join(evidenceDir, `${prior.runId}-startup-failure-journal.json`), `${JSON.stringify(prior, null, 2)}\n`, { mode: 0o600 });
    unlinkSync(JOURNAL);
  }
  const runId = randomUUID();
  const journal = { schema: "ornigami.a17.stripe-http-journal.v1", runId, status: "running", phase: "seed app owner", target: "isolated-test", resources: { productId: null, priceIds: [], clockIds: [] }, pending: null, cleanup: "pending" };
  saveJournal(journal);
  let account; let provider; let forwarder; let app;
  try {
  account = seedOwner(pg, runId);
  journal.syntheticRows = { ownerUserId: account.userId, businessId: account.businessId, email: account.email, databaseCleanup: "retained only in disposable A20 fixture until fixture teardown" }; saveJournal(journal);
  provider = await createProviderResources(key, runId, journal);
  const appPort = await availablePort();
  journal.phase = "start Stripe CLI listener"; saveJournal(journal);
  forwarder = await startStripeForwarder(appPort, key);
  const env = cleanAppEnv(pg, appPort, forwarder.webhookSecret, key, provider.prices);
  const bridgePreload = join(FIXTURE, "a17-neon-only-preload.mjs");
  const networkGuard = `
import net from 'node:net'; import tls from 'node:tls'; import http from 'node:http'; import https from 'node:https'; import dns from 'node:dns';
import { appendFileSync } from 'node:fs'; import { syncBuiltinESMExports } from 'node:module';
const stripeAddresses = new Set([...(await dns.promises.resolve4('api.stripe.com').catch(()=>[])), ...(await dns.promises.resolve6('api.stripe.com').catch(()=>[]))]);
const allowed = new Set([\`127.0.0.1:\${process.env.PORT}\`, \`127.0.0.1:\${new URL(process.env.A20_DATABASE_URL).port}\`, 'api.stripe.com:443', 'api.neon.tech:443', ...[...stripeAddresses].map(ip=>\`\${ip}:443\`)]);
const ledger = ${JSON.stringify(join(FIXTURE, "a17-outbound-blocked.jsonl"))};
function target(input, options) { if (Array.isArray(input)) return target(input[0], input[1] || options); if (typeof input === 'string' || input instanceof URL) { try { const u = new URL(input); const protocol = options?.protocol || u.protocol; return { host: options?.hostname || options?.host || u.hostname, port: Number(options?.port || u.port || (protocol === 'https:' ? 443 : 80)), protocol }; } catch {} } const o = input && typeof input === 'object' ? input : options || {}; return { host: String(o.hostname || o.host || 'localhost').replace(/^\\[|\\]$/g,''), port: Number(o.port || (o.protocol === 'https:' ? 443 : 80)), protocol: o.protocol || 'tcp:' }; }
function permit(kind, input, options) { const t = target(input, options); const local=String(t.host)==='127.0.0.1'; const stripe=['https.request','tls.connect','net.connect'].includes(kind)&&String(t.host)==='api.stripe.com'&&Number(t.port)===443; const stripeIp=kind==='net.connect'&&stripeAddresses.has(String(t.host))&&Number(t.port)===443; const neon=kind==='fetch'&&String(t.host)==='api.neon.tech'&&Number(t.port)===443&&String(t.protocol)==='https:'; if ((local&&allowed.has(\`\${t.host}:\${t.port}\`))||stripe||stripeIp||neon) return; try { appendFileSync(ledger, JSON.stringify({kind,host:String(t.host).slice(0,80),port:t.port,protocol:String(t.protocol).slice(0,12)})+'\\n',{mode:0o600}); } catch {} const e=new Error('A17 isolated outbound network blocked'); e.code='A17_OUTBOUND_BLOCKED'; throw e; }
const originalFetch=globalThis.fetch; globalThis.fetch=function(input, init){ const raw=input instanceof Request?input.url:String(input); if(new URL(raw).protocol==='data:') return originalFetch.call(this,input,init); permit('fetch',raw); return originalFetch.call(this,input,init); };
for (const [module,kind] of [[http,'http.request'],[https,'https.request']]) { const req=module.request, get=module.get; module.request=function(...args){permit(kind,args[0],args[1]);return req.apply(this,args)}; module.get=function(...args){permit(kind,args[0],args[1]);return get.apply(this,args)}; }
const tlsConnect=tls.connect; tls.connect=function(...args){permit('tls.connect',args[0],args[1]);return tlsConnect.apply(this,args)};
const socketConnect=net.Socket.prototype.connect; net.Socket.prototype.connect=function(...args){const a=Array.isArray(args[0])?args[0][0]:args[0],b=Array.isArray(args[0])?args[0][1]:args[1];const t=typeof a==='number'?{host:String(b||'localhost'),port:a}:{host:String(a?.host||a?.hostname||'localhost').replace(/^\\[|\\]$/g,''),port:Number(a?.port||0)};permit('net.connect',t);return socketConnect.apply(this,args)};
for(const name of ['lookup','resolve','resolve4','resolve6','resolveAny','resolveCname','resolveMx','resolveSrv','resolveTxt']) { const original=dns[name]; if(typeof original!=='function')continue; dns[name]=function(host,...args){if(!['api.stripe.com','127.0.0.1','localhost'].includes(String(host).toLowerCase()))permit(\`dns.\${name}\`,{host:String(host),port:443});return original.call(this,host,...args)}; }
syncBuiltinESMExports();
`;
  writeFileSync(bridgePreload, `import { installA20NeonBridge } from ${JSON.stringify(pathToFileURL(join(ROOT, "scripts", "a20-neon-bridge.mjs")).href)};\nawait installA20NeonBridge();\n${networkGuard}\n`, { mode: 0o600 });
  const buildEnv = { ...env, NEXT_FONT_GOOGLE_MOCKED_RESPONSES: join(ROOT, "scripts", "a20-google-font-mocks.cjs"), SENTRY_TEST_OUT_DIR: join(FIXTURE, "a17-sentry") };
  const nextBin = join(ROOT, "node_modules", "next", "dist", "bin", "next");
  try {
    run(process.execPath, [nextBin, "build", "--webpack"], { env: buildEnv, stdio: "ignore" });
    run(process.execPath, [join(ROOT, "scripts", "generate-static-csp-hashes.mjs")], { env: buildEnv, stdio: "ignore" });
  } catch (error) { throw error; }
  const preloadUrl = pathToFileURL(bridgePreload).href;
  journal.phase = "start actual Next.js application"; saveJournal(journal);
  const appLog = openSync(APP_LOG, "a", 0o600);
  try {
    app = spawn(process.execPath, ["--import", preloadUrl, nextBin, "start", "-H", ORIGIN_HOST, "-p", String(appPort)], {
      cwd: ROOT, env, windowsHide: true, detached: true,
      stdio: ["ignore", appLog, appLog],
    });
  } finally { closeSync(appLog); }
  if (!app.pid) throw new Error("could not launch Next.js target");
  app.unref();
  const url = `http://${ORIGIN_HOST}:${appPort}`;
  await waitHttp(url, app.pid);
  const { createHash } = await import("node:crypto");
  const buildId = readFileSync(join(ROOT, ".next", "BUILD_ID"), "utf8").trim();
  const sourceHash = createHash("sha256").update(readFileSync(join(ROOT, "src/app/api/stripe/webhook/route.ts"))).update(readFileSync(join(ROOT, "src/lib/billing/reconciliation.ts"))).update(readFileSync(join(ROOT, "src/lib/billing/plans.ts"))).digest("hex");
  const handoff = {
    schema: "ornigami.a17.stripe-http-target.v1", runId, status: "ready", target: "actual-next-http-route",
    origin: url, checkoutPath: "/dashboard/billing", webhookPath: "/api/stripe/webhook", webhookDelivery: "stripe-cli-test-mode-forwarding",
    appPid: app.pid, stripeCliPid: forwarder.child.pid, businessId: account.businessId, ownerUserId: account.userId, testMode: true,
    credentials: account, prices: provider.prices, productId: provider.productId,
    initialQuota: 11, quotaMonth: new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)).toISOString().slice(0, 10),
    buildId, sourceHash, webhookSecretStoredSeparately: true, providerApiKeyStoredInProcessOnly: true,
  };
  writeFileSync(HANDOFF, `${JSON.stringify(handoff, null, 2)}\n`, { mode: 0o600 });
  writeFileSync(RUNTIME, `${JSON.stringify({ appPid: app.pid, stripeCliPid: forwarder.child.pid, appPort, startedAt: new Date().toISOString() }, null, 2)}\n`, { mode: 0o600 });
  journal.status = "ready"; journal.phase = "await browser annual checkout"; journal.appPid = app.pid; journal.stripeCliPid = forwarder.child.pid; journal.cleanup = "pending-until-acceptance-completes"; saveJournal(journal);
  process.stdout.write(`${JSON.stringify({ status: "ready", origin: url, handoffFile: HANDOFF, webhookPath: "/api/stripe/webhook", providerDelivery: "stripe-cli-test-mode-forwarding" })}\n`);
  } catch (error) {
    if (app?.pid) try { process.kill(app.pid); } catch {}
    if (forwarder?.child) forwarder.child.kill();
    journal.status = "failed"; journal.cleanup = "pending"; saveJournal(journal);
    await cleanupRunResources(key, runId, journal);
    throw error;
  }
}

async function cleanupRunResources(key, runId, journal) {
  const { default: Stripe } = await import("stripe");
  const stripe = new Stripe(key, { apiVersion: "2026-07-29.dahlia", maxNetworkRetries: 0, timeout: 20_000 });
  const incomplete = [];
  const resources = [];
  const prices = new Map();
  const products = new Map();
  for (const id of journal.resources?.priceIds ?? []) {
    try { const price = await stripe.prices.retrieve(id); prices.set(id, price); } catch { incomplete.push(`known-price-unavailable:${id}`); }
  }
  if (journal.resources?.productId) {
    try { const product = await stripe.products.retrieve(journal.resources.productId); products.set(product.id, product); } catch { incomplete.push(`known-product-unavailable:${journal.resources.productId}`); }
  }
  try {
    let page;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      page = await stripe.prices.search({ query: `metadata['a17_acceptance_run']:'${runId}'`, limit: 100 });
      for (const item of page.data) prices.set(item.id, item);
      if (page.data.length || !(journal.pending?.kind === "price")) break;
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 1000));
    }
    if (journal.pending?.kind === "price" && [...prices.values()].filter((item) => item.metadata?.a17_acceptance_run === runId).length <= (journal.resources?.priceIds?.length ?? 0)) incomplete.push("pending-price-create-not-yet-resolved");
    for (const price of prices.values()) {
      if (price.livemode !== false || price.metadata?.a17_acceptance_run !== runId) { incomplete.push(`unowned-price:${price.id}`); continue; }
      try { const archived = price.active ? await stripe.prices.update(price.id, { active: false }) : price; if (archived.livemode !== false || archived.active) throw new Error(); resources.push({ kind: "price", id: price.id, archived: true }); } catch { incomplete.push(`price:${price.id}`); }
    }
  } catch { incomplete.push("price-search"); }
  try {
    let page;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      page = await stripe.products.search({ query: `metadata['a17_acceptance_run']:'${runId}'`, limit: 100 });
      for (const item of page.data) products.set(item.id, item);
      if (page.data.length || !(journal.pending?.kind === "product")) break;
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 1000));
    }
    if (journal.pending?.kind === "product" && [...products.values()].filter((item) => item.metadata?.a17_acceptance_run === runId).length <= (journal.resources?.productId ? 1 : 0)) incomplete.push("pending-product-create-not-yet-resolved");
    for (const product of products.values()) {
      if (product.livemode !== false || product.metadata?.a17_acceptance_run !== runId) { incomplete.push(`unowned-product:${product.id}`); continue; }
      try { const archived = product.active ? await stripe.products.update(product.id, { active: false }) : product; if (archived.livemode !== false || archived.active) throw new Error(); resources.push({ kind: "product", id: product.id, archived: true }); } catch { incomplete.push(`product:${product.id}`); }
    }
  } catch { incomplete.push("product-search"); }
  journal.cleanup = incomplete.length ? "incomplete" : "test-prices-and-product-deactivated";
  journal.cleanupFailures = incomplete;
  saveJournal(journal);
  return { ok: incomplete.length === 0, resources, failures: incomplete };
}

async function snapshot({ quiet = false, phase = "application" } = {}) {
  const key = requireIsolatedTestMode();
  const handoff = JSON.parse(readFileSync(HANDOFF, "utf8"));
  validateHandoff(handoff);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(handoff.quotaMonth)) throw new Error("target handoff quota month failed validation");
  const pg = pgIdentity();
  const { businessId, ownerUserId } = handoff;
  const q = (value) => `'${String(value).replaceAll("'", "''")}'`;
  const sql = `SELECT json_build_object(
    'checkoutIntents',COALESCE((SELECT json_agg(json_build_object('id',id,'planId',plan_id,'billingPeriod',billing_period,'status',status,'sessionId',stripe_session_id,'subscriptionId',stripe_subscription_id) ORDER BY created_at) FROM public.billing_checkout_intents WHERE owner_user_id=${q(ownerUserId)}::uuid AND business_id=${q(businessId)}::uuid),'[]'::json),
    'agents',COALESCE((SELECT json_agg(json_build_object('agentId',agent_id,'planId',plan_id,'billingPeriod',billing_period,'status',status,'subscriptionId',stripe_subscription_id,'priceId',stripe_price_id,'periodStart',current_period_start,'periodEnd',current_period_end) ORDER BY agent_id) FROM public.business_agents WHERE business_id=${q(businessId)}::uuid),'[]'::json),
    'ownerTrial', (SELECT json_build_object('state',state,'source',source,'subscriptionId',stripe_subscription_id) FROM public.billing_trial_owner_history WHERE owner_user_id=${q(ownerUserId)}::uuid),
    'businessTrial', (SELECT json_build_object('state',state,'source',source,'subscriptionId',stripe_subscription_id) FROM public.billing_trial_business_history WHERE business_id=${q(businessId)}::uuid),
    'quota',(SELECT row_to_json(q) FROM public.booster_monthly_quota(${q(businessId)}::uuid,${q(handoff.quotaMonth)}::date) q),
    'webhookEvents',COALESCE((SELECT json_agg(json_build_object('eventId',event_id,'eventType',event_type,'status',status,'completedAt',completed_at) ORDER BY created_at) FROM public.billing_webhook_events WHERE owner_user_id=${q(ownerUserId)}::uuid),'[]'::json),
    'customerId',(SELECT stripe_customer_id FROM public.billing_owner_customers WHERE owner_user_id=${q(ownerUserId)}::uuid)
  )::text;`;
  const state = JSON.parse(psql(pg, sql));
  const { default: Stripe } = await import("stripe");
  const stripe = new Stripe(key, { apiVersion: "2026-07-29.dahlia", maxNetworkRetries: 0, timeout: 20_000 });
  const subscriptionIds = [...new Set([
    ...state.checkoutIntents.map((row) => row.subscriptionId),
    ...state.agents.map((row) => row.subscriptionId),
  ].filter(Boolean))];
  const providerSubscriptions = [];
  for (const id of subscriptionIds) {
    const subscription = await stripe.subscriptions.retrieve(id, { expand: ["latest_invoice"] });
    if (subscription.livemode !== false || (typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id) !== state.customerId) throw new Error("Stripe provider subscription did not match isolated test owner mapping");
    if (subscription.metadata?.owner_user_id !== ownerUserId || subscription.metadata?.business_id !== businessId || subscription.metadata?.plan_id !== "booster" || subscription.metadata?.billing_period !== "annual") throw new Error("Stripe subscription metadata did not match the isolated annual Checkout owner/business");
    providerSubscriptions.push({
      id: subscription.id, livemode: false, customerMatchesOwnerMapping: true, status: subscription.status,
      trialStart: subscription.trial_start, trialEnd: subscription.trial_end,
      items: subscription.items.data.map((item) => ({ priceId: item.price.id, interval: item.price.recurring?.interval, currentPeriodStart: item.current_period_start, currentPeriodEnd: item.current_period_end })),
      latestInvoice: typeof subscription.latest_invoice === "object" && subscription.latest_invoice ? {
        id: subscription.latest_invoice.id, status: subscription.latest_invoice.status, paid: subscription.latest_invoice.paid,
        billingReason: subscription.latest_invoice.billing_reason, amountDue: subscription.latest_invoice.amount_due, amountPaid: subscription.latest_invoice.amount_paid,
      } : null,
    });
  }
  const providerSessions = [];
  for (const id of new Set(state.checkoutIntents.map((row) => row.sessionId).filter(Boolean))) {
    const session = await stripe.checkout.sessions.retrieve(id);
    const sessionCustomer = typeof session.customer === "string" ? session.customer : session.customer?.id;
    const sessionSubscription = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
    if (session.livemode !== false || (sessionCustomer && sessionCustomer !== state.customerId)) throw new Error("Stripe Checkout session did not match isolated test owner mapping");
    providerSessions.push({ id: session.id, livemode: false, status: session.status, paymentStatus: session.payment_status, customerMatchesOwnerMapping: sessionCustomer === state.customerId, subscriptionId: sessionSubscription ?? null });
  }
  const cliLog = existsSync(CLI_LOG) ? readFileSync(CLI_LOG, "utf8") : "";
  const subscriptionSet = new Set(subscriptionIds);
  const sessionIds = new Set(state.checkoutIntents.map((row) => row.sessionId).filter(Boolean));
  const providerEventPage = await stripe.events.list({ created: { gte: Math.floor(Date.now() / 1000) - 3600 }, limit: 100 });
  const relatedProviderEvents = providerEventPage.data.filter((event) => {
    if (event.livemode !== false) throw new Error("Stripe returned a live event while collecting isolated test evidence");
    const object = event.data.object;
    const objectCustomer = typeof object.customer === "string" ? object.customer : object.customer?.id;
    const objectSubscription = typeof object.subscription === "string" ? object.subscription : object.subscription?.id;
    const nestedSubscription = object.parent?.subscription_details?.subscription;
    const nestedId = typeof nestedSubscription === "string" ? nestedSubscription : nestedSubscription?.id;
    return subscriptionSet.has(object.id) || subscriptionSet.has(objectSubscription) || subscriptionSet.has(nestedId) ||
      sessionIds.has(object.id) || objectCustomer === state.customerId || object.id === state.customerId;
  }).map((event) => {
    const escaped = event.id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const response = cliLog.match(new RegExp(`<--\\s+\\[(\\d{3})\\] POST [^\\r\\n]*\\[${escaped}\\]`));
    const persisted = state.webhookEvents.find((item) => item.eventId === event.id);
    return { eventId: event.id, eventType: event.type, providerLivemode: false,
      cliDeliveryHttpStatus: response ? Number(response[1]) : null,
      appReconciliationStatus: persisted?.status ?? "not-completed-or-unowned", appCompletedAt: persisted?.completedAt ?? null };
  }).sort((a, b) => a.eventId.localeCompare(b.eventId));
  const snapshotEvidence = {
    schema: "ornigami.a17.stripe-application-webhook-evidence.v1", runId: handoff.runId,
    checkedAt: new Date().toISOString(), origin: handoff.origin, webhookPath: handoff.webhookPath,
    buildId: handoff.buildId, sourceHash: handoff.sourceHash,
    expectedAnnualPriceId: handoff.prices.boosterAnnual, initialQuota: handoff.initialQuota,
    database: state, providerSessions, providerSubscriptions, relatedProviderEvents,
  };
  const evidenceDir = resolve(".local/a17-stripe-evidence");
  mkdirSync(evidenceDir, { recursive: true });
  const safePhase = /^[a-z0-9-]{1,48}$/.test(phase) ? phase : "application";
  const evidencePath = join(evidenceDir, `${handoff.runId}-${safePhase}-${new Date().toISOString().replaceAll(":", "-")}.json`);
  writeFileSync(evidencePath, `${JSON.stringify(snapshotEvidence, null, 2)}\n`, { mode: 0o600 });
  const acceptedIntent = state.checkoutIntents.find((row) => row.planId === "booster" && row.billingPeriod === "annual" && ["completed", "retired"].includes(row.status));
  const matchingSession = acceptedIntent && providerSessions.find((session) => session.id === acceptedIntent.sessionId && session.status === "complete" && session.subscriptionId === acceptedIntent.subscriptionId);
  const checkoutPassed = Boolean(matchingSession);
  const matchedAgent = acceptedIntent && state.agents.find((agent) => agent.agentId === "review_booster" && agent.subscriptionId === acceptedIntent.subscriptionId && agent.planId === "booster" && agent.billingPeriod === "annual" && agent.priceId === handoff.prices.boosterAnnual);
  const subscriptionPassed = Boolean(matchedAgent && providerSubscriptions.some((sub) => sub.livemode === false && sub.id === acceptedIntent.subscriptionId && sub.status === matchedAgent.status && ["trialing", "active", "canceled"].includes(sub.status) && sub.items.some((item) => item.priceId === handoff.prices.boosterAnnual && item.interval === "year")));
  const invariantsPassed = state.quota?.usage === handoff.initialQuota && state.ownerTrial?.state === "consumed" && state.businessTrial?.state === "consumed";
  const deliveryPassed = relatedProviderEvents.some((event) => event.appReconciliationStatus === "completed" && event.cliDeliveryHttpStatus === 200);
  const failedAttempts = relatedProviderEvents.filter((event) => event.cliDeliveryHttpStatus >= 500).map((event) => event.eventId);
  snapshotEvidence.failedProviderOriginDeliveries = [...new Set(failedAttempts)];
  writeFileSync(evidencePath, `${JSON.stringify(snapshotEvidence, null, 2)}\n`, { mode: 0o600 });
  const completeJourneyObserved = state.checkoutIntents.length > 0;
  const result = { status: checkoutPassed && subscriptionPassed && invariantsPassed && deliveryPassed ? "passed" : completeJourneyObserved ? "pending-or-failed" : "pending-checkout", checkoutPassed, annualSubscriptionPassed: subscriptionPassed, quotaAndTrialHistoryPassed: invariantsPassed, providerOriginHttpDeliveryPassed: deliveryPassed, appCompletedWebhookEvents: state.webhookEvents.length, relatedProviderEvents: relatedProviderEvents.length, failedProviderOriginDeliveries: [...new Set(failedAttempts)].length, evidenceFile: evidencePath };
  if (!quiet) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (result.status === "pending-or-failed") process.exitCode = 2;
  return { result, evidencePath, evidence: snapshotEvidence };
}

async function waitForCliDelivery(eventId, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const log = existsSync(CLI_LOG) ? readFileSync(CLI_LOG, "utf8") : "";
    const escaped = eventId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`<--\\s+\\[200\\] POST [^\\r\\n]*\\[${escaped}\\]`).test(log)) return { eventId, httpStatus: 200 };
    if (new RegExp(`<--\\s+\\[5\\d\\d\\] POST [^\\r\\n]*\\[${escaped}\\]`).test(log)) throw new Error(`provider event ${eventId} received an HTTP 5xx`);
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 300));
  }
  throw new Error(`provider event ${eventId} did not receive an HTTP response within ${timeoutMs}ms`);
}

function latestCliEvent(eventType, afterOffset) {
  const log = existsSync(CLI_LOG) ? readFileSync(CLI_LOG, "utf8") : "";
  const suffix = log.slice(afterOffset);
  const escaped = eventType.replaceAll(".", "\\.");
  const matches = [...suffix.matchAll(new RegExp(`-->\\s+${escaped}\\s+\\[(evt_[A-Za-z0-9]+)\\]`, "g"))];
  return matches.at(-1)?.[1] ?? null;
}

async function validateProviderSequenceSubscription(stripe, expected) {
  const subscription = await stripe.subscriptions.retrieve(expected.subscriptionId);
  const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id;
  if (subscription.id !== expected.subscriptionId || subscription.livemode !== false || customerId !== expected.customerId ||
      subscription.metadata?.owner_user_id !== expected.ownerUserId || subscription.metadata?.business_id !== expected.businessId ||
      subscription.metadata?.plan_id !== "booster" || subscription.metadata?.billing_period !== "annual") {
    throw new Error("provider delivery target did not match the isolated annual owner mapping");
  }
  const customer = await stripe.customers.retrieve(expected.customerId);
  if (customer.id !== expected.customerId || customer.livemode !== false || customer.deleted ||
      customer.metadata?.owner_user_id !== expected.ownerUserId) {
    throw new Error("provider delivery customer did not match the isolated annual owner mapping");
  }
  if (subscription.items?.data?.length !== 1 || subscription.items.data[0].quantity !== 1) {
    throw new Error("provider delivery target did not have exactly one annual Booster item");
  }
  const itemPrice = subscription.items.data[0].price;
  const priceId = typeof itemPrice === "string" ? itemPrice : itemPrice?.id;
  if (priceId !== expected.priceId) throw new Error("provider delivery target did not use the isolated annual catalog price");
  const price = await stripe.prices.retrieve(priceId);
  if (price.id !== expected.priceId || price.livemode !== false || price.active !== true ||
      price.metadata?.a17_acceptance_run !== expected.runId || price.metadata?.plan !== "booster" ||
      price.metadata?.period !== "annual" || price.recurring?.interval !== "year" || price.recurring?.interval_count !== 1 ||
      price.currency !== "eur" || price.unit_amount !== 36000) {
    throw new Error("provider delivery target catalog price was not owned by this annual acceptance run");
  }
  return subscription;
}

export async function updateOwnedProviderSequenceSubscription({ stripe, expected, probe }) {
  const current = await validateProviderSequenceSubscription(stripe, expected);
  if (current.status !== "trialing") throw new Error("isolated annual trial is not trialing before provider delivery probe");
  const updated = await stripe.subscriptions.update(expected.subscriptionId, { metadata: { a17_serial_delivery_probe: probe } });
  if (updated.livemode !== false || updated.id !== expected.subscriptionId || updated.status !== "trialing") {
    throw new Error("isolated trial subscription changed unexpectedly during provider delivery probe");
  }
  return updated;
}

export async function cancelOwnedProviderSequenceSubscription({ stripe, expected }) {
  const current = await validateProviderSequenceSubscription(stripe, expected);
  if (current.status !== "trialing") throw new Error("isolated annual trial is not trialing before provider delivery cancellation");
  const canceled = await stripe.subscriptions.cancel(expected.subscriptionId);
  if (canceled.livemode !== false || canceled.id !== expected.subscriptionId || canceled.status !== "canceled") {
    throw new Error("isolated test subscription cancellation was not confirmed");
  }
  return canceled;
}

async function waitForCliEvent(eventType, afterOffset, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const id = latestCliEvent(eventType, afterOffset);
    if (id) return id;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 300));
  }
  throw new Error(`Stripe did not stream ${eventType} to the CLI listener within ${timeoutMs}ms`);
}

async function providerSequence() {
  const key = requireIsolatedTestMode();
  const handoff = JSON.parse(readFileSync(HANDOFF, "utf8"));
  validateHandoff(handoff);
  const pg = pgIdentity();
  const q = (value) => `'${String(value).replaceAll("'", "''")}'`;
  const mapping = JSON.parse(psql(pg, `SELECT json_build_object(
    'subscriptionId',(SELECT stripe_subscription_id FROM public.business_agents WHERE business_id=${q(handoff.businessId)}::uuid AND agent_id='review_booster'),
    'customerId',(SELECT stripe_customer_id FROM public.billing_owner_customers WHERE owner_user_id=${q(handoff.ownerUserId)}::uuid)
  )::text`));
  const subscriptionId = mapping.subscriptionId;
  if (!/^sub_[A-Za-z0-9]+$/.test(subscriptionId)) throw new Error("annual trial subscription is not mapped in the isolated app database");
  if (!/^cus_[A-Za-z0-9]+$/.test(mapping.customerId || "")) throw new Error("annual trial customer is not mapped in the isolated app database");
  const expected = {
    subscriptionId, customerId: mapping.customerId, ownerUserId: handoff.ownerUserId,
    businessId: handoff.businessId, runId: handoff.runId, priceId: handoff.prices?.boosterAnnual,
  };
  if (!/^price_[A-Za-z0-9]+$/.test(expected.priceId || "")) throw new Error("annual Booster test price is missing from the isolated handoff");
  const { default: Stripe } = await import("stripe");
  const stripe = new Stripe(key, { apiVersion: "2026-07-29.dahlia", maxNetworkRetries: 0, timeout: 20_000 });
  const before = existsSync(CLI_LOG) ? readFileSync(CLI_LOG, "utf8").length : 0;
  const updated = await updateOwnedProviderSequenceSubscription({ stripe, expected, probe: `${handoff.runId}-${Date.now()}` });
  const updateEventId = await waitForCliEvent("customer.subscription.updated", before);
  const updateDelivery = await waitForCliDelivery(updateEventId);
  const afterUpdate = await snapshot({ quiet: true, phase: "after-provider-update" });
  const afterUpdateAgent = afterUpdate.evidence.database.agents.find((row) => row.agentId === "review_booster");
  if (!afterUpdateAgent || afterUpdateAgent.status !== "trialing" || afterUpdateAgent.billingPeriod !== "annual" || afterUpdate.evidence.database.quota?.usage !== handoff.initialQuota) {
    throw new Error("provider-origin subscription update did not preserve annual trial state and prior quota");
  }
  const beforeCancel = existsSync(CLI_LOG) ? readFileSync(CLI_LOG, "utf8").length : 0;
  const canceled = await cancelOwnedProviderSequenceSubscription({ stripe, expected });
  const cancelEventId = await waitForCliEvent("customer.subscription.deleted", beforeCancel);
  const cancelDelivery = await waitForCliDelivery(cancelEventId);
  const afterCancel = await snapshot({ quiet: true, phase: "after-provider-cancel" });
  const canceledAgent = afterCancel.evidence.database.agents.find((row) => row.agentId === "review_booster");
  const sequence = {
    schema: "ornigami.a17.stripe-provider-delivery-sequence.v1", runId: handoff.runId, subscriptionId,
    events: [
      { eventId: updateEventId, eventType: "customer.subscription.updated", ...updateDelivery },
      { eventId: cancelEventId, eventType: "customer.subscription.deleted", ...cancelDelivery },
    ],
    afterUpdate: { providerStatus: updated.status, appStatus: afterUpdateAgent?.status, billingPeriod: afterUpdateAgent?.billingPeriod, quota: afterUpdate.evidence.database.quota?.usage },
    afterCancel: { providerStatus: canceled.status, appStatus: canceledAgent?.status, ownerTrial: afterCancel.evidence.database.ownerTrial?.state, businessTrial: afterCancel.evidence.database.businessTrial?.state, quota: afterCancel.evidence.database.quota?.usage },
    initialConcurrentProviderFailures: afterCancel.evidence.failedProviderOriginDeliveries,
    preservedPriorQuotaAndTrialHistory: Boolean(canceledAgent?.status === "canceled" && afterCancel.evidence.database.ownerTrial?.state === "consumed" && afterCancel.evidence.database.businessTrial?.state === "consumed" && afterCancel.evidence.database.quota?.usage === handoff.initialQuota),
    evidenceFiles: [afterUpdate.evidencePath, afterCancel.evidencePath],
  };
  const dir = resolve(".local/a17-stripe-evidence"); mkdirSync(dir, { recursive: true });
  const evidencePath = join(dir, `provider-sequence-${handoff.runId}.json`);
  writeFileSync(evidencePath, `${JSON.stringify(sequence, null, 2)}\n`, { mode: 0o600 });
  process.stdout.write(`${JSON.stringify({ status: sequence.preservedPriorQuotaAndTrialHistory ? "passed" : "failed", ...sequence, evidenceFile: evidencePath }, null, 2)}\n`);
  if (!sequence.preservedPriorQuotaAndTrialHistory) process.exitCode = 2;
}

async function finalize() {
  const key = requireIsolatedTestMode();
  const handoff = JSON.parse(readFileSync(HANDOFF, "utf8"));
  const runtime = JSON.parse(readFileSync(RUNTIME, "utf8"));
  const { port: handoffPort } = validateHandoff(handoff);
  if (!Number.isInteger(runtime.appPort) || runtime.appPort < 1024 || runtime.appPort > 65535 || runtime.appPort !== handoffPort || runtime.appPid !== handoff.appPid || runtime.stripeCliPid !== handoff.stripeCliPid) throw new Error("private handoff/runtime identity mismatch; cleanup stopped");
  const finalSnapshot = await snapshot({ quiet: true, phase: "final-before-cleanup" });
  if (finalSnapshot.result.status !== "passed" || finalSnapshot.evidence.database.ownerTrial?.state !== "consumed" || finalSnapshot.evidence.database.businessTrial?.state !== "consumed" || finalSnapshot.evidence.database.quota?.usage !== handoff.initialQuota) throw new Error("final annual checkout/reconciliation invariants failed; fixture and evidence retained");
  const customerId = finalSnapshot.evidence.database.customerId;
  const subscriptionIds = [...new Set(finalSnapshot.evidence.providerSubscriptions.map((subscription) => subscription.id))];
  if (!/^cus_[A-Za-z0-9]+$/.test(customerId || "") || subscriptionIds.some((id) => !/^sub_[A-Za-z0-9]+$/.test(id))) throw new Error("synthetic provider IDs were not validated; cleanup stopped");
  const { default: Stripe } = await import("stripe");
  const stripe = new Stripe(key, { apiVersion: "2026-07-29.dahlia", maxNetworkRetries: 0, timeout: 20_000 });
  const customer = await stripe.customers.retrieve(customerId);
  if (customer.deleted || customer.livemode !== false || customer.metadata?.owner_user_id !== handoff.ownerUserId) throw new Error("Stripe customer ownership/test-mode validation failed; cleanup stopped");
  for (const id of subscriptionIds) {
    const subscription = await stripe.subscriptions.retrieve(id);
    const mappedCustomer = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
    if (subscription.livemode !== false || mappedCustomer !== customerId) throw new Error(`subscription ${id} did not match isolated test customer`);
    if (subscription.status !== "canceled") throw new Error(`subscription ${id} is ${subscription.status}; stop and reconcile it before final cleanup`);
  }
  const sessions = await stripe.checkout.sessions.list({ customer: customerId, status: "open", limit: 100 });
  const expiredSessions = [];
  for (const session of sessions.data) {
    if (session.livemode !== false || session.customer !== customerId) throw new Error("open checkout session ownership/test-mode validation failed");
    await stripe.checkout.sessions.expire(session.id);
    expiredSessions.push(session.id);
  }
  const processInfo = (pid) => {
    if (!Number.isInteger(pid) || pid <= 0) throw new Error("invalid recorded process ID");
    if (process.platform !== "win32") throw new Error("verified process cleanup currently requires Windows CIM support");
    const result = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", `$ErrorActionPreference='Stop'; $p=Get-CimInstance Win32_Process -Filter 'ProcessId = ${pid}' -ErrorAction Stop; if ($p) { ConvertTo-Json -Compress @{name=$p.Name; executablePath=$p.ExecutablePath; commandLine=$p.CommandLine} }`], { cwd: ROOT, encoding: "utf8", windowsHide: true, timeout: 10_000 });
    if (result.error || result.status !== 0) throw new Error("could not verify recorded process identity");
    return result.stdout.trim() ? JSON.parse(result.stdout.trim()) : null;
  };
  const expected = [
    { name: "app", pid: runtime.appPid, match: (info) => info?.name?.toLowerCase() === "node.exe" && info.commandLine.includes(ROOT) && info.commandLine.includes("a17-neon-only-preload.mjs") && info.commandLine.includes(join(ROOT, "node_modules", "next", "dist", "bin", "next")) && info.commandLine.includes(`-H ${ORIGIN_HOST}`) && info.commandLine.includes(`-p ${runtime.appPort}`) },
    { name: "stripe-cli", pid: runtime.stripeCliPid, match: (info) => info?.name?.toLowerCase() === "stripe.exe" && resolve(info.executablePath || "").toLowerCase() === resolve(run("where.exe", ["stripe"]).split(/\r?\n/)[0]).toLowerCase() && info.commandLine.includes("listen") && info.commandLine.includes(`http://${ORIGIN_HOST}:${runtime.appPort}/api/stripe/webhook`) },
  ];
  const stopped = [];
  const getLoopbackPortOwner = () => {
    const result = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", `$ErrorActionPreference='Stop'; try { $listeners=Get-NetTCPConnection -State Listen -ErrorAction Stop; $c=$listeners | Where-Object { $_.LocalPort -eq ${runtime.appPort} -and $_.LocalAddress -eq '${ORIGIN_HOST}' } | Select-Object -First 1; if ($c) { $c.OwningProcess }; exit 0 } catch { exit 3 }`], { encoding: "utf8", windowsHide: true, timeout: 10_000 });
    if (result.error || result.status !== 0) throw new Error("could not verify target loopback listener");
    return Number(result.stdout.trim()) || null;
  };
  for (const target of expected) {
    const info = processInfo(target.pid);
    if (info && !target.match(info)) throw new Error(`${target.name} process command line does not match this isolated target; fixture retained`);
    if (!info && target.name === "app" && getLoopbackPortOwner() !== null) throw new Error("recorded app exited but a process still owns its target loopback port; fixture retained");
  }
  const appInfo = processInfo(runtime.appPid);
  const appPortOwner = getLoopbackPortOwner();
  if (appInfo ? appPortOwner !== runtime.appPid : appPortOwner !== null) throw new Error("recorded app PID/loopback port ownership is inconsistent; fixture retained");
  for (const target of expected) {
    if (!processInfo(target.pid)) { stopped.push({ name: target.name, pid: target.pid, commandVerified: true, exited: true, confirmedAlreadyExited: true }); continue; }
    try { process.kill(target.pid, "SIGTERM"); } catch (error) { if (error?.code !== "ESRCH") throw error; }
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline && processInfo(target.pid)) await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
    if (processInfo(target.pid)) throw new Error(`${target.name} did not exit cleanly; fixture retained`);
    stopped.push({ name: target.name, pid: target.pid, commandVerified: true, exited: true });
  }
  if (getLoopbackPortOwner() !== null) throw new Error("target loopback listener remains after process shutdown; fixture retained");
  const archivedResources = await cleanupRunResources(key, handoff.runId, JSON.parse(readFileSync(JOURNAL, "utf8")));
  if (!archivedResources.ok) throw new Error("run-tagged product/price cleanup was incomplete; disposable fixture retained");
  await stripe.customers.del(customerId);
  const removedCustomer = await stripe.customers.retrieve(customerId);
  if (!removedCustomer.deleted) throw new Error("synthetic Stripe customer deletion was not confirmed");
  const evidenceDir = resolve(".local/a17-stripe-evidence");
  mkdirSync(evidenceDir, { recursive: true });
  const cleanupReceipt = {
    schema: "ornigami.a17.stripe-http-target-cleanup.v1", runId: handoff.runId,
    status: "provider-cleanup-complete-fixture-removal-pending", providerCleanupAt: new Date().toISOString(), testMode: true, customerId, customerDeleted: true,
    subscriptionIds, allSubscriptionsCanceled: true, expiredOpenCheckoutSessions: expiredSessions,
    archivedRunOwnedResources: archivedResources.resources, stoppedProcesses: stopped,
    finalDatabase: finalSnapshot.evidence.database, relatedProviderEvents: finalSnapshot.evidence.relatedProviderEvents,
    cleanupJournal: JSON.parse(readFileSync(JOURNAL, "utf8")),
    finalEvidenceFile: finalSnapshot.evidencePath,
  };
  const receiptPath = join(evidenceDir, `${handoff.runId}-cleanup.json`);
  writeFileSync(receiptPath, `${JSON.stringify(cleanupReceipt, null, 2)}\n`, { mode: 0o600 });
  run(process.execPath, [join(ROOT, "scripts", "a20-app-fixture.mjs"), "cleanup"]);
  cleanupReceipt.status = "complete";
  cleanupReceipt.completedAt = new Date().toISOString();
  cleanupReceipt.databaseFixture = "removed-by-a20-marker-validated-cleanup";
  writeFileSync(receiptPath, `${JSON.stringify(cleanupReceipt, null, 2)}\n`, { mode: 0o600 });
  process.stdout.write(`${JSON.stringify({ status: "provider-cleanup-complete", receiptFile: receiptPath, customerDeleted: true, canceledSubscriptions: subscriptionIds.length, archivedResources: archivedResources.resources, stoppedProcesses: stopped }, null, 2)}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const action = process.argv[2] || "start";
  const operation = action === "snapshot" ? snapshot : action === "provider-sequence" ? providerSequence : action === "finalize" ? finalize : action === "start" ? start : null;
  if (!operation) { process.stderr.write("Usage: node scripts/a17-stripe-http-target.mjs [start|snapshot|provider-sequence|finalize]\n"); process.exitCode = 2; }
  else operation().catch((error) => { process.stderr.write(`A17 local target failed safely: ${error instanceof Error ? error.message : "unknown error"}\n`); process.exitCode = 1; });
}
