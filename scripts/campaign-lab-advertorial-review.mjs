import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const { values } = parseArgs({
  options: {
    url: { type: "string", short: "u", default: "http://127.0.0.1:3000" },
    run: { type: "string", default: "review" },
    fixture: { type: "string", default: "morrow-advertorial-full" },
    onePhoto: { type: "string", default: "morrow-advertorial-one-photo" },
  },
});

const base = new URL(values.url).origin;
const outDir = path.join(root, ".local", "campaign-lab-advertorial", values.run);

function loadPlaywright() {
  const candidate = path.join(
    root,
    "scripts",
    "framework-prototype",
    "browser-tools",
    "node_modules",
    "playwright",
    "index.mjs",
  );
  if (existsSync(candidate)) return import(pathToFileURL(candidate).href);
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
      const candidate = path.join(cache, version, "chrome-win64", "chrome.exe");
      if (existsSync(candidate)) return candidate;
    }
  }
  return undefined;
}

const viewports = [
  { name: "320", width: 320, height: 800, mobile: true },
  { name: "375", width: 375, height: 812, mobile: true },
  { name: "768", width: 768, height: 900, mobile: true },
  { name: "1440", width: 1440, height: 900, mobile: false },
  { name: "editor-1024", width: 1024, height: 900, mobile: false },
];

function fixtureUrl(id) {
  return `${base}/campaign-lab?fixture=${encodeURIComponent(id)}`;
}

async function readArticle(page) {
  return page.evaluate(() => {
    const article = document.querySelector("[data-preview-canvas] article");
    if (!article) return null;
    const viewportTop = window.scrollY;
    const rect = article.getBoundingClientRect();
    const articleTop = rect.top + viewportTop;
    const box = (node) => {
      const value = node.getBoundingClientRect();
      return {
        top: Math.round(value.top + viewportTop - articleTop),
        bottom: Math.round(value.bottom + viewportTop - articleTop),
        width: Math.round(value.width),
        height: Math.round(value.height),
      };
    };
    const style = (node, pseudo) => {
      const computed = getComputedStyle(node, pseudo);
      return {
        color: computed.color,
        backgroundColor: computed.backgroundColor,
        fontSize: computed.fontSize,
        lineHeight: computed.lineHeight,
        outline: `${computed.outlineStyle} ${computed.outlineWidth} ${computed.outlineColor}`,
      };
    };
    const parse = (value) => {
      const match = value.match(/rgba?\(([^)]+)\)/);
      if (!match) return null;
      const parts = match[1].split(/[ ,/]+/).filter(Boolean).map(Number);
      return { r: parts[0], g: parts[1], b: parts[2], a: parts[3] ?? 1 };
    };
    const luminance = ({ r, g, b }) => {
      const channel = (value) => {
        const normalized = value / 255;
        return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
    };
    const contrast = (foreground, background) => {
      const fg = parse(foreground);
      const bg = parse(background);
      if (!fg || !bg) return null;
      const light = Math.max(luminance(fg), luminance(bg));
      const dark = Math.min(luminance(fg), luminance(bg));
      return Math.round(((light + 0.05) / (dark + 0.05)) * 100) / 100;
    };
    const sections = [...article.querySelectorAll("[data-advertorial-section]")].map((node) => ({
      section: node.getAttribute("data-advertorial-section"),
      ...box(node),
      actions: node.querySelectorAll("[data-advertorial-action]").length,
      links: node.querySelectorAll("a[href]").length,
    }));
    const links = [...article.querySelectorAll("[data-advertorial-action]")].map((node) => ({
      label: node.textContent.trim(),
      href: node.getAttribute("href"),
      ...box(node),
    }));
    const images = [...article.querySelectorAll("img")].map((image) => ({
      assetId: image.closest("[data-asset-id]")?.getAttribute("data-asset-id") ?? null,
      role: image.closest("[data-asset-role]")?.getAttribute("data-asset-role") ?? null,
      alt: image.getAttribute("alt"),
      complete: image.complete,
      naturalWidth: image.naturalWidth,
      objectFit: getComputedStyle(image).objectFit,
      ...box(image),
    }));
    const headline = article.querySelector("h1");
    const disclosure = article.querySelector('[data-advertorial-section="disclosure"]');
    const disclosureLine = disclosure?.querySelector("p");
    const disclosureExplanation = disclosure?.querySelectorAll("p")[1] ?? null;
    const product = article.querySelector('[data-advertorial-section="product"]');
    const close = article.querySelector('[data-advertorial-section="close"]');
    const action = article.querySelector("[data-advertorial-action]");
    const pageStyle = getComputedStyle(article);
    return {
      articleTop: Math.round(articleTop),
      articleWidth: Math.round(rect.width),
      articleHeight: Math.round(rect.height),
      headline: headline?.textContent?.trim() ?? null,
      headlineRect: headline ? box(headline) : null,
      sectionOrder: sections.map((section) => section.section),
      sections,
      links,
      images,
      firstActionFromArticleTop: links[0]?.top ?? null,
      productFromArticleTop: product ? box(product).top : null,
      closeFromArticleTop: close ? box(close).top : null,
      disclosure: disclosure
        ? {
            ...box(disclosure),
            line: disclosureLine ? style(disclosureLine) : null,
            explanation: disclosureExplanation ? style(disclosureExplanation) : null,
            contrastLine: disclosureLine
              ? contrast(style(disclosureLine).color, pageStyle.backgroundColor)
              : null,
            contrastExplanation: disclosureExplanation
              ? contrast(style(disclosureExplanation).color, pageStyle.backgroundColor)
              : null,
          }
        : null,
      actionStyle: action ? style(action) : null,
      actionContrast: action
        ? contrast(style(action).color, style(action).backgroundColor)
        : null,
      documentOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      articleOverflow: article.scrollWidth > article.clientWidth + 1,
      documentHeight: document.documentElement.scrollHeight,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      text: article.innerText,
    };
  });
}

async function checkFocus(page) {
  const entries = [];
  for (let index = 0; index < 120 && entries.length < 2; index += 1) {
    await page.keyboard.press("Tab");
    const active = await page.evaluate(() => {
      const element = document.activeElement;
      if (!element || !element.closest("[data-preview-canvas] article")) return null;
      const computed = getComputedStyle(element);
      return {
        label: element.textContent?.trim() ?? "",
        focusVisible: element.matches(":focus-visible"),
        outlineStyle: computed.outlineStyle,
        outlineWidth: computed.outlineWidth,
        outlineColor: computed.outlineColor,
        outlineOffset: computed.outlineOffset,
      };
    });
    if (active) entries.push(active);
  }
  return entries;
}

async function capture(browser, details) {
  const context = await browser.newContext({
    viewport: { width: details.viewport.width, height: details.viewport.height },
    screen: { width: details.viewport.width, height: details.viewport.height },
    deviceScaleFactor: details.viewport.width <= 375 ? 2 : 1,
    isMobile: details.viewport.mobile,
    hasTouch: details.viewport.mobile,
    serviceWorkers: "block",
    reducedMotion: "reduce",
    locale: "en-US",
    timezoneId: "UTC",
  });
  const page = await context.newPage();
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));

  try {
    await page.goto(fixtureUrl(details.fixture), { waitUntil: "networkidle", timeout: 30_000 });
    const captureStyle = await page.addStyleTag({
      content:
        "nextjs-portal{display:none!important} [data-advertorial-action]:focus-visible{outline:none!important}",
    });
    await page.getByRole("region", { name: "Campaign preview" }).waitFor();
    await page.evaluate(() => document.fonts.ready);
    const generate = page.getByRole("button", { name: "Generate preview", exact: true });
    if (!(await generate.isDisabled())) {
      await generate.click();
      await page.waitForTimeout(500);
    }
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(500);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForFunction(
      () => {
        const images = [...document.querySelectorAll("[data-preview-canvas] img")];
        return images.length > 0 && images.every((image) => image.complete);
      },
      { timeout: 10_000 },
    ).catch(() => {});

    const article = await readArticle(page);
    if (!article) throw new Error("Campaign preview article could not be read.");
    const canvas = page.getByRole("region", { name: "Campaign preview" }).locator("article");
    const prefix = `${details.name}-${details.viewport.name}`;
    const box = await canvas.evaluate((element) => {
      const value = element.getBoundingClientRect();
      return {
        x: value.x + window.scrollX,
        y: value.y + window.scrollY,
        width: value.width,
        height: value.height,
      };
    });
    await page.screenshot({
      path: path.join(outDir, `${prefix}-full.png`),
      animations: "disabled",
      fullPage: true,
      clip: {
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height,
      },
    });
    await page.screenshot({
      path: path.join(outDir, `${prefix}-first.png`),
      animations: "disabled",
      fullPage: true,
      clip: {
        x: box.x,
        y: box.y,
        width: box.width,
        height: Math.min(box.height, details.viewport.height),
      },
    });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: path.join(outDir, `${prefix}-editor.png`),
      animations: "disabled",
      fullPage: false,
    });
    await captureStyle.evaluate((node) => node.remove());
    const focus = await checkFocus(page);
    await page.evaluate(() => {
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    });
    return {
      name: details.name,
      fixture: details.fixture,
      viewport: details.viewport.name,
      checks: {
        noOverflow: !article.documentOverflow && !article.articleOverflow,
        disclosureFirst:
          article.disclosure !== null &&
          article.headlineRect !== null &&
          article.disclosure.top <= article.headlineRect.top,
        noEarlyAction:
          article.sections
            .filter((section) => section.section !== "product")
            .reduce((total, section) => total + section.actions, 0) === 0,
        primaryAction:
          article.links.length === 1 &&
          article.links.every((link) => link.href === "https://example.com/morrow"),
        imagesLoaded: article.images.every((image) => image.complete && image.naturalWidth > 0),
        focusVisible: (focus ?? []).length === 1 && (focus ?? []).every((entry) => entry.focusVisible),
      },
      article,
      focus,
      errors,
    };
  } finally {
    await context.close();
  }
}

const { chromium } = await loadPlaywright();
mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  executablePath: chromiumExecutable(chromium),
});
const results = [];
try {
  for (const viewport of viewports) {
    results.push(
      await capture(browser, {
        name: "morrow-full",
        fixture: values.fixture,
        viewport,
      }),
    );
  }
  for (const viewport of viewports) {
    results.push(
      await capture(browser, {
        name: "morrow-one-photo",
        fixture: values.onePhoto,
        viewport,
      }),
    );
  }
} finally {
  await browser.close();
}

const summary = {
  generatedAt: new Date().toISOString(),
  outDir,
  results,
  failures: results.flatMap((result) =>
    Object.entries(result.checks)
      .filter(([, ok]) => !ok)
      .map(([check]) => ({ fixture: result.fixture, viewport: result.viewport, check })),
  ),
};
writeFileSync(path.join(outDir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
console.log(
  JSON.stringify(
    {
      outDir,
      captures: results.length,
      failures: summary.failures,
    },
    null,
    2,
  ),
);
if (summary.failures.length > 0) process.exitCode = 1;
