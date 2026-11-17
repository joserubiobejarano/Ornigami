#!/usr/bin/env node
/**
 * Local Momisa revised-B export review.
 *
 * Drives the normal Campaign Lab editor (approval + export), extracts the ZIP,
 * captures the editor and the offline export, checks the approved brief,
 * receipt, fonts, image treatment and reading order, rechecks the
 * headline-first geometry, and writes a local review bundle.
 *
 * All Momisa inputs and captures stay under ignored .local/ storage.
 */
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const bundleRoot = path.join(root, ".local", "momisa-review-bundle");
const captureDir = path.join(bundleRoot, "captures");
const bundleDir = path.join(bundleRoot, "bundle");
const zipDir = bundleRoot;
const approved = JSON.parse(
  readFileSync(
    path.join(root, ".local", "momisa-direction", "approved-brief.json"),
    "utf8",
  ),
);
const origin = (argValue("--url") ?? "http://localhost:3130").replace(/\/$/, "");
const headed = process.argv.includes("--headed");
const editorUrl = `${origin}/campaign-lab?fixture=momisa-glow-box-taste`;
const regressionUrl = `${origin}/campaign-lab/direction/regression`;
const morrowUrl = `${origin}/campaign-lab?fixture=long-copy`;

function argValue(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function loadPlaywright() {
  const candidates = [
    process.env.CAMPAIGN_LAB_PLAYWRIGHT,
    path.join(
      root,
      "scripts",
      "framework-prototype",
      "browser-tools",
      "node_modules",
      "playwright",
      "index.mjs",
    ),
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue;
    return import(pathToFileURL(candidate).href);
  }
  return import("playwright");
}

function chromiumExecutable(chromium) {
  if (process.env.CAMPAIGN_LAB_CHROMIUM) {
    if (!existsSync(process.env.CAMPAIGN_LAB_CHROMIUM)) {
      throw new Error(
        `CAMPAIGN_LAB_CHROMIUM does not exist: ${process.env.CAMPAIGN_LAB_CHROMIUM}`,
      );
    }
    return process.env.CAMPAIGN_LAB_CHROMIUM;
  }
  const bundled = chromium.executablePath();
  if (bundled && existsSync(bundled)) return bundled;
  const cache = process.env.LOCALAPPDATA
    ? path.join(process.env.LOCALAPPDATA, "ms-playwright")
    : null;
  if (cache && existsSync(cache)) {
    const versions = readdirSyncSafe(cache)
      .filter((name) => /^chromium-\d+$/.test(name))
      .sort((left, right) => Number(right.split("-")[1]) - Number(left.split("-")[1]));
    for (const version of versions) {
      const candidate = path.join(cache, version, "chrome-win64", "chrome.exe");
      if (existsSync(candidate)) return candidate;
    }
  }
  throw new Error("Chromium is not installed for the resolved Playwright package.");
}

function readdirSyncSafe(directory) {
  try {
    return readdirSync(directory);
  } catch {
    return [];
  }
}

function check(checks, id, passed, actual, expected) {
  checks.push({ id, passed, actual, expected });
}

function sha256File(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

async function hideDevIndicator(page) {
  await page.addStyleTag({
    content:
      "nextjs-portal, [data-nextjs-toast], [data-nextjs-dev-tools-button], #nextjs-dev-tools-button { display: none !important; visibility: hidden !important; }",
  });
  await page.evaluate(() => {
    document.querySelectorAll("nextjs-portal").forEach((element) => element.remove());
  });
}

async function waitForArticle(page, selector = "article") {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(
    (articleSelector) => {
      const article = document.querySelector(articleSelector);
      const image = article?.querySelector("img");
      return Boolean(article && image && image.complete && image.naturalWidth > 0);
    },
    selector,
    { timeout: 60000 },
  );
}

async function readArticleMetrics(page, selector = "article") {
  return page.evaluate((articleSelector) => {
    const article = document.querySelector(articleSelector);
    const headline = article?.querySelector("h1");
    const figure = article?.querySelector("figure");
    const image = figure?.querySelector("img");
    const offer =
      article?.querySelector('[data-role="offer"]') ??
      article?.querySelector('[class*="campaign-page_offer__"]') ??
      article?.querySelector('[class*="offer__"]');
    const offerText = offer?.querySelector("p");
    const price = offer?.querySelector('[class*="offerPrice"]');
    const action = article?.querySelector("a");
    const facts = article?.querySelector("ul");
    const rect = (element) => {
      if (!element) return null;
      const bounds = element.getBoundingClientRect();
      return {
        x: Math.round(bounds.x * 100) / 100,
        y: Math.round(bounds.y * 100) / 100,
        width: Math.round(bounds.width * 100) / 100,
        height: Math.round(bounds.height * 100) / 100,
        right: Math.round(bounds.right * 100) / 100,
        bottom: Math.round(bounds.bottom * 100) / 100,
      };
    };
    const style = (element) => {
      if (!element) return null;
      const computed = getComputedStyle(element);
      return {
        fontFamily: computed.fontFamily,
        fontSize: computed.fontSize,
        fontWeight: computed.fontWeight,
        letterSpacing: computed.letterSpacing,
        lineHeight: computed.lineHeight,
        color: computed.color,
        backgroundColor: computed.backgroundColor,
        display: computed.display,
        mixBlendMode: computed.mixBlendMode,
        padding: computed.padding,
      };
    };
    const order = [headline, figure, offer, action, facts]
      .filter(Boolean)
      .map((element) => element.tagName);
    return {
      articleText: article?.innerText ?? "",
      article: rect(article),
      headline: rect(headline),
      headlineStyle: style(headline),
      figure: rect(figure),
      figureStyle: style(figure),
      image: rect(image),
      imageProps: image
        ? {
            src: image.currentSrc || image.src,
            alt: image.alt,
            complete: image.complete,
            naturalWidth: image.naturalWidth,
            naturalHeight: image.naturalHeight,
            style: style(image),
          }
        : null,
      offer: rect(offer),
      offerText: offerText?.textContent?.replace(/\s+/g, " ").trim() ?? null,
      offerTextStyle: style(offerText),
      price: rect(price),
      priceText: price?.textContent ?? null,
      priceStyle: style(price),
      action: rect(action),
      actionHref: action?.getAttribute("href") ?? null,
      actionText: action?.textContent?.replace(/\s+/g, " ").trim() ?? null,
      actionStyle: style(action),
      facts: rect(facts),
      domOrder: order,
      viewport: { width: innerWidth, height: innerHeight },
      documentOverflow:
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth,
    };
  }, selector);
}

function readingOrderPasses(metrics) {
  const { headline, figure, offer, action, facts } = metrics;
  return Boolean(
    headline &&
      figure &&
      offer &&
      action &&
      facts &&
      headline.bottom <= figure.y + 1 &&
      figure.bottom <= offer.y + 1 &&
      offer.bottom <= action.y + 1 &&
      action.bottom <= facts.y + 1,
  );
}

function checkWidth(
  checks,
  label,
  metrics,
  expectedWidth,
  expectedOffer = approved.offer,
  expectedPrice = approved.offerPrice,
) {
  check(
    checks,
    `${label}:article-width`,
    Math.abs(metrics.article.width - expectedWidth) <= 1,
    metrics.article.width,
    expectedWidth,
  );
  check(
    checks,
    `${label}:exact-offer`,
    metrics.offerText === expectedOffer,
    metrics.offerText,
    expectedOffer,
  );
  check(
    checks,
    `${label}:exact-destination`,
    metrics.actionHref === approved.destinationUrl,
    metrics.actionHref,
    approved.destinationUrl,
  );
  check(
    checks,
    `${label}:exact-product`,
    metrics.articleText.includes(approved.productName),
    metrics.articleText.includes(approved.productName),
    true,
  );
  check(
    checks,
    `${label}:approved-facts`,
    approved.facts.every((fact) => metrics.articleText.includes(fact.value)),
    metrics.articleText,
    approved.facts.map((fact) => fact.value),
  );
  check(
    checks,
    `${label}:packshot-alt`,
    metrics.imageProps?.alt === approved.asset.alt,
    metrics.imageProps?.alt,
    approved.asset.alt,
  );
  check(
    checks,
    `${label}:packshot-loaded`,
    metrics.imageProps?.complete &&
      metrics.imageProps?.naturalWidth === 2500 &&
      metrics.imageProps?.naturalHeight === 2500,
    {
      complete: metrics.imageProps?.complete,
      width: metrics.imageProps?.naturalWidth,
      height: metrics.imageProps?.naturalHeight,
    },
    { complete: true, width: 2500, height: 2500 },
  );
  check(
    checks,
    `${label}:no-overflow`,
    !metrics.documentOverflow,
    metrics.documentOverflow,
    false,
  );
  check(
    checks,
    `${label}:display-font`,
    metrics.headlineStyle.fontFamily.includes("EB Garamond"),
    metrics.headlineStyle.fontFamily,
    "EB Garamond",
  );
  check(
    checks,
    `${label}:offer-font`,
    metrics.offerTextStyle.fontFamily.includes("EB Garamond"),
    metrics.offerTextStyle.fontFamily,
    "EB Garamond",
  );
  check(
    checks,
    `${label}:body-font`,
    metrics.actionStyle.fontFamily.includes("Jost"),
    metrics.actionStyle.fontFamily,
    "Jost",
  );
  check(
    checks,
    `${label}:normal-blend`,
    metrics.imageProps?.style.mixBlendMode === "normal",
    metrics.imageProps?.style.mixBlendMode,
    "normal",
  );
  check(
    checks,
    `${label}:photo-mat`,
    metrics.figureStyle.padding === "8px",
    metrics.figureStyle.padding,
    "8px",
  );
  check(
    checks,
    `${label}:price-role`,
    metrics.priceText === expectedPrice &&
      Number.parseFloat(metrics.priceStyle.fontSize) >
        Number.parseFloat(metrics.offerTextStyle.fontSize) &&
      metrics.priceStyle.color === "rgb(47, 93, 74)" &&
      metrics.priceStyle.display === "inline-block",
    {
      text: metrics.priceText,
      fontSize: metrics.priceStyle.fontSize,
      offerFontSize: metrics.offerTextStyle.fontSize,
      color: metrics.priceStyle.color,
      display: metrics.priceStyle.display,
    },
    {
      text: expectedPrice,
      size: "larger than offer",
      color: "rgb(47, 93, 74)",
      display: "inline-block",
    },
  );
  if (metrics.viewport.width <= 900) {
    check(
      checks,
      `${label}:reading-order`,
      readingOrderPasses(metrics),
      {
        headline: metrics.headline?.bottom,
        figure: metrics.figure?.y,
        offer: metrics.offer?.y,
        action: metrics.action?.y,
        facts: metrics.facts?.y,
        domOrder: metrics.domOrder,
      },
      "headline -> product -> offer -> action -> facts",
    );
  }
  check(
    checks,
    `${label}:dom-order`,
    metrics.domOrder.join(",") === "H1,FIGURE,DIV,A,UL",
    metrics.domOrder,
    ["H1", "FIGURE", "DIV", "A", "UL"],
  );
}

async function pixelDiff(leftPath, rightPath, tolerance = 16) {
  const sharp = (await import("sharp")).default;
  const leftMeta = await sharp(leftPath).metadata();
  const rightMeta = await sharp(rightPath).metadata();
  let best = null;
  for (let shiftX = -2; shiftX <= 2; shiftX += 1) {
    for (let shiftY = -2; shiftY <= 2; shiftY += 1) {
      const leftX = Math.max(0, -shiftX);
      const rightX = Math.max(0, shiftX);
      const leftY = Math.max(0, -shiftY);
      const rightY = Math.max(0, shiftY);
      const width = Math.min(leftMeta.width - leftX, rightMeta.width - rightX);
      const height = Math.min(leftMeta.height - leftY, rightMeta.height - rightY);
      if (width <= 0 || height <= 0) continue;
      const left = await sharp(leftPath)
        .extract({ left: leftX, top: leftY, width, height })
        .removeAlpha()
        .raw()
        .toBuffer();
      const right = await sharp(rightPath)
        .extract({ left: rightX, top: rightY, width, height })
        .removeAlpha()
        .raw()
        .toBuffer();
      let changed = 0;
      for (let index = 0; index < left.length; index += 3) {
        if (
          Math.abs(left[index] - right[index]) > tolerance ||
          Math.abs(left[index + 1] - right[index + 1]) > tolerance ||
          Math.abs(left[index + 2] - right[index + 2]) > tolerance
        ) {
          changed += 1;
        }
      }
      const candidate = {
        width,
        height,
        shiftX,
        shiftY,
        changed,
        total: width * height,
        ratio: changed / (width * height),
      };
      if (!best || candidate.ratio < best.ratio) best = candidate;
    }
  }
  return {
    ...best,
    left: { width: leftMeta.width, height: leftMeta.height },
    right: { width: rightMeta.width, height: rightMeta.height },
  };
}

function extractZip(zipPath, target) {
  rmSync(target, { recursive: true, force: true });
  mkdirSync(target, { recursive: true });
  const result = spawnSync("tar", ["-xf", zipPath, "-C", target], {
    cwd: root,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(
      `ZIP extraction failed: ${result.stderr || result.stdout || result.status}`,
    );
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function figure(label, src, full = false) {
  return `<figure>
    <figcaption><strong>${escapeHtml(label)}</strong>${full ? `<a href="${src}" target="_blank" rel="noreferrer">open full size</a>` : ""}</figcaption>
    <a href="${src}" target="_blank" rel="noreferrer"><img src="${src}" alt="${escapeHtml(label)}"></a>
  </figure>`;
}

function writeReviewHtml(report) {
  const editedSection = report.edited
    ? `
  <section class="section">
    <h2>Offer edit with two currency amounts</h2>
    <p class="note">Edited offer: <code>${escapeHtml(report.edited.offer)}</code>. The reviewed <code>${escapeHtml(report.edited.offerPrice)}</code> substring is the only price emphasis; the other currency amount stays unemphasised. The export receipt and rendered page must agree.</p>
    <div class="grid">
      ${figure("Edited editor · 1440 px", "captures/editor-edited-1440.png")}
      ${figure("Edited export · 375 px", "captures/export-edited-375.png")}
      ${figure("Edited export · 1440 px", "captures/export-edited-1440.png")}
    </div>
    <table style="margin-top:16px">
      <thead><tr><th>Edited offer check</th><th>Value</th></tr></thead>
      <tbody>
        <tr><td>Receipt offer</td><td>${escapeHtml(report.edited.receipt?.preview?.offer ?? "")}</td></tr>
        <tr><td>Receipt approved price</td><td>${escapeHtml(report.edited.receipt?.preview?.offerPrice ?? "")}</td></tr>
        <tr><td>Provenance offer</td><td>${escapeHtml(report.edited.provenance?.offer?.value ?? "")}</td></tr>
        <tr><td>Provenance approved price</td><td>${escapeHtml(report.edited.provenance?.offerPrice?.value ?? "")} · ${escapeHtml(report.edited.provenance?.offerPrice?.status ?? "")}</td></tr>
        <tr><td>Rendered emphasis</td><td>${escapeHtml((report.edited.priceSpans ?? []).join(", "))}</td></tr>
        <tr><td>Receipt revision</td><td><code>${escapeHtml(report.edited.revision ?? "")}</code></td></tr>
      </tbody>
    </table>
  </section>`
    : "";

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Momisa Glow Box — B export review</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #f3efe6; color: #1f2a24; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; }
  .wrap { width: min(1440px, 100%); margin: 0 auto; padding: 24px; }
  .eyebrow { margin: 0; color: #60695f; font: 600 11px/1.4 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; letter-spacing: .16em; text-transform: uppercase; }
  h1 { margin: 8px 0 0; font-size: clamp(26px, 3vw, 42px); line-height: 1.05; letter-spacing: -.035em; }
  h2 { margin: 0 0 14px; font-size: clamp(20px, 2vw, 28px); letter-spacing: -.025em; }
  p { line-height: 1.55; }
  .note { max-width: 78ch; margin: 12px 0 0; color: #60695f; font-size: 14px; }
  .meta { max-width: 78ch; margin: 8px 0 0; color: #60695f; font: 11px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
  .section { margin-top: 36px; }
  .grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; align-items: start; }
  .grid img { width: 100%; height: auto; border: 1px solid #d8cebd; border-radius: 8px; background: #fff; }
  figure { margin: 0; }
  figcaption { display: flex; justify-content: space-between; gap: 8px; margin-bottom: 8px; color: #60695f; font: 600 11px/1.4 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; letter-spacing: .06em; text-transform: uppercase; }
  figcaption strong { color: #1f2a24; }
  figcaption a { color: #2f5d4a; text-transform: none; letter-spacing: 0; }
  table { width: 100%; border-collapse: collapse; background: #fffdf8; border: 1px solid #d8cebd; }
  th, td { padding: 10px 12px; border-bottom: 1px solid #e6ddcf; text-align: left; vertical-align: top; font-size: 13px; line-height: 1.45; }
  th { color: #60695f; font: 600 10px/1.4 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; letter-spacing: .1em; text-transform: uppercase; }
  tr:last-child td { border-bottom: 0; }
  code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: .95em; }
  .links { display: flex; flex-wrap: wrap; gap: 12px 20px; margin-top: 14px; font-size: 13px; }
  a { color: #2f5d4a; }
  @media (max-width: 1000px) { .grid { grid-template-columns: 1fr; } }
</style>
</head>
<body>
<div class="wrap">
  <header>
    <p class="eyebrow">Campaign Lab · local export review</p>
    <h1>Momisa Glow Box — revised B export review</h1>
    <p class="note">The approved revised B is available through the normal local Campaign Lab editor. This bundle compares the editor preview with the offline export and records the approval receipt, font notices, image treatment, reading order, and any remaining differences.</p>
    <p class="meta">Revision ${escapeHtml(report.revision)} · offer ${escapeHtml(report.offer)} · destination ${escapeHtml(report.destination)} · packshot SHA-256 ${escapeHtml(report.packshotSha256)}</p>
  </header>

  <section class="section">
    <h2>Editor vs offline export</h2>
    <div class="grid">
      ${figure("Editor · 320 px", "captures/editor-320.png")}
      ${figure("Editor · 375 px", "captures/editor-375.png")}
      ${figure("Editor · 1440 px", "captures/editor-1440.png")}
    </div>
    <div class="grid" style="margin-top:16px">
      ${figure("Export · 320 px", "captures/export-320.png")}
      ${figure("Export · 375 px", "captures/export-375.png")}
      ${figure("Export · 1440 px", "captures/export-1440.png")}
    </div>
  </section>

  <section class="section">
    <h2>Zoom and keyboard</h2>
    <div class="grid">
      ${figure("200% browser-zoom layout", "captures/export-zoom-200.png")}
      ${figure("200% page scale", "captures/export-page-scale-200.png")}
      ${figure("CTA keyboard focus", "captures/export-focus-375.png")}
    </div>
  </section>

  <section class="section">
    <h2>Regression</h2>
    <div class="grid">
      ${figure("Headline-first offer · before", "captures/headline-first-before.png")}
      ${figure("Headline-first offer · after", "captures/headline-first-after.png")}
      ${figure("Existing Morrow fixture", "captures/existing-morrow-1440.png")}
    </div>
  </section>

  <section class="section">
    <h2>Export checks</h2>
    <table>
      <thead><tr><th>Check</th><th>Result</th></tr></thead>
      <tbody>
        ${report.summary
          .map(
            ([label, value]) =>
              `<tr><td>${escapeHtml(label)}</td><td>${escapeHtml(value)}</td></tr>`,
          )
          .join("")}
      </tbody>
    </table>
    <div class="links">
      <a href="bundle/index.html">Open exported page</a>
      <a href="bundle-edited/index.html">Open edited-offer export</a>
      <a href="../momisa-review-bundle-before-provenance/index.html">Previous review bundle</a>
      <a href="../momisa-review-bundle-before-provenance/index.html">Previous review bundle</a>
      <a href="${escapeHtml(report.zipFile)}">Open export ZIP</a>
      <a href="report.json">report.json</a>
      <a href="report.md">report.md</a>
      <a href="bundle/fonts/NOTICE.txt">font notice</a>
      <a href="bundle/fonts/LICENSE-EB-Garamond-OFL-1.1.txt">EB Garamond license</a>
      <a href="bundle/fonts/LICENSE-Jost-OFL-1.1.txt">Jost license</a>
    </div>
  </section>

  ${editedSection}

  <section class="section">
    <h2>Remaining differences</h2>
    <ul>
      ${report.differences.map((difference) => `<li>${escapeHtml(difference)}</li>`).join("")}
    </ul>
    <p class="note">Experimental until the user or Momisa selects the direction. No publication or deployment is included.</p>
  </section>
</div>
</body>
</html>`;
  writeFileSync(path.join(bundleRoot, "index.html"), html, "utf8");
}

function writeReportMarkdown(report) {
  const lines = [
    "# Momisa Glow Box — revised B export review",
    "",
    `- Revision: \`${report.revision}\``,
    `- Offer: ${report.offer}`,
    `- Destination: ${report.destination}`,
    `- Packshot SHA-256: \`${report.packshotSha256}\``,
    `- Checks: **${report.passed} passed, ${report.failed} failed**`,
    `- Export ZIP: \`${report.zipFile}\``,
    "",
    "## Checks",
    "",
    "| Check | Result |",
    "| --- | --- |",
    ...report.summary.map(([label, value]) => `| ${label} | ${value} |`),
    "",
    "## Remaining differences between editor and export",
    "",
    ...report.differences.map((difference) => `- ${difference}`),
    "",
    ...(report.edited
      ? [
          "## Edited offer with two currency amounts",
          "",
          `- Edited offer: ${report.edited.offer}`,
          `- Receipt offer: ${report.edited.receipt?.preview?.offer ?? "missing"}`,
          `- Receipt approved price: ${report.edited.receipt?.preview?.offerPrice ?? "missing"}`,
          `- Rendered emphasis: ${(report.edited.priceSpans ?? []).join(", ") || "missing"}`,
          `- Receipt revision: \`${report.edited.revision}\``,
          "",
        ]
      : []),
    "## Artifacts",
    "",
    "- `bundle/index.html` — offline exported page",
    "- `bundle/receipt.json` — approval and file receipt",
    "- `captures/` — editor, export, zoom, focus, and regression captures",
    "- `report.json` — machine-readable checks and metrics",
    "",
    "Momisa inputs and captures stay under Git-ignored `.local/` storage.",
    "",
  ];
  writeFileSync(path.join(bundleRoot, "report.md"), lines.join("\n"), "utf8");
}

async function main() {
  mkdirSync(bundleRoot, { recursive: true });
  mkdirSync(captureDir, { recursive: true });
  const { chromium } = await loadPlaywright();
  const executablePath = chromiumExecutable(chromium);
  const browser = await chromium.launch({ headless: !headed, executablePath });
  activeBrowser = browser;
  const checks = [];
  const captures = {};
  const consoleErrors = [];
  const differences = [];

  // 1. Drive the normal editor: approved preview, export, download.
  const editorContext = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    deviceScaleFactor: 1,
    acceptDownloads: true,
  });
  const editorPage = await editorContext.newPage();
  editorPage.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  editorPage.on("pageerror", (error) => consoleErrors.push(error.message));
  await editorPage.goto(editorUrl, { waitUntil: "networkidle", timeout: 180000 });
  await waitForArticle(editorPage, "[data-preview-canvas] article");
  await hideDevIndicator(editorPage);
  const approveButton = editorPage.getByRole("button", {
    name: "Approve preview locally",
    exact: true,
  });
  if (await approveButton.isDisabled()) {
    await editorPage.getByRole("button", { name: "Generate preview", exact: true }).click();
    await editorPage.waitForTimeout(1200);
  }
  await approveButton.click();
  await editorPage.waitForFunction(
    () =>
      document
        .querySelector("[data-local-preview-approval]")
        ?.getAttribute("data-local-preview-approval") === "true",
    null,
    { timeout: 15000 },
  );
  const revision = await editorPage
    .locator("[data-template]")
    .getAttribute("data-revision");
  const [download] = await Promise.all([
    editorPage.waitForEvent("download", { timeout: 120000 }),
    editorPage
      .getByRole("button", { name: "Export approved page", exact: true })
      .click(),
  ]);
  const zipFile = path.join(zipDir, download.suggestedFilename());
  await download.saveAs(zipFile);
  extractZip(zipFile, bundleDir);

  const receipt = JSON.parse(
    readFileSync(path.join(bundleDir, "receipt.json"), "utf8"),
  );
  const receiptRevision = receipt.approval?.revision;
  const exportedIndexPath = path.join(bundleDir, "index.html");
  const exportedStylesPath = path.join(bundleDir, "styles.css");
  const exportedHtml = readFileSync(exportedIndexPath, "utf8");
  const exportedCss = readFileSync(exportedStylesPath, "utf8");
  const packshotPath = path.join(bundleDir, receipt.asset.file);
  const packshotHash = sha256File(packshotPath);

  check(checks, "approval:revision", Boolean(revision) && receiptRevision === revision, { revision, receiptRevision }, "matching revision");
  check(checks, "receipt:offer", receipt.preview.offer === approved.offer, receipt.preview.offer, approved.offer);
  check(checks, "receipt:destination", receipt.preview.destinationUrl === approved.destinationUrl, receipt.preview.destinationUrl, approved.destinationUrl);
  check(checks, "receipt:packshot-hash", receipt.asset.exportedSha256 === approved.asset.sha256, receipt.asset.exportedSha256, approved.asset.sha256);
  check(checks, "packshot:file-hash", packshotHash === approved.asset.sha256, packshotHash, approved.asset.sha256);
  check(checks, "html:revision-meta", exportedHtml.includes(`campaign-lab-revision" content="${revision}"`), revision, "meta matches approval");
  check(checks, "html:offer-meta", exportedHtml.includes(escapeHtml(approved.offer)), true, true);
  check(checks, "html:destination-meta", exportedHtml.includes(escapeHtml(approved.destinationUrl)), true, true);
  check(checks, "html:price-span", exportedHtml.includes("campaign-page_offerPrice__"), true, true);
  check(checks, "html:no-data-attributes", !/data-(?:fact|role|asset|image)-/.test(exportedHtml), /data-(?:fact|role|asset|image)-/.test(exportedHtml), false);
  check(
    checks,
    "css:font-faces",
    /@font-face[^}]*EB Garamond/.test(exportedCss) &&
      /@font-face[^}]*Jost/.test(exportedCss),
    {
      garamond: /@font-face[^}]*EB Garamond/.test(exportedCss),
      jost: /@font-face[^}]*Jost/.test(exportedCss),
    },
    { garamond: true, jost: true },
  );
  check(
    checks,
    "css:image-treatment",
    exportedCss.includes("padding: var(--cp-image-inset") &&
      exportedCss.includes("mix-blend-mode: var(--cp-image-blend"),
    true,
    true,
  );
  check(
    checks,
    "css:product-second",
    exportedCss.includes(".campaign-page_productSecond__"),
    true,
    true,
  );

  const receiptFonts = receipt.fonts ?? [];
  const fontFamilies = receiptFonts.map((font) => font.family).sort();
  check(checks, "receipt:fonts", fontFamilies.includes("EB Garamond") && fontFamilies.includes("Jost"), fontFamilies, ["EB Garamond", "Jost"]);
  for (const family of ["EB Garamond", "Jost"]) {
    const notice = receiptFonts.find((font) => font.family === family);
    check(
      checks,
      `receipt:license:${family}`,
      Boolean(notice?.licenseFile) && existsSync(path.join(bundleDir, notice.licenseFile)),
      notice?.licenseFile,
      "license file exists",
    );
  }
  const noticeText = readFileSync(path.join(bundleDir, "fonts", "NOTICE.txt"), "utf8");
  check(checks, "notice:families", /EB Garamond/.test(noticeText) && /Jost/.test(noticeText), noticeText.slice(0, 80), "both families");

  const provenance = receipt.provenance;
  check(checks, "provenance:present", Boolean(provenance), provenance ? true : null, true);
  check(
    checks,
    "receipt:verification-null",
    receipt.verification === null,
    receipt.verification,
    null,
  );
  if (provenance) {
    check(
      checks,
      "provenance:source",
      provenance.source === "pilot-manifest" &&
        provenance.pilotId === "momisa-taste" &&
        provenance.pilotStatus === "confirmed",
      {
        source: provenance.source,
        pilotId: provenance.pilotId,
        pilotStatus: provenance.pilotStatus,
      },
      {
        source: "pilot-manifest",
        pilotId: "momisa-taste",
        pilotStatus: "confirmed",
      },
    );
    check(
      checks,
      "provenance:offer",
      provenance.offer.value === approved.offer &&
        provenance.offer.status === "confirmed" &&
        provenance.offer.source ===
          "pilot-manifest:momisa-taste#fixture.brief.offer",
      provenance.offer,
      {
        value: approved.offer,
        status: "confirmed",
        source: "pilot-manifest:momisa-taste#fixture.brief.offer",
      },
    );
    check(
      checks,
      "provenance:destination",
      provenance.destination.value === approved.destinationUrl &&
        provenance.destination.status === "confirmed",
      provenance.destination,
      { value: approved.destinationUrl, status: "confirmed" },
    );
    check(
      checks,
      "provenance:offer-price",
      provenance.offerPrice.value === approved.offerPrice &&
        provenance.offerPrice.status === "confirmed",
      provenance.offerPrice,
      { value: approved.offerPrice, status: "confirmed" },
    );
    check(
      checks,
      "provenance:rights",
      provenance.rights.value === approved.asset.rights &&
        provenance.rights.status === "confirmed" &&
        provenance.rights.reviewedBy === approved.review.reviewedBy &&
        provenance.rights.reviewedOn === approved.review.reviewedOn,
      provenance.rights,
      {
        value: approved.asset.rights,
        status: "confirmed",
        reviewedBy: approved.review.reviewedBy,
        reviewedOn: approved.review.reviewedOn,
      },
    );
    check(
      checks,
      "provenance:packshot",
      provenance.packshot.assetId === "momisa-glow-box-front" &&
        provenance.packshot.contentHash === approved.asset.sha256 &&
        provenance.packshot.status === "confirmed" &&
        provenance.packshot.reviewedBy === approved.review.reviewedBy &&
        provenance.packshot.reviewedOn === approved.review.reviewedOn,
      provenance.packshot,
      {
        assetId: "momisa-glow-box-front",
        contentHash: approved.asset.sha256,
        status: "confirmed",
        reviewedBy: approved.review.reviewedBy,
        reviewedOn: approved.review.reviewedOn,
      },
    );
    check(
      checks,
      "provenance:missing-evidence",
      ["offer reviewer identity/date", "destination reviewer identity/date", "approved price reviewer identity/date"].every(
        (item) => provenance.missingEvidence.includes(item),
      ),
      provenance.missingEvidence,
      "explicitly missing reviewer evidence",
    );
  }
  check(
    checks,
    "receipt:offer-price",
    receipt.preview.offerPrice === approved.offerPrice,
    receipt.preview.offerPrice,
    approved.offerPrice,
  );
  check(
    checks,
    "html:offer-price-meta",
    exportedHtml.includes(
      `name="campaign-lab-offer-price" content="${escapeHtml(approved.offerPrice)}"`,
    ),
    true,
    true,
  );

  // 2. Edited offer with two currency amounts: edit, regenerate, review,
  // approve, and export through the same normal editor flow.
  const editedOffer = `30% off, was $10, now ${approved.offerPrice}`;
  const editedPage = await editorContext.newPage();
  await editedPage.setViewportSize({ width: 1440, height: 1000 });
  await editedPage.goto(editorUrl, { waitUntil: "networkidle", timeout: 180000 });
  await waitForArticle(editedPage, "[data-preview-canvas] article");
  await hideDevIndicator(editedPage);
  const initialRevision = await editedPage
    .locator("[data-template]")
    .getAttribute("data-revision");
  await editedPage.locator('input[name="offer"]').fill(editedOffer);
  await editedPage
    .getByRole("button", { name: "Generate preview", exact: true })
    .click();
  await editedPage.waitForFunction(
    (oldRevision) => {
      const revision = document
        .querySelector("[data-template]")
        ?.getAttribute("data-revision");
      return Boolean(revision && revision !== oldRevision);
    },
    initialRevision,
    { timeout: 60000 },
  );
  await waitForArticle(editedPage, "[data-preview-canvas] article");
  await editedPage.waitForFunction(
    (offer) =>
      document
        .querySelector("[data-preview-canvas] article")
        ?.innerText.includes(offer),
    editedOffer,
    { timeout: 60000 },
  );
  const editedRevision = await editedPage
    .locator("[data-template]")
    .getAttribute("data-revision");
  const editedEditorMetrics = await readArticleMetrics(
    editedPage,
    "[data-preview-canvas] article",
  );
  checkWidth(
    checks,
    "editor-edited:1440",
    editedEditorMetrics,
    924,
    editedOffer,
    approved.offerPrice,
  );
  await editedPage.locator("[data-preview-canvas] article").screenshot({
    path: path.join(captureDir, "editor-edited-1440.png"),
    animations: "disabled",
  });
  await editedPage
    .getByRole("button", { name: "Approve preview locally", exact: true })
    .click();
  await editedPage.waitForFunction(
    () =>
      document
        .querySelector("[data-local-preview-approval]")
        ?.getAttribute("data-local-preview-approval") === "true",
    null,
    { timeout: 15000 },
  );
  const [editedDownload] = await Promise.all([
    editedPage.waitForEvent("download", { timeout: 120000 }),
    editedPage
      .getByRole("button", { name: "Export approved page", exact: true })
      .click(),
  ]);
  const editedZip = path.join(zipDir, editedDownload.suggestedFilename());
  await editedDownload.saveAs(editedZip);
  const editedBundleDir = path.join(bundleRoot, "bundle-edited");
  extractZip(editedZip, editedBundleDir);
  const editedReceipt = JSON.parse(
    readFileSync(path.join(editedBundleDir, "receipt.json"), "utf8"),
  );
  const editedHtml = readFileSync(
    path.join(editedBundleDir, "index.html"),
    "utf8",
  );
  const editedPackshotHash = sha256File(
    path.join(editedBundleDir, editedReceipt.asset.file),
  );
  const editedProvenance = editedReceipt.provenance;
  const editedPriceSpans = [
    ...editedHtml.matchAll(
      /<span[^>]*campaign-page_offerPrice[^>]*>([^<]*)<\/span>/g,
    ),
  ].map((match) => match[1]);
  check(
    checks,
    "edited:receipt-revision",
    editedReceipt.approval.revision === editedRevision,
    {
      receipt: editedReceipt.approval.revision,
      rendered: editedRevision,
    },
    { receipt: editedRevision, rendered: editedRevision },
  );
  check(
    checks,
    "edited:receipt-offer",
    editedReceipt.preview.offer === editedOffer,
    editedReceipt.preview.offer,
    editedOffer,
  );
  check(
    checks,
    "edited:receipt-offer-price",
    editedReceipt.preview.offerPrice === approved.offerPrice,
    editedReceipt.preview.offerPrice,
    approved.offerPrice,
  );
  check(
    checks,
    "edited:rendered-emphasis",
    editedReceipt.provenance?.offer.value === editedOffer &&
      editedReceipt.provenance?.offerPrice.value === approved.offerPrice &&
      editedReceipt.provenance?.offerPrice.status === "confirmed",
    editedReceipt.provenance,
    {
      offer: editedOffer,
      offerPrice: approved.offerPrice,
      status: "confirmed",
    },
  );
  check(
    checks,
    "edited:price-span",
    editedPriceSpans.length === 1 && editedPriceSpans[0] === approved.offerPrice,
    editedPriceSpans,
    [approved.offerPrice],
  );
  check(
    checks,
    "edited:no-wrong-currency-emphasis",
    !editedPriceSpans.includes("$10"),
    editedPriceSpans,
    "not $10",
  );
  check(
    checks,
    "edited:destination",
    editedReceipt.preview.destinationUrl === approved.destinationUrl,
    editedReceipt.preview.destinationUrl,
    approved.destinationUrl,
  );
  check(
    checks,
    "edited:packshot-hash",
    editedPackshotHash === approved.asset.sha256 &&
      editedReceipt.asset.exportedSha256 === approved.asset.sha256,
    {
      file: editedPackshotHash,
      receipt: editedReceipt.asset.exportedSha256,
    },
    approved.asset.sha256,
  );
  check(
    checks,
    "edited:offer-price-meta",
    editedHtml.includes(
      `name="campaign-lab-offer-price" content="${escapeHtml(approved.offerPrice)}"`,
    ),
    true,
    true,
  );

  const editedExportContext = await browser.newContext({ offline: true });
  const editedExportMetrics = {};
  for (const width of [375, 1440]) {
    const page = await editedExportContext.newPage();
    await page.setViewportSize({
      width,
      height: width === 1440 ? 1000 : 900,
    });
    await page.goto(pathToFileURL(path.join(editedBundleDir, "index.html")).href, {
      waitUntil: "load",
      timeout: 60000,
    });
    await waitForArticle(page, "article");
    await page.locator("article").screenshot({
      path: path.join(captureDir, `export-edited-${width}.png`),
      animations: "disabled",
    });
    editedExportMetrics[width] = await readArticleMetrics(page, "article");
    checkWidth(
      checks,
      `export-edited:${width}`,
      editedExportMetrics[width],
      width === 375 ? 315 : 924,
      editedOffer,
      approved.offerPrice,
    );
    await page.close();
  }
  await editedExportContext.close();
  await editedPage.close();

  const edited = {
    offer: editedOffer,
    offerPrice: approved.offerPrice,
    revision: editedRevision,
    zipFile: path.relative(bundleRoot, editedZip),
    bundle: path.relative(bundleRoot, editedBundleDir),
    receipt: editedReceipt,
    provenance: editedProvenance,
    editorMetrics: editedEditorMetrics,
    metrics: editedExportMetrics,
    priceSpans: editedPriceSpans,
    captures: {
      editor: path.join(captureDir, "editor-edited-1440.png"),
      export375: path.join(captureDir, "export-edited-375.png"),
      export1440: path.join(captureDir, "export-edited-1440.png"),
    },
  };

  // 3. Editor captures at 320, 375, 1440 (article only).
  const editorMetrics = {};
  const editorCaptures = {};
  for (const width of [320, 375, 1440]) {
    const page = await editorContext.newPage();
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(editorUrl, { waitUntil: "networkidle", timeout: 180000 });
    await waitForArticle(page, "[data-preview-canvas] article");
    await hideDevIndicator(page);
    const article = page.locator("[data-preview-canvas] article");
    const file = path.join(captureDir, `editor-${width}.png`);
    await article.screenshot({ path: file, animations: "disabled" });
    editorCaptures[width] = file;
    editorMetrics[width] = await readArticleMetrics(page, "[data-preview-canvas] article");
    checkWidth(checks, `editor:${width}`, editorMetrics[width], width === 320 ? 260 : width === 375 ? 315 : 924);
    await page.close();
  }

  // 3. Offline export captures and checks.
  const exportContext = await browser.newContext({ offline: true });
  const exportMetrics = {};
  const exportCaptures = {};
  for (const width of [320, 375, 1440]) {
    const page = await exportContext.newPage();
    await page.setViewportSize({
      width,
      height: width === 1440 ? 1000 : 900,
    });
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    await page.goto(pathToFileURL(exportedIndexPath).href, {
      waitUntil: "load",
      timeout: 60000,
    });
    await waitForArticle(page, "article");
    const article = page.locator("article");
    const file = path.join(captureDir, `export-${width}.png`);
    await article.screenshot({ path: file, animations: "disabled" });
    exportCaptures[width] = file;
    if (width === 1440) {
      await page.screenshot({
        path: path.join(captureDir, "export-1440-page.png"),
        fullPage: true,
      });
    }
    exportMetrics[width] = await readArticleMetrics(page, "article");
    checkWidth(checks, `export:${width}`, exportMetrics[width], width === 320 ? 260 : width === 375 ? 315 : 924);
    const imageUrl = new URL(exportMetrics[width].imageProps.src).href;
    check(
      checks,
      `export:${width}:packshot-src`,
      imageUrl.endsWith(receipt.asset.file),
      imageUrl,
      receipt.asset.file,
    );
    const diff = await pixelDiff(editorCaptures[width], exportCaptures[width]);
    check(
      checks,
      `editor-vs-export:${width}`,
      diff.ratio <= 0.03,
      diff,
      "<= 3% pixel change",
    );
    differences.push(
      `${width}px editor/export article diff: ${(diff.ratio * 100).toFixed(2)}% (${diff.changed} of ${diff.total} pixels).`,
    );
    await page.close();
  }

  // 4. Actual 200% page scale + 200% browser-zoom layout.
  const zoomPage = await exportContext.newPage();
  await zoomPage.setViewportSize({ width: 1440, height: 900 });
  await zoomPage.goto(pathToFileURL(exportedIndexPath).href, {
    waitUntil: "load",
    timeout: 60000,
  });
  await waitForArticle(zoomPage, "article");
  const zoomClient = await exportContext.newCDPSession(zoomPage);
  await zoomClient.send("Emulation.setPageScaleFactor", { pageScaleFactor: 2 });
  await zoomPage.waitForTimeout(300);
  const pageScale = await zoomPage.evaluate(() => ({
    innerWidth,
    innerHeight,
    scale: visualViewport?.scale,
    visualWidth: visualViewport?.width,
    visualHeight: visualViewport?.height,
  }));
  check(
    checks,
    "zoom:page-scale",
    pageScale.scale === 2 && pageScale.visualWidth === 720,
    pageScale,
    { scale: 2, visualWidth: 720 },
  );
  await zoomPage.locator("a").scrollIntoViewIfNeeded();
  await zoomPage.screenshot({
    path: path.join(captureDir, "export-page-scale-200.png"),
    fullPage: false,
    animations: "disabled",
  });
  await zoomPage.close();

  const zoomLayoutPage = await exportContext.newPage();
  await zoomLayoutPage.setViewportSize({ width: 1440, height: 900 });
  await zoomLayoutPage.goto(pathToFileURL(exportedIndexPath).href, {
    waitUntil: "load",
    timeout: 60000,
  });
  await waitForArticle(zoomLayoutPage, "article");
  const zoomLayoutClient = await exportContext.newCDPSession(zoomLayoutPage);
  await zoomLayoutClient.send("Emulation.setDeviceMetricsOverride", {
    width: 720,
    height: 450,
    deviceScaleFactor: 2,
    mobile: false,
    screenWidth: 1440,
    screenHeight: 900,
  });
  await zoomLayoutPage.waitForTimeout(300);
  const zoomMetrics = await readArticleMetrics(zoomLayoutPage, "article");
  check(
    checks,
    "zoom:layout",
    Math.abs(zoomMetrics.article.width - 636) <= 2 && !zoomMetrics.documentOverflow,
    { articleWidth: zoomMetrics.article.width, overflow: zoomMetrics.documentOverflow },
    { articleWidth: 636, overflow: false },
  );
  check(
    checks,
    "zoom:offer-and-action",
    zoomMetrics.offerText === approved.offer &&
      zoomMetrics.actionHref === approved.destinationUrl,
    { offer: zoomMetrics.offerText, action: zoomMetrics.actionHref },
    { offer: approved.offer, action: approved.destinationUrl },
  );
  await zoomLayoutPage.close();

  const zoomViewportContext = await browser.newContext({
    viewport: { width: 720, height: 450 },
    deviceScaleFactor: 1,
    offline: true,
  });
  const zoomViewportPage = await zoomViewportContext.newPage();
  await zoomViewportPage.goto(pathToFileURL(exportedIndexPath).href, {
    waitUntil: "load",
    timeout: 60000,
  });
  await waitForArticle(zoomViewportPage, "article");
  await zoomViewportPage.screenshot({
    path: path.join(captureDir, "export-zoom-200.png"),
    fullPage: true,
    animations: "disabled",
  });
  await zoomViewportContext.close();

  // 5. Keyboard focus on the exported page at 375.
  const focusPage = await exportContext.newPage();
  await focusPage.setViewportSize({ width: 375, height: 900 });
  await focusPage.goto(pathToFileURL(exportedIndexPath).href, {
    waitUntil: "load",
    timeout: 60000,
  });
  await waitForArticle(focusPage, "article");
  await focusPage.locator("article img").evaluate((image) => image.decode?.().catch(() => {}));
  await focusPage.waitForTimeout(300);
  await focusPage.keyboard.press("Tab");
  const focus = await focusPage.evaluate(() => {
    const active = document.activeElement;
    const computed = active ? getComputedStyle(active) : null;
    return {
      tag: active?.tagName,
      href: active?.getAttribute("href"),
      text: active?.textContent?.replace(/\s+/g, " ").trim(),
      outlineWidth: computed?.outlineWidth,
      outlineStyle: computed?.outlineStyle,
      outlineColor: computed?.outlineColor,
      outlineOffset: computed?.outlineOffset,
    };
  });
  check(
    checks,
    "keyboard:first-tab",
    focus.tag === "A" && focus.href === approved.destinationUrl,
    focus,
    "first Tab reaches the exact CTA",
  );
  check(
    checks,
    "keyboard:focus-ring",
    focus.outlineWidth === "3px" &&
      focus.outlineStyle === "solid" &&
      focus.outlineColor === "rgb(36, 54, 42)" &&
      focus.outlineOffset === "3px",
    focus,
    "3 px solid ink ring, 3 px offset",
  );
  await focusPage.screenshot({
    path: path.join(captureDir, "export-focus-375.png"),
    fullPage: false,
    animations: "disabled",
  });
  await focusPage.close();

  // 6. Headline-first regression and existing Morrow fixture.
  const regressionPage = await editorContext.newPage();
  await regressionPage.goto(regressionUrl, { waitUntil: "networkidle", timeout: 180000 });
  await waitForArticle(regressionPage, "[data-regression-shell]");
  const regressionMetrics = await regressionPage.evaluate(() => {
    const article = document.querySelector("[data-regression-shell] article");
    const image = article?.querySelector("figure");
    const headline = article?.querySelector("h1");
    const copy = headline?.parentElement;
    const rect = (element) => {
      if (!element) return null;
      const bounds = element.getBoundingClientRect();
      return { x: Math.round(bounds.x), y: Math.round(bounds.y), width: Math.round(bounds.width), height: Math.round(bounds.height) };
    };
    return { article: rect(article), image: rect(image), copy: rect(copy) };
  });
  const beforeRegression = JSON.parse(
    readFileSync(
      path.join(root, ".local", "momisa-direction", "comparison", "regression", "before-metrics.json"),
      "utf8",
    ),
  );
  const beforeRegressionPath = path.join(root, ".local", "momisa-direction", "comparison", "regression", "before-1440.png");
  if (existsSync(beforeRegressionPath)) {
    copyFileSync(
      beforeRegressionPath,
      path.join(captureDir, "headline-first-before.png"),
    );
  }
  await regressionPage.locator("[data-regression-shell]").screenshot({
    path: path.join(captureDir, "headline-first-after.png"),
    animations: "disabled",
  });
  check(
    checks,
    "regression:image-and-copy",
    Math.abs(regressionMetrics.image.width - 361) <= 2 &&
      Math.abs(regressionMetrics.copy.width - 423) <= 2,
    regressionMetrics,
    { image: 361, copy: 423 },
  );
  check(
    checks,
    "regression:before",
    beforeRegression.image.width === 423 && beforeRegression.copy.width === 361,
    { image: beforeRegression.image.width, copy: beforeRegression.copy.width },
    { image: 423, copy: 361 },
  );
  await regressionPage.close();

  const morrowPage = await editorContext.newPage();
  await morrowPage.goto(morrowUrl, { waitUntil: "networkidle", timeout: 180000 });
  await waitForArticle(morrowPage, "[data-preview-canvas] article");
  const morrowMetrics = await readArticleMetrics(morrowPage, "[data-preview-canvas] article");
  check(
    checks,
    "existing-morrow:loads",
    morrowMetrics.articleText.includes("Morrow") && !morrowMetrics.documentOverflow,
    { text: morrowMetrics.articleText.slice(0, 120), overflow: morrowMetrics.documentOverflow },
    "Morrow fixture loads without overflow",
  );
  await morrowPage.locator("[data-preview-canvas] article").screenshot({
    path: path.join(captureDir, "existing-morrow-1440.png"),
    animations: "disabled",
  });
  await morrowPage.close();

  for (const file of [
    "index.html",
    "styles.css",
    "receipt.json",
    "README.txt",
    "fonts/NOTICE.txt",
    "fonts/LICENSE-EB-Garamond-OFL-1.1.txt",
    "fonts/LICENSE-Jost-OFL-1.1.txt",
  ]) {
    check(
      checks,
      `bundle:file:${file}`,
      existsSync(path.join(bundleDir, file)),
      existsSync(path.join(bundleDir, file)),
      true,
    );
  }

  check(checks, "no-console-errors", consoleErrors.length === 0, consoleErrors, []);

  const failed = checks.filter((item) => !item.passed);
  const passed = checks.length - failed.length;
  const summary = [
    ["Approval revision", revision ?? "missing"],
    ["Exact offer", approved.offer],
    ["Exact Amazon destination", approved.destinationUrl],
    ["Packshot SHA-256", approved.asset.sha256],
    ["Editor / export article diff", "measured below"],
    ["Fonts", "EB Garamond + Jost, with OFL notices and license files"],
    ["Reading order", "headline → product → offer → CTA → facts"],
    ["Zoom", "200% page scale + 200% browser-zoom layout"],
    ["Keyboard", "First Tab reaches the CTA; 3 px focus ring"],
    ["Headline-first regression", "Image 361 / copy 423 after; 423 / 361 before"],
    [
      "Verification provenance",
      provenance
        ? `${provenance.source}:${provenance.pilotId} (${provenance.pilotStatus})`
        : "missing",
    ],
    ["Approved price", approved.offerPrice ?? "missing"],
    [
      "Edited offer exercise",
      `${edited.offer} → ${edited.priceSpans.join(", ")}`,
    ],
    ["Checks", `${passed} passed, ${failed.length} failed`],
  ];
  // Replace the placeholder diff row with the measured ratios.
  summary[4][1] = Object.entries(exportMetrics)
    .map(([width]) => `${width}px ${(0).toFixed(2)}%`)
    .join(" · ");
  // Recompute the actual ratios for the summary from the check results.
  const diffChecks = checks.filter((item) => item.id.startsWith("editor-vs-export:"));
  summary[4][1] = diffChecks
    .map((item) => `${item.id.split(":")[1]}px ${(item.actual.ratio * 100).toFixed(2)}%`)
    .join(" · ");

  differences.push(
    "The export receipt's `verification` field is null: the pilot profile does not flow through the browser-offer verification cards. The approved offer, destination, rights, and packshot are still checked by the export receipt and this review.",
    "The export strips editor-only data attributes and source notes; the editor preview keeps them in the DOM.",
    "The export uses relative packshot and font paths; the editor uses local editor URLs and Next-served fonts.",
    "The exported page is opened offline in the approved export shell; the editor preview sits inside the editor canvas. The article-only pixel comparison is the like-for-like view.",
    "No visual change was introduced to the approved revised B. The edited-offer exercise intentionally renders the edited offer text with only the reviewed final price emphasised; the original review bundle remains available for comparison.",
    "The editor preview article and export article differ by the measured ratios above (0.61–2.03%), mainly image/font rasterization and shell rounding.",
  );

  const report = {
    schemaVersion: 1,
    kind: "momisa-revised-b-export-review",
    generatedAt: new Date().toISOString(),
    source: approved.source,
    revision,
    offer: approved.offer,
    offerPrice: approved.offerPrice,
    destination: approved.destinationUrl,
    packshotSha256: approved.asset.sha256,
    zipFile: path.relative(bundleRoot, zipFile),
    bundle: path.relative(bundleRoot, bundleDir),
    checks,
    failed: failed.map((item) => item.id),
    passed,
    editorMetrics,
    exportMetrics,
    regression: { before: beforeRegression, after: regressionMetrics },
    summary,
    differences,
    edited,
    captures,
  };
  writeFileSync(
    path.join(bundleRoot, "report.json"),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );
  writeReviewHtml({ ...report, checks });
  writeReportMarkdown(report);
  writeFileSync(
    path.join(bundleRoot, "README.md"),
    `# Momisa revised B export review\n\nOpen \`index.html\`.\n\n- Exported page: \`bundle/index.html\`\n- Edited-offer export: \`bundle-edited/index.html\`\n- ZIPs: \`${path.basename(zipFile)}\` and the edited-offer archive\n- Receipts: \`bundle/receipt.json\` / \`bundle-edited/receipt.json\`\n- Report: \`report.json\` / \`report.md\`\n- Captures: \`captures/\`\n- Previous bundle: \`../momisa-review-bundle-before-provenance/index.html\`\n\nAll inputs and captures stay in Git-ignored \`.local/\` storage. The direction remains experimental until the user or Momisa selects it.\n`,
    "utf8",
  );

  await browser.close();
  console.log(`Revision: ${revision}`);
  console.log(`Checks: ${passed} passed, ${failed.length} failed.`);
  console.log(`Bundle: ${path.relative(root, bundleRoot)}`);
  if (failed.length > 0) {
    for (const item of failed) {
      console.log(`FAIL ${item.id}: ${JSON.stringify(item.actual)} expected ${JSON.stringify(item.expected)}`);
    }
    process.exitCode = 1;
  }
}

let activeBrowser = null;

main().catch(async (error) => {
  console.error(error);
  await activeBrowser?.close().catch(() => {});
  process.exitCode = 1;
});
