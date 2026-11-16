#!/usr/bin/env node
/**
 * Focused browser acceptance checks for the Campaign Lab advertorial review
 * round. Each case is reported separately so a passing fixture cannot hide a
 * failed recovery or stale-revision result.
 *
 * The runner drives only the public editor and generation API. It can start its
 * own development server per pilot, or run against an existing URL:
 *
 *   node scripts/campaign-lab-review-acceptance.mjs
 *   node scripts/campaign-lab-review-acceptance.mjs --url http://127.0.0.1:3100 --pilot review-four-facts --only capacity
 *
 * Artifacts stay under `.local/campaign-lab-review/<timestamp>/`.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixturesRoot = path.join(root, "tests", "fixtures", "campaign-lab", "pilots");
const localPilotRoot = path.join(root, ".local", "campaign-lab-pilots");

const { values: cli } = parseArgs({
  options: {
    url: { type: "string", short: "u" },
    pilot: { type: "string" },
    port: { type: "string", default: "3210" },
    out: { type: "string" },
    only: { type: "string", multiple: true, default: [] },
    headed: { type: "boolean", default: false },
    "no-prepare": { type: "boolean", default: false },
    "keep-server": { type: "boolean", default: false },
    "real-brand": { type: "string", default: "momisa" },
  },
});

const requestedCases = cli.only
  .flatMap((entry) => entry.split(","))
  .map((entry) => entry.trim())
  .filter(Boolean);

const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const outDir = path.resolve(root, cli.out ?? path.join(".local", "campaign-lab-review", timestamp));
mkdirSync(outDir, { recursive: true });

const groups = [
  {
    id: "no-pilot",
    pilot: null,
    cases: ["images.delayed", "images.404", "images.recovery", "images.revision-switch", "failed-edit"],
  },
  {
    id: "review-four-facts",
    pilot: "review-four-facts",
    cases: ["capacity.direct-open", "capacity.recovery"],
  },
  { id: "review-long-label", pilot: "review-long-label", cases: ["long-label"] },
  { id: "review-distinct", pilot: "review-distinct", cases: ["distinct.both-formats"] },
];

const caseTitles = {
  "capacity.direct-open": "Schema-valid four-fact pilot opened directly",
  "capacity.recovery": "Capacity error recovery action",
  "failed-edit": "Failed edit after a valid preview",
  "images.delayed": "Required image delayed: approval while pending",
  "images.404": "Required image 404: approval after failure",
  "images.recovery": "Required image recovery after a failure",
  "images.revision-switch": "Revision switch while an old image request is pending",
  "long-label": "Long campaign label at 320 px",
  "distinct.both-formats": "Distinct-opening pilot in both formats",
  "real-brand.pending": "Real-brand two-layout intake",
};

const cases = [];
let browser;
let activeServer = null;

function selected(caseId) {
  return requestedCases.length === 0 || requestedCases.includes(caseId);
}

function startCase(id, meta = {}) {
  const entry = {
    id,
    title: caseTitles[id] ?? id,
    state: "running",
    startedAt: new Date().toISOString(),
    checks: [],
    captures: [],
    evidence: {},
    ...meta,
  };
  cases.push(entry);
  console.log(`\n[case] ${id}`);
  return entry;
}

function addCheck(entry, id, ok, detail, evidence = {}) {
  const state = ok === null ? "pending" : ok ? "passed" : "failed";
  entry.checks.push({ id, state, detail, evidence });
  console.log(`  ${state.padEnd(7)} ${id}: ${detail}`);
}

function finishCase(entry) {
  entry.finishedAt = new Date().toISOString();
  if (entry.checks.some((check) => check.state === "failed")) entry.state = "failed";
  else if (entry.checks.some((check) => check.state === "pending")) entry.state = "pending";
  else entry.state = "passed";
  console.log(`[result] ${entry.id}: ${entry.state}`);
}

function loadPlaywright() {
  const candidates = [
    process.env.CAMPAIGN_LAB_PLAYWRIGHT,
    path.join(root, "scripts", "framework-prototype", "browser-tools", "node_modules", "playwright", "index.mjs"),
    path.join(root, "scripts", "framework-browser-tools", "node_modules", "playwright", "index.mjs"),
    path.join(root, "node_modules", "playwright", "index.mjs"),
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (existsSync(candidate)) return import(pathToFileURL(candidate).href);
  }
  return import("playwright");
}

function chromiumExecutable(chromium) {
  if (process.env.CAMPAIGN_LAB_CHROMIUM) return process.env.CAMPAIGN_LAB_CHROMIUM;
  const bundled = chromium.executablePath();
  if (bundled && existsSync(bundled)) return bundled;
  const cache = process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, "ms-playwright") : null;
  if (cache && existsSync(cache)) {
    const version = readdirSync(cache)
      .filter((name) => /^chromium-\d+$/.test(name))
      .sort((left, right) => Number(right.split("-")[1]) - Number(left.split("-")[1]))[0];
    if (version) {
      for (const relative of [
        path.join(version, "chrome-win64", "chrome.exe"),
        path.join(version, "chrome-linux64", "chrome"),
      ]) {
        const candidate = path.join(cache, relative);
        if (existsSync(candidate)) return candidate;
      }
    }
  }
  return undefined;
}

function timeout(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(predicate, { timeoutMs = 15_000, intervalMs = 100, label = "condition" } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return true;
    await timeout(intervalMs);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

function fixtureUrl(base, fixture) {
  return `${base}/campaign-lab?fixture=${encodeURIComponent(fixture)}`;
}

async function postGenerate(base, fixtureId, values) {
  const response = await fetch(`${base}/api/campaign-lab/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fixtureId, values }),
  });
  return { status: response.status, body: await response.json().catch(() => null) };
}

async function readPageState(page) {
  return page.evaluate(() => {
    const region = document.querySelector("[data-preview-canvas]")?.closest("section[aria-labelledby]");
    const article = document.querySelector("[data-preview-canvas] article");
    const bySuffix = (suffix) =>
      Array.from(document.querySelectorAll("input, select, textarea")).find((control) =>
        control.id.endsWith(suffix),
      );
    const textOf = (node) => (node?.textContent ?? "").trim();
    const action = article?.querySelector("[data-advertorial-action], [data-role='action']");
    const images = Array.from(article?.querySelectorAll("img") ?? []).map((image) => ({
      src: image.getAttribute("src"),
      currentSrc: image.currentSrc,
      alt: image.getAttribute("alt"),
      complete: image.complete,
      naturalWidth: image.naturalWidth,
      naturalHeight: image.naturalHeight,
      assetId: image.closest("[data-asset-id]")?.getAttribute("data-asset-id") ?? null,
      role: image.closest("[data-asset-role]")?.getAttribute("data-asset-role") ?? null,
    }));
    const labelledButton = (name) =>
      Array.from(document.querySelectorAll("button")).find(
        (button) => button.textContent?.trim() === name,
      );
    const approve = labelledButton("Approve preview");
    const generate = labelledButton("Generate preview");
    return {
      url: location.href,
      title: document.title,
      responseText: document.body.innerText.slice(0, 4_000),
      hasEditor: Boolean(bySuffix("-format")) && Boolean(bySuffix("-offer")),
      format: bySuffix("-format")?.value ?? null,
      layout: bySuffix("-advertorial-layout")?.value ?? null,
      opening: bySuffix("-opening-focus")?.value ?? null,
      openingOptions: bySuffix("-opening-focus")
        ? Array.from(bySuffix("-opening-focus").options).map((option) => option.value)
        : [],
      brandId: bySuffix("-brand-style")?.value ?? null,
      accent: bySuffix("-accent")?.value ?? null,
      productName: bySuffix("-product-name")?.value ?? null,
      offer: bySuffix("-offer")?.value ?? null,
      destinationUrl: bySuffix("-destination-url")?.value ?? null,
      assetId: bySuffix("-product-image")?.value ?? null,
      region: region
        ? {
            fixture: region.getAttribute("data-fixture"),
            format: region.getAttribute("data-format"),
            layout: region.getAttribute("data-layout"),
            revision: region.getAttribute("data-revision"),
            template: region.getAttribute("data-template"),
            approved: region.querySelector("[data-approved]")?.getAttribute("data-approved") ?? null,
            sectionOrder: region.getAttribute("data-section-order")?.split(",").filter(Boolean) ?? [],
            factIds: region.getAttribute("data-fact-ids")?.split(",").filter(Boolean) ?? [],
            assetIds: region.getAttribute("data-asset-ids")?.split(",").filter(Boolean) ?? [],
            unusedAssetIds: region.getAttribute("data-unused-asset-ids")?.split(",").filter(Boolean) ?? [],
            generationStatus: region.getAttribute("data-generation-status"),
          }
        : null,
      article: article
        ? {
            headline: textOf(article.querySelector("h1")),
            productName: textOf(article.querySelector("h2")),
            offer: textOf(article.querySelector("[data-role='offer'] p")),
            actionLabel: action ? textOf(action).replace(/\s*\(opens[^)]*\)$/i, "").trim() : null,
            actionHref: action?.getAttribute("href") ?? null,
            factIds: Array.from(article.querySelectorAll("[data-fact-id]")).map((node) =>
              node.getAttribute("data-fact-id"),
            ),
            domAssetIds: Array.from(article.querySelectorAll("[data-asset-id]")).map((node) =>
              node.getAttribute("data-asset-id"),
            ),
            domRoles: Array.from(article.querySelectorAll("[data-asset-role]")).map((node) =>
              node.getAttribute("data-asset-role"),
            ),
            images,
            text: article.innerText.slice(0, 6_000),
          }
        : null,
      approve: approve
        ? {
            disabled: approve.disabled,
            busy: approve.getAttribute("aria-busy"),
            visible: approve.getClientRects().length > 0,
          }
        : null,
      generate: generate
        ? {
            disabled: generate.disabled,
            label: textOf(generate),
          }
        : null,
      documentOverflow:
        document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      documentWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      errorText: textOf(document.querySelector("[role='group'][aria-labelledby]")),
    };
  });
}

async function openFixture(page, base, fixture, { waitForImages = false } = {}) {
  const response = await page.goto(fixtureUrl(base, fixture), {
    waitUntil: "domcontentloaded",
    timeout: 45_000,
  });
  await page.waitForTimeout(250);
  // `useSyncExternalStore` reports the server snapshot first. Wait for the
  // client editor to enable Generate before reading any control state; a held
  // image must not be mistaken for a not-yet-hydrated button.
  const generateButton = page.getByRole("button", { name: /^Generate preview$/ });
  if ((await generateButton.count()) > 0) {
    await page
      .waitForFunction(
        () => {
          const button = Array.from(document.querySelectorAll("button")).find(
            (candidate) => candidate.textContent?.trim() === "Generate preview",
          );
          return Boolean(button) && !button.disabled;
        },
        { timeout: 15_000 },
      )
      .catch(() => {});
  }
  if (waitForImages) {
    await page
      .waitForFunction(
        () => {
          const images = Array.from(document.querySelectorAll("[data-preview-canvas] img"));
          return images.length > 0 && images.every((image) => image.complete);
        },
        { timeout: 12_000 },
      )
      .catch(() => {});
  }
  return { status: response?.status() ?? null };
}

async function generateAndSettle(page, { timeoutMs = 25_000 } = {}) {
  const button = page.getByRole("button", { name: /^Generate preview$/ }).first();
  await button.waitFor({ state: "visible", timeout: 10_000 });
  if (await button.isDisabled()) throw new Error("Generate preview is disabled");
  await button.click();
  await page.waitForTimeout(120);
  await page
    .waitForFunction(
      () => {
        const candidate = Array.from(document.querySelectorAll("button")).find(
          (button) => button.textContent?.trim() === "Generate preview",
        );
        return Boolean(candidate) && !candidate.disabled;
      },
      { timeout: timeoutMs },
    )
    .catch(() => {});
  await page.waitForTimeout(150);
}

async function approve(page) {
  const button = page.getByRole("button", { name: "Approve preview", exact: true });
  if (await button.isDisabled()) return false;
  await button.click();
  await page.waitForTimeout(200);
  return true;
}

async function waitForApproveEnabled(page, timeoutMs = 6_000) {
  return page
    .waitForFunction(
      () => {
        const button = Array.from(document.querySelectorAll("button")).find(
          (candidate) => candidate.textContent?.trim() === "Approve preview",
        );
        return Boolean(button) && !button.disabled;
      },
      { timeout: timeoutMs },
    )
    .then(() => true)
    .catch(() => false);
}

async function capture(page, entry, name, { fullPage = true } = {}) {
  const relative = path.join("captures", `${entry.id.replace(/[^a-z0-9.-]+/gi, "-")}-${name}.png`);
  const absolute = path.join(outDir, relative);
  mkdirSync(path.dirname(absolute), { recursive: true });
  await page.screenshot({ path: absolute, fullPage, animations: "disabled" }).catch(async () => {
    await page.screenshot({ path: absolute, fullPage: false, animations: "disabled" });
  });
  entry.captures.push(relative);
  return relative;
}

function visibleTextMatches(text, patterns) {
  return patterns.every((pattern) => pattern.test(text));
}

function createImageController(page) {
  const pending = [];
  const requests = [];
  const rules = [];

  page.route(/(?:campaign-assets|campaign-lab-pilots)\//, async (route) => {
    const url = route.request().url();
    requests.push({ url, at: Date.now() });
    const rule = [...rules].reverse().find((candidate) => candidate.match(url));
    const mode = rule?.mode ?? "pass";
    if (mode === "hold") {
      await new Promise((resolve) => {
        pending.push({ url, route, resolve, mode });
      });
      return;
    }
    if (mode === "fail") {
      await route.fulfill({ status: 404, contentType: "text/plain", body: "synthetic image 404" });
      return;
    }
    await route.continue();
  });

  return {
    requests,
    pending,
    hold(match) {
      rules.push({ match, mode: "hold" });
    },
    fail(match) {
      rules.push({ match, mode: "fail" });
    },
    pass(match = () => true) {
      rules.push({ match, mode: "pass" });
    },
    async waitForPending(match = () => true, timeoutMs = 20_000) {
      const found = await waitFor(
        () => pending.some((entry) => match(entry.url)),
        { timeoutMs, label: "an image request to be held" },
      ).catch(() => false);
      return found ? pending.find((entry) => match(entry.url)) : null;
    },
    async respond(match, outcome = "continue") {
      const index = pending.findIndex((entry) => match(entry.url));
      if (index < 0) return false;
      const [entry] = pending.splice(index, 1);
      try {
        if (outcome === "fail") {
          await entry.route.fulfill({ status: 404, contentType: "text/plain", body: "synthetic image 404" });
        } else {
          await entry.route.continue();
        }
      } catch {
        // The browser can cancel a request when the article remounts. The
        // approval assertion still matters; the cancellation is recorded.
      }
      entry.resolve();
      return true;
    },
    async releaseAll(outcome = "continue") {
      while (pending.length > 0) {
        await this.respond(() => true, outcome);
      }
    },
  };
}

function expectedValues(manifest, overrides = {}) {
  const fixture = manifest.fixture;
  const format = fixture.brief.advertorial ? "advertorial" : "offer";
  return {
    brandId: manifest.brand.id,
    accent: manifest.brand.tokens.accent,
    productName: fixture.brief.productName,
    offer: fixture.brief.offer,
    destinationUrl: fixture.brief.destinationUrl,
    assetId: fixture.brief.advertorial
      ? fixture.brief.advertorial.assetAssignments.find((assignment) => assignment.role === "product-hero")
          ?.assetId
      : manifest.assets.find((asset) => asset.role === "product-hero")?.id,
    openingFocus: fixture.brief.advertorial
      ? fixture.brief.advertorial.openings[0]?.id
      : fixture.openings?.[0]?.id,
    format,
    advertorialLayout: "auto",
    ...overrides,
  };
}

function readManifest(id) {
  const manifestPath = path.join(fixturesRoot, id, "manifest.json");
  if (!existsSync(manifestPath)) throw new Error(`Synthetic pilot manifest missing: ${manifestPath}`);
  return JSON.parse(readFileSync(manifestPath, "utf8"));
}

async function runCapacityDirect(browserInstance, base) {
  const manifest = readManifest("review-four-facts");
  const entry = startCase("capacity.direct-open", { target: base });
  const context = await browserInstance.newContext({
    viewport: { width: 1440, height: 900 },
    serviceWorkers: "block",
    reducedMotion: "reduce",
    locale: "en-US",
    timezoneId: "UTC",
  });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));
  try {
    const response = await openFixture(page, base, "review-four-facts");
    const state = await readPageState(page);
    entry.evidence = {
      status: response.status,
      hasEditor: state.hasEditor,
      bodySnippet: state.responseText.slice(0, 1_200),
      consoleErrors: consoleErrors.slice(0, 5),
    };
    await capture(page, entry, "direct-open");
    addCheck(
      entry,
      "page-response-successful",
      response.status !== null && response.status >= 200 && response.status < 400,
      `Editor request returned HTTP ${response.status}.`,
      { status: response.status },
    );
    addCheck(
      entry,
      "editor-responds",
      state.hasEditor,
      state.hasEditor
        ? "The editor form is rendered without a server error."
        : "The editor form was not rendered.",
      { hasEditor: state.hasEditor, hasPreviewRegion: state.region !== null },
    );
    const capacityText = state.responseText;
    addCheck(
      entry,
      "capacity-error-visible",
      visibleTextMatches(capacityText, [
        /the rib design/i,
        /\b4\b[\s\S]{0,80}facts|\bfacts\b[\s\S]{0,80}\b4\b/i,
        /at most\s*3|can present at most 3|capacity/i,
        /whole group|compatible layout|single-product offer/i,
      ]),
      "The editor explains the required group is larger than the layout capacity.",
      { errorText: capacityText.slice(0, 2_000) },
    );
    addCheck(
      entry,
      "required-group-retained",
      !state.article || ["interior", "outlet", "body", "finish"].every((id) => state.article.factIds.includes(id)),
      state.article
        ? "Any rendered preview keeps every fact in the required group."
        : "No truncated preview is shown while the group is rejected.",
      { factIds: state.article?.factIds ?? [] },
    );
    const recovery = page.locator("button, a").filter({
      hasText: /single-product offer|use .*offer|recover|choose .*layout/i,
    });
    const recoveryCount = await recovery.count();
    addCheck(
      entry,
      "recovery-action-visible",
      recoveryCount > 0 && (await recovery.first().isVisible()),
      recoveryCount > 0
        ? `A recovery action is visible: "${(await recovery.first().innerText()).trim()}".`
        : "No recovery action was offered.",
      { recoveryCount },
    );
    const api = await postGenerate(base, "review-four-facts", expectedValues(manifest));
    addCheck(
      entry,
      "api-rejects-over-capacity-group",
      api.status === 422 &&
        api.body?.issues?.some(
          (issue) => /the rib design/i.test(issue.message) && /\b4\b/.test(issue.message) && /at most\s*3/i.test(issue.message),
        ),
      "The generation API rejects the over-capacity group without a preview.",
      { status: api.status, issues: api.body?.issues },
    );
  } catch (error) {
    entry.evidence.error = error instanceof Error ? error.message : String(error);
    addCheck(entry, "case-completed", false, `The case could not complete: ${entry.evidence.error}`);
  } finally {
    await context.close();
    finishCase(entry);
  }
}

async function runCapacityRecovery(browserInstance, base) {
  const entry = startCase("capacity.recovery", { target: base });
  const context = await browserInstance.newContext({
    viewport: { width: 1440, height: 900 },
    serviceWorkers: "block",
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  try {
    await openFixture(page, base, "review-four-facts");
    const before = await readPageState(page);
    const recovery = page.locator("button, a").filter({
      hasText: /single-product offer|use .*offer|recover|choose .*layout/i,
    });
    const available = (await recovery.count()) > 0 && (await recovery.first().isVisible());
    addCheck(
      entry,
      "recovery-action-available",
      available,
      available ? "The capacity error offers a recovery action." : "The capacity error offers no recovery action.",
    );
    if (available) {
      const label = (await recovery.first().innerText()).trim();
      await recovery.first().click();
      await page.waitForTimeout(500);
      const after = await readPageState(page);
      entry.evidence = {
        action: label,
        before: { hasEditor: before.hasEditor, error: before.errorText },
        after: {
          hasEditor: after.hasEditor,
          format: after.format,
          region: after.region,
          error: after.errorText,
          facts: after.article?.factIds ?? [],
        },
      };
      await capture(page, entry, "after-recovery");
      addCheck(
        entry,
        "recovery-action-responds",
        after.hasEditor,
        after.hasEditor
          ? "The editor remains usable after the recovery action."
          : "The editor failed after the recovery action.",
      );
      addCheck(
        entry,
        "recovery-does-not-truncate",
        !after.article || ["interior", "outlet", "body", "finish"].every((id) => after.article.factIds.includes(id)),
        after.article
          ? "A recovered preview still carries the whole required group."
          : "The recovery path keeps an explicit error instead of rendering a partial group.",
        { factIds: after.article?.factIds ?? [] },
      );
      addCheck(
        entry,
        "recovery-outcome-visible",
        Boolean(after.article) ||
          /the rib design/i.test(after.errorText) ||
          /the rib design/i.test(after.responseText),
        "The recovery either renders a complete preview or keeps the capacity error visible.",
        { format: after.format, hasPreview: Boolean(after.article) },
      );
    }
  } catch (error) {
    entry.evidence.error = error instanceof Error ? error.message : String(error);
    addCheck(entry, "case-completed", false, `The case could not complete: ${entry.evidence.error}`);
  } finally {
    await context.close();
    finishCase(entry);
  }
}

async function runFailedEdit(browserInstance, base) {
  const entry = startCase("failed-edit", { target: base });
  const context = await browserInstance.newContext({
    viewport: { width: 1440, height: 900 },
    serviceWorkers: "block",
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  try {
    const response = await openFixture(page, base, "morrow-advertorial-full", { waitForImages: true });
    const initial = await readPageState(page);
    addCheck(
      entry,
      "valid-preview-before-edit",
      response.status === 200 && Boolean(initial.article) && Boolean(initial.region?.revision),
      "A valid advertorial preview is available before the failed edit.",
      { status: response.status, revision: initial.region?.revision },
    );
    await generateAndSettle(page);
    const generated = await readPageState(page);
    const approved = await approve(page);
    const approvedState = await readPageState(page);
    addCheck(
      entry,
      "valid-preview-approved",
      approved && approvedState.region?.approved === "true",
      "The valid preview can be approved before the failed edit.",
      { approved: approvedState.region?.approved },
    );
    await capture(page, entry, "valid-approved");

    const offerField = page.getByLabel("Offer", { exact: true });
    const originalOffer = await offerField.inputValue();
    await offerField.fill("");
    await generateAndSettle(page);
    const failed = await readPageState(page);
    entry.evidence = {
      beforeRevision: generated.region?.revision,
      afterRevision: failed.region?.revision,
      failedError: failed.errorText || failed.responseText.slice(0, 1_500),
      failedFacts: failed.article?.factIds ?? [],
    };
    await capture(page, entry, "failed-edit");
    addCheck(
      entry,
      "failed-edit-error-visible",
      /Preview not generated|Add the approved offer|offer/i.test(failed.errorText) ||
        /Preview not generated|Add the approved offer/i.test(failed.responseText),
      "The failed edit shows a validation error.",
      { errorText: failed.errorText || failed.responseText.slice(0, 1_200) },
    );
    addCheck(
      entry,
      "last-valid-preview-retained",
      failed.region?.revision === generated.region?.revision &&
        Boolean(failed.article) &&
        JSON.stringify(failed.article?.factIds) === JSON.stringify(generated.article?.factIds) &&
        failed.article?.actionHref === generated.article?.actionHref,
      "The last valid revision, facts and exact action remain rendered.",
      {
        beforeRevision: generated.region?.revision,
        afterRevision: failed.region?.revision,
        beforeFacts: generated.article?.factIds,
        afterFacts: failed.article?.factIds,
      },
    );
    addCheck(
      entry,
      "approval-cleared-and-blocked",
      failed.region?.approved === "false" && failed.approve?.disabled === true,
      "Approval is cleared and blocked while the edit is invalid.",
      { approved: failed.region?.approved, approveDisabled: failed.approve?.disabled },
    );
    const recoveryLink = page.getByRole("link", { name: /Add the approved offer|offer/i });
    const recoveryAvailable = (await recoveryLink.count()) > 0 && (await recoveryLink.first().isVisible());
    addCheck(
      entry,
      "failed-edit-recovery-action",
      recoveryAvailable,
      recoveryAvailable
        ? "The error summary links back to the field that needs attention."
        : "The failed edit offers no visible recovery link.",
    );
    await offerField.fill(originalOffer);
    await generateAndSettle(page);
    const recovered = await readPageState(page);
    addCheck(
      entry,
      "failed-edit-recovers",
      Boolean(recovered.article) &&
        recovered.region?.approved === "false" &&
        recovered.approve?.disabled === false,
      "Correcting the field restores a fresh, approvable preview.",
      { revision: recovered.region?.revision, approveDisabled: recovered.approve?.disabled },
    );
    await capture(page, entry, "recovered");
  } catch (error) {
    entry.evidence.error = error instanceof Error ? error.message : String(error);
    addCheck(entry, "case-completed", false, `The case could not complete: ${entry.evidence.error}`);
  } finally {
    await context.close();
    finishCase(entry);
  }
}

function imageState(state) {
  const image = state.article?.images?.[0];
  return {
    exists: Boolean(image),
    complete: image?.complete ?? null,
    naturalWidth: image?.naturalWidth ?? null,
    src: image?.src ?? null,
    alt: image?.alt ?? null,
  };
}

async function runImageDelayed(browserInstance, base) {
  const entry = startCase("images.delayed", { target: base });
  const context = await browserInstance.newContext({
    viewport: { width: 1440, height: 900 },
    serviceWorkers: "block",
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  const controller = createImageController(page);
  const imageMatch = (url) => /morrow-ceramic-dripper\.webp/.test(url);
  controller.hold(imageMatch);
  try {
    const response = await openFixture(page, base, "morrow-advertorial-one-photo");
    const pending = await controller.waitForPending(imageMatch);
    const pendingState = await readPageState(page);
    entry.evidence = {
      status: response.status,
      imageRequest: pending?.url ?? null,
      pendingRequests: controller.requests,
      image: imageState(pendingState),
    };
    await capture(page, entry, "pending");
    addCheck(
      entry,
      "required-image-request-held",
      Boolean(pending),
      pending ? "The required product image request is held open." : "The required product image request was not observed.",
      { request: pending?.url ?? null },
    );
    addCheck(
      entry,
      "approval-blocked-while-image-pending",
      pendingState.approve?.disabled === true && pendingState.region?.approved !== "true",
      pendingState.approve?.disabled
        ? "Approval is blocked while the required image is pending."
        : "Approval is available while the required image is pending.",
      { approveDisabled: pendingState.approve?.disabled, approved: pendingState.region?.approved },
    );
    await controller.respond(imageMatch, "continue");
    await page
      .waitForFunction(
        () => {
          const image = document.querySelector("[data-preview-canvas] img");
          return image && image.complete && image.naturalWidth > 0;
        },
        { timeout: 15_000 },
      )
      .catch(() => {});
    const loadedState = await readPageState(page);
    const enabledAfterLoad = await waitForApproveEnabled(page);
    const settledState = enabledAfterLoad ? await readPageState(page) : loadedState;
    addCheck(
      entry,
      "approval-enabled-after-delayed-load",
      imageState(settledState).naturalWidth > 0 && settledState.approve?.disabled === false,
      "The delayed image loads and approval becomes available.",
      { image: imageState(settledState), approveDisabled: settledState.approve?.disabled },
    );
    await capture(page, entry, "loaded");
  } catch (error) {
    entry.evidence.error = error instanceof Error ? error.message : String(error);
    addCheck(entry, "case-completed", false, `The case could not complete: ${entry.evidence.error}`);
  } finally {
    await controller.releaseAll();
    await context.close();
    finishCase(entry);
  }
}

async function runImage404(browserInstance, base) {
  const entry = startCase("images.404", { target: base });
  const context = await browserInstance.newContext({
    viewport: { width: 1440, height: 900 },
    serviceWorkers: "block",
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  const controller = createImageController(page);
  const imageMatch = (url) => /morrow-ceramic-dripper\.webp/.test(url);
  controller.hold(imageMatch);
  try {
    await openFixture(page, base, "morrow-advertorial-one-photo");
    const pending = await controller.waitForPending(imageMatch);
    await controller.respond(imageMatch, "fail");
    await page
      .waitForFunction(
        () => {
          const image = document.querySelector("[data-preview-canvas] img");
          return image && image.complete;
        },
        { timeout: 12_000 },
      )
      .catch(() => {});
    const failedState = await readPageState(page);
    entry.evidence = {
      imageRequest: pending?.url ?? null,
      image: imageState(failedState),
      approveDisabled: failedState.approve?.disabled,
      approved: failedState.region?.approved,
      responseText: failedState.responseText.slice(0, 1_500),
    };
    await capture(page, entry, "failed");
    addCheck(
      entry,
      "required-image-404-observed",
      imageState(failedState).complete === true && imageState(failedState).naturalWidth === 0,
      "The required image request returned 404 and the image has no rendered pixels.",
      { image: imageState(failedState) },
    );
    addCheck(
      entry,
      "approval-blocked-after-image-failure",
      failedState.approve?.disabled === true && failedState.region?.approved !== "true",
      failedState.approve?.disabled
        ? "Approval is blocked after the required image fails."
        : "Approval remains available after the required image fails.",
      { approveDisabled: failedState.approve?.disabled, approved: failedState.region?.approved },
    );
    addCheck(
      entry,
      "image-failure-communicated",
      /(?:could not|couldn't|failed|unable) to load|image (?:failed|did not load|is unavailable|unavailable)|retry|try again|reload image|required image[^.]{0,60}(?:failed|missing|unavailable)/i.test(
        failedState.responseText,
      ),
      "The editor tells the operator that a required image did not load.",
      { text: failedState.responseText.slice(0, 1_200) },
    );
    entry.evidence.canRetry = (await page.locator("button, a").filter({ hasText: /retry|try again|reload image/i }).count()) > 0;
  } catch (error) {
    entry.evidence.error = error instanceof Error ? error.message : String(error);
    addCheck(entry, "case-completed", false, `The case could not complete: ${entry.evidence.error}`);
  } finally {
    await controller.releaseAll();
    await context.close();
    finishCase(entry);
  }
}

async function runImageRecovery(browserInstance, base) {
  const entry = startCase("images.recovery", { target: base });
  const context = await browserInstance.newContext({
    viewport: { width: 1440, height: 900 },
    serviceWorkers: "block",
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  const controller = createImageController(page);
  const imageMatch = (url) => /morrow-ceramic-dripper\.webp/.test(url);
  controller.hold(imageMatch);
  try {
    await openFixture(page, base, "morrow-advertorial-one-photo");
    await controller.waitForPending(imageMatch);
    await controller.respond(imageMatch, "fail");
    await page
      .waitForFunction(
        () => {
          const image = document.querySelector("[data-preview-canvas] img");
          return image && image.complete;
        },
        { timeout: 12_000 },
      )
      .catch(() => {});
    const failedState = await readPageState(page);
    const retry = page.locator("button, a").filter({ hasText: /retry|try again|reload image/i });
    const hasRetry = (await retry.count()) > 0 && (await retry.first().isVisible());
    controller.pass(imageMatch);
    entry.evidence = { hasRetry, failedImage: imageState(failedState) };
    addCheck(
      entry,
      "failure-recovery-action-visible",
      hasRetry,
      hasRetry
        ? "The failed image offers an in-editor recovery action."
        : "The failed image offers no in-editor recovery action; a fresh page load is the only fallback.",
      { hasRetry, recoveryPath: hasRetry ? "retry action" : "fresh load" },
    );
    if (hasRetry) {
      await retry.first().click();
      await page.waitForTimeout(500);
    } else {
      await openFixture(page, base, "morrow-advertorial-one-photo");
    }
    await page
      .waitForFunction(
        () => {
          const image = document.querySelector("[data-preview-canvas] img");
          return image && image.complete && image.naturalWidth > 0;
        },
        { timeout: 15_000 },
      )
      .catch(() => {});
    const recovered = await readPageState(page);
    const enabledAfterRecovery = await waitForApproveEnabled(page);
    const settledRecovered = enabledAfterRecovery ? await readPageState(page) : recovered;
    entry.evidence.recoveredImage = imageState(settledRecovered);
    entry.evidence.recoveryPath = hasRetry ? "retry action" : "fresh load";
    addCheck(
      entry,
      "image-loads-after-recovery",
      imageState(settledRecovered).naturalWidth > 0,
      "The required image loads after recovery.",
      { image: imageState(settledRecovered), path: entry.evidence.recoveryPath },
    );
    addCheck(
      entry,
      "approval-enabled-after-recovery",
      settledRecovered.approve?.disabled === false,
      "Approval becomes available only after the image recovers.",
      { approveDisabled: settledRecovered.approve?.disabled },
    );
    addCheck(
      entry,
      "failure-message-cleared",
      !/could not|couldn't|failed|unavailable|retry|try again/i.test(settledRecovered.responseText) ||
        imageState(settledRecovered).naturalWidth > 0,
      "The recovered state no longer reads as a failed image.",
      { text: settledRecovered.responseText.slice(0, 1_200) },
    );
    await capture(page, entry, "recovered");
  } catch (error) {
    entry.evidence.error = error instanceof Error ? error.message : String(error);
    addCheck(entry, "case-completed", false, `The case could not complete: ${entry.evidence.error}`);
  } finally {
    await controller.releaseAll();
    await context.close();
    finishCase(entry);
  }
}

async function runImageRevisionSwitch(browserInstance, base) {
  const entry = startCase("images.revision-switch", { target: base });
  const context = await browserInstance.newContext({
    viewport: { width: 1440, height: 900 },
    serviceWorkers: "block",
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  const controller = createImageController(page);
  const morrowMatch = (url) => /morrow-ceramic-dripper\.webp/.test(url);
  const harborMatch = (url) => /harbor-field-bottle\.webp/.test(url);
  controller.hold(morrowMatch);
  controller.hold(harborMatch);
  try {
    await openFixture(page, base, "morrow-advertorial-one-photo");
    const oldPending = await controller.waitForPending(morrowMatch);
    const initial = await readPageState(page);
    await page.getByLabel("Format", { exact: true }).selectOption("offer");
    await page.getByLabel("Product image", { exact: true }).selectOption("harbor-field-bottle-front");
    await generateAndSettle(page);
    const newPending = await controller.waitForPending(harborMatch);
    const switched = await readPageState(page);
    entry.evidence = {
      oldRevision: initial.region?.revision,
      newRevision: switched.region?.revision,
      oldRequest: oldPending?.url ?? null,
      newRequest: newPending?.url ?? null,
      newImage: imageState(switched),
    };
    addCheck(
      entry,
      "revision-changed",
      Boolean(initial.region?.revision) &&
        Boolean(switched.region?.revision) &&
        initial.region.revision !== switched.region.revision,
      "The editor switched to a different revision while the old image request was pending.",
      { oldRevision: initial.region?.revision, newRevision: switched.region?.revision },
    );
    addCheck(
      entry,
      "new-revision-image-pending",
      Boolean(newPending) && imageState(switched).naturalWidth === 0,
      "The new revision's required image is still pending.",
      { request: newPending?.url ?? null, image: imageState(switched) },
    );
    addCheck(
      entry,
      "approval-blocked-for-new-revision",
      switched.approve?.disabled === true && switched.region?.approved !== "true",
      "Approval is blocked while the new revision's image is pending.",
      { approveDisabled: switched.approve?.disabled, approved: switched.region?.approved },
    );
    await capture(page, entry, "new-revision-pending");

    const releasedOld = await controller.respond(morrowMatch, "continue");
    await page.waitForTimeout(400);
    const afterOld = await readPageState(page);
    addCheck(
      entry,
      "old-image-response-does-not-approve-new-revision",
      afterOld.approve?.disabled === true && afterOld.region?.approved !== "true",
      releasedOld
        ? "The old image response did not unlock approval for the new revision."
        : "The old request had already been cancelled by the remount; approval stayed blocked.",
      {
        oldRequestReleased: releasedOld,
        approveDisabled: afterOld.approve?.disabled,
        approved: afterOld.region?.approved,
      },
    );
    await capture(page, entry, "after-old-response");

    await controller.respond(harborMatch, "continue");
    await page
      .waitForFunction(
        () => {
          const image = document.querySelector("[data-preview-canvas] img");
          return image && image.complete && image.naturalWidth > 0;
        },
        { timeout: 15_000 },
      )
      .catch(() => {});
    const loaded = await readPageState(page);
    const enabledForNewRevision = await waitForApproveEnabled(page);
    const settledLoaded = enabledForNewRevision ? await readPageState(page) : loaded;
    addCheck(
      entry,
      "approval-enabled-for-new-revision",
      imageState(settledLoaded).naturalWidth > 0 && settledLoaded.approve?.disabled === false,
      "Approval becomes available only after the new revision's image loads.",
      { image: imageState(settledLoaded), approveDisabled: settledLoaded.approve?.disabled },
    );
    const approved = await approve(page);
    await page
      .waitForFunction(
        () =>
          document.querySelector("[data-approved]")?.getAttribute("data-approved") === "true",
        { timeout: 5_000 },
      )
      .catch(() => {});
    const approvedState = await readPageState(page);
    entry.evidence.approvedRevision = approvedState.region?.revision;
    addCheck(
      entry,
      "approval-recorded-against-new-revision",
      approved &&
        approvedState.region?.approved === "true" &&
        approvedState.region?.revision === switched.region?.revision,
      "Approval is recorded against the new revision.",
      {
        approved: approvedState.region?.approved,
        revision: approvedState.region?.revision,
        statusText: approvedState.responseText.slice(0, 1_200),
      },
    );
    await capture(page, entry, "new-revision-approved");
  } catch (error) {
    entry.evidence.error = error instanceof Error ? error.message : String(error);
    addCheck(entry, "case-completed", false, `The case could not complete: ${entry.evidence.error}`);
  } finally {
    await controller.releaseAll();
    await context.close();
    finishCase(entry);
  }
}

async function runLongLabel(browserInstance, base) {
  const entry = startCase("long-label", { target: base });
  const exactLabel = "Morrow Ceramic Holiday Design Campaign and Prototype Review";
  const context = await browserInstance.newContext({
    viewport: { width: 320, height: 800 },
    screen: { width: 320, height: 800 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    serviceWorkers: "block",
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  try {
    const response = await openFixture(page, base, "review-long-label", { waitForImages: true });
    const state = await readPageState(page);
    const nameMetrics = await page.evaluate((label) => {
      const nodes = Array.from(document.querySelectorAll("a, span, p, h1, h2, h3"));
      return nodes
        .filter((node) => node.textContent?.trim() === label)
        .map((node) => {
          const rect = node.getBoundingClientRect();
          const style = getComputedStyle(node);
          return {
            tag: node.tagName,
            left: Math.round(rect.left),
            right: Math.round(rect.right),
            width: Math.round(rect.width),
            top: Math.round(rect.top),
            visible: rect.width > 0 && rect.height > 0 && style.visibility !== "hidden",
            clipped:
              node.scrollWidth > node.clientWidth + 1 || node.scrollHeight > node.clientHeight + 1,
            text: node.textContent?.trim() ?? "",
          };
        });
    }, exactLabel);
    entry.evidence = {
      status: response.status,
      viewport: { width: 320, height: 800 },
      documentWidth: state.documentWidth,
      clientWidth: state.clientWidth,
      nameMetrics,
      label: exactLabel,
    };
    await capture(page, entry, "320");
    addCheck(
      entry,
      "document-width-fits",
      state.documentWidth <= state.clientWidth + 1,
      `The document width is ${state.documentWidth}px in a ${state.clientWidth}px viewport.`,
      { documentWidth: state.documentWidth, clientWidth: state.clientWidth },
    );
    const accessibleName = nameMetrics.some(
      (metric) => metric.visible && metric.left >= 0 && metric.right <= 320 && !metric.clipped,
    );
    addCheck(
      entry,
      "campaign-name-accessible",
      accessibleName,
      accessibleName
        ? "The exact campaign label is visible and fully inside the viewport."
        : "The exact campaign label is missing, clipped, or outside the viewport.",
      { label: exactLabel, nameMetrics },
    );

    const requiredControls = [
      { label: "Format", suffix: "-format" },
      { label: "Advertorial layout", suffix: "-advertorial-layout" },
      { label: "Product name", suffix: "-product-name" },
      { label: "Advertorial opening", suffix: "-opening-focus" },
      { label: "Offer", suffix: "-offer" },
      { label: "Destination URL", suffix: "-destination-url" },
      { label: "Product image", suffix: "-product-image" },
      { label: "Generate preview", button: true },
    ];
    const focused = new Map();
    const focusTrace = [];
    await page.evaluate(() => document.body.focus());
    for (let index = 0; index < 200; index += 1) {
      await page.keyboard.press("Tab");
      const active = await page.evaluate(() => {
        const element = document.activeElement;
        if (!(element instanceof HTMLElement)) return null;
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return {
          id: element.id,
          tag: element.tagName,
          text: element.textContent?.trim() ?? "",
          visible: rect.width > 0 && rect.height > 0,
          inViewport: rect.left >= 0 && rect.right <= window.innerWidth + 1,
          focusVisible: element.matches(":focus-visible"),
          outlineWidth: Number.parseFloat(style.outlineWidth) || 0,
          outlineStyle: style.outlineStyle,
          boxShadow: style.boxShadow,
        };
      });
      if (!active) continue;
      if (focusTrace.length < 80) {
        focusTrace.push({ tag: active.tag, id: active.id, text: active.text.slice(0, 60) });
      }
      const match = requiredControls.find((control) =>
        control.button
          ? active.tag === "BUTTON" && active.text === control.label
          : active.id.endsWith(control.suffix),
      );
      if (match && !focused.has(match.label)) focused.set(match.label, active);
      if (focused.size === requiredControls.length) break;
    }
    const missing = requiredControls.filter((control) => !focused.has(control.label)).map((control) => control.label);
    const withoutIndicator = Array.from(focused.entries())
      .filter(([, value]) => !value.focusVisible || (value.outlineWidth === 0 && value.boxShadow === "none"))
      .map(([label]) => label);
    entry.evidence.keyboard = {
      reached: Array.from(focused.keys()),
      missing,
      withoutIndicator,
      inViewport: Object.fromEntries(Array.from(focused.entries()).map(([label, value]) => [label, value.inViewport])),
      trace: focusTrace,
    };
    addCheck(
      entry,
      "keyboard-reaches-editor-controls",
      missing.length === 0,
      missing.length === 0
        ? "Tab reaches every required editor control."
        : `Tab did not reach: ${missing.join(", ")}.`,
      { reached: Array.from(focused.keys()), missing },
    );
    addCheck(
      entry,
      "keyboard-focus-visible",
      withoutIndicator.length === 0,
      withoutIndicator.length === 0
        ? "Every reached control shows a visible focus indicator."
        : `No visible focus indicator on: ${withoutIndicator.join(", ")}.`,
      { withoutIndicator },
    );
    addCheck(
      entry,
      "keyboard-controls-in-viewport",
      Array.from(focused.values()).every((value) => value.inViewport),
      "Every focused editor control stays inside the 320 px viewport.",
      entry.evidence.keyboard.inViewport,
    );
  } catch (error) {
    entry.evidence.error = error instanceof Error ? error.message : String(error);
    addCheck(entry, "case-completed", false, `The case could not complete: ${entry.evidence.error}`);
  } finally {
    await context.close();
    finishCase(entry);
  }
}

async function runDistinctBothFormats(browserInstance, base) {
  const manifest = readManifest("review-distinct");
  const requiredFacts = manifest.fixture.brief.requiredFactGroups.flatMap((group) => group.factIds);
  const entry = startCase("distinct.both-formats", { target: base, requiredFacts });
  const context = await browserInstance.newContext({
    viewport: { width: 1440, height: 900 },
    serviceWorkers: "block",
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));
  try {
    const response = await openFixture(page, base, "review-distinct");
    const initial = await readPageState(page);
    entry.evidence.initial = {
      status: response.status,
      hasEditor: initial.hasEditor,
      format: initial.format,
      opening: initial.opening,
      region: initial.region,
      bodySnippet: initial.responseText.slice(0, 1_500),
    };
    await capture(page, entry, "initial");
    addCheck(
      entry,
      "distinct-pilot-loads",
      response.status === 200 && initial.hasEditor && Boolean(initial.region?.revision),
      `The distinct-opening pilot loaded with HTTP ${response.status}.`,
      { status: response.status, region: initial.region },
    );
    addCheck(
      entry,
      "initial-advertorial-opening",
      initial.format === "advertorial" && initial.opening === "advertorial-question",
      "First load selects the pilot's advertorial opening.",
      { format: initial.format, opening: initial.opening, options: initial.openingOptions },
    );

    const compare = async (state, label) => {
      const values = {
        brandId: state.brandId,
        accent: state.accent,
        productName: state.productName,
        offer: state.offer,
        destinationUrl: state.destinationUrl,
        assetId: state.assetId,
        openingFocus: state.opening,
        format: state.format,
        advertorialLayout: state.layout ?? "auto",
      };
      const api = await postGenerate(base, "review-distinct", values);
      const preview = api.body?.preview;
      const apiAssets = preview?.assets?.map((asset) => asset.asset.id) ?? [];
      const apiRoles = preview?.assets?.map((asset) => asset.assignment.role) ?? [];
      const sameRevision = Boolean(preview?.revision) && preview.revision === state.region?.revision;
      const factsComplete = requiredFacts.every((id) => state.article?.factIds?.includes(id));
      const factsMatchApi =
        Boolean(preview?.draft) && requiredFacts.every((id) => preview.draft.facts?.some((fact) => fact.id === id));
      const expectedDestination = manifest.fixture.brief.destinationUrl;
      const expectedAction = manifest.fixture.brief.actionLabel;
      const exactAction =
        state.article?.actionHref === expectedDestination && state.article?.actionLabel === expectedAction;
      const advertorial = state.format === "advertorial";
      const imageAssignments =
        advertorial
          ? apiAssets.length === state.article?.domAssetIds?.length &&
            apiAssets.every((id) => state.article.domAssetIds.includes(id)) &&
            apiRoles.length === state.article?.domRoles?.length &&
            apiRoles.every((role) => state.article.domRoles.includes(role))
          : Boolean(preview?.asset?.id) &&
            state.article?.images?.some(
              (image) =>
                image.alt === preview.asset.alt &&
                (image.src === preview.asset.src || image.currentSrc?.includes(preview.asset.src)),
            );
      entry.evidence[label] = {
        values,
        apiStatus: api.status,
        apiIssues: api.body?.issues,
        apiRevision: preview?.revision,
        renderedRevision: state.region?.revision,
        apiAssets,
        apiRoles,
        domAssets: state.article?.domAssetIds,
        domRoles: state.article?.domRoles,
        apiAsset: preview?.asset?.id,
        facts: state.article?.factIds,
        action: { label: state.article?.actionLabel, href: state.article?.actionHref },
      };
      addCheck(entry, `${label}-api-preview`, api.status === 200 && Boolean(preview?.revision), "The API returns a preview for this format.", { status: api.status });
      addCheck(entry, `${label}-same-revision`, sameRevision, "The API and editor render the same revision.", { api: preview?.revision, rendered: state.region?.revision });
      addCheck(entry, `${label}-image-assignments-match`, imageAssignments, "The API image assignments match the rendered article.", { apiAssets, domAssets: state.article?.domAssetIds, apiRoles, domRoles: state.article?.domRoles });
      addCheck(entry, `${label}-required-facts`, factsComplete && factsMatchApi, "Every required fact renders in both the draft and the article.", { requiredFacts, rendered: state.article?.factIds });
      addCheck(entry, `${label}-exact-cta`, exactAction, "The primary CTA keeps the exact label and destination.", { expectedAction, expectedDestination, action: entry.evidence[label].action });
    };

    await generateAndSettle(page);
    const advertorial = await readPageState(page);
    await compare(advertorial, "advertorial");
    await capture(page, entry, "advertorial");

    await page.getByRole("button", { name: "Approve preview", exact: true }).click().catch(() => {});
    await page.waitForTimeout(100);
    await page.getByLabel("Format", { exact: true }).selectOption("offer");
    await page.waitForTimeout(200);
    const offerSelected = await readPageState(page);
    addCheck(
      entry,
      "switch-to-offer-opening",
      offerSelected.format === "offer" && offerSelected.opening === "offer-rib",
      "Switching to offer selects that format's own opening.",
      { format: offerSelected.format, opening: offerSelected.opening, options: offerSelected.openingOptions },
    );
    addCheck(
      entry,
      "format-switch-clears-approval",
      offerSelected.region?.approved === "false",
      "Switching formats clears the previous approval.",
      { approved: offerSelected.region?.approved },
    );
    await generateAndSettle(page);
    const offer = await readPageState(page);
    await compare(offer, "offer");
    await capture(page, entry, "offer");

    await page.getByLabel("Format", { exact: true }).selectOption("advertorial");
    await page.waitForTimeout(200);
    const back = await readPageState(page);
    addCheck(
      entry,
      "switch-back-restores-advertorial-opening",
      back.format === "advertorial" && back.opening === "advertorial-question",
      "Switching back restores the advertorial opening.",
      { format: back.format, opening: back.opening },
    );
    await generateAndSettle(page);
    const advertorialAgain = await readPageState(page);
    await compare(advertorialAgain, "advertorial-again");
    await capture(page, entry, "advertorial-again");

    entry.evidence.consoleErrors = consoleErrors.slice(0, 10);
    addCheck(
      entry,
      "no-console-errors",
      consoleErrors.length === 0,
      consoleErrors.length === 0 ? "No browser console errors were recorded." : "Browser console errors were recorded.",
      { errors: consoleErrors.slice(0, 10) },
    );
  } catch (error) {
    entry.evidence.error = error instanceof Error ? error.message : String(error);
    addCheck(entry, "case-completed", false, `The case could not complete: ${entry.evidence.error}`);
  } finally {
    await context.close();
    finishCase(entry);
  }
}

function inspectRealBrandPilot(pilotId) {
  const pilotDir = path.join(root, ".local", "campaign-lab-pilots", pilotId);
  const manifestPath = path.join(pilotDir, "manifest.json");
  const sourcePath = path.join(pilotDir, "pilot.json");
  const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) : null;
  const source = !manifest && existsSync(sourcePath) ? JSON.parse(readFileSync(sourcePath, "utf8")) : null;
  const data = manifest ?? source;
  const missing = [];
  if (!data) {
    missing.push(`No staged pilot package at .local/campaign-lab-pilots/${pilotId}/ (pilot.json or manifest.json).`);
    return { data: null, missing, ready: false, pilotDir };
  }
  const fixture = data.fixture ?? {};
  const brief = fixture.brief ?? {};
  const advertorial = brief.advertorial;
  const assets = data.assets ?? [];
  const hero = assets.find((asset) => asset.role === "product-hero");
  const supporting = assets.filter((asset) => asset.role !== "product-hero");
  if (!data.sourceCampaign) missing.push("A source-campaign record with channel, promise, source document, reviewer, and review date.");
  if (!advertorial) {
    missing.push(
      "A documented brand story with an approved advertorial opening, two or three story beats with exact quotes, and a product transition.",
    );
  } else if ((advertorial.storyBeats?.length ?? 0) < 2) {
    missing.push("Two or three approved story beats transcribed from the source.");
  }
  if (!Array.isArray(brief.productFacts) || brief.productFacts.length < 2) missing.push("Approved product facts with a source document and exact source text.");
  if (!brief.offer || /placeholder|pending|unconfirmed/i.test(JSON.stringify(data.pilot ?? {}))) missing.push("A confirmed final offer with terms (current values are preview placeholders).");
  if (!brief.destinationUrl || /amazon\.com\/s\?|search|placeholder/i.test(brief.destinationUrl)) missing.push("A confirmed direct product destination and action label (current destination is a search or placeholder).");
  if (!advertorial?.disclosure) missing.push("A disclosure label and sponsor approved for the publication surface.");
  if (!hero) missing.push("A reviewed product-hero packshot.");
  if (supporting.length === 0) missing.push("At least one reviewed supporting image for the full layout.");
  if (assets.some((asset) => /pending|unconfirmed|pilot use only|confirm .*rights/i.test(asset.rights ?? ""))) {
    missing.push("Confirmed media rights for the packshot and supporting image, including paid-advertorial use.");
  }
  if (assets.some((asset) => !asset.crop && !asset.caption)) missing.push("Crop notes, alt text, dimensions, and content hashes for the approved images.");
  if (data.pilot?.status !== "confirmed") missing.push("A pilot status of \"confirmed\" (the staged package is still a preview).");
  return { data, missing: [...new Set(missing)], ready: missing.length === 0, pilotDir };
}

async function runRealBrand(browserInstance, base) {
  const entry = startCase("real-brand.pending", { target: base, pilot: cli["real-brand"] });
  const readiness = inspectRealBrandPilot(cli["real-brand"]);
  entry.evidence = {
    pilot: cli["real-brand"],
    ready: readiness.ready,
    missing: readiness.missing,
    package: readiness.data
      ? {
          pilot: readiness.data.pilot,
          fixture: {
            id: readiness.data.fixture?.id,
            label: readiness.data.fixture?.label,
            offer: readiness.data.fixture?.brief?.offer,
            destination: readiness.data.fixture?.brief?.destinationUrl,
          },
        }
      : null,
  };
  addCheck(
    entry,
    "real-brand-inputs-available",
    readiness.ready ? true : null,
    readiness.ready
      ? "The staged real-brand package has the story, facts, offer, destination, disclosure, and approved images."
      : "Suitable real-brand material is not on file; the two-layout test remains pending.",
    { missing: readiness.missing },
  );
  if (readiness.ready) {
    addCheck(
      entry,
      "real-brand-two-layout-run",
      false,
      "The package is ready but this runner still needs its server started with the real-brand pilot.",
    );
  } else {
    addCheck(
      entry,
      "real-brand-missing-inputs-recorded",
      true,
      "The exact missing inputs are recorded below; no real-brand result is claimed.",
      { missing: readiness.missing },
    );
  }
  finishCase(entry);
}

async function detectActivePilot(browserInstance, base) {
  const context = await browserInstance.newContext({ viewport: { width: 800, height: 600 } });
  const page = await context.newPage();
  try {
    await page.goto(fixtureUrl(base, "sparse"), { waitUntil: "domcontentloaded", timeout: 45_000 });
    await page.waitForTimeout(300);
    return await page.evaluate(() => {
      const region = document.querySelector("[data-preview-canvas]")?.closest("section[aria-labelledby]");
      return region?.getAttribute("data-pilot") || null;
    });
  } finally {
    await context.close();
  }
}

async function findFreePort(startPort) {
  for (let port = startPort; port < startPort + 100; port += 1) {
    const available = await new Promise((resolve) => {
      const server = createServer();
      server.once("error", () => resolve(false));
      server.once("listening", () => server.close(() => resolve(true)));
      server.listen(port, "127.0.0.1");
    });
    if (available) return port;
  }
  throw new Error("No free port found");
}

async function waitForServer(base, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${base}/campaign-lab?fixture=sparse`, { redirect: "manual" });
      if (response.status < 500) return true;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await timeout(500);
  }
  throw new Error(`Development server did not become ready: ${lastError?.message ?? "timeout"}`);
}

async function startServer(group, port) {
  const base = `http://127.0.0.1:${port}`;
  const logPath = path.join(outDir, `server-${group.id}.log`);
  writeFileSync(logPath, "", "utf8");
  const env = {
    ...process.env,
    CAMPAIGN_LAB_PILOT_DIR: localPilotRoot,
    CAMPAIGN_LAB_GENERATION_PROVIDER: "local-test",
    CAMPAIGN_LAB_GENERATION_TEST_MODE: "success",
    CAMPAIGN_LAB_GENERATION_LIVE: "false",
    OPENAI_ENABLED: "false",
    NEXT_TELEMETRY_DISABLED: "1",
    NEXT_PUBLIC_APP_URL: base,
    AUTH_SECRET: "local-review-secret-local-review-secret",
    NEXTAUTH_SECRET: "local-review-secret-local-review-secret",
    TOKEN_ENCRYPTION_KEY: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    GOOGLE_CLIENT_ID: "local-review-client",
    GOOGLE_CLIENT_SECRET: "local-review-secret",
  };
  if (group.pilot) env.CAMPAIGN_LAB_PILOT_ID = group.pilot;
  else env.CAMPAIGN_LAB_PILOT_DISABLED = "true";

  const child = spawn(
    process.execPath,
    [
      path.join(root, "node_modules", "next", "dist", "bin", "next"),
      "dev",
      "--webpack",
      "--hostname",
      "127.0.0.1",
      "--port",
      String(port),
    ],
    {
      cwd: root,
      env,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    },
  );
  child.stdout.on("data", (chunk) => appendFileSync(logPath, chunk));
  child.stderr.on("data", (chunk) => appendFileSync(logPath, chunk));
  child.on("error", (error) => appendFileSync(logPath, `\n[spawn error] ${error.message}\n`));
  await waitForServer(base);
  return { child, base, port, logPath };
}

async function stopServer(server) {
  if (!server || cli["keep-server"]) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(server.child.pid), "/T", "/F"], { stdio: "ignore" });
  } else {
    server.child.kill("SIGTERM");
  }
  await timeout(1_000);
}

async function runGroup(browserInstance, group, base) {
  if (group.cases.includes("capacity.direct-open") && selected("capacity.direct-open")) {
    await runCapacityDirect(browserInstance, base);
  }
  if (group.cases.includes("capacity.recovery") && selected("capacity.recovery")) {
    await runCapacityRecovery(browserInstance, base);
  }
  if (group.cases.includes("failed-edit") && selected("failed-edit")) {
    await runFailedEdit(browserInstance, base);
  }
  if (group.cases.includes("images.delayed") && selected("images.delayed")) {
    await runImageDelayed(browserInstance, base);
  }
  if (group.cases.includes("images.404") && selected("images.404")) {
    await runImage404(browserInstance, base);
  }
  if (group.cases.includes("images.recovery") && selected("images.recovery")) {
    await runImageRecovery(browserInstance, base);
  }
  if (group.cases.includes("images.revision-switch") && selected("images.revision-switch")) {
    await runImageRevisionSwitch(browserInstance, base);
  }
  if (group.cases.includes("long-label") && selected("long-label")) {
    await runLongLabel(browserInstance, base);
  }
  if (group.cases.includes("distinct.both-formats") && selected("distinct.both-formats")) {
    await runDistinctBothFormats(browserInstance, base);
  }
}

function writeReports() {
  const passed = cases.filter((entry) => entry.state === "passed").length;
  const failed = cases.filter((entry) => entry.state === "failed").length;
  const pending = cases.filter((entry) => entry.state === "pending").length;
  const report = {
    generatedAt: new Date().toISOString(),
    outDir,
    command: process.argv.join(" "),
    summary: { cases: cases.length, passed, failed, pending },
    cases,
  };
  writeFileSync(path.join(outDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`);

  const lines = [
    "# Campaign Lab review acceptance",
    "",
    `Generated: ${report.generatedAt}`,
    "",
    `Cases: **${cases.length}** · passed **${passed}** · failed **${failed}** · pending **${pending}**`,
    "",
    "Each case is reported separately. A passing case does not clear a failed recovery, stale-revision, or real-brand case.",
    "",
  ];
  for (const entry of cases) {
    lines.push(`## ${entry.id} — ${entry.state.toUpperCase()}`, "", entry.title, "");
    for (const check of entry.checks) {
      lines.push(`- **${check.state}** \`${check.id}\` — ${check.detail}`);
    }
    if (entry.captures.length > 0) {
      lines.push("", `Captures: ${entry.captures.map((capturePath) => `\`${capturePath}\``).join(", ")}`);
    }
    if (Object.keys(entry.evidence).length > 0) {
      lines.push("", "Evidence:", "", "```json", JSON.stringify(entry.evidence, null, 2), "```");
    }
    lines.push("");
  }
  writeFileSync(path.join(outDir, "report.md"), `${lines.join("\n")}\n`);
  return report;
}

let exitCode = 0;
try {
  if (!cli["no-prepare"]) {
    const preparation = spawnSync(
      process.execPath,
      ["--experimental-strip-types", path.join(root, "scripts", "prepare-campaign-lab-review-pilots.mjs")],
      { cwd: root, encoding: "utf8" },
    );
    if (preparation.status !== 0) {
      throw new Error(`Synthetic pilot preparation failed:\n${preparation.stdout}\n${preparation.stderr}`);
    }
    writeFileSync(path.join(outDir, "pilot-preparation.json"), preparation.stdout);
  }

  const { chromium } = await loadPlaywright();
  browser = await chromium.launch({
    headless: !cli.headed,
    executablePath: chromiumExecutable(chromium),
  });

  if (cli.url) {
    const base = new URL(cli.url).origin;
    const activePilot = cli.pilot ?? (await detectActivePilot(browser, base));
    const selectedGroups = cli.pilot
      ? groups.filter((group) => group.pilot === cli.pilot)
      : groups.filter((group) => group.pilot === activePilot);
    if (selectedGroups.length === 0) {
      throw new Error(
        `No cases match the requested selection for pilot "${activePilot ?? "none"}". ` +
          "Expected one of: " +
          groups.map((group) => group.pilot ?? "no pilot").join(", "),
      );
    }
    console.log(`[target] ${base} · pilot ${activePilot ?? "none"}`);
    for (const group of selectedGroups) await runGroup(browser, group, base);
  } else {
    let nextPort = Number.parseInt(cli.port, 10) || 3210;
    for (const group of groups) {
      if (!group.cases.some((caseId) => selected(caseId))) continue;
      const port = await findFreePort(nextPort);
      nextPort = port + 1;
      console.log(`\n[server] ${group.id} on http://127.0.0.1:${port}`);
      activeServer = await startServer(group, port);
      try {
        await runGroup(browser, group, activeServer.base);
      } finally {
        await stopServer(activeServer);
        activeServer = null;
      }
    }
  }

  if (selected("real-brand")) await runRealBrand(browser, cli.url ? new URL(cli.url).origin : "not-started");
} catch (error) {
  console.error(error);
  exitCode = 2;
  if (cases.length === 0) {
    cases.push({
      id: "runner.setup",
      title: "Runner setup",
      state: "failed",
      checks: [{ id: "setup", state: "failed", detail: error instanceof Error ? error.message : String(error), evidence: {} }],
      captures: [],
      evidence: {},
    });
  }
} finally {
  if (activeServer) await stopServer(activeServer);
  if (browser) await browser.close().catch(() => {});
  const report = writeReports();
  console.log(
    JSON.stringify(
      {
        out: outDir,
        summary: report.summary,
        cases: report.cases.map((entry) => ({ id: entry.id, state: entry.state })),
      },
      null,
      2,
    ),
  );
  if (report.summary.failed > 0 || exitCode !== 0) process.exitCode = 1;
  else process.exitCode = 0;
}
