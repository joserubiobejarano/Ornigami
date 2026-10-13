import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from "node:fs";
import { createServer as createHttpServer, request as httpRequest } from "node:http";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { maxClsSessionWindow, summarize, summarizeApiCalls } from "./mobile-browser-performance-core.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixture = path.join(root, ".a20-fixture");
const evidencePath = path.join(root, ".local", "recovery", "mobile-browser-performance-evidence.json");
const outputPath = process.env.MOBILE_BROWSER_PERFORMANCE_OUTPUT
  ? path.resolve(process.env.MOBILE_BROWSER_PERFORMANCE_OUTPUT) : evidencePath;
const playwrightEntry = path.join(fixture, "mobile-performance-tools", "node_modules", "playwright", "index.mjs");
const repeats = 5;
const timeoutMs = 60_000;
const network = { offline: false, latency: 150, downloadThroughput: 1_600_000 / 8, uploadThroughput: 750_000 / 8, connectionType: "cellular3g" };
const cpuRate = 4;
const device = { name: "Pixel 7 emulation", width: 412, height: 915, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true };
const routes = [
  { name: "public-entry", path: "/", auth: false, content: /Every review, answered in|Reviews, handled/i, action: { name: "open public demo", selector: 'a[href="/demo"]', expect: /\/demo(?:\?|$)/ } },
  { name: "dashboard", path: "/dashboard", auth: true, content: /Welcome back|Bring Google reviews into one inbox/i, action: { name: "open dashboard agent menu", selector: "#dashboard-mobile-agent-menu-trigger", completion: '[role="menuitem"]' } },
  { name: "review-inbox", path: "/dashboard/agents/review-replies/reviews", auth: true, content: /Your review inbox|Connect Google and select a location to load your reviews/i, action: { name: "load next review page", selector: 'nav[aria-label="Review pages"] button:has-text("Next")', waitForApi: true } },
  { name: "review-replies-settings", path: "/dashboard/agents/review-replies/settings", auth: true, content: /Review Replies|settings|Google profile/i, action: { name: "open review replies agent menu", selector: "#dashboard-mobile-agent-menu-trigger", completion: '[role="menuitem"]' } },
];
const deviceName = "Pixel 7";
const reviewDraftSelector = 'main textarea[aria-label^="Reply draft"]';

function requireFixture() {
  for (const file of [path.join(fixture, "marker.json"), path.join(fixture, "runtime.json"), path.join(fixture, "credentials.json"), path.join(fixture, "a23-performance.json")]) {
    if (!existsSync(file)) throw new Error("A20/A23 local fixture is incomplete; run its setup/start lifecycle and the A23 prepare command first");
  }
  if (!existsSync(playwrightEntry)) throw new Error("Pinned Playwright dependency is missing; run `npm install --prefix .a20-fixture/mobile-performance-tools --no-save --ignore-scripts playwright@1.63.0`");
  const marker = JSON.parse(readFileSync(path.join(fixture, "marker.json"), "utf8"));
  const runtime = JSON.parse(readFileSync(path.join(fixture, "runtime.json"), "utf8"));
  const credentials = JSON.parse(readFileSync(path.join(fixture, "credentials.json"), "utf8"));
  const perf = JSON.parse(readFileSync(path.join(fixture, "a23-performance.json"), "utf8"));
  if (realpathSync(fixture) !== fixture || marker.task !== "A20" || marker.state !== "ready" || marker.host !== "127.0.0.1" || marker.database !== "a20_browser_fixture" || marker.fixtureRoot !== fixture ||
      runtime.task !== "A20" || !Number.isInteger(runtime.port) ||
      perf.task !== "A23" || perf.fixtureRoot !== fixture || perf.database !== marker.database || perf.port !== marker.port) {
    throw new Error("A20/A23 private fixture markers disagree; refusing to run the browser lab");
  }
  const base = new URL(runtime.url);
  if (base.protocol !== "http:" || base.hostname !== "127.0.0.1" || Number(base.port) !== runtime.port || base.username || base.password || base.pathname !== "/" || base.search || base.hash) throw new Error("A20 runtime URL is not loopback-bound");
  return { marker, runtime, credentials, perf, base };
}

function git(args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8", windowsHide: true, timeout: 10_000 });
  if (result.error || result.status !== 0) throw new Error("could not verify source/build identity");
  return String(result.stdout).trim();
}

function sourceEvidence() {
  const commit = git(["rev-parse", "HEAD"]);
  const tree = git(["rev-parse", "HEAD^{tree}"]);
  return { commit, tree, cleanTrackedTree: git(["status", "--porcelain", "--untracked-files=no"]) === "" };
}

function hashBuildTree(buildDir) {
  const hash = createHash("sha256");
  function walk(dir, prefix = "") {
    for (const item of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (!prefix && item.name === "cache") continue;
      const full = path.join(dir, item.name);
      if (item.isDirectory()) walk(full, `${prefix}${item.name}/`);
      else if (item.isFile()) hash.update(`${prefix}${item.name}\0`).update(createHash("sha256").update(readFileSync(full)).digest()).update("\0");
    }
  }
  walk(buildDir);
  return hash.digest("hex");
}

function fixtureCommand(action) {
  const result = spawnSync(process.execPath, [path.join(root, "scripts", "a20-app-fixture.mjs"), action], { cwd: root, encoding: "utf8", windowsHide: true, timeout: 30_000 });
  if (result.error || result.status !== 0) throw new Error(`A20 ${action} assertion failed; private fixture logs retain diagnostic detail`);
  return result.stdout.trim();
}

function jsonCommand(action) {
  const text = fixtureCommand(action);
  try { return JSON.parse(text); } catch { throw new Error(`A20 ${action} returned invalid JSON`); }
}

function a23RowsSnapshot(marker, credentials) {
  const q = (value) => {
    if (typeof value !== "string" || !/^[0-9a-f-]{36}$/i.test(value)) throw new Error("invalid A23 synthetic row identity");
    return `'${value}'`;
  };
  const owner = q(credentials.business.id);
  const other = q(credentials.outsiderBusiness.id);
  const sql = `SELECT json_build_object(
    'ownerReviews',(SELECT count(*) FROM public.reviews WHERE business_id=${owner} AND google_review_id LIKE 'a23-perf-%'),
    'otherReviews',(SELECT count(*) FROM public.reviews WHERE business_id=${other} AND google_review_id LIKE 'a23-perf-%'),
    'ownerReviewHash',(SELECT bit_xor(hashtextextended(to_jsonb(r)::text,0)) FROM public.reviews r WHERE business_id=${owner} AND google_review_id LIKE 'a23-perf-%'),
    'otherReviewHash',(SELECT bit_xor(hashtextextended(to_jsonb(r)::text,0)) FROM public.reviews r WHERE business_id=${other} AND google_review_id LIKE 'a23-perf-%'),
    'ownerVisits',(SELECT count(*) FROM public.followup_visits WHERE business_id=${owner} AND source='a23-performance'),
    'otherVisits',(SELECT count(*) FROM public.followup_visits WHERE business_id=${other} AND source='a23-performance'),
    'ownerVisitHash',(SELECT bit_xor(hashtextextended(to_jsonb(v)::text,0)) FROM public.followup_visits v WHERE business_id=${owner} AND source='a23-performance'),
    'otherVisitHash',(SELECT bit_xor(hashtextextended(to_jsonb(v)::text,0)) FROM public.followup_visits v WHERE business_id=${other} AND source='a23-performance')
  )::text;`;
  const pgBin = process.env.A20_PG_BIN ?? "C:/Program Files/PostgreSQL/17/bin";
  const executable = process.platform === "win32" ? path.join(pgBin, "psql.exe") : process.env.A20_PG_BIN ? path.join(pgBin, "psql") : "psql";
  const envKeys = ["PATH", "SystemRoot", "ComSpec", "TEMP", "TMP", "WINDIR"];
  const env = Object.fromEntries(envKeys.filter((key) => process.env[key]).map((key) => [key, process.env[key]]));
  env.PGCLIENTENCODING = "UTF8";
  env.PGSERVICEFILE = path.join(fixture, "no-pg-service.conf");
  env.PGPASSFILE = path.join(fixture, "no-pgpass");
  const result = spawnSync(executable, ["-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-h", "127.0.0.1", "-p", String(marker.port), "-U", "postgres", "-d", marker.database, "-f", "-"], {
    cwd: root, input: sql, encoding: "utf8", windowsHide: true, timeout: 120_000, env,
  });
  if (result.error || result.status !== 0) throw new Error("A23 synthetic row snapshot could not be read from the isolated local database");
  try { return JSON.parse(String(result.stdout).trim()); } catch { throw new Error("A23 synthetic row snapshot was invalid"); }
}

function cookieStore() {
  const cookies = new Map();
  return {
    absorb(response) {
      const lines = typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : [response.headers.get("set-cookie")].filter(Boolean);
      for (const line of lines) {
        const pair = line.split(";", 1)[0];
        const at = pair.indexOf("=");
        if (at < 1) continue;
        const name = pair.slice(0, at).trim();
        const value = pair.slice(at + 1).trim();
        if (value === "" || /max-age=0/i.test(line)) cookies.delete(name);
        else cookies.set(name, value);
      }
    },
    header: () => [...cookies].map(([name, value]) => `${name}=${value}`).join("; "),
  };
}

async function ownerCookie(base, credentials) {
  const jar = cookieStore();
  const csrfResponse = await fetch(new URL("/api/auth/csrf", base), { redirect: "manual", signal: AbortSignal.timeout(timeoutMs) });
  jar.absorb(csrfResponse);
  if (!csrfResponse.ok) throw new Error(`fixture auth CSRF request failed with ${csrfResponse.status}`);
  const csrf = await csrfResponse.json();
  const form = new URLSearchParams({ csrfToken: csrf.csrfToken, email: credentials.email, password: credentials.password,
    callbackUrl: new URL("/dashboard", base).href, json: "true" });
  const response = await fetch(new URL("/api/auth/callback/credentials", base), { method: "POST", redirect: "manual", signal: AbortSignal.timeout(timeoutMs),
    headers: { "content-type": "application/x-www-form-urlencoded", cookie: jar.header(), origin: base.origin,
      referer: new URL("/login", base).href, "x-auth-return-redirect": "true" }, body: form });
  jar.absorb(response);
  if (!response.ok || response.status >= 300 && response.status < 400) throw new Error(`fixture owner authentication failed with ${response.status}`);
  const token = jar.header().split(";").map((cookie) => cookie.trim()).find((cookie) => /^(?:__Secure-)?authjs\.session-token(?:\.\d+)?=/.test(cookie));
  if (!token) throw new Error("fixture owner auth session cookie was not issued");
  return token;
}

async function createLocalOnlyProxy(base) {
  const blockedHosts = new Set();
  const server = createHttpServer((request, response) => {
    let target;
    try { target = new URL(request.url, `http://${request.headers.host}`); } catch { target = null; }
    if (!target || target.protocol !== "http:" || target.hostname !== base.hostname || Number(target.port) !== Number(base.port)) {
      if (target) blockedHosts.add(target.hostname);
      response.writeHead(403, { "content-type": "text/plain", "content-length": "0", "connection": "close" });
      response.end();
      return;
    }
    const upstream = httpRequest({ hostname: "127.0.0.1", port: Number(base.port), method: request.method,
      path: `${target.pathname}${target.search}`, headers: { ...request.headers, host: `${base.hostname}:${base.port}` } }, (result) => {
      response.writeHead(result.statusCode ?? 502, result.headers);
      result.pipe(response);
    });
    upstream.on("error", () => { if (!response.headersSent) response.writeHead(502); response.end(); });
    request.pipe(upstream);
  });
  server.on("connect", (request, socket) => {
    const host = String(request.url ?? "").split(":", 1)[0].replace(/^\[/, "");
    if (host) blockedHosts.add(host.replace(/\]$/, ""));
    socket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n");
  });
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("local egress guard proxy did not bind to loopback");
  return { server, url: `http://127.0.0.1:${address.port}`, blockedHosts };
}

async function contextFor(browser, base, cookie, auth, cacheDisabled, deviceDescriptor) {
  const context = await browser.newContext({ ...deviceDescriptor, viewport: { width: device.width, height: device.height }, screen: { width: device.width, height: device.height }, serviceWorkers: "block",
    ...(auth ? { extraHTTPHeaders: { cookie } } : {}) });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.setCacheDisabled", { cacheDisabled });
  await cdp.send("Network.emulateNetworkConditions", network);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: cpuRate });
  const externalHosts = new Set();
  const cacheHits = [];
  cdp.on("Network.requestServedFromCache", () => cacheHits.push(true));
  const browserErrors = [];
  page.on("request", (request) => { try { const url = new URL(request.url()); if (url.origin !== base.origin) externalHosts.add(url.hostname); } catch {} });
  page.on("pageerror", (error) => browserErrors.push({ type: "pageerror", name: error.name }));
  page.on("console", (message) => { if (message.type() === "error") browserErrors.push({ type: "console.error", message: message.text().slice(0, 240) }); });
  return { context, page, cdp, externalHosts, cacheHits, browserErrors };
}

async function installObservers(page) {
  await page.addInitScript(() => {
    const state = window.__mobileLab = { shifts: [], longTasks: [], errors: [], lcp: null, apiCalls: [] };
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) if (entry.entryType === "layout-shift") state.shifts.push({
          value: entry.value, startTime: entry.startTime, hadRecentInput: entry.hadRecentInput,
          sources: (entry.sources ?? []).map((source) => {
            const element = source.node;
            const rawLabel = element?.getAttribute?.("aria-label") ?? "";
            const labelCategory = rawLabel.replace(/\s+(?:for|of)\s+.+$/i, "").replace(/:\s*.+$/, "").slice(0, 80) || null;
            const rect = (value) => value ? Object.fromEntries(["x", "y", "width", "height"].map((key) => [key, Number(value[key].toFixed(1))])) : null;
            return { tagName: element?.tagName ?? null, className: typeof element?.className === "string" ? element.className.split(/\s+/).filter(Boolean).slice(0, 4) : [],
              ariaLabelCategory: labelCategory, previousRect: rect(source.previousRect), currentRect: rect(source.currentRect) };
          }),
        });
      }).observe({ type: "layout-shift", buffered: true });
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) state.longTasks.push({ startTime: entry.startTime, duration: entry.duration });
      }).observe({ type: "longtask", buffered: true });
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) state.lcp = { startTime: entry.startTime, size: entry.size, tagName: entry.element?.tagName ?? null };
      }).observe({ type: "largest-contentful-paint", buffered: true });
    } catch {}
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (...args) => {
      const input = args[0];
      const url = new URL(typeof input === "string" ? input : input.url, location.href);
      if (!url.pathname.startsWith("/api/")) return originalFetch(...args);
      const startMs = performance.now();
      try {
        const response = await originalFetch(...args);
        state.apiCalls.push({ method: args[1]?.method ?? input?.method ?? "GET", pathname: url.pathname, status: response.status,
          startMs: Number(startMs.toFixed(2)), durationMs: Number((performance.now() - startMs).toFixed(2)) });
        return response;
      } catch (error) {
        state.apiCalls.push({ method: args[1]?.method ?? input?.method ?? "GET", pathname: url.pathname, status: 0,
          startMs: Number(startMs.toFixed(2)), durationMs: Number((performance.now() - startMs).toFixed(2)), failed: true });
        throw error;
      }
    };
    addEventListener("error", (event) => state.errors.push({ type: "error", source: event.filename ? new URL(event.filename).pathname : null }));
    addEventListener("unhandledrejection", () => state.errors.push({ type: "unhandledrejection" }));
  });
}

async function waitForApp(page, route) {
  await page.goto(route.url, { waitUntil: "domcontentloaded", timeout: timeoutMs });
  await page.waitForFunction(({ patternSource, routeName }) => {
    const text = document.body?.innerText ?? "";
    const reviewCards = document.querySelectorAll('main textarea[aria-label^="Reply draft"], main textarea[aria-label^="Posted reply"]').length;
    return new RegExp(patternSource, "i").test(text) && Boolean(document.querySelector("main, h1")) && (routeName !== "review-inbox" || reviewCards >= 20);
  }, { patternSource: route.content.source, routeName: route.name }, { timeout: timeoutMs });
  const usefulContentReadyMs = await page.evaluate(() => Number(performance.now().toFixed(2)));
  await page.waitForLoadState("networkidle", { timeout: timeoutMs }).catch(() => {});
  await page.waitForTimeout(2500);
  return usefulContentReadyMs;
}

async function readSample(page, route, mode, repeat, externalHosts, cacheHits, browserErrors, usefulContentReadyMs) {
  const rendered = await page.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0];
    const resources = performance.getEntriesByType("resource");
    const state = window.__mobileLab ?? { shifts: [], longTasks: [], errors: [], lcp: null };
    const scripts = resources.filter((item) => item.initiatorType === "script" || /\/_next\/static\/chunks\/.*\.js(?:\?|$)/.test(item.name));
    const apiCalls = state.apiCalls ?? [];
    const currentUrl = new URL(location.href);
    const text = document.body?.innerText ?? "";
    const reviewCardCount = document.querySelectorAll('main textarea[aria-label^="Reply draft"], main textarea[aria-label^="Posted reply"]').length;
    return {
      title: document.title,
      textChars: text.length,
      visibleText: text.slice(0, 1400),
      headings: [...document.querySelectorAll("h1,h2")].slice(0, 8).map((el) => el.textContent?.trim()).filter(Boolean),
      urlPath: currentUrl.pathname,
      viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio, mobileUA: navigator.userAgentData?.mobile ?? /Android|Mobile/.test(navigator.userAgent) },
      nav: nav ? { type: nav.type, domContentLoaded: nav.domContentLoadedEventEnd, load: nav.loadEventEnd, responseStart: nav.responseStart, transferSize: nav.transferSize } : null,
      lcp: state.lcp,
      cls: state.shifts,
      longTasks: state.longTasks,
      errors: state.errors,
      resourceCount: resources.length,
      jsTransferBytes: scripts.reduce((sum, entry) => sum + entry.transferSize, 0),
      jsEncodedBytes: scripts.reduce((sum, entry) => sum + entry.encodedBodySize, 0),
      jsChunks: scripts.map((entry) => ({ path: new URL(entry.name).pathname, transferBytes: entry.transferSize, encodedBytes: entry.encodedBodySize, durationMs: entry.duration })),
      reviewCardCount,
      apiCalls,
    };
  });
  const api = summarizeApiCalls(rendered.apiCalls);
  return { mode, repeat, route: route.name, rendered: { title: rendered.title, headings: rendered.headings, textChars: rendered.textChars,
      contentAssertions: (route.content.test(rendered.visibleText) || route.content.test(rendered.headings.join(" "))) && (route.name !== "review-inbox" || rendered.reviewCardCount >= 20), viewport: rendered.viewport,
      reviewCardCount: rendered.reviewCardCount, timeToUsefulContentMs: usefulContentReadyMs },
    navigation: rendered.nav, lcp: rendered.lcp, layoutShifts: rendered.cls, cls: maxClsSessionWindow(rendered.cls),
    longTasks: { count: rendered.longTasks.length, totalMs: Number(rendered.longTasks.reduce((sum, item) => sum + item.duration, 0).toFixed(2)), maxMs: rendered.longTasks.length ? Number(Math.max(...rendered.longTasks.map((item) => item.duration)).toFixed(2)) : 0 },
    errors: [...rendered.errors, ...browserErrors], resources: { count: rendered.resourceCount, jsTransferBytes: rendered.jsTransferBytes, jsEncodedBytes: rendered.jsEncodedBytes, chunks: rendered.jsChunks },
    api: { ...api, timeline: rendered.apiCalls.map(({ method, pathname, status, startMs, durationMs }) => ({ method, pathname, status, startMs, durationMs })) },
    cacheHits: cacheHits.length, warmCacheConfirmed: mode !== "warm-cache" || cacheHits.length > 0,
    blockedExternalRequests: externalHosts.size, blockedExternalHosts: [...externalHosts].sort() };
}

async function interaction(page, route) {
  const locator = page.locator(route.action.selector).first();
  if (await locator.count() === 0) return { name: route.action.name, available: false, reason: "expected control absent" };
  const priorApiCalls = await page.evaluate(() => window.__mobileLab?.apiCalls?.length ?? 0);
  const before = await page.evaluate((selector) => ({ time: performance.now(), paint: performance.getEntriesByType("paint").length,
    reviewCard: document.querySelector(selector)?.getAttribute("aria-label") ?? null }), reviewDraftSelector);
  const started = performance.now();
  try {
    await locator.click({ timeout: 8_000 });
    if (route.action.expect) await page.waitForURL(route.action.expect, { timeout: 8_000 });
    else if (route.action.completion) await page.locator(route.action.completion).first().waitFor({ state: "visible", timeout: 8_000 });
    else if (route.action.waitForApi) {
      await page.waitForFunction((count) => (window.__mobileLab?.apiCalls?.length ?? 0) > count, priorApiCalls, { timeout: 8_000 });
      await page.waitForFunction(({ previous, selector }) => {
        const card = document.querySelector(selector)?.getAttribute("aria-label") ?? null;
        return card !== null && card !== previous;
      }, { previous: before.reviewCard, selector: reviewDraftSelector }, { timeout: 8_000 });
    }
    else await page.waitForTimeout(300);
    const completion = await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve({ time: performance.now(), paint: performance.getEntriesByType("paint").length })))));
    return { name: route.action.name, available: true, completionLatencyMs: Number((performance.now() - started).toFixed(2)),
      fromPageTimeMs: Number((completion.time - before.time).toFixed(2)), completionPaintCount: completion.paint,
      measurement: "local scripted click-to-DOM/navigation completion; not field INP" };
  } catch {
    return { name: route.action.name, available: true, completionLatencyMs: Number((performance.now() - started).toFixed(2)),
      failure: "control interaction did not complete within the lab timeout", measurement: "local scripted click; not field INP" };
  }
}

async function main() {
  const action = process.argv[2] ?? "run";
  if (action !== "run" && action !== "smoke") throw new Error("usage: node scripts/mobile-browser-performance.mjs <smoke|run>");
  const repeatCount = action === "smoke" ? 1 : repeats;
  const { runtime, credentials, perf, base } = requireFixture();
  const beforeSource = sourceEvidence();
  if (!beforeSource.cleanTrackedTree || beforeSource.commit !== runtime.candidateCommit || beforeSource.tree !== runtime.buildTree) throw new Error("tracked source changed since the A20 production build");
  const buildIdBefore = readFileSync(path.join(root, ".next", "BUILD_ID"), "utf8").trim();
  const buildHashBefore = hashBuildTree(path.join(root, ".next"));
  if (buildIdBefore !== runtime.buildId || buildHashBefore !== runtime.buildHash) throw new Error("production build differs from the recorded A20 build identity");
  const a20Before = jsonCommand("snapshot");
  const a23Before = a23RowsSnapshot(requireFixture().marker, credentials);
  if (JSON.stringify(a23Before) !== JSON.stringify(perf.seededSnapshot)) throw new Error("A23 synthetic data no longer matches its prepared read-only row snapshot");
  const outboundPath = path.join(fixture, "outbound-blocked.jsonl");
  fixtureCommand("assert");
  const ownerCookieValue = await ownerCookie(base, credentials.credentials.owner);
  const { chromium, devices } = await import(pathToFileURL(playwrightEntry).href);
  const deviceDescriptor = devices[deviceName];
  if (!deviceDescriptor?.userAgent || !deviceDescriptor.isMobile || !deviceDescriptor.hasTouch) throw new Error("the pinned Playwright Pixel 7 mobile descriptor is unavailable");
  const browserPath = process.env.MOBILE_BROWSER_CHROMIUM ?? chromium.executablePath();
  const egressGuard = await createLocalOnlyProxy(base);
  const browser = await chromium.launch({ headless: true, executablePath: browserPath, proxy: { server: egressGuard.url, bypass: "<-loopback>" },
    args: ["--disable-background-networking", "--disable-component-update", "--disable-sync", "--no-default-browser-check", "--proxy-bypass-list=<-loopback>",
      "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1, EXCLUDE localhost"] });
  const version = browser.version();
  const samples = [];
  const interactions = [];
  const routeErrors = [];
  try {
    for (const mode of ["network-cold", "warm-cache"]) {
      for (const route of routes) {
        const authCookie = route.auth ? ownerCookieValue : "";
        let reusable = null;
        for (let repeat = 1; repeat <= repeatCount; repeat += 1) {
          const fresh = mode === "network-cold" || !reusable;
          const setup = fresh ? await contextFor(browser, base, authCookie, route.auth, mode === "network-cold", deviceDescriptor) : reusable;
          if (fresh) {
            reusable = setup;
            await installObservers(setup.page);
          }
          const page = setup.page;
          try {
            const target = { ...route, url: new URL(route.path, base).href };
            if (mode === "warm-cache" && repeat === 1) {
              await waitForApp(page, target);
              await page.goto("about:blank");
            }
            setup.cacheHits.length = 0;
            const usefulContentReadyMs = await waitForApp(page, target);
            const sample = await readSample(page, route, mode, repeat, setup.externalHosts, setup.cacheHits, setup.browserErrors, usefulContentReadyMs);
            samples.push(sample);
            if (!sample.rendered.contentAssertions) routeErrors.push(`${route.name}/${mode}/${repeat}: rendered content assertion failed`);
            if (sample.lcp === null) routeErrors.push(`${route.name}/${mode}/${repeat}: LCP entry missing`);
            if (sample.errors.length) routeErrors.push(`${route.name}/${mode}/${repeat}: browser runtime/console errors recorded`);
            if (sample.api.timeline.some((call) => call.status < 200 || call.status >= 400)) routeErrors.push(`${route.name}/${mode}/${repeat}: API request returned a failure status`);
            if (!sample.warmCacheConfirmed) routeErrors.push(`${route.name}/${mode}/${repeat}: no browser cache hit observed in warm-cache mode`);
            if (sample.blockedExternalRequests > 0) routeErrors.push(`${route.name}/${mode}/${repeat}: external network request was blocked by the local-only browser guard`);
            if (route.name === "review-inbox" && sample.rendered.reviewCardCount < 20) routeErrors.push(`${route.name}/${mode}/${repeat}: fewer than 20 synthetic review draft controls rendered`);
            if (repeat === repeatCount) {
              const measured = await interaction(page, route);
              interactions.push({ route: route.name, mode, ...measured });
              if (!measured.available || measured.failure) routeErrors.push(`${route.name}/${mode}: scripted UI interaction did not complete`);
            }
          } catch (error) {
            routeErrors.push(`${route.name}/${mode}/${repeat}: ${error instanceof Error ? error.message : "browser measurement failed"}`);
          }
          if (mode === "network-cold" || repeat === repeatCount) {
            await setup.context.close();
            reusable = null;
          }
        }
      }
    }
  } finally {
    await browser.close();
    await new Promise((resolve) => egressGuard.server.close(resolve));
  }
  const sourceAfter = sourceEvidence();
  const buildIdAfter = readFileSync(path.join(root, ".next", "BUILD_ID"), "utf8").trim();
  const buildHashAfter = hashBuildTree(path.join(root, ".next"));
  const a20After = jsonCommand("snapshot");
  const a23After = a23RowsSnapshot(requireFixture().marker, credentials);
  fixtureCommand("assert");
  const outboundCount = existsSync(outboundPath) ? readFileSync(outboundPath, "utf8").split(/\r?\n/).filter(Boolean).length : 0;
  const routesSummary = Object.fromEntries(routes.map((route) => [route.name, Object.fromEntries(["network-cold", "warm-cache"].map((mode) => {
    const set = samples.filter((item) => item.route === route.name && item.mode === mode);
    return [mode, { n: set.length, lcpMs: summarize(set.map((item) => item.lcp?.startTime)), timeToUsefulContentMs: summarize(set.map((item) => item.rendered.timeToUsefulContentMs)),
      clsSessionWindow: summarize(set.map((item) => item.cls.value), 5), jsTransferBytes: summarize(set.map((item) => item.resources.jsTransferBytes)),
      jsEncodedBytes: summarize(set.map((item) => item.resources.jsEncodedBytes)), cacheHitCount: summarize(set.map((item) => item.cacheHits)), longTaskCount: summarize(set.map((item) => item.longTasks.count)),
      apiCallCount: summarize(set.map((item) => item.api.total)), renderedReviewCards: summarize(set.map((item) => item.rendered.reviewCardCount)), contentPasses: set.filter((item) => item.rendered.contentAssertions).length }];
  }))]));
  const evidence = {
    suite: "isolated mobile browser performance lab", schemaVersion: 1, generatedAt: new Date().toISOString(),
    source: { before: beforeSource, after: sourceAfter, stable: JSON.stringify(beforeSource) === JSON.stringify(sourceAfter) && sourceAfter.commit === runtime.candidateCommit && sourceAfter.tree === runtime.buildTree },
    build: { before: { buildId: buildIdBefore, sha256: buildHashBefore }, after: { buildId: buildIdAfter, sha256: buildHashAfter }, stable: buildIdBefore === buildIdAfter && buildHashBefore === buildHashAfter && buildIdBefore === runtime.buildId },
    fixture: { a20Database: "a20_browser_fixture", a23Rows: { reviews: perf.reviewRows, visits: perf.visitRows, ownerScope: perf.seededSnapshot.ownerReviews, otherScope: perf.seededSnapshot.otherReviews },
      a20SnapshotUnchanged: JSON.stringify(a20Before) === JSON.stringify(a20After), a23RowSnapshotUnchanged: JSON.stringify(a23Before) === JSON.stringify(a23After), outboundBlockedAttempts: outboundCount },
    tooling: { browser: "Playwright Chromium", playwrightVersion: "1.63.0", chromiumVersion: version,
      chromiumExecutable: path.basename(browserPath), device: { ...device, descriptor: deviceName, userAgentMobile: true }, emulation: "Playwright Pixel 7 Android user agent plus Chromium mobile metrics, touch, and viewport; not physical handset",
      throttling: { network: { ...network, downloadUnits: "bytes per second", uploadUnits: "bytes per second", latencyUnits: "configured CDP latency in milliseconds; effective timing may differ by request/connection" }, cpuRate, cpuUnits: "4x slowdown factor", serviceWorkers: "blocked", coldCache: "Network.setCacheDisabled=true with a fresh context per route/repeat", warmCache: "cache enabled; one persistent context per route; one untimed priming navigation before timed repeats; cache hits asserted from Chromium CDP" },
      egressGuard: "Dedicated loopback HTTP proxy forwards only the exact A20 127.0.0.1 origin; Chromium DNS rules reject other hostnames; no request interception is installed, preserving browser cache",
      reproductionCommands: ["npm ci", "node scripts/a20-app-fixture.mjs setup", "node scripts/a23-performance.mjs prepare", "node scripts/a20-app-fixture.mjs start", "npm install --prefix .a20-fixture/mobile-performance-tools --no-save --ignore-scripts playwright@1.63.0", "node .a20-fixture/mobile-performance-tools/node_modules/playwright/cli.js install chromium", "node scripts/mobile-browser-performance.mjs run", "node scripts/a20-app-fixture.mjs stop", "node scripts/a20-app-fixture.mjs cleanup"] },
    methodology: { repeatsPerModeRoute: repeatCount, smokeOnly: action === "smoke", modes: ["network-cold", "warm-cache"], routes: routes.map(({ name, path: routePath }) => ({ name, path: routePath })),
      loadCompletion: "visible route-specific rendered content plus network idle when reached, followed by 2.5s LCP quiet period; capture occurs before UI interaction",
      cls: "maximum CLS session window; excludes layout-shift entries with hadRecentInput; window resets after >1s gap and is capped at 5s",
      interactionLatency: "scripted local click to navigation/DOM completion on final repeat only; descriptive lab latency and not field INP",
      summary: "p50 and maximum across five samples; no field p75 or INP claim" },
    summaries: routesSummary,
    labTargetFindings: Object.fromEntries(routes.map(({ name }) => [name, Object.fromEntries(["network-cold", "warm-cache"].map((mode) => {
      const set = samples.filter((item) => item.route === name && item.mode === mode);
      return [mode, { lcpWithin2500ms: set.filter((item) => item.lcp?.startTime <= 2500).length, lcpSamples: set.filter((item) => item.lcp?.startTime !== null).length,
        clsAtOrBelow0_1: set.filter((item) => item.cls.value <= 0.1).length, clsSamples: set.length,
        criteria: "exploratory local lab comparison with web.dev good thresholds; five samples are too few for field CWV or p75 claims" }];
    }))])),
    interactions, routeErrors, samples,
    pass: routeErrors.length === 0 && samples.length === routes.length * repeatCount * 2 && samples.every((item) => item.rendered.contentAssertions && item.lcp !== null && item.errors.length === 0 && item.blockedExternalRequests === 0 && item.warmCacheConfirmed && item.api.timeline.every((call) => call.status >= 200 && call.status < 400)) &&
      interactions.length === routes.length * 2 && interactions.every((item) => item.available && !item.failure) &&
      JSON.stringify(a20Before) === JSON.stringify(a20After) && JSON.stringify(a23Before) === JSON.stringify(a23After) && outboundCount === 0 && JSON.stringify(beforeSource) === JSON.stringify(sourceAfter) && buildIdBefore === buildIdAfter && buildHashBefore === buildHashAfter,
  };
  mkdirSync(path.dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
  if (process.platform !== "win32") chmodSync(outputPath, 0o600);
  console.log(JSON.stringify({ output: path.relative(root, outputPath), sampleCount: samples.length, routeErrors, sourceStable: evidence.source.stable, buildStable: evidence.build.stable,
    a20SnapshotUnchanged: evidence.fixture.a20SnapshotUnchanged, blockedOutboundAttempts: outboundCount, pass: evidence.pass }, null, 2));
  if (!evidence.pass) process.exitCode = 1;
}

main().catch((error) => { console.error(`mobile browser performance: ${error instanceof Error ? error.message : "unknown error"}`); process.exitCode = 1; });
