#!/usr/bin/env node
/**
 * Local revision capture for direction B.
 *
 * Compares the approved reference (A), the original a35c178 alternative (B
 * original), and the revised product-second alternative (B revised). Captures
 * 320, 375, 1440, a 200% zoom equivalent, keyboard focus, and the headline-first
 * offer regression proof. Momisa inputs and captures stay under ignored
 * .local/momisa-direction/.
 */
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const base = path.join(root, ".local", "momisa-direction");
const comparison = path.join(base, "comparison");
const beforeDir = path.join(comparison, "before");
const afterDir = path.join(comparison, "after");
const regressionDir = path.join(comparison, "regression");
const captureDir = path.join(comparison, "captures");
const approved = JSON.parse(
  readFileSync(path.join(base, "approved-brief.json"), "utf8"),
);
const beforeReport = existsSync(path.join(captureDir, "report.json"))
  ? JSON.parse(readFileSync(path.join(captureDir, "report.json"), "utf8"))
  : null;
const beforeRegression = JSON.parse(
  readFileSync(path.join(regressionDir, "before-metrics.json"), "utf8"),
);
const origin = (argValue("--url") ?? "http://localhost:3123").replace(/\/$/, "");
const headed = process.argv.includes("--headed");

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

function check(checks, id, passed, actual, expected) {
  checks.push({ id, passed, actual, expected });
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

async function waitForArticle(page, shellSelector) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(
    (selector) => {
      const image = document.querySelector(`${selector} article img`);
      return image && image.complete && image.naturalWidth > 0;
    },
    shellSelector,
    { timeout: 60000 },
  );
}

async function readMetrics(page, shellSelector) {
  return page.evaluate((selector) => {
    const shell = document.querySelector(selector);
    const article = shell?.querySelector("article");
    const headline = article?.querySelector("h1");
    const figure = article?.querySelector("figure");
    const image = figure?.querySelector("img");
    const offer = article?.querySelector('[data-role="offer"]');
    const offerText = offer?.querySelector("p");
    const price = offer?.querySelector('[class*="offerPrice"]');
    const action = article?.querySelector('[data-role="action"]');
    const facts = article?.querySelector("ul");
    const copy = headline?.parentElement;

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
        paddingTop: computed.paddingTop,
        paddingRight: computed.paddingRight,
        paddingBottom: computed.paddingBottom,
        paddingLeft: computed.paddingLeft,
      };
    };
    const order = article
      ? [
          ...article.querySelectorAll(
            'h1, figure, [data-role="offer"], [data-role="action"], ul',
          ),
        ].map((element) => {
          const role = element.getAttribute("data-role");
          return role ? `${element.tagName}:${role}` : element.tagName;
        })
      : [];

    return {
      articleText: article?.innerText ?? "",
      article: rect(article),
      shell: rect(shell),
      copy: rect(copy),
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
  }, shellSelector);
}

async function packshotHash(page, imageUrl) {
  const response = await page.request.get(imageUrl);
  if (!response.ok()) {
    throw new Error(`Packshot request failed: ${response.status()}`);
  }
  const bytes = await response.body();
  return createHash("sha256").update(bytes).digest("hex");
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

function checkViewport(checks, label, metrics, expectedWidth, firstScreen = null) {
  const articleTop = metrics.article?.y ?? 0;
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
    metrics.offerText === approved.offer,
    metrics.offerText,
    approved.offer,
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
    !metrics.documentOverflow &&
      metrics.shell.width <= metrics.viewport.width + 1,
    {
      documentOverflow: metrics.documentOverflow,
      shellWidth: metrics.shell.width,
      viewportWidth: metrics.viewport.width,
    },
    { documentOverflow: false, shellWidth: "<= viewport width" },
  );
  check(
    checks,
    `${label}:action-height`,
    Boolean(metrics.action) && metrics.action.height >= 44,
    metrics.action?.height,
    ">= 44",
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
    `${label}:product-mat`,
    metrics.figureStyle.padding === "8px",
    metrics.figureStyle.padding,
    "8px",
  );
  check(
    checks,
    `${label}:price-role`,
    metrics.priceText === "$4.94" &&
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
    "$4.94, larger than the offer line, accent colour, inline-block",
  );
  check(
    checks,
    `${label}:serif-display`,
    metrics.headlineStyle.fontFamily.includes("EB Garamond"),
    metrics.headlineStyle.fontFamily,
    "EB Garamond",
  );
  check(
    checks,
    `${label}:serif-offer`,
    metrics.offerTextStyle.fontFamily.includes("EB Garamond"),
    metrics.offerTextStyle.fontFamily,
    "EB Garamond",
  );
  check(
    checks,
    `${label}:sans-body`,
    metrics.actionStyle.fontFamily.includes("Jost"),
    metrics.actionStyle.fontFamily,
    "Jost",
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
    JSON.stringify(metrics.domOrder) ===
      JSON.stringify(["H1", "FIGURE", "DIV:offer", "A:action", "UL"]),
    metrics.domOrder,
    ["H1", "FIGURE", "DIV:offer", "A:action", "UL"],
  );
  if (firstScreen !== null) {
    check(
      checks,
      `${label}:action-in-first-screen`,
      metrics.action.bottom - articleTop <= firstScreen,
      Math.round((metrics.action.bottom - articleTop) * 100) / 100,
      `<= ${firstScreen}`,
    );
  }
}

function writeIndexHtml() {
  const changes = [
    [
      "Mobile order",
      "Headline → offer → CTA → facts → product.",
      "Headline → product → offer → CTA → facts, in both DOM and visual order.",
      "Put the pack in the reading path before the commercial block; the price and action still follow the product.",
    ],
    [
      "Price role",
      "The offer was a single display line.",
      "$4.94 is a larger inline accent within the same approved offer sentence.",
      "Give the price a clear second read without changing, duplicating, or inventing offer copy.",
    ],
    [
      "Packshot treatment",
      "White packshot ground multiplied into the apricot page.",
      "Normal blend on a warm photo mat, 8 px inset, square frame, no mobile max-height crop.",
      "Keep the approved packshot bytes and colours intact while making the white studio ground feel deliberate.",
    ],
    [
      "Desktop geometry",
      "Experiment rule changed every headline-first offer layout to 1.08 / 0.92.",
      "The 1.08 / 0.92 image-left grid is scoped to the product-second experiment.",
      "Leave existing headline-first offer layouts at their previous 0.92 / 1.08 geometry.",
    ],
  ];

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Momisa Glow Box — B revision review</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #f3efe6; color: #1f2a24; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; }
  .wrap { width: min(1440px, 100%); margin: 0 auto; padding: 24px; }
  .eyebrow { margin: 0; color: #60695f; font: 600 11px/1.4 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; letter-spacing: .16em; text-transform: uppercase; }
  h1 { margin: 8px 0 0; font-size: clamp(26px, 3vw, 42px); line-height: 1.05; letter-spacing: -.035em; }
  h2 { margin: 0 0 14px; font-size: clamp(20px, 2vw, 28px); letter-spacing: -.025em; }
  h3 { margin: 0 0 8px; font-size: 16px; letter-spacing: -.01em; }
  p { line-height: 1.55; }
  .note { max-width: 78ch; margin: 12px 0 0; color: #60695f; font-size: 14px; }
  .meta { max-width: 78ch; margin: 8px 0 0; color: #60695f; font: 11px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
  .section { margin-top: 36px; }
  .grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; align-items: start; }
  .mobile-grid img { width: 375px; max-width: 100%; }
  .desktop-grid img { width: 100%; }
  figure { margin: 0; background: transparent; }
  figcaption { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 8px; margin-bottom: 8px; color: #60695f; font: 600 11px/1.4 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; letter-spacing: .06em; text-transform: uppercase; }
  figcaption strong { color: #1f2a24; }
  figure img { display: block; height: auto; background: #fff; border: 1px solid #d8cebd; border-radius: 8px; }
  figure a { color: inherit; }
  .evidence { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
  .evidence figure img { width: 100%; max-height: 520px; object-fit: contain; object-position: top; background: #fff; }
  .regression { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
  .regression figure img { width: 100%; }
  table { width: 100%; border-collapse: collapse; background: #fffdf8; border: 1px solid #d8cebd; }
  th, td { padding: 12px 14px; border-bottom: 1px solid #e6ddcf; text-align: left; vertical-align: top; font-size: 13px; line-height: 1.45; }
  th { color: #60695f; font: 600 10px/1.4 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; letter-spacing: .1em; text-transform: uppercase; }
  td:first-child { font-weight: 600; white-space: nowrap; }
  tr:last-child td { border-bottom: 0; }
  .choice { padding: 20px; border: 1px solid #d8cebd; border-radius: 12px; background: #fffdf8; }
  .choice button { min-height: 44px; margin: 4px 8px 4px 0; padding: 0 18px; border: 1px solid #1f2a24; border-radius: 2px; background: #1f2a24; color: #fffaf1; font: 600 14px/1 system-ui, sans-serif; cursor: pointer; }
  .choice button.secondary { background: transparent; color: #1f2a24; }
  #choice-record { min-height: 1.5em; margin: 12px 0 0; color: #2f5d4a; font-weight: 600; }
  .links { display: flex; flex-wrap: wrap; gap: 12px 20px; margin-top: 14px; font-size: 13px; }
  a { color: #2f5d4a; }
  code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: .95em; }
  @media (max-width: 1000px) {
    .grid, .desktop-grid, .evidence, .regression { grid-template-columns: 1fr; }
    .mobile-grid img { width: 375px; }
  }
</style>
</head>
<body>
<div class="wrap">
  <header>
    <p class="eyebrow">Campaign Lab · local experiment</p>
    <h1>Momisa Glow Box — B revision review</h1>
    <p class="note">The approved reference (A), the original a35c178 alternative (B original), and the revised product-second alternative (B revised). The product, offer, Amazon destination, facts, CTA label, and approved packshot are unchanged. This stays experimental until the user or Momisa selects a direction.</p>
    <p class="meta">Approved local export revision ${escapeHtml(approved.source.approvedExportRevision)} · packshot SHA-256 ${escapeHtml(approved.asset.sha256.slice(0, 16))}… · inputs and captures are in ignored storage.</p>
  </header>

  <section class="section">
    <h2>375 px</h2>
    <div class="grid mobile-grid">
      ${comparisonFigure("A · reference", "before/A-375.png")}
      ${comparisonFigure("B · original", "before/B-375.png")}
      ${comparisonFigure("B · revised", "after/B-375.png")}
    </div>
  </section>

  <section class="section">
    <h2>Desktop</h2>
    <div class="grid desktop-grid">
      ${comparisonFigure("A · reference", "before/A-desktop.png")}
      ${comparisonFigure("B · original", "before/B-desktop.png")}
      ${comparisonFigure("B · revised", "after/B-desktop.png")}
    </div>
  </section>

  <section class="section">
    <h2>Responsive and interaction evidence</h2>
    <div class="evidence">
      ${comparisonFigure("B revised · 320 px", "after/B-320.png")}
      ${comparisonFigure("B revised · 1440 px", "after/B-1440.png")}
      ${comparisonFigure("B revised · 200% zoom equivalent", "after/B-zoom-200.png")}
      ${comparisonFigure("B revised · keyboard focus on CTA", "after/B-focus-375.png")}
    </div>
  </section>

  <section class="section">
    <h2>Headline-first offer geometry regression</h2>
    <p class="note">No shipped fixture currently combines headline-first with the offer-led layout. The probe uses the existing Harbor Field sparse fixture and the existing headline-first token. Before = a35c178 global rule; after = the experiment-scoped rule.</p>
    <div class="regression">
      ${comparisonFigure("Before · image 423 px, copy 361 px", "regression/before-1440.png")}
      ${comparisonFigure("After · image 361 px, copy 423 px", "regression/after-1440.png")}
    </div>
    <table style="margin-top:16px">
      <thead><tr><th>Check</th><th>Before</th><th>After</th><th>Result</th></tr></thead>
      <tbody>
        <tr><td>Image column</td><td>423 px</td><td>361 px</td><td>Existing layout restored</td></tr>
        <tr><td>Copy column</td><td>361 px</td><td>423 px</td><td>Existing layout restored</td></tr>
        <tr><td>Article height</td><td>745 px</td><td>672 px</td><td>Global experiment override removed</td></tr>
      </tbody>
    </table>
  </section>

  <section class="section">
    <h2>Intentional changes from B original to B revised</h2>
    <table>
      <thead><tr><th>Area</th><th>B original</th><th>B revised</th><th>Purpose</th></tr></thead>
      <tbody>
        ${changes
          .map(
            ([area, original, revised, purpose]) =>
              `<tr><td>${escapeHtml(area)}</td><td>${escapeHtml(original)}</td><td>${escapeHtml(revised)}</td><td>${escapeHtml(purpose)}</td></tr>`,
          )
          .join("")}
      </tbody>
    </table>
    <div class="links">
      <a href="changes.md">Full change log</a>
      <a href="limitations.md">Limitations</a>
      <a href="review.md">Review sheet</a>
      <a href="choice.md">Choice record</a>
      <a href="neutral-original.html">Original neutral A/B comparison</a>
    </div>
  </section>

  <section class="section choice">
    <h2>Choose a direction</h2>
    <p>Record the page you would ship. The experiment remains local until the user or Momisa selects a direction.</p>
    <button type="button" onclick="recordChoice('A')">A · reference</button>
    <button type="button" onclick="recordChoice('B original')">B · original</button>
    <button type="button" onclick="recordChoice('B revised')">B · revised</button>
    <button type="button" class="secondary" onclick="recordChoice('Neither')">Neither</button>
    <p id="choice-record" aria-live="polite"></p>
  </section>
</div>
<script>
  function recordChoice(value) {
    try { localStorage.setItem('momisa-direction-choice', value); } catch {}
    document.getElementById('choice-record').textContent =
      'Recorded ' + value + ' in this browser. Tell the operator if the choice should be saved in the shared handoff.';
  }
</script>
</body>
</html>`;
  writeFileSync(path.join(comparison, "index.html"), html, "utf8");
}

function comparisonFigure(label, src) {
  return `<figure>
    <figcaption><strong>${escapeHtml(label)}</strong><a href="${src}" target="_blank" rel="noreferrer">open full size</a></figcaption>
    <a href="${src}" target="_blank" rel="noreferrer" aria-label="${escapeHtml(label)} — open full size"><img src="${src}" alt="${escapeHtml(label)}"></a>
  </figure>`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function main() {
  mkdirSync(afterDir, { recursive: true });
  mkdirSync(regressionDir, { recursive: true });
  mkdirSync(captureDir, { recursive: true });

  const { chromium } = await loadPlaywright();
  const executablePath = chromiumExecutable(chromium);
  const browser = await chromium.launch({ headless: !headed, executablePath });
  const checks = [];
  const metrics = {};
  const captures = {};
  const consoleErrors = [];

  // 1. Direction page: capture the revised B at the comparison widths.
  const directionPage = await browser.newPage({
    viewport: { width: 1440, height: 1200 },
    deviceScaleFactor: 1,
  });
  directionPage.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  directionPage.on("pageerror", (error) => consoleErrors.push(error.message));
  await directionPage.goto(`${origin}/campaign-lab/direction`, {
    waitUntil: "networkidle",
    timeout: 180000,
  });
  await hideDevIndicator(directionPage);
  await waitForArticle(
    directionPage,
    '[data-direction-preview="B"][data-viewport="375"] [data-direction-shell]',
  );

  for (const viewport of ["375", "desktop"]) {
    const shellSelector = `[data-direction-preview="B"][data-viewport="${viewport}"] [data-direction-shell]`;
    const fileName = viewport === "375" ? "B-375.png" : "B-desktop.png";
    const filePath = path.join(afterDir, fileName);
    await directionPage.locator(shellSelector).screenshot({
      path: filePath,
      animations: "disabled",
    });
    captures[`B-${viewport}`] = filePath;
    metrics[`direction-${viewport}`] = await readMetrics(
      directionPage,
      shellSelector,
    );
  }

  // 2. Preview route: 320, 375, 1440, and the 200% zoom equivalent.
  const previewCases = [
    { name: "320", width: 320, height: 900, dpr: 1 },
    { name: "375", width: 375, height: 900, dpr: 1 },
    { name: "1440", width: 1440, height: 1000, dpr: 1 },
    { name: "zoom-200", width: 720, height: 900, dpr: 2 },
  ];

  for (const item of previewCases) {
    const page = await browser.newPage({
      viewport: { width: item.width, height: item.height },
      deviceScaleFactor: item.dpr,
    });
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => consoleErrors.push(error.message));
    await page.goto(`${origin}/campaign-lab/direction/preview?direction=B`, {
      waitUntil: "networkidle",
      timeout: 180000,
    });
    await hideDevIndicator(page);
    await waitForArticle(page, "[data-preview-shell]");

    const shell = page.locator("[data-preview-shell]");
    const shellName =
      item.name === "zoom-200"
        ? "B-zoom-200-shell.png"
        : item.name === "1440"
          ? "B-1440-shell.png"
          : `B-${item.name}.png`;
    const shellPath = path.join(afterDir, shellName);
    await shell.screenshot({ path: shellPath, animations: "disabled" });
    captures[`preview-${item.name}`] = shellPath;

    if (item.name === "1440" || item.name === "zoom-200") {
      const pagePath = path.join(
        afterDir,
        item.name === "zoom-200" ? "B-zoom-200.png" : "B-1440.png",
      );
      await page.screenshot({ path: pagePath, fullPage: true });
      captures[`page-${item.name}`] = pagePath;
    }

    if (item.name === "375") {
      const checkPath = path.join(afterDir, "B-375-check.png");
      await shell.screenshot({ path: checkPath, animations: "disabled" });
      captures["preview-375-check"] = checkPath;
    }

    const data = await readMetrics(page, "[data-preview-shell]");
    metrics[`preview-${item.name}`] = data;
    const expectedWidth =
      item.name === "320" ? 260 : item.name === "375" ? 315 : item.name === "1440" ? 924 : 652;
    checkViewport(
      checks,
      `B:${item.name}`,
      data,
      expectedWidth,
      item.name === "320" || item.name === "375" ? 812 : null,
    );

    if (item.name === "zoom-200") {
      check(
        checks,
        "B:zoom-200:whole-product",
        data.figure &&
          Math.abs(data.figure.width - data.figure.height) <= 1 &&
          data.imageProps?.naturalWidth === 2500,
        {
          width: data.figure?.width,
          height: data.figure?.height,
          natural: data.imageProps?.naturalWidth,
        },
        "square frame with the full 2500 × 2500 packshot",
      );
    }

    if (item.name === "1440") {
      check(
        checks,
        "B:1440:image-left",
        data.figure.x + data.figure.width <= data.headline.x + 1,
        { imageRight: data.figure.right, headlineX: data.headline.x },
        "image column ends before the copy column",
      );
    }

    const imageUrl = new URL(data.imageProps.src, origin).href;
    const digest = await packshotHash(page, imageUrl);
    check(
      checks,
      `B:${item.name}:packshot-hash`,
      digest === approved.asset.sha256,
      digest,
      approved.asset.sha256,
    );

    await page.close();
  }

  // 3. Keyboard focus on the single CTA.
  const focusPage = await browser.newPage({
    viewport: { width: 375, height: 900 },
    deviceScaleFactor: 1,
  });
  await focusPage.goto(`${origin}/campaign-lab/direction/preview?direction=B`, {
    waitUntil: "networkidle",
    timeout: 180000,
  });
  await hideDevIndicator(focusPage);
  await waitForArticle(focusPage, "[data-preview-shell]");
  await focusPage.keyboard.press("Tab");
  const focus = await focusPage.evaluate(() => {
    const active = document.activeElement;
    const computed = active ? getComputedStyle(active) : null;
    return {
      tag: active?.tagName,
      role: active?.getAttribute("data-role"),
      href: active?.getAttribute("href"),
      text: active?.textContent?.replace(/\s+/g, " ").trim(),
      outlineWidth: computed?.outlineWidth,
      outlineStyle: computed?.outlineStyle,
      outlineColor: computed?.outlineColor,
      outlineOffset: computed?.outlineOffset,
    };
  });
  const focusPath = path.join(afterDir, "B-focus-375.png");
  await focusPage.locator("[data-preview-shell]").screenshot({
    path: focusPath,
    animations: "disabled",
  });
  captures["focus-375"] = focusPath;
  check(
    checks,
    "keyboard:first-tab",
    focus.tag === "A" &&
      focus.role === "action" &&
      focus.href === approved.destinationUrl,
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
    {
      outlineWidth: focus.outlineWidth,
      outlineStyle: focus.outlineStyle,
      outlineColor: focus.outlineColor,
      outlineOffset: focus.outlineOffset,
    },
    "3 px solid ink outline, 3 px offset",
  );
  await focusPage.close();

  // 4. Regression: the existing headline-first offer geometry must be restored.
  const regressionPage = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    deviceScaleFactor: 1,
  });
  await regressionPage.goto(`${origin}/campaign-lab/direction/regression`, {
    waitUntil: "networkidle",
    timeout: 180000,
  });
  await hideDevIndicator(regressionPage);
  await waitForArticle(regressionPage, "[data-regression-shell]");
  const regressionPath = path.join(regressionDir, "after-1440.png");
  await regressionPage.locator("[data-regression-shell]").screenshot({
    path: regressionPath,
    animations: "disabled",
  });
  captures["regression-after"] = regressionPath;
  const afterRegression = await regressionPage.evaluate(() => {
    const article = document.querySelector("[data-regression-shell] article");
    const image = article?.querySelector("figure");
    const headline = article?.querySelector("h1");
    const copy = headline?.parentElement;
    const rect = (element) => {
      if (!element) return null;
      const bounds = element.getBoundingClientRect();
      return {
        x: Math.round(bounds.x),
        y: Math.round(bounds.y),
        width: Math.round(bounds.width),
        height: Math.round(bounds.height),
      };
    };
    return { article: rect(article), image: rect(image), copy: rect(copy) };
  });
  writeFileSync(
    path.join(regressionDir, "after-metrics.json"),
    `${JSON.stringify(afterRegression, null, 2)}\n`,
    "utf8",
  );
  check(
    checks,
    "regression:before-geometry",
    beforeRegression.image.width === 423 && beforeRegression.copy.width === 361,
    { image: beforeRegression.image.width, copy: beforeRegression.copy.width },
    { image: 423, copy: 361 },
  );
  check(
    checks,
    "regression:after-geometry",
    Math.abs(afterRegression.image.width - 361) <= 2 &&
      Math.abs(afterRegression.copy.width - 423) <= 2,
    { image: afterRegression.image.width, copy: afterRegression.copy.width },
    { image: 361, copy: 423 },
  );
  check(
    checks,
    "regression:scope-restored",
    afterRegression.image.width < afterRegression.copy.width &&
      beforeRegression.image.width > beforeRegression.copy.width,
    {
      before: {
        image: beforeRegression.image.width,
        copy: beforeRegression.copy.width,
      },
      after: {
        image: afterRegression.image.width,
        copy: afterRegression.copy.width,
      },
    },
    "the base image column is smaller than the copy after the experiment scope",
  );
  await regressionPage.close();

  // 5. Reference and original captures must still exist.
  for (const file of ["A-375.png", "A-desktop.png", "B-375.png", "B-desktop.png"]) {
    check(
      checks,
      `source:${file}`,
      existsSync(path.join(beforeDir, file)),
      existsSync(path.join(beforeDir, file)),
      true,
    );
  }

  check(
    checks,
    "no-console-errors",
    consoleErrors.length === 0,
    consoleErrors,
    [],
  );

  const failed = checks.filter((item) => !item.passed);
  const report = {
    target: origin,
    capturedAt: new Date().toISOString(),
    source: approved.source,
    captureSources: {
      "A": "approved local export crop",
      "B original": "a35c178 capture",
      "B revised": "current CampaignPage renderer",
    },
    captures,
    checks,
    failed: failed.map((item) => item.id),
    metrics,
    regression: {
      before: beforeRegression,
      after: afterRegression,
      beforeImage: path.join(regressionDir, "before-1440.png"),
      afterImage: regressionPath,
    },
    originalReport: beforeReport
      ? {
          capturedAt: beforeReport.capturedAt,
          failed: beforeReport.failed,
          checks: beforeReport.checks?.length ?? null,
        }
      : null,
  };
  writeFileSync(
    path.join(captureDir, "revision-report.json"),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );

  writeFileSync(
    path.join(comparison, "key.json"),
    `${JSON.stringify(
      {
        A: "reference - approved local export",
        "B original": "a35c178 alternative",
        "B revised": "product-second, normal-blend alternative",
        sourceRevision: approved.source.approvedExportRevision,
        captures,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  writeIndexHtml();
  await browser.close();

  console.log(
    `Captured ${Object.keys(captures).length} views in ${path.relative(root, comparison)}.`,
  );
  console.log(`Checks: ${checks.length - failed.length} passed, ${failed.length} failed.`);
  if (failed.length > 0) {
    for (const item of failed) {
      console.log(
        `FAIL ${item.id}: ${JSON.stringify(item.actual)} expected ${JSON.stringify(item.expected)}`,
      );
    }
    process.exitCode = 1;
  }
  console.log(`Open ${path.relative(root, path.join(comparison, "index.html"))}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
