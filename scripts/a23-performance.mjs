import { createHash } from "node:crypto";
import { chmodSync, existsSync, readFileSync, realpathSync, readdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { assessSamples, summarizeSamples } from "./a23-performance-core.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixtureRoot = path.join(root, ".a20-fixture");
const markerPath = path.join(fixtureRoot, "marker.json");
const runtimePath = path.join(fixtureRoot, "runtime.json");
const credentialsPath = path.join(fixtureRoot, "credentials.json");
const outboundPath = path.join(fixtureRoot, "outbound-blocked.jsonl");
const performanceMarkerPath = path.join(fixtureRoot, "a23-performance.json");
const sessionCount = 10;
const rounds = 4;
const minSamplesPerRoute = 40;
const minWarmSamplesPerRoute = 30;
const maxLatencyMs = 3000;
const requestTimeoutMs = 15_000;
const routeDefinitions = [
  { name: "dashboard-home-html", kind: "html", path: () => "/dashboard", check: /Welcome back|Bring Google reviews into one inbox/i },
  { name: "review-booster-html", kind: "html", path: () => "/dashboard/agents/review-booster", check: /Keep the conversation going|Reviews synced/i },
  { name: "review-booster-settings-html", kind: "html", path: () => "/dashboard/agents/review-booster/settings", check: /Only the business owner can change Review Booster settings|Rebooking/i },
  { name: "review-replies-html", kind: "html", path: () => "/dashboard/agents/review-replies/reviews", check: /Your review inbox|Connect Google and select a location to load your reviews/i },
  { name: "dashboard-summary-api", kind: "json", path: () => "/api/dashboard/summary", check: (body) => body?.reviewsCount === 96_001 && typeof body?.projectsCount === "number" },
  { name: "review-booster-settings-api", kind: "json", path: (c) => `/api/review-booster/settings?businessId=${encodeURIComponent(c.business.id)}`,
    check: (body, c) => body?.businessId === c.business.id && body?.name === "A20 Studio" },
  { name: "review-booster-visits-api", kind: "json", path: (c) => `/api/review-booster/visits?businessId=${encodeURIComponent(c.business.id)}&limit=20`,
    check: (body, c) => body?.businessId === c.business.id && body?.items?.length === 20 && body.items.every((item) => item.business_id === c.business.id && item.source === "a23-performance") },
  { name: "reply-settings-api", kind: "json", path: (c) => `/api/settings/reply?businessId=${encodeURIComponent(c.business.id)}`,
    check: (body, c) => body?.businessId === c.business.id && body?.role === "owner" },
  { name: "google-connection-api", kind: "json", path: (c) => `/api/google/connection?businessId=${encodeURIComponent(c.business.id)}`,
    check: (body) => body?.connected === true && Array.isArray(body?.locations) && body.locations.some((location) => location.selected === true) },
  { name: "reviews-api", kind: "json", path: (c) => `/api/reviews?businessId=${encodeURIComponent(c.business.id)}&loc=${encodeURIComponent(c.review.locationName)}&limit=20`,
    check: (body, c) => body?.businessId === c.business.id && body?.locationName === c.review.locationName && body?.items?.length === 20 && body.items.every((item) => item.google_review_id.startsWith("a23-perf-owner-")) },
];

function sqlQuote(value) { return `'${String(value).replaceAll("'", "''")}'`; }
function validUuid(value) { return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value); }

function psql(port, database, sql) {
  const pgBin = process.env.A20_PG_BIN ?? "C:/Program Files/PostgreSQL/17/bin";
  const executable = process.platform === "win32" ? path.join(pgBin, "psql.exe") : process.env.A20_PG_BIN ? path.join(pgBin, "psql") : "psql";
  const envKeys = ["PATH", "SystemRoot", "ComSpec", "TEMP", "TMP", "WINDIR"];
  const env = Object.fromEntries(envKeys.filter((key) => process.env[key]).map((key) => [key, process.env[key]]));
  env.PGCLIENTENCODING = "UTF8";
  env.PGSERVICEFILE = path.join(fixtureRoot, "no-pg-service.conf");
  env.PGPASSFILE = path.join(fixtureRoot, "no-pgpass");
  const result = spawnSync(executable, ["-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-h", "127.0.0.1", "-p", String(port), "-U", "postgres", "-d", database, "-f", "-"], {
    cwd: root, input: sql, encoding: "utf8", windowsHide: true, timeout: 120_000, env,
  });
  if (result.error || result.status !== 0) throw new Error("A23 local fixture database operation failed");
  return String(result.stdout).trim();
}

function performanceSnapshot(marker, credentials) {
  const ownerBusiness = sqlQuote(credentials.business.id);
  const otherBusiness = sqlQuote(credentials.outsiderBusiness.id);
  const payload = psql(marker.port, marker.database, `SELECT json_build_object(
    'ownerReviews',(SELECT count(*) FROM public.reviews WHERE business_id=${ownerBusiness} AND google_review_id LIKE 'a23-perf-%'),
    'otherReviews',(SELECT count(*) FROM public.reviews WHERE business_id=${otherBusiness} AND google_review_id LIKE 'a23-perf-%'),
    'ownerReviewHash',(SELECT bit_xor(hashtextextended(to_jsonb(r)::text,0)) FROM public.reviews r WHERE business_id=${ownerBusiness} AND google_review_id LIKE 'a23-perf-%'),
    'otherReviewHash',(SELECT bit_xor(hashtextextended(to_jsonb(r)::text,0)) FROM public.reviews r WHERE business_id=${otherBusiness} AND google_review_id LIKE 'a23-perf-%'),
    'ownerVisits',(SELECT count(*) FROM public.followup_visits WHERE business_id=${ownerBusiness} AND source='a23-performance'),
    'otherVisits',(SELECT count(*) FROM public.followup_visits WHERE business_id=${otherBusiness} AND source='a23-performance'),
    'ownerVisitHash',(SELECT bit_xor(hashtextextended(to_jsonb(v)::text,0)) FROM public.followup_visits v WHERE business_id=${ownerBusiness} AND source='a23-performance'),
    'otherVisitHash',(SELECT bit_xor(hashtextextended(to_jsonb(v)::text,0)) FROM public.followup_visits v WHERE business_id=${otherBusiness} AND source='a23-performance')
  )::text;`);
  return JSON.parse(payload);
}

function writePrivateJson(file, value) {
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  if (process.platform !== "win32") chmodSync(file, 0o600);
}

function runA20(action) {
  const result = spawnSync(process.execPath, [path.join(root, "scripts", "a20-app-fixture.mjs"), action], {
    cwd: root, encoding: "utf8", windowsHide: true, timeout: 60_000,
  });
  if (result.error || result.status !== 0) throw new Error(`A20 fixture ${action} failed`);
}

function a20Snapshot() {
  const result = spawnSync(process.execPath, [path.join(root, "scripts", "a20-app-fixture.mjs"), "snapshot"], {
    cwd: root, encoding: "utf8", windowsHide: true, timeout: 30_000,
  });
  if (result.error || result.status !== 0) throw new Error("could not read the A20 read-only fixture snapshot");
  try { return JSON.parse(String(result.stdout).trim()); }
  catch { throw new Error("A20 read-only fixture snapshot was invalid"); }
}

function prepareFixture() {
  if (existsSync(performanceMarkerPath)) throw new Error("A23 fixture is already prepared; stop and review its private marker before changing it");
  const { marker, credentials } = loadDatabaseFixture();
  if (marker.port < 1024 || marker.database !== "a20_browser_fixture" || !validUuid(credentials.business.id) ||
      !validUuid(credentials.outsiderBusiness?.id) || !validUuid(credentials.actors?.owner?.id) || !validUuid(credentials.actors?.outsider?.id)) {
    throw new Error("A23 refused fixture database or actor identities");
  }
  runFixtureAssert();
  runA20("connect");
  const owner = sqlQuote(credentials.actors.owner.id);
  const outsider = sqlQuote(credentials.actors.outsider.id);
  const ownerBusiness = sqlQuote(credentials.business.id);
  const otherBusiness = sqlQuote(credentials.outsiderBusiness.id);
  const locationName = sqlQuote(credentials.review.locationName);
  psql(marker.port, marker.database, `BEGIN;
    DELETE FROM public.reviews WHERE google_review_id LIKE 'a23-perf-%';
    DELETE FROM public.followup_visits WHERE source='a23-performance';
    INSERT INTO public.reviews(user_id,business_id,location_name,google_review_id,reviewer_name,star_rating,comment,review_update_time,status)
    SELECT CASE WHEN n % 5 = 0 THEN ${outsider}::uuid ELSE ${owner}::uuid END,
      CASE WHEN n % 5 = 0 THEN ${otherBusiness}::uuid ELSE ${ownerBusiness}::uuid END,
      CASE WHEN n % 5 = 0 THEN 'a23-other-scope' ELSE ${locationName} END,
      CASE WHEN n % 5 = 0 THEN 'a23-perf-other-' || n ELSE 'a23-perf-owner-' || n END,
      'A23 Synthetic Reviewer ' || n, 1 + (n % 5), 'Synthetic A23 performance fixture review ' || n,
      now() - n * interval '1 second', 'new'
    FROM generate_series(1,120000) AS n;
    INSERT INTO public.followup_visits(id,business_id,customer_name,customer_email,service_name,visited_at,source,followup_status)
    SELECT ('a2300000-0000-4000-8000-' || lpad(to_hex(n),12,'0'))::uuid,
      CASE WHEN n % 5 = 0 THEN ${otherBusiness}::uuid ELSE ${ownerBusiness}::uuid END,
      'A23 Synthetic Guest ' || n,
      'a23-' || n || '@example.test', 'Synthetic appointment', now() - n * interval '1 second', 'a23-performance', 'pending'
    FROM generate_series(1,120000) AS n;
    COMMIT;`);
  const seeded = performanceSnapshot(marker, credentials);
  if (seeded.ownerReviews !== 96_000 || seeded.otherReviews !== 24_000 || seeded.ownerVisits !== 96_000 || seeded.otherVisits !== 24_000) {
    throw new Error("A23 synthetic seed counts did not match the expected two-tenant distribution");
  }
  writePrivateJson(performanceMarkerPath, { task: "A23", version: 1, fixtureRoot, database: marker.database,
    port: marker.port, ownerBusinessId: credentials.business.id, outsiderBusinessId: credentials.outsiderBusiness.id,
    reviewRows: 120_000, visitRows: 120_000, seededSnapshot: seeded, preparedAt: new Date().toISOString() });
  console.log(JSON.stringify({ suite: "A23 fixture preparation", ownerReviews: seeded.ownerReviews, outsiderReviews: seeded.otherReviews,
    ownerVisits: seeded.ownerVisits, outsiderVisits: seeded.otherVisits, selectedSyntheticGoogleLocation: true }));
}

function runFixtureAssert() {
  const child = spawnSync(process.execPath, [path.join(root, "scripts", "a20-app-fixture.mjs"), "assert"], {
    cwd: root, encoding: "utf8", windowsHide: true, timeout: 30_000,
  });
  if (child.error || child.status !== 0) throw new Error("A20 outbound audit failed; run the fixture assertion for details");
}

function loadDatabaseFixture() {
  if (realpathSync(fixtureRoot) !== fixtureRoot) throw new Error("A20 fixture resolved outside this worktree");
  const marker = JSON.parse(readFileSync(markerPath, "utf8"));
  const credentials = JSON.parse(readFileSync(credentialsPath, "utf8"));
  if (marker.task !== "A20" || marker.version !== 1 || marker.state !== "ready" || marker.database !== "a20_browser_fixture" ||
      marker.host !== "127.0.0.1" || marker.fixtureRoot !== fixtureRoot || marker.clusterPath !== path.join(fixtureRoot, "postgres", "data") ||
      !Number.isInteger(marker.port) || marker.port < 1024 ||
      credentials.task !== "A20" || !credentials.credentials?.owner || !credentials.actors?.owner?.id || !credentials.business?.id) {
    throw new Error("A20 local database fixture metadata is missing or invalid");
  }
  return { marker, credentials };
}

function loadFixture() {
  const { marker, credentials } = loadDatabaseFixture();
  const runtime = JSON.parse(readFileSync(runtimePath, "utf8"));
  if (runtime.task !== "A20" || !Number.isInteger(runtime.pid) || !Number.isInteger(runtime.port) || runtime.port < 1024 ||
      runtime.url !== `http://127.0.0.1:${runtime.port}` || !runtime.buildId || !runtime.buildHash || !runtime.buildTree || credentials.url !== runtime.url) {
    throw new Error("A20 production runtime metadata is missing or invalid");
  }
  const base = new URL(runtime.url);
  if (base.protocol !== "http:" || base.hostname !== "127.0.0.1") throw new Error("refusing non-loopback fixture URL");
  const nextBuildIdPath = path.join(root, ".next", "BUILD_ID");
  if (!existsSync(nextBuildIdPath) || readFileSync(nextBuildIdPath, "utf8").trim() !== runtime.buildId) {
    throw new Error("production build ID differs from the A20 fixture build evidence");
  }
  return { marker, runtime, credentials, base };
}

function currentSourceEvidence() {
  const git = (...args) => {
    const result = spawnSync("git", args, { cwd: root, encoding: "utf8", windowsHide: true, timeout: 10_000 });
    if (result.error || result.status !== 0) throw new Error("could not verify source tree against the A20 build evidence");
    return String(result.stdout).trim();
  };
  const commit = git("rev-parse", "HEAD");
  const tree = git("rev-parse", "HEAD^{tree}");
  const dirty = git("status", "--porcelain", "--untracked-files=no");
  return { commit, tree, cleanTrackedTree: dirty.length === 0 };
}

function hashBuildTree(buildDir) {
  const digest = createHash("sha256");
  function walk(dir, prefix = "") {
    for (const item of readdirSync(dir, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
      if (!prefix && item.name === "cache") continue;
      const absolute = path.join(dir, item.name);
      const name = `${prefix}${item.name}`;
      if (item.isDirectory()) walk(absolute, `${name}/`);
      else if (item.isFile()) digest.update(name).update("\0").update(createHash("sha256").update(readFileSync(absolute)).digest()).update("\0");
    }
  }
  walk(buildDir);
  return digest.digest("hex");
}

function cookieStore() {
  const values = new Map();
  return {
    absorb(response) {
      const lines = typeof response.headers.getSetCookie === "function"
        ? response.headers.getSetCookie() : [response.headers.get("set-cookie")].filter(Boolean);
      for (const line of lines) {
        const pair = line.split(";", 1)[0];
        const separator = pair.indexOf("=");
        if (separator < 1) continue;
        const name = pair.slice(0, separator).trim();
        const value = pair.slice(separator + 1).trim();
        if (value === "" || /max-age=0/i.test(line)) values.delete(name);
        else values.set(name, value);
      }
    },
    header: () => [...values].map(([name, value]) => `${name}=${value}`).join("; "),
    sessionToken: () => [...values].filter(([name]) => /^(?:__Secure-)?authjs\.session-token(?:\.\d+)?$/i.test(name))
      .sort(([left], [right]) => left.localeCompare(right)).map(([name, value]) => `${name}=${value}`).join("; "),
  };
}

async function authenticate(base, credentials) {
  const jar = cookieStore();
  const boundedFetch = (url, options) => fetch(url, { ...options, signal: AbortSignal.timeout(15_000) });
  const csrfResponse = await boundedFetch(new URL("/api/auth/csrf", base), { redirect: "manual" });
  jar.absorb(csrfResponse);
  if (!csrfResponse.ok) throw new Error(`Auth.js CSRF endpoint returned ${csrfResponse.status}`);
  const csrfBody = await csrfResponse.json();
  if (typeof csrfBody.csrfToken !== "string" || !csrfBody.csrfToken) throw new Error("Auth.js CSRF token missing");
  const form = new URLSearchParams({
    csrfToken: csrfBody.csrfToken,
    email: credentials.email,
    password: credentials.password,
    callbackUrl: new URL("/dashboard", base).href,
    json: "true",
  });
  const signIn = await boundedFetch(new URL("/api/auth/callback/credentials", base), {
    method: "POST", redirect: "manual",
    headers: { "content-type": "application/x-www-form-urlencoded", cookie: jar.header(), origin: base.origin,
      referer: new URL("/login", base).href, "x-auth-return-redirect": "true" },
    body: form,
  });
  jar.absorb(signIn);
  if (!signIn.ok || signIn.status >= 300 && signIn.status < 400) throw new Error(`Auth.js credentials callback returned ${signIn.status}`);
  const body = await signIn.text();
  let redirectValue;
  try {
    const parsed = JSON.parse(body);
    redirectValue = typeof parsed === "string" ? parsed : parsed?.url;
  } catch { redirectValue = signIn.headers.get("location"); }
  const redirect = typeof redirectValue === "string" ? new URL(redirectValue, base) : null;
  if (!redirect || redirect.origin !== base.origin || redirect.protocol !== "http:") throw new Error("Auth.js did not return a loopback redirect");
  const sessionResponse = await boundedFetch(new URL("/api/auth/session", base), { headers: { cookie: jar.header() }, redirect: "manual" });
  jar.absorb(sessionResponse);
  if (!sessionResponse.ok || sessionResponse.status >= 300 && sessionResponse.status < 400) throw new Error(`Auth.js session endpoint returned ${sessionResponse.status}`);
  const session = await sessionResponse.json();
  if (session?.user?.id !== credentials.actorId) throw new Error("Auth.js session subject did not match the fixture owner");
  return { jar };
}

async function sample(base, session, definition, route, credentials, round) {
  const started = performance.now();
  try {
    const response = await fetch(new URL(route, base), {
      headers: { cookie: session.jar.header(), accept: definition.kind === "html" ? "text/html" : "application/json" },
      redirect: "manual", signal: AbortSignal.timeout(requestTimeoutMs),
    });
    const text = await response.text();
    const durationMs = Number((performance.now() - started).toFixed(2));
    const contentType = response.headers.get("content-type") ?? "";
    let contentValid = false;
    if (definition.kind === "html") {
      contentValid = contentType.toLowerCase().includes("text/html") && definition.check.test(text) &&
        !/Something went wrong|NEXT_HTTP_ERROR_FALLBACK|Application error|Internal Server Error/i.test(text);
    } else if (contentType.toLowerCase().includes("application/json")) {
      try { contentValid = definition.check(JSON.parse(text), credentials); } catch { contentValid = false; }
    }
    const valid = response.status === 200 && !response.redirected && !(response.status >= 300 && response.status < 400) && contentValid;
    return { durationMs, status: response.status, phase: round === 0 ? "first-wave" : "warm", ok: valid,
      error: valid ? null : `http-${response.status}${contentValid ? "" : "-invalid-content-or-scope"}`,
      bytes: Buffer.byteLength(text) };
  } catch (error) {
    const durationMs = Number((performance.now() - started).toFixed(2));
    return { durationMs, status: null, phase: round === 0 ? "first-wave" : "warm", ok: false,
      error: error?.name === "TimeoutError" || error?.name === "AbortError" ? "timeout" : "request-error", bytes: 0 };
  }
}

async function main() {
  const action = process.argv[2];
  if (action === "prepare") { prepareFixture(); return; }
  if (action && action !== "run") throw new Error("usage: node scripts/a23-performance.mjs <prepare|run>");
  const { runtime, credentials, base } = loadFixture();
  if (!existsSync(performanceMarkerPath)) throw new Error("A23 synthetic data is missing; run the prepare command first");
  const performanceMarker = JSON.parse(readFileSync(performanceMarkerPath, "utf8"));
  if (performanceMarker.task !== "A23" || performanceMarker.version !== 1 || performanceMarker.fixtureRoot !== fixtureRoot ||
      performanceMarker.database !== "a20_browser_fixture" || performanceMarker.port < 1024 || performanceMarker.port !== JSON.parse(readFileSync(markerPath, "utf8")).port) {
    throw new Error("A23 private data marker does not match the A20 local fixture");
  }
  const source = currentSourceEvidence();
  if (!source.cleanTrackedTree || source.commit !== runtime.candidateCommit || source.tree !== runtime.buildTree) {
    throw new Error("source tree is dirty or differs from the A20 production build evidence");
  }
  if (hashBuildTree(path.join(root, ".next")) !== runtime.buildHash) throw new Error("production build files differ from the A20 build hash evidence");
  const snapshotBefore = performanceSnapshot(performanceMarker, credentials);
  if (JSON.stringify(snapshotBefore) !== JSON.stringify(performanceMarker.seededSnapshot)) throw new Error("A23 synthetic data differs from its prepared read-only snapshot");
  const fixtureSnapshotBefore = a20Snapshot();
  runFixtureAssert();
  const owner = credentials.credentials.owner;
  const sessions = [];
  for (let index = 0; index < sessionCount; index += 1) {
    sessions.push(await authenticate(base, { ...owner, actorId: credentials.actors.owner.id }));
  }
  const sessionTokens = sessions.map((session) => session.jar.sessionToken());
  if (sessionTokens.some((token) => !token) || new Set(sessionTokens).size !== sessionCount) {
    throw new Error("Auth.js did not produce ten distinct authenticated session tokens");
  }
  const results = [];
  for (const definition of routeDefinitions) {
    const route = definition.path(credentials);
    for (let round = 0; round < rounds; round += 1) {
      const current = await Promise.all(sessions.map((session, sessionIndex) => sample(base, session, definition, route, credentials, round)
        .then((result) => ({ ...result, route: definition.name, session: sessionIndex + 1, round: round + 1 }))));
      results.push(...current);
    }
  }
  const snapshotAfter = performanceSnapshot(performanceMarker, credentials);
  const fixtureSnapshotAfter = a20Snapshot();
  const sourceAfter = currentSourceEvidence();
  const buildAfter = { buildId: readFileSync(path.join(root, ".next", "BUILD_ID"), "utf8").trim(), buildHash: hashBuildTree(path.join(root, ".next")) };
  const sourceBuildStable = JSON.stringify(source) === JSON.stringify(sourceAfter) && sourceAfter.cleanTrackedTree &&
    sourceAfter.commit === runtime.candidateCommit && sourceAfter.tree === runtime.buildTree &&
    buildAfter.buildId === runtime.buildId && buildAfter.buildHash === runtime.buildHash;
  runFixtureAssert();
  const failures = results.filter((result) => !result.ok);
  const byRoute = Object.fromEntries(routeDefinitions.map(({ name }) => {
    const routeSamples = results.filter((sample) => sample.route === name);
    const firstWave = routeSamples.filter((sample) => sample.phase === "first-wave");
    const warm = routeSamples.filter((sample) => sample.phase === "warm");
    const all = assessSamples(routeSamples, { minimum: minSamplesPerRoute, latencyLimitMs: maxLatencyMs });
    const warmSummary = assessSamples(warm, { minimum: minWarmSamplesPerRoute, latencyLimitMs: maxLatencyMs });
    return [name, {
      firstWave: summarizeSamples(firstWave), warm: warmSummary, all,
      pass: all.pass && warmSummary.pass && routeSamples.every((sample) => sample.ok),
    }];
  }));
  const aggregate = {
    firstWave: summarizeSamples(results.filter((sample) => sample.phase === "first-wave")),
    warm: assessSamples(results.filter((sample) => sample.phase === "warm"), { minimum: minWarmSamplesPerRoute * routeDefinitions.length, latencyLimitMs: maxLatencyMs }),
    all: assessSamples(results, { minimum: minSamplesPerRoute * routeDefinitions.length, latencyLimitMs: maxLatencyMs }),
  };
  const report = {
    suite: "A23 authenticated read performance",
    source: { before: source, after: sourceAfter, stable: sourceBuildStable },
    build: { before: { commit: runtime.candidateCommit ?? null, tree: runtime.buildTree, buildId: runtime.buildId, buildHash: runtime.buildHash }, after: buildAfter },
    fixture: { seededReviews: 120_000, seededVisits: 120_000, ownerScopeRows: 96_000, outsiderScopeRows: 24_000,
      readOnlySnapshotPreserved: JSON.stringify(snapshotBefore) === JSON.stringify(snapshotAfter) && JSON.stringify(fixtureSnapshotBefore) === JSON.stringify(fixtureSnapshotAfter) },
    load: { authenticatedSessions: sessions.length, distinctCookieSessions: sessions.length, concurrentRequests: sessionCount, roundsPerRoute: rounds,
      samplesPerRoute: results.length / routeDefinitions.length, firstWaveSamplesPerRoute: sessionCount, warmSamplesPerRoute: sessionCount * (rounds - 1),
      requestTimeoutMs, latencyLimitMs: maxLatencyMs, percentile: "nearest-rank p95", phaseNote: "first-wave is the first measured wave per route after login and app startup, not a process-cold request" },
    routes: byRoute,
    aggregate,
    measurements: results.map(({ route, session, round, phase, status, durationMs, bytes, ok, error }) => ({ route, session, round, phase, status, durationMs, bytes, ok, error })),
    failures: failures.map(({ route, session, round, phase, status, durationMs, error }) => ({ route, session, round, phase, status, durationMs, error })),
    outbound: { audit: "A20 blocked-attempt ledger and fixture assertion", blockedAttempts: existsSync(outboundPath) ? readFileSync(outboundPath, "utf8").trim().split(/\r?\n/).filter(Boolean).length : 0 },
    pass: results.length === routeDefinitions.length * minSamplesPerRoute && failures.length === 0 &&
      sourceBuildStable && JSON.stringify(snapshotBefore) === JSON.stringify(snapshotAfter) && JSON.stringify(fixtureSnapshotBefore) === JSON.stringify(fixtureSnapshotAfter) &&
      Object.values(byRoute).every((summary) => summary.pass) && aggregate.all.pass && aggregate.warm.pass,
  };
  console.log(JSON.stringify(report, null, 2));
  if (!report.pass) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`A23 performance: ${error instanceof Error ? error.message : "unknown error"}`);
  process.exitCode = 1;
});
