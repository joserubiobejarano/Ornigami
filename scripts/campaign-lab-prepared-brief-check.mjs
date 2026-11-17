#!/usr/bin/env node
/**
 * Portable browser check for the local prepared-brief action.
 *
 * The default run uses the committed synthetic fixture. An explicit inputs file
 * from Git-ignored storage can supply a different brief and packshot:
 *
 *   node scripts/campaign-lab-prepared-brief-check.mjs `
 *     --url http://localhost:3101 `
 *     --inputs .local/campaign-lab-inputs/prepared.json `
 *     --out .local/campaign-lab-prepared-brief
 *
 * It proves an invalid import leaves the current draft untouched, a valid
 * import fills the text fields verbatim, and the operator can then use the
 * existing packshot and confirmation controls to reach a local approval.
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
    out: { type: "string", short: "o", default: ".local/campaign-lab-prepared-brief" },
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
  await page.getByLabel("Prepared brief JSON", { exact: true }).waitFor();
  const cookieDismiss = page.getByRole("button", { name: "Got it", exact: true });
  if (await cookieDismiss.count()) await cookieDismiss.click().catch(() => {});
}

async function fillDraft(page, brief) {
  await page.getByLabel("Brand name", { exact: true }).fill(brief.brandName);
  await page.getByLabel("Product name", { exact: true }).fill(brief.productName);
  await page.getByLabel("Offer", { exact: true }).fill(brief.offer);
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

async function importBrief(page, brief) {
  await page.getByLabel("Prepared brief JSON", { exact: true }).setInputFiles({
    name: "prepared-brief.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ schemaVersion: 1, ...brief })),
  });
}

async function readDraft(page) {
  const values = await page.evaluate(() => {
    const read = (idSuffix) => {
      const input = [...document.querySelectorAll("input")].find((node) =>
        node.id.endsWith(idSuffix),
      );
      return input?.value ?? null;
    };
    return {
      brandName: read("-brand-name"),
      productName: read("-product-name"),
      offer: read("-offer"),
      destinationUrl: read("-destination"),
      alt: read("-alt"),
      rights: read("-rights"),
      facts: [0, 1, 2]
        .map((index) => ({
          label: read(`-facts-${index}-label`),
          value: read(`-facts-${index}-value`),
        }))
        .filter((fact) => fact.label !== null || fact.value !== null),
      preparedStatus:
        document
          .querySelector("[data-prepared-brief-status]")
          ?.getAttribute("data-prepared-brief-status") ?? null,
      preparedError:
        document
          .querySelector("[data-prepared-brief-error]")
          ?.textContent?.replace(/\s+/g, " ")
          .trim() ?? null,
      preparedNotice:
        document
          .querySelector("[data-prepared-brief-notice]")
          ?.textContent?.replace(/\s+/g, " ")
          .trim() ?? null,
      packshotStatus:
        document
          .querySelector("[data-packshot-status]")
          ?.getAttribute("data-packshot-status") ?? null,
      confirmations: [...document.querySelectorAll('input[type="checkbox"]')].map(
        (box) => box.checked,
      ),
    };
  });
  return values;
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
    };
  });
}

async function confirmAll(page) {
  const checkboxes = page.locator('input[type="checkbox"]');
  for (let index = 0; index < 3; index += 1) {
    await checkboxes.nth(index).check();
  }
}

async function openGenerateApprove(page) {
  await page.getByRole("button", { name: "Open Campaign Lab preview", exact: true }).click();
  await page.getByRole("button", { name: "Generate preview", exact: true }).waitFor({ state: "visible", timeout: 30_000 });
  await page.getByRole("button", { name: "Generate preview", exact: true }).click();
  await page.waitForFunction(() => {
    const status = document.querySelector("section[data-preview-status]")?.getAttribute("data-generation-status");
    return status === "generated" || status === "fallback";
  }, null, { timeout: 30_000 });
  await page.getByRole("button", { name: "Approve preview locally", exact: true }).click();
  await page.waitForFunction(
    () =>
      document
        .querySelector("[data-approval-scope]")
        ?.getAttribute("data-local-preview-approval") === "true",
    null,
    { timeout: 10_000 },
  );
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
      article: document
        .querySelector("[data-preview-canvas] article")
        ?.innerText?.replace(/\s+/g, " ")
        .trim() ?? null,
      ctaHref: document
        .querySelector("[data-preview-canvas] article a")
        ?.getAttribute("href") ?? null,
    };
  });
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
  const page = await browser.newPage({ viewport: { width: 375, height: 900 } });
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error" && !message.text().includes("WebSocket")) {
      errors.push(message.text());
    }
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

  await gotoOffer(page, cli.url);

  const existingDraft = {
    brandName: "Existing brand",
    productName: "Existing product",
    offer: "Existing offer, unchanged",
    destinationUrl: "https://example.com/existing",
    facts: [
      { label: "Existing fact one", value: "One" },
      { label: "Existing fact two", value: "Two" },
    ],
    alt: "Existing alt text.",
    rights: "Existing rights note.",
  };
  await fillDraft(page, existingDraft);
  const beforeInvalid = await readDraft(page);

  await page.getByLabel("Prepared brief JSON", { exact: true }).setInputFiles({
    name: "invalid-prepared-brief.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        schemaVersion: 1,
        productName: "",
        offer: "Free shipping",
        destinationUrl: "https://example.com/invalid",
        facts: [
          { label: "One", value: "1" },
          { label: "Two", value: "2" },
        ],
        alt: "Invalid draft.",
        rights: "Invalid draft.",
      }),
    ),
  });
  await page.locator("[data-prepared-brief-error]").waitFor({ state: "visible", timeout: 10_000 });
  const afterInvalid = await readDraft(page);

  check(
    report,
    "invalid-import:explains-error",
    afterInvalid.preparedStatus === "error" &&
      /Product name is required/i.test(afterInvalid.preparedError ?? ""),
    afterInvalid,
    "error status with a specific explanation",
  );
  check(
    report,
    "invalid-import:preserves-current-draft",
    JSON.stringify(afterInvalid) === JSON.stringify({
      ...beforeInvalid,
      preparedStatus: "error",
      preparedError: afterInvalid.preparedError,
    }),
    { beforeInvalid, afterInvalid },
    "every draft field unchanged",
  );

  await importBrief(page, fixture.brief);
  await page.locator("[data-prepared-brief-notice]").waitFor({ state: "visible", timeout: 10_000 });
  const loaded = await readDraft(page);
  check(
    report,
    "valid-import:all-fields-verbatim",
    loaded.brandName === fixture.brief.brandName &&
      loaded.productName === fixture.brief.productName &&
      loaded.offer === fixture.brief.offer &&
      loaded.destinationUrl === fixture.brief.destinationUrl &&
      loaded.alt === fixture.brief.alt &&
      loaded.rights === fixture.brief.rights &&
      JSON.stringify(loaded.facts) === JSON.stringify(fixture.brief.facts),
    loaded,
    fixture.brief,
  );
  check(
    report,
    "valid-import:waits-for-packshot-and-confirmations",
    loaded.preparedStatus === "loaded" &&
      loaded.packshotStatus === "empty" &&
      loaded.confirmations.every((checked) => checked === false),
    loaded,
    "loaded notice, empty packshot, unchecked confirmations",
  );
  await page.screenshot({ path: path.join(out, "prepared-brief-loaded-375.png"), fullPage: true });

  await selectPackshot(page, fixture.packshot);
  const ready = await waitForPackshotReady(page);
  check(
    report,
    "operator:packshot-selected",
    ready.file === fixture.packshotFileName &&
      ready.hash === fixture.expected.hash &&
      ready.width === fixture.expected.width &&
      ready.height === fixture.expected.height,
    ready,
    {
      file: fixture.packshotFileName,
      hash: fixture.expected.hash,
      width: fixture.expected.width,
      height: fixture.expected.height,
    },
  );

  await confirmAll(page);
  const approved = await openGenerateApprove(page);
  report.states.approved = approved;
  check(
    report,
    "operator:local-approval",
    approved.previewStatus === "confirmed" &&
      approved.approval === "true" &&
      approved.approvalRevision === approved.revision &&
      approved.approvalScope === "local-preview",
    approved,
    {
      previewStatus: "confirmed",
      approval: "true",
      approvalScope: "local-preview",
    },
  );
  check(
    report,
    "operator:exact-offer-and-destination",
    (approved.article ?? "").includes(fixture.brief.offer) &&
      approved.ctaHref === fixture.brief.destinationUrl,
    approved,
    {
      offer: fixture.brief.offer,
      destination: fixture.brief.destinationUrl,
    },
  );
  check(report, "portable:no-console-errors", errors.length === 0, errors, "no console errors");
  await page.screenshot({ path: path.join(out, "prepared-brief-approved-375.png"), fullPage: true });

  await page.close();
  await browser.close();
  const failed = report.checks.filter((item) => !item.passed);
  report.status = failed.length === 0 ? "passed" : "failed";
  report.failed = failed;
  writeFileSync(path.join(out, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({
    status: report.status,
    out: report.out,
    revision: report.states.approved?.revision ?? null,
    checks: report.checks.length,
    failed: failed.length,
    failures: failed,
    browser: report.browserVersion,
  }, null, 2));
  return failed.length === 0 ? 0 : 1;
}

process.exitCode = await main();
