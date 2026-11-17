#!/usr/bin/env node
/**
 * Focused browser check for a local Campaign Lab pilot.
 *
 * It reads the local proposed acceptance manifest, drives the real editor at
 * 375 and 1440 px, verifies the first-screen hierarchy, an approved-opening
 * change, required fact group visibility, and an offer/destination revision
 * that must be reviewed and approved again. It does not contain pilot copy or
 * assets; required fact values are read from the local pilot manifest.
 *
 * Usage:
 *   node scripts/campaign-lab-momisa-check.mjs `
 *     --url http://localhost:3100 `
 *     --manifest .local/campaign-lab-pilots/momisa/acceptance.json
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

const root = process.cwd();
const { values: cli } = parseArgs({
  options: {
    url: { type: "string", short: "u", default: "http://localhost:3100" },
    manifest: { type: "string", short: "m", default: ".local/campaign-lab-pilots/momisa/acceptance.json" },
    "pilot-manifest": { type: "string", default: ".local/campaign-lab-pilots/momisa/manifest.json" },
    out: { type: "string", short: "o" },
  },
});

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
    return import(pathToFileURL(candidate).href);
  }
  return import("playwright");
}

function chromiumExecutable(chromium) {
  if (process.env.CAMPAIGN_LAB_CHROMIUM && existsSync(process.env.CAMPAIGN_LAB_CHROMIUM)) {
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
  throw new Error("Chromium is not installed. Set CAMPAIGN_LAB_CHROMIUM or install Playwright Chromium.");
}

function check(report, name, passed, observed, expected) {
  report.checks.push({ name, passed, observed, expected });
}

async function snapshot(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector("[data-preview-canvas]");
    const article = canvas?.querySelector("article");
    const text = article?.innerText ?? "";
    const links = [...(canvas?.querySelectorAll("a") ?? [])].map((node) => node.getAttribute("href"));
    const image = canvas?.querySelector("img");
    const rect = (node) => node ? (() => {
      const value = node.getBoundingClientRect();
      return { top: Math.round(value.top), bottom: Math.round(value.bottom), left: Math.round(value.left), right: Math.round(value.right), width: Math.round(value.width), height: Math.round(value.height) };
    })() : null;
    return {
      generation: document.querySelector("[data-generation-status]")?.getAttribute("data-generation-status"),
      revision: document.querySelector("[data-revision]")?.getAttribute("data-revision"),
      approved: document.querySelector("[data-approved]")?.getAttribute("data-approved"),
      approveDisabled: [...document.querySelectorAll("button")].find((node) => node.innerText.includes("Approve"))?.disabled,
      headline: article?.querySelector("h1")?.innerText,
      facts: document.querySelector("[data-fact-ids]")?.getAttribute("data-fact-ids"),
      sections: document.querySelector("[data-section-order]")?.getAttribute("data-section-order"),
      image: image ? { src: image.getAttribute("src"), alt: image.getAttribute("alt"), complete: image.complete, naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight } : null,
      imageRect: rect(image),
      offerRect: rect(article?.querySelector('[data-role="offer"]')),
      actionRect: rect(canvas?.querySelector("a")),
      headlineRect: rect(article?.querySelector("h1")),
      text,
      links,
    };
  });
}

async function generatePreview(page) {
  const button = page.getByRole("button", { name: "Generate preview", exact: true });
  const [response] = await Promise.all([
    page.waitForResponse(
      (result) => new URL(result.url()).pathname === "/api/campaign-lab/generate" &&
        result.request().method() === "POST",
      { timeout: 15_000 },
    ),
    button.click(),
  ]);
  if (!response.ok()) throw new Error("The generate request returned HTTP " + response.status());
  await button.and(page.locator(":enabled")).waitFor({ timeout: 15_000 });
  await page.locator('[data-template][data-generation-status="generated"]').waitFor({ timeout: 15_000 });
}

async function capture(page, out, name, width) {
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}" }).catch(() => {});
  await page.screenshot({ path: path.join(out, `${name}-${width}-full.png`), fullPage: true });
  await page.locator("[data-preview-canvas]").screenshot({ path: path.join(out, `${name}-${width}-preview.png`) });
  await page.evaluate(() => {
    const element = document.querySelector("[data-preview-canvas]");
    if (!element) return;
    window.scrollTo({ top: element.getBoundingClientRect().top + window.scrollY, behavior: "instant" });
  });
  await page.waitForTimeout(150);
  await page.screenshot({ path: path.join(out, `${name}-${width}-first-screen.png`) });
}

async function main() {
  const manifestPath = path.resolve(root, cli.manifest);
  if (!existsSync(manifestPath)) {
    throw new Error(`Local pilot manifest not found: ${manifestPath}`);
  }
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const fixture = manifest.fixtures?.[0];
  if (!fixture) throw new Error("The pilot manifest has no fixture.");

  const pilotManifestPath = path.resolve(root, cli["pilot-manifest"]);
  const pilotManifest = existsSync(pilotManifestPath)
    ? JSON.parse(readFileSync(pilotManifestPath, "utf8"))
    : null;
  const requiredFactValues = [];
  if (pilotManifest) {
    const facts = pilotManifest.fixture?.brief?.productFacts ?? [];
    for (const group of pilotManifest.fixture?.brief?.requiredFactGroups ?? []) {
      for (const id of group.factIds) {
        const fact = facts.find((candidate) => candidate.id === id);
        if (fact) requiredFactValues.push(fact.value);
      }
    }
  }
  const out = cli.out ? path.resolve(cli.out) : path.join(root, ".local", "momisa-check", timestamp());
  mkdirSync(out, { recursive: true });

  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({ headless: true, executablePath: chromiumExecutable(chromium) });
  const report = {
    target: cli.url,
    manifest: path.relative(root, manifestPath),
    pilotManifest: existsSync(pilotManifestPath) ? path.relative(root, pilotManifestPath) : null,
    requiredFactValues,
    out,
    checks: [],
    widths: {},
  };

  for (const width of [375, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: width === 375 ? 812 : 900 }, deviceScaleFactor: 1 });
    const logs = [];
    page.on("console", (message) => {
      if (message.type() === "error" && !message.text().includes("WebSocket")) logs.push(message.text());
    });
    page.on("pageerror", (error) => logs.push(`pageerror: ${error.message}`));
    const url = new URL(fixture.url, cli.url).href;
    await page.goto(url, { waitUntil: "networkidle" });
    const generateButton = page.getByRole("button", { name: "Generate preview", exact: true });
    await generateButton.waitFor({ state: "visible", timeout: 15_000 });
    await page.waitForFunction(() => {
      const button = [...document.querySelectorAll("button")].find((node) => node.innerText.includes("Generate preview"));
      return button && !button.disabled;
    }, null, { timeout: 15_000 });
    await page.waitForTimeout(500);
    await page.addStyleTag({ content: "nextjs-portal{display:none!important}" }).catch(() => {});

    const initial = await snapshot(page);
    check(report, `${width}:initial-idle`, initial.generation === "idle", initial.generation, "idle");
    check(report, `${width}:preview-status`, await page.locator("[data-preview-status]").getAttribute("data-preview-status") === "preview", await page.locator("[data-preview-status]").getAttribute("data-preview-status"), "preview");
    check(report, `${width}:approved-asset`, initial.image?.src === fixture.image.path && initial.image?.alt === fixture.image.alt, initial.image, fixture.image);
    check(
      report,
      `${width}:initial-required-facts`,
      requiredFactValues.every((value) => initial.text.includes(value)),
      requiredFactValues,
      "all required fact values visible in the deterministic draft",
    );

    await page.evaluate(() => {
      const element = document.querySelector("[data-preview-canvas]");
      if (!element) return;
      window.scrollTo({ top: element.getBoundingClientRect().top + window.scrollY, behavior: "instant" });
    });
    await page.waitForTimeout(150);
    const firstScreen = await page.evaluate(() => {
      const article = document.querySelector("[data-preview-canvas] article");
      const canvas = document.querySelector("[data-preview-canvas]");
      const rect = (node) => node ? (() => { const r = node.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), width: Math.round(r.width), height: Math.round(r.height) }; })() : null;
      const image = canvas?.querySelector("img");
      const h1 = article?.querySelector("h1");
      const action = canvas?.querySelector("a");
      const offer = article?.querySelector('[data-role="offer"]');
      return { viewport: window.innerHeight, h1: rect(h1), image: rect(image), action: rect(action), offer: rect(offer) };
    });
    const firstScreenPass = Boolean(
      firstScreen.h1 && firstScreen.h1.top >= 0 &&
      firstScreen.offer && firstScreen.offer.bottom <= firstScreen.viewport &&
      firstScreen.action && firstScreen.action.bottom <= firstScreen.viewport &&
      firstScreen.image && firstScreen.image.top < firstScreen.viewport && firstScreen.image.bottom <= firstScreen.viewport,
    );
    check(report, `${width}:first-screen`, firstScreenPass, firstScreen, "headline, offer, action, and packshot inside the first viewport");
    await capture(page, out, "initial", width);

    await generatePreview(page);
    const generated = await snapshot(page);
    check(report, `${width}:generate`, generated.generation === "generated", generated.generation, "generated");
    check(report, `${width}:generated-asset`, generated.image?.src === fixture.image.path, generated.image, fixture.image);
    check(report, `${width}:generated-offer`, generated.text.includes(fixture.offer), fixture.offer, fixture.offer);
    check(report, `${width}:generated-destination`, generated.links.includes(fixture.destination), generated.links, fixture.destination);
    check(
      report,
      `${width}:generated-required-facts`,
      requiredFactValues.every((value) => generated.text.includes(value)),
      requiredFactValues,
      "all required fact values visible",
    );
    await page.getByRole("button", { name: "Approve preview locally", exact: true }).click();
    await page.waitForTimeout(200);
    const approved = await snapshot(page);
    check(report, `${width}:approve`, approved.approved === "true", approved.approved, "true");
    await capture(page, out, "generated-approved", width);

    const opening = page.getByLabel("Opening focus", { exact: true });
    if (await opening.count()) {
      const options = await opening.locator("option").evaluateAll((nodes) => nodes.map((node) => node.value).filter(Boolean));
      const current = await opening.inputValue();
      const next = options.find((option) => option !== current);
      if (next) {
        await opening.selectOption(next);
        await generatePreview(page);
        const changed = await snapshot(page);
        check(report, `${width}:opening-changes-headline`, changed.headline !== generated.headline, { before: generated.headline, after: changed.headline }, "different approved opening");
        check(report, `${width}:opening-preserves-offer`, changed.text.includes(fixture.offer), fixture.offer, fixture.offer);
        check(report, `${width}:opening-preserves-destination`, changed.links.includes(fixture.destination), changed.links, fixture.destination);
        check(report, `${width}:opening-preserves-asset`, changed.image?.src === generated.image?.src, changed.image, generated.image);
        check(report, `${width}:opening-invalidates-approval`, changed.approved === "false", changed.approved, "false");
        check(
          report,
          `${width}:opening-required-facts`,
          requiredFactValues.every((value) => changed.text.includes(value)),
          requiredFactValues,
          "all required fact values visible",
        );
        await capture(page, out, "opening-changed", width);
      }
    }

    const revisedOffer = "25% off the Momisa Glow Box for a future campaign preview";
    const revisedDestination = "https://example.com/momisa-preview-revised";
    await page.getByLabel("Offer", { exact: true }).fill(revisedOffer);
    await page.getByLabel("Destination URL", { exact: true }).fill(revisedDestination);
    await generatePreview(page);
    const revised = await snapshot(page);
    check(report, `${width}:revision-new-offer`, revised.text.includes(revisedOffer), revisedOffer, revisedOffer);
    check(report, `${width}:revision-old-offer-absent`, !revised.text.includes(fixture.offer), fixture.offer, "absent");
    check(report, `${width}:revision-new-destination`, revised.links.includes(revisedDestination), revised.links, revisedDestination);
    check(report, `${width}:revision-old-destination-absent`, !revised.links.includes(fixture.destination), revised.links, "absent");
    check(report, `${width}:revision-preserves-asset`, revised.image?.src === generated.image?.src, revised.image, generated.image);
    check(report, `${width}:revision-invalidates-approval`, revised.approved === "false", revised.approved, "false");
    check(report, `${width}:revision-needs-approval`, revised.approveDisabled === false, revised.approveDisabled, false);
    check(
      report,
      `${width}:revision-required-facts`,
      requiredFactValues.every((value) => revised.text.includes(value)),
      requiredFactValues,
      "all required fact values visible",
    );
    await capture(page, out, "revision-pending-approval", width);
    await page.getByRole("button", { name: "Approve preview locally", exact: true }).click();
    await page.waitForTimeout(200);
    const revisedApproved = await snapshot(page);
    check(report, `${width}:revision-approve`, revisedApproved.approved === "true", revisedApproved.approved, "true");
    await capture(page, out, "revision-approved", width);

    check(report, `${width}:console`, logs.length === 0, logs, "no console errors");
    report.widths[width] = { initial, firstScreen, generated, approved, revised, revisedApproved, logs };
    await page.close();
  }

  await browser.close();
  const failed = report.checks.filter((item) => !item.passed);
  report.status = failed.length === 0 ? "passed" : "failed";
  report.failed = failed;
  writeFileSync(path.join(out, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ status: report.status, out, checks: report.checks.length, failed: failed.length, failures: failed }, null, 2));
  return failed.length === 0 ? 0 : 1;
}

process.exitCode = await main();
