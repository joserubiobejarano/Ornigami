#!/usr/bin/env node
/**
 * Focused contract probe for the advertorial API, editor form state, and DOM.
 *
 * Usage:
 *   node scripts/campaign-lab-advertorial-contract-check.mjs `
 *     --url http://localhost:3100 --fixture review-advertorial `
 *     --brand review-advertorial --opening flow-control
 */
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { values: cli } = parseArgs({
  options: {
    url: { type: "string", short: "u", default: "http://localhost:3000" },
    out: { type: "string", default: ".local/campaign-lab-advertorial-contract" },
    fixture: { type: "string", default: "review-advertorial" },
    brand: { type: "string", default: "review-advertorial" },
    product: { type: "string", default: "Morrow ceramic pour-over dripper" },
    asset: { type: "string", default: "review-hero" },
    opening: { type: "string", default: "flow-control" },
    offer: { type: "string", default: "Free shipping through 30 November 2026" },
    destination: { type: "string", default: "https://example.com/morrow" },
    layout: { type: "string", default: "auto" },
    "expect-layout": { type: "string" },
    "expect-unused": { type: "string" },
    "offer-opening": { type: "string" },
    "advertorial-opening": { type: "string" },
  },
});

const base = new URL(cli.url).origin;
const outDir = path.resolve(root, cli.out);
const checks = [];
const add = (id, ok, detail, evidence = {}) => {
  checks.push({ id, state: ok ? "passed" : "failed", detail, evidence });
};

function loadPlaywright() {
  const candidate = path.join(
    root,
    "scripts",
    "framework-browser-tools",
    "node_modules",
    "playwright",
    "index.mjs",
  );
  const legacy = path.join(
    root,
    "scripts",
    "framework-prototype",
    "browser-tools",
    "node_modules",
    "playwright",
    "index.mjs",
  );
  if (existsSync(candidate)) return import(pathToFileURL(candidate).href);
  if (existsSync(legacy)) return import(pathToFileURL(legacy).href);
  return import("playwright");
}

function chromiumExecutable(chromium) {
  if (process.env.CAMPAIGN_LAB_CHROMIUM) return process.env.CAMPAIGN_LAB_CHROMIUM;
  const bundled = chromium.executablePath();
  if (bundled && existsSync(bundled)) return bundled;
  const cache = process.env.LOCALAPPDATA
    ? path.join(process.env.LOCALAPPDATA, "ms-playwright")
    : null;
  if (cache && existsSync(cache)) {
    const version = readdirSync(cache)
      .filter((name) => /^chromium-\d+$/.test(name))
      .sort((left, right) => Number(right.split("-")[1]) - Number(left.split("-")[1]))[0];
    if (version) {
      const candidate = path.join(cache, version, "chrome-win64", "chrome.exe");
      if (existsSync(candidate)) return candidate;
    }
  }
  return undefined;
}

const values = {
  brandId: cli.brand,
  accent: "#234a6b",
  productName: cli.product,
  offer: cli.offer,
  destinationUrl: cli.destination,
  assetId: cli.asset,
  openingFocus: cli.opening,
  format: "advertorial",
  advertorialLayout: cli.layout,
};

async function post(payload) {
  const response = await fetch(`${base}/api/campaign-lab/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return { status: response.status, body: await response.json().catch(() => null) };
}

function readPage(page) {
  return page.evaluate(() => {
    const region = document
      .querySelector("[data-preview-canvas]")
      ?.closest("section[aria-labelledby]");
    const article = document.querySelector("[data-preview-canvas] article");
    const bySuffix = (suffix) =>
      Array.from(document.querySelectorAll("select")).find((select) =>
        select.id.endsWith(suffix),
      );
    return {
      revision: region?.getAttribute("data-revision") ?? null,
      layout: region?.getAttribute("data-layout") ?? null,
      template: region?.getAttribute("data-template") ?? null,
      sectionOrder: region?.getAttribute("data-section-order")?.split(",") ?? [],
      apiAssetIds: (region?.getAttribute("data-asset-ids") ?? "")
        .split(",")
        .filter(Boolean),
      unusedAssetIds: (region?.getAttribute("data-unused-asset-ids") ?? "")
        .split(",")
        .filter(Boolean),
      approved: document.querySelector("[data-approved]")?.getAttribute("data-approved"),
      format: bySuffix("-format")?.value ?? null,
      opening: bySuffix("-opening-focus")?.value ?? null,
      openingOptions: bySuffix("-opening-focus")
        ? Array.from(bySuffix("-opening-focus").options).map((option) => option.value)
        : [],
      domAssetIds: Array.from(article?.querySelectorAll("[data-asset-id]") ?? []).map(
        (node) => node.getAttribute("data-asset-id"),
      ),
      domRoles: Array.from(article?.querySelectorAll("[data-asset-role]") ?? []).map(
        (node) => node.getAttribute("data-asset-role"),
      ),
      actions: article?.querySelectorAll("[data-advertorial-action]").length ?? 0,
      unusedText: document.querySelector("[data-unused-images]")?.innerText ?? null,
      heading: article?.querySelector("h1")?.textContent?.trim() ?? null,
      productName: article?.querySelector("h2")?.textContent?.trim() ?? null,
    };
  });
}

const api = await post({ fixtureId: cli.fixture, values });
const apiPreview = api.body?.preview;
add(
  "api-preview",
  api.status === 200 && api.body?.ok === true && Boolean(apiPreview?.revision),
  "The API returns a revision for the selected pilot.",
  { status: api.status, revision: apiPreview?.revision },
);

const wrongName = await post({
  fixtureId: cli.fixture,
  values: { ...values, productName: "Harbor Field travel bottle" },
});
add(
  "wrong-product-name-rejected",
  wrongName.status === 422 &&
    wrongName.body?.issues?.some(
      (issue) =>
        issue.field === "productName" &&
        /does not match this campaign's approved product/i.test(issue.message),
    ) &&
    wrongName.body?.preview === undefined,
  "A direct request cannot swap the campaign product name.",
  { status: wrongName.status, issues: wrongName.body?.issues },
);

const { chromium } = await loadPlaywright();
const browser = await chromium.launch({
  headless: true,
  executablePath: chromiumExecutable(chromium),
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  serviceWorkers: "block",
  reducedMotion: "reduce",
});
const page = await context.newPage();
const errors = [];
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});
page.on("pageerror", (error) => errors.push(error.message));

try {
  await page.goto(`${base}/campaign-lab?fixture=${encodeURIComponent(cli.fixture)}`, {
    waitUntil: "networkidle",
    timeout: 30_000,
  });
  await page.getByRole("region", { name: "Campaign preview" }).waitFor();

  const initial = await readPage(page);
  if (cli["advertorial-opening"]) {
    add(
      "initial-advertorial-opening",
      initial.format === "advertorial" &&
        initial.opening === cli["advertorial-opening"],
      "First load selects the advertorial opening from the advertorial options.",
      { format: initial.format, opening: initial.opening, options: initial.openingOptions },
    );
  }

  if (cli["offer-opening"] && cli["advertorial-opening"]) {
    await page.getByRole("button", { name: "Approve preview", exact: true }).click();
    await page.waitForTimeout(150);
    const approved = await readPage(page);
    add("checked-pilot-approval", approved.approved === "true", "The initial preview can be approved.", {
      approved: approved.approved,
    });

    await page.getByLabel("Format", { exact: true }).selectOption("offer");
    await page.waitForTimeout(200);
    const offer = await readPage(page);
    add(
      "switch-to-offer-opening",
      offer.format === "offer" &&
        offer.opening === cli["offer-opening"] &&
        offer.approved === "false",
      "Switching to offer selects the offer opening and clears approval.",
      { format: offer.format, opening: offer.opening, approved: offer.approved },
    );

    await page.getByLabel("Format", { exact: true }).selectOption("advertorial");
    await page.waitForTimeout(200);
    const advertorial = await readPage(page);
    add(
      "switch-back-advertorial-opening",
      advertorial.format === "advertorial" &&
        advertorial.opening === cli["advertorial-opening"] &&
        advertorial.approved === "false",
      "Switching back selects the advertorial opening and keeps approval cleared.",
      {
        format: advertorial.format,
        opening: advertorial.opening,
        approved: advertorial.approved,
      },
    );
  }

  if (cli.layout) {
    await page.getByLabel("Advertorial layout", { exact: true }).selectOption(cli.layout);
  }
  await page.getByRole("button", { name: "Generate preview", exact: true }).click();
  await page.waitForTimeout(800);
  const rendered = await readPage(page);

  add(
    "same-revision",
    rendered.revision === apiPreview?.revision,
    "The API and the editor render the same deterministic revision.",
    { apiRevision: apiPreview?.revision, editorRevision: rendered.revision },
  );
  const apiAssetIds = apiPreview?.assets?.map((entry) => entry.asset.id) ?? [];
  const apiRoles = apiPreview?.assets?.map((entry) => entry.assignment.role) ?? [];
  add(
    "api-assets-match-dom",
    apiAssetIds.length === rendered.domAssetIds.length &&
      apiAssetIds.every((id) => rendered.domAssetIds.includes(id)) &&
      rendered.domAssetIds.every((id) => apiAssetIds.includes(id)),
    "Every API assignment is present in the article DOM on the same revision.",
    { apiAssetIds, domAssetIds: rendered.domAssetIds, domRoles: rendered.domRoles },
  );
  add(
    "api-roles-match-dom",
    apiRoles.length === rendered.domRoles.length &&
      apiRoles.every((role) => rendered.domRoles.includes(role)),
    "The API assignment roles match the rendered image roles.",
    { apiRoles, domRoles: rendered.domRoles },
  );
  add(
    "dom-assets-match-editor-preview",
    rendered.apiAssetIds.length === rendered.domAssetIds.length &&
      rendered.apiAssetIds.every((id) => rendered.domAssetIds.includes(id)),
    "The editor preview and article DOM expose the same asset set.",
    { previewAssetIds: rendered.apiAssetIds, domAssetIds: rendered.domAssetIds },
  );
  if (cli["expect-layout"]) {
    add(
      "expected-layout",
      rendered.layout === cli["expect-layout"],
      `Expected ${cli["expect-layout"]}; observed ${rendered.layout}.`,
      { layout: rendered.layout },
    );
  }
  if (cli["expect-unused"]) {
    add(
      "unused-image-explained",
      rendered.unusedAssetIds.includes(cli["expect-unused"]) &&
        Boolean(rendered.unusedText?.includes(cli["expect-unused"])) &&
        Boolean(rendered.unusedText?.includes("is unused")),
      "The editor names the unplaced approved image and why it is unused.",
      { unusedAssetIds: rendered.unusedAssetIds, unusedText: rendered.unusedText },
    );
  }
  add(
    "single-action-product-end",
    rendered.actions === 1 && rendered.sectionOrder.at(-1) === "product",
    "The page keeps one primary action and ends at the product block.",
    { actions: rendered.actions, sectionOrder: rendered.sectionOrder },
  );
  add("no-console-errors", errors.length === 0, "The editor produced no console errors.", {
    errors,
  });

  mkdirSync(outDir, { recursive: true });
  const report = {
    generatedAt: new Date().toISOString(),
    base,
    fixture: cli.fixture,
    api: api.body,
    wrongName: wrongName.body,
    initial,
    rendered,
    errors,
    checks,
  };
  writeFileSync(path.join(outDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`);

  const failed = checks.filter((check) => check.state === "failed");
  console.log(
    JSON.stringify(
      {
        status: failed.length === 0 ? "passed" : "failed",
        checks: checks.length,
        failed: failed.length,
        out: path.join(outDir, "report.json"),
        results: checks.map(({ id, state, detail }) => ({ id, state, detail })),
      },
      null,
      2,
    ),
  );
  if (failed.length > 0) process.exitCode = 1;
} finally {
  await context.close();
  await browser.close();
}
