#!/usr/bin/env node
/**
 * Standalone browser launch smoke for the synthetic private-edge harness.
 *
 * It uses the exact Playwright/browser executable intended for acceptance, as
 * the current user, without building or serving the application. It records
 * effective identity, HOME/XDG/temp writability, launch options, executable
 * version, bounded stderr and a screenshot, then shuts the browser down.
 */
import { accessSync, constants, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { browserLaunchOptions } from "../deploy/builder/browser-launch-config.mjs";
import { buildBrowserSmokeReport } from "../deploy/builder/browser-smoke-report.mjs";

const startedAt = new Date().toISOString();
const evidenceDir = process.env.BROWSER_SMOKE_EVIDENCE_DIR
  ? path.resolve(process.env.BROWSER_SMOKE_EVIDENCE_DIR)
  : path.resolve(process.cwd(), ".local", "browser-smoke");
mkdirSync(evidenceDir, { recursive: true });

function writable(directory) {
  try {
    mkdirSync(directory, { recursive: true });
    accessSync(directory, constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

const home = process.env.HOME ?? null;
const xdgConfigHome = process.env.XDG_CONFIG_HOME ?? null;
const xdgCacheHome = process.env.XDG_CACHE_HOME ?? null;
const tempRoot = process.env.TMPDIR ?? tmpdir();
const writableState = {
  home: home ? writable(home) : false,
  xdgConfigHome: xdgConfigHome ? writable(xdgConfigHome) : null,
  xdgCacheHome: xdgCacheHome ? writable(xdgCacheHome) : null,
  tmpdir: writable(tempRoot),
  evidence: writable(evidenceDir),
};

const playwrightPath =
  process.env.BROWSER_PLAYWRIGHT ??
  path.resolve(
    process.cwd(),
    "scripts",
    "framework-prototype",
    "browser-tools",
    "node_modules",
    "playwright",
    "index.mjs",
  );

let browser = null;
let page = null;
let screenshot = null;
let executablePath = null;
let browserVersion = null;
let error = null;
let stderr = "";

try {
  const { chromium } = await import(pathToFileURL(playwrightPath).href);
  const launchOptions = browserLaunchOptions();
  executablePath = chromium.executablePath();
  browser = await chromium.launch(launchOptions);
  browserVersion = browser.version();
  page = await browser.newPage();
  await page.goto(
    "data:text/html,<title>ornigami-browser-smoke</title><h1>ok</h1>",
    { waitUntil: "load", timeout: 10_000 },
  );
  const title = await page.evaluate(() => document.title);
  if (title !== "ornigami-browser-smoke") {
    throw new Error(`unexpected data-page title: ${title}`);
  }
  screenshot = path.join(evidenceDir, "browser-smoke.png");
  await page.screenshot({ path: screenshot, type: "png" });
} catch (caught) {
  error = caught instanceof Error ? caught : new Error(String(caught));
  stderr = error.stderr ?? error.message ?? "";
} finally {
  try {
    if (page) await page.close();
  } catch {}
  try {
    if (browser) await browser.close();
  } catch {}
}

const finishedAt = new Date().toISOString();
const report = buildBrowserSmokeReport({
  ok: !error,
  error,
  stderr,
  screenshot,
  executablePath,
  browserVersion,
  startedAt,
  finishedAt,
  tmpdir: tempRoot,
  writable: writableState,
  launchOptions: browserLaunchOptions(),
});
writeFileSync(
  path.join(evidenceDir, "browser-smoke.json"),
  `${JSON.stringify(report, null, 2)}\n`,
);
console.log(JSON.stringify({
  ok: report.ok,
  browserMode: report.browserMode,
  sandbox: report.sandbox,
  effectiveUid: report.effectiveUid,
  effectiveGid: report.effectiveGid,
  home: report.home,
  writable: report.writable,
  browserVersion: report.browserVersion,
  screenshot: report.screenshot,
  error: report.error,
  evidenceDir,
}, null, 2));
if (!report.ok) process.exit(1);
