#!/usr/bin/env node
/**
 * Replay saved valid previews through the normal Campaign Lab preview, local
 * approval, and export paths. No provider request is made here.
 *
 * Usage:
 *   node scripts/campaign-lab-guidance-eval-render.mjs --run <run-dir> --url http://localhost:3130
 */
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { values: cli } = parseArgs({
  options: {
    run: { type: "string" },
    url: { type: "string", default: "http://localhost:3130" },
    out: { type: "string" },
    seed: { type: "string", default: "campaign-lab-guidance-eval-render-v1" },
    headed: { type: "boolean", default: false },
    "skip-export": { type: "boolean", default: false },
  },
});

if (!cli.run) throw new Error("--run is required");
const runDir = path.resolve(cli.run);
const run = JSON.parse(readFileSync(path.join(runDir, "run.json"), "utf8"));
const outDir = path.resolve(cli.out ?? path.join(runDir, "review"));
const capturesDir = path.join(outDir, "captures");
const exportsDir = path.join(outDir, "exports");
mkdirSync(capturesDir, { recursive: true });
mkdirSync(exportsDir, { recursive: true });

async function loadPlaywright() {
  const candidates = [
    process.env.CAMPAIGN_LAB_PLAYWRIGHT,
    "C:/Users/joser/AppData/Local/Temp/opencode/playwright-tools/node_modules/playwright/index.mjs",
    path.join(root, "scripts", "framework-prototype", "browser-tools", "node_modules", "playwright", "index.mjs"),
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (existsSync(candidate)) return import(pathToFileURL(candidate).href);
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

function hash(value) {
  return createHash("sha256").update(value).digest("hex");
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

function deterministicPreview(brief) {
  const file = path.join(
    runDir,
    "previews",
    "deterministic",
    `${brief.id}.json`,
  );
  return JSON.parse(readFileSync(file, "utf8"));
}

const entries = [];
for (const brief of run.preflight.briefs) {
  const deterministic = deterministicPreview(brief);
  entries.push({
    brief,
    condition: "deterministic",
    repeat: 0,
    source: "deterministic",
    preview: deterministic,
    generation: {
      status: "fallback",
      provider: "deterministic",
      providerLabel: "Deterministic builder",
      providerMode: "none",
      harnessVersion: run.preflight.harnessVersion,
      guidancePackVersion: run.preflight.guidancePackVersion,
      code: "unavailable",
      message: "Deterministic reference; no provider call.",
    },
  });
  for (const record of run.records) {
    if (record.briefId !== brief.id) continue;
    if (record.result?.generation?.status !== "generated") continue;
    if (!record.result.preview) continue;
    entries.push({
      brief,
      condition: record.condition,
      repeat: record.repeat,
      source: record.error ? "invalid" : "model",
      preview: record.result.preview,
      generation: record.result.generation,
    });
  }
}

const briefOrder = [...run.preflight.briefs].sort((left, right) =>
  hash(`${cli.seed}:brief:${left.id}`).localeCompare(
    hash(`${cli.seed}:brief:${right.id}`),
  ),
);
const caseLabels = new Map();
briefOrder.forEach((brief, index) => {
  caseLabels.set(brief.id, `C${index + 1}`);
});

const mapping = {
  schemaVersion: 1,
  seed: cli.seed,
  cases: {},
};
const grouped = new Map();
for (const entry of entries) {
  const list = grouped.get(entry.brief.id) ?? [];
  list.push(entry);
  grouped.set(entry.brief.id, list);
}
for (const [briefId, list] of grouped) {
  list.sort((left, right) =>
    hash(`${cli.seed}:page:${briefId}:${left.condition}:${left.repeat}`).localeCompare(
      hash(`${cli.seed}:page:${briefId}:${right.condition}:${right.repeat}`),
    ),
  );
  const caseLabel = caseLabels.get(briefId);
  mapping.cases[caseLabel] = {
    briefId,
    pages: {},
  };
  list.forEach((entry, index) => {
    const pageLabel = `P${index + 1}`;
    entry.caseLabel = caseLabel;
    entry.pageLabel = pageLabel;
    mapping.cases[caseLabel].pages[pageLabel] = {
      condition: entry.condition,
      repeat: entry.repeat,
      source: entry.source,
    };
  });
}

async function setField(page, label, value) {
  const field = page.getByLabel(label, { exact: true });
  if ((await field.count()) === 0) return;
  await field.fill(String(value));
}

async function renderEntry(browser, entry) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const caseDir = path.join(capturesDir, entry.caseLabel, entry.pageLabel);
  mkdirSync(caseDir, { recursive: true });
  const exportRecord = {
    case: entry.caseLabel,
    page: entry.pageLabel,
    condition: entry.condition,
    repeat: entry.repeat,
    revision: entry.preview.revision,
    export: null,
  };

  try {
    await page.route("**/api/campaign-lab/generate", async (route) => {
      const request = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          preview: entry.preview,
          generation: entry.generation,
          requestId: request.requestId,
        }),
      });
    });
    await page.goto(
      new URL(`/campaign-lab?fixture=${entry.brief.fixtureId}`, cli.url).href,
      { waitUntil: "networkidle", timeout: 120_000 },
    );
    await page.waitForSelector('section[data-fixture]', { timeout: 60_000 });
    const values = entry.brief.values;
    await setField(page, "Product name", values.productName);
    await setField(page, "Audience", values.audience ?? "");
    await setField(page, "Campaign objective", values.objective ?? "");
    await setField(page, "Offer", values.offer);
    await setField(page, "Destination URL", values.destinationUrl);
    await setField(page, "Accent color", values.accent);
    if (values.openingFocus) {
      const opening = page.getByLabel("Opening focus", { exact: true });
      if ((await opening.count()) > 0) await opening.selectOption(values.openingFocus);
    }
    await page.waitForFunction(
      () => [...document.images].every((image) => image.complete && image.naturalWidth > 0),
      null,
      { timeout: 30_000 },
    );
    await page.getByRole("button", { name: "Generate preview", exact: true }).click();
    await page.waitForFunction(
      () => {
        const section = document.querySelector("section[data-fixture]");
        return ["generated", "fallback"].includes(
          section?.getAttribute("data-generation-status") ?? "",
        );
      },
      null,
      { timeout: 30_000 },
    );
    await page.waitForTimeout(300);
    const rendered = await page.evaluate(() => {
      const section = document.querySelector("section[data-fixture]");
      return {
        revision: section?.getAttribute("data-revision") ?? null,
        generationStatus: section?.getAttribute("data-generation-status") ?? null,
      };
    });
    if (rendered.revision !== entry.preview.revision) {
      throw new Error(
        `${entry.caseLabel}/${entry.pageLabel}: replay revision ${rendered.revision} does not match saved ${entry.preview.revision}`,
      );
    }

    for (const width of [375, 768, 1440]) {
      await page.setViewportSize({ width, height: width === 375 ? 812 : width === 768 ? 1024 : 900 });
      await page.waitForTimeout(150);
      await page.locator("article").first().screenshot({
        path: path.join(caseDir, `${width}.png`),
        // Developer chrome can overlap the article even in a locator capture.
        style: "nextjs-portal { display: none !important; }",
      });
    }

    if (!cli["skip-export"]) {
      await page.setViewportSize({ width: 1440, height: 1000 });
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
      const zipPath = path.join(exportsDir, entry.caseLabel, entry.pageLabel, download.suggestedFilename());
      mkdirSync(path.dirname(zipPath), { recursive: true });
      await download.saveAs(zipPath);
      const bundleDir = path.join(exportsDir, entry.caseLabel, entry.pageLabel, "bundle");
      extractZip(zipPath, bundleDir);
      const receipt = JSON.parse(
        readFileSync(path.join(bundleDir, "receipt.json"), "utf8"),
      );
      exportRecord.export = {
        fileName: download.suggestedFilename(),
        zip: path.relative(root, zipPath),
        bundle: path.relative(root, bundleDir),
        receipt,
      };
    }
  } finally {
    await page.close();
  }
  return exportRecord;
}

function galleryHtml() {
  const cases = briefOrder
    .map((brief, index) => {
      const caseLabel = caseLabels.get(brief.id);
      const pages = grouped.get(brief.id) ?? [];
      const pageHtml = pages
        .map((entry) => {
          const base = `captures/${caseLabel}/${entry.pageLabel}`;
          return `<section class="page"><h3>${entry.pageLabel}</h3><div class="shots">
<img src="${base}/375.png" alt="${caseLabel} ${entry.pageLabel} at 375 px">
<img src="${base}/768.png" alt="${caseLabel} ${entry.pageLabel} at 768 px">
<img src="${base}/1440.png" alt="${caseLabel} ${entry.pageLabel} at 1440 px">
</div></section>`;
        })
        .join("\n");
      return `<section class="case"><h2>Case ${index + 1}</h2>
<p><strong>${brief.label}</strong></p>
<p>Audience: ${brief.values.audience}</p>
<p>Objective: ${brief.values.objective}</p>
<p>Offer: ${brief.values.offer} · Destination: ${brief.values.destinationUrl}</p>
${pageHtml}
</section>`;
    })
    .join("\n");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Campaign guidance review</title>
<style>
body{font-family:system-ui,sans-serif;margin:0;padding:24px;background:#f6f3ec;color:#1f2a24}
.case{background:#fffdf8;border:1px solid #d8cebd;border-radius:16px;padding:20px;margin:0 0 28px}
.page{margin-top:22px}.shots{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
img{width:100%;border:1px solid #d8cebd;border-radius:8px;background:#fff}
@media(max-width:900px){.shots{grid-template-columns:1fr}}
</style></head><body>
<h1>Campaign guidance review</h1>
<p>Neutral comparison gallery. Do not open the mapping file until visual review is complete.</p>
${cases}
</body></html>`;
}

function reviewSheet() {
  const lines = [
    "# Blank campaign review sheet",
    "",
    "Complete visual judgments before opening the functional report or mapping file. Do not infer scores from automated gates. Use 0 = failed/unsupported, 1 = workable with edits, 2 = ready to use.",
    "",
  ];
  for (const brief of briefOrder) {
    const caseLabel = caseLabels.get(brief.id);
    const pages = grouped.get(brief.id) ?? [];
    lines.push(`## ${caseLabel}`, "");
    lines.push(`**Brief.** ${brief.label}`);
    lines.push("");
    lines.push(`- Audience: ${brief.values.audience}`);
    lines.push(`- Objective: ${brief.values.objective}`);
    lines.push(`- Offer: ${brief.values.offer}`);
    lines.push(`- Destination: ${brief.values.destinationUrl}`);
    lines.push("");
    lines.push(
      "| Page | Campaign fit | Relevant evidence | Hierarchy | Repetition | Edits needed | Notes |",
    );
    lines.push("| --- | ---: | ---: | ---: | ---: | ---: | --- |");
    for (const entry of pages) {
      lines.push(`| ${entry.pageLabel} | | | | | | |`);
    }
    lines.push("");
    lines.push("- Page I would approve: ");
    lines.push("- Strongest page and why: ");
    lines.push("- Weakest page and why: ");
    lines.push("- First change I would make: ");
    lines.push("- Any factual or functional issue noticed visually (record separately from the score): ");
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

async function main() {
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({
    executablePath: chromeExecutable(),
    headless: !cli.headed,
  });
  const rendered = [];
  try {
    for (const entry of entries) {
      console.log(`Rendering ${entry.caseLabel}/${entry.pageLabel} (${entry.condition}/${entry.repeat})`);
      rendered.push(await renderEntry(browser, entry));
    }
  } finally {
    await browser.close();
  }

  writeFileSync(path.join(outDir, "gallery.html"), galleryHtml());
  writeFileSync(path.join(outDir, "review-sheet.md"), reviewSheet());
  writeFileSync(
    path.join(outDir, "mapping.json"),
    `${JSON.stringify(mapping, null, 2)}\n`,
  );
  writeFileSync(
    path.join(outDir, "render.json"),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        run: path.relative(root, runDir),
        seed: cli.seed,
        gallery: path.relative(root, path.join(outDir, "gallery.html")),
        reviewSheet: path.relative(root, path.join(outDir, "review-sheet.md")),
        mapping: path.relative(root, path.join(outDir, "mapping.json")),
        entries: rendered,
      },
      null,
      2,
    )}\n`,
  );
  console.log(
    JSON.stringify(
      {
        status: "rendered",
        entries: rendered.length,
        gallery: path.relative(root, path.join(outDir, "gallery.html")),
        reviewSheet: path.relative(root, path.join(outDir, "review-sheet.md")),
        mapping: path.relative(root, path.join(outDir, "mapping.json")),
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
