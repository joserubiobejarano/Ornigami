#!/usr/bin/env node
/**
 * Focused browser checks for the regressions the existing campaign-lab
 * acceptance runner does not cover.
 *
 * The existing runner already checks, for each fixture at 375 and 1440 px:
 * overflow, asset load and bytes, alt text, exact CTA destination, keyboard
 * access, legibility, approval, invalid input, missing offer/product, and
 * offer/destination edit invalidation. This script adds only:
 *
 *   - cross-page brand distinctness (the sparse and richer pages are not the
 *     same shell with different words);
 *   - intent-change opening shift with fixed offer, destination, and assets;
 *   - unsupported or invented claims on the rendered page;
 *   - old offer and old destination absence after a late revision;
 *   - a packaging-truth check that must remain unassessed and capture a crop.
 *
 * Usage:
 *   node scripts/campaign-eval-browser.mjs --urls <urls.json> [--run <run-dir>] [--out <dir>] [--headed]
 *
 * `urls.json`:
 *   {
 *     "sparse-offer":   { "generated": "...", "baseline": "..." },
 *     "rich-angle":     { "generated": "...", "baseline": "..." },
 *     "intent-change":  { "generated": "...", "baseline": "..." },
 *     "failure-revision": { "after": "...", "before": "..." },
 *     "trap-asset-label": { "generated": "..." }
 *   }
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

import {
  comparableText,
  jaccard,
  loadPack,
  offerRewriteOnly,
  scanClaims,
} from "./campaign-eval-core.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaultPack = path.join(root, "tests", "fixtures", "campaign-eval", "cases.json");
const viewports = [
  { name: "375", width: 375, height: 812, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  { name: "1440", width: 1440, height: 900, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
];
const timeoutMs = 15_000;

function usage() {
  return `Campaign evaluation focused browser checks

Usage:
  node scripts/campaign-eval-browser.mjs (--urls <urls.json> | --flow <origin>) [options]

Options:
  --urls <file>       URL map for the cases (required unless --flow is used)
  --flow <origin>     Drive the real Campaign Lab UI: load each fixture, click
                      Generate preview, and capture baseline/generated states
  --run <dir>         Existing evaluation run; uses blind-map.json labels and writes captures there
  --out <dir>         Artifact directory (default: .local/campaign-eval-browser/<timestamp>)
  --pack <file>       Case pack (default: tests/fixtures/campaign-eval/cases.json)
  --headed            Show the browser
  --require-assessed  Treat unassessed checks as a non-zero result
  --help, -h          Show this help
`;
}

function parseCli() {
  const parsed = parseArgs({
    allowPositionals: false,
    options: {
      urls: { type: "string" },
      flow: { type: "string" },
      run: { type: "string" },
      out: { type: "string" },
      pack: { type: "string" },
      headed: { type: "boolean", default: false },
      "require-assessed": { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
  });
  if (parsed.values.help) {
    console.log(usage());
    process.exit(0);
  }
  if (!parsed.values.urls && !parsed.values.flow) {
    throw new Error("Provide --urls for a URL map or --flow for the real Campaign Lab UI.");
  }
  return {
    urls: parsed.values.urls ? path.resolve(parsed.values.urls) : null,
    flow: parsed.values.flow ? parsed.values.flow.replace(/\/$/, "") : null,
    run: parsed.values.run ? path.resolve(parsed.values.run) : null,
    out: parsed.values.out ? path.resolve(parsed.values.out) : null,
    pack: path.resolve(parsed.values.pack ?? defaultPack),
    headed: parsed.values.headed,
    requireAssessed: parsed.values["require-assessed"],
  };
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-").replace("T", "_");
}

async function loadPlaywright() {
  const candidates = [
    process.env.CAMPAIGN_EVAL_PLAYWRIGHT,
    path.join(root, "scripts", "framework-prototype", "browser-tools", "node_modules", "playwright", "index.mjs"),
    path.join(path.dirname(root), "Ornigami", "scripts", "framework-prototype", "browser-tools", "node_modules", "playwright", "index.mjs"),
    path.join(root, "node_modules", "playwright", "index.mjs"),
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue;
    return import(pathToFileURL(candidate).href);
  }
  try {
    return await import("playwright");
  } catch {
    throw new Error(
      "Playwright is not installed. Run the repository browser setup or set CAMPAIGN_EVAL_PLAYWRIGHT to playwright/index.mjs.",
    );
  }
}

function resolveChromium(chromium) {
  if (process.env.CAMPAIGN_EVAL_CHROMIUM) {
    if (!existsSync(process.env.CAMPAIGN_EVAL_CHROMIUM)) throw new Error(`CAMPAIGN_EVAL_CHROMIUM does not exist: ${process.env.CAMPAIGN_EVAL_CHROMIUM}`);
    return process.env.CAMPAIGN_EVAL_CHROMIUM;
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
  throw new Error("Chromium is not installed. Set CAMPAIGN_EVAL_CHROMIUM to an installed chrome.exe.");
}

function urlFor(caseId, source, urls) {
  const entry = urls[caseId];
  if (!entry) return null;
  if (caseId === "failure-revision") {
    if (source === "generated") return entry.after ?? entry.generated ?? null;
    if (source === "baseline") return entry.before ?? entry.baseline ?? null;
  }
  return entry[source] ?? null;
}

async function extract(page) {
  return page.evaluate(() => {
    const region = document.querySelector('[aria-label="Campaign preview"]') ?? document.querySelector("main") ?? document.body;
    const content = region.querySelector("article") ?? region;
    const h1 = content.querySelector("h1") ?? document.querySelector("h1");
    const h1Style = h1 ? getComputedStyle(h1) : null;
    const contentStyle = getComputedStyle(content);
    const transparent = (value) => !value || value === "transparent" || value === "rgba(0, 0, 0, 0)";
    const background = transparent(contentStyle.backgroundColor)
      ? getComputedStyle(document.body).backgroundColor
      : contentStyle.backgroundColor;
    const links = [...content.querySelectorAll("a[href]")].map((anchor) => ({
      text: (anchor.innerText ?? "").trim(),
      href: anchor.href,
      raw: anchor.getAttribute("href"),
    }));
    const images = [...content.querySelectorAll("img")].map((image) => {
      const rect = image.getBoundingClientRect();
      return {
        src: image.currentSrc || image.src,
        alt: image.alt,
        naturalWidth: image.naturalWidth,
        naturalHeight: image.naturalHeight,
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        visible: rect.width > 0 && rect.height > 0,
      };
    });
    const sections = [...content.querySelectorAll("section")].map((section) => ({
      heading: section.querySelector("h2")?.innerText ?? "",
      text: (section.innerText ?? "").slice(0, 200),
    }));
    return {
      text: (content.innerText ?? "").trim(),
      h1: (h1?.innerText ?? "").trim(),
      h1FontFamily: h1Style?.fontFamily ?? "",
      h1FontSize: h1Style?.fontSize ?? "",
      background,
      links,
      images,
      sections,
      scrollWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
    };
  });
}

async function capturePage(page, outDir, caseId, label, viewportName) {
  const dir = path.join(outDir, "captures", caseId, label);
  mkdirSync(dir, { recursive: true });
  await page.addStyleTag({ content: "nextjs-portal{display:none !important;}" }).catch(() => {});
  const full = path.join(dir, `${viewportName}.png`);
  const article = await page.evaluateHandle(() =>
    document.querySelector('[aria-label="Campaign preview"] article') ??
    document.querySelector("article") ??
    document.querySelector("main") ??
    document.body,
  );
  const element = article.asElement();
  if (element) {
    await element.screenshot({ path: full });
  } else {
    await page.screenshot({ path: full, fullPage: true });
  }
  const images = await page.evaluate(() =>
    [...document.querySelectorAll("main img, body img")].map((image) => {
      const rect = image.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    }),
  );
  let crop = null;
  const first = images.find((image) => image.width > 0 && image.height > 0);
  if (first) {
    crop = path.join(dir, `product-${viewportName}.png`);
    await page.screenshot({
      path: crop,
      fullPage: true,
      clip: {
        x: Math.max(0, first.x),
        y: Math.max(0, first.y),
        width: Math.min(first.width, viewports.find((item) => item.name === viewportName).width),
        height: Math.min(first.height, 2400),
      },
    });
  }
  return { full, crop };
}

function add(checks, id, state, detail, evidence = {}) {
  checks.push({ id, state, detail, evidence });
}

function revisionValues(loaded) {
  return loaded.casesById.get("failure-revision")?.expected.revision;
}

function findActionLink(data, actionLabel) {
  return data.links.find((link) => comparableText(link.text).includes(comparableText(actionLabel)));
}

function imageSet(data) {
  return [...new Set(data.images.map((image) => image.src))].sort();
}

async function runCheckPages({ browser, urls, loaded, outDir, blindMap }) {
  const checks = [];
  const captures = [];
  const pages = new Map(); // caseId -> label -> viewport -> data
  const sources = new Map(); // `${caseId}/${label}` -> source

  for (const caseDef of loaded.pack.cases) {
    const mapping = blindMap?.cases?.[caseDef.id]?.mapping;
    const entries = mapping
      ? Object.entries(mapping).map(([label, value]) => ({ label, source: value.source }))
      : Object.keys(urls[caseDef.id] ?? {}).map((key) => ({
          label: key,
          source: caseDef.id === "failure-revision"
            ? key === "after" ? "generated" : key === "before" ? "baseline" : key
            : key,
        }));
    if (!entries.length) {
      add(checks, "url-supplied", "unassessed", `No URL supplied for ${caseDef.id}.`, { caseId: caseDef.id });
      continue;
    }
    pages.set(caseDef.id, {});
    for (const entry of entries) {
      sources.set(`${caseDef.id}/${entry.label}`, entry.source);
      const url = urlFor(caseDef.id, entry.source, urls);
      if (!url) {
        add(checks, `url-supplied-${entry.source}`, "unassessed", `No URL supplied for ${caseDef.id}/${entry.source}.`, { caseId: caseDef.id, source: entry.source });
        continue;
      }
      pages.get(caseDef.id)[entry.label] = {};
      for (const viewport of viewports) {
        const context = await browser.newContext({
          viewport: { width: viewport.width, height: viewport.height },
          screen: { width: viewport.width, height: viewport.height },
          deviceScaleFactor: viewport.deviceScaleFactor,
          isMobile: viewport.isMobile,
          hasTouch: viewport.hasTouch,
          reducedMotion: "reduce",
          locale: "en-US",
          timezoneId: "UTC",
        });
        const page = await context.newPage();
        try {
          const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: timeoutMs });
          if (response && !response.ok()) {
            add(checks, "page-reachable", "failed", `${url} returned HTTP ${response.status()}.`, { caseId: caseDef.id, source: entry.source, url });
            await context.close();
            continue;
          }
          await page.evaluate(() => document.fonts?.ready ?? Promise.resolve()).catch(() => {});
          await page.waitForTimeout(200);
          const data = await extract(page);
          pages.get(caseDef.id)[entry.label][viewport.name] = data;
          const capture = await capturePage(page, outDir, caseDef.id, entry.label, viewport.name);
          captures.push({ caseId: caseDef.id, label: entry.label, source: entry.source, viewport: viewport.name, ...capture });
          add(checks, `capture-${caseDef.id}-${entry.label}-${viewport.name}`, "passed", `Captured ${caseDef.id}/${entry.label} at ${viewport.width} px.`, capture);
          const overflow = data.scrollWidth > data.viewportWidth + 1;
          add(checks, `no-overflow-${caseDef.id}-${entry.label}-${viewport.name}`, overflow ? "failed" : "passed", overflow ? `The page scrolls horizontally at ${viewport.width} px.` : `No horizontal overflow at ${viewport.width} px.`, { scrollWidth: data.scrollWidth, viewportWidth: data.viewportWidth });
        } catch (error) {
          add(checks, `page-reachable-${caseDef.id}-${entry.source}`, "failed", `Could not load ${url}: ${error.message}`, { caseId: caseDef.id, source: entry.source, url });
        } finally {
          await context.close();
        }
      }
    }
  }

  return { checks, captures, pages, sources };
}

function pickPage(pages, sources, caseId, source, viewport = "1440") {
  const labels = pages.get(caseId);
  if (!labels) return null;
  for (const [label, byViewport] of Object.entries(labels)) {
    if (sources.get(`${caseId}/${label}`) === source) return byViewport[viewport] ?? null;
  }
  return Object.values(labels)[0]?.[viewport] ?? null;
}

function checkClaims({ checks, pages, sources, loaded }) {
  for (const caseDef of loaded.pack.cases) {
    const labels = pages.get(caseDef.id);
    if (!labels) continue;
    for (const [label, byViewport] of Object.entries(labels)) {
      const data = byViewport["1440"] ?? byViewport["375"];
      if (!data) continue;
      const source = sources.get(`${caseDef.id}/${label}`);
      let fixed = {};
      if (caseDef.role === "failure-revision") {
        const revision = caseDef.expected.revision;
        fixed = source === "generated"
          ? { offer: revision.to.offer, destinationUrl: revision.to.destinationUrl }
          : { offer: revision.from.offer, destinationUrl: revision.from.destinationUrl };
      }
      const scan = scanClaims(data.text, caseDef, loaded.pack, fixed);
      add(
        checks,
        `unsupported-claims-${caseDef.id}-${label}`,
        scan.ok ? "passed" : "failed",
        scan.ok
          ? "The rendered page contains no known unsupported claim, invented proof, or untraceable number."
          : [
              scan.forbiddenFound.length ? `Forbidden claim(s): ${scan.forbiddenFound.join(", ")}.` : "",
              scan.proofFound.length ? "Invented proof or review language is present." : "",
              scan.absoluteFound.length ? "An absolute guarantee is present." : "",
              scan.unsupportedNumbers.length ? `Untraceable number(s): ${scan.unsupportedNumbers.join(", ")}.` : "",
            ].filter(Boolean).join(" "),
        scan,
      );
    }
  }
}

function checkBrandDistinct({ checks, pages, sources, loaded }) {
  const sparseData = pickPage(pages, sources, "sparse-offer", "generated");
  const richData = pickPage(pages, sources, "rich-angle", "generated");
  if (!sparseData || !richData) {
    add(checks, "brand-and-evidence-distinct", "unassessed", "Both sparse and richer generated pages must render at 1440 px.");
    return;
  }
  const sparseCase = loaded.casesById.get("sparse-offer");
  const richCase = loaded.casesById.get("rich-angle");
  const fontDiffers = comparableText(sparseData.h1FontFamily) !== comparableText(richData.h1FontFamily);
  const backgroundDiffers = sparseData.background !== richData.background;
  const brandText = comparableText(sparseData.text).includes(comparableText(sparseCase.campaign.brandName)) &&
    comparableText(richData.text).includes(comparableText(richCase.campaign.brandName));
  const evidenceDiffers =
    richData.images.filter((image) => image.visible).length > sparseData.images.filter((image) => image.visible).length ||
    richData.text.length > sparseData.text.length * 1.15 ||
    richData.sections.length > sparseData.sections.length;
  const ok = fontDiffers && backgroundDiffers && brandText && evidenceDiffers;
  add(
    checks,
    "brand-and-evidence-distinct",
    ok ? "passed" : "failed",
    ok
      ? "The sparse and richer pages differ in brand type, background, and evidence density; they are not the same shell with new words."
      : [
          !fontDiffers ? "Display font family is identical." : "",
          !backgroundDiffers ? "Page background is identical." : "",
          !brandText ? "A page does not show its approved brand name." : "",
          !evidenceDiffers ? "The richer page does not show more images, sections, or text." : "",
        ].filter(Boolean).join(" "),
    { fontDiffers, backgroundDiffers, brandText, evidenceDiffers },
  );
}

function checkIntentShift({ checks, pages, sources, loaded }) {
  const richData = pickPage(pages, sources, "rich-angle", "generated");
  const intentData = pickPage(pages, sources, "intent-change", "generated");
  if (!richData || !intentData) {
    add(checks, "intent-opening-shift", "unassessed", "Both richer and intent-change generated pages must render at 1440 px.");
    return;
  }
  const caseDef = loaded.casesById.get("intent-change");
  const fixed = caseDef.mustStayExact;
  const intentLink = findActionLink(intentData, fixed.actionLabel);
  const richLink = findActionLink(richData, fixed.actionLabel);
  const headlinesDiffer = comparableText(richData.h1) !== comparableText(intentData.h1);
  const overlap = jaccard(richData.h1, intentData.h1);
  const offerFixed = comparableText(intentData.text).includes(comparableText(fixed.offer)) && comparableText(richData.text).includes(comparableText(fixed.offer));
  const destinationFixed = intentLink?.href === fixed.destinationUrl && richLink?.href === fixed.destinationUrl;
  const assetsFixed = JSON.stringify(imageSet(richData)) === JSON.stringify(imageSet(intentData)) && imageSet(richData).length > 0;
  const angleTerms = caseDef.expected.openingShift.openingTerms;
  const anglePresent = angleTerms.some((term) => comparableText(intentData.h1).includes(comparableText(term)));
  const ok = headlinesDiffer && overlap < 0.6 && offerFixed && destinationFixed && assetsFixed && anglePresent;
  add(
    checks,
    "intent-opening-shift",
    ok ? "passed" : "failed",
    ok
      ? `The intent-change page opens differently (headline overlap ${overlap}) while the offer, destination, and asset identity stay fixed.`
      : [
          !headlinesDiffer ? "The headline is unchanged from the richer page." : "",
          overlap >= 0.6 ? `The headline is too close to the richer page (overlap ${overlap}).` : "",
          !offerFixed ? "The approved offer is not fixed across both pages." : "",
          !destinationFixed ? "The action destination is not fixed across both pages." : "",
          !assetsFixed ? "The rendered asset identity is not fixed across both pages." : "",
          !anglePresent ? `The opening lacks the new angle terms: ${angleTerms.join(", ")}.` : "",
        ].filter(Boolean).join(" "),
    { headlinesDiffer, overlap, offerFixed, destinationFixed, assetsFixed, anglePresent },
  );
}

function standalone(value, text) {
  const escaped = String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  return new RegExp(`(?<![\\w.-])${escaped}(?![\\w.-])`, "i").test(text);
}

function checkRevision({ checks, pages, sources, loaded }) {
  const beforeData = pickPage(pages, sources, "failure-revision", "baseline");
  const afterData = pickPage(pages, sources, "failure-revision", "generated");
  if (!beforeData || !afterData) {
    add(checks, "revision-old-values-absent", "unassessed", "Both before and after revision pages must render at 1440 px.");
    return;
  }
  const revision = revisionValues(loaded);
  if (!revision) {
    add(checks, "revision-old-values-absent", "unassessed", "The pack does not declare a revision for failure-revision.");
    return;
  }
  const afterLink = findActionLink(afterData, loaded.casesById.get("failure-revision").campaign.actionLabel);
  const newOfferPresent = comparableText(afterData.text).includes(comparableText(revision.to.offer));
  const newDestinationPresent = afterLink?.href === revision.to.destinationUrl;
  const oldOfferPresent = standalone(revision.from.offer, afterData.text);
  const oldDestinationPresent =
    standalone(revision.from.destinationUrl, afterData.text) ||
    afterData.links.some((link) => link.href === revision.from.destinationUrl || link.raw === revision.from.destinationUrl);
  const headlinePreserved = offerRewriteOnly(beforeData.h1, afterData.h1, revision.from.offer, revision.to.offer);
  const imagesPreserved = JSON.stringify(imageSet(beforeData)) === JSON.stringify(imageSet(afterData));
  const ok = newOfferPresent && newDestinationPresent && !oldOfferPresent && !oldDestinationPresent && headlinePreserved && imagesPreserved;
  add(
    checks,
    "revision-old-values-absent",
    ok ? "passed" : "failed",
    ok
      ? "The late revision shows the exact new offer and destination, removes the old values from text and links, and preserves the headline and image identity."
      : [
          !newOfferPresent ? "The new offer is not visible." : "",
          !newDestinationPresent ? "The new destination is not on the primary action." : "",
          oldOfferPresent ? "The old offer is still visible." : "",
          oldDestinationPresent ? "The old destination is still present in text or links." : "",
          !headlinePreserved ? "The revision changed the headline." : "",
          !imagesPreserved ? "The revision changed the image identity." : "",
        ].filter(Boolean).join(" "),
    { newOfferPresent, newDestinationPresent, oldOfferPresent, oldDestinationPresent, headlinePreserved, imagesPreserved },
  );
}

function checkTrap({ checks, pages, loaded }) {
  const trapCase = loaded.casesById.get("trap-asset-label");
  const trapPages = pages.get("trap-asset-label");
  if (!trapCase || !trapPages) {
    add(checks, "packaging-truth-human-only", "unassessed", "No trap-asset-label URL was supplied.");
    return;
  }
  const captureCount = Object.values(trapPages).reduce((total, byViewport) => total + Object.keys(byViewport).length, 0);
  add(
    checks,
    "packaging-truth-human-only",
    "unassessed",
    "The rendered asset path, bytes, alt text, and page text can be verified, but the printed packaging label cannot. A human must open the product crop.",
    {
      trap: trapCase.trap,
      captureCount,
      requiredHumanCheck: trapCase.proofBoundary.humanOnly,
    },
  );
}

function labelForSource(blindMap, caseId, source) {
  const mapping = blindMap?.cases?.[caseId]?.mapping;
  if (!mapping) return null;
  for (const [label, value] of Object.entries(mapping)) {
    if (value.source === source) return label;
  }
  return null;
}

async function openFlowPage(browser, origin, fixture, viewport) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    screen: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: viewport.deviceScaleFactor,
    isMobile: viewport.isMobile,
    hasTouch: viewport.hasTouch,
    reducedMotion: "reduce",
    locale: "en-US",
    timezoneId: "UTC",
  });
  const page = await context.newPage();
  const response = await page.goto(`${origin}/campaign-lab?fixture=${fixture}`, {
    waitUntil: "domcontentloaded",
    timeout: timeoutMs,
  });
  if (response && !response.ok()) {
    await context.close();
    throw new Error(`/campaign-lab?fixture=${fixture} returned HTTP ${response.status()}`);
  }
  await page.evaluate(() => document.fonts?.ready ?? Promise.resolve()).catch(() => {});
  await page.waitForTimeout(300);
  return { context, page };
}

async function generateOnPage(page) {
  await page.getByRole("button", { name: "Generate preview" }).click({ timeout: timeoutMs });
  await page.waitForFunction(() => {
    const status = document.querySelector("[data-generation-status]")?.getAttribute("data-generation-status");
    return status === "generated" || status === "fallback";
  }, { timeout: timeoutMs }).catch(() => {});
  await page.waitForTimeout(250);
}

async function snapshotFlowState({ page, checks, captures, outDir, caseId, label, viewport }) {
  const data = await extract(page);
  const capture = await capturePage(page, outDir, caseId, label, viewport.name);
  captures.push({ caseId, label, source: null, viewport: viewport.name, ...capture });
  add(checks, `capture-${caseId}-${label}-${viewport.name}`, "passed", `Captured ${caseId}/${label} at ${viewport.width} px.`, capture);
  const overflow = data.scrollWidth > data.viewportWidth + 1;
  add(checks, `no-overflow-${caseId}-${label}-${viewport.name}`, overflow ? "failed" : "passed", overflow ? `The page scrolls horizontally at ${viewport.width} px.` : `No horizontal overflow at ${viewport.width} px.`, { scrollWidth: data.scrollWidth, viewportWidth: data.viewportWidth });
  return data;
}

async function runFlowPages({ browser, flow, loaded, outDir, blindMap }) {
  const checks = [];
  const captures = [];
  const pages = new Map();
  const sources = new Map();
  const state = (caseId, label, source) => {
    if (!pages.has(caseId)) pages.set(caseId, {});
    if (!pages.get(caseId)[label]) pages.get(caseId)[label] = {};
    sources.set(`${caseId}/${label}`, source);
  };

  for (const [fixture, caseId] of [["sparse", "sparse-offer"], ["long-copy", "rich-angle"]]) {
    const baselineLabel = labelForSource(blindMap, caseId, "baseline") ?? "baseline";
    const generatedLabel = labelForSource(blindMap, caseId, "generated") ?? "generated";
    state(caseId, baselineLabel, "baseline");
    state(caseId, generatedLabel, "generated");
    for (const viewport of viewports) {
      const baseline = await openFlowPage(browser, flow, fixture, viewport);
      try {
        pages.get(caseId)[baselineLabel][viewport.name] = await snapshotFlowState({
          page: baseline.page,
          checks,
          captures,
          outDir,
          caseId,
          label: baselineLabel,
          viewport,
        });
      } catch (error) {
        add(checks, `page-reachable-${caseId}-${viewport.name}`, "failed", error.message, { caseId, fixture, viewport: viewport.name });
      } finally {
        await baseline.context.close();
      }

      const generated = await openFlowPage(browser, flow, fixture, viewport);
      try {
        await generateOnPage(generated.page);
        pages.get(caseId)[generatedLabel][viewport.name] = await snapshotFlowState({
          page: generated.page,
          checks,
          captures,
          outDir,
          caseId,
          label: generatedLabel,
          viewport,
        });
        const status = await generated.page.evaluate(() => document.querySelector("[data-generation-status]")?.getAttribute("data-generation-status"));
        add(checks, `generation-status-${caseId}-${viewport.name}`, status === "generated" || status === "fallback" ? "passed" : "failed", `Generation status is ${status ?? "missing"}.`, { status });
      } catch (error) {
        add(checks, `generation-${caseId}-${viewport.name}`, "failed", error.message, { caseId, fixture, viewport: viewport.name });
      } finally {
        await generated.context.close();
      }
    }
  }

  const revisionCase = loaded.casesById.get("failure-revision");
  const beforeLabel = labelForSource(blindMap, "failure-revision", "baseline") ?? "baseline";
  const afterLabel = labelForSource(blindMap, "failure-revision", "generated") ?? "generated";
  state("failure-revision", beforeLabel, "baseline");
  state("failure-revision", afterLabel, "generated");
  for (const viewport of viewports) {
    const revision = await openFlowPage(browser, flow, "sparse", viewport);
    try {
      await generateOnPage(revision.page);
      pages.get("failure-revision")[beforeLabel][viewport.name] = await snapshotFlowState({
        page: revision.page,
        checks,
        captures,
        outDir,
        caseId: "failure-revision",
        label: beforeLabel,
        viewport,
      });
      await revision.page.getByLabel("Offer", { exact: true }).fill("25% off, 27–30 November 2026");
      await revision.page.getByLabel("Destination URL", { exact: true }).fill("https://example.com/harbor-field-offer");
      await generateOnPage(revision.page);
      pages.get("failure-revision")[afterLabel][viewport.name] = await snapshotFlowState({
        page: revision.page,
        checks,
        captures,
        outDir,
        caseId: "failure-revision",
        label: afterLabel,
        viewport,
      });
      const status = await revision.page.evaluate(() => document.querySelector("[data-generation-status]")?.getAttribute("data-generation-status"));
      add(checks, `revision-generation-status-${viewport.name}`, status === "generated" || status === "fallback" ? "passed" : "failed", `Revision generation status is ${status ?? "missing"}.`, { status });
    } catch (error) {
      add(checks, `revision-${viewport.name}`, "failed", error.message, { viewport: viewport.name });
    } finally {
      await revision.context.close();
    }
  }

  if (!revisionCase) {
    add(checks, "revision-case", "unassessed", "The pack does not define failure-revision.");
  }

  return { checks, captures, pages, sources };
}
async function main() {
  const options = parseCli();
  const loaded = loadPack(options.pack);
  let urls = null;
  if (options.urls) {
    if (!existsSync(options.urls)) throw new Error(`URL map not found: ${options.urls}`);
    urls = JSON.parse(readFileSync(options.urls, "utf8"));
  }
  const outDir = options.out ?? (options.run ? options.run : path.join(root, ".local", "campaign-eval-browser", timestamp()));
  mkdirSync(outDir, { recursive: true });
  const blindMapPath = options.run ? path.join(options.run, "blind-map.json") : null;
  const blindMap = blindMapPath && existsSync(blindMapPath) ? JSON.parse(readFileSync(blindMapPath, "utf8")) : null;

  const playwright = await loadPlaywright();
  const browser = await playwright.chromium.launch({
    headless: !options.headed,
    executablePath: resolveChromium(playwright.chromium),
  });

  let checks = [];
  let captures = [];
  try {
    const run = options.flow
      ? await runFlowPages({ browser, flow: options.flow, loaded, outDir, blindMap })
      : await runCheckPages({ browser, urls, loaded, outDir, blindMap });
    checks = run.checks;
    captures = run.captures;
    checkClaims({ checks, pages: run.pages, sources: run.sources, loaded });
    checkBrandDistinct({ checks, pages: run.pages, sources: run.sources, loaded });
    checkIntentShift({ checks, pages: run.pages, sources: run.sources, loaded });
    checkRevision({ checks, pages: run.pages, sources: run.sources, loaded });
    checkTrap({ checks, pages: run.pages, loaded });
  } finally {
    await browser.close();
  }

  const counts = { passed: 0, failed: 0, unassessed: 0 };
  for (const item of checks) counts[item.state] = (counts[item.state] ?? 0) + 1;
  const report = { schemaVersion: 1, flow: options.flow, urlMap: options.urls, blindMap: blindMapPath, counts, checks, captures };
  writeFileSync(path.join(outDir, "browser-report.json"), `${JSON.stringify(report, null, 2)}\n`);

  const lines = [
    "# Campaign evaluation focused browser report",
    "",
    `- Flow: \`${options.flow ?? "(none)"}\``,
    `- URL map: \`${options.urls ?? "(none)"}\``,
    `- Blind map: \`${blindMapPath ?? "(none)"}\``,
    `- Passed: ${counts.passed} · Failed: ${counts.failed} · Unassessed: ${counts.unassessed}`,
    "",
    "## Checks",
    "",
    "| Check | State | Detail |",
    "| --- | --- | --- |",
    ...checks.map((item) => `| ${item.id} | ${item.state === "passed" ? "pass" : item.state === "failed" ? "FAIL" : "unassessed"} | ${String(item.detail).replace(/\|/g, "\\|")} |`),
    "",
    "## Captures",
    "",
    ...captures.map((item) => `- \`${path.relative(outDir, item.full)}\`${item.crop ? ` · crop \`${path.relative(outDir, item.crop)}\`` : ""}`),
    "",
    "## What this does not prove",
    "",
    "- The printed packaging label, the brand fit, and the composition quality remain human review.",
    "- The existing acceptance runner still owns overflow, asset bytes, exact CTA destination, keyboard access, legibility, approval, invalid input, and edit invalidation.",
    "",
  ];
  const reportPath = path.join(outDir, "browser-report.md");
  writeFileSync(reportPath, `${lines.join("\n")}\n`);

  console.log(`Browser report: ${path.relative(root, reportPath)}`);
  console.log(`Passed ${counts.passed}, failed ${counts.failed}, unassessed ${counts.unassessed}.`);
  for (const item of checks.filter((entry) => entry.state !== "passed")) {
    console.log(`- ${item.id}: ${item.state} — ${item.detail}`);
  }
  process.exitCode = counts.failed > 0 || (options.requireAssessed && counts.unassessed > 0) ? 1 : 0;
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 2;
});
