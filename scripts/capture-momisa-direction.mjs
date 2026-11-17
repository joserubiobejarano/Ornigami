#!/usr/bin/env node
/**
 * Local-only capture for the Momisa visual direction comparison.
 *
 * Renders /campaign-lab/direction through the real CampaignPage renderer at the
 * approved article widths, saves neutral A/B captures, and writes a machine
 * report. All Momisa inputs and captures stay under .local/momisa-direction/.
 */
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
const outRoot = path.join(root, ".local", "momisa-direction", "comparison");
const captureDir = path.join(outRoot, "captures");
const inputPath = path.join(root, ".local", "momisa-direction", "approved-brief.json");
const approved = JSON.parse(readFileSync(inputPath, "utf8"));
const target = argValue("--url") ?? "http://localhost:3123/campaign-lab/direction";
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

async function pixelDiff(leftPath, rightPath, tolerance = 12) {
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
      const width = Math.min(
        leftMeta.width - leftX,
        rightMeta.width - rightX,
      );
      const height = Math.min(
        leftMeta.height - leftY,
        rightMeta.height - rightY,
      );
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

async function cropApprovedReferences(captureDir) {
  const sharp = (await import("sharp")).default;
  const approvedReport = JSON.parse(
    readFileSync(
      path.join(root, ".local", "momisa-direction", "approved", "report.json"),
      "utf8",
    ),
  );
  const article375 = approvedReport.widths["375"].exported.articleRect;
  const article1440 = approvedReport.widths["1440"].exported.articleRect;
  const specs = [
    {
      name: "A-375.png",
      source: path.join(
        root,
        ".local",
        "momisa-direction",
        "approved",
        "exported-page-375.png",
      ),
      left: 0,
      top: 0,
      width: 375,
      height: Math.ceil(article375.y + article375.height + article375.y),
    },
    {
      name: "A-desktop.png",
      source: path.join(
        root,
        ".local",
        "momisa-direction",
        "approved",
        "exported-page-1440.png",
      ),
      left: Math.round((1440 - 992) / 2),
      top: 0,
      width: 992,
      height: Math.ceil(article1440.y + article1440.height + article1440.y),
    },
  ];
  for (const spec of specs) {
    await sharp(spec.source)
      .extract({
        left: spec.left,
        top: spec.top,
        width: spec.width,
        height: spec.height,
      })
      .toFile(path.join(captureDir, spec.name));
  }
}

function writeIndexHtml() {
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Momisa Glow Box — visual direction comparison</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #f3efe6; color: #1f2a24; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; }
  .wrap { width: min(1440px, 100%); margin: 0 auto; padding: 24px; }
  .eyebrow { margin: 0; color: #60695f; font: 600 11px/1.4 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; letter-spacing: .16em; text-transform: uppercase; }
  h1 { margin: 8px 0 0; font-size: clamp(26px, 3vw, 42px); line-height: 1.05; letter-spacing: -.035em; }
  .note { max-width: 72ch; margin: 12px 0 0; color: #60695f; font-size: 14px; line-height: 1.55; }
  .meta { max-width: 72ch; margin: 8px 0 0; color: #60695f; font: 11px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
  .rows { display: grid; gap: 32px; margin-top: 28px; }
  .row { display: flex; gap: 16px; align-items: flex-start; overflow-x: auto; padding-bottom: 4px; }
  figure { flex: 0 0 auto; margin: 0; }
  figcaption { display: flex; justify-content: space-between; gap: 16px; margin-bottom: 8px; color: #60695f; font: 600 11px/1.4 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; letter-spacing: .08em; text-transform: uppercase; }
  figcaption strong { color: #1f2a24; }
  img { display: block; width: auto; max-width: none; height: auto; background: #fff; }
  .mobile img { width: 375px; }
  .desktop img { width: 992px; }
  .choice { margin-top: 36px; padding: 20px; border: 1px solid #d8cebd; border-radius: 12px; background: #fffdf8; }
  .choice h2 { margin: 0; font-size: 20px; letter-spacing: -.02em; }
  .choice p { max-width: 72ch; color: #60695f; font-size: 14px; line-height: 1.55; }
  .choice button { min-height: 44px; margin: 4px 8px 4px 0; padding: 0 20px; border: 1px solid #1f2a24; border-radius: 2px; background: #1f2a24; color: #fffaf1; font: 600 14px/1 system-ui, sans-serif; cursor: pointer; }
  .choice button.secondary { background: transparent; color: #1f2a24; }
  #choice-record { min-height: 1.5em; margin: 12px 0 0; color: #2f5d4a; font-weight: 600; }
  .after { margin-top: 18px; color: #60695f; font-size: 12px; line-height: 1.55; }
  code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: .95em; }
  @media (max-width: 900px) { .row { display: grid; overflow: visible; } .mobile img, .desktop img { width: 100%; max-width: 992px; } }
</style>
</head>
<body>
<div class="wrap">
  <header>
    <p class="eyebrow">Campaign Lab · local only</p>
    <h1>Momisa Glow Box — visual direction comparison</h1>
    <p class="note">Both pages use the same approved product name, offer, Amazon destination, facts, and packshot. Labels are neutral. Review all four captures at 375 px and desktop before opening the change log or key.</p>
    <p class="meta">Approved local export revision ${escapeHtml(approved.source.approvedExportRevision)} · packshot SHA-256 ${escapeHtml(approved.asset.sha256.slice(0, 16))}… · inputs and captures are in ignored storage.</p>
  </header>

  <div class="rows">
    ${directionRow("A")}
    ${directionRow("B")}
  </div>

  <section class="choice">
    <h2>Choose a direction</h2>
    <p>Record the page you would ship, or the page you want to test next. A browser-local choice is useful for this review; tell the operator to record it in the handoff.</p>
    <button type="button" onclick="recordChoice('A')">Choose A</button>
    <button type="button" class="secondary" onclick="recordChoice('B')">Choose B</button>
    <p id="choice-record" aria-live="polite"></p>
    <p class="after">After recording a choice, open <code>changes.md</code> for the intentional changes and <code>key.json</code> for the A/B mapping. <code>review.md</code> holds the scoring sheet and <code>limitations.md</code> holds what this comparison does not prove.</p>
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
  writeFileSync(path.join(outRoot, "index.html"), html, "utf8");
}

function directionRow(label) {
  return `<section class="row" aria-label="Direction ${label}">
    ${captureFigure(label, "375")}
    ${captureFigure(label, "desktop")}
  </section>`;
}

function captureFigure(label, viewport) {
  const fileName = `${label}-${viewport === "375" ? "375" : "desktop"}.png`;
  return `<figure class="${viewport === "375" ? "mobile" : "desktop"}">
    <figcaption><strong>${label}</strong><span>${viewport === "375" ? "375 px" : "Desktop"}</span></figcaption>
    <img src="captures/${fileName}" alt="Direction ${label} at ${viewport === "375" ? "375 px" : "desktop"}" width="${viewport === "375" ? 375 : 992}">
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
  mkdirSync(captureDir, { recursive: true });

  const { chromium } = await loadPlaywright();
  const executablePath = chromiumExecutable(chromium);
  const browser = await chromium.launch({ headless: !headed, executablePath });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1200 },
    deviceScaleFactor: 1,
  });

  const consoleErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));

  await page.goto(target, { waitUntil: "networkidle", timeout: 120000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(
    () => {
      const images = [...document.querySelectorAll("[data-direction-shell] img")];
      return images.length === 4 && images.every((image) => image.complete && image.naturalWidth > 0);
    },
    null,
    { timeout: 60000 },
  );
  await page.addStyleTag({
    content:
      "nextjs-portal, [data-nextjs-toast], [data-nextjs-dev-tools-button], #nextjs-dev-tools-button { display: none !important; visibility: hidden !important; }",
  });
  await page.evaluate(() => {
    document.querySelectorAll("nextjs-portal").forEach((element) => element.remove());
  });

  const checks = [];
  const metrics = {};
  const captures = {};
  const articleCaptures = {};

  for (const label of ["A", "B"]) {
    metrics[label] = {};
    for (const viewport of ["375", "desktop"]) {
      const frame = page.locator(
        `[data-direction-preview="${label}"][data-viewport="${viewport}"]`,
      );
      const shell = frame.locator("[data-direction-shell]");
      const viewportName = viewport === "375" ? "375" : "desktop";
      const renderFileName =
        label === "A"
          ? `${label}-render-${viewportName}.png`
          : `${label}-${viewportName}.png`;
      const renderPath = path.join(captureDir, renderFileName);
      await shell.screenshot({ path: renderPath, animations: "disabled" });
      if (label === "B") {
        captures[`B-${viewport}`] = renderPath;
      }

      const articleFileName = `${label}-article-${viewportName}.png`;
      const articlePath = path.join(captureDir, articleFileName);
      await frame.locator("article").screenshot({
        path: articlePath,
        animations: "disabled",
      });
      articleCaptures[`${label}-${viewport}`] = articlePath;

      const data = await page.evaluate(
        ({ label, viewport }) => {
          const frame = document.querySelector(
            `[data-direction-preview="${label}"][data-viewport="${viewport}"]`,
          );
          const shell = frame?.querySelector("[data-direction-shell]");
          const article = shell?.querySelector("article");
          const image = article?.querySelector("figure img");
          const offer = article?.querySelector('[data-role="offer"]');
          const offerText = offer?.querySelector("p");
          const action = article?.querySelector('[data-role="action"]');
          const headline = article?.querySelector("h1");
          const factLabel = article?.querySelector("li span");
          const factValue = article?.querySelector("li span:nth-child(2)");
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
              textTransform: computed.textTransform,
              backgroundColor: computed.backgroundColor,
              borderTopWidth: computed.borderTopWidth,
              borderBottomWidth: computed.borderBottomWidth,
            };
          };
          return {
            articleText: article?.innerText ?? "",
            headlineText: headline?.textContent?.trim() ?? null,
            headlineStyle: style(headline),
            bodyStyle: style(factValue),
            offerText: offer?.innerText?.trim() ?? null,
            offerStyle: style(offer),
            offerTextStyle: style(offerText),
            factLabelStyle: style(factLabel),
            factValueStyle: style(factValue),
            ctaHref: action?.getAttribute("href") ?? null,
            ctaLabel: action?.textContent?.replace(/\s+/g, " ").trim() ?? null,
            actionStyle: style(action),
            articleRect: rect(article),
            imageRect: rect(image),
            offerRect: rect(offer),
            actionRect: rect(action),
            imageSrc: image?.getAttribute("src") ?? null,
            imageAlt: image?.getAttribute("alt") ?? null,
            imageComplete: image?.complete ?? false,
            imageNaturalWidth: image?.naturalWidth ?? 0,
            imageNaturalHeight: image?.naturalHeight ?? 0,
            shellWidth: shell?.clientWidth ?? 0,
            shellScrollWidth: shell?.scrollWidth ?? 0,
            documentOverflow:
              document.documentElement.scrollWidth > document.documentElement.clientWidth,
          };
        },
        { label, viewport },
      );

      metrics[label][viewport] = data;

      const expectedWidth = viewport === "375" ? 315 : 924;
      check(
        checks,
        `${label}:${viewport}:article-width`,
        Math.abs(data.articleRect.width - expectedWidth) <= 1,
        data.articleRect.width,
        expectedWidth,
      );
      check(
        checks,
        `${label}:${viewport}:exact-offer`,
        data.offerText === approved.offer,
        data.offerText,
        approved.offer,
      );
      check(
        checks,
        `${label}:${viewport}:exact-destination`,
        data.ctaHref === approved.destinationUrl,
        data.ctaHref,
        approved.destinationUrl,
      );
      check(
        checks,
        `${label}:${viewport}:exact-product`,
        data.articleText.includes(approved.productName),
        data.articleText.includes(approved.productName),
        true,
      );
      check(
        checks,
        `${label}:${viewport}:approved-facts`,
        approved.facts.every((fact) => data.articleText.includes(fact.value)),
        data.articleText,
        approved.facts.map((fact) => fact.value),
      );
      check(
        checks,
        `${label}:${viewport}:packshot-alt`,
        data.imageAlt === approved.asset.alt,
        data.imageAlt,
        approved.asset.alt,
      );
      check(
        checks,
        `${label}:${viewport}:packshot-loaded`,
        data.imageComplete && data.imageNaturalWidth === 2500 && data.imageNaturalHeight === 2500,
        {
          complete: data.imageComplete,
          width: data.imageNaturalWidth,
          height: data.imageNaturalHeight,
        },
        { complete: true, width: 2500, height: 2500 },
      );
      check(
        checks,
        `${label}:${viewport}:no-overflow`,
        data.shellScrollWidth <= data.shellWidth + 1 && !data.documentOverflow,
        {
          shellWidth: data.shellWidth,
          shellScrollWidth: data.shellScrollWidth,
          documentOverflow: data.documentOverflow,
        },
        { shellScrollWidth: "<= shellWidth + 1", documentOverflow: false },
      );

      const firstScreenHeight = viewport === "375" ? 812 : 900;
      const articleTop = data.articleRect.y;
      const actionBottom = data.actionRect
        ? Math.round((data.actionRect.bottom - articleTop) * 100) / 100
        : null;
      const imageBottom = data.imageRect
        ? Math.round((data.imageRect.bottom - articleTop) * 100) / 100
        : null;
      check(
        checks,
        `${label}:${viewport}:action-in-first-screen`,
        actionBottom !== null && actionBottom <= firstScreenHeight,
        actionBottom,
        `<= ${firstScreenHeight}`,
      );
      check(
        checks,
        `${label}:${viewport}:product-in-first-screen`,
        imageBottom !== null && imageBottom <= firstScreenHeight,
        imageBottom,
        `<= ${firstScreenHeight}`,
      );
    }
  }

  await cropApprovedReferences(captureDir);
  captures["A-375"] = path.join(captureDir, "A-375.png");
  captures["A-desktop"] = path.join(captureDir, "A-desktop.png");

  check(
    checks,
    "no-console-errors",
    consoleErrors.length === 0,
    consoleErrors,
    [],
  );

  check(
    checks,
    "reference-typography",
    metrics.A["375"].headlineStyle.fontFamily.includes("Inter"),
    metrics.A["375"].headlineStyle.fontFamily,
    "Inter",
  );
  check(
    checks,
    "alternative-typography",
    metrics.B["375"].headlineStyle.fontFamily.includes("EB Garamond") &&
      metrics.B["375"].bodyStyle.fontFamily.includes("Jost"),
    {
      headline: metrics.B["375"].headlineStyle.fontFamily,
      body: metrics.B["375"].bodyStyle.fontFamily,
    },
    "EB Garamond headline / Jost body",
  );
  check(
    checks,
    "alternative-editorial-offer",
    metrics.B["375"].offerTextStyle.fontFamily.includes("EB Garamond") &&
      metrics.B["375"].offerStyle.borderTopWidth === "1px" &&
      metrics.B["375"].offerStyle.borderBottomWidth === "1px",
    {
      font: metrics.B["375"].offerTextStyle.fontFamily,
      borderTop: metrics.B["375"].offerStyle.borderTopWidth,
      borderBottom: metrics.B["375"].offerStyle.borderBottomWidth,
    },
    "EB Garamond offer with rule above and below",
  );
  check(
    checks,
    "alternative-label-case",
    metrics.B["375"].factLabelStyle.textTransform === "none",
    metrics.B["375"].factLabelStyle.textTransform,
    "none",
  );

  const diagnostics = {};
  const approvedArticle375 = path.join(
    root,
    ".local",
    "momisa-direction",
    "approved",
    "exported-375.png",
  );
  const approvedArticleDesktop = path.join(
    root,
    ".local",
    "momisa-direction",
    "approved",
    "exported-1440.png",
  );
  if (existsSync(approvedArticle375)) {
    diagnostics.referenceRendererVsApproved375 = await pixelDiff(
      approvedArticle375,
      articleCaptures["A-375"],
    );
  }
  if (existsSync(approvedArticleDesktop)) {
    diagnostics.referenceRendererVsApprovedDesktop = await pixelDiff(
      approvedArticleDesktop,
      articleCaptures["A-desktop"],
    );
  }

  const failed = checks.filter((item) => !item.passed);
  const report = {
    target,
    capturedAt: new Date().toISOString(),
    source: approved.source,
    captureSources: {
      "A-375": "approved local export crop",
      "A-desktop": "approved local export crop",
      "B-375": "CampaignPage renderer",
      "B-desktop": "CampaignPage renderer",
    },
    captures,
    checks,
    failed: failed.map((item) => item.id),
    diagnostics,
    metrics,
  };
  writeFileSync(
    path.join(captureDir, "report.json"),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );

  writeIndexHtml();
  writeFileSync(
    path.join(outRoot, "key.json"),
    `${JSON.stringify(
      {
        A: "reference - approved local export",
        B: "alternative - Apricot Atelier",
        sourceRevision: approved.source.approvedExportRevision,
        captures,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  await browser.close();

  console.log(
    `Captured ${Object.keys(captures).length} views in ${path.relative(root, captureDir)}.`,
  );
  console.log(`Checks: ${checks.length - failed.length} passed, ${failed.length} failed.`);
  if (failed.length > 0) {
    for (const item of failed) {
      console.log(`FAIL ${item.id}: ${JSON.stringify(item.actual)} expected ${JSON.stringify(item.expected)}`);
    }
    process.exitCode = 1;
  }
  console.log(`Open ${path.relative(root, path.join(outRoot, "index.html"))}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
