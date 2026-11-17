#!/usr/bin/env node
/**
 * Focused browser evidence for the local-only Campaign Lab offer intake.
 *
 * It verifies four destination labels (unconfirmed direct, Amazon/search
 * placeholder, invalid, confirmed direct), then drives generation, editing,
 * a provisional destination revision, approval, and approval clearing at
 * 375 and 1440 px. Approval must stay bound to the exact rendered revision and
 * must read as a local preview action, not publication approval.
 *
 * Usage:
 *   node scripts/campaign-lab-local-approval-check.mjs `
 *     --url http://localhost:3100 `
 *     --out .local/campaign-lab-local-approval/evidence
 */
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

const root = process.cwd();
const { values: cli } = parseArgs({
  options: {
    url: { type: "string", short: "u", default: "http://localhost:3100" },
    out: { type: "string", short: "o" },
    headed: { type: "boolean", default: false },
  },
});

const PACKSHOT = path.join(root, "public", "campaign-assets", "harbor-field-bottle.webp");
const PRODUCT_NAME = "Harbor Field travel bottle";
const OFFER = "20% off, 27-30 November 2026";
const DIRECT_URL = "https://example.com/harbor-field";
const SEARCH_URL = "https://www.amazon.com/s?k=Harbor+Field+travel+bottle";
const INVALID_URL = "not-a-url";
const RIGHTS = "Client-approved for web and paid social.";

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

async function loadPlaywright() {
  const candidates = [
    process.env.CAMPAIGN_LAB_PLAYWRIGHT,
    path.join(root, "scripts", "framework-prototype", "browser-tools", "node_modules", "playwright", "index.mjs"),
    path.join(root, ".a20-fixture", "mobile-performance-tools", "node_modules", "playwright", "index.mjs"),
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue;
    return { module: await import(pathToFileURL(candidate).href), source: candidate };
  }
  return { module: await import("playwright"), source: "playwright (resolved package)" };
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

async function fillIntakeBase(page) {
  await page.getByLabel("Brand name", { exact: true }).fill("Harbor Field");
  await page.getByLabel("Product name", { exact: true }).fill(PRODUCT_NAME);
  await page.getByLabel("Offer", { exact: true }).fill(OFFER);
  const labels = page.getByLabel("Label", { exact: true });
  const values = page.getByLabel("Approved value", { exact: true });
  await labels.nth(0).fill("Capacity");
  await values.nth(0).fill("500 ml");
  await labels.nth(1).fill("Closure");
  await values.nth(1).fill("Screw cap");
  await page.getByLabel("Product image", { exact: true }).setInputFiles(PACKSHOT);
  await page.getByText(/SHA-256 recorded/).waitFor({ state: "visible", timeout: 15_000 });
  await page.getByLabel("Alt text", { exact: true }).fill("Graphite travel bottle on a warm studio backdrop.");
  await page.getByLabel("Usage rights", { exact: true }).fill(RIGHTS);
  const confirmations = page.locator('input[type="checkbox"]');
  await confirmations.nth(0).check();
  await confirmations.nth(2).check();
}

async function setDestination(page, value, confirmed) {
  await page.getByLabel("Destination URL", { exact: true }).fill(value);
  const checkbox = page.locator('input[type="checkbox"]').nth(1);
  if (confirmed) await checkbox.check();
  else await checkbox.uncheck();
  await page.waitForTimeout(200);
}

async function readIntakeState(page) {
  return page.evaluate(() => {
    const summary = document.querySelector("[data-intake-verification]");
    const card = (name) => {
      const node = summary?.querySelector(`[data-verification-card="${name}"]`);
      return {
        label: node?.getAttribute("data-verification-label") ?? null,
        text: node?.innerText ?? null,
      };
    };
    return {
      offerVerification: summary?.getAttribute("data-offer-verification") ?? null,
      destinationVerification: summary?.getAttribute("data-destination-verification") ?? null,
      rightsVerification: summary?.getAttribute("data-rights-verification") ?? null,
      destinationValue: summary?.getAttribute("data-destination-value") ?? null,
      cards: {
        offer: card("offer"),
        destination: card("destination"),
        media: card("media"),
      },
      confirmationsChecked: [...document.querySelectorAll('input[type="checkbox"]')].map(
        (input) => input.checked,
      ),
    };
  });
}

async function readFlowState(page) {
  return page.evaluate(() => {
    const section = document.querySelector("section[data-preview-status]");
    const canvas = document.querySelector("[data-preview-canvas]");
    const panel = document.querySelector("[data-approval-scope]");
    const revisionSpan = section?.querySelector("[data-approved]");
    const reviewStatus = panel?.querySelector('[id$="-review-status"]');
    const previewStatus = section?.querySelector('[id$="-campaign-preview-status"]');
    const pending = document.querySelector("[data-intake-pending]");
    const footer = canvas?.querySelector("footer");
    const approve = [...document.querySelectorAll("button")].find((button) =>
      button.textContent?.trim().startsWith("Approve preview"),
    );
    return {
      revision: section?.getAttribute("data-revision") ?? null,
      previewStatus: section?.getAttribute("data-preview-status") ?? null,
      previewVerification: section?.getAttribute("data-preview-verification") ?? null,
      dirty: section?.getAttribute("data-preview-dirty") ?? null,
      generationStatus: section?.getAttribute("data-generation-status") ?? null,
      approval: panel?.getAttribute("data-local-preview-approval") ?? null,
      approvalRevision: panel?.getAttribute("data-approval-revision") ?? null,
      approvalScope: panel?.getAttribute("data-approval-scope") ?? null,
      approvedAttribute: revisionSpan?.getAttribute("data-approved") ?? null,
      approvedRevision: revisionSpan?.getAttribute("data-approved-revision") ?? null,
      reviewBadge: panel?.querySelector("span")?.textContent?.trim() ?? null,
      reviewText: reviewStatus?.textContent?.replace(/\s+/g, " ").trim() ?? null,
      previewStatusText: previewStatus?.textContent?.replace(/\s+/g, " ").trim() ?? null,
      previewLabel: footer?.textContent?.replace(/\s+/g, " ").trim() ?? null,
      pendingText: pending?.innerText?.replace(/\s+/g, " ").trim() ?? null,
      approveText: approve?.textContent?.replace(/\s+/g, " ").trim() ?? null,
      approveDisabled: approve?.disabled ?? null,
      documentScrollWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
      canvasScrollWidth: canvas?.scrollWidth ?? null,
      canvasClientWidth: canvas?.clientWidth ?? null,
    };
  });
}

async function waitForButtonEnabled(page, name) {
  await page.waitForFunction(
    (label) => {
      const button = [...document.querySelectorAll("button")].find(
        (candidate) => candidate.textContent?.trim() === label,
      );
      return Boolean(button) && !button.disabled;
    },
    name,
    { timeout: 30_000 },
  );
}

async function waitForGeneration(page) {
  await page.waitForFunction(
    () => {
      const section = document.querySelector("section[data-preview-status]");
      const status = section?.getAttribute("data-generation-status");
      return status === "generated" || status === "fallback";
    },
    null,
    { timeout: 30_000 },
  );
  await page.waitForTimeout(400);
}

async function capture(page, out, name, width, selector = null) {
  if (selector) {
    await page.locator(selector).first().screenshot({
      path: path.join(out, `${name}-${width}.png`),
    });
    return;
  }
  await page.screenshot({
    path: path.join(out, `${name}-${width}.png`),
    fullPage: true,
  });
}

async function main() {
  if (!existsSync(PACKSHOT)) throw new Error(`Packshot not found: ${PACKSHOT}`);
  const out = cli.out
    ? path.resolve(root, cli.out)
    : path.join(root, ".local", "campaign-lab-local-approval", timestamp());
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
    viewports: [375, 1440],
    states: {},
    checks: [],
  };

  for (const width of report.viewports) {
    const page = await browser.newPage({
      viewport: { width, height: width === 375 ? 900 : 1000 },
      deviceScaleFactor: 1,
    });
    const errors = [];
    page.on("console", (message) => {
      if (message.type() === "error" && !message.text().includes("WebSocket")) {
        errors.push(message.text());
      }
    });
    page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));

    await page.goto(new URL("/campaign-lab/offer", cli.url).href, {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    await page.getByRole("heading", { name: "Offer intake", exact: true }).waitFor();
    await page.waitForFunction(
      () => {
        const input = document.querySelector('input[type="file"][data-packshot-input]');
        return (
          Boolean(input) &&
          Object.keys(input).some((key) => key.startsWith("__reactProps$"))
        );
      },
      null,
      { timeout: 30_000 },
    );
    await page.addStyleTag({ content: "nextjs-portal{display:none!important}" }).catch(() => {});
    const cookieDismiss = page.getByRole("button", { name: "Got it", exact: true });
    if (await cookieDismiss.count()) await cookieDismiss.click().catch(() => {});
    await fillIntakeBase(page);

    const intakeCases = [
      {
        id: "unconfirmed-direct",
        url: DIRECT_URL,
        confirmed: false,
        expected: "unconfirmed",
        label: "Direct URL · unconfirmed",
      },
      {
        id: "amazon-search",
        url: SEARCH_URL,
        confirmed: true,
        expected: "search",
        label: "Amazon/search placeholder · provisional",
      },
      {
        id: "invalid",
        url: INVALID_URL,
        confirmed: false,
        expected: "invalid",
        label: "Destination invalid",
      },
      {
        id: "confirmed-direct",
        url: DIRECT_URL,
        confirmed: true,
        expected: "direct",
        label: "Direct URL · confirmed",
      },
    ];

    const intakeStates = {};
    for (const entry of intakeCases) {
      await setDestination(page, entry.url, entry.confirmed);
      const state = await readIntakeState(page);
      intakeStates[entry.id] = state;
      check(
        report,
        `${width}:intake-${entry.id}`,
        state.destinationVerification === entry.expected &&
          state.cards.destination.label === entry.label,
        {
          verification: state.destinationVerification,
          label: state.cards.destination.label,
        },
        { verification: entry.expected, label: entry.label },
      );
      await capture(page, out, `intake-${entry.id}`, width);
      await capture(page, out, `intake-${entry.id}-card`, width, '[data-verification-card="destination"]');
    }
    check(
      report,
      `${width}:intake-search-stays-provisional-when-confirmed`,
      intakeStates["amazon-search"].destinationVerification === "search" &&
        intakeStates["amazon-search"].cards.destination.text.includes("provisional"),
      intakeStates["amazon-search"].cards.destination,
      "search placeholder remains provisional even after confirmation",
    );
    check(
      report,
      `${width}:intake-confirmed-direct-is-distinct`,
      intakeStates["confirmed-direct"].destinationVerification === "direct" &&
        intakeStates["confirmed-direct"].cards.destination.label === "Direct URL · confirmed",
      intakeStates["confirmed-direct"].cards.destination,
      "Direct URL · confirmed",
    );

    await page.getByRole("button", { name: "Open Campaign Lab preview", exact: true }).click();
    await page.getByRole("button", { name: "Generate preview", exact: true }).waitFor({
      state: "visible",
      timeout: 30_000,
    });
    await waitForButtonEnabled(page, "Generate preview");

    await page.getByRole("button", { name: "Generate preview", exact: true }).click();
    await waitForGeneration(page);
    const generated = await readFlowState(page);
    await capture(page, out, "flow-01-generated", width);
    check(
      report,
      `${width}:generated-before-approval`,
      generated.approval === "false" &&
        generated.approvedAttribute === "false" &&
        generated.approveText === "Approve preview locally",
      generated,
      "unapproved generated preview with the local-only approval button",
    );

    await page.getByLabel("Offer", { exact: true }).fill("25% off, members only");
    await page.locator("[data-intake-pending]").waitFor({ state: "visible", timeout: 10_000 });
    const editing = await readFlowState(page);
    await capture(page, out, "flow-02-editing-pending", width);
    check(
      report,
      `${width}:editing-pending`,
      editing.dirty === "true" &&
        editing.pendingText?.includes("Pending edits") &&
        editing.approval === "false" &&
        editing.revision === generated.revision,
      editing,
      "pending edits keep the old preview revision and clear approval",
    );

    await waitForButtonEnabled(page, "Generate preview");
    await page.getByRole("button", { name: "Generate preview", exact: true }).click();
    await waitForGeneration(page);
    const edited = await readFlowState(page);
    await capture(page, out, "flow-03-edited-generated", width);
    check(
      report,
      `${width}:edited-revision`,
      edited.revision !== generated.revision &&
        edited.dirty === "false" &&
        edited.approval === "false" &&
        edited.previewStatusText?.includes("Preview ready for local review"),
      edited,
      "fresh revision is generated and remains unapproved",
    );

    await waitForButtonEnabled(page, "Approve preview locally");
    await page.getByRole("button", { name: "Approve preview locally", exact: true }).click();
    await page.waitForFunction(
      () =>
        document
          .querySelector("[data-approval-scope]")
          ?.getAttribute("data-local-preview-approval") === "true",
      null,
      { timeout: 10_000 },
    );
    const approved = await readFlowState(page);
    await capture(page, out, "flow-04-approved-local", width);
    await capture(page, out, "flow-04-approval-panel", width, "[data-approval-scope]");
    check(
      report,
      `${width}:approval-is-local-to-preview`,
      approved.approval === "true" &&
        approved.approvalScope === "local-preview" &&
        approved.approvalRevision === approved.revision &&
        approved.approvedRevision === approved.revision &&
        approved.reviewBadge === "Local preview approval" &&
        approved.reviewText?.includes("Local preview approval recorded") &&
        approved.reviewText?.includes("Not publication approval") &&
        approved.previewStatusText?.includes("this is not publication approval") &&
        approved.approveText === "Approve preview locally",
      approved,
      "recorded status and button both identify a local preview approval",
    );

    await page.getByLabel("Offer", { exact: true }).fill("15% off, members only");
    await page.waitForFunction(
      () =>
        document
          .querySelector("[data-approval-scope]")
          ?.getAttribute("data-local-preview-approval") === "false",
      null,
      { timeout: 10_000 },
    );
    const cleared = await readFlowState(page);
    await capture(page, out, "flow-05-approval-cleared-by-edit", width);
    check(
      report,
      `${width}:edit-clears-exact-revision-approval`,
      cleared.approval === "false" &&
        cleared.approvedAttribute === "false" &&
        cleared.dirty === "true" &&
        cleared.revision === approved.revision,
      cleared,
      "editing keeps the approved revision visible but clears its local approval",
    );

    await page.getByLabel("Destination URL", { exact: true }).fill(SEARCH_URL);
    await waitForButtonEnabled(page, "Generate preview");
    await page.getByRole("button", { name: "Generate preview", exact: true }).click();
    await waitForGeneration(page);
    await page.waitForFunction(
      () =>
        document
          .querySelector("section[data-preview-status]")
          ?.getAttribute("data-preview-status") === "preview",
      null,
      { timeout: 10_000 },
    );
    await page.waitForFunction(
      () => document.querySelector("[data-preview-canvas] footer")?.textContent?.includes("destination provisional"),
      null,
      { timeout: 10_000 },
    );
    const provisional = await readFlowState(page);
    await capture(page, out, "flow-06-provisional-preview", width);
    await capture(page, out, "flow-06-provisional-footer", width, "[data-preview-canvas] footer");
    check(
      report,
      `${width}:provisional-notice-retained`,
      provisional.previewStatus === "preview" &&
        provisional.previewVerification === "provisional" &&
        provisional.previewLabel?.includes("destination provisional") &&
        provisional.approval === "false",
      provisional,
      "Amazon search destination keeps the provisional notice on the rendered preview",
    );

    await waitForButtonEnabled(page, "Approve preview locally");
    await page.getByRole("button", { name: "Approve preview locally", exact: true }).click();
    await page.waitForFunction(
      () =>
        document
          .querySelector("[data-approval-scope]")
          ?.getAttribute("data-local-preview-approval") === "true",
      null,
      { timeout: 10_000 },
    );
    const provisionalApproved = await readFlowState(page);
    await capture(page, out, "flow-07-provisional-approved-local", width);
    check(
      report,
      `${width}:provisional-can-still-be-approved-locally`,
      provisionalApproved.approval === "true" &&
        provisionalApproved.previewStatus === "preview" &&
        provisionalApproved.previewLabel?.includes("destination provisional") &&
        provisionalApproved.reviewText?.includes("Local preview approval recorded"),
      provisionalApproved,
      "local preview approval does not erase the provisional destination notice",
    );

    check(
      report,
      `${width}:no-horizontal-overflow`,
      approved.documentScrollWidth === width &&
        approved.viewportWidth === width &&
        approved.canvasScrollWidth === approved.canvasClientWidth,
      approved,
      "document and preview canvas widths match the viewport",
    );
    check(report, `${width}:console`, errors.length === 0, errors, "no console errors");

    report.states[width] = {
      intake: intakeStates,
      generated,
      editing,
      edited,
      approved,
      cleared,
      provisional,
      provisionalApproved,
      consoleErrors: errors,
    };
    await page.close();
  }

  await browser.close();
  const failed = report.checks.filter((item) => !item.passed);
  report.status = failed.length === 0 ? "passed" : "failed";
  report.failed = failed;
  writeFileSync(path.join(out, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(
    JSON.stringify(
      {
        status: report.status,
        out: report.out,
        checks: report.checks.length,
        failed: failed.length,
        failures: failed,
        browser: report.browserVersion,
      },
      null,
      2,
    ),
  );
  return failed.length === 0 ? 0 : 1;
}

process.exitCode = await main();
