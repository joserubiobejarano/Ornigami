#!/usr/bin/env node
/**
 * Browser/network evidence for browser-offer generation through the shared
 * Campaign Lab harness. Synthetic briefs only. No paid provider is called.
 *
 * Usage:
 *   node scripts/campaign-lab-browser-generation-check.mjs --scenario success
 *   node scripts/campaign-lab-browser-generation-check.mjs --scenario invalid
 *   node scripts/campaign-lab-browser-generation-check.mjs --scenario timeout
 *   node scripts/campaign-lab-browser-generation-check.mjs --scenario stale
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

const root = process.cwd();
const { values: cli } = parseArgs({
  options: {
    url: { type: "string", short: "u", default: "http://localhost:3130" },
    out: { type: "string", short: "o" },
    scenario: { type: "string", default: "success" },
    headed: { type: "boolean", default: false },
  },
});

async function loadPlaywright() {
  const candidates = [
    process.env.CAMPAIGN_LAB_PLAYWRIGHT,
    "C:/Users/joser/AppData/Local/Temp/opencode/playwright-tools/node_modules/playwright/index.mjs",
    path.join(root, "scripts", "framework-prototype", "browser-tools", "node_modules", "playwright", "index.mjs"),
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return import(pathToFileURL(candidate).href);
    }
  }
  return import("playwright");
}

function chromeExecutable() {
  const candidates = [
    process.env.CAMPAIGN_LAB_CHROMIUM,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return undefined;
}

function check(report, id, passed, actual, expected) {
  report.checks.push({ id, passed, actual, expected });
  if (!passed) {
    throw new Error(`${id}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function extractZip(zipPath, target) {
  mkdirSync(target, { recursive: true });
  const result = spawnSync("tar", ["-xf", zipPath, "-C", target], {
    cwd: root,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(`ZIP extraction failed: ${result.stderr || result.stdout || result.status}`);
  }
}

function sha256File(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

const BRIEFS = [
  {
    id: "harbor-field-social",
    brandName: "Harbor Field",
    productName: "Harbor Field travel bottle",
    audience: "People discovering the bottle in a paid social ad on mobile.",
    objective: "Send the visitor to the marketplace listing while the 20% offer is clear.",
    offer: "20% off, 27-30 November 2026",
    destinationUrl: "https://example.com/harbor-field",
    facts: [
      { label: "Capacity", value: "500 ml" },
      { label: "Closure", value: "Screw cap" },
    ],
    packshot: "public/campaign-assets/harbor-field-bottle.webp",
    alt: "Graphite Harbor Field travel bottle on a warm studio backdrop.",
    rights: "Synthetic local fixture; not publication approval.",
  },
  {
    id: "morrow-email",
    brandName: "Morrow Ceramic",
    productName: "Morrow ceramic pour-over dripper",
    audience:
      "People curious about pour-over coffee who clicked an email asking what changes when the first pour is slower.",
    objective: "Explain the rib design and lead to the dripper page.",
    offer: "Free shipping through 30 November 2026",
    destinationUrl: "https://example.com/morrow",
    facts: [
      { label: "Interior", value: "Three ribs" },
      { label: "Outlet", value: "Single outlet" },
    ],
    packshot: "public/campaign-assets/morrow-ceramic-dripper.webp",
    alt: "Morrow cream ceramic dripper on a deep blue backdrop.",
    rights: "Synthetic local fixture; not publication approval.",
  },
];

async function fillIntake(page, brief) {
  await page.goto(new URL("/campaign-lab/offer", cli.url).href, {
    waitUntil: "networkidle",
    timeout: 120_000,
  });
  await page.getByLabel("Brand name", { exact: true }).fill(brief.brandName);
  await page.getByLabel("Product name", { exact: true }).fill(brief.productName);
  await page.getByLabel("Audience", { exact: true }).fill(brief.audience);
  await page.getByLabel("Campaign objective", { exact: true }).fill(brief.objective);
  await page.getByLabel("Offer", { exact: true }).fill(brief.offer);
  await page.getByLabel("Destination URL", { exact: true }).fill(brief.destinationUrl);
  const labels = page.getByLabel("Label", { exact: true });
  const values = page.getByLabel("Approved value", { exact: true });
  for (const [index, fact] of brief.facts.entries()) {
    await labels.nth(index).fill(fact.label);
    await values.nth(index).fill(fact.value);
  }
  await page
    .getByLabel("Product image", { exact: true })
    .setInputFiles(path.join(root, brief.packshot));
  await page.getByText(/SHA-256 recorded/).waitFor({ state: "visible", timeout: 15_000 });
  await page.getByLabel("Alt text", { exact: true }).fill(brief.alt);
  await page.getByLabel("Usage rights", { exact: true }).fill(brief.rights);
  const confirmations = page.locator('input[type="checkbox"]');
  await confirmations.nth(0).check();
  await confirmations.nth(1).check();
  await confirmations.nth(2).check();
  await page.getByRole("button", { name: "Open Campaign Lab preview", exact: true }).click();
  await page.waitForSelector('section[data-fixture="browser-offer"]', { timeout: 60_000 });
  await page.waitForFunction(
    () => [...document.images].every((image) => image.complete && image.naturalWidth > 0),
    null,
    { timeout: 30_000 },
  );
}

async function generate(page, report, label) {
  const responsePromise = page.waitForResponse(
    (response) =>
      response.url().includes("/api/campaign-lab/generate") &&
      response.request().method() === "POST",
    { timeout: 60_000 },
  );
  await page.getByRole("button", { name: "Generate preview", exact: true }).click();
  const response = await responsePromise;
  const payload = await response.json();
  const request = response.request().postDataJSON();
  await page.waitForFunction(
    () => {
      const section = document.querySelector('section[data-fixture="browser-offer"]');
      return ["generated", "fallback"].includes(
        section?.getAttribute("data-generation-status") ?? "",
      );
    },
    null,
    { timeout: 30_000 },
  );
  await page.waitForTimeout(300);
  const preview = await readPreview(page);
  const record = {
    label,
    status: response.status(),
    request,
    response: payload,
    preview,
  };
  report.generations.push(record);
  return record;
}

async function readPreview(page) {
  return page.evaluate(() => {
    const section = document.querySelector('section[data-fixture="browser-offer"]');
    const article = section?.querySelector("article");
    const image = article?.querySelector("img");
    return {
      revision: section?.getAttribute("data-revision") ?? null,
      generation: {
        status: section?.getAttribute("data-generation-status") ?? null,
        provider: section?.getAttribute("data-generation-provider") ?? null,
        mode: section?.getAttribute("data-generation-mode") ?? null,
        harness: section?.getAttribute("data-generation-harness-version") ?? null,
        guidance: section?.getAttribute("data-generation-guidance-version") ?? null,
        code: section?.getAttribute("data-generation-code") ?? null,
      },
      asset: {
        id: section?.getAttribute("data-asset-id") ?? null,
        contentHash: section?.getAttribute("data-asset-content-hash") ?? null,
        alt: image?.getAttribute("alt") ?? null,
        src: image?.getAttribute("src") ?? null,
      },
      articleText: article?.textContent?.replace(/\s+/g, " ").trim() ?? "",
      links: [...(article?.querySelectorAll("a") ?? [])].map((link) => link.getAttribute("href")),
      facts: [...(article?.querySelectorAll("[data-fact-id]") ?? [])].map((fact) => ({
        id: fact.getAttribute("data-fact-id"),
        text: fact.textContent?.replace(/\s+/g, " ").trim() ?? "",
      })),
      dirty: section?.getAttribute("data-preview-dirty") ?? null,
      approved: section?.querySelector("[data-approved]")?.getAttribute("data-approved") ?? null,
    };
  });
}

async function approveAndExport(page, report, brief) {
  await page.getByRole("button", { name: "Approve preview locally", exact: true }).click();
  await page.waitForFunction(
    () =>
      document
        .querySelector("[data-local-preview-approval]")
        ?.getAttribute("data-local-preview-approval") === "true",
    null,
    { timeout: 15_000 },
  );
  const downloadPromise = page.waitForEvent("download", { timeout: 60_000 });
  await page.getByRole("button", { name: "Export approved page", exact: true }).click();
  const download = await downloadPromise;
  const zipPath = path.join(report.outDir, download.suggestedFilename());
  await download.saveAs(zipPath);
  const bundleDir = path.join(report.outDir, `${brief.id}-bundle`);
  extractZip(zipPath, bundleDir);
  const receipt = JSON.parse(readFileSync(path.join(bundleDir, "receipt.json"), "utf8"));
  const html = readFileSync(path.join(bundleDir, "index.html"), "utf8");
  const preview = report.generations.at(-1).preview;
  check(report, "export-file", existsSync(zipPath), true, true);
  check(report, "receipt-revision", receipt.approval.revision === preview.revision, receipt.approval.revision, preview.revision);
  check(report, "receipt-offer", receipt.preview.offer === brief.offer, receipt.preview.offer, brief.offer);
  check(report, "receipt-destination", receipt.preview.destinationUrl === brief.destinationUrl, receipt.preview.destinationUrl, brief.destinationUrl);
  check(
    report,
    "receipt-packshot",
    receipt.asset.exportedSha256 === sha256File(path.join(root, brief.packshot)),
    receipt.asset.exportedSha256,
    sha256File(path.join(root, brief.packshot)),
  );
  check(report, "html-revision", html.includes(`name="campaign-lab-revision" content="${preview.revision}"`), true, true);
  check(report, "html-offer", html.includes(brief.offer), true, true);
  check(report, "html-destination", html.includes(brief.destinationUrl), true, true);
  for (const [id, value] of Object.entries(receipt.checks)) {
    check(report, `receipt-check-${id}`, value === true, value, true);
  }
  report.export = {
    briefId: brief.id,
    fileName: download.suggestedFilename(),
    zip: path.relative(root, zipPath),
    bundle: path.relative(root, bundleDir),
    receipt: {
      approval: receipt.approval,
      preview: receipt.preview,
      asset: receipt.asset,
      checks: receipt.checks,
    },
  };
}

function validateGeneration(report, brief, record, expected) {
  const request = record.request;
  const response = record.response;
  const packshotHash = sha256File(path.join(root, brief.packshot));
  check(report, `${brief.id}-http-ok`, record.status === 200, record.status, 200);
  check(report, `${brief.id}-browser-brief-sent`, Boolean(request.browserBrief), Boolean(request.browserBrief), true);
  check(report, `${brief.id}-no-fixture-id`, request.fixtureId === undefined, request.fixtureId, undefined);
  check(report, `${brief.id}-no-client-values`, request.values === undefined, request.values, undefined);
  check(report, `${brief.id}-audience-request`, request.browserBrief?.audience === brief.audience, request.browserBrief?.audience, brief.audience);
  check(report, `${brief.id}-objective-request`, request.browserBrief?.objective === brief.objective, request.browserBrief?.objective, brief.objective);
  check(report, `${brief.id}-audience-response`, response.preview?.brief?.audience === brief.audience, response.preview?.brief?.audience, brief.audience);
  check(report, `${brief.id}-objective-response`, response.preview?.brief?.objective === brief.objective, response.preview?.brief?.objective, brief.objective);
  check(report, `${brief.id}-asset-src-local-only`, request.browserBrief?.asset?.src === undefined, request.browserBrief?.asset?.src, undefined);
  check(report, `${brief.id}-asset-metadata-present`, Boolean(request.browserBrief?.asset?.contentHash), Boolean(request.browserBrief?.asset?.contentHash), true);
  check(report, `${brief.id}-asset-hash-request`, request.browserBrief?.asset?.contentHash === packshotHash, request.browserBrief?.asset?.contentHash, packshotHash);
  check(report, `${brief.id}-asset-hash-response`, record.preview.asset.contentHash === packshotHash, record.preview.asset.contentHash, packshotHash);
  check(report, `${brief.id}-context-owner-confirmed`, response.browserBrief?.ownerConfirmed === false, response.browserBrief?.ownerConfirmed, false);
  check(report, `${brief.id}-context-bytes-verified`, response.browserBrief?.assetBytesVerified === false, response.browserBrief?.assetBytesVerified, false);
  check(report, `${brief.id}-preview-product`, record.preview.articleText.includes(brief.productName), record.preview.articleText.includes(brief.productName), true);
  check(report, `${brief.id}-preview-offer`, record.preview.articleText.includes(brief.offer), record.preview.articleText.includes(brief.offer), true);
  check(report, `${brief.id}-preview-destination`, record.preview.links.includes(brief.destinationUrl), record.preview.links, [brief.destinationUrl]);
  check(report, `${brief.id}-preview-alt`, record.preview.asset.alt === brief.alt, record.preview.asset.alt, brief.alt);
  check(report, `${brief.id}-preview-facts`, record.preview.facts.length >= 2, record.preview.facts.length, "at least 2");
  check(
    report,
    `${brief.id}-preview-fact-values`,
    brief.facts.every((fact) =>
      record.preview.facts.some(
        (item) =>
          item.text.includes(fact.label) && item.text.includes(fact.value),
      ),
    ),
    record.preview.facts,
    brief.facts,
  );
  check(report, `${brief.id}-preview-image-local`, record.preview.asset.src?.startsWith("blob:"), record.preview.asset.src, "blob: local object URL");

  if (expected === "generated") {
    check(report, `${brief.id}-status`, response.generation?.status === "generated", response.generation?.status, "generated");
    check(report, `${brief.id}-provider-mode`, response.generation?.providerMode === "local-test", response.generation?.providerMode, "local-test");
    check(report, `${brief.id}-harness`, response.generation?.harnessVersion === "1.0.0", response.generation?.harnessVersion, "1.0.0");
    check(report, `${brief.id}-guidance`, response.generation?.guidancePackVersion === "1.0.0", response.generation?.guidancePackVersion, "1.0.0");
  } else {
    check(report, `${brief.id}-status`, response.generation?.status === "fallback", response.generation?.status, "fallback");
    check(report, `${brief.id}-code`, response.generation?.code === expected, response.generation?.code, expected);
    check(report, `${brief.id}-provider-mode`, response.generation?.providerMode === "local-test", response.generation?.providerMode, "local-test");
  }
}

async function checkApiBoundary(report) {
  const brief = BRIEFS[0];
  const response = await fetch(new URL("/api/campaign-lab/generate", cli.url), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      browserBrief: {
        schemaVersion: 1,
        brandName: brief.brandName,
        productName: brief.productName,
        audience: 42,
        objective: { goal: "Synthetic" },
        offer: brief.offer,
        destinationUrl: brief.destinationUrl,
        facts: brief.facts,
        asset: {
          fileName: path.basename(brief.packshot),
          width: 1200,
          height: 1500,
          alt: brief.alt,
          rights: brief.rights,
          contentHash: sha256File(path.join(root, brief.packshot)),
        },
        reviewedOn: "2026-11-18",
      },
    }),
  });
  const payload = await response.json();
  check(report, "api-boundary-status", response.status === 422, response.status, 422);
  check(report, "api-boundary-ok", payload.ok === false, payload.ok, false);
  const messages = (payload.issues ?? []).map((issue) => issue.message).join(" ");
  check(report, "api-boundary-audience", /Audience must be text/.test(messages), messages, "Audience must be text");
  check(report, "api-boundary-objective", /Campaign objective must be text/.test(messages), messages, "Campaign objective must be text");
  report.apiBoundary = { status: response.status, issues: payload.issues ?? [] };
}

async function main() {
  const scenario = cli.scenario;
  if (!["success", "invalid", "timeout", "stale"].includes(scenario)) {
    throw new Error(`Unknown scenario "${scenario}"`);
  }
  const outDir = path.resolve(
    root,
    cli.out ?? path.join(".local", "campaign-lab-browser-generation", scenario),
  );
  mkdirSync(outDir, { recursive: true });
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({
    executablePath: chromeExecutable(),
    headless: !cli.headed,
  });
  const report = {
    scenario,
    url: cli.url,
    outDir,
    checks: [],
    generations: [],
    export: null,
  };

  await checkApiBoundary(report);

  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    if (scenario === "stale") {
      let calls = 0;
      await page.route("**/api/campaign-lab/generate", async (route) => {
        calls += 1;
        if (calls > 1) return route.continue();
        try {
          const response = await route.fetch();
          await new Promise((resolve) => setTimeout(resolve, 1200));
          await route.fulfill({ response });
        } catch {
          // The client aborted the stale request; no response should be applied.
        }
      });
    }

    const brief = BRIEFS[0];
    await fillIntake(page, brief);

    if (scenario === "success") {
      const first = await generate(page, report, "brief-a");
      validateGeneration(report, brief, first, "generated");
      await approveAndExport(page, report, brief);

      const secondBrief = BRIEFS[1];
      await page.getByRole("button", { name: "Edit brief inputs", exact: true }).click();
      await fillIntake(page, secondBrief);
      const second = await generate(page, report, "brief-b");
      validateGeneration(report, secondBrief, second, "generated");
    } else if (scenario === "invalid" || scenario === "timeout") {
      const generation = await generate(page, report, scenario);
      validateGeneration(report, brief, generation, scenario);
      check(report, `${scenario}-approval-blocked`, generation.preview.approved !== "true", generation.preview.approved, "not approved");
    } else {
      const initial = await readPreview(page);
      const firstRequest = page.waitForRequest(
        (request) => request.url().includes("/api/campaign-lab/generate"),
        { timeout: 30_000 },
      );
      await page.getByRole("button", { name: "Generate preview", exact: true }).click();
      const request = await firstRequest;
      const firstBody = request.postDataJSON();
      await page.getByLabel("Offer", { exact: true }).fill("25% off, 27-30 November 2026");
      await page.waitForTimeout(1600);
      const afterEdit = await readPreview(page);
      check(report, "stale-preview-preserved", afterEdit.revision === initial.revision, afterEdit.revision, initial.revision);
      check(report, "stale-dirty", afterEdit.dirty === "true", afterEdit.dirty, "true");
      check(report, "stale-first-request", firstBody.browserBrief?.offer === brief.offer, firstBody.browserBrief?.offer, brief.offer);

      const second = await generate(page, report, "fresh-after-edit");
      validateGeneration(
        report,
        { ...brief, offer: "25% off, 27-30 November 2026" },
        second,
        "generated",
      );
      check(report, "stale-new-revision", second.preview.revision !== initial.revision, second.preview.revision, `not ${initial.revision}`);
    }

    await page.screenshot({ path: path.join(outDir, "final-1440.png"), fullPage: true });
    report.result = "passed";
  } finally {
    await browser.close();
  }

  writeFileSync(
    path.join(outDir, "report.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  writeFileSync(
    path.join(outDir, "report.md"),
    `# Browser-offer generation evidence\n\nScenario: ${scenario}\n\n- ${report.checks.length} checks passed\n- generations: ${report.generations.length}\n- export: ${report.export?.fileName ?? "none"}\n`,
  );
  console.log(
    JSON.stringify(
      {
        result: report.result,
        scenario,
        checks: report.checks.length,
        generations: report.generations.map((item) => ({
          label: item.label,
          status: item.response.generation?.status,
          mode: item.response.generation?.providerMode,
          code: item.response.generation?.code,
          requestAudience: item.request.browserBrief?.audience,
          requestObjective: item.request.browserBrief?.objective,
          revision: item.preview.revision,
        })),
        export: report.export?.fileName ?? null,
        out: path.relative(root, outDir),
      },
      null,
      2,
    ),
  );
}

await main();
