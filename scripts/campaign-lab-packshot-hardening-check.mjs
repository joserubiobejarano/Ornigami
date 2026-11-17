#!/usr/bin/env node
/**
 * Focused browser checks for the Campaign Lab packshot intake and brief
 * recovery.
 *
 * By default this runs against the committed synthetic fixture. To check a
 * local brand package, pass an explicit JSON file from Git-ignored storage:
 *
 *   node scripts/campaign-lab-packshot-hardening-check.mjs `
 *     --url http://localhost:3101 `
 *     --inputs .local/campaign-lab-inputs/packshot.json `
 *     --out .local/campaign-lab-packshot-hardening/evidence
 *
 * Covers the exact file with the native image path, a deliberately stalled
 * image.decode(), retry after restoring normal browser loading, corrupt-file
 * rejection, rapid replacement with object URL cleanup, and same-tab refresh
 * recovery with a fresh approval.
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
    out: { type: "string", short: "o", default: ".local/campaign-lab-packshot-hardening/evidence" },
    inputs: { type: "string", short: "i" },
    headed: { type: "boolean", default: false },
  },
});

const fixture = loadOfferFixture({ inputs: cli.inputs, root });
const STORAGE_KEY = "ornigami.campaign-lab.offer-intake.brief.v1";

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

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
  const cache = process.env.LOCALAPPDATA
    ? path.join(process.env.LOCALAPPDATA, "ms-playwright")
    : null;
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

async function gotoOffer(page, baseUrl) {
  await page.goto(new URL("/campaign-lab/offer", baseUrl).href, {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  await page.getByRole("heading", { name: "Offer intake", exact: true }).waitFor();
  await page.locator('input[type="file"]').waitFor();
  await page.waitForFunction(() => {
    const input = document.querySelector('input[type="file"]');
    return Boolean(input) && Object.keys(input).some((key) => key.startsWith("__reactProps$"));
  });
  const cookieDismiss = page.getByRole("button", { name: "Got it", exact: true });
  if (await cookieDismiss.count()) await cookieDismiss.click().catch(() => {});
}

async function fillBrief(page, offer = fixture.brief.offer) {
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

async function selectPackshot(page, filePath) {
  await page.getByLabel("Product image", { exact: true }).setInputFiles(filePath);
}

async function waitForPackshotReady(page) {
  await page.locator("[data-packshot-ready]").waitFor({ state: "visible", timeout: 30_000 });
  return page.evaluate(() => {
    const node = document.querySelector("[data-packshot-ready]");
    return {
      file: node?.getAttribute("data-packshot-file") ?? null,
      width: Number(node?.getAttribute("data-packshot-width") ?? 0),
      height: Number(node?.getAttribute("data-packshot-height") ?? 0),
      hash: node?.getAttribute("data-packshot-hash") ?? null,
      text: node?.textContent?.replace(/\s+/g, " ").trim() ?? null,
    };
  });
}

async function waitForPackshotError(page) {
  await page.locator("[data-packshot-error]").waitFor({ state: "visible", timeout: 15_000 });
  return page.evaluate(() => ({
    text: document.querySelector("[data-packshot-error]")?.textContent?.replace(/\s+/g, " ").trim() ?? null,
    status: document.querySelector("[data-packshot-status]")?.getAttribute("data-packshot-status") ?? null,
    ready: Boolean(document.querySelector("[data-packshot-ready]")),
    openDisabled: [...document.querySelectorAll("button")].find((button) => button.textContent?.trim() === "Open Campaign Lab preview")?.disabled ?? null,
  }));
}

async function confirmAll(page) {
  const checkboxes = page.locator('input[type="checkbox"]');
  for (let index = 0; index < 3; index += 1) {
    await checkboxes.nth(index).check();
  }
}

async function openAndGenerate(page) {
  await page.getByRole("button", { name: "Open Campaign Lab preview", exact: true }).click();
  await page.getByRole("button", { name: "Generate preview", exact: true }).waitFor({ state: "visible", timeout: 30_000 });
  await page.getByRole("button", { name: "Generate preview", exact: true }).click();
  await page.waitForFunction(() => {
    const status = document.querySelector("section[data-preview-status]")?.getAttribute("data-generation-status");
    return status === "generated" || status === "fallback";
  }, null, { timeout: 30_000 });
  return readPreview(page);
}

async function readPreview(page) {
  return page.evaluate(() => {
    const section = document.querySelector("section[data-preview-status]");
    const panel = document.querySelector("[data-approval-scope]");
    return {
      revision: section?.getAttribute("data-revision") ?? null,
      previewStatus: section?.getAttribute("data-preview-status") ?? null,
      generationStatus: section?.getAttribute("data-generation-status") ?? null,
      approval: panel?.getAttribute("data-local-preview-approval") ?? null,
      approvalRevision: panel?.getAttribute("data-approval-revision") ?? null,
      approvalScope: panel?.getAttribute("data-approval-scope") ?? null,
    };
  });
}

async function approve(page) {
  await page.getByRole("button", { name: "Approve preview locally", exact: true }).click();
  await page.waitForFunction(() => document.querySelector("[data-approval-scope]")?.getAttribute("data-local-preview-approval") === "true", null, { timeout: 10_000 });
  return readPreview(page);
}

async function readRecoveryState(page) {
  const fields = {
    brand: await page.getByLabel("Brand name", { exact: true }).inputValue(),
    product: await page.getByLabel("Product name", { exact: true }).inputValue(),
    offer: await page.getByLabel("Offer", { exact: true }).inputValue(),
    destination: await page.getByLabel("Destination URL", { exact: true }).inputValue(),
    alt: await page.getByLabel("Alt text", { exact: true }).inputValue(),
    rights: await page.getByLabel("Usage rights", { exact: true }).inputValue(),
  };
  const rest = await page.evaluate((storageKey) => ({
    restored: document.querySelector("[data-restored-brief='true']")?.textContent?.replace(/\s+/g, " ").trim() ?? null,
    packshotStatus: document.querySelector("[data-packshot-status]")?.getAttribute("data-packshot-status") ?? null,
    storage: window.sessionStorage.getItem(storageKey),
  }), STORAGE_KEY);
  return { ...rest, ...fields };
}

async function main() {
  const out = path.resolve(root, cli.out || path.join(".local", "campaign-lab-packshot-hardening", timestamp()));
  mkdirSync(out, { recursive: true });

  const { module: playwright, source: playwrightSource } = await loadPlaywright();
  const { chromium } = playwright;
  const browser = await chromium.launch({
    headless: !cli.headed,
    executablePath: chromiumExecutable(chromium),
  });
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
    scenarios: {},
  };

  async function withPage(width, fn) {
    const page = await browser.newPage({
      viewport: { width, height: 900 },
      deviceScaleFactor: 1,
    });
    const errors = [];
    page.on("console", (message) => {
      if (message.type() === "error" && !message.text().includes("WebSocket")) errors.push(message.text());
    });
    page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
    try {
      await gotoOffer(page, cli.url);
      return await fn(page, errors);
    } finally {
      await page.close();
    }
  }

  // 1. Exact fixture file through the native path.
  report.scenarios.native = await withPage(375, async (page, errors) => {
    await fillBrief(page);
    await selectPackshot(page, fixture.packshot);
    const ready = await waitForPackshotReady(page);
    check(report, "native:exact-file", ready.file === fixture.packshotFileName && ready.width === fixture.expected.width && ready.height === fixture.expected.height && ready.hash === fixture.expected.hash, ready, {
      file: fixture.packshotFileName,
      width: fixture.expected.width,
      height: fixture.expected.height,
      hash: fixture.expected.hash,
    });
    check(report, "native:no-console-errors", errors.length === 0, errors, "no console errors");
    return { ready, errors };
  });

  // 2. A deliberately stalled decode still recovers from valid dimensions.
  report.scenarios.stalledDecode = await withPage(375, async (page, errors) => {
    await page.evaluate(() => {
      HTMLImageElement.prototype.decode = () => new Promise(() => {});
    });
    await fillBrief(page);
    await selectPackshot(page, fixture.packshot);
    const ready = await waitForPackshotReady(page);
    check(report, "stalled-decode:recovers-from-loaded-image", ready.hash === fixture.expected.hash && ready.width === fixture.expected.width, ready, {
      hash: fixture.expected.hash,
      width: fixture.expected.width,
    });
    check(report, "stalled-decode:no-console-errors", errors.length === 0, errors, "no console errors");
    return { ready, errors };
  });

  // 3. A stalled decode with no usable image gives a bounded retry message.
  report.scenarios.stalledWithoutDimensions = await withPage(375, async (page, errors) => {
    await page.evaluate(() => {
      window.Image = class StalledImage {
        complete = false;
        naturalWidth = 0;
        naturalHeight = 0;
        src = "";
        addEventListener() {}
        removeEventListener() {}
        decode() {
          return new Promise(() => {});
        }
      };
    });
    await fillBrief(page);
    await selectPackshot(page, fixture.packshot);
    const failure = await waitForPackshotError(page);
    check(
      report,
      "stalled-without-dimensions:actionable-retry",
      failure.status === "error" && !failure.ready && failure.openDisabled === true && /took too long|check the file|try again/i.test(failure.text ?? ""),
      failure,
      "bounded retry message, no ready packshot, disabled submit",
    );
    check(report, "stalled-without-dimensions:no-console-errors", errors.length === 0, errors, "no console errors");
    return { failure, errors };
  });

  // 3b. A timeout is retried with the identical file after normal loading is
  // restored. The file input is cleared after each read so the browser emits a
  // second change event without an intervening selection.
  report.scenarios.stalledRetry = await withPage(375, async (page, errors) => {
    await page.evaluate(() => {
      window.__originalImage = window.Image;
      window.Image = class StalledImage {
        complete = false;
        naturalWidth = 0;
        naturalHeight = 0;
        src = "";
        addEventListener() {}
        removeEventListener() {}
        decode() {
          return new Promise(() => {});
        }
      };
    });
    await fillBrief(page);
    await selectPackshot(page, fixture.packshot);
    const failure = await waitForPackshotError(page);
    const inputCleared = await page
      .locator("[data-packshot-input]")
      .evaluate((input) => input.value === "");
    await page.screenshot({
      path: path.join(out, "stalled-retry-timeout-375.png"),
      fullPage: true,
    });

    await page.evaluate(() => {
      window.Image = window.__originalImage;
    });
    await selectPackshot(page, fixture.packshot);
    const ready = await waitForPackshotReady(page);
    await page.screenshot({
      path: path.join(out, "stalled-retry-recovered-375.png"),
      fullPage: true,
    });

    check(
      report,
      "stalled-retry:input-cleared-after-timeout",
      inputCleared && failure.status === "error" && !failure.ready,
      { inputCleared, failure },
      "timeout error with an empty file input",
    );
    check(
      report,
      "stalled-retry:same-file-without-intervening-selection",
      ready.file === fixture.packshotFileName &&
        ready.hash === fixture.expected.hash &&
        ready.width === fixture.expected.width &&
        ready.height === fixture.expected.height,
      ready,
      {
        file: fixture.packshotFileName,
        hash: fixture.expected.hash,
      },
    );
    check(report, "stalled-retry:no-console-errors", errors.length === 0, errors, "no console errors");
    return { failure, inputCleared, ready, errors };
  });

  // 4. Corrupt bytes remain rejected with an actionable message.
  report.scenarios.corrupt = await withPage(375, async (page, errors) => {
    await fillBrief(page);
    await page.getByLabel("Product image", { exact: true }).setInputFiles({
      name: "corrupt.jpg",
      mimeType: "image/jpeg",
      buffer: Buffer.from("this is not an image"),
    });
    const failure = await waitForPackshotError(page);
    check(
      report,
      "corrupt:actionable-rejection",
      failure.status === "error" && !failure.ready && failure.openDisabled === true && /corrupt|choose another|reselect|try again/i.test(failure.text ?? ""),
      failure,
      "error status, no ready packshot, disabled submit, actionable message",
    );
    check(report, "corrupt:no-console-errors", errors.length === 0, errors, "no console errors");
    return { failure, errors };
  });

  // 5. Rapid replacement: the last file wins and stale object URLs are revoked.
  report.scenarios.rapidReplacement = await withPage(375, async (page, errors) => {
    await page.evaluate(() => {
      const stats = { created: 0, revoked: 0, live: [] };
      const create = URL.createObjectURL.bind(URL);
      const revoke = URL.revokeObjectURL.bind(URL);
      URL.createObjectURL = (blob) => {
        const url = create(blob);
        stats.created += 1;
        stats.live.push(url);
        return url;
      };
      URL.revokeObjectURL = (url) => {
        stats.revoked += 1;
        stats.live = stats.live.filter((candidate) => candidate !== url);
        return revoke(url);
      };
      window.__packshotUrlStats = stats;
    });
    await fillBrief(page);
    const input = page.getByLabel("Product image", { exact: true });
    await input.setInputFiles({
      name: "first-corrupt.jpg",
      mimeType: "image/jpeg",
      buffer: Buffer.from("not an image"),
    });
    await input.setInputFiles(fixture.packshot);
    const ready = await waitForPackshotReady(page);
    await page.waitForFunction(() => window.__packshotUrlStats.revoked >= 1, null, { timeout: 10_000 });
    const stats = await page.evaluate(() => ({
      created: window.__packshotUrlStats.created,
      revoked: window.__packshotUrlStats.revoked,
      live: window.__packshotUrlStats.live.length,
    }));
    const failure = await page.locator("[data-packshot-error]").count();
    check(report, "rapid:last-file-wins", ready.file === fixture.packshotFileName && ready.hash === fixture.expected.hash && failure === 0, { ready, failure }, {
      file: fixture.packshotFileName,
      hash: fixture.expected.hash,
      errors: 0,
    });
    check(report, "rapid:stale-object-url-revoked", stats.created >= 2 && stats.revoked >= 1 && stats.live === 1, stats, {
      createdAtLeast: 2,
      revokedAtLeast: 1,
      live: 1,
    });
    check(report, "rapid:no-console-errors", errors.length === 0, errors, "no console errors");
    return { ready, stats, errors };
  });

  // 6. Same-tab refresh restores text fields but not the packshot or approval.
  report.scenarios.refresh = await withPage(375, async (page, errors) => {
    await fillBrief(page);
    await selectPackshot(page, fixture.packshot);
    await waitForPackshotReady(page);
    await confirmAll(page);
    const first = await openAndGenerate(page);
    const firstApproved = await approve(page);
    check(report, "refresh:initial-approval", firstApproved.approval === "true" && firstApproved.approvalRevision === first.revision, firstApproved, "approved initial revision");

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "Offer intake", exact: true }).waitFor();
    await page.waitForFunction(() => document.querySelector("[data-restored-brief='true']") !== null, null, { timeout: 10_000 });
    const recovered = await readRecoveryState(page);
    const stored = recovered.storage ? JSON.parse(recovered.storage) : null;
    check(report, "refresh:fields-restored", recovered.brand === fixture.brief.brandName && recovered.product === fixture.brief.productName && recovered.offer === fixture.brief.offer && recovered.destination === fixture.brief.destinationUrl && recovered.alt === fixture.brief.alt && recovered.rights === fixture.brief.rights, recovered, {
      brand: fixture.brief.brandName,
      product: fixture.brief.productName,
      offer: fixture.brief.offer,
      destination: fixture.brief.destinationUrl,
    });
    check(report, "refresh:packshot-not-restored", recovered.packshotStatus === "empty", recovered.packshotStatus, "empty");
    check(report, "refresh:storage-has-no-image-or-approval", Boolean(stored) && !/blob:|approval/i.test(recovered.storage ?? ""), stored, "text fields only");
    check(report, "refresh:notice-asks-for-reselect", /reselect the packshot/i.test(recovered.restored ?? ""), recovered.restored, "reselect prompt");

    await selectPackshot(page, fixture.packshot);
    await waitForPackshotReady(page);
    await confirmAll(page);
    const second = await openAndGenerate(page);
    const secondApproved = await approve(page);
    await page.screenshot({
      path: path.join(out, "refresh-fresh-approval-375.png"),
      fullPage: true,
    });
    check(report, "refresh:fresh-approval-on-same-revision", secondApproved.approval === "true" && secondApproved.approvalRevision === second.revision && second.revision === first.revision, secondApproved, {
      revision: first.revision,
      approval: "true",
    });
    check(report, "refresh:no-console-errors", errors.length === 0, errors, "no console errors");
    return { first, firstApproved, recovered, second, secondApproved, errors };
  });

  await browser.close();
  const failed = report.checks.filter((item) => !item.passed);
  report.status = failed.length === 0 ? "passed" : "failed";
  report.failed = failed;
  writeFileSync(path.join(out, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({
    status: report.status,
    out: report.out,
    checks: report.checks.length,
    failed: failed.length,
    failures: failed,
    browser: report.browserVersion,
  }, null, 2));
  return failed.length === 0 ? 0 : 1;
}

process.exitCode = await main();
