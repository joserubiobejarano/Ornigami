#!/usr/bin/env node
/**
 * Continuous offer correction and local-approval rehearsal.
 *
 * By default this runs against the committed synthetic fixture. To check a
 * local brand package, pass an explicit JSON file from Git-ignored storage:
 *
 *   node scripts/campaign-lab-momisa-continuous-check.mjs `
 *     --url http://localhost:3101 `
 *     --inputs .local/campaign-lab-inputs/continuous.json `
 *     --out .local/campaign-lab-continuous
 *
 * One browser page starts at 375 px, enters the brief with the initial offer,
 * generates, applies the correction, opens a fresh revision, approves it, then
 * resizes the same page to desktop. Article captures exclude the editor chrome
 * and status banners.
 */
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

import { loadOfferFixture } from "./support/campaign-lab-offer-fixture.mjs";

const root = process.cwd();
const { values: cli } = parseArgs({
  options: {
    url: { type: "string", short: "u", default: "http://localhost:3101" },
    out: { type: "string", short: "o", default: ".local/campaign-lab-continuous" },
    inputs: { type: "string", short: "i" },
    headed: { type: "boolean", default: false },
  },
});

const fixture = loadOfferFixture({ inputs: cli.inputs, root });

async function loadPlaywright() {
  const candidates = [
    process.env.CAMPAIGN_LAB_PLAYWRIGHT,
    path.join(root, "scripts", "framework-prototype", "browser-tools", "node_modules", "playwright", "index.mjs"),
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue;
    return { module: await import(pathToFileURL(candidate).href), source: candidate };
  }
  return { module: await import("playwright"), source: "playwright" };
}

function chromiumExecutable(chromium) {
  if (process.env.CAMPAIGN_LAB_CHROMIUM) {
    if (!existsSync(process.env.CAMPAIGN_LAB_CHROMIUM)) {
      throw new Error(`CAMPAIGN_LAB_CHROMIUM does not exist: ${process.env.CAMPAIGN_LAB_CHROMIUM}`);
    }
    return process.env.CAMPAIGN_LAB_CHROMIUM;
  }
  const bundled = chromium.executablePath();
  if (bundled && existsSync(bundled)) return bundled;
  const cache = process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, "ms-playwright") : null;
  if (cache && existsSync(cache)) {
    const versions = readdirSync(cache)
      .filter((name) => /^chromium-\d+$/.test(name))
      .sort((left, right) => Number(right.split("-")[1]) - Number(left.split("-")[1]));
    for (const version of versions) {
      const candidate = path.join(cache, version, "chrome-win64", "chrome.exe");
      if (existsSync(candidate)) return candidate;
    }
  }
  throw new Error("Chromium is not installed for the resolved Playwright package.");
}

function check(report, id, passed, actual, expected) {
  report.checks.push({ id, passed, actual, expected });
}

async function fillBrief(page, offer) {
  const brief = fixture.brief;
  await page.getByLabel("Brand name", { exact: true }).fill(brief.brandName);
  await page.getByLabel("Product name", { exact: true }).fill(brief.productName);
  await page.getByLabel("Offer", { exact: true }).fill(offer);
  await page.getByLabel("Destination URL", { exact: true }).fill(brief.destinationUrl);
  const labels = page.getByLabel("Label", { exact: true });
  const values = page.getByLabel("Approved value", { exact: true });
  for (const [index, fact] of brief.facts.entries()) {
    await labels.nth(index).fill(fact.label);
    await values.nth(index).fill(fact.value);
  }
  await page.getByLabel("Alt text", { exact: true }).fill(brief.alt);
  await page.getByLabel("Usage rights", { exact: true }).fill(brief.rights);
}

async function checkConfirmations(page) {
  const checkboxes = page.locator('input[type="checkbox"]');
  for (let index = 0; index < 3; index += 1) {
    await checkboxes.nth(index).check();
  }
}

async function openAndGenerate(page, expectedOffer) {
  await page.getByRole("button", { name: "Open Campaign Lab preview", exact: true }).click();
  await page.getByRole("button", { name: "Generate preview", exact: true }).waitFor({ state: "visible", timeout: 30_000 });
  await page.getByRole("button", { name: "Generate preview", exact: true }).click();
  await page.waitForFunction(() => {
    const status = document.querySelector("section[data-preview-status]")?.getAttribute("data-generation-status");
    return status === "generated" || status === "fallback";
  }, null, { timeout: 30_000 });
  await page.waitForFunction(() => {
    const img = document.querySelector("[data-preview-canvas] article img");
    return Boolean(img) && img.complete && img.naturalWidth > 0;
  }, null, { timeout: 15_000 });
  return readState(page, expectedOffer);
}

async function readState(page, expectedOffer) {
  return page.evaluate((offerText) => {
    const section = document.querySelector("section[data-preview-status]");
    const panel = document.querySelector("[data-approval-scope]");
    const article = document.querySelector("[data-preview-canvas] article");
    const cta = article ? [...article.querySelectorAll("a")].find((a) => a.getAttribute("href")) : null;
    const offer = article ? [...article.querySelectorAll("*")].find((el) => el.children.length === 0 && (el.textContent || "").includes(offerText)) : null;
    const img = article?.querySelector("img");
    const box = (el) => el ? { x: Math.round(el.getBoundingClientRect().x), y: Math.round(el.getBoundingClientRect().y), w: Math.round(el.getBoundingClientRect().width), h: Math.round(el.getBoundingClientRect().height) } : null;
    const text = (el) => el?.textContent?.replace(/\s+/g, " ").trim() ?? null;
    return {
      revision: section?.getAttribute("data-revision") ?? null,
      previewStatus: section?.getAttribute("data-preview-status") ?? null,
      generationStatus: section?.getAttribute("data-generation-status") ?? null,
      approval: panel?.getAttribute("data-local-preview-approval") ?? null,
      approvalRevision: panel?.getAttribute("data-approval-revision") ?? null,
      approvalScope: panel?.getAttribute("data-approval-scope") ?? null,
      article: text(article),
      offer: text(offer),
      offerBox: box(offer),
      cta: text(cta),
      ctaHref: cta?.getAttribute("href") ?? null,
      ctaBox: box(cta),
      image: img ? { alt: img.alt, naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight, complete: img.complete, box: box(img) } : null,
      articleBox: box(article),
      viewport: { w: innerWidth, h: innerHeight, scrollW: document.documentElement.scrollWidth },
    };
  }, expectedOffer);
}

async function approve(page, expectedOffer) {
  await page.getByRole("button", { name: "Approve preview locally", exact: true }).click();
  await page.waitForFunction(() => document.querySelector("[data-approval-scope]")?.getAttribute("data-local-preview-approval") === "true", null, { timeout: 10_000 });
  return readState(page, expectedOffer);
}

async function captureArticle(page, out, name) {
  const article = page.locator("[data-preview-canvas] article");
  await article.scrollIntoViewIfNeeded();
  await article.screenshot({ path: path.join(out, name) });
}

async function main() {
  const out = path.resolve(root, cli.out);
  mkdirSync(out, { recursive: true });

  const { module: playwright, source: playwrightSource } = await loadPlaywright();
  const { chromium } = playwright;
  const browser = await chromium.launch({
    headless: !cli.headed,
    executablePath: chromiumExecutable(chromium),
  });
  const page = await browser.newPage({ viewport: { width: 375, height: 900 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error" && !message.text().includes("WebSocket")) errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));

  const report = {
    target: cli.url,
    out: path.relative(root, out),
    playwright: playwrightSource,
    browserVersion: browser.version(),
    generatedAt: new Date().toISOString(),
    fixture: {
      source: fixture.source,
      file: fixture.packshotFileName,
      width: fixture.expected.width,
      height: fixture.expected.height,
      expectedHash: fixture.expected.hash,
      actualHash: fixture.actualHash,
    },
    checks: [],
    states: {},
  };

  await page.goto(new URL("/campaign-lab/offer", cli.url).href, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.getByRole("heading", { name: "Offer intake", exact: true }).waitFor();
  await page.locator('input[type="file"]').waitFor();
  await page.waitForFunction(() => {
    const input = document.querySelector('input[type="file"]');
    return Boolean(input) && Object.keys(input).some((key) => key.startsWith("__reactProps$"));
  });
  const cookieDismiss = page.getByRole("button", { name: "Got it", exact: true });
  if (await cookieDismiss.count()) await cookieDismiss.click().catch(() => {});

  const initialOffer = fixture.continuous.initialOffer;
  const correctedOffer = fixture.continuous.correctedOffer;
  const destination = fixture.brief.destinationUrl;

  await fillBrief(page, initialOffer);
  await page.getByLabel("Product image", { exact: true }).setInputFiles(fixture.packshot);
  await page.locator("[data-packshot-ready]").waitFor({ state: "visible", timeout: 30_000 });
  await checkConfirmations(page);
  const initial = await openAndGenerate(page, initialOffer);
  await captureArticle(page, out, "article-before-375.png");
  report.states.initial = initial;
  check(report, "initial:revision-generated", initial.previewStatus === "confirmed" && ["generated", "fallback"].includes(initial.generationStatus), initial, {
    previewStatus: "confirmed",
    generationStatus: "generated or fallback",
  });
  check(report, "initial:offer-exact", initial.offer === initialOffer, initial.offer, initialOffer);
  check(report, "initial:cta-exact-listing", initial.ctaHref === destination, initial.ctaHref, destination);
  check(report, "initial:packshot-loaded", initial.image?.complete === true && initial.image?.naturalWidth === fixture.expected.width && initial.image?.naturalHeight === fixture.expected.height, initial.image, {
    complete: true,
    width: fixture.expected.width,
    height: fixture.expected.height,
  });

  await page.getByRole("button", { name: "Edit brief inputs", exact: true }).click();
  await page.getByLabel("Offer", { exact: true }).fill(correctedOffer);
  await checkConfirmations(page);
  const corrected = await openAndGenerate(page, correctedOffer);
  const approved = await approve(page, correctedOffer);
  report.states.corrected = corrected;
  report.states.approved375 = approved;
  await captureArticle(page, out, "article-approved-375.png");

  check(report, "corrected:revision-changed", corrected.revision !== initial.revision, { initial: initial.revision, corrected: corrected.revision }, "different revision");
  check(report, "corrected:offer-exact", approved.offer === correctedOffer, approved.offer, correctedOffer);
  check(report, "corrected:cta-exact-listing", approved.ctaHref === destination, approved.ctaHref, destination);
  check(report, "approved:local-preview-revision", approved.approval === "true" && approved.approvalRevision === approved.revision && approved.approvalScope === "local-preview", approved, {
    approval: "true",
    approvalRevision: approved.revision,
    approvalScope: "local-preview",
  });
  check(report, "mobile:no-horizontal-overflow", approved.viewport.scrollW === 375, approved.viewport, { scrollW: 375 });

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.waitForFunction(() => window.innerWidth === 1440, null, { timeout: 10_000 });
  const desktop = await readState(page, correctedOffer);
  report.states.approved1440 = desktop;
  await captureArticle(page, out, "article-approved-1440.png");
  check(report, "desktop:same-approval", desktop.approval === "true" && desktop.approvalRevision === approved.revision, desktop, {
    approval: "true",
    approvalRevision: approved.revision,
  });
  check(report, "desktop:offer-exact", desktop.offer === correctedOffer, desktop.offer, correctedOffer);
  check(report, "desktop:cta-exact-listing", desktop.ctaHref === destination, desktop.ctaHref, destination);
  check(report, "desktop:no-horizontal-overflow", desktop.viewport.scrollW === 1440, desktop.viewport, { scrollW: 1440 });
  check(report, "continuous:no-console-errors", errors.length === 0, errors, "no console errors");

  await page.close();
  await browser.close();
  const failed = report.checks.filter((item) => !item.passed);
  report.status = failed.length === 0 ? "passed" : "failed";
  report.failed = failed;
  writeFileSync(path.join(out, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({
    status: report.status,
    out: report.out,
    initialRevision: report.states.initial?.revision ?? null,
    approvedRevision: report.states.approved375?.revision ?? null,
    checks: report.checks.length,
    failed: failed.length,
    failures: failed,
    browser: report.browserVersion,
  }, null, 2));
  return failed.length === 0 ? 0 : 1;
}

process.exitCode = await main();
