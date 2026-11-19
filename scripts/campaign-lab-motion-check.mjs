#!/usr/bin/env node
/** Bounded offline motion experiment. Run with --experimental-strip-types.
 * Uses the existing editor, deterministic builder, approval and ZIP export.
 * No provider endpoint is contacted: generation is intercepted with a frozen
 * validated synthetic preview. Exported pages are then tested under file://. */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { BASE_CATALOG, CAMPAIGN_FIXTURES, createFormValues } from "../src/lib/campaign-lab/fixtures.ts";
import { buildCampaignPreview } from "../src/lib/campaign-lab/template.ts";
import { assertHtmlReceiptAgreement, auditArchiveReferences } from "../src/lib/campaign-lab/export.ts";

const { values: cli } = parseArgs({ options: { url: { type: "string", default: "http://127.0.0.1:3140" }, out: { type: "string", default: ".local/motion-experiment/verification" } } });
const root = process.cwd(), out = path.resolve(cli.out);
fs.mkdirSync(out, { recursive: true });
const sha = value => createHash("sha256").update(value).digest("hex");
const save = (name, data) => fs.writeFileSync(path.join(out, name), JSON.stringify(data, null, 2) + "\n");
const fixture = CAMPAIGN_FIXTURES.sparse, values = createFormValues(fixture);
const built = buildCampaignPreview(fixture, values, BASE_CATALOG);
assert.ok(built.ok);
const frozen = built.preview;
save("frozen.json", { fixture, values, profile: frozen.theme, brief: frozen.brief, draft: frozen.draft, asset: frozen.asset,
  hashes: { brief: sha(JSON.stringify(frozen.brief)), profile: sha(JSON.stringify(frozen.theme)), draft: sha(JSON.stringify(frozen.draft)), packshot: frozen.asset.contentHash } });
const candidate = [process.env.CAMPAIGN_LAB_PLAYWRIGHT, path.join(root, "scripts/framework-prototype/browser-tools/node_modules/playwright/index.mjs"), "C:/Users/joser/AppData/Local/Temp/opencode/playwright-tools/node_modules/playwright/index.mjs"].find(p => p && fs.existsSync(p));
const { chromium } = await import(candidate ? pathToFileURL(candidate).href : "playwright");
const executablePath = process.env.CAMPAIGN_LAB_CHROMIUM || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const browser = await chromium.launch({ headless: true, executablePath });
const recipes = ["none", "quiet-product", "product-inspect"], widths = [320, 375, 768, 1440];
const report = { sourceSha: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(), sourceDirty: execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim(), environment: { node: process.version, platform: process.platform, browser: browser.version(), executablePath, physicalDevice: false, performance: "One local run per viewport/mode; unthrottled, not a field benchmark" }, editor: [], exports: [], checks: [], playback: [], requests: [], failures: [] };
function check(name, passed, details = {}) { report.checks.push({ name, passed: Boolean(passed), ...details }); if (!passed) throw Error(name); }
async function content(page) {
  return page.locator("article").evaluate(article => {
    const canonical = article.cloneNode(true);
    canonical.querySelectorAll("style,[data-ornigami-motion-ui]").forEach(e => e.remove());
    return { canonicalText: canonical.textContent.replace(/\s+/g, " ").trim(), text: article.innerText, headline: article.querySelector("h1")?.textContent, offer: article.querySelector('[data-role="offer"]')?.textContent, links: [...article.querySelectorAll("a")].map(a => ({ text: a.textContent, href: a.href })), images: [...article.querySelectorAll("figure img")].map(i => ({ alt: i.alt, width: i.naturalWidth, loaded: i.complete && i.naturalWidth > 0 })), overflow: article.scrollWidth > article.clientWidth + 1 || document.documentElement.scrollWidth > innerWidth + 1 };
  });
}
async function capture(page, file) { await page.locator("article").screenshot({ path: file, style: "nextjs-portal { display:none!important }" }); }
async function approve(page) { await page.getByRole("button", { name: "Approve preview locally", exact: true }).click(); await page.waitForSelector('[data-local-preview-approval="true"]'); }
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.route("**/api/campaign-lab/generate", async route => {
    const request = route.request().postDataJSON();
    assert.equal(request.fixtureId, fixture.id);
    await route.fulfill({ json: { ok: true, preview: frozen, requestId: request.requestId, generation: { status: "fallback", provider: "deterministic", providerLabel: "Frozen synthetic reference", providerMode: "none", code: "unavailable", message: "Offline motion comparison; no provider call.", harnessVersion: "1.0.0", guidancePackVersion: "1.0.0" } } });
  });
  await page.goto(`${cli.url}/campaign-lab?fixture=sparse`, { waitUntil: "networkidle", timeout: 120000 });
  await page.waitForFunction(() => [...document.images].every(i => i.complete && i.naturalWidth > 0));
  let previousRevision, fixedText;
  for (const recipe of recipes) {
    const dir = path.join(out, recipe); fs.mkdirSync(dir, { recursive: true });
    await page.getByLabel("Experimental presentation", { exact: true }).selectOption(recipe);
    if (previousRevision) check("recipe edit locks export", !(await page.getByRole("button", { name: "Export approved page", exact: true }).isEnabled()), { recipe });
    await page.getByRole("button", { name: "Generate preview", exact: true }).click();
    await page.waitForSelector('section[data-generation-status="fallback"]');
    await page.waitForFunction(() => document.querySelector('section[data-fixture]')?.getAttribute('data-dirty') !== 'true');
    await page.waitForTimeout(200);
    const revision = await page.locator('section[data-fixture]').getAttribute('data-revision');
    check("regeneration requires approval", !(await page.getByRole("button", { name: "Export approved page", exact: true }).isEnabled()), { recipe });
    if (previousRevision) check("presentation changes revision", previousRevision !== revision, { recipe });
    await approve(page);
    if (recipe === "quiet-product") {
      // Hold the packshot fetch after the synchronous export snapshot, then edit.
      let release, observed; const held = new Promise(r => { release = r; });
      const started = new Promise(r => { observed = r; }); let downloads = 0;
      const countDownload = () => { downloads++; }; page.on("download", countDownload);
      const assetUrl = new URL(frozen.asset.src, cli.url).href;
      await page.route(assetUrl, async route => { observed(); await held; await route.continue().catch(() => {}); });
      await page.getByRole("button", { name: "Export approved page", exact: true }).click();
      await Promise.race([started, new Promise((_, reject) => setTimeout(() => reject(Error("export fetch did not begin")), 15000))]);
      await page.getByLabel("Experimental presentation", { exact: true }).selectOption("none"); release();
      await page.waitForTimeout(400); await page.unroute(assetUrl); page.removeListener("download", countDownload);
      check("recipe edit cancels an in-flight export", downloads === 0 && !(await page.getByRole("button", { name: "Export approved page", exact: true }).isEnabled()));
      await page.getByLabel("Experimental presentation", { exact: true }).selectOption(recipe);
      await page.getByRole("button", { name: "Generate preview", exact: true }).click(); await page.waitForTimeout(250); await approve(page);
    }
    for (const width of widths) {
      await page.setViewportSize({ width, height: 1000 }); await page.waitForTimeout(300);
      const state = await content(page);
      fixedText ??= state.canonicalText;
      check("exact canonical editor content", state.canonicalText === fixedText, { recipe, width });
      check("editor fixed content and no overflow", !state.overflow && state.headline === frozen.draft.headline && state.images.every(i => i.loaded && i.alt === frozen.asset.alt) && state.links.every(a => a.href === frozen.brief.destinationUrl), { recipe, width });
      await capture(page, path.join(dir, `editor-${width}.png`));
    }
    // Snapshot while inspection is open and enlarged: owned UI must not leak.
    if (recipe === "product-inspect") {
      await page.getByRole("button", { name: "Inspect product", exact: true }).click();
      await page.getByRole("button", { name: "Enlarge image", exact: true }).click();
    }
    const downloadPromise = page.waitForEvent("download");
    if (recipe === "product-inspect") {
      // The native modal intentionally blocks editor pointer input. Invoke the
      // real export button handler to test a snapshot during enlarged inspection.
      await page.getByRole("button", { name: "Export approved page", exact: true }).evaluate(e => e.click());
    } else await page.getByRole("button", { name: "Export approved page", exact: true }).click();
    const download = await downloadPromise, zip = path.join(dir, "campaign.zip"), bundle = path.join(dir, "bundle");
    await download.saveAs(zip); fs.mkdirSync(bundle, { recursive: true }); execFileSync("tar", ["-xf", zip, "-C", bundle]);
    if (recipe === "product-inspect") {
      await page.keyboard.press("Escape");
      check("editor inspection restores focus", await page.getByRole("button", { name: "Inspect product", exact: true }).evaluate(e => document.activeElement === e));
    }
    const receipt = JSON.parse(fs.readFileSync(path.join(bundle, "receipt.json"), "utf8"));
    const html = fs.readFileSync(path.join(bundle, "index.html"), "utf8"), css = fs.readFileSync(path.join(bundle, "styles.css"), "utf8");
    assertHtmlReceiptAgreement(html, receipt);
    check("recipe and approval receipt agree", receipt.preview.motion.recipe === recipe && receipt.approval.revision === revision && receipt.approval.renderedRevision === revision, { recipe, revision });
    check("same exact packshot bytes", sha(fs.readFileSync(path.join(bundle, receipt.asset.file))) === frozen.asset.contentHash, { recipe });
    check("canonical export excludes transient UI", !/<dialog|data-ornigami|ornigami-inspect-trigger/.test(html), { recipe });
    if (recipe !== "none") check("owned styles are packaged exactly once", css.split(".ornigami-inspector::backdrop").length === 2, { recipe });
    auditArchiveReferences(html, css, receipt.files.map(f => f.path));
    for (const file of receipt.files) check("receipt file hash", sha(fs.readFileSync(path.join(bundle, file.path))) === file.sha256, { recipe, file: file.path });
    check("only owned runtime packaged", recipe === "none" ? !/<script/.test(html) : receipt.files.some(f => f.path === "motion.js"), { recipe });
    report.editor.push({ recipe, revision, receipt: path.relative(out, path.join(bundle, "receipt.json")) });
    const bytes = fs.readFileSync(zip);
    report.exports.push({ recipe, zip: path.relative(out, zip), bundle: path.relative(out, bundle), zipBytes: bytes.length, gzipArchiveBytes: gzipSync(bytes).length, contentBytes: receipt.files.reduce((n, f) => n + f.bytes, 0), runtimeBytes: receipt.files.find(f => f.path === "motion.js")?.bytes ?? 0 });
    previousRevision = revision;
  }
  await page.close();

  for (const recipe of recipes) for (const mode of ["normal", "reduced", "no-js", "init-failure"]) for (const width of widths) {
    const dir = path.join(out, recipe), bundle = path.join(dir, "bundle"), file = pathToFileURL(path.join(bundle, "index.html")).href;
    const trace = mode === "normal" && width === 375;
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: mode === "reduced" ? "reduce" : "no-preference", javaScriptEnabled: mode !== "no-js", serviceWorkers: "block" });
    if (trace) await context.tracing.start({ screenshots: true, snapshots: true });
    await context.setOffline(true);
    await context.addInitScript(({ fail }) => {
      window.__motionEvents = []; window.__layoutShift = 0;
      new PerformanceObserver(list => { for (const e of list.getEntries()) if (!e.hadRecentInput) window.__layoutShift += e.value; }).observe({ type: "layout-shift", buffered: true });
      const original = Element.prototype.animate;
      Element.prototype.animate = function (...args) {
        if (fail) throw Error("Simulated animation initialization failure");
        const animation = original.apply(this, args);
        window.__motionEvents.push({ state: "start", time: performance.now(), duration: animation.effect.getTiming().duration });
        animation.addEventListener("finish", () => window.__motionEvents.push({ state: "finish", time: performance.now() }));
        animation.addEventListener("cancel", () => window.__motionEvents.push({ state: "cancel", time: performance.now() }));
        return animation;
      };
      if (fail) HTMLDialogElement.prototype.showModal = () => { throw Error("Simulated dialog initialization failure"); };
    }, { fail: mode === "init-failure" });
    const exported = await context.newPage(); const errors = [], external = [];
    exported.on("pageerror", e => errors.push(e.message)); exported.on("request", req => { if (/^https?:/.test(req.url())) external.push(req.url()); });
    await exported.goto(file, { waitUntil: "load" });
    if (recipe === "quiet-product" && mode === "normal") await exported.waitForFunction(() => document.querySelector("article").dataset.motionState === "settled");
    await exported.waitForTimeout(80);
    let state = await content(exported);
    check("exact canonical export content", state.canonicalText === fixedText, { recipe, mode, width });
    const receipt = JSON.parse(fs.readFileSync(path.join(bundle, "receipt.json"), "utf8"));
    check("offline content parity", state.headline === frozen.draft.headline && state.links.every(a => a.href === frozen.brief.destinationUrl) && state.images.every(i => i.loaded && i.alt === frozen.asset.alt) && !state.overflow && (await exported.locator("body").innerText()).includes(frozen.brief.offer), { recipe, mode, width });
    const metrics = await exported.evaluate(() => ({ events: window.__motionEvents ?? [], cls: window.__layoutShift ?? null, dclMs: performance.getEntriesByType("navigation")[0]?.domContentLoadedEventEnd }));
    if (recipe === "quiet-product" && mode === "normal") check("actual one-shot playback", metrics.events.filter(e => e.state === "start").length === 1 && metrics.events.some(e => e.state === "finish"), { width, metrics });
    if (mode === "reduced") check("reduced motion has no entrance", metrics.events.length === 0, { recipe, width });
    await capture(exported, path.join(dir, `offline-${mode}-${width}.png`));
    await exported.locator("article a").first().focus();
    check("CTA remains keyboard focusable", await exported.locator("article a").first().evaluate(a => document.activeElement === a), { recipe, mode, width });
    if (recipe === "product-inspect" && mode !== "no-js") {
      const trigger = exported.getByRole("button", { name: "Inspect product", exact: true });
      if (mode === "init-failure") {
        await trigger.click(); check("failed inspection removes dead control", await trigger.count() === 0 && await exported.locator("dialog[open]").count() === 0, { width });
      } else {
        for (let cycle = 0; cycle < 3; cycle++) {
          await trigger.focus(); await exported.keyboard.press("Enter");
          await exported.getByRole("dialog", { name: "Product inspection" }).waitFor();
          for (let n = 0; n < 5; n++) await exported.keyboard.press("Tab");
          check("native modal traps focus", await exported.locator("dialog").evaluate(d => d.contains(document.activeElement)), { width, mode, cycle });
          await exported.getByRole("button", { name: "Enlarge image", exact: true }).click();
          const panBefore = await exported.locator(".ornigami-inspect-pane").evaluate(p => ({ x: p.scrollLeft, y: p.scrollTop }));
          await exported.getByRole("button", { name: "Inspect down", exact: true }).click();
          const panAfter = await exported.locator(".ornigami-inspect-pane").evaluate(p => p.scrollTop);
          check("non-drag inspection pans image", panAfter > panBefore.y, { width, mode });
          await exported.getByRole("button", { name: "Inspect up", exact: true }).click();
          check("inspection reuses approved image", await exported.locator("dialog img").evaluate((i, expected) => i.src.endsWith(expected) && i.naturalWidth === 1200, receipt.asset.file), { width });
          if (cycle === 0) await exported.screenshot({ path: path.join(dir, `inspection-${mode}-${width}.png`) });
          await exported.keyboard.press("Escape");
          check("Escape restores trigger focus", await trigger.evaluate(e => document.activeElement === e), { width, mode, cycle });
        }
        await trigger.click(); await exported.getByRole("button", { name: "Close inspection", exact: true }).click();
        check("close action restores focus", await trigger.evaluate(e => document.activeElement === e), { width });
        await trigger.click(); await exported.mouse.click(0, 0);
        check("backdrop dismissal restores focus", await trigger.evaluate(e => document.activeElement === e), { width });
      }
    }
    if (mode === "no-js") check("no-js retains static fallback", await exported.getByRole("button", { name: "Inspect product", exact: true }).count() === 0, { recipe, width });
    check("zero external requests and uncaught errors", external.length === 0 && errors.length === 0, { recipe, mode, width, external, errors });
    report.playback.push({ recipe, mode, width, metrics, externalRequests: external.length });
    if (trace) await context.tracing.stop({ path: path.join(dir, "playback-trace.zip") });
    await context.close();
  }
  for (const interruption of ["offscreen", "reduced-switch", "background-tab", "simulated-background"]) {
    const context = await browser.newContext({ viewport: { width: 375, height: 600 } }); await context.setOffline(true);
    const p = await context.newPage(); const background = interruption === "background-tab" ? await context.newPage() : null;
    await p.bringToFront(); await context.tracing.start({ screenshots: true, snapshots: true });
    await p.goto(pathToFileURL(path.join(out, "quiet-product/bundle/index.html")).href, { waitUntil: "domcontentloaded" });
    await p.waitForFunction(() => document.querySelector('article').dataset.motionState === "playing");
    const active = await p.locator("figure img").evaluate(e => e.getAnimations().map(a => ({ state: a.playState, time: a.currentTime, duration: a.effect.getTiming().duration })));
    check("interruption begins during real playback", active.some(a => a.state === "running"), { interruption, active });
    if (interruption === "offscreen") await p.evaluate(() => scrollTo(0, document.body.scrollHeight));
    else if (interruption === "reduced-switch") await p.emulateMedia({ reducedMotion: "reduce" });
    else if (interruption === "background-tab") {
      await background.bringToFront(); const hidden = await p.evaluate(() => document.hidden);
      report.playback.push({ interruption, documentHiddenObserved: hidden, assessed: hidden });
      if (!hidden) { await context.tracing.stop({ path: path.join(out, "quiet-product", `${interruption}-trace.zip`) }); await context.close(); continue; }
    }
    else await p.evaluate(() => { Object.defineProperty(document, "hidden", { configurable: true, get: () => true }); document.dispatchEvent(new Event("visibilitychange")); });
    await p.waitForFunction(() => document.querySelector('article').dataset.motionState === "settled");
    check("interruption cancels animation", await p.locator("figure img").evaluate(e => e.getAnimations().length) === 0, { interruption });
    await p.evaluate(() => scrollTo(0, 0)); await p.emulateMedia({ reducedMotion: "no-preference" }); await p.waitForTimeout(300);
    check("interrupted emphasis never restarts", await p.locator("figure img").evaluate(e => e.getAnimations().length) === 0, { interruption });
    await capture(p, path.join(out, "quiet-product", `${interruption}.png`));
    report.playback.push({ recipe: "quiet-product", interruption, active, backgroundObservation: interruption === "simulated-background" ? "Visibility event simulated; not a physical background-tab observation" : undefined });
    await context.tracing.stop({ path: path.join(out, "quiet-product", `${interruption}-trace.zip`) }); await context.close();
  }
  for (const recipe of ["quiet-product", "product-inspect"]) {
    const missing = path.join(out, recipe, "missing-runtime"); fs.cpSync(path.join(out, recipe, "bundle"), missing, { recursive: true });
    fs.unlinkSync(path.join(missing, "motion.js"));
    const context = await browser.newContext({ viewport: { width: 375, height: 812 } }); await context.setOffline(true); const p = await context.newPage();
    await p.goto(pathToFileURL(path.join(missing, "index.html")).href); const state = await content(p);
    check("missing runtime preserves campaign", !state.overflow && state.canonicalText === fixedText && state.images.every(i => i.loaded) && await p.getByRole("button", { name: "Inspect product", exact: true }).count() === 0, { recipe });
    await capture(p, path.join(out, recipe, "missing-runtime.png")); await context.close();
  }
  // Real touch emulation and repeated open/close, with non-drag zoom controls.
  const touch = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
  await touch.setOffline(true); const touchPage = await touch.newPage();
  await touchPage.goto(pathToFileURL(path.join(out, "product-inspect/bundle/index.html")).href);
  for (let i = 0; i < 3; i++) {
    await touchPage.getByRole("button", { name: "Inspect product", exact: true }).tap();
    await touchPage.getByRole("button", { name: "Enlarge image", exact: true }).tap();
    await touchPage.getByRole("button", { name: "Inspect down", exact: true }).tap();
    await touchPage.getByRole("button", { name: "Inspect up", exact: true }).tap();
    await touchPage.getByRole("button", { name: "Fit image", exact: true }).tap();
    await touchPage.getByRole("button", { name: "Close inspection", exact: true }).tap();
  }
  check("touch repeat activation and dismissal", await touchPage.locator("dialog[open]").count() === 0);
  await touchPage.screenshot({ path: path.join(out, "product-inspect/touch-settled.png") }); await touch.close();
  const delta = report.exports.map(e => ({ ...e, incrementalBytes: e.contentBytes - report.exports[0].contentBytes, incrementalGzipArchiveBytes: e.gzipArchiveBytes - report.exports[0].gzipArchiveBytes }));
  report.exports = delta;
  fs.writeFileSync(path.join(out, "index.html"), `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Motion experiment</title><style>body{font:16px system-ui;max-width:1100px;margin:30px auto;padding:20px}img{max-width:100%;width:280px}section{border-top:1px solid #aaa;padding:24px 0}iframe{width:100%;height:800px;border:1px solid #aaa}</style><h1>Frozen campaign: presentation comparison</h1><p>Identical synthetic brief, copy, offer, destination, facts, and packshot. Review actual playback and interaction; static is a valid winner.</p>${recipes.map(recipe => `<section><h2>${recipe}</h2><p><a href="${recipe}/bundle/index.html">Open standalone page</a> · <a href="${recipe}/campaign.zip">ZIP export</a></p><iframe title="${recipe}" src="${recipe}/bundle/index.html"></iframe><p>${widths.map(w => `<a href="${recipe}/offline-normal-${w}.png">${w}px capture</a>`).join(' · ')}</p></section>`).join('')}<p>Playback traces and all fallback/inspection captures are in each recipe directory. Verification details: <a href="report.json">report.json</a>.</p>`);
} catch (error) {
  report.failures.push({ message: error.message, stack: error.stack }); process.exitCode = 1;
} finally {
  save("report.json", report); await browser.close();
  console.log(JSON.stringify({ status: report.failures.length ? "failed" : "passed", checks: report.checks.length, failures: report.failures, out }, null, 2));
}
