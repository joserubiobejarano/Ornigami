#!/usr/bin/env node
/**
 * Reproducible browser phase against a running builder origin.
 *
 * The Linux qualification invokes this against the built container through a
 * loopback-only published port. The runtime keeps its default-deny internal
 * network and test hooks/live provider stay disabled. The same script can run
 * against a local production server with BROWSER_OPERATOR_MODE=local for local
 * harness checks.
 *
 * Environment:
 *   BROWSER_BASE_URL             exact loopback origin, e.g. http://127.0.0.1:3100
 *   BROWSER_EVIDENCE_DIR         new run-owned evidence directory
 *   BROWSER_OPERATOR_MODE        container (default) or local
 *   BROWSER_PACKSHOT             synthetic packshot path
 *   BROWSER_PLAYWRIGHT           optional explicit playwright/index.mjs
 *   BROWSER_OPERATOR_STORE_DIR   store path for local operator mode
 *   ENGINE / BUILDER_OPERATOR_IMAGE / BUILDER_OPERATOR_VOLUME /
 *   BUILDER_OPERATOR_STORE / BUILDER_RUNTIME_STORE_HOST_ID
 *                                forwarded to deploy/builder/operator.sh
 */
import { createHash, randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

import { auditZipBundle } from "./zip-audit.mjs";
import { diffScriptAudits, updateScriptRegistry } from "./private-staging/sri-script-audit.mjs";

const root = process.cwd();
const baseUrl = process.env.BROWSER_BASE_URL;
if (!baseUrl) throw new Error("BROWSER_BASE_URL is required");
const parsedBase = new URL(baseUrl);
const loopbackOrigin =
  parsedBase.protocol === "http:" &&
  ["127.0.0.1", "localhost", "[::1]"].includes(parsedBase.hostname);
const allowRemoteOrigin = process.env.BROWSER_ALLOW_REMOTE_ORIGIN === "1";
if (!loopbackOrigin && !(allowRemoteOrigin && parsedBase.protocol === "https:")) {
  throw new Error(
    "BROWSER_BASE_URL must be a loopback http origin, or an https origin with BROWSER_ALLOW_REMOTE_ORIGIN=1",
  );
}
const basicUser = process.env.BROWSER_BASIC_AUTH_USER ?? "";
const basicPassword = process.env.BROWSER_BASIC_AUTH_PASSWORD ?? "";
if (
  process.env.BROWSER_REQUIRE_BASIC_AUTH === "1" &&
  (!basicUser || !basicPassword)
) {
  throw new Error("BROWSER_BASIC_AUTH_USER and BROWSER_BASIC_AUTH_PASSWORD are required");
}
const basicAuthorization =
  basicUser || basicPassword
    ? `Basic ${Buffer.from(`${basicUser}:${basicPassword}`).toString("base64")}`
    : null;
const authHeaders = basicAuthorization ? { authorization: basicAuthorization } : {};
const evidenceDir =
  process.env.BROWSER_EVIDENCE_DIR ?? path.join(root, ".local", "browser-qualification");
const downloads = path.join(evidenceDir, "downloads");
const extracted = path.join(evidenceDir, "extracted");
const screenshots = path.join(evidenceDir, "screenshots");
for (const directory of [evidenceDir, downloads, extracted, screenshots]) {
  mkdirSync(directory, { recursive: true });
}
const packshot =
  process.env.BROWSER_PACKSHOT ??
  path.join(root, "public", "campaign-assets", "harbor-field-bottle.webp");
const operatorMode = process.env.BROWSER_OPERATOR_MODE ?? "container";
const operatorStoreDir = process.env.BROWSER_OPERATOR_STORE_DIR ?? null;

const results = {
  startedAt: new Date().toISOString(),
  baseUrl,
  operatorMode,
  identity: {
    applicationSourceSha: process.env.BROWSER_SOURCE_SHA ?? null,
    harnessSha: process.env.BROWSER_HARNESS_SHA ?? null,
    imageId: process.env.BROWSER_IMAGE_ID ?? null,
  },
  checks: [],
  requestKeys: [],
  exports: [],
  screenshots: [],
  subjects: {},
  scriptAudits: [],
  scriptRegistry: [],
};
function check(name, ok, detail) {
  results.checks.push({ name, ok: Boolean(ok), ...(ok ? {} : { detail }) });
  if (!ok) {
    throw new Error(
      `Browser check failed: ${name}${detail === undefined ? "" : ` (${JSON.stringify(detail)})`}`,
    );
  }
}

function describeFetchError(error) {
  const cause = error?.cause ?? {};
  return {
    name: error?.name ?? null,
    message: error?.message ?? String(error),
    code: error?.code ?? cause.code ?? null,
    causeCode: cause.code ?? null,
    causeMessage: cause.message ?? null,
    syscall: cause.syscall ?? null,
    address: cause.address ?? null,
    port: cause.port ?? null,
  };
}

async function waitForOrigin(url, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  let attempts = 0;
  let last = { ok: false, attempts, error: { code: "NO_ATTEMPT", message: "origin not attempted" } };
  while (Date.now() < deadline) {
    attempts += 1;
    try {
      const response = await fetch(url, {
        redirect: "manual",
        headers: authHeaders,
        signal: AbortSignal.timeout(2000),
      });
      await response.body?.cancel();
      if (response.status === 200) {
        return { ok: true, attempts, status: response.status, origin: url };
      }
      last = { ok: false, attempts, status: response.status, origin: url };
    } catch (error) {
      last = { ok: false, attempts, origin: url, error: describeFetchError(error) };
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return last;
}

function findBash() {
  if (process.env.BASH) return process.env.BASH;
  if (process.platform === "win32") {
    for (const candidate of [
      "C:\\Program Files\\Git\\bin\\bash.exe",
      "C:\\Program Files\\Git\\usr\\bin\\bash.exe",
    ]) {
      if (existsSync(candidate)) return candidate;
    }
  }
  return "bash";
}

function operator(args) {
  let result;
  if (operatorMode === "local") {
    if (!operatorStoreDir) throw new Error("BROWSER_OPERATOR_STORE_DIR is required for local operator mode");
    result = spawnSync(
      process.execPath,
      [
        "--experimental-strip-types",
        "scripts/builder-invite-operator.mjs",
        ...args,
        "--store",
        operatorStoreDir,
        "--json",
      ],
      {
        cwd: root,
        encoding: "utf8",
        env: {
          ...process.env,
          ...(process.env.BUILDER_RUNTIME_STORE_HOST_ID
            ? { BUILDER_RUNTIME_STORE_HOST_ID: process.env.BUILDER_RUNTIME_STORE_HOST_ID }
            : {}),
        },
      },
    );
  } else {
    result = spawnSync(
      findBash(),
      ["deploy/builder/operator.sh", ...args, "--json"],
      {
        cwd: root,
        encoding: "utf8",
        env: {
          ...process.env,
          ENGINE: process.env.ENGINE ?? "docker",
          BUILDER_OPERATOR_IMAGE: process.env.BUILDER_OPERATOR_IMAGE ?? "",
          ...(process.env.BUILDER_OPERATOR_VOLUME
            ? { BUILDER_OPERATOR_VOLUME: process.env.BUILDER_OPERATOR_VOLUME }
            : {}),
          ...(process.env.BUILDER_OPERATOR_STORE
            ? { BUILDER_OPERATOR_STORE: process.env.BUILDER_OPERATOR_STORE }
            : {}),
          BUILDER_RUNTIME_STORE_HOST_ID:
            process.env.BUILDER_RUNTIME_STORE_HOST_ID ?? "",
        },
      },
    );
  }
  if (result.status !== 0) {
    throw new Error(`Operator ${args[0]} failed: ${result.stderr || result.stdout}`);
  }
  return JSON.parse(result.stdout.trim().split(/\r?\n/).at(-1));
}
function issueInvite(label) {
  return operator(["issue", "--label", label, "--ttl-seconds", "3600"]);
}

async function loadPlaywright() {
  const candidates = [
    process.env.BROWSER_PLAYWRIGHT,
    path.join(
      root,
      "scripts",
      "framework-prototype",
      "browser-tools",
      "node_modules",
      "playwright",
      "index.mjs",
    ),
    path.join(root, "node_modules", "playwright", "index.mjs"),
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue;
    return import(pathToFileURL(candidate).href);
  }
  throw new Error(
    `Playwright not found. Set BROWSER_PLAYWRIGHT or install it under scripts/framework-prototype/browser-tools.`,
  );
}

function chromiumExecutable(chromium) {
  const bundled = chromium.executablePath();
  if (bundled && existsSync(bundled)) return bundled;
  const cache =
    process.env.PLAYWRIGHT_BROWSERS_PATH ??
    (process.platform === "win32"
      ? path.join(process.env.LOCALAPPDATA ?? "", "ms-playwright")
      : path.join(os.homedir(), ".cache", "ms-playwright"));
  if (existsSync(cache)) {
    for (const name of readdirSync(cache)
      .filter((entry) => /^chromium-\d+$/.test(entry))
      .sort()
      .reverse()) {
      for (const relative of [
        ["chrome-win64", "chrome.exe"],
        ["chrome-win", "chrome.exe"],
        ["chrome-linux", "chrome"],
        ["chrome-linux64", "chrome"],
      ]) {
        const candidate = path.join(cache, name, ...relative);
        if (existsSync(candidate)) return candidate;
      }
    }
  }
  throw new Error("Chromium executable not found; install Playwright Chromium.");
}

function auditZip(name, zipPath) {
  const dir = path.join(extracted, name);
  const audit = auditZipBundle({ zipPath, extractDir: dir });
  check(`${name}:zip-audit`, true, {
    entries: audit.entries,
    files: audit.files,
    archiveFiles: audit.archiveFiles,
  });
  return {
    name,
    zip: path.relative(root, zipPath),
    revision: audit.revision,
    offer: audit.receipt.preview.offer,
    price: audit.receipt.preview.offerPrice,
    entries: audit.entries,
    files: audit.files,
    auditTool: audit.python,
  };
}

async function auditCsp() {
  const response = await fetch(baseUrl, {
    redirect: "manual",
    headers: authHeaders,
    signal: AbortSignal.timeout(5000),
  });
  const csp = response.headers.get("content-security-policy") ?? "";
  await response.body?.cancel();
  const scriptSrc = csp.match(/(?:^|;)\s*script-src\s+([^;]+)/i)?.[1] ?? "";
  const connectSrc = csp.match(/(?:^|;)\s*connect-src\s+([^;]+)/i)?.[1] ?? "";
  check(
    "csp:header",
    csp.length > 0 &&
      /'nonce-[^']+'/.test(scriptSrc) &&
      !/'unsafe-(?:inline|eval)'/.test(scriptSrc) &&
      /'self'/.test(connectSrc) &&
      !/https?:\/\//.test(connectSrc),
    { csp: csp.slice(0, 800) },
  );
}

async function auditPageScripts(page, label) {
  const entries = await page.evaluate(() =>
    [...document.querySelectorAll("script[src]")].map((script) => ({
      src: script.src,
      integrity: script.integrity,
    })),
  );
  const issues = [];
  const scriptRecords = [];
  let verified = 0;
  for (const entry of entries) {
    const record = {
      src: entry.src,
      path: null,
      integrity: entry.integrity ?? "",
      sha256: null,
      integrityDigest: null,
      verified: false,
    };
    let url;
    try {
      url = new URL(entry.src);
      record.path = url.pathname;
    } catch {
      record.issue = "invalid-src";
      issues.push({ src: "[invalid-url]", issue: "invalid-src" });
      scriptRecords.push(record);
      continue;
    }
    if (url.origin !== parsedBase.origin) {
      record.issue = "external-origin";
      issues.push({ src: url.origin, issue: "external-origin" });
      scriptRecords.push(record);
      continue;
    }
    if (!entry.integrity) {
      record.issue = "missing-integrity";
      issues.push({ src: url.pathname, issue: "missing-integrity" });
      scriptRecords.push(record);
      continue;
    }
    const response = await fetch(url.href, {
      headers: authHeaders,
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      record.issue = `asset-${response.status}`;
      issues.push({ src: url.pathname, issue: `asset-${response.status}` });
      await response.body?.cancel();
      scriptRecords.push(record);
      continue;
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    record.sha256 = createHash("sha256").update(bytes).digest("hex");
    record.integrityDigest = `sha256-${createHash("sha256").update(bytes).digest("base64")}`;
    if (!entry.integrity.split(/\s+/).includes(record.integrityDigest)) {
      record.issue = "integrity-mismatch";
      issues.push({ src: url.pathname, issue: "integrity-mismatch" });
      scriptRecords.push(record);
      continue;
    }
    record.verified = true;
    scriptRecords.push(record);
    verified += 1;
  }
  const previous = results.scriptAudits.at(-1);
  const audit = {
    label,
    completedAt: new Date().toISOString(),
    scripts: entries.length,
    verified,
    issues,
    scriptRecords,
    inserted: [],
    removed: [],
  };
  const delta = diffScriptAudits(previous, { ...audit, scriptRecords });
  audit.inserted = delta.inserted.map((script) => script.src);
  audit.removed = delta.removed.map((script) => script.src);
  results.scriptAudits.push(audit);
  results.scriptRegistry = updateScriptRegistry(results.scriptRegistry, audit);
  check(`sri:${label}`, entries.length > 0 && issues.length === 0, audit);
}

async function login(page, token, label) {
  await page.goto(baseUrl + "/", { waitUntil: "networkidle" });
  await auditPageScripts(page, `${label}:login-page`);
  await page.locator('input[name="token"]').fill(token);
  await page.getByRole("button", { name: "Enter builder" }).click();
  await page.waitForURL("**/builder");
  await page.waitForSelector('[data-intake-ready="true"]');
  await auditPageScripts(page, label);
}

async function reselectPackshotAndConfirm(page) {
  await page.getByLabel("Product image").setInputFiles(packshot);
  await page.waitForSelector("[data-packshot-ready]");
  const confirmations = page.locator('[data-confirmations] input[type="checkbox"]');
  for (let index = 0; index < 3; index += 1) {
    await confirmations.nth(index).check();
  }
}

async function fillIntake(page, { offer, emphasis }) {
  await page.getByLabel("Brand name").fill("Harbor Field");
  await page.getByLabel("Product name").fill("Harbor Field travel bottle");
  await page.getByLabel("Offer", { exact: true }).fill(offer);
  await page.getByLabel("Reviewed offer emphasis (optional)").fill(emphasis);
  await page.getByLabel("Destination URL").fill("https://example.com/travel-bottle");
  await page.locator('input[id$="-label"]').nth(0).fill("Capacity");
  await page.locator('input[id$="-value"]').nth(0).fill("500 ml");
  await page.locator('input[id$="-label"]').nth(1).fill("Closure");
  await page.locator('input[id$="-value"]').nth(1).fill("Screw cap");
  await page.locator('input[name="visualDirection"][value="clear"]').check();
  await page.selectOption("#intake-composition", "direction-default");
  await page.getByLabel("Alt text").fill("Harbor Field travel bottle on a neutral background.");
  await page.getByLabel("Usage rights").fill("Synthetic local review asset.");
  await reselectPackshotAndConfirm(page);
}

async function waitForPreview(page, offer) {
  await page.waitForFunction(
    (expected) => {
      const preview = document.querySelector("[data-preview-canvas]");
      const status = document
        .querySelector("[data-generation-status]")
        ?.getAttribute("data-generation-status");
      const busy = [...document.querySelectorAll("button")].some(
        (button) => button.getAttribute("aria-busy") === "true",
      );
      return Boolean(
        preview &&
          !busy &&
          (status === "generated" || status === "fallback") &&
          preview.querySelector('[data-role="offer"]')?.textContent?.includes(expected),
      );
    },
    offer,
    { timeout: 30_000 },
  );
}

async function openPreviewAndGenerate(page, offer) {
  await page.getByRole("button", { name: /Open (?:Campaign Lab|offer) preview/ }).click();
  await page.waitForSelector("#browser-composition");
  await page.getByRole("button", { name: "Generate preview" }).click();
  await waitForPreview(page, offer);
}

async function approveAndExport(page, name) {
  await page.waitForFunction(() => {
    const button = [...document.querySelectorAll("button")].find((candidate) =>
      candidate.textContent?.includes("Approve preview locally"),
    );
    return button && !button.disabled;
  });
  await page.getByRole("button", { name: "Approve preview locally" }).click();
  await page.waitForSelector("[data-approval-revision]");
  const revision = await page
    .locator("[data-approval-revision]")
    .getAttribute("data-approval-revision");
  await page.waitForFunction(
    () => document.querySelector("[data-export-ready]")?.getAttribute("data-export-ready") === "true",
  );
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.locator("[data-export-button]").click(),
  ]);
  const zipPath = path.join(downloads, `${name}.zip`);
  await download.saveAs(zipPath);
  return { revision, zipPath };
}

function storageKeys(page) {
  return page.evaluate(() =>
    Object.keys(window.sessionStorage).filter((key) =>
      key.startsWith("ornigami.builder.offer-intake.brief.v1"),
    ),
  );
}

function cookieHeader(cookies) {
  return cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
}

const readiness = await waitForOrigin(baseUrl, 20_000);
results.readiness = readiness;
if (!readiness.ok) {
  results.completedAt = new Date().toISOString();
  results.ok = false;
  results.error = "origin_not_ready";
  writeFileSync(
    path.join(evidenceDir, "results.json"),
    `${JSON.stringify(results, null, 2)}\n`,
  );
  console.error(
    JSON.stringify(
      { ok: false, error: "origin_not_ready", readiness, checks: results.checks },
      null,
      2,
    ),
  );
  process.exit(1);
}

await auditCsp();

const { chromium } = await loadPlaywright();
const browser = await chromium.launch({
  headless: true,
  chromiumSandbox: true,
  executablePath: chromiumExecutable(chromium),
});
const contextA = await browser.newContext({
  acceptDownloads: true,
  viewport: { width: 1440, height: 900 },
  ...(basicUser
    ? { httpCredentials: { username: basicUser, password: basicPassword } }
    : {}),
});
const pageA = await contextA.newPage();
const generationRequests = [];
const captureRequests = (page) => {
  page.on("request", (request) => {
    if (!request.url().endsWith("/api/builder/generate")) return;
    try {
      const body = JSON.parse(request.postData() ?? "{}");
      if (typeof body.requestId === "string") {
        generationRequests.push(body.requestId);
        results.requestKeys.push(body.requestId);
      }
      if (body.browserBrief) {
        generationRequests.push({ body, subject: request.headers()["x-builder-subject"] });
      }
    } catch {
      // A non-JSON request is not a builder generation.
    }
  });
};
captureRequests(pageA);

try {
  const health = await fetch(baseUrl, { redirect: "manual", headers: authHeaders });
  check("origin:reachable", health.status === 200, health.status);

  const inviteA = issueInvite("Browser synthetic A");
  const inviteB = issueInvite("Browser synthetic B");
  results.subjects = { A: inviteA.subjectId, B: inviteB.subjectId };
  await login(pageA, inviteA.token, "initial");
  check(
    "login:a",
    (await pageA.locator("[data-builder-subject-label]").innerText()) ===
      "Browser synthetic A",
  );

  const offer1 = "Browser offer 111111 for the travel bottle";
  await fillIntake(pageA, { offer: offer1, emphasis: "111111" });
  await openPreviewAndGenerate(pageA, offer1);
  check("generate:initial", true);
  await auditPageScripts(pageA, "after-initial-generation");
  await pageA.screenshot({ path: path.join(screenshots, "a-initial-1440.png") });

  await pageA.reload({ waitUntil: "networkidle" });
  await pageA.waitForSelector('[data-intake-ready="true"]');
  check(
    "refresh:restored",
    (await pageA.getByLabel("Offer", { exact: true }).inputValue()) === offer1,
  );
  await reselectPackshotAndConfirm(pageA);
  await openPreviewAndGenerate(pageA, offer1);
  check("generate:after-refresh", true);
  await auditPageScripts(pageA, "after-refresh");

  await pageA.getByRole("button", { name: "Edit brief inputs" }).click();
  await pageA.waitForSelector('[data-intake-ready="true"]');
  const offer2 = "Edited browser offer 222222 for the travel bottle";
  await pageA.getByLabel("Offer", { exact: true }).fill(offer2);
  await pageA.getByLabel("Reviewed offer emphasis (optional)").fill("222222");
  await reselectPackshotAndConfirm(pageA);
  await openPreviewAndGenerate(pageA, offer2);
  check("generate:after-edit", true);
  await auditPageScripts(pageA, "after-edit");

  const exportA = await approveAndExport(pageA, "browser-a");
  results.exports.push(auditZip("browser-a", exportA.zipPath));

  const pageA2 = await contextA.newPage();
  captureRequests(pageA2);
  await pageA2.goto(baseUrl + "/builder", { waitUntil: "networkidle" });
  await pageA2.waitForSelector('[data-intake-ready="true"]');
  await auditPageScripts(pageA2, "second-tab");
  const offer3 = "Second tab browser offer 333333 for the travel bottle";
  await fillIntake(pageA2, { offer: offer3, emphasis: "333333" });
  await openPreviewAndGenerate(pageA2, offer3);
  await auditPageScripts(pageA2, "after-second-tab");
  check("two-tabs:second-preview", true);
  await pageA2.screenshot({ path: path.join(screenshots, "a-two-tabs-1440.png") });
  check(
    "idempotency:unique-ui-attempts",
    new Set(
      results.requestKeys.filter((key) => typeof key === "string"),
    ).size === results.requestKeys.filter((key) => typeof key === "string").length,
  );

  const firstRequest = generationRequests.find((entry) => entry && entry.body);
  check("idempotency:captured-attempt", Boolean(firstRequest));
  const replay = await pageA.evaluate(
    async ({ requestBody, subject }) => {
      const response = await fetch("/api/builder/generate", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-builder-subject": subject,
        },
        body: JSON.stringify(requestBody),
      });
      return { status: response.status, payload: await response.json().catch(() => null) };
    },
    { requestBody: firstRequest.body, subject: firstRequest.subject },
  );
  check(
    "idempotency:replay-409",
    replay.status === 409 && replay.payload?.error === "request_already_submitted",
    { status: replay.status, payload: replay.payload },
  );

  const contextB = await browser.newContext({
    acceptDownloads: true,
    viewport: { width: 1440, height: 900 },
    ...(basicUser
      ? { httpCredentials: { username: basicUser, password: basicPassword } }
      : {}),
  });
  const pageB = await contextB.newPage();
  captureRequests(pageB);
  await login(pageB, inviteB.token, "b-login");
  check(
    "login:b",
    (await pageB.locator("[data-builder-subject-label]").innerText()) ===
      "Browser synthetic B",
  );
  const offerB = "Browser B offer 444444 for the travel bottle";
  await fillIntake(pageB, { offer: offerB, emphasis: "444444" });
  await openPreviewAndGenerate(pageB, offerB);
  check("b:initial-generation", true);
  await auditPageScripts(pageB, "after-b-generation");
  const cookiesA = await contextA.cookies(baseUrl);
  const cookiesB = await contextB.cookies(baseUrl);
  const cookieA = cookieHeader(cookiesA);
  const cookieB = cookieHeader(cookiesB);

  operator(["revoke-subject", "--subject", inviteA.subjectId]);
  await pageA.evaluate(() => window.dispatchEvent(new Event("focus")));
  await pageA2.evaluate(() => window.dispatchEvent(new Event("focus")));
  await pageA.waitForSelector('input[name="token"]', { timeout: 25_000 });
  await pageA2.waitForSelector('input[name="token"]', { timeout: 25_000 });
  check("revoke-a:workspace-cleared", (await storageKeys(pageA)).length === 0);
  check("revoke-a:second-tab-cleared", (await storageKeys(pageA2)).length === 0);
  check(
    "revoke-a:no-workspace-text",
    !(await pageA.locator("body").innerText()).includes(offer2),
  );
  await pageA.screenshot({ path: path.join(screenshots, "a-revoked-1440.png") });

  const revokedGenerate = await fetch(baseUrl + "/api/builder/generate", {
    method: "POST",
    redirect: "manual",
    headers: {
      ...authHeaders,
      origin: baseUrl,
      cookie: cookieA,
      "content-type": "application/json",
      "x-builder-subject": inviteA.subjectId,
    },
    body: JSON.stringify({
      browserBrief: firstRequest.body.browserBrief,
      requestId: randomUUID(),
    }),
  });
  const revokedPayload = await revokedGenerate.json().catch(() => null);
  check(
    "revoke-a:cannot-generate",
    (revokedGenerate.status === 401 || revokedGenerate.status === 404) &&
      revokedPayload?.ok === false &&
      !revokedPayload?.preview,
    { status: revokedGenerate.status, payload: revokedPayload },
  );

  const sessionB = await fetch(baseUrl + "/api/builder/session", {
    headers: { ...authHeaders, cookie: cookieB },
    cache: "no-store",
  });
  check("revoke-a:b-session-active", sessionB.status === 200, sessionB.status);
  await pageB.getByRole("button", { name: "Generate preview" }).click();
  await waitForPreview(pageB, offerB);
  check("revoke-a:b-can-generate", true);
  await pageB.screenshot({ path: path.join(screenshots, "b-after-a-revoke-1440.png") });

  await pageB.locator("[data-builder-logout]").click();
  await pageB.waitForSelector('input[name="token"]', { timeout: 20_000 });
  await pageB.waitForTimeout(300);
  check("signout:b-signed-out", new URL(pageB.url()).pathname === "/");
  check("signout:b-storage-cleared", (await storageKeys(pageB)).length === 0);

  results.screenshots = readdirSync(screenshots)
    .sort()
    .map((name) => path.relative(root, path.join(screenshots, name)));
  results.scriptDeltaSummary = results.scriptAudits.map((audit) => ({
    label: audit.label,
    inserted: audit.inserted,
    removed: audit.removed,
  }));
  const insertedAfterLogin = results.scriptAudits
    .filter((audit) => audit.label !== "initial:login-page" && audit.label !== "b-login:login-page")
    .flatMap((audit) => audit.inserted.map((src) => ({ label: audit.label, src })));
  results.additionalChunksAfterLogin = insertedAfterLogin;
  results.dynamicChunkFinding =
    insertedAfterLogin.length === 0
      ? "No additional script[src] URLs were inserted after the login landing page in the audited interactions."
      : `${insertedAfterLogin.length} script[src] URL(s) were inserted after the login landing page; see scriptAudits.`;
  results.completedAt = new Date().toISOString();
  results.ok = results.checks.every((entry) => entry.ok);
  writeFileSync(
    path.join(evidenceDir, "results.json"),
    `${JSON.stringify(results, null, 2)}\n`,
  );
  console.log(
    JSON.stringify(
      {
        ok: results.ok,
        checks: results.checks.length,
        subjects: results.subjects,
        requestKeys: results.requestKeys.filter((key) => typeof key === "string"),
        exports: results.exports,
        screenshots: results.screenshots,
      },
      null,
      2,
    ),
  );
} catch (error) {
  results.completedAt = new Date().toISOString();
  results.ok = false;
  results.error = error instanceof Error ? error.message : String(error);
  results.errorDetail = describeFetchError(error);
  writeFileSync(
    path.join(evidenceDir, "results.json"),
    `${JSON.stringify(results, null, 2)}\n`,
  );
  console.error(
    JSON.stringify(
      {
        ok: false,
        error: results.error,
        errorDetail: results.errorDetail,
        checks: results.checks,
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
} finally {
  await contextA.close();
  await browser.close();
}
