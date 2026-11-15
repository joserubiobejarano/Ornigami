#!/usr/bin/env node
/**
 * Compare the deterministic fallback and the configured generator draft for the
 * same validated brief, asset set, and template version.
 *
 * Inputs:
 *   --flow <origin>                 Drive the real Campaign Lab UI and collect
 *                                   both drafts from the same form state.
 *   --fallback <dir|file> --generated <dir|file>
 *                                   Compare saved draft artifacts.
 *   --urls <compare-urls.json>      Compare two rendered pages per case.
 *
 * Outputs:
 *   comparison.json                 Machine-readable identity checks and changes.
 *   comparison-index.md             Human-readable comparison index.
 *   provider-map.json               Separate label-to-provider mapping.
 *   blind-sheet.md, blind-key.json  Reviewer sheet; neutral labels only.
 *   captures/<case>/<label>/mobile.png, desktop.png
 *
 * This script does not import the app route, renderer, or provider adapter.
 */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

import {
  buildBlindSheet,
  compareDraftPair,
  loadArtifacts,
  loadPack,
} from "./campaign-eval-core.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaultPack = path.join(root, "tests", "fixtures", "campaign-eval", "cases.json");
const timeoutMs = 15_000;
const viewports = [
  { name: "375", fileName: "mobile", width: 375, height: 812, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  { name: "1440", fileName: "desktop", width: 1440, height: 900, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
];
const captureFileNames = { "375": "mobile", "1440": "desktop" };
const flowCases = [
  { caseId: "sparse-offer", fixture: "sparse", openingFocus: null },
  { caseId: "rich-angle", fixture: "long-copy", openingFocus: "flow-control" },
  { caseId: "intent-change", fixture: "long-copy", openingFocus: "first-pour" },
];

function usage() {
  return `Campaign fallback-versus-generator comparison

Usage:
  node scripts/campaign-eval-compare.mjs --flow http://localhost:3000 --out <dir>
  node scripts/campaign-eval-compare.mjs --fallback <dir|file> --generated <dir|file> --out <dir>
  node scripts/campaign-eval-compare.mjs --urls <compare-urls.json> --out <dir>

Options:
  --flow <origin>        Drive the real Campaign Lab UI. Collects the initial
                         deterministic preview and the generated preview from the
                         same form state.
  --fallback-flow <origin>
                         Optional provider-off origin for the deterministic
                         fallback. Use with --flow or --generated-flow so both
                         drafts come from the same form values and opening focus.
  --generated-flow <origin>
                         Optional configured-provider origin. Defaults to --flow.
  --fallback <path>      Saved fallback artifact file or directory.
  --generated <path>     Saved generated artifact file or directory.
  --urls <file>          JSON map: { caseId: { fallback: url, generated: url } }.
  --out <dir>            Output directory (default: .local/campaign-eval-compare/<timestamp>).
  --pack <file>          Case pack (default: tests/fixtures/campaign-eval/cases.json).
  --captures <dir>       Existing neutral capture tree to reuse for review.
  --fixtures <list>      Flow-mode fixtures (default: sparse-offer,rich-angle,intent-change).
  --seed <text>          Blind label seed (default: campaign-eval-compare-v1).
  --headed               Show the browser in flow/URL modes.
  --help, -h             Show this help.
`;
}

function parseCli() {
  const parsed = parseArgs({
    allowPositionals: false,
    options: {
      flow: { type: "string" },
      "fallback-flow": { type: "string" },
      "generated-flow": { type: "string" },
      fallback: { type: "string" },
      generated: { type: "string" },
      urls: { type: "string" },
      out: { type: "string" },
      pack: { type: "string" },
      captures: { type: "string" },
      fixtures: { type: "string" },
      seed: { type: "string" },
      headed: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
  });
  if (parsed.values.help) {
    console.log(usage());
    process.exit(0);
  }
  const modes = ["flow", "fallback-flow", "generated-flow", "fallback", "generated", "urls"].filter((key) => parsed.values[key]);
  if (modes.length === 0) throw new Error("Use --flow, --fallback plus --generated, or --urls.");
  if (parsed.values["fallback-flow"] && !(parsed.values.flow || parsed.values["generated-flow"])) {
    throw new Error("--fallback-flow requires --flow or --generated-flow.");
  }
  if (parsed.values["generated-flow"] && !(parsed.values["fallback-flow"] || parsed.values.flow)) {
    throw new Error("--generated-flow requires --fallback-flow or --flow.");
  }
  if ((parsed.values.fallback || parsed.values.generated) && !(parsed.values.fallback && parsed.values.generated)) {
    throw new Error("Saved-artifact mode requires both --fallback and --generated.");
  }
  const selectedFixtures = (parsed.values.fixtures ?? flowCases.map((item) => item.caseId).join(","))
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  for (const caseId of selectedFixtures) {
    if (!flowCases.some((item) => item.caseId === caseId)) {
      throw new Error(`Unsupported flow case: ${caseId}. Use ${flowCases.map((item) => item.caseId).join(", ")}.`);
    }
  }
  return {
    flow: parsed.values.flow ? parsed.values.flow.replace(/\/$/, "") : null,
    fallbackFlow: parsed.values["fallback-flow"] ? parsed.values["fallback-flow"].replace(/\/$/, "") : null,
    generatedFlow: parsed.values["generated-flow"] ? parsed.values["generated-flow"].replace(/\/$/, "") : null,
    fallback: parsed.values.fallback ? path.resolve(parsed.values.fallback) : null,
    generated: parsed.values.generated ? path.resolve(parsed.values.generated) : null,
    urls: parsed.values.urls ? path.resolve(parsed.values.urls) : null,
    out: parsed.values.out ? path.resolve(parsed.values.out) : null,
    pack: path.resolve(parsed.values.pack ?? defaultPack),
    captures: parsed.values.captures ? path.resolve(parsed.values.captures) : null,
    fixtures: selectedFixtures,
    seed: parsed.values.seed ?? "campaign-eval-compare-v1",
    headed: parsed.values.headed,
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
    throw new Error("Playwright is not installed. Set CAMPAIGN_EVAL_PLAYWRIGHT.");
  }
}

function resolveChromium(chromium) {
  if (process.env.CAMPAIGN_EVAL_CHROMIUM) {
    if (!existsSync(process.env.CAMPAIGN_EVAL_CHROMIUM)) {
      throw new Error(`CAMPAIGN_EVAL_CHROMIUM does not exist: ${process.env.CAMPAIGN_EVAL_CHROMIUM}`);
    }
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
  throw new Error("Chromium is not installed. Set CAMPAIGN_EVAL_CHROMIUM.");
}

function readArtifactFile(file) {
  const artifact = JSON.parse(readFileSync(file, "utf8"));
  if (artifact.before && artifact.after) {
    throw new Error(`${file} is a revision bundle, not a single draft artifact.`);
  }
  if (!artifact.caseId) throw new Error(`${file} has no caseId.`);
  return artifact;
}

function readArtifactMap(input) {
  if (!existsSync(input)) throw new Error(`Artifact path not found: ${input}`);
  const stat = statSync(input);
  if (stat.isDirectory()) {
    const loaded = loadArtifacts(input);
    if (loaded.errors.length) throw new Error(loaded.errors.join("\n"));
    return new Map([...loaded.drafts.entries()].map(([caseId, artifact]) => [
      caseId,
      { ...artifact, __file: path.join(input, artifact.file) },
    ]));
  }
  const artifact = readArtifactFile(input);
  return new Map([[artifact.caseId, { ...artifact, __file: input }]]);
}

function providerInfo(artifact, label, role) {
  const generation = artifact.flow?.generation ?? null;
  return {
    label,
    role,
    source: artifact.source,
    sourceLabel: artifact.sourceLabel ?? null,
    provider: generation?.provider ?? (role === "fallback" ? "deterministic" : "unknown"),
    providerLabel: generation?.providerLabel ?? (role === "fallback" ? "Deterministic fallback" : null),
    status: generation?.status ?? (role === "fallback" ? "idle" : "unknown"),
    code: generation?.code ?? null,
    model: generation?.model ?? null,
    angle: generation?.angle ?? null,
    layout: artifact.draft?.layout ?? null,
    sections: (artifact.draft?.sections ?? []).map((section) => (typeof section === "string" ? section : section.id)),
    factIds: artifact.flow?.generation?.factIds ?? artifact.flow?.brief?.productFactIds ?? (artifact.flow?.brief?.productFacts ?? []).map((fact) => fact.id).filter(Boolean),
    openingFocus: artifact.flow?.brief?.openingFocus ?? null,
    template: artifact.template ?? null,
    revision: artifact.flow?.revision ?? artifact.approval?.revision ?? null,
    artifactFile: artifact.__file ?? null,
  };
}

function capturePath(outDir, caseId, label, fileName) {
  return path.join(outDir, "captures", caseId, label, `${fileName}.png`);
}

function labelsFor(blindKey, caseId) {
  const mapping = blindKey.cases[caseId]?.mapping ?? {};
  const labels = { fallback: null, generated: null };
  for (const [label, value] of Object.entries(mapping)) {
    if (value.source === "fallback") labels.fallback = label;
    if (value.source === "generated") labels.generated = label;
  }
  return labels;
}

async function openPage(browser, url, viewport) {
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
  const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: timeoutMs });
  if (response && !response.ok()) {
    await context.close();
    throw new Error(`${url} returned HTTP ${response.status()}`);
  }
  await page.locator('[data-template] h1').waitFor({ state: "visible", timeout: timeoutMs });
  await page.evaluate(() => document.fonts?.ready ?? Promise.resolve()).catch(() => {});
  return { context, page };
}

async function extractArtifact(page, caseDef, source) {
  return page.evaluate(({ caseId, sourceKind, expected, expectedAssets }) => {
    const preview = document.querySelector('[data-template]') ?? document.querySelector('[aria-label="Campaign preview"]') ?? document.querySelector("main") ?? document.body;
    const content = preview.querySelector("article") ?? preview;
    const dataset = preview.dataset ?? {};
    const form = {};
    for (const field of document.querySelectorAll("input[name], select[name], textarea[name]")) {
      form[field.name] = field.value;
    }
    const h1 = content.querySelector("h1");
    const headline = (h1?.innerText ?? "").trim();
    const paragraphs = [...content.querySelectorAll("p")]
      .map((paragraph) => (paragraph.innerText ?? "").trim())
      .filter(Boolean);
    const offer = form.offer || paragraphs.find((text) => text === expected.offer) || expected.offer;
    const productName = form.productName || expected.productName;
    const actionLink = [...content.querySelectorAll("a[href]")].find((anchor) =>
      (anchor.innerText ?? "").includes(expected.actionLabel),
    ) ?? content.querySelector("a[href]");
    const actionLabel = (actionLink?.innerText ?? "")
      .replace(/\s*\(opens in a new tab\)\s*/i, "")
      .trim() || expected.actionLabel;
    const destinationUrl = actionLink?.href ?? "";
    const factElements = [...content.querySelectorAll("[data-fact-id]")];
    const facts = [...new Map(
      factElements.map((element) => {
        const spans = [...element.querySelectorAll("span")];
        const fact = {
          id: element.getAttribute("data-fact-id") ?? "",
          label: (spans[0]?.innerText ?? "").trim(),
          value: (spans[1]?.innerText ?? "").trim(),
        };
        return [`${fact.label}::${fact.value}`, fact];
      }),
    ).values()];
    const lede = paragraphs.find((text) =>
      text.length >= 32 &&
      text !== headline &&
      text !== offer &&
      text !== productName &&
      !text.includes(expected.offer) &&
      !/^offer$/i.test(text)
    ) ?? "";
    const sectionIds = (dataset.sectionOrder ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    const image = content.querySelector("img");
    const imageIds = [...new Set(
      [...content.querySelectorAll("img")]
        .map((element) => {
          const pathname = element.currentSrc || element.src;
          const fileName = pathname.split("/").pop() ?? "";
          return expectedAssets.find((asset) => asset.file.endsWith(fileName))?.id ?? null;
        })
        .filter(Boolean),
    )];
    const assetIds = imageIds.length > 0
      ? imageIds
      : [dataset.assetId ?? form.assetId].filter(Boolean);
    const generationStatus = dataset.generationStatus ?? (sourceKind === "fallback" ? "idle" : "unknown");
    const generationProvider = dataset.generationProvider ?? (sourceKind === "fallback" ? "deterministic" : "unknown");
    const generationAngle = dataset.generationAngle ?? null;
    return {
      schemaVersion: 1,
      caseId,
      source: sourceKind === "fallback" ? "baseline" : "generated",
      sourceLabel: `${generationProvider} (${generationStatus})`,
      template: {
        id: dataset.template ?? "single-product-offer",
        version: dataset.templateVersion ?? "1.0.0",
      },
      campaign: {
        brandId: form.brandId ?? expected.brandId,
        productName,
        offer,
        destinationUrl,
        actionLabel,
      },
      draft: {
        layout: dataset.layout ?? null,
        headline,
        lede,
        story: null,
        facts: facts.map((fact) => ({ label: fact.label, value: fact.value })),
        sections: sectionIds.map((id, index) => ({ id, heading: "", emphasis: index + 1 })),
        assetIds,
        claims: [headline, lede].filter(Boolean),
      },
      flow: {
        generation: {
          status: generationStatus,
          provider: generationProvider,
          angle: generationAngle,
          code: dataset.generationCode ?? null,
        },
        revision: dataset.revision ?? null,
        brief: {
          brandId: form.brandId ?? expected.brandId,
          productName,
          offer,
          destinationUrl: form.destinationUrl ?? destinationUrl,
          actionLabel,
          assetId: form.assetId ?? dataset.assetId ?? null,
          openingFocus: form.openingFocus ?? null,
          productFactIds: facts.map((fact) => fact.id).filter(Boolean),
        },
        asset: {
          id: dataset.assetId ?? form.assetId ?? null,
          src: image?.currentSrc ?? image?.src ?? null,
          alt: image?.alt ?? null,
          contentHash: null,
        },
      },
    };
  }, { caseId: caseDef.id, sourceKind: source, expected: caseDef.campaign, expectedAssets: caseDef.approvedAssets });
}

async function capture(page, outDir, caseId, label, viewport) {
  const dir = path.join(outDir, "captures", caseId, label);
  mkdirSync(dir, { recursive: true });
  await page.addStyleTag({ content: "nextjs-portal{display:none !important;}" }).catch(() => {});
  const file = capturePath(outDir, caseId, label, viewport.fileName);
  const article = await page.evaluateHandle(() =>
    document.querySelector('[data-template] article') ??
    document.querySelector('[aria-label="Campaign preview"] article') ??
    document.querySelector("article") ??
    document.querySelector("main") ??
    document.body,
  );
  const element = article.asElement();
  if (element) await element.screenshot({ path: file });
  else await page.screenshot({ path: file, fullPage: true });
  const images = await page.evaluate(() =>
    [...document.querySelectorAll("main img, body img")].map((image) => {
      const rect = image.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    }),
  );
  let crop = null;
  const first = images.find((image) => image.width > 0 && image.height > 0);
  if (first) {
    crop = path.join(dir, `product-${viewport.fileName}.png`);
    await page.screenshot({
      path: crop,
      fullPage: true,
      clip: {
        x: Math.max(0, first.x),
        y: Math.max(0, first.y),
        width: Math.min(first.width, viewport.width),
        height: Math.min(first.height, 2400),
      },
    });
  }
  return { full: file, crop };
}

async function collectFlow({
  browser,
  fallbackOrigin,
  generatedOrigin,
  fallbackGenerate,
  caseDef,
  fixture,
  openingFocus,
  outDir,
  labels,
}) {
  const artifacts = {};
  for (const viewport of viewports) {
    const fallback = await openPage(browser, `${fallbackOrigin}/campaign-lab?fixture=${fixture}`, viewport);
    try {
      if (openingFocus) {
        await fallback.page.getByLabel("Opening focus", { exact: true }).selectOption(openingFocus);
        await fallback.page.waitForTimeout(350);
      }
      if (fallbackGenerate) {
        await fallback.page.getByRole("button", { name: "Generate preview", exact: true }).click({ timeout: timeoutMs });
        await fallback.page.waitForFunction(() => {
          const status = document.querySelector('[data-generation-status]')?.getAttribute('data-generation-status');
          return status === "generated" || status === "fallback";
        }, { timeout: timeoutMs }).catch(() => {});
        await fallback.page.waitForTimeout(250);
      }
      if (viewport.name === "1440") {
        artifacts.fallback = await extractArtifact(fallback.page, caseDef, "fallback");
      }
      await capture(fallback.page, outDir, caseDef.id, labels.fallback, viewport);
    } finally {
      await fallback.context.close();
    }

    const generated = await openPage(browser, `${generatedOrigin}/campaign-lab?fixture=${fixture}`, viewport);
    try {
      if (openingFocus) {
        await generated.page.getByLabel("Opening focus", { exact: true }).selectOption(openingFocus);
        await generated.page.waitForTimeout(350);
      }
      await generated.page.getByRole("button", { name: "Generate preview", exact: true }).click({ timeout: timeoutMs });
      await generated.page.waitForFunction(() => {
        const status = document.querySelector('[data-generation-status]')?.getAttribute('data-generation-status');
        return status === "generated" || status === "fallback";
      }, { timeout: timeoutMs }).catch(() => {});
      await generated.page.waitForTimeout(250);
      if (viewport.name === "1440") {
        artifacts.generated = await extractArtifact(generated.page, caseDef, "generated");
      }
      await capture(generated.page, outDir, caseDef.id, labels.generated, viewport);
    } finally {
      await generated.context.close();
    }
  }
  return artifacts;
}

async function collectUrls({ browser, urls, caseDef, outDir, labels }) {
  const artifacts = {};
  for (const viewport of viewports) {
    for (const [role, url] of [["fallback", urls.fallback], ["generated", urls.generated]]) {
      if (!url) continue;
      const { context, page } = await openPage(browser, url, viewport);
      try {
        if (viewport.name === "1440") {
          artifacts[role] = await extractArtifact(page, caseDef, role);
        }
        await capture(page, outDir, caseDef.id, labels[role], viewport);
      } finally {
        await context.close();
      }
    }
  }
  return artifacts;
}

function comparisonCases({ loaded, mode, options, fallbackMap, generatedMap, urls }) {
  if (mode === "flow") {
    return flowCases
      .filter((item) => options.fixtures.includes(item.caseId))
      .map((item) => ({ caseId: item.caseId, ...item }));
  }
  if (mode === "urls") {
    return loaded.pack.cases
      .filter((caseDef) => urls[caseDef.id]?.fallback && urls[caseDef.id]?.generated)
      .map((caseDef) => ({ caseId: caseDef.id }));
  }
  return loaded.pack.cases
    .filter((caseDef) => fallbackMap.has(caseDef.id) && generatedMap.has(caseDef.id))
    .map((caseDef) => ({ caseId: caseDef.id }));
}

function buildPairs(cases, fallbackFiles, generatedFiles, comparisonByCase) {
  return cases.map((entry) => ({
    caseId: entry.caseId,
    identical: comparisonByCase.get(entry.caseId)?.identical ?? false,
    options: [
      { source: "fallback", file: fallbackFiles.get(entry.caseId) ?? null, artifactCaseId: entry.caseId },
      { source: "generated", file: generatedFiles.get(entry.caseId) ?? null, artifactCaseId: entry.caseId },
    ],
  }));
}

function writeProviderMap({ outDir, runId, mode, options, cases, fallbackFiles, generatedFiles, comparisons, labelsByCase }) {
  const casesMap = {};
  for (const entry of cases) {
    const comparison = comparisons.get(entry.caseId);
    const labels = labelsByCase.get(entry.caseId) ?? { fallback: null, generated: null };
    const fallback = comparison?.fallback ?? null;
    const generated = comparison?.generated ?? null;
    casesMap[entry.caseId] = {
      fallback: fallback ? { ...providerInfo(fallback, labels.fallback, "fallback"), artifactFile: fallback.__file ?? fallbackFiles.get(entry.caseId) ?? null } : null,
      generated: generated ? { ...providerInfo(generated, labels.generated, "generated"), artifactFile: generated.__file ?? generatedFiles.get(entry.caseId) ?? null } : null,
    };
  }
  const map = {
    schemaVersion: 1,
    runId,
    mode,
    seed: options.seed,
    generatedAt: new Date().toISOString(),
    flowOrigin: options.flow,
    fallbackFlowOrigin: options.fallbackFlow,
    generatedFlowOrigin: options.generatedFlow,
    artifactInputs: options.fallback ? { fallback: options.fallback, generated: options.generated } : null,
    urlInput: options.urls,
    template: { id: "single-product-offer", version: "1.0.0" },
    cases: casesMap,
  };
  writeFileSync(path.join(outDir, "provider-map.json"), `${JSON.stringify(map, null, 2)}\n`);
  return map;
}

function stateText(state) {
  return state === "passed" ? "pass" : state === "failed" ? "FAIL" : "unassessed";
}

function caseCaptureStatus(outDir, caseId, labels) {
  const roles = [labels.fallback, labels.generated].filter(Boolean);
  if (roles.length < 2) return { ready: false, labels: roles };
  const ready = roles.every((label) =>
    ["mobile", "desktop"].every((name) => existsSync(capturePath(outDir, caseId, label, name))),
  );
  return { ready, labels: roles };
}

function buildIndex({ loaded, runId, mode, options, cases, comparisons, labelsByCase, outDir, blindPath, providerPath }) {
  const lines = [];
  lines.push("# Campaign draft comparison index");
  lines.push("");
  lines.push(`- Run: \`${runId}\``);
  lines.push(`- Mode: \`${mode}\``);
  lines.push(`- Pack: \`${loaded.pack.packId}\` v${loaded.pack.packVersion}`);
  lines.push(`- Template: \`${loaded.pack.template.id}\` v${loaded.pack.template.version}`);
  lines.push(`- Seed: \`${options.seed}\``);
  lines.push(`- Provider map (separate): \`${path.basename(providerPath)}\``);
  lines.push(`- Reviewer sheet: \`${path.basename(blindPath)}\``);
  lines.push("");
  lines.push("This index is automated. It proves identity, claims, and the concrete changes. It does not judge whether a change looks better. Human approval, first change, edit count, and time to approval belong in the reviewer sheet.");
  lines.push("");
  lines.push("Capture folders use neutral labels A/B; the label-to-provider mapping stays in `provider-map.json`.");
  lines.push("");

  const rows = cases.map((entry) => {
    const caseDef = loaded.casesById.get(entry.caseId);
    const comparison = comparisons.get(entry.caseId);
    if (!comparison) {
      return `| ${entry.caseId} | missing | — | — | — | — | — |`;
    }
    const identity = comparison.checks.filter((item) => item.id !== "claims-traceable");
    const identityPass = identity.every((item) => item.state !== "failed");
    const opening = comparison.identical ? "identical" : comparison.opening.changed ? "changed" : "same";
    const sections = comparison.identical ? "identical" : comparison.sections.changed ? "changed" : "same";
    const evidence =
      comparison.identical ? "identical" :
      comparison.evidence.facts.same && comparison.evidence.assets.same && !comparison.evidence.story.changed && !comparison.evidence.layout.changed
        ? "same" : "changed";
    const labels = labelsByCase.get(entry.caseId) ?? {};
    const captureStatus = caseCaptureStatus(outDir, entry.caseId, labels);
    return `| ${caseDef.title} | ${comparison.identical ? "yes" : "no"} | ${identityPass ? "pass" : "FAIL"} | ${opening} | ${sections} | ${evidence} | ${captureStatus.ready ? captureStatus.labels.join(" / ") : "missing"} |`;
  });
  lines.push("## Summary");
  lines.push("");
  lines.push("| Case | Identical | Identity | Opening | Section order | Evidence | Captures |");
  lines.push("| --- | --- | --- | --- | --- | --- | --- |");
  lines.push(...rows);
  lines.push("");

  const identical = cases.filter((entry) => comparisons.get(entry.caseId)?.identical);
  lines.push("## Identical drafts");
  lines.push("");
  if (identical.length === 0) {
    lines.push("No compared case produced identical fallback and generated drafts.");
  } else {
    for (const entry of identical) {
      const caseDef = loaded.casesById.get(entry.caseId);
      lines.push(`- **${caseDef.title}**: identified as identical. No change to opening, section order, evidence, asset IDs, or template.`);
    }
  }
  lines.push("");

  for (const entry of cases) {
    const caseDef = loaded.casesById.get(entry.caseId);
    const comparison = comparisons.get(entry.caseId);
    lines.push(`## ${caseDef.title}`);
    lines.push("");
    if (!comparison) {
      lines.push("**Missing comparison.** One or both drafts were not supplied.");
      lines.push("");
      continue;
    }
    const labels = labelsByCase.get(entry.caseId) ?? {};
    const captureStatus = caseCaptureStatus(outDir, entry.caseId, labels);
    lines.push(`**Result:** ${comparison.identical ? "identical" : "changed"}. **Identity:** ${comparison.checks.filter((item) => item.id !== "claims-traceable" && item.state === "failed").length ? "FAIL" : "pass"}. **Captures:** ${captureStatus.ready ? captureStatus.labels.join(" / ") : "missing"} (neutral labels; provider map separate).`);
    if (!captureStatus.ready) {
      lines.push("");
      lines.push("**Captures missing.** Visual review for this case is unassessed. The automated comparison is still valid for identity and draft changes.");
    }
    lines.push("");
    lines.push("### Identity checks");
    lines.push("");
    lines.push("| Check | State | Detail |");
    lines.push("| --- | --- | --- |");
    for (const item of comparison.checks) {
      lines.push(`| ${item.id} | ${stateText(item.state)} | ${String(item.detail).replace(/\|/g, "\\|")} |`);
    }
    lines.push("");
    lines.push("### Opening");
    lines.push("");
    lines.push(`- Headline: \`${comparison.opening.headline.before || "(empty)"}\` → \`${comparison.opening.headline.after || "(empty)"}\`${comparison.opening.headline.changed ? "" : " (unchanged)"}`);
    lines.push(`- Lede: \`${comparison.opening.lede.before || "(empty)"}\` → \`${comparison.opening.lede.after || "(empty)"}\`${comparison.opening.lede.changed ? "" : " (unchanged)"}`);
    lines.push(`- Headline similarity: ${comparison.opening.headlineSimilarity}`);
    lines.push(`- Opening focus: ${comparison.opening.openingFocus ?? "(not supplied)"}; generated angle: ${comparison.opening.angle ?? "(not supplied)"}`);
    lines.push("");
    lines.push("### Section order");
    lines.push("");
    lines.push(`- Fallback: ${comparison.sections.before.join(" → ") || "(none)"}`);
    lines.push(`- Generated: ${comparison.sections.after.join(" → ") || "(none)"}`);
    if (comparison.sections.added.length) lines.push(`- Added: ${comparison.sections.added.join(", ")}`);
    if (comparison.sections.removed.length) lines.push(`- Removed: ${comparison.sections.removed.join(", ")}`);
    if (comparison.sections.reordered) lines.push("- Same sections, different order.");
    if (!comparison.sections.changed) lines.push("- Unchanged.");
    lines.push("");
    lines.push("### Evidence");
    lines.push("");
    lines.push(`- Facts fallback: ${comparison.evidence.facts.before.map((fact) => `${fact.label}: ${fact.value}`).join("; ") || "(none)"}`);
    lines.push(`- Facts generated: ${comparison.evidence.facts.after.map((fact) => `${fact.label}: ${fact.value}`).join("; ") || "(none)"}`);
    if (comparison.evidence.facts.added.length) lines.push(`- Facts added: ${comparison.evidence.facts.added.map((fact) => `${fact.label}: ${fact.value}`).join("; ")}`);
    if (comparison.evidence.facts.removed.length) lines.push(`- Facts removed: ${comparison.evidence.facts.removed.map((fact) => `${fact.label}: ${fact.value}`).join("; ")}`);
    if (comparison.evidence.facts.reordered) lines.push("- Same facts, different order.");
    lines.push(`- Images fallback: ${comparison.evidence.assets.before.join(", ") || "(none)"}`);
    lines.push(`- Images generated: ${comparison.evidence.assets.after.join(", ") || "(none)"}`);
    if (comparison.evidence.assets.added.length) lines.push(`- Images added: ${comparison.evidence.assets.added.join(", ")}`);
    if (comparison.evidence.assets.removed.length) lines.push(`- Images removed: ${comparison.evidence.assets.removed.join(", ")}`);
    if (comparison.evidence.story.changed) lines.push(`- Story evidence changed: \`${comparison.evidence.story.before || "(empty)"}\` → \`${comparison.evidence.story.after || "(empty)"}\``);
    if (comparison.evidence.layout.changed) lines.push(`- Layout: ${comparison.evidence.layout.before} → ${comparison.evidence.layout.after}`);
    lines.push("");
    lines.push("### Concrete changes");
    lines.push("");
    for (const change of comparison.changes) lines.push(`- ${change}`);
    lines.push("");
  }

  lines.push("## Boundary");
  lines.push("");
  lines.push("- This index and `comparison.json` are automated evidence. Visual judgment stays in `blind-sheet.md`.");
  lines.push("- The reviewer records the page they would approve, the first change, the number of edits to approval, and the time to approval. Those values are not automated scores.");
  lines.push("- Offline providers verify the workflow only. Live model quality remains unassessed until a separately authorized run uses approved inputs.");
  lines.push("- Packaging truth remains human-only; see the evaluation pack trap.");
  lines.push("");

  const file = path.join(outDir, "comparison-index.md");
  writeFileSync(file, `${lines.join("\n")}\n`);
  return file;
}

async function main() {
  const options = parseCli();
  const loaded = loadPack(options.pack);
  const mode = options.flow || options.fallbackFlow || options.generatedFlow ? "flow" : options.urls ? "urls" : "artifacts";
  const outDir = options.out ?? path.join(root, ".local", "campaign-eval-compare", timestamp());
  mkdirSync(outDir, { recursive: true });
  if (options.captures) {
    if (!existsSync(options.captures)) throw new Error(`Capture directory not found: ${options.captures}`);
    const target = path.join(outDir, "captures");
    if (path.resolve(options.captures) !== path.resolve(target)) {
      mkdirSync(target, { recursive: true });
      for (const caseId of existsSync(options.captures) ? readdirSync(options.captures) : []) {
        const source = path.join(options.captures, caseId);
        if (!statSync(source).isDirectory()) continue;
        const destination = path.join(target, caseId);
        mkdirSync(destination, { recursive: true });
        for (const label of readdirSync(source)) {
          const labelSource = path.join(source, label);
          if (!statSync(labelSource).isDirectory()) continue;
          const labelDestination = path.join(destination, label);
          mkdirSync(labelDestination, { recursive: true });
          for (const file of readdirSync(labelSource)) {
            copyFileSync(path.join(labelSource, file), path.join(labelDestination, file));
          }
        }
      }
    }
  }

  const fallbackMap = options.fallback ? readArtifactMap(options.fallback) : new Map();
  const generatedMap = options.generated ? readArtifactMap(options.generated) : new Map();
  const urls = options.urls ? JSON.parse(readFileSync(options.urls, "utf8")) : null;
  const cases = comparisonCases({ loaded, mode, options, fallbackMap, generatedMap, urls });
  if (cases.length === 0) throw new Error("No comparable cases were supplied.");

  const fallbackFiles = new Map();
  const generatedFiles = new Map();
  const comparisons = new Map();
  const labelsByCase = new Map();

  const preliminaryPairs = buildPairs(cases, fallbackFiles, generatedFiles, comparisons);
  const runId = path.basename(outDir);
  const preliminary = buildBlindSheet({
    loaded,
    runId,
    seed: options.seed,
    pairs: preliminaryPairs,
    captureFileNames,
  });
  for (const entry of cases) labelsByCase.set(entry.caseId, labelsFor(preliminary.key, entry.caseId));

  if (mode === "flow" || mode === "urls") {
    const playwright = await loadPlaywright();
    const browser = await playwright.chromium.launch({
      headless: !options.headed,
      executablePath: resolveChromium(playwright.chromium),
    });
    try {
      for (const entry of cases) {
        const caseDef = loaded.casesById.get(entry.caseId);
        const labels = labelsByCase.get(entry.caseId);
        let collected;
        if (mode === "flow") {
          const fallbackOrigin = options.fallbackFlow ?? options.flow ?? options.generatedFlow;
          const generatedOrigin = options.generatedFlow ?? options.flow ?? options.fallbackFlow;
          collected = await collectFlow({
            browser,
            fallbackOrigin,
            generatedOrigin,
            fallbackGenerate: Boolean(options.fallbackFlow),
            caseDef,
            fixture: entry.fixture,
            openingFocus: entry.openingFocus,
            outDir,
            labels,
          });
        } else {
          collected = await collectUrls({
            browser,
            urls: urls[entry.caseId],
            caseDef,
            outDir,
            labels,
          });
        }
        if (!collected.fallback || !collected.generated) {
          throw new Error(`${entry.caseId}: did not collect both drafts.`);
        }
        const artifactDir = path.join(outDir, "artifacts", entry.caseId);
        mkdirSync(artifactDir, { recursive: true });
        writeFileSync(path.join(artifactDir, "fallback.json"), `${JSON.stringify(collected.fallback, null, 2)}\n`);
        writeFileSync(path.join(artifactDir, "generated.json"), `${JSON.stringify(collected.generated, null, 2)}\n`);
        fallbackFiles.set(entry.caseId, path.join(artifactDir, "fallback.json"));
        generatedFiles.set(entry.caseId, path.join(artifactDir, "generated.json"));
        comparisons.set(entry.caseId, {
          ...compareDraftPair(collected.fallback, collected.generated, caseDef, loaded.pack),
          fallback: collected.fallback,
          generated: collected.generated,
        });
      }
    } finally {
      await browser.close();
    }
  } else {
    for (const entry of cases) {
      const caseDef = loaded.casesById.get(entry.caseId);
      const fallback = fallbackMap.get(entry.caseId);
      const generated = generatedMap.get(entry.caseId);
      fallbackFiles.set(entry.caseId, options.fallback);
      generatedFiles.set(entry.caseId, options.generated);
      comparisons.set(entry.caseId, {
        ...compareDraftPair(fallback, generated, caseDef, loaded.pack),
        fallback,
        generated,
      });
    }
  }

  const pairs = buildPairs(cases, fallbackFiles, generatedFiles, comparisons);
  const blind = buildBlindSheet({
    loaded,
    runId,
    seed: options.seed,
    pairs,
    captureFileNames,
    capturesAvailable: existsSync(path.join(outDir, "captures")),
  });
  const blindPath = path.join(outDir, "blind-sheet.md");
  writeFileSync(blindPath, blind.markdown);
  writeFileSync(path.join(outDir, "blind-key.json"), `${JSON.stringify(blind.key, null, 2)}\n`);
  writeFileSync(path.join(outDir, "blind-map.json"), `${JSON.stringify(blind.key, null, 2)}\n`);

  const providerPath = path.join(outDir, "provider-map.json");
  writeProviderMap({
    outDir,
    runId,
    mode,
    options,
    cases,
    fallbackFiles,
    generatedFiles,
    comparisons,
    labelsByCase,
  });

  const comparisonJson = {
    schemaVersion: 1,
    runId,
    mode,
    seed: options.seed,
    pack: { id: loaded.pack.packId, version: loaded.pack.packVersion },
    template: loaded.pack.template,
    flowOrigin: options.flow,
    fallbackFlowOrigin: options.fallbackFlow,
    generatedFlowOrigin: options.generatedFlow,
    cases: cases.map((entry) => {
      const comparison = comparisons.get(entry.caseId);
      return {
        caseId: entry.caseId,
        identical: comparison.identical,
        checks: comparison.checks,
        opening: comparison.opening,
        sections: comparison.sections,
        evidence: comparison.evidence,
        changes: comparison.changes,
        labels: labelsByCase.get(entry.caseId),
      };
    }),
  };
  writeFileSync(path.join(outDir, "comparison.json"), `${JSON.stringify(comparisonJson, null, 2)}\n`);
  writeFileSync(path.join(outDir, "run.json"), `${JSON.stringify({
    schemaVersion: 1,
    runId,
    mode,
    seed: options.seed,
    pack: { id: loaded.pack.packId, version: loaded.pack.packVersion },
    template: loaded.pack.template,
    flow: {
      fallbackOrigin: options.fallbackFlow ?? options.flow,
      generatedOrigin: options.generatedFlow ?? options.flow,
      fallbackGenerate: Boolean(options.fallbackFlow),
    },
    artifacts: options.fallback ? { fallback: options.fallback, generated: options.generated } : null,
    urls: options.urls,
    cases: cases.map((entry) => entry.caseId),
    outputs: {
      comparisonIndex: "comparison-index.md",
      comparison: "comparison.json",
      providerMap: "provider-map.json",
      blindSheet: "blind-sheet.md",
      captures: "captures/",
    },
  }, null, 2)}\n`);

  const indexPath = buildIndex({
    loaded,
    runId,
    mode,
    options,
    cases,
    comparisons,
    labelsByCase,
    outDir,
    blindPath,
    providerPath,
  });

  console.log(`Comparison: ${path.relative(root, indexPath)}`);
  console.log(`Provider map: ${path.relative(root, providerPath)}`);
  console.log(`Blind sheet: ${path.relative(root, blindPath)}`);
  for (const entry of cases) {
    const comparison = comparisons.get(entry.caseId);
    console.log(`- ${entry.caseId}: ${comparison.identical ? "identical" : "changed"}`);
  }
  const failed = [...comparisons.values()].flatMap((comparison) => comparison.checks).filter((item) => item.state === "failed");
  process.exitCode = failed.length ? 1 : 0;
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 2;
});
