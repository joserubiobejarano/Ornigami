import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, ".local", "campaign-lab-advertorial");

const { values } = parseArgs({
  options: {
    url: { type: "string", short: "u", default: "http://127.0.0.1:3000" },
  },
});
const base = new URL(values.url).origin;

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
  { name: "375", width: 375, height: 812, isMobile: true, hasTouch: true },
  { name: "1440", width: 1440, height: 900, isMobile: false, hasTouch: false },
];

function fixtureUrl(fixture) {
  return `${base}/campaign-lab?fixture=${encodeURIComponent(fixture)}`;
}

async function readPreview(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector("[data-preview-canvas] article");
    const region = canvas?.closest("section[aria-labelledby]");
    if (!region || !canvas) return null;
    const rect = (node) => {
      const value = node.getBoundingClientRect();
      return {
        top: value.top,
        left: value.left,
        right: value.right,
        bottom: value.bottom,
        width: value.width,
        height: value.height,
      };
    };
    const sections = [...canvas.querySelectorAll("[data-advertorial-section]")].map((node) => ({
      section: node.getAttribute("data-advertorial-section"),
      rect: rect(node),
      actions: node.querySelectorAll("[data-advertorial-action]").length,
      links: node.querySelectorAll("a[href]").length,
    }));
    const links = [...canvas.querySelectorAll("[data-advertorial-action]")].map((node) => ({
      href: node.getAttribute("href"),
      name: node.innerText.trim(),
      rect: rect(node),
    }));
    const headline = canvas.querySelector("h1");
    const disclosure = canvas.querySelector('[data-advertorial-section="disclosure"]');
    const images = [...canvas.querySelectorAll("img")].map((image) => ({
      src: image.getAttribute("src"),
      alt: image.getAttribute("alt"),
      assetId: image.closest("[data-asset-id]")?.getAttribute("data-asset-id") ?? null,
      role: image.closest("[data-asset-role]")?.getAttribute("data-asset-role") ?? null,
      complete: image.complete,
      naturalWidth: image.naturalWidth,
      naturalHeight: image.naturalHeight,
      rect: rect(image),
      objectFit: getComputedStyle(image).objectFit,
    }));
    return {
      fixture: region.getAttribute("data-fixture"),
      template: region.getAttribute("data-template"),
      templateVersion: region.getAttribute("data-template-version"),
      layout: region.getAttribute("data-layout"),
      revision: region.getAttribute("data-revision"),
      assetId: region.getAttribute("data-asset-id"),
      sectionOrder: region.getAttribute("data-section-order"),
      factIds: region.getAttribute("data-fact-ids"),
      storyBeatIds: region.getAttribute("data-story-beat-ids"),
      disclosureLabel: region.getAttribute("data-disclosure-label"),
      advertorialFit: region.getAttribute("data-advertorial-fit"),
      approved: region.querySelector("[data-approved]")?.getAttribute("data-approved"),
      canvasRect: rect(canvas),
      regionRect: rect(region),
      headlineRect: headline ? rect(headline) : null,
      disclosureRect: disclosure ? rect(disclosure) : null,
      sections,
      links,
      images,
      documentOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      regionOverflow: region.scrollWidth > region.clientWidth + 1,
      text: canvas.innerText,
      viewport: { width: window.innerWidth, height: window.innerHeight },
    };
  });
}

async function captureCase(browser, details) {
  const context = await browser.newContext({
    viewport: { width: details.viewport.width, height: details.viewport.height },
    screen: { width: details.viewport.width, height: details.viewport.height },
    deviceScaleFactor: details.viewport.width === 375 ? 2 : 1,
    isMobile: details.viewport.isMobile,
    hasTouch: details.viewport.hasTouch,
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
  const checks = [];
  const add = (id, ok, detail, evidence = {}) => {
    checks.push({ id, state: ok ? "passed" : "failed", detail, evidence });
  };

  try {
    await page.goto(fixtureUrl(details.fixture), { waitUntil: "networkidle", timeout: 20_000 });
    await page.getByRole("region", { name: "Campaign preview" }).waitFor();
    await page.evaluate(() => document.fonts.ready);

    if (details.format) {
      await page.getByLabel("Format", { exact: true }).selectOption(details.format);
    }
    if (details.layout) {
      await page.getByLabel("Advertorial layout", { exact: true }).selectOption(details.layout);
    }

    if (details.generate !== false) {
      await page.getByRole("button", { name: "Generate preview", exact: true }).click();
      await page.waitForTimeout(700);
    }

    if (details.approve) {
      const approve = page.getByRole("button", { name: "Approve preview", exact: true });
      if (!(await approve.isDisabled())) {
        await approve.click();
        await page.waitForTimeout(250);
      }
    }

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(700);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForFunction(
      () => {
        const images = [...document.querySelectorAll("[data-preview-canvas] img")];
        return images.length > 0 && images.every((image) => image.complete);
      },
      { timeout: 8_000 },
    ).catch(() => {});

    const preview = await readPreview(page);
    if (!preview) throw new Error("Campaign preview region could not be read.");

    if (details.expectTemplate) {
      add(
        "template-selected",
        preview.template === details.expectTemplate,
        `Expected ${details.expectTemplate}; observed ${preview.template}.`,
        { template: preview.template, version: preview.templateVersion },
      );
    }
    if (details.expectLayout) {
      add(
        "layout-selected",
        preview.layout === details.expectLayout,
        `Expected ${details.expectLayout}; observed ${preview.layout}.`,
        { layout: preview.layout },
      );
    }
    if (details.expectAssets) {
      add(
        "image-set",
        preview.images.length === details.expectAssets,
        `Expected ${details.expectAssets} rendered images; observed ${preview.images.length}.`,
        { images: preview.images.map((image) => ({ src: image.src, alt: image.alt })) },
      );
    }
    if (details.expectFactIds) {
      const observed = (preview.factIds ?? "").split(",").filter(Boolean);
      add(
        "fact-group",
        details.expectFactIds.every((id) => observed.includes(id)),
        `Expected the complete fact group; observed ${observed.join(", ")}.`,
        { expected: details.expectFactIds, observed },
      );
    }
    if (preview.template === "single-product-advertorial") {
      const disclosureBeforeHeadline = Boolean(
        preview.disclosureRect &&
          preview.headlineRect &&
          preview.disclosureRect.top <= preview.headlineRect.top,
      );
      add("disclosure-first", disclosureBeforeHeadline, "Disclosure must precede the headline visually.", {
        disclosureTop: preview.disclosureRect?.top,
        headlineTop: preview.headlineRect?.top,
      });
      const beforeProduct = preview.sections
        .filter((section) => section.section !== "product")
        .reduce((total, section) => total + section.actions, 0);
      add("no-early-action", beforeProduct === 0, "No action may appear before the product section.", {
        sections: preview.sections,
      });
      add(
        "one-primary-action",
        preview.links.length === 1,
        `Expected one primary action; observed ${preview.links.length}.`,
        { links: preview.links },
      );
      add(
        "ends-at-product",
        preview.sections.at(-1)?.section === "product" &&
          !preview.sections.some((section) => section.section === "close"),
        "The page must end at the product block with no closing-action section.",
        { sections: preview.sections },
      );
      add(
        "same-destination",
        preview.links.every((link) => link.href === "https://example.com/morrow"),
        "The action must use the exact approved destination.",
        { links: preview.links },
      );
      add(
        "no-overflow",
        !preview.documentOverflow && !preview.regionOverflow,
        "The document and preview region must not overflow horizontally.",
        { documentOverflow: preview.documentOverflow, regionOverflow: preview.regionOverflow },
      );
      add(
        "images-loaded",
        preview.images.every((image) => image.complete && image.naturalWidth > 0),
        "Every rendered image must load.",
        { images: preview.images },
      );
      add(
        "hero-identity",
        Boolean(preview.assetId) &&
          preview.images.some(
            (image) =>
              image.assetId === preview.assetId &&
              image.role === "product-hero" &&
              image.complete &&
              image.naturalWidth > 0,
          ),
        "The rendered hero image must match the approved asset identity.",
        { assetId: preview.assetId, images: preview.images },
      );
    }

    if (details.expectApproved !== undefined) {
      add(
        "approval-state",
        preview.approved === (details.expectApproved ? "true" : "false"),
        `Expected approved=${details.expectApproved}; observed ${preview.approved}.`,
        { approved: preview.approved, revision: preview.revision },
      );
    }

    mkdirSync(outDir, { recursive: true });
    const prefix = `${details.name}-${details.viewport.name}`;
    const canvas = page.getByRole("region", { name: "Campaign preview" }).locator("article");
    await canvas.screenshot({
      path: path.join(outDir, `${prefix}-full.png`),
      animations: "disabled",
    });

    const box = await canvas.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return {
        x: rect.x + window.scrollX,
        y: rect.y + window.scrollY,
        width: rect.width,
        height: rect.height,
      };
    });
    if (box) {
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
    }

    if (details.captureEditor) {
      await page.screenshot({
        path: path.join(outDir, `${prefix}-editor.png`),
        animations: "disabled",
        fullPage: false,
      });
    }

    return { name: details.name, viewport: details.viewport.name, checks, preview, errors };
  } finally {
    await context.close();
  }
}

async function exerciseOfferOnly(browser) {
  const viewport = viewports[1];
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    serviceWorkers: "block",
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  const checks = [];
  const add = (id, ok, detail, evidence = {}) => {
    checks.push({ id, state: ok ? "passed" : "failed", detail, evidence });
  };
  try {
    await page.goto(fixtureUrl("momisa-glow-box"), { waitUntil: "networkidle" });
    await page.getByRole("region", { name: "Campaign preview" }).waitFor();
    const offerPreview = await readPreview(page);
    add(
      "offer-default",
      offerPreview?.template === "single-product-offer",
      "The offer-only brief loads the existing offer template.",
      { template: offerPreview?.template },
    );
    add(
      "fit-panel",
      (await page.getByText("Advertorial not ready for this brief").count()) > 0,
      "The editor names the advertorial gap before a generation attempt.",
    );

    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: path.join(outDir, "momisa-offer-only-1440-fit.png"),
      animations: "disabled",
      fullPage: false,
    });

    const revisionBefore = offerPreview?.revision;
    const imageBefore = offerPreview?.assetId;
    const offerBefore = offerPreview?.text.match(/30% off[^\n]*/)?.[0] ?? "";
    await page.getByLabel("Format", { exact: true }).selectOption("advertorial");
    await page.getByRole("button", { name: "Generate preview", exact: true }).click();
    await page.waitForTimeout(500);
    const afterInvalid = await readPreview(page);
    add(
      "invalid-preserves-preview",
      afterInvalid?.revision === revisionBefore && afterInvalid?.assetId === imageBefore,
      "An invalid advertorial attempt leaves the last usable offer preview in place.",
      { revisionBefore, revisionAfter: afterInvalid?.revision, imageBefore, imageAfter: afterInvalid?.assetId },
    );
    add(
      "missing-input-visible",
      (await page.getByText(/approved advertorial opening|approved story beats/i).count()) > 0,
      "The editor names the missing advertorial inputs.",
      { text: afterInvalid?.text.slice(0, 300) },
    );

    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: path.join(outDir, "momisa-offer-only-1440-gap.png"),
      animations: "disabled",
      fullPage: false,
    });
    await page.getByRole("button", { name: "Use single-product offer", exact: true }).click();
    await page.waitForTimeout(400);
    const afterFallback = await readPreview(page);
    add(
      "offer-fallback",
      afterFallback?.template === "single-product-offer" && afterFallback?.revision === revisionBefore,
      "The offer template is one click away and restores the same usable revision.",
      { revisionBefore, revisionAfter: afterFallback?.revision, template: afterFallback?.template },
    );
    add("offer-preserved", Boolean(offerBefore), "The preview keeps the approved offer copy.", { offerBefore });
    return { name: "momisa-offer-only", viewport: "1440", checks };
  } finally {
    await context.close();
  }
}

async function exerciseApprovalInvalidation(browser) {
  const viewport = viewports[1];
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    serviceWorkers: "block",
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  const checks = [];
  const add = (id, ok, detail, evidence = {}) => {
    checks.push({ id, state: ok ? "passed" : "failed", detail, evidence });
  };
  try {
    await page.goto(fixtureUrl("morrow-advertorial-full"), { waitUntil: "networkidle" });
    await page.getByRole("region", { name: "Campaign preview" }).waitFor();
    await page.getByRole("button", { name: "Generate preview", exact: true }).click();
    await page.waitForTimeout(500);
    await page.getByRole("button", { name: "Approve preview", exact: true }).click();
    await page.waitForTimeout(250);
    const approved = await readPreview(page);
    add("approved-first", approved?.approved === "true", "The exact preview revision is approved.", {
      revision: approved?.revision,
    });

    await page.getByLabel("Offer", { exact: true }).fill("Free shipping through 30 November 2026, plus a gift");
    await page.waitForTimeout(150);
    const edited = await readPreview(page);
    add(
      "edit-clears-approval",
      edited?.approved === "false",
      "Editing an approved brief clears approval before regenerating.",
      { revision: edited?.revision, approved: edited?.approved },
    );

    await page.getByLabel("Offer", { exact: true }).fill("");
    await page.getByRole("button", { name: "Generate preview", exact: true }).click();
    await page.waitForTimeout(400);
    const invalid = await readPreview(page);
    add(
      "invalid-keeps-last-preview",
      invalid?.revision === approved?.revision && invalid?.approved === "false",
      "An invalid edit keeps the last usable preview and leaves approval cleared.",
      {
        approvedRevision: approved?.revision,
        observedRevision: invalid?.revision,
        approved: invalid?.approved,
      },
    );
    await page.screenshot({
      path: path.join(outDir, "morrow-invalid-keeps-preview-1440-editor.png"),
      animations: "disabled",
      fullPage: false,
    });
    return { name: "morrow-invalid", viewport: "1440", checks };
  } finally {
    await context.close();
  }
}

async function exerciseWrongPackshot(browser) {
  const viewport = viewports[1];
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    serviceWorkers: "block",
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  const checks = [];
  const add = (id, ok, detail, evidence = {}) => {
    checks.push({ id, state: ok ? "passed" : "failed", detail, evidence });
  };
  try {
    await page.goto(fixtureUrl("morrow-advertorial-full"), { waitUntil: "networkidle" });
    await page.getByRole("region", { name: "Campaign preview" }).waitFor();
    await page.getByRole("button", { name: "Generate preview", exact: true }).click();
    await page.waitForTimeout(600);
    await page.getByRole("button", { name: "Approve preview", exact: true }).click();
    await page.waitForTimeout(250);
    const before = await readPreview(page);

    await page.route("**/api/campaign-lab/generate", async (route) => {
      const body = route.request().postDataJSON();
      body.values.assetId = "harbor-field-bottle-front";
      await route.continue({ postData: JSON.stringify(body) });
    });
    await page.getByRole("button", { name: "Generate preview", exact: true }).click();
    await page.waitForTimeout(600);
    const after = await readPreview(page);
    const issueVisible = (await page.getByText(/approved packshot/i).count()) > 0;

    add(
      "wrong-packshot-rejected",
      issueVisible,
      "The server rejects a Harbor Field bottle as the Morrow packshot.",
      { issueVisible },
    );
    add(
      "wrong-packshot-preserves-preview",
      after?.revision === before?.revision &&
        after?.assetId === "morrow-ceramic-dripper-front" &&
        after?.images.every((image) => image.assetId !== "harbor-field-bottle-front"),
      "The last usable Morrow preview remains in place after the rejected request.",
      {
        revisionBefore: before?.revision,
        revisionAfter: after?.revision,
        assetBefore: before?.assetId,
        assetAfter: after?.assetId,
      },
    );
    add(
      "wrong-packshot-clears-approval",
      after?.approved === "false",
      "The rejected edit leaves approval cleared.",
      { approved: after?.approved },
    );

    await page.screenshot({
      path: path.join(outDir, "morrow-wrong-packshot-1440-editor.png"),
      animations: "disabled",
      fullPage: false,
    });
    return { name: "morrow-wrong-packshot", viewport: "1440", checks };
  } finally {
    await context.close();
  }
}

async function exerciseCompatibleLayout(browser) {
  const viewport = viewports[1];
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    serviceWorkers: "block",
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  const checks = [];
  const add = (id, ok, detail, evidence = {}) => {
    checks.push({ id, state: ok ? "passed" : "failed", detail, evidence });
  };
  try {
    await page.goto(fixtureUrl("morrow-advertorial-one-photo"), { waitUntil: "networkidle" });
    await page.getByRole("region", { name: "Campaign preview" }).waitFor();
    await page.getByLabel("Advertorial layout", { exact: true }).selectOption("advertorial-full");
    await page.waitForTimeout(200);

    const reasonVisible =
      (await page.getByText(/This brief fits the Advertorial, one photo layout instead/i).count()) > 0;
    const switchButton = page.getByRole("button", {
      name: "Use Advertorial, one photo",
      exact: true,
    });
    add(
      "incompatible-layout-explained",
      reasonVisible,
      "The editor explains why the requested full layout cannot hold one image.",
      { reasonVisible },
    );
    add(
      "compatible-layout-offered",
      (await switchButton.count()) > 0,
      "The editor offers the compatible one-photo layout.",
    );

    if ((await switchButton.count()) > 0) {
      await switchButton.click();
      await page.waitForTimeout(200);
    }
    const layoutValue = await page.getByLabel("Advertorial layout", { exact: true }).inputValue();
    const preview = await readPreview(page);
    add(
      "compatible-layout-applied",
      layoutValue === "advertorial-one-photo" && preview?.layout === "advertorial-one-photo",
      "The compatible choice applies to the layout control and the rendered preview.",
      { layoutValue, previewLayout: preview?.layout },
    );
    return { name: "morrow-compatible-layout", viewport: "1440", checks };
  } finally {
    await context.close();
  }
}

const { chromium } = await loadPlaywright();
const browser = await chromium.launch({ headless: true, executablePath: chromiumExecutable(chromium) });
const results = [];
try {
  for (const viewport of viewports) {
    results.push(
      await captureCase(browser, {
        name: "morrow-full",
        fixture: "morrow-advertorial-full",
        viewport,
        approve: true,
        expectTemplate: "single-product-advertorial",
        expectLayout: "advertorial-full",
        expectAssets: 4,
        expectApproved: true,
      }),
    );
  }
  for (const viewport of viewports) {
    results.push(
      await captureCase(browser, {
        name: "morrow-one-photo",
        fixture: "morrow-advertorial-one-photo",
        viewport,
        approve: true,
        expectTemplate: "single-product-advertorial",
        expectLayout: "advertorial-one-photo",
        expectAssets: 1,
        expectApproved: true,
      }),
    );
  }
  for (const viewport of viewports) {
    results.push(
      await captureCase(browser, {
        name: "morrow-full-to-one-photo",
        fixture: "morrow-advertorial-full",
        viewport,
        layout: "advertorial-one-photo",
        expectTemplate: "single-product-advertorial",
        expectLayout: "advertorial-one-photo",
        expectAssets: 1,
        expectFactIds: ["interior", "outlet", "body"],
      }),
    );
  }
  results.push(await exerciseOfferOnly(browser));
  results.push(await exerciseApprovalInvalidation(browser));
  results.push(await exerciseWrongPackshot(browser));
  results.push(await exerciseCompatibleLayout(browser));
} finally {
  await browser.close();
}

const checks = results.flatMap((result) => result.checks ?? []);
const summary = {
  generatedAt: new Date().toISOString(),
  base,
  outDir,
  captures: [
    "morrow-full-375-full.png",
    "morrow-full-375-first.png",
    "morrow-full-1440-full.png",
    "morrow-full-1440-first.png",
    "morrow-one-photo-375-full.png",
    "morrow-one-photo-375-first.png",
    "morrow-one-photo-1440-full.png",
    "morrow-one-photo-1440-first.png",
    "morrow-full-to-one-photo-375-full.png",
    "morrow-full-to-one-photo-375-first.png",
    "morrow-full-to-one-photo-1440-full.png",
    "morrow-full-to-one-photo-1440-first.png",
    "momisa-offer-only-1440-fit.png",
    "momisa-offer-only-1440-gap.png",
    "morrow-invalid-keeps-preview-1440-editor.png",
    "morrow-wrong-packshot-1440-editor.png",
  ],
  checks,
  failed: checks.filter((check) => check.state === "failed"),
  results,
};
writeFileSync(path.join(outDir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify({ outDir, failed: summary.failed.length, checks: checks.length }, null, 2));
if (summary.failed.length > 0) process.exitCode = 1;
