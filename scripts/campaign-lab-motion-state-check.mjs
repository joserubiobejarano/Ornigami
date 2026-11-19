#!/usr/bin/env node
/** Actual editor transaction regression. The delayed fetch mock deliberately
 * ignores AbortSignal so stale results reach the real request-gate handler. */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import { BASE_CATALOG, CAMPAIGN_FIXTURES, createFormValues } from "../src/lib/campaign-lab/fixtures.ts";
import { buildCampaignPreview } from "../src/lib/campaign-lab/template.ts";

const { values: cli } = parseArgs({ options: { url: { type: "string", default: "http://127.0.0.1:3150" }, out: { type: "string", default: ".local/motion-reuse/state" }, observe: { type: "boolean", default: false } } });
const out = path.resolve(cli.out); fs.mkdirSync(out, { recursive: true });
const { chromium } = await import(pathToFileURL(process.env.CAMPAIGN_LAB_PLAYWRIGHT || "C:/Users/joser/AppData/Local/Temp/opencode/playwright-tools/node_modules/playwright/index.mjs").href);
const browser = await chromium.launch({ executablePath: process.env.CAMPAIGN_LAB_CHROMIUM || "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
const report = { sourceSha: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(), mock: "Controlled local fetch responses, deliberately ignoring abort; no provider or API request", observeOnly: cli.observe, checks: [], snapshots: {}, failure: null };
const fixture = CAMPAIGN_FIXTURES.sparse, values = createFormValues(fixture);
const built = buildCampaignPreview(fixture, values, BASE_CATALOG); assert.ok(built.ok);
const generation = { status: "fallback", provider: "deterministic", providerLabel: "Controlled test", providerMode: "none", code: "unavailable", message: "Controlled valid result", harnessVersion: "1.0.0", guidancePackVersion: "1.0.0" };
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  await page.addInitScript(() => {
    window.__generationQueue = [];
    const actual = window.fetch;
    window.fetch = (input, options) => {
      if (String(input) !== "/api/campaign-lab/generate") return actual(input, options);
      return new Promise(resolve => window.__generationQueue.push({ resolve, request: JSON.parse(options.body) }));
    };
  });
  await page.goto(cli.url + "/campaign-lab?fixture=sparse", { waitUntil: "networkidle", timeout: 120000 });
  await page.waitForFunction(() => [...document.images].every(i => i.complete && i.naturalWidth > 0));
  const snapshot = async name => {
    await page.waitForTimeout(80);
    const state = await page.locator('section[data-fixture]').evaluate(section => ({ revision: section.dataset.revision, article: section.querySelector("article").outerHTML, inspectors: section.querySelectorAll(".ornigami-inspect-trigger").length, generation: section.dataset.generationStatus }));
    report.snapshots[name] = state;
    await page.locator("article").screenshot({ path: path.join(out, name + ".png"), style: "nextjs-portal{display:none!important}" });
    return state;
  };
  const check = (name, passed) => { report.checks.push({ name, passed }); if (!cli.observe) assert.ok(passed, name); };
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const start = async () => { await page.getByRole("button", { name: "Generate preview", exact: true }).click(); await page.waitForFunction(() => window.__generationQueue.length === 1); };
  const release = async (status, body) => {
    await page.evaluate(({ status, body }) => { const pending = window.__generationQueue.shift(); pending.resolve(new Response(JSON.stringify({ ...body, requestId: pending.request.requestId }), { status, headers: { "content-type": "application/json" } })); }, { status, body });
    await page.waitForTimeout(150);
  };
  const locked = async () => !(await page.getByRole("button", { name: "Export approved page", exact: true }).isEnabled());
  const base = await snapshot("last-valid-static");
  await page.getByRole("button", { name: "Approve preview locally", exact: true }).click();
  await page.getByLabel("Experimental presentation", { exact: true }).selectOption("product-inspect");
  await start(); check("pending retains complete last valid preview", same(base, await snapshot("pending-rejected-request")));
  await release(422, { ok: false, issues: [{ field: "offer", message: "Controlled server validation rejection" }] });
  check("rejection retains article, recipe, revision and runtime", same(base, await snapshot("after-server-rejection")));
  check("rejection keeps selection pending and export locked", await locked() && await page.getByLabel("Experimental presentation", { exact: true }).inputValue() === "product-inspect");
  await start();
  await page.getByLabel("Offer", { exact: true }).fill(values.offer + " pending edit");
  check("edit during request retains complete last valid preview", same(base, await snapshot("edited-during-request")));
  await release(200, { ok: true, preview: built.preview, generation });
  check("stale result cannot commit either preview or recipe", same(base, await snapshot("after-stale-response")));
  check("stale result leaves export locked", await locked());
  await page.getByLabel("Offer", { exact: true }).fill(values.offer);
  await start(); check("fallback stays pending before acceptance", same(base, await snapshot("pending-valid-fallback")));
  await release(503, { ok: false, message: "Controlled unavailable transport; use validated local fallback" });
  const accepted = await snapshot("accepted-local-fallback");
  check("valid fallback commits captured recipe and result together", accepted.inspectors === 1 && accepted.revision !== base.revision);
  check("accepted fallback still requires fresh approval", await locked());
  await page.getByRole("button", { name: "Inspect product", exact: true }).click(); await page.keyboard.press("Escape");
  check("last accepted runtime works", await page.getByRole("button", { name: "Inspect product", exact: true }).evaluate(e => e === document.activeElement));
  const lastInspection = await snapshot("last-valid-inspection");
  await page.getByLabel("Experimental presentation", { exact: true }).selectOption("none");
  await start(); check("pending static retains complete accepted inspection", same(lastInspection, await snapshot("pending-static-rejection")));
  await release(422, { ok: false, issues: [{ field: "offer", message: "Controlled second rejection" }] });
  check("rejection also preserves complete inspection preview", same(lastInspection, await snapshot("after-inspection-rejection")));
  await start();
  await release(200, { ok: true, preview: built.preview, generation });
  const success = await snapshot("accepted-current-result");
  check("current result commits captured static recipe", success.inspectors === 0 && success.revision === base.revision);
  await page.getByLabel("Experimental presentation", { exact: true }).selectOption("product-inspect");
  await page.getByLabel("Offer", { exact: true }).fill(""); await page.getByRole("button", { name: "Generate preview", exact: true }).click();
  check("local validation also preserves complete accepted preview", same(success, await snapshot("after-local-rejection")));
  await page.close();
} catch (error) { report.failure = error.stack; process.exitCode = 1; }
finally { fs.writeFileSync(path.join(out, "report.json"), JSON.stringify(report, null, 2) + "\n"); await browser.close(); console.log(JSON.stringify({ checks: report.checks, failure: report.failure, out }, null, 2)); }
