import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixture = path.join(root, ".a20-fixture");
const outDir = path.join(fixture, "browser-edge-checks");
const playwrightPath = path.join(fixture, "mobile-performance-tools", "node_modules", "playwright", "index.mjs");
const { chromium } = await import(pathToFileURL(playwrightPath).href);
const runtime = JSON.parse(readFileSync(path.join(fixture, "runtime.json"), "utf8"));
const credentials = JSON.parse(readFileSync(path.join(fixture, "credentials.json"), "utf8"));
const base = new URL(runtime.url);
if (base.protocol !== "http:" || base.hostname !== "127.0.0.1" || Number(base.port) !== runtime.port) {
  throw new Error("The A20 browser edge checks require a loopback-only runtime.");
}
mkdirSync(outDir, { recursive: true });

function cookieStore() {
  const cookies = new Map();
  return {
    absorb(response) {
      for (const line of response.headers.getSetCookie()) {
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

async function authCookie(account) {
  const jar = cookieStore();
  const csrfResponse = await fetch(new URL("/api/auth/csrf", base));
  jar.absorb(csrfResponse);
  if (!csrfResponse.ok) throw new Error("Local fixture sign-in setup failed.");
  const csrf = await csrfResponse.json();
  const response = await fetch(new URL("/api/auth/callback/credentials", base), {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      cookie: jar.header(),
      origin: base.origin,
      referer: new URL("/login", base).href,
      "x-auth-return-redirect": "true",
    },
    body: new URLSearchParams({ csrfToken: csrf.csrfToken, email: account.email, password: account.password,
      callbackUrl: new URL("/dashboard", base).href, json: "true" }),
    redirect: "manual",
  });
  if (!response.ok || response.status >= 300) throw new Error("Local fixture sign-in failed.");
  jar.absorb(response);
  const token = jar.header().split(";").map((cookie) => cookie.trim())
    .find((cookie) => /^(?:__Secure-)?authjs\.session-token(?:\.\d+)?=/.test(cookie));
  if (!token) throw new Error("Local fixture session cookie was not issued.");
  return token;
}

async function contextFor(browser, account, viewport) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: viewport.width < 600 ? 2.625 : 1,
    isMobile: viewport.width < 600, hasTouch: viewport.width < 600, serviceWorkers: "block",
    extraHTTPHeaders: { cookie: await authCookie(account) } });
  const page = await context.newPage();
  await page.route("**/*", (route) => new URL(route.request().url()).origin === base.origin ? route.continue() : route.abort());
  await page.addInitScript(() => {
    window.__edgeLayoutShifts = [];
    try {
      new PerformanceObserver((list) => window.__edgeLayoutShifts.push(...list.getEntries()
        .filter((entry) => !entry.hadRecentInput).map((entry) => ({ value: entry.value, startTime: entry.startTime }))))
        .observe({ type: "layout-shift", buffered: true });
    } catch {}
  });
  return { context, page };
}

function apiPath(url) {
  const parsed = new URL(url);
  return parsed.origin === base.origin ? parsed.pathname : null;
}

async function readySettings(page) {
  await page.goto(new URL("/dashboard/agents/review-replies/settings", base).href, { waitUntil: "domcontentloaded" });
  await waitSettingsReady(page);
}

async function waitSettingsReady(page) {
  await page.waitForFunction(() => {
    const name = document.querySelector("#settings-business-name");
    const googleCard = [...document.querySelectorAll('[data-slot="card"]')]
      .find((card) => card.querySelector('[data-slot="card-title"]')?.textContent?.trim().startsWith("Google profile"));
    const connectionContent = googleCard?.querySelector("[aria-busy]");
    const connectionText = googleCard?.textContent ?? "";
    const connectionSettled = /Locations synced:\s*\d+|Connect to sync locations and reviews\./.test(connectionText);
    return name?.value.length > 0 && connectionContent?.getAttribute("aria-busy") === "false" && connectionSettled;
  }, null, { timeout: 30_000 });
}

async function fieldGeometry(page) {
  return page.evaluate(() => {
    const rect = (element) => {
      if (!element) return null;
      const value = element.getBoundingClientRect();
      return Object.fromEntries(["x", "y", "width", "height"].map((key) => [key, Number(value[key].toFixed(2))]));
    };
    const name = document.querySelector("#settings-business-name");
    const tone = document.querySelector("#settings-tone");
    return { name: rect(name), tone: rect(tone), formCard: rect(name?.closest("[aria-busy]")),
      readonly: name?.readOnly === true, toneDisabled: tone?.disabled === true };
  });
}

function sameGeometry(before, after) {
  for (const field of ["name", "tone", "formCard"]) {
    for (const key of ["x", "y", "width", "height"]) {
      if (Math.abs(before[field][key] - after[field][key]) > 0.5) return false;
    }
  }
  return true;
}

const result = { suite: "read-only browser edge checks", generatedAt: new Date().toISOString(),
  runtimeCommit: runtime.candidateCommit, runtimeTree: runtime.buildTree, checks: {}, screenshots: {} };
const browser = await chromium.launch({ headless: true });
try {
  const owner = credentials.credentials.owner;

  const delayed = await contextFor(browser, owner, { width: 412, height: 915 });
  let markSettingsStarted;
  const settingsStarted = new Promise((resolve) => { markSettingsStarted = resolve; });
  const delayedApiCalls = [];
  delayed.page.on("request", (request) => {
    const route = apiPath(request.url());
    if (route) delayedApiCalls.push({ route, method: request.method(), startedAt: Date.now(), responseAt: null });
  });
  delayed.page.on("response", (response) => {
    const route = apiPath(response.url());
    if (!route) return;
    const call = [...delayedApiCalls].reverse().find((item) => item.route === route && item.responseAt === null);
    if (call) call.responseAt = Date.now();
  });
  await delayed.page.route("**/api/settings/reply", async (route) => {
    markSettingsStarted();
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await route.continue();
  });
  await delayed.page.goto(new URL("/dashboard/agents/review-replies/settings", base).href, { waitUntil: "domcontentloaded" });
  await settingsStarted;
  const before = await fieldGeometry(delayed.page);
  await waitSettingsReady(delayed.page);
  const after = await fieldGeometry(delayed.page);
  await delayed.page.waitForTimeout(800);
  const shifts = await delayed.page.evaluate(() => window.__edgeLayoutShifts);
  const settingsCall = delayedApiCalls.find((call) => call.route === "/api/settings/reply" && call.method === "GET");
  const connectionCall = delayedApiCalls.find((call) => call.route === "/api/google/connection" && call.method === "GET");
  const initialConnectionReads = delayedApiCalls.filter((call) => call.route === "/api/google/connection" && call.method === "GET").length;
  result.checks.delayedSettings = { requestCounts: {
    settings: delayedApiCalls.filter((call) => call.route === "/api/settings/reply" && call.method === "GET").length,
    connectionStartedAfterSettingsResponse: Boolean(settingsCall?.responseAt && connectionCall?.startedAt >= settingsCall.responseAt),
    connection: initialConnectionReads,
  }, geometry: { before, after, stableWithinHalfPixel: sameGeometry(before, after) }, cls: Number(shifts.reduce((sum, item) => sum + item.value, 0).toFixed(4)) };
  assert.equal(result.checks.delayedSettings.requestCounts.settings, 1);
  assert.equal(result.checks.delayedSettings.requestCounts.connection, 1);
  assert.equal(result.checks.delayedSettings.requestCounts.connectionStartedAfterSettingsResponse, true);
  assert.equal(result.checks.delayedSettings.geometry.stableWithinHalfPixel, true);
  assert.equal(result.checks.delayedSettings.cls, 0);
  assert.equal(result.checks.delayedSettings.geometry.before.readonly, true);
  assert.equal(result.checks.delayedSettings.geometry.before.toneDisabled, true);
  result.screenshots.mobile = path.relative(root, path.join(outDir, "settings-mobile.png"));
  await delayed.page.screenshot({ path: path.join(outDir, "settings-mobile.png"), fullPage: true });
  await delayed.context.close();

  const desktop = await contextFor(browser, owner, { width: 1440, height: 1000 });
  await readySettings(desktop.page);
  result.screenshots.desktop = path.relative(root, path.join(outDir, "settings-desktop.png"));
  await desktop.page.screenshot({ path: path.join(outDir, "settings-desktop.png"), fullPage: true });
  await desktop.context.close();

  const failedSettings = await contextFor(browser, owner, { width: 412, height: 915 });
  let settingsAttempts = 0;
  await failedSettings.page.route("**/api/settings/reply", async (route) => {
    settingsAttempts++;
    if (settingsAttempts === 1) await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Synthetic local read failure" }) });
    else await route.continue();
  });
  await failedSettings.page.goto(new URL("/dashboard/agents/review-replies/settings", base).href, { waitUntil: "domcontentloaded" });
  await failedSettings.page.getByRole("button", { name: "Retry settings" }).waitFor({ state: "visible" });
  const failedField = await fieldGeometry(failedSettings.page);
  const retryResponse = failedSettings.page.waitForResponse((response) => apiPath(response.url()) === "/api/settings/reply" && response.status() === 200);
  await failedSettings.page.getByRole("button", { name: "Retry settings" }).click();
  await retryResponse;
  await waitSettingsReady(failedSettings.page);
  result.checks.settingsFailureRetry = { attempts: settingsAttempts, blockedControls: failedField.readonly && failedField.toneDisabled,
    retryVisible: true, retryLoadedSettings: true };
  assert.equal(result.checks.settingsFailureRetry.attempts, 2);
  assert.equal(result.checks.settingsFailureRetry.blockedControls, true);
  assert.equal(result.checks.settingsFailureRetry.retryLoadedSettings, true);
  await failedSettings.context.close();

  const disconnected = await contextFor(browser, owner, { width: 412, height: 915 });
  await disconnected.page.route("**/api/google/connection**", (route) => route.fulfill({ status: 200, contentType: "application/json",
    body: JSON.stringify({ connected: false, locations: [], canManage: true }) }));
  await readySettings(disconnected.page);
  result.checks.disconnectedOwner = { connectButtonVisible: await disconnected.page.getByRole("button", { name: "Connect Google" }).isVisible(),
    connectButtonEnabled: await disconnected.page.getByRole("button", { name: "Connect Google" }).isEnabled() };
  assert.equal(result.checks.disconnectedOwner.connectButtonVisible, true);
  assert.equal(result.checks.disconnectedOwner.connectButtonEnabled, true);
  await disconnected.context.close();

  const member = await contextFor(browser, credentials.credentials.member, { width: 412, height: 915 });
  await member.page.route("**/api/google/connection**", (route) => route.fulfill({ status: 200, contentType: "application/json",
    body: JSON.stringify({ connected: false, locations: [], canManage: false }) }));
  await readySettings(member.page);
  const memberFields = await fieldGeometry(member.page);
  result.checks.member = { businessNameReadonly: memberFields.readonly, toneDisabled: memberFields.toneDisabled,
    connectButtonEnabled: await member.page.getByRole("button", { name: "Connect Google" }).isEnabled() };
  assert.equal(result.checks.member.businessNameReadonly, true);
  assert.equal(result.checks.member.toneDisabled, true);
  assert.equal(result.checks.member.connectButtonEnabled, false);
  await member.context.close();

  const multipleLocations = await contextFor(browser, owner, { width: 412, height: 915 });
  await multipleLocations.page.route("**/api/google/connection**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
    connected: true, canManage: true, selectionLocked: false, locations: [
      { id: "synthetic-location-1", locationName: "accounts/local/locations/one", title: "Synthetic location one", primaryCategory: "Local test", isSuspended: false, selected: true },
      { id: "synthetic-location-2", locationName: "accounts/local/locations/two", title: "Synthetic location two", primaryCategory: "Local test", isSuspended: false, selected: false },
    ],
  }) }));
  await readySettings(multipleLocations.page);
  await multipleLocations.page.getByText("Synthetic location one", { exact: true }).waitFor({ state: "visible" });
  await multipleLocations.page.getByText("Synthetic location two", { exact: true }).waitFor({ state: "visible" });
  result.checks.multipleLocations = { bothSyntheticLocationsVisible: true, syncButtonVisible: await multipleLocations.page.getByRole("button", { name: "Sync locations" }).isVisible() };
  assert.equal(result.checks.multipleLocations.bothSyntheticLocationsVisible, true);
  assert.equal(result.checks.multipleLocations.syncButtonVisible, true);
  await multipleLocations.context.close();

  const oauthRetry = await contextFor(browser, owner, { width: 412, height: 915 });
  let connectionAttempts = 0;
  await oauthRetry.page.route("**/api/google/connection**", (route) => {
    connectionAttempts++;
    if (connectionAttempts === 1) return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Synthetic local connection read failure" }) });
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ connected: false, locations: [], canManage: true }) });
  });
  await oauthRetry.page.goto(new URL("/dashboard/agents/review-replies/settings?google=error&reason=synthetic", base).href, { waitUntil: "domcontentloaded" });
  const retryConnectionButton = oauthRetry.page.getByRole("button", { name: "Retry" });
  await retryConnectionButton.waitFor({ state: "visible" });
  await retryConnectionButton.click();
  await oauthRetry.page.getByRole("button", { name: "Connect Google" }).waitFor({ state: "visible" });
  await oauthRetry.page.waitForFunction(() => !document.body.innerText.includes("Google connection failed. Please try again."));
  result.checks.oauthErrorRetry = { requests: connectionAttempts, staleErrorCleared: true, connectButtonVisible: true };
  assert.equal(result.checks.oauthErrorRetry.requests, 2);
  assert.equal(result.checks.oauthErrorRetry.staleErrorCleared, true);
  assert.equal(result.checks.oauthErrorRetry.connectButtonVisible, true);
  result.pass = true;
  await oauthRetry.context.close();

  const summaryPath = path.join(outDir, "results.json");
  const evidenceDir = path.join(root, "docs", "tasks");
  const evidencePath = path.join(evidenceDir, "browser-performance-edge-evidence.json");
  mkdirSync(evidenceDir, { recursive: true });
  writeFileSync(summaryPath, `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600 });
  writeFileSync(evidencePath, `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600 });
  console.log(JSON.stringify({ output: path.relative(root, summaryPath), evidence: path.relative(root, evidencePath),
    pass: result.pass, checks: result.checks, screenshots: result.screenshots }, null, 2));
} finally {
  await browser.close();
}
