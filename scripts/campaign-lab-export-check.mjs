#!/usr/bin/env node
/**
 * Local browser verification for the Campaign Lab standalone export.
 *
 * The run uses the real intake, packshot reader, revision approval gate and
 * export button. It first exercises the gate (edit -> export locked, regenerate
 * -> export still locked, fresh approval -> export enabled), downloads the ZIP,
 * extracts it, then opens index.html from a fresh browser at 375 px and desktop.
 *
 * Usage:
 *   node scripts/campaign-lab-export-check.mjs `
 *     --url http://localhost:3117 `
 *     --out .local/campaign-lab-export/synthetic `
 *     --label synthetic `
 *     --provisional
 *
 *   node scripts/campaign-lab-export-check.mjs `
 *     --url http://localhost:3117 `
 *     --inputs .local/campaign-lab-inputs/synthetic.json `
 *     --out .local/campaign-lab-export/synthetic `
 *     --label synthetic `
 *     --expected-revision c17b6383cc650d5f
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync, copyFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

import { loadOfferFixture } from "./support/campaign-lab-offer-fixture.mjs";

const root = process.cwd();
const { values: cli } = parseArgs({
  options: {
    url: { type: "string", short: "u", default: "http://localhost:3117" },
    out: { type: "string", short: "o" },
    inputs: { type: "string", short: "i" },
    label: { type: "string", default: "synthetic" },
    "expected-revision": { type: "string" },
    provisional: { type: "boolean", default: false },
    "failure-matrix": { type: "boolean", default: false },
    headed: { type: "boolean", default: false },
  },
});

const fixture = loadOfferFixture({ inputs: cli.inputs, root });
const label = cli.label.replace(/[^a-z0-9-]+/gi, "-").toLowerCase();
const out = path.resolve(
  root,
  cli.out ?? path.join(".local", "campaign-lab-export", label),
);
const extractDir = path.join(out, "bundle");
mkdirSync(out, { recursive: true });

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

function sha256File(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function listFiles(dir) {
  const files = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    const stat = statSync(full);
    if (stat.isDirectory()) files.push(...listFiles(full).map((child) => path.join(name, child)));
    else files.push(name);
  }
  return files.sort();
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

function listZipEntries(zipPath) {
  const result = spawnSync("tar", ["-tf", zipPath], {
    cwd: root,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(`ZIP listing failed: ${result.stderr || result.stdout || result.status}`);
  }
  return result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/\\/g, "/"))
    .filter(Boolean);
}

function readZipEntry(zipPath, entry) {
  const result = spawnSync("tar", ["-xOf", zipPath, entry], {
    cwd: root,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(
      `ZIP entry ${entry} could not be read: ${result.stderr || result.stdout || result.status}`,
    );
  }
  return result.stdout;
}

function metaValue(html, name) {
  const match = new RegExp(
    `<meta[^>]+name=["']${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["'][^>]+content=["']([^"']*)["']`,
    "i",
  ).exec(html);
  return match
    ? match[1]
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&")
    : null;
}

function referenceAudit(html, css, entries) {
  const available = new Set(entries);
  const missing = [];
  const external = [];
  const checked = [];
  const normalized = (reference) =>
    decodeURIComponent(reference.split("#")[0].split("?")[0]).replace(/^\.\//, "");

  for (const match of html.matchAll(/<(?:link|img)\b[^>]*>/gi)) {
    const tag = match[0];
    const rel = /\brel=["']([^"']*)["']/i.exec(tag)?.[1]?.toLowerCase();
    const href = /\bhref=["']([^"']*)["']/i.exec(tag)?.[1];
    const src = /\bsrc=["']([^"']*)["']/i.exec(tag)?.[1];
    const reference = rel === "stylesheet" && href ? href : tag.toLowerCase().startsWith("<img") && src ? src : null;
    if (!reference) continue;
    if (/^(?:https?:)?\/\//i.test(reference)) {
      external.push(reference);
      continue;
    }
    const path = normalized(reference);
    checked.push(path);
    if (!available.has(path)) missing.push(path);
  }

  for (const match of css.matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)/g)) {
    const reference = match[2].trim();
    if (!reference || reference.startsWith("data:")) continue;
    if (/^(?:https?:)?\/\//i.test(reference)) {
      external.push(reference);
      continue;
    }
    const path = normalized(reference);
    checked.push(path);
    if (!available.has(path)) missing.push(path);
  }

  return {
    checked: [...new Set(checked)].sort(),
    missing: [...new Set(missing)].sort(),
    external: [...new Set(external)].sort(),
  };
}

async function imageDiff(leftFile, rightFile) {
  const sharp = (await import("sharp")).default;
  const leftMeta = await sharp(leftFile).metadata();
  const rightMeta = await sharp(rightFile).metadata();
  const width = Math.min(leftMeta.width ?? 0, rightMeta.width ?? 0);
  const height = Math.min(leftMeta.height ?? 0, rightMeta.height ?? 0);
  const widthDelta = Math.abs((leftMeta.width ?? 0) - (rightMeta.width ?? 0));
  const heightDelta = Math.abs((leftMeta.height ?? 0) - (rightMeta.height ?? 0));

  // Locator screenshots can round a fractional CSS height by one pixel. Crop
  // to the shared image area for that rounding, but still fail on real size
  // changes.
  if (widthDelta > 2 || heightDelta > 2) {
    return {
      sameDimensions: false,
      left: { width: leftMeta.width ?? 0, height: leftMeta.height ?? 0 },
      right: { width: rightMeta.width ?? 0, height: rightMeta.height ?? 0 },
      changedPixels: width * height,
      totalPixels: width * height,
      ratio: 1,
      widthDelta,
      heightDelta,
    };
  }

  const left = await sharp(leftFile)
    .extract({ left: 0, top: 0, width, height })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const right = await sharp(rightFile)
    .extract({ left: 0, top: 0, width, height })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const threshold = 8;
  let best = null;
  for (let shiftY = -1; shiftY <= 1; shiftY += 1) {
    for (let shiftX = -1; shiftX <= 1; shiftX += 1) {
      const overlapWidth = width - Math.abs(shiftX);
      const overlapHeight = height - Math.abs(shiftY);
      if (overlapWidth <= 0 || overlapHeight <= 0) continue;
      const leftStartX = Math.max(0, shiftX);
      const leftStartY = Math.max(0, shiftY);
      const rightStartX = Math.max(0, -shiftX);
      const rightStartY = Math.max(0, -shiftY);
      let changedPixels = 0;
      for (let y = 0; y < overlapHeight; y += 1) {
        for (let x = 0; x < overlapWidth; x += 1) {
          const leftIndex =
            ((leftStartY + y) * width + leftStartX + x) * 4;
          const rightIndex =
            ((rightStartY + y) * width + rightStartX + x) * 4;
          if (
            Math.abs(left.data[leftIndex] - right.data[rightIndex]) > threshold ||
            Math.abs(left.data[leftIndex + 1] - right.data[rightIndex + 1]) >
              threshold ||
            Math.abs(left.data[leftIndex + 2] - right.data[rightIndex + 2]) >
              threshold
          ) {
            changedPixels += 1;
          }
        }
      }
      const totalPixels = overlapWidth * overlapHeight;
      const candidate = {
        shiftX,
        shiftY,
        overlapWidth,
        overlapHeight,
        changedPixels,
        totalPixels,
        ratio: totalPixels ? changedPixels / totalPixels : 1,
      };
      if (!best || candidate.ratio < best.ratio) best = candidate;
    }
  }

  return {
    sameDimensions: widthDelta === 0 && heightDelta === 0,
    width,
    height,
    widthDelta,
    heightDelta,
    ...best,
  };
}

async function gotoOffer(page, baseUrl) {
  await page.goto(new URL("/campaign-lab/offer", baseUrl).href, {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  await page.getByRole("heading", { name: "Offer intake", exact: true }).waitFor();
  await page.getByLabel("Prepared brief JSON", { exact: true }).waitFor();
  const cookieDismiss = page.getByRole("button", { name: "Got it", exact: true });
  if (await cookieDismiss.count()) await cookieDismiss.click().catch(() => {});
}

async function importPreparedBrief(page) {
  const payload = Buffer.from(
    JSON.stringify({ schemaVersion: 1, ...fixture.brief }),
  );

  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.getByLabel("Prepared brief JSON", { exact: true }).setInputFiles({
      name: `${label}-prepared-brief.json`,
      mimeType: "application/json",
      buffer: payload,
    });
    try {
      await page.waitForFunction(
        () => {
          const status = document
            .querySelector("[data-prepared-brief-status]")
            ?.getAttribute("data-prepared-brief-status");
          return status === "loaded" || status === "error";
        },
        null,
        { timeout: 10_000 },
      );
    } catch {
      // A selection can arrive before hydration on a cold dev compile. Retry
      // with the same file; the latest read remains authoritative.
      await page.waitForTimeout(400);
      continue;
    }

    const status = await page
      .locator("[data-prepared-brief-status]")
      .getAttribute("data-prepared-brief-status");
    if (status === "loaded") return;
    const message = await page
      .locator("[data-prepared-brief-error]")
      .innerText()
      .catch(() => "unknown prepared-brief error");
    throw new Error(`Prepared brief import failed: ${message}`);
  }

  throw new Error("Prepared brief import did not become ready.");
}

async function selectPackshot(page) {
  await page.getByLabel("Product image", { exact: true }).setInputFiles(fixture.packshot);
  await page.locator('[data-packshot-status="ready"]').waitFor({ timeout: 30_000 });
  const observed = await page.locator("[data-packshot-ready]").evaluate((node) => ({
    file: node.getAttribute("data-packshot-file"),
    width: node.getAttribute("data-packshot-width"),
    height: node.getAttribute("data-packshot-height"),
    hash: node.getAttribute("data-packshot-hash"),
  }));
  return observed;
}

async function confirmInputs(page, { confirmDestination }) {
  const boxes = page.locator("[data-confirmations] input[type=checkbox]");
  await boxes.nth(0).check();
  if (confirmDestination) await boxes.nth(1).check();
  await boxes.nth(2).check();
}

async function setAccentColor(page, value) {
  await page.locator('input[type="color"]').evaluate((element, next) => {
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set;
    setter?.call(element, next);
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
}

async function waitForPreviewRevision(page) {
  await page.locator("[data-template][data-revision]").waitFor({ timeout: 30_000 });
  await page.locator('[data-image-gate][data-images-ready="true"]').waitFor({ timeout: 30_000 });
  const revision = await page.locator("[data-template]").getAttribute("data-revision");
  return revision;
}

async function readState(page) {
  return page.evaluate(() => {
    const section = document.querySelector("[data-template]");
    const article = document.querySelector("[data-preview-canvas] article");
    const approvalPanel = document.querySelector("[data-approval-scope]");
    const exportPanel = document.querySelector("[data-export-panel]");
    const exportButton = document.querySelector("[data-export-button]");
    const image = article?.querySelector("img");
    const articleRect = article?.getBoundingClientRect();
    const imageRect = image?.getBoundingClientRect();
    const computed = article ? getComputedStyle(article) : null;
    return {
      revision: section?.getAttribute("data-revision") ?? null,
      previewStatus: section?.getAttribute("data-preview-status") ?? null,
      previewDirty: section?.getAttribute("data-preview-dirty") ?? null,
      generationStatus: section?.getAttribute("data-generation-status") ?? null,
      approval: approvalPanel?.getAttribute("data-local-preview-approval") ?? null,
      approvalRevision: approvalPanel?.getAttribute("data-approval-revision") ?? null,
      approvalScope: approvalPanel?.getAttribute("data-approval-scope") ?? null,
      exportReady: exportPanel?.getAttribute("data-export-ready") ?? null,
      exportRevision: exportPanel?.getAttribute("data-export-revision") ?? null,
      exportReason: exportPanel?.getAttribute("data-export-reason") ?? null,
      exportDisabled: exportButton?.disabled ?? null,
      articleText: article?.innerText ?? "",
      articleWidth: article ? Math.round(article.getBoundingClientRect().width) : null,
      articleHeight: article ? Math.round(article.getBoundingClientRect().height) : null,
      articleRect: articleRect
        ? { x: articleRect.x, y: articleRect.y, width: articleRect.width, height: articleRect.height }
        : null,
      imageRect: imageRect
        ? { x: imageRect.x, y: imageRect.y, width: imageRect.width, height: imageRect.height }
        : null,
      computed: computed
        ? {
            fontFamily: computed.fontFamily,
            fontWeight: computed.fontWeight,
            fontSize: computed.fontSize,
            fontFeatureSettings: computed.fontFeatureSettings,
            fontVariationSettings: computed.fontVariationSettings,
            letterSpacing: computed.letterSpacing,
            webkitFontSmoothing: computed.webkitFontSmoothing,
            textRendering: computed.textRendering,
          }
        : null,
      ctaHref: article?.querySelector('a[data-role="action"]')?.getAttribute("href") ?? null,
      imageSrc: image?.getAttribute("src") ?? null,
      imageAlt: image?.getAttribute("alt") ?? null,
      imageComplete: image?.complete ?? null,
      imageNaturalWidth: image?.naturalWidth ?? null,
      imageNaturalHeight: image?.naturalHeight ?? null,
      footer: article?.querySelector("footer")?.innerText ?? "",
    };
  });
}

async function hideMarketingChrome(page) {
  await page.evaluate(() => {
    for (const element of document.querySelectorAll("header.sticky, aside.fixed")) {
      element.remove();
    }
  });
  await page.waitForTimeout(100);
}

async function screenshotArticle(page, file) {
  await page.locator("[data-preview-canvas] article").screenshot({
    path: file,
    animations: "disabled",
  });
}

async function runEditor(page, width, report) {
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error" && !message.text().includes("WebSocket")) {
      errors.push(message.text());
    }
  });
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));

  await gotoOffer(page, cli.url);
  await importPreparedBrief(page);
  const packshot = await selectPackshot(page);
  check(
    report,
    `${width}:packshot-identity`,
    packshot.file === fixture.expected.fileName &&
      Number(packshot.width) === fixture.expected.width &&
      Number(packshot.height) === fixture.expected.height &&
      packshot.hash === fixture.expected.hash,
    packshot,
    fixture.expected,
  );

  await confirmInputs(page, { confirmDestination: !cli.provisional });
  await page.getByRole("button", { name: "Open Campaign Lab preview", exact: true }).click();
  await page.getByRole("button", { name: "Generate preview", exact: true }).waitFor({
    state: "visible",
    timeout: 30_000,
  });

  const beforeApproval = await readState(page);
  check(
    report,
    `${width}:export-locked-before-approval`,
    beforeApproval.exportReady === "false" && beforeApproval.exportDisabled === true,
    beforeApproval,
    { exportReady: "false", exportDisabled: true },
  );

  await page.getByRole("button", { name: "Generate preview", exact: true }).click();
  await page.waitForFunction(
    () => {
      const status = document.querySelector("[data-template]")?.getAttribute("data-generation-status");
      return status === "generated" || status === "fallback";
    },
    null,
    { timeout: 30_000 },
  );
  const revision = await waitForPreviewRevision(page);
  const generated = await readState(page);
  check(
    report,
    `${width}:generated-exact-offer`,
    generated.articleText.includes(fixture.brief.offer),
    fixture.brief.offer,
    generated.articleText,
  );
  check(
    report,
    `${width}:generated-exact-destination`,
    generated.ctaHref === fixture.brief.destinationUrl,
    generated.ctaHref,
    fixture.brief.destinationUrl,
  );
  check(
    report,
    `${width}:export-locked-before-local-approval`,
    generated.exportReady === "false" && generated.exportDisabled === true,
    generated,
    { exportReady: "false", exportDisabled: true },
  );

  await page.getByRole("button", { name: "Approve preview locally", exact: true }).click();
  await page.waitForFunction(
    () => document.querySelector("[data-local-preview-approval]")?.getAttribute("data-local-preview-approval") === "true",
    null,
    { timeout: 10_000 },
  );
  const approved = await readState(page);
  check(
    report,
    `${width}:approved-revision-matches`,
    approved.approval === "true" &&
      approved.approvalRevision === revision &&
      approved.exportReady === "true" &&
      approved.exportRevision === revision &&
      approved.exportDisabled === false,
    approved,
    { approval: "true", approvalRevision: revision, exportReady: "true", exportDisabled: false },
  );
  const expectedNotice = cli.provisional
    ? "Preview · destination provisional"
    : null;
  check(
    report,
    `${width}:provisional-notice`,
    expectedNotice
      ? approved.footer.toLowerCase().includes(expectedNotice.toLowerCase())
      : !approved.footer.toLowerCase().includes("preview ·"),
    approved.footer,
    expectedNotice ?? "no provisional footer notice",
  );

  await hideMarketingChrome(page);
  const approvedShot = path.join(out, `approved-preview-${width}.png`);
  await screenshotArticle(page, approvedShot);
  await page.screenshot({
    path: path.join(out, `approved-preview-page-${width}.png`),
    fullPage: true,
    animations: "disabled",
  });
  await page.locator("[data-export-panel]").screenshot({
    path: path.join(out, `export-panel-approved-${width}.png`),
    animations: "disabled",
  });

  const originalAccent = await page.locator('input[type="color"]').inputValue();
  const editedAccent = originalAccent.toLowerCase() === "#123456" ? "#654321" : "#123456";
  await setAccentColor(page, editedAccent);
  await page.waitForFunction(
    () => document.querySelector("[data-local-preview-approval]")?.getAttribute("data-local-preview-approval") === "false",
    null,
    { timeout: 10_000 },
  );
  const edited = await readState(page);
  check(
    report,
    `${width}:edit-locks-export`,
    edited.exportReady === "false" &&
      edited.exportDisabled === true &&
      edited.approval === "false" &&
      edited.previewDirty === "true" &&
      edited.articleText.includes(fixture.brief.offer),
    edited,
    {
      exportReady: "false",
      exportDisabled: true,
      approval: "false",
      previewDirty: "true",
      article: "still the last rendered revision",
    },
  );
  await page.locator("[data-export-panel]").screenshot({
    path: path.join(out, `export-panel-edited-${width}.png`),
    animations: "disabled",
  });

  await setAccentColor(page, originalAccent);
  await page.getByRole("button", { name: "Generate preview", exact: true }).click();
  await page.waitForFunction(
    () => {
      const status = document.querySelector("[data-template]")?.getAttribute("data-generation-status");
      return status === "generated" || status === "fallback";
    },
    null,
    { timeout: 30_000 },
  );
  const regeneratedRevision = await waitForPreviewRevision(page);
  const regenerated = await readState(page);
  check(
    report,
    `${width}:regeneration-requires-fresh-approval`,
    regeneratedRevision === revision &&
      regenerated.approval === "false" &&
      regenerated.exportReady === "false" &&
      regenerated.exportDisabled === true &&
      regenerated.articleText.includes(fixture.brief.offer),
    regenerated,
    {
      revision,
      approval: "false",
      exportReady: "false",
      exportDisabled: true,
    },
  );

  await page.getByRole("button", { name: "Approve preview locally", exact: true }).click();
  await page.waitForFunction(
    () => document.querySelector("[data-local-preview-approval]")?.getAttribute("data-local-preview-approval") === "true",
    null,
    { timeout: 10_000 },
  );
  const finalState = await readState(page);
  check(
    report,
    `${width}:fresh-approval-enables-export`,
    finalState.approval === "true" &&
      finalState.approvalRevision === revision &&
      finalState.exportReady === "true" &&
      finalState.exportDisabled === false,
    finalState,
    { approval: "true", exportReady: "true", exportDisabled: false },
  );
  check(report, `${width}:no-console-errors`, errors.length === 0, errors, "no console errors");

  return {
    revision,
    packshot,
    beforeApproval,
    generated,
    approved,
    edited,
    regenerated,
    finalState,
    approvedShot,
    errors,
  };
}

async function readExportedPage(page) {
  return page.evaluate(() => {
    const article = document.querySelector(".campaign-export-frame article");
    const image = article?.querySelector("img");
    const action = article?.querySelector('a[data-role="action"]') ?? article?.querySelector("a");
    const articleRect = article?.getBoundingClientRect();
    const imageRect = image?.getBoundingClientRect();
    const computed = article ? getComputedStyle(article) : null;
    const meta = (name) => document.querySelector(`meta[name="${name}"]`)?.getAttribute("content") ?? null;
    return {
      title: document.title,
      revision: meta("campaign-lab-revision"),
      previewStatus: meta("campaign-lab-preview-status"),
      previewNotice: meta("campaign-lab-preview-notice"),
      packshotSha256: meta("campaign-lab-packshot-sha256"),
      offer: meta("campaign-lab-offer"),
      destination: meta("campaign-lab-destination"),
      packshotFile: meta("campaign-lab-packshot-file"),
      actionLabel: meta("campaign-lab-action-label"),
      articleText: article?.innerText ?? "",
      articleWidth: article ? Math.round(article.getBoundingClientRect().width) : null,
      articleHeight: article ? Math.round(article.getBoundingClientRect().height) : null,
      articleRect: articleRect
        ? { x: articleRect.x, y: articleRect.y, width: articleRect.width, height: articleRect.height }
        : null,
      imageRect: imageRect
        ? { x: imageRect.x, y: imageRect.y, width: imageRect.width, height: imageRect.height }
        : null,
      computed: computed
        ? {
            fontFamily: computed.fontFamily,
            fontWeight: computed.fontWeight,
            fontSize: computed.fontSize,
            fontFeatureSettings: computed.fontFeatureSettings,
            fontVariationSettings: computed.fontVariationSettings,
            letterSpacing: computed.letterSpacing,
            webkitFontSmoothing: computed.webkitFontSmoothing,
            textRendering: computed.textRendering,
          }
        : null,
      ctaHref: action?.getAttribute("href") ?? null,
      ctaLabel: action?.textContent?.trim() ?? null,
      imageSrc: image?.getAttribute("src") ?? null,
      imageAlt: image?.getAttribute("alt") ?? null,
      imageComplete: image?.complete ?? null,
      imageNaturalWidth: image?.naturalWidth ?? null,
      imageNaturalHeight: image?.naturalHeight ?? null,
      buttonCount: document.querySelectorAll("button, input, select, textarea").length,
      scriptCount: document.querySelectorAll("script").length,
      dataAttributeCount: article
        ? [article, ...article.querySelectorAll("*")].reduce(
            (count, element) => count + [...element.attributes].filter((attribute) => attribute.name.startsWith("data-")).length,
            0,
          )
        : -1,
      editorText: /campaign brief|local review status|draft source|prepared brief|internal note|not publication approval/i.test(
        document.body.innerText,
      ),
      footer: article?.querySelector("footer")?.innerText ?? "",
    };
  });
}

async function setupApprovedPreview(page, { confirmDestination = true } = {}) {
  await gotoOffer(page, cli.url);
  await importPreparedBrief(page);
  const packshot = await selectPackshot(page);
  await confirmInputs(page, { confirmDestination });
  await page.getByRole("button", { name: "Open Campaign Lab preview", exact: true }).click();
  await page.getByRole("button", { name: "Generate preview", exact: true }).click();
  await page.waitForFunction(
    () => {
      const status = document.querySelector("[data-template]")?.getAttribute("data-generation-status");
      return status === "generated" || status === "fallback";
    },
    null,
    { timeout: 30_000 },
  );
  const revision = await waitForPreviewRevision(page);
  await page.getByRole("button", { name: "Approve preview locally", exact: true }).click();
  await page.waitForFunction(
    () => document.querySelector("[data-local-preview-approval]")?.getAttribute("data-local-preview-approval") === "true",
    null,
    { timeout: 10_000 },
  );
  return { revision, packshot };
}

async function runFailureMatrix(browser, report) {
  const context = await browser.newContext({
    viewport: { width: 375, height: 900 },
    deviceScaleFactor: 1,
    acceptDownloads: true,
  });
  await context.addInitScript(() => {
    try {
      localStorage.setItem("ornigami-cookie-consent", "accepted");
    } catch {
      // Static test setup only.
    }
  });
  const page = await context.newPage();
  const downloads = [];
  page.on("download", (download) => downloads.push(download.suggestedFilename()));
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));

  const initial = await setupApprovedPreview(page, { confirmDestination: true });
  const fontPattern = "**/_next/static/media/*.woff2";
  const exportButton = page.getByRole("button", { name: "Export approved page", exact: true });
  const state = await readState(page);
  check(
    report,
    "failure:setup-approved",
    state.approval === "true" && state.exportReady === "true",
    state,
    { approval: "true", exportReady: "true" },
  );

  await page.route(fontPattern, (route) =>
    route.fulfill({
      status: 503,
      contentType: "text/plain",
      body: "font temporarily unavailable",
    }),
  );
  await exportButton.click();
  await page.waitForFunction(
    () => document.querySelector("[data-export-error]")?.innerText.includes("HTTP 503"),
    null,
    { timeout: 30_000 },
  );
  const font503 = await page.locator("[data-export-error]").innerText();
  await page.waitForTimeout(500);
  const downloadsAfter503 = downloads.length;
  check(
    report,
    "failure:font-503-actionable",
    /Inter/.test(font503) &&
      /HTTP 503/.test(font503) &&
      /No download was created/.test(font503),
    font503,
    "font family, HTTP 503 and no-download explanation",
  );
  check(
    report,
    "failure:font-503-no-download",
    downloadsAfter503 === 0,
    { downloadsAfter503, downloads },
    { downloadsAfter503: 0 },
  );
  await page.unroute(fontPattern);
  await page.route(fontPattern, (route) =>
    route.fulfill({
      status: 404,
      contentType: "text/plain",
      body: "font missing",
    }),
  );
  await exportButton.click();
  await page.waitForFunction(
    () => document.querySelector("[data-export-error]")?.innerText.includes("HTTP 404"),
    null,
    { timeout: 30_000 },
  );
  const font404 = await page.locator("[data-export-error]").innerText();
  const downloadsAfter404 = downloads.length;
  check(
    report,
    "failure:missing-font-actionable",
    /Inter/.test(font404) &&
      /HTTP 404/.test(font404) &&
      /No download was created/.test(font404),
    font404,
    "missing font family, HTTP 404 and no-download explanation",
  );
  check(
    report,
    "failure:missing-font-no-download",
    downloadsAfter404 === 0,
    { downloadsAfter404, downloads },
    { downloadsAfter404: 0 },
  );
  await page.unroute(fontPattern);

  await page.route(fontPattern, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 2_500));
    try {
      await route.continue();
    } catch {
      // The export may already have been cancelled by the edit.
    }
  });
  await exportButton.click();
  await page.waitForFunction(
    () => document.querySelector("[data-export-panel]")?.getAttribute("data-exporting") === "true",
    null,
    { timeout: 10_000 },
  );
  const originalAccent = await page.locator('input[type="color"]').inputValue();
  await setAccentColor(
    page,
    originalAccent.toLowerCase() === "#123456" ? "#654321" : "#123456",
  );
  await page.getByRole("button", { name: "Generate preview", exact: true }).click();
  await page.waitForFunction(
    () => ["generated", "fallback"].includes(
      document.querySelector("[data-template]")?.getAttribute("data-generation-status"),
    ),
    null,
    { timeout: 30_000 },
  );
  await page.waitForFunction(
    () => {
      const text = document.querySelector("[data-export-error]")?.innerText ?? "";
      return text.includes("Export cancelled") && text.includes("No download was created");
    },
    null,
    { timeout: 30_000 },
  );
  const cancelled = await page.locator("[data-export-error]").innerText();
  await page.waitForTimeout(700);
  const downloadsAfterCancellation = downloads.length;
  check(
    report,
    "failure:paused-edit-regenerate-cancels",
    /Export cancelled/.test(cancelled) &&
      /Generate and approve the current revision/.test(cancelled) &&
      /No download was created/.test(cancelled),
    cancelled,
    "cancellation explanation with regenerate/approve action",
  );
  check(
    report,
    "failure:paused-cancellation-no-download",
    downloadsAfterCancellation === 0,
    { downloadsAfterCancellation, downloads },
    { downloadsAfterCancellation: 0 },
  );
  await page.unroute(fontPattern);
  await page.waitForTimeout(2_800);

  await page.getByRole("button", { name: "Approve preview locally", exact: true }).click();
  await page.waitForFunction(
    () => document.querySelector("[data-local-preview-approval]")?.getAttribute("data-local-preview-approval") === "true",
    null,
    { timeout: 10_000 },
  );
  const recoveryRevision = await page.locator("[data-template]").getAttribute("data-revision");
  const [recoveryDownload] = await Promise.all([
    page.waitForEvent("download", { timeout: 60_000 }),
    exportButton.click(),
  ]);
  const recoveryZip = path.join(out, "campaign-lab-failure-recovery.zip");
  await recoveryDownload.saveAs(recoveryZip);
  check(
    report,
    "failure:regenerate-reapprove-export-recovers",
    downloads.length === downloadsAfterCancellation + 1 &&
      Boolean(recoveryRevision) &&
      recoveryRevision !== initial.revision &&
      existsSync(recoveryZip),
    {
      downloads,
      downloadsAfterCancellation,
      recoveryRevision,
      initialRevision: initial.revision,
      recoveryZip: path.relative(root, recoveryZip),
    },
    "one download of the freshly regenerated revision after approval",
  );

  report.failureMatrix = {
    initialRevision: initial.revision,
    font503,
    font404,
    cancelled,
    downloadsAfter503,
    downloadsAfter404,
    downloadsAfterCancellation,
    recoveryRevision,
    downloads,
    errors,
    recoveryZip: path.relative(root, recoveryZip),
    recoveryZipSha256: sha256File(recoveryZip),
  };

  await context.close();
}

async function main() {
  const { chromium } = await loadPlaywright();
  const executablePath = chromiumExecutable(chromium);
  const browser = await chromium.launch({ headless: !cli.headed, executablePath });
  const report = {
    label,
    target: cli.url,
    fixture: {
      source: fixture.source,
      file: fixture.packshotFileName,
      width: fixture.expected.width,
      height: fixture.expected.height,
      expectedHash: fixture.expected.hash,
      actualHash: fixture.actualHash,
    },
    provisional: cli.provisional,
    expectedRevision: cli["expected-revision"] ?? null,
    out,
    checks: [],
    widths: {},
  };

  if (cli["failure-matrix"]) {
    await runFailureMatrix(browser, report);
    await browser.close();
    const failed = report.checks.filter((item) => !item.passed);
    report.status = failed.length === 0 ? "passed" : "failed";
    report.failed = failed;
    writeFileSync(path.join(out, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
    console.log(
      JSON.stringify(
        {
          status: report.status,
          label,
          mode: "failure-matrix",
          out,
          revision: report.failureMatrix?.initialRevision,
          checks: report.checks.length,
          failed: failed.length,
          failures: failed,
          recoveryZip: report.failureMatrix?.recoveryZip,
        },
        null,
        2,
      ),
    );
    return failed.length === 0 ? 0 : 1;
  }

  let exportRevision = null;

  for (const width of [375, 1440]) {
    const context = await browser.newContext({
      viewport: { width, height: width === 375 ? 900 : 1000 },
      deviceScaleFactor: 1,
      acceptDownloads: true,
    });
    await context.addInitScript(() => {
      try {
        localStorage.setItem("ornigami-cookie-consent", "accepted");
      } catch {
        // The consent banner is irrelevant to the export verification.
      }
    });
    const page = await context.newPage();
    const result = await runEditor(page, width, report);
    report.widths[width] = {
      revision: result.revision,
      approvedArticleWidth: result.finalState.articleWidth,
      approvedArticleHeight: result.finalState.articleHeight,
      approvedArticleRect: result.finalState.articleRect,
      approvedImageRect: result.finalState.imageRect,
      approvedComputed: result.finalState.computed,
      approvedFooter: result.finalState.footer,
    };

    if (width === 375) {
      exportRevision = result.revision;
      const [download] = await Promise.all([
        page.waitForEvent("download", { timeout: 60_000 }),
        page.getByRole("button", { name: "Export approved page", exact: true }).click(),
      ]);
      const suggested = download.suggestedFilename();
      const zipPath = path.join(out, suggested);
      await download.saveAs(zipPath);
      report.zip = {
        path: path.relative(root, zipPath),
        suggested,
        bytes: statSync(zipPath).size,
        sha256: sha256File(zipPath),
      };
      await page.locator("[data-export-status]").waitFor({ timeout: 10_000 });
      report.exportStatus = await page.locator("[data-export-status]").innerText();
    }

    await context.close();
  }

  if (!exportRevision) throw new Error("No approved revision was exported.");
  if (cli["expected-revision"] && exportRevision !== cli["expected-revision"]) {
    throw new Error(
      `Rendered revision ${exportRevision} does not match expected ${cli["expected-revision"]}.`,
    );
  }

  extractZip(path.resolve(root, report.zip.path), extractDir);
  const extractedFiles = listFiles(extractDir);
  report.bundle = {
    path: path.relative(root, extractDir),
    files: extractedFiles.map((file) => {
      const full = path.join(extractDir, file);
      return {
        path: file.replace(/\\/g, "/"),
        bytes: statSync(full).size,
        sha256: sha256File(full),
      };
    }),
  };

  const receiptPath = path.join(extractDir, "receipt.json");
  if (!existsSync(receiptPath)) throw new Error("receipt.json is missing from the bundle.");
  const receipt = JSON.parse(readFileSync(receiptPath, "utf8"));
  copyFileSync(receiptPath, path.join(out, "revision-receipt.json"));
  report.receipt = receipt;

  const zipAbsolute = path.resolve(root, report.zip.path);
  const zipEntries = listZipEntries(zipAbsolute);
  const zipIndexHtml = readZipEntry(zipAbsolute, "index.html");
  const zipReceipt = JSON.parse(readZipEntry(zipAbsolute, "receipt.json"));
  const zipStyles = readZipEntry(zipAbsolute, "styles.css");
  const zipReferences = referenceAudit(zipIndexHtml, zipStyles, zipEntries);
  const zipHtmlAgreement = {
    revision: metaValue(zipIndexHtml, "campaign-lab-revision"),
    offer: metaValue(zipIndexHtml, "campaign-lab-offer"),
    destination: metaValue(zipIndexHtml, "campaign-lab-destination"),
    packshotFile: metaValue(zipIndexHtml, "campaign-lab-packshot-file"),
    packshotSha256: metaValue(zipIndexHtml, "campaign-lab-packshot-sha256"),
  };
  const fontEntries = zipEntries.filter(
    (entry) => /^fonts\/.+\.(?:woff2?|ttf|otf)$/i.test(entry),
  );
  const licenseEntries = zipEntries.filter((entry) =>
    /^fonts\/LICENSE-.+\.txt$/i.test(entry),
  );
  const noticeEntry = zipEntries.find((entry) => entry === "fonts/NOTICE.txt");
  const noticeText = noticeEntry ? readZipEntry(zipAbsolute, noticeEntry) : "";
  const licenseText = licenseEntries
    .map((entry) => readZipEntry(zipAbsolute, entry))
    .join("\n");
  const ctaHref =
    /<a[^>]+href=["']([^"']+)["'][^>]*>/.exec(zipIndexHtml)?.[1] ?? null;
  report.zip.inspection = {
    entries: zipEntries,
    html: zipHtmlAgreement,
    references: zipReferences,
    fonts: fontEntries,
    licenses: licenseEntries,
    notice: noticeEntry ?? null,
    ctaHref,
  };
  report.receipt = zipReceipt;
  check(
    report,
    "zip:html-receipt-agreement",
    zipHtmlAgreement.revision === zipReceipt.approval?.revision &&
      zipHtmlAgreement.offer === zipReceipt.preview?.offer &&
      zipHtmlAgreement.destination === zipReceipt.preview?.destinationUrl &&
      zipHtmlAgreement.packshotFile === zipReceipt.asset?.file &&
      zipHtmlAgreement.packshotSha256 === zipReceipt.asset?.exportedSha256,
    zipHtmlAgreement,
    {
      revision: zipReceipt.approval?.revision,
      offer: zipReceipt.preview?.offer,
      destination: zipReceipt.preview?.destinationUrl,
      packshotFile: zipReceipt.asset?.file,
      packshotSha256: zipReceipt.asset?.exportedSha256,
    },
  );
  check(
    report,
    "zip:html-content-matches-receipt",
    zipIndexHtml.includes(zipReceipt.preview?.offer) &&
      ctaHref === zipReceipt.preview?.destinationUrl &&
      zipReceipt.checks?.htmlAndReceiptAgree === true,
    { offerPresent: zipIndexHtml.includes(zipReceipt.preview?.offer), ctaHref },
    { offer: zipReceipt.preview?.offer, destination: zipReceipt.preview?.destinationUrl },
  );
  check(
    report,
    "zip:references-resolve-inside-archive",
    zipReferences.missing.length === 0 &&
      zipReferences.external.length === 0 &&
      zipReferences.checked.includes(zipReceipt.asset?.file) &&
      fontEntries.every((entry) => zipReferences.checked.includes(entry)) &&
      zipReceipt.checks?.allResourceReferencesResolve === true,
    zipReferences,
    { missing: [], external: [], required: [zipReceipt.asset?.file, ...fontEntries] },
  );
  check(
    report,
    "zip:font-licenses-present",
    fontEntries.length > 0 &&
      licenseEntries.length > 0 &&
      noticeEntry &&
      /Copyright \(c\) 2016 The Inter Project Authors/.test(licenseText) &&
      /SIL OPEN FONT LICENSE Version 1\.1/.test(licenseText) &&
      fontEntries.every((entry) => noticeText.includes(entry)) &&
      zipReceipt.fonts?.every(
        (font) =>
          font.licenseFile &&
          zipEntries.includes(font.licenseFile) &&
          font.files.every((file) => zipEntries.includes(file)),
      ),
    {
      fonts: fontEntries,
      licenses: licenseEntries,
      notice: noticeEntry,
      receipts: zipReceipt.fonts,
    },
    "each font file has a license and notice entry",
  );

  check(
    report,
    "bundle:has-required-files",
    ["index.html", "styles.css", "receipt.json", "README.txt"].every((name) =>
      extractedFiles.some((file) => file.replace(/\\/g, "/") === name),
    ) &&
      extractedFiles.some((file) => /^packshot-[0-9a-f]+\.(?:png|jpg|webp)$/i.test(file)),
    extractedFiles,
    ["index.html", "styles.css", "packshot-*.<png|jpg|webp>", "receipt.json", "README.txt"],
  );
  check(
    report,
    "receipt:approval-row",
    receipt.approval?.scope === "local-preview" &&
      receipt.approval?.revision === exportRevision &&
      receipt.approval?.renderedRevision === exportRevision &&
      receipt.approval?.approvedAt,
    receipt.approval,
    { scope: "local-preview", revision: exportRevision },
  );
  check(
    report,
    "receipt:exact-offer",
    receipt.preview?.offer === fixture.brief.offer,
    receipt.preview?.offer,
    fixture.brief.offer,
  );
  check(
    report,
    "receipt:exact-destination",
    receipt.preview?.destinationUrl === fixture.brief.destinationUrl,
    receipt.preview?.destinationUrl,
    fixture.brief.destinationUrl,
  );
  check(
    report,
    "receipt:packshot-hash",
    receipt.asset?.contentHash === fixture.expected.hash &&
      receipt.asset?.exportedSha256 === fixture.expected.hash,
    receipt.asset,
    fixture.expected.hash,
  );
  check(
    report,
    "receipt:provisional-notice",
    cli.provisional
      ? receipt.preview?.status === "preview" &&
          receipt.preview?.notice === "Preview · destination provisional"
      : receipt.preview?.status === "confirmed" && receipt.preview?.notice === null,
    { status: receipt.preview?.status, notice: receipt.preview?.notice },
    cli.provisional
      ? { status: "preview", notice: "Preview · destination provisional" }
      : { status: "confirmed", notice: null },
  );

  const packshotFile = path.basename(receipt.asset.file);
  const packshotPath = path.join(extractDir, packshotFile);
  const packshotActualHash = sha256File(packshotPath);
  check(
    report,
    "bundle:packshot-bytes-match-receipt",
    packshotActualHash === receipt.asset.exportedSha256,
    packshotActualHash,
    receipt.asset.exportedSha256,
  );

  for (const file of receipt.files ?? []) {
    const full = path.join(extractDir, file.path);
    if (!existsSync(full)) {
      check(report, `receipt:file-present:${file.path}`, false, "missing", file.sha256);
      continue;
    }
    const actual = sha256File(full);
    check(
      report,
      `receipt:file-hash:${file.path}`,
      actual === file.sha256 && statSync(full).size === file.bytes,
      actual,
      file.sha256,
    );
  }

  const freshBrowser = await chromium.launch({
    headless: !cli.headed,
    executablePath,
  });
  const indexUrl = pathToFileURL(path.join(extractDir, "index.html")).href;
  for (const width of [375, 1440]) {
    const context = await freshBrowser.newContext({
      viewport: { width, height: width === 375 ? 900 : 1000 },
      deviceScaleFactor: 1,
      offline: true,
    });
    await context.addInitScript(() => {
      try {
        localStorage.setItem("ornigami-cookie-consent", "accepted");
      } catch {
        // Static file pages do not load the Ornigami consent component.
      }
    });
    const page = await context.newPage();
    const errors = [];
    const externalRequests = [];
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
    page.on("request", (request) => {
      const url = request.url();
      if (!url.startsWith("file:") && !url.startsWith("data:")) {
        externalRequests.push(url);
      }
    });

    await page.goto(indexUrl, { waitUntil: "load", timeout: 60_000 });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForFunction(() => {
      const image = document.querySelector(".campaign-export-frame article img");
      return image && image.complete;
    }, null, { timeout: 30_000 });

    const exported = await readExportedPage(page);
    const exportedShot = path.join(out, `exported-${width}.png`);
    await page.locator(".campaign-export-frame article").screenshot({
      path: exportedShot,
      animations: "disabled",
    });
    await page.screenshot({
      path: path.join(out, `exported-page-${width}.png`),
      fullPage: true,
      animations: "disabled",
    });

    const approvedShot = path.join(out, `approved-preview-${width}.png`);
    const diff = await imageDiff(approvedShot, exportedShot);
    report.widths[width] = {
      ...report.widths[width],
      exported,
      visualDiff: diff,
      exportedShot: path.relative(root, exportedShot),
      externalRequests,
    };

    check(
      report,
      `${width}:exported-article-width-matches-preview`,
      exported.articleWidth === report.widths[width].approvedArticleWidth,
      exported.articleWidth,
      report.widths[width].approvedArticleWidth,
    );
    check(
      report,
      `${width}:exported-exact-offer`,
      exported.articleText.includes(fixture.brief.offer),
      fixture.brief.offer,
      exported.articleText,
    );
    check(
      report,
      `${width}:exported-exact-destination`,
      exported.ctaHref === fixture.brief.destinationUrl,
      exported.ctaHref,
      fixture.brief.destinationUrl,
    );
    check(
      report,
      `${width}:exported-packshot-loaded`,
      exported.imageSrc === `./${packshotFile}` &&
        exported.imageComplete === true &&
        exported.imageNaturalWidth > 0 &&
        exported.imageNaturalHeight > 0,
      {
        src: exported.imageSrc,
        complete: exported.imageComplete,
        naturalWidth: exported.imageNaturalWidth,
        naturalHeight: exported.imageNaturalHeight,
      },
      { src: `./${packshotFile}`, loaded: true },
    );
    check(
      report,
      `${width}:exported-packshot-hash-meta`,
      exported.packshotSha256 === fixture.expected.hash,
      exported.packshotSha256,
      fixture.expected.hash,
    );
    check(
      report,
      `${width}:exported-revision-meta`,
      exported.revision === exportRevision,
      exported.revision,
      exportRevision,
    );
    check(
      report,
      `${width}:exported-content-metadata`,
      exported.offer === fixture.brief.offer &&
        exported.destination === fixture.brief.destinationUrl &&
        exported.packshotFile === packshotFile &&
        exported.packshotSha256 === fixture.expected.hash,
      {
        offer: exported.offer,
        destination: exported.destination,
        packshotFile: exported.packshotFile,
        packshotSha256: exported.packshotSha256,
      },
      {
        offer: fixture.brief.offer,
        destination: fixture.brief.destinationUrl,
        packshotFile,
        packshotSha256: fixture.expected.hash,
      },
    );
    check(
      report,
      `${width}:exported-provisional-notice`,
      cli.provisional
        ? exported.previewStatus === "preview" &&
            exported.previewNotice === "Preview · destination provisional" &&
            exported.footer
              .toLowerCase()
              .includes("preview · destination provisional")
        : exported.previewStatus === "confirmed" &&
            exported.previewNotice === null &&
            !exported.footer.toLowerCase().includes("preview ·"),
      { status: exported.previewStatus, notice: exported.previewNotice, footer: exported.footer },
      cli.provisional
        ? { status: "preview", notice: "Preview · destination provisional" }
        : { status: "confirmed", notice: null },
    );
    check(
      report,
      `${width}:exported-no-editor-controls`,
      exported.buttonCount === 0 &&
        exported.scriptCount === 0 &&
        exported.dataAttributeCount === 0 &&
        exported.editorText === false,
      {
        buttonCount: exported.buttonCount,
        scriptCount: exported.scriptCount,
        dataAttributeCount: exported.dataAttributeCount,
        editorText: exported.editorText,
      },
      { buttonCount: 0, scriptCount: 0, dataAttributeCount: 0, editorText: false },
    );
    check(
      report,
      `${width}:exported-no-console-errors`,
      errors.length === 0,
      errors,
      "no console errors",
    );
    check(
      report,
      `${width}:exported-no-network-requests`,
      externalRequests.length === 0,
      externalRequests,
      "only file/data resource loads while offline",
    );
    check(
      report,
      `${width}:exported-visual-match`,
      diff.widthDelta <= 1 && diff.heightDelta <= 1 && diff.ratio <= 0.015,
      diff,
      "at most 1 px size rounding and <= 1.5% antialiasing/subpixel pixel change",
    );

    await context.close();
  }

  await freshBrowser.close();
  await browser.close();

  const failed = report.checks.filter((item) => !item.passed);
  report.status = failed.length === 0 ? "passed" : "failed";
  report.failed = failed;
  writeFileSync(path.join(out, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(
    JSON.stringify(
      {
        status: report.status,
        label,
        out,
        revision: exportRevision,
        zip: report.zip?.path,
        receipt: path.join(path.relative(root, out), "revision-receipt.json"),
        checks: report.checks.length,
        failed: failed.length,
        failures: failed,
      },
      null,
      2,
    ),
  );
  return failed.length === 0 ? 0 : 1;
}

process.exitCode = await main();
