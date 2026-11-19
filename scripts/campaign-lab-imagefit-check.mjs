#!/usr/bin/env node
/** Bounded Session 1 intake/loader regression. No provider calls. */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync, execFileSync } from "node:child_process";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import { BASE_CATALOG } from "../src/lib/campaign-lab/fixtures.ts";
import { validatePilotSource, validatePilotManifest } from "../src/lib/campaign-lab/pilots/pilot-manifest.ts";
import { resolveCampaignImage } from "../src/lib/campaign-lab/presentation.ts";
import { assertHtmlReceiptAgreement, auditArchiveReferences } from "../src/lib/campaign-lab/export.ts";

const { values: cli } = parseArgs({ options: {
  out: { type: "string", default: ".local/imagefit-contract/intake" },
  observe: { type: "boolean", default: false },
  url: { type: "string" },
} });
const out = path.resolve(cli.out), pilotId = "imagefit-contract";
const pilotRoot = path.join(out, "pilots"), pilotDir = path.join(pilotRoot, pilotId);
fs.mkdirSync(pilotDir, { recursive: true });
const save = (name, data) => fs.writeFileSync(path.join(out, name), JSON.stringify(data, null, 2) + "\n");
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const fixture = BASE_CATALOG.fixtures["long-copy"];
const asset = BASE_CATALOG.assets.find(a => a.id === fixture.assetId);
const brandId = fixture.brief.brandId;
const brief = structuredClone(fixture.brief);
for (const key of ["fixtureId", "brandId", "assetId"]) delete brief[key];
const { src, contentHash } = asset;
const approved = structuredClone(asset);
for (const key of ["src", "width", "height", "contentHash", "imageFit", "brandId"]) delete approved[key];
// A pilot-local handle avoids colliding with the base catalog's approved asset.
approved.id = "imagefit-dripper";
const source = {
  schemaVersion: 1,
  pilot: { id: pilotId, label: "Synthetic image-fit contract", status: "preview", note: "Synthetic contract fixture; no owner adoption claim." },
  brand: { ...BASE_CATALOG.brands[brandId], id: pilotId },
  fixture: { id: pilotId, label: "Synthetic image-fit contract", description: fixture.description, brief },
  assets: [{ ...approved, file: `public${src}` }],
};
assert.equal(sha(fs.readFileSync(path.resolve(source.assets[0].file))), contentHash);
const report = {
  sourceSha: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  sourceDirty: execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim(),
  observationOnly: cli.observe, pilotRoot, assetHash: contentHash, briefHash: sha(JSON.stringify(brief)), cases: [],
};
for (const fit of ["contain", "cover", "omitted"]) {
  const input = structuredClone(source);
  if (fit !== "omitted") input.assets[0].imageFit = fit;
  const check = validatePilotSource(input, { pilotId });
  assert.ok(check.ok, JSON.stringify(check));
  fs.writeFileSync(path.join(pilotDir, "pilot.json"), JSON.stringify(input, null, 2) + "\n");
  const loaded = spawnSync(process.execPath, ["--experimental-strip-types", "scripts/load-campaign-lab-pilot.mjs", "--pilot", pilotId, "--pilot-dir", pilotRoot], { encoding: "utf8" });
  assert.equal(loaded.status, 0, loaded.stderr + loaded.stdout);
  const manifest = JSON.parse(fs.readFileSync(path.join(pilotDir, "manifest.json"), "utf8"));
  const runtime = validatePilotManifest(manifest, { pilotId });
  assert.ok(runtime.ok);
  const effective = resolveCampaignImage(runtime.value.assets[0], runtime.value.brand.tokens);
  const entry = { fit, normalizedFit: check.value.assets[0].imageFit ?? null, runtimeFit: manifest.assets[0].imageFit ?? null, effective, assetHash: manifest.assets[0].contentHash };
  report.cases.push(entry);
  save(`${fit}-source.json`, input); save(`${fit}-normalized.json`, check.value); save(`${fit}-manifest.json`, manifest);
  fs.writeFileSync(path.join(out, `${fit}-loader.log`), loaded.stdout + loaded.stderr);
  if (!cli.observe) {
    assert.equal(check.value.assets[0].imageFit, fit === "omitted" ? undefined : fit);
    assert.equal(manifest.assets[0].imageFit, fit === "omitted" ? undefined : fit);
    assert.deepEqual(effective, { fit: fit === "cover" ? "cover" : "contain", frame: fit === "cover" ? "compact" : "natural-arch" });
    assert.equal(entry.assetHash, contentHash);
    const copied = path.join(pilotDir, "assets", path.basename(manifest.assets[0].src));
    assert.equal(sha(fs.readFileSync(copied)), contentHash);
  }
}
const manifestFile = path.join(pilotDir, "manifest.json"), validBytes = fs.readFileSync(manifestFile);
const invalidRuntime = JSON.parse(validBytes); invalidRuntime.assets[0].imageFit = "stretch";
const invalidCheck = validatePilotManifest(invalidRuntime, { pilotId });
report.invalidRuntime = { accepted: invalidCheck.ok, issues: invalidCheck.ok ? [] : invalidCheck.issues, ...(invalidCheck.ok ? { effective: resolveCampaignImage(invalidCheck.value.assets[0], invalidCheck.value.brand.tokens) } : {}) };
save("invalid-runtime.json", invalidRuntime);
if (!cli.observe) {
  assert.equal(invalidCheck.ok, false);
  const invalidSource = structuredClone(source); invalidSource.assets[0].imageFit = "stretch";
  fs.writeFileSync(path.join(pilotDir, "pilot.json"), JSON.stringify(invalidSource));
  const failed = spawnSync(process.execPath, ["--experimental-strip-types", "scripts/load-campaign-lab-pilot.mjs", "--pilot", pilotId, "--pilot-dir", pilotRoot], { encoding: "utf8" });
  assert.equal(failed.status, 2);
  assert.match(failed.stdout + failed.stderr, /imageFit.*contain.*cover/);
  assert.deepEqual(fs.readFileSync(manifestFile), validBytes, "Invalid source preserves last valid manifest");
  report.invalidSource = { status: failed.status, preservedManifestHash: sha(validBytes) };
  fs.writeFileSync(path.join(out, "invalid-source-loader.log"), failed.stdout + failed.stderr);
  fs.writeFileSync(path.join(pilotDir, "pilot.json"), fs.readFileSync(path.join(out, "omitted-source.json")));
}
save("report.json", report);
if (cli.url) {
  assert.equal(cli.observe, false, "Browser verification requires corrected boundaries");
  const playwright = process.env.CAMPAIGN_LAB_PLAYWRIGHT || "C:/Users/joser/AppData/Local/Temp/opencode/playwright-tools/node_modules/playwright/index.mjs";
  const { chromium } = await import(pathToFileURL(playwright).href);
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CAMPAIGN_LAB_CHROMIUM || "C:/Program Files/Google/Chrome/Application/chrome.exe" });
  report.browser = { version: browser.version(), physicalDevice: false, exports: [], externalRequests: [] };
  const widths = [320, 375, 768, 1440];
  const snapshot = page => page.locator("article").evaluate(article => {
    const canonical = article.cloneNode(true); canonical.querySelectorAll("style,[data-ornigami-motion-ui]").forEach(e => e.remove());
    const img = article.querySelector("figure img"), figure = img.closest("figure");
    return { text: canonical.textContent.replace(/\s+/g, " ").trim(), fit: getComputedStyle(img).objectFit,
      maxHeight: getComputedStyle(figure).maxHeight, imageMaxHeight: getComputedStyle(article).getPropertyValue("--cp-image-max-height").trim(),
      frame: { width: figure.clientWidth, height: figure.clientHeight }, alt: img.alt, loaded: img.complete && img.naturalWidth > 0,
      overflow: document.documentElement.scrollWidth > innerWidth + 1 || article.scrollWidth > article.clientWidth + 1,
      links: [...article.querySelectorAll("a")].map(a => a.href) };
  });
  const revisions = {};
  let fixedText;
  try {
    // An invalid runtime manifest is refused by the actual Next server loader.
    try {
      fs.writeFileSync(manifestFile, JSON.stringify(invalidRuntime));
      const rejectedPage = await browser.newPage();
      await rejectedPage.goto(`${cli.url}/campaign-lab?fixture=${pilotId}`, { waitUntil: "networkidle", timeout: 120000 });
      assert.equal(await rejectedPage.locator(`section[data-fixture="${pilotId}"]`).count(), 0);
      assert.equal((await rejectedPage.request.get(`${cli.url}${invalidRuntime.assets[0].src}`)).status(), 404);
      assert.equal((await rejectedPage.request.post(`${cli.url}/api/campaign-lab/generate`, { data: { fixtureId: pilotId, values: {} } })).status(), 400);
      report.invalidRuntime.serverLoaderRejected = true;
      await rejectedPage.close();
    } finally { fs.writeFileSync(manifestFile, validBytes); }
    for (const fit of ["contain", "cover", "omitted"]) {
      fs.writeFileSync(path.join(pilotDir, "pilot.json"), fs.readFileSync(path.join(out, `${fit}-source.json`)));
      const loaded = spawnSync(process.execPath, ["--experimental-strip-types", "scripts/load-campaign-lab-pilot.mjs", "--pilot", pilotId, "--pilot-dir", pilotRoot], { encoding: "utf8" });
      assert.equal(loaded.status, 0, loaded.stdout + loaded.stderr);
      const expected = report.cases.find(c => c.fit === fit).effective;
      for (const recipe of ["none", "product-inspect"]) {
        const dir = path.join(out, `${fit}-${recipe}`); fs.mkdirSync(dir, { recursive: true });
        const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
        await page.goto(`${cli.url}/campaign-lab?fixture=${pilotId}`, { waitUntil: "networkidle", timeout: 120000 });
        assert.equal(await page.locator(`section[data-fixture="${pilotId}"]`).count(), 1);
        await page.getByLabel("Experimental presentation", { exact: true }).selectOption(recipe);
        const responsePromise = page.waitForResponse(r => r.url().endsWith("/api/campaign-lab/generate") && r.request().method() === "POST");
        await page.getByRole("button", { name: "Generate preview", exact: true }).click();
        const result = await (await responsePromise).json();
        assert.ok(result.ok, JSON.stringify(result)); assert.equal(result.generation.provider, "local-test");
        assert.equal(result.generation.status, "generated");
        assert.equal(result.preview.asset.imageFit, fit === "omitted" ? undefined : fit);
        fs.writeFileSync(path.join(dir, "generation.json"), JSON.stringify(result, null, 2));
        await page.waitForFunction(() => document.querySelector('section[data-fixture]')?.getAttribute('data-dirty') !== 'true');
        await page.getByRole("button", { name: "Approve preview locally", exact: true }).click();
        await page.waitForSelector('[data-local-preview-approval="true"]');
        const revision = await page.locator('section[data-fixture]').getAttribute("data-revision");
        revisions[`${fit}-${recipe}`] = revision;
        const entry = { fit, recipe, revision, effective: expected, generationProvider: result.generation.provider, editor: [], offline: [] };
        for (const width of widths) {
          await page.setViewportSize({ width, height: 1000 });
          const state = await snapshot(page);
          assert.equal(state.fit, expected.fit); assert.equal(state.imageMaxHeight, expected.frame === "natural-arch" ? "none" : "330px");
          assert.ok(state.loaded && !state.overflow, JSON.stringify(state));
          assert.ok(state.links.every(url => url === brief.destinationUrl));
          assert.ok(state.text.includes(brief.offer));
          fixedText ??= state.text; assert.equal(state.text, fixedText);
          entry.editor.push({ width, ...state });
          await page.locator("article").screenshot({ path: path.join(dir, `editor-${width}.png`), style: "nextjs-portal{display:none!important}" });
        }
        const downloading = page.waitForEvent("download");
        await page.getByRole("button", { name: "Export approved page", exact: true }).click();
        await (await downloading).saveAs(path.join(dir, "campaign.zip"));
        const bundle = path.join(dir, "bundle"); fs.mkdirSync(bundle, { recursive: true });
        execFileSync("tar", ["-xf", path.join(dir, "campaign.zip"), "-C", bundle]);
        const receipt = JSON.parse(fs.readFileSync(path.join(bundle, "receipt.json")));
        const html = fs.readFileSync(path.join(bundle, "index.html"), "utf8"), css = fs.readFileSync(path.join(bundle, "styles.css"), "utf8");
        assertHtmlReceiptAgreement(html, receipt); auditArchiveReferences(html, css, receipt.files.map(f => f.path));
        assert.deepEqual(receipt.preview.imagePresentation, expected);
        assert.equal(receipt.approval.revision, revision); assert.equal(receipt.approval.renderedRevision, revision);
        assert.equal(sha(fs.readFileSync(path.join(bundle, receipt.asset.file))), contentHash);
        for (const file of receipt.files) assert.equal(sha(fs.readFileSync(path.join(bundle, file.path))), file.sha256);
        for (const width of widths) {
          const context = await browser.newContext({ viewport: { width, height: 1000 }, serviceWorkers: "block" });
          await context.setOffline(true); const offline = await context.newPage();
          offline.on("request", r => { if (/^https?:/.test(r.url())) report.browser.externalRequests.push(r.url()); });
          await offline.goto(pathToFileURL(path.join(bundle, "index.html")).href, { waitUntil: "load" });
          const state = await snapshot(offline);
          assert.equal(state.fit, expected.fit); assert.equal(state.imageMaxHeight, expected.frame === "natural-arch" ? "none" : "330px");
          assert.equal(state.text, entry.editor.find(e => e.width === width).text);
          assert.ok(state.loaded && !state.overflow);
          if (recipe === "product-inspect") {
            const trigger = offline.getByRole("button", { name: "Inspect product", exact: true });
            await trigger.focus(); await offline.keyboard.press("Enter");
            await offline.getByRole("dialog", { name: "Product inspection" }).waitFor();
            assert.equal(await offline.locator("dialog img").evaluate(i => i.naturalWidth), asset.width);
            await offline.keyboard.press("Escape"); assert.ok(await trigger.evaluate(e => document.activeElement === e));
          }
          entry.offline.push({ width, ...state });
          await offline.locator("article").screenshot({ path: path.join(dir, `offline-${width}.png`) });
          await context.close();
        }
        // A presentation edit invalidates this exact approval; no reapproval occurs here.
        await page.getByLabel("Experimental presentation", { exact: true }).selectOption(recipe === "none" ? "product-inspect" : "none");
        assert.equal(await page.getByRole("button", { name: "Export approved page", exact: true }).isEnabled(), false);
        entry.approvalInvalidatedByEdit = true; report.browser.exports.push(entry); save("report.json", report);
        await page.close();
      }
    }
    for (const recipe of ["none", "product-inspect"]) {
      assert.notEqual(revisions[`contain-${recipe}`], revisions[`cover-${recipe}`]);
      assert.equal(revisions[`contain-${recipe}`], revisions[`omitted-${recipe}`]);
    }
    assert.equal(report.browser.externalRequests.length, 0);
    report.browser.revisionChecksPassed = true;
    fs.writeFileSync(path.join(out, "index.html"), `<!doctype html><html lang="en"><meta charset="utf-8"><title>Image-fit contract round trip</title><style>body{font:18px system-ui;max-width:72rem;margin:2rem auto;padding:1rem}table{border-collapse:collapse}td,th{padding:1rem;border:1px solid #bbb}img{max-width:300px;vertical-align:top}</style><h1>Synthetic image-fit contract round trip</h1><p>One approved Morrow image and fixed commercial brief. Local test provider, fresh local approval, offline exports. Cover intentionally crops the image; these are contract results, not quality scores.</p><p><a href="report.json">Full report</a></p><table><tr><th>Source choice</th><th>Static</th><th>Inspection</th></tr>${["contain", "cover", "omitted"].map(fit => `<tr><th>${fit}</th>${["none", "product-inspect"].map(recipe => `<td><a href="${fit}-${recipe}/bundle/index.html">Standalone page</a> · <a href="${fit}-${recipe}/campaign.zip">ZIP</a> · <a href="${fit}-${recipe}/bundle/receipt.json">Receipt</a><p><a href="${fit}-${recipe}/offline-768.png"><img alt="${fit} ${recipe} at 768px" src="${fit}-${recipe}/offline-768.png"></a></p></td>`).join("")}</tr>`).join("")}</table></html>`);
  } finally { await browser.close(); save("report.json", report); }
}
report.status = cli.observe ? "observed" : "passed";
save("report.json", report);
console.log(JSON.stringify(report, null, 2));
