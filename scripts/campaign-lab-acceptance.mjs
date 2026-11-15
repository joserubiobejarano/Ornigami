#!/usr/bin/env node
/**
 * Browser acceptance runner for Ornigami's first campaign template.
 *
 * The runner is deliberately app-agnostic: it accepts the app URL, reads the
 * approved fixture metadata from a manifest, and drives the published interface
 * (fields, Generate preview, Approve preview, Campaign preview region). It does
 * not import the route, the renderer, or any app source.
 *
 * Usage:
 *   node scripts/campaign-lab-acceptance.mjs --url http://127.0.0.1:3000 \
 *     --manifest tests/fixtures/campaign-lab/benchmark-proposal.json
 *
 * See docs/campaign-lab-acceptance.md for the integration procedure and the
 * boundary between automated and human review.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import {
  classifyApproval,
  comparableText,
  contrastRatio,
  hasApprovedMetadata,
  normalizeText,
  requiredContrast,
  safeSegment,
  sha256,
  unrelatedCopyDiff,
  validateManifest,
} from "./campaign-lab-acceptance-core.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const viewports = [
  { name: "375", width: 375, height: 812, deviceScaleFactor: 2, isMobile: true, hasTouch: true, label: "375 px mobile" },
  { name: "1440", width: 1440, height: 900, deviceScaleFactor: 1, isMobile: false, hasTouch: false, label: "1440 px desktop" },
];
const defaultManifest = path.join(root, "tests", "fixtures", "campaign-lab", "benchmark-proposal.json");
const timeoutMs = 12_000;
const settleMs = 180;

function usage() {
  return `Campaign lab acceptance

Usage:
  node scripts/campaign-lab-acceptance.mjs --url <app-url> [options]
  node scripts/campaign-lab-acceptance.mjs <app-url> [options]

Options:
  --url, -u <url>          App origin or /campaign-lab URL (required)
  --manifest, -m <file>    Approved fixture metadata JSON
                           (default: tests/fixtures/campaign-lab/benchmark-proposal.json)
  --out, -o <dir>          Artifact directory (default: .local/campaign-lab-acceptance/<timestamp>)
  --require-approved       Treat pending fixture-metadata checks as failures
  --only <fixture>         Run one fixture name (repeatable, comma-separated)
  --headed                 Show the browser window
  --help, -h               Show this help

Exit codes: 0 pass (pending allowed unless --require-approved), 1 failed checks,
2 setup/target/manifest error.`;
}

function parseCli() {
  const parsed = parseArgs({
    allowPositionals: true,
    options: {
      url: { type: "string", short: "u" },
      manifest: { type: "string", short: "m" },
      out: { type: "string", short: "o" },
      "require-approved": { type: "boolean", default: false },
      only: { type: "string", multiple: true },
      headed: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
  });
  if (parsed.values.help) {
    console.log(usage());
    process.exit(0);
  }
  const url = parsed.values.url ?? parsed.positionals[0];
  if (!url) throw new Error("--url is required. Pass the app origin or /campaign-lab URL.");
  if (parsed.positionals.length > 1) throw new Error("Only one app URL may be passed.");
  return {
    url,
    manifest: parsed.values.manifest ? path.resolve(parsed.values.manifest) : defaultManifest,
    out: parsed.values.out ? path.resolve(parsed.values.out) : null,
    requireApproved: parsed.values["require-approved"],
    only: (parsed.values.only ?? []).flatMap((value) => value.split(",")).map((value) => value.trim()).filter(Boolean),
    headed: parsed.values.headed,
  };
}

async function loadPlaywright() {
  const candidates = [
    process.env.CAMPAIGN_LAB_PLAYWRIGHT,
    path.join(root, "scripts", "framework-prototype", "browser-tools", "node_modules", "playwright", "index.mjs"),
    path.join(root, ".a20-fixture", "mobile-performance-tools", "node_modules", "playwright", "index.mjs"),
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue;
    return { module: await import(pathToFileURL(candidate).href), source: candidate };
  }
  try {
    return { module: await import("playwright"), source: "playwright (resolved package)" };
  } catch {
    throw new Error(
      "Playwright is not installed. Install the repository browser tooling:\n" +
      "  npm ci --prefix scripts/framework-prototype/browser-tools\n" +
      "  node scripts/framework-prototype/browser-tools/node_modules/playwright/cli.js install chromium\n" +
      "or set CAMPAIGN_LAB_PLAYWRIGHT to playwright/index.mjs.",
    );
  }
}

function resolveChromiumExecutable(chromium) {
  if (process.env.CAMPAIGN_LAB_CHROMIUM) {
    if (!existsSync(process.env.CAMPAIGN_LAB_CHROMIUM)) throw new Error(`CAMPAIGN_LAB_CHROMIUM does not exist: ${process.env.CAMPAIGN_LAB_CHROMIUM}`);
    return { executablePath: process.env.CAMPAIGN_LAB_CHROMIUM, source: "CAMPAIGN_LAB_CHROMIUM" };
  }
  const bundled = chromium.executablePath();
  if (bundled && existsSync(bundled)) return { executablePath: bundled, source: "Playwright bundle" };
  const cache = process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, "ms-playwright") : null;
  if (cache && existsSync(cache)) {
    const versions = readdirSync(cache)
      .filter((name) => /^chromium-\d+$/.test(name))
      .sort((left, right) => Number(right.split("-")[1]) - Number(left.split("-")[1]));
    for (const version of versions) {
      const candidate = path.join(cache, version, "chrome-win64", "chrome.exe");
      if (existsSync(candidate)) return { executablePath: candidate, source: `existing Playwright cache ${version}` };
    }
  }
  throw new Error(
    "Chromium is not installed for the resolved Playwright package.\n" +
    "Run: node scripts/framework-prototype/browser-tools/node_modules/playwright/cli.js install chromium\n" +
    "or set CAMPAIGN_LAB_CHROMIUM to an installed chrome.exe.",
  );
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-").replace("T", "_").replace("Z", "Z");
}

function readManifest(file) {
  if (!existsSync(file)) throw new Error(`Fixture manifest not found: ${file}`);
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    throw new Error(`Fixture manifest is not valid JSON: ${error.message}`);
  }
  const validation = validateManifest(manifest);
  if (!validation.ok) throw new Error(`Fixture manifest is invalid:\n- ${validation.errors.join("\n- ")}`);
  return manifest;
}

function targetBase(raw) {
  const parsed = new URL(raw);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error("App URL must use http or https.");
  if (parsed.username || parsed.password) throw new Error("App URL must not contain credentials.");
  return parsed;
}

function fixtureUrl(base, fixture) {
  if (/^https?:\/\//i.test(fixture.url)) return new URL(fixture.url).href;
  if (fixture.url.startsWith("/")) return new URL(fixture.url, base.origin).href;
  return new URL(fixture.url, base.href.endsWith("/") ? base.href : `${base.href}/`).href;
}

function jsonPreview(value, limit = 1200) {
  const text = JSON.stringify(value);
  return text.length > limit ? `${text.slice(0, limit)}…` : text;
}

function createRecorder() {
  const checks = [];
  const captures = [];
  return {
    checks,
    captures,
    add({ id, fixture, viewport, state, detail, evidence = {}, reproduction = null }) {
      checks.push({ id, fixture, viewport, state, detail, evidence, reproduction });
    },
    capture(entry) {
      captures.push(entry);
    },
  };
}

function defaultReproduction(fixtureUrlValue, viewport, inputs = {}) {
  const lines = [
    `Open ${fixtureUrlValue} in Chromium with a ${viewport} px-wide viewport.`,
    `Set Product name to ${JSON.stringify(inputs.productName ?? "<fixture value>")}.`,
    `Set Offer to ${JSON.stringify(inputs.offer ?? "<fixture value>")}.`,
    `Set Destination URL to ${JSON.stringify(inputs.destination ?? "<fixture value>")}.`,
    "Click Generate preview, then Approve preview.",
  ];
  return lines;
}

async function locateContract(page) {
  const fields = {
    productName: page.getByLabel("Product name", { exact: true }).first(),
    offer: page.getByLabel("Offer", { exact: true }).first(),
    destination: page.getByLabel("Destination URL", { exact: true }).first(),
    productImage: page.getByLabel("Product image", { exact: true }).first(),
  };
  const generate = page.getByRole("button", { name: "Generate preview", exact: true }).first();
  const approve = page.getByRole("button", { name: "Approve preview", exact: true }).first();
  let region = page.getByRole("region", { name: "Campaign preview", exact: true }).first();
  let regionFallback = false;
  if ((await region.count()) === 0) {
    region = page.locator('[aria-label="Campaign preview"], [data-testid="campaign-preview"]').first();
    regionFallback = true;
  }
  return { fields, generate, approve, region, regionFallback };
}

async function fieldInfo(locator) {
  if (!(await locator.count())) return { present: false };
  return locator.evaluate((element) => {
    const tag = element.tagName.toLowerCase();
    const type = (element.getAttribute("type") ?? "").toLowerCase();
    let value = "";
    try {
      value = typeof element.value === "string" ? element.value : "";
    } catch {
      value = "";
    }
    return {
      present: true,
      tag,
      type,
      value,
      required: element.required === true || element.getAttribute("aria-required") === "true",
      ariaInvalid: element.getAttribute("aria-invalid"),
      validationMessage: element.validationMessage ?? "",
      valid: typeof element.checkValidity === "function" ? element.checkValidity() : null,
      disabled: element.disabled === true,
      readOnly: element.readOnly === true,
      visible: (() => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) > 0 && rect.width > 0 && rect.height > 0;
      })(),
    };
  }).catch(() => ({ present: false }));
}

async function setText(locator, value) {
  await locator.fill(String(value));
  await locator.page().waitForTimeout(40);
}

async function previewSnapshot(page, contract) {
  const { region } = contract;
  if ((await region.count()) === 0) return null;
  return region.evaluate((element) => {
    const visible = (node) => {
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) > 0 && rect.width > 1 && rect.height > 1;
    };
    const rectOf = (node) => {
      const value = node.getBoundingClientRect();
      return { x: Number(value.x.toFixed(2)), y: Number(value.y.toFixed(2)), width: Number(value.width.toFixed(2)), height: Number(value.height.toFixed(2)),
        left: Number(value.left.toFixed(2)), right: Number(value.right.toFixed(2)), top: Number(value.top.toFixed(2)), bottom: Number(value.bottom.toFixed(2)) };
    };
    const canvas = element.querySelector("article") ?? element;
    const contentText = (() => {
      const pieces = [];
      const walk = (node) => {
        if (node.nodeType === Node.TEXT_NODE) {
          pieces.push(node.textContent ?? "");
          return;
        }
        if (node.nodeType !== Node.ELEMENT_NODE) return;
        if (["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE"].includes(node.tagName)) return;
        if (node.matches?.('[role="status"], [aria-live], [data-approval-status], [data-approved], [data-approval], [class*="approval"], [id*="approval"]')) return;
        for (const child of node.childNodes) walk(child);
      };
      walk(canvas);
      return pieces.join(" ");
    })();
    const links = [...element.querySelectorAll("a[href]")].filter(visible).map((node) => ({
      rawHref: node.getAttribute("href"),
      resolvedHref: node.href,
      name: (node.innerText || node.getAttribute("aria-label") || node.getAttribute("title") || "").trim(),
      rect: rectOf(node),
      target: node.getAttribute("target"),
      rel: node.getAttribute("rel"),
    }));
    const images = [...element.querySelectorAll("img")].map((node, index) => ({
      index,
      currentSrc: node.currentSrc || "",
      src: node.getAttribute("src") || "",
      alt: node.getAttribute("alt"),
      complete: node.complete,
      naturalWidth: node.naturalWidth,
      naturalHeight: node.naturalHeight,
      rect: rectOf(node),
      visible: visible(node),
      objectFit: getComputedStyle(node).objectFit,
      objectPosition: getComputedStyle(node).objectPosition,
      borderRadius: getComputedStyle(node).borderRadius,
      loading: node.getAttribute("loading"),
    }));
    return {
      text: element.innerText ?? "",
      contentText,
      links,
      images,
      rect: rectOf(element),
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
      scrollHeight: element.scrollHeight,
      clientHeight: element.clientHeight,
    };
  });
}

async function readApproval(page, contract) {
  const { approve } = contract;
  const approveInfo = await approve.evaluate((element) => ({
    text: (element.innerText || element.value || "").trim(),
    ariaPressed: element.getAttribute("aria-pressed"),
    ariaDisabled: element.getAttribute("aria-disabled"),
    disabled: element.disabled === true,
  })).catch(() => ({ text: "", ariaPressed: null, ariaDisabled: null, disabled: null }));
  const data = await page.evaluate(() => {
    const visible = (node) => {
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) > 0 && rect.width > 1 && rect.height > 1;
    };
    const region = document.querySelector('[role="region"][aria-label*="Campaign preview" i], [aria-label="Campaign preview"], [data-testid="campaign-preview"]');
    for (const root of [region, document].filter(Boolean)) {
      for (const node of root.querySelectorAll("[data-approved], [data-approval]")) {
        if (!visible(node)) continue;
        const value = node.getAttribute("data-approved") ?? node.getAttribute("data-approval");
        if (value === "true" || value === "false") return value;
      }
    }
    return null;
  }).catch(() => null);
  const statusText = await page.evaluate(() => {
    const visible = (node) => {
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) > 0 && rect.width > 1 && rect.height > 1;
    };
    const nodes = [...document.querySelectorAll('[role="status"], [aria-live], [data-approval-status], [data-testid*="approval"], [class*="approval"]')]
      .filter(visible);
    const region = document.querySelector('[role="region"][aria-label*="Campaign preview" i], [aria-label="Campaign preview"], [data-testid="campaign-preview"]');
    return [...nodes.map((node) => (node.innerText ?? "").trim()), region?.getAttribute("aria-label") ?? ""].filter(Boolean).join("\n");
  }).catch(() => "");
  const classification = classifyApproval({ dataApproved: data, ariaPressed: approveInfo.ariaPressed, statusText: `${statusText}\n${approveInfo.text}` });
  return {
    ...classification,
    approveDisabled: approveInfo.disabled === true || approveInfo.ariaDisabled === "true",
    approveText: approveInfo.text,
    dataApproved: data,
    ariaPressed: approveInfo.ariaPressed,
    statusText: normalizeText(statusText),
  };
}

async function waitForApproval(page, contract, predicate, timeout = 2500) {
  const started = Date.now();
  let last = await readApproval(page, contract);
  while (Date.now() - started < timeout) {
    if (predicate(last)) return last;
    await page.waitForTimeout(100);
    last = await readApproval(page, contract);
  }
  return last;
}

async function confirmApprovalBlocked(page, contract, approval) {
  if (approval.state === "approved") return { blocked: false, approval };
  if (approval.approveDisabled) return { blocked: true, approval };
  await contract.approve.click({ timeout: timeoutMs }).catch(() => {});
  await page.waitForTimeout(400);
  const after = await waitForApproval(page, contract, (state) => state.state === "approved", 1500);
  return { blocked: after.state !== "approved", approval: after };
}

async function waitForPreview(page, contract, predicate, timeout = 3500) {
  const started = Date.now();
  let last = await previewSnapshot(page, contract);
  while (Date.now() - started < timeout) {
    if (last && predicate(last)) return last;
    await page.waitForTimeout(100);
    last = await previewSnapshot(page, contract);
  }
  return last;
}

async function errorMessages(page, fieldLocators) {
  const messages = [];
  for (const [name, locator] of Object.entries(fieldLocators)) {
    const info = await fieldInfo(locator);
    if (!info.present) continue;
    if (info.validationMessage) messages.push({ source: `${name} native validation`, text: info.validationMessage });
    if (info.ariaInvalid === "true") {
      const described = await locator.evaluate((element) => {
        const ids = `${element.getAttribute("aria-describedby") ?? ""} ${element.getAttribute("aria-errormessage") ?? ""}`
          .split(/\s+/).filter(Boolean);
        return [...new Set(ids)].map((id) => document.getElementById(id)?.innerText ?? "").filter(Boolean);
      });
      for (const text of described) messages.push({ source: `${name} aria-describedby`, text: normalizeText(text) });
      const sibling = await locator.evaluate((element) => {
        const parent = element.closest("form, fieldset, [data-field], .field, div");
        if (!parent) return "";
        const candidates = [...parent.querySelectorAll('[role="alert"], [data-error], [class*="error"], [id$="-error"]')]
          .filter((node) => {
            const style = getComputedStyle(node);
            const rect = node.getBoundingClientRect();
            return style.display !== "none" && style.visibility !== "hidden" && rect.width > 1 && rect.height > 1;
          });
        return candidates.map((node) => node.innerText).join("\n");
      });
      for (const text of String(sibling).split(/\n+/)) {
        if (text.trim()) messages.push({ source: `${name} nearby error`, text: normalizeText(text) });
      }
    }
  }
  const alerts = await page.locator('[role="alert"], [aria-live="assertive"]').evaluateAll((nodes) => nodes.filter((node) => {
    const style = getComputedStyle(node);
    const rect = node.getBoundingClientRect();
    return style.display !== "none" && style.visibility !== "hidden" && rect.width > 1 && rect.height > 1;
  }).map((node) => node.innerText.trim()).filter(Boolean));
  for (const text of alerts) messages.push({ source: "page alert", text: normalizeText(text) });
  const unique = [];
  const seen = new Set();
  for (const message of messages) {
    const key = `${message.source}\0${message.text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(message);
  }
  return unique;
}

async function assertNoHorizontalOverflow(page, contract) {
  return page.evaluate((regionElement) => {
    const overflow = [];
    const viewportWidth = document.documentElement.clientWidth;
    const regionRect = regionElement?.getBoundingClientRect();
    const visible = (node) => {
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) > 0 && rect.width > 1 && rect.height > 1;
    };
    if (document.documentElement.scrollWidth > viewportWidth + 1) {
      overflow.push({ scope: "document", scrollWidth: document.documentElement.scrollWidth, clientWidth: viewportWidth });
    }
    if (regionElement && regionElement.scrollWidth > regionElement.clientWidth + 1) {
      overflow.push({ scope: "preview region", scrollWidth: regionElement.scrollWidth, clientWidth: regionElement.clientWidth });
    }
    if (regionElement && regionRect) {
      for (const node of regionElement.querySelectorAll("*")) {
        if (!visible(node)) continue;
        const rect = node.getBoundingClientRect();
        if (rect.right > regionRect.right + 1 || rect.left < regionRect.left - 1) {
          overflow.push({ scope: "element", tag: node.tagName.toLowerCase(), text: (node.innerText ?? "").trim().slice(0, 80),
            left: Number(rect.left.toFixed(1)), right: Number(rect.right.toFixed(1)),
            regionLeft: Number(regionRect.left.toFixed(1)), regionRight: Number(regionRect.right.toFixed(1)) });
          if (overflow.length >= 12) break;
        }
      }
    }
    for (const node of document.querySelectorAll("body *")) {
      if (!visible(node)) continue;
      if (node.closest('[aria-hidden="true"]')) continue;
      const rect = node.getBoundingClientRect();
      if (rect.right > viewportWidth + 1 || rect.left < -1) {
        overflow.push({ scope: "viewport element", tag: node.tagName.toLowerCase(), text: (node.innerText ?? "").trim().slice(0, 80),
          left: Number(rect.left.toFixed(1)), right: Number(rect.right.toFixed(1)), viewportWidth });
        if (overflow.length >= 20) break;
      }
    }
    return { viewportWidth, documentScrollWidth: document.documentElement.scrollWidth, region: regionRect ? { left: regionRect.left, right: regionRect.right, width: regionRect.width } : null, overflow };
  }, (await contract.region.count()) ? await contract.region.elementHandle() : null);
}

async function imageHealth(page, contract, responses) {
  const snapshot = await previewSnapshot(page, contract);
  if (!snapshot) return { images: [], broken: [], requests: [] };
  const requests = [];
  for (const image of snapshot.images) {
    if (!image.currentSrc) continue;
    const response = responses.byUrl.get(image.currentSrc) ?? responses.byUrl.get(new URL(image.currentSrc, page.url()).href);
    requests.push({
      url: image.currentSrc,
      status: response?.status ?? null,
      contentType: response?.contentType ?? null,
    });
  }
  const broken = snapshot.images.filter((image) => image.visible && (!image.complete || image.naturalWidth === 0 || image.naturalHeight === 0));
  return { images: snapshot.images, broken, requests };
}

async function imageBytes(page, responses, image) {
  const source = assetSource(image);
  const src = source.sourceUrl;
  if (!src) return null;
  const response = responses.byUrl.get(src) ?? responses.byUrl.get(image.currentSrc) ?? responses.byUrl.get(new URL(src, page.url()).href);
  if (response?.bodyPromise) {
    const body = await response.bodyPromise.catch(() => null);
    if (body) return body;
  }
  try {
    const base64 = await page.evaluate(async (url) => {
      const result = await fetch(url, { credentials: "same-origin" });
      if (!result.ok) return null;
      const bytes = new Uint8Array(await result.arrayBuffer());
      let binary = "";
      for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index]);
      return btoa(binary);
    }, src);
    if (base64) return Buffer.from(base64, "base64");
  } catch {
    // Fall through to a direct fetch for external assets that block page CORS.
  }
  try {
    const absolute = new URL(src, page.url()).href;
    const result = await fetch(absolute, { signal: AbortSignal.timeout(10_000) });
    if (result.ok) return Buffer.from(await result.arrayBuffer());
  } catch {
    // Unavailable bytes are reported as a failed SHA check.
  }
  return null;
}

async function textLegibility(contract, selectors) {
  return contract.region.evaluate((element, definitions) => {
    const parseColor = (value) => {
      const match = String(value).match(/rgba?\(([^)]+)\)/);
      if (!match) return null;
      const parts = match[1].split(/[ ,/]+/).filter(Boolean).map(Number);
      return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 };
    };
    const blend = (top, bottom) => ({
      r: Math.round(top.r * top.a + bottom.r * (1 - top.a)),
      g: Math.round(top.g * top.a + bottom.g * (1 - top.a)),
      b: Math.round(top.b * top.a + bottom.b * (1 - top.a)),
      a: 1,
    });
    const effectiveBackground = (node) => {
      let current = node;
      let composited = { r: 255, g: 255, b: 255, a: 1 };
      const layers = [];
      while (current && current !== document.documentElement.parentNode) {
        const style = getComputedStyle(current);
        if (style.backgroundImage && style.backgroundImage !== "none") layers.push({ type: "image", value: style.backgroundImage.slice(0, 120) });
        const parsed = parseColor(style.backgroundColor);
        if (parsed && parsed.a > 0) {
          layers.push({ type: "color", value: style.backgroundColor });
          composited = blend(parsed, composited);
          if (parsed.a >= 1) break;
        }
        current = current.parentElement;
      }
      return { color: [composited.r, composited.g, composited.b], hasImage: layers.some((layer) => layer.type === "image"), layers };
    };
    const visible = (node) => {
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) > 0 && rect.width > 1 && rect.height > 1;
    };
    const result = [];
    for (const definition of definitions) {
      const candidates = [...element.querySelectorAll(definition.selector)].filter(visible);
      const normalize = (value) => String(value ?? "").replace(/\s+/g, " ").toLowerCase();
      const node = definition.text
        ? candidates.find((candidate) => normalize(candidate.innerText).includes(normalize(definition.text)))
        : candidates[0];
      if (!node) {
        result.push({ role: definition.role, present: false });
        continue;
      }
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      const regionRect = element.getBoundingClientRect();
      const background = effectiveBackground(node);
      const foreground = parseColor(style.color);
      const fontSize = Number.parseFloat(style.fontSize);
      const fontWeight = style.fontWeight;
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const hit = document.elementFromPoint(centerX, centerY);
      const obscured = Boolean(hit && hit !== node && !node.contains(hit) && !hit.contains(node));
      const clipped =
        (style.overflowX === "hidden" || style.overflowX === "clip") && node.scrollWidth > node.clientWidth + 1 ||
        (style.overflowY === "hidden" || style.overflowY === "clip") && node.scrollHeight > node.clientHeight + 1 ||
        (style.webkitLineClamp && style.webkitLineClamp !== "none" && node.scrollHeight > node.clientHeight + 1);
      result.push({
        role: definition.role,
        present: true,
        text: (node.innerText ?? "").trim().slice(0, 220),
        fontSize,
        fontWeight,
        lineHeight: style.lineHeight,
        color: style.color,
        background: background.color,
        backgroundHasImage: background.hasImage,
        foreground,
        clipped,
        obscured,
        scrollWidth: node.scrollWidth,
        clientWidth: node.clientWidth,
        scrollHeight: node.scrollHeight,
        clientHeight: node.clientHeight,
        rect: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height },
        insideRegion: rect.left >= regionRect.left - 1 && rect.right <= regionRect.right + 1 && rect.top >= regionRect.top - 1 && rect.bottom <= regionRect.bottom + 1,
        style: { textOverflow: style.textOverflow, overflow: style.overflow, maxHeight: style.maxHeight, webkitLineClamp: style.webkitLineClamp },
      });
    }
    return result;
  }, selectors);
}

function contrastValue(element) {
  // Recomputed in Node from the rgb values captured by textLegibility.
  const parse = (value) => {
    const match = String(value ?? "").match(/rgba?\(([^)]+)\)/);
    if (!match) return null;
    const parts = match[1].split(/[ ,/]+/).filter(Boolean).map(Number);
    return [parts[0], parts[1], parts[2]];
  };
  const foreground = parse(element.color);
  if (!foreground || !Array.isArray(element.background)) return null;
  return contrastRatio(foreground, element.background);
}

async function keyboardFocus(page, contract, targetHint = {}) {
  const { region } = contract;
  const links = region.locator("a[href]");
  if ((await links.count()) === 0) return { found: false, reason: "no link in Campaign preview", stops: [] };
  let targetIndex = 0;
  if (targetHint.href || targetHint.name) {
    const matched = await links.evaluateAll((nodes, hint) => nodes.findIndex((node) => {
      const href = node.getAttribute("href");
      const name = (node.innerText || node.getAttribute("aria-label") || "").trim();
      if (hint.href && href === hint.href) return true;
      if (hint.name && name.includes(hint.name)) return true;
      return false;
    }), targetHint);
    if (matched >= 0) targetIndex = matched;
  }
  const target = links.nth(targetIndex);
  const before = await target.evaluate((element) => {
    const style = getComputedStyle(element);
    return { outlineStyle: style.outlineStyle, outlineWidth: style.outlineWidth, outlineColor: style.outlineColor,
      boxShadow: style.boxShadow, borderColor: style.borderColor };
  }).catch(() => null);
  await page.evaluate(() => {
    if (document.activeElement && typeof document.activeElement.blur === "function") document.activeElement.blur();
    window.scrollTo(0, 0);
  });
  const stops = [];
  for (let index = 0; index < 220; index += 1) {
    await page.keyboard.press("Tab");
    const active = await page.evaluate(() => {
      const element = document.activeElement;
      if (!element || element === document.body) return { tag: "body" };
      return {
        tag: element.tagName.toLowerCase(),
        role: element.getAttribute("role"),
        name: (element.innerText || element.getAttribute("aria-label") || element.getAttribute("title") || "").trim().slice(0, 100),
        href: element.getAttribute("href"),
        type: element.getAttribute("type"),
      };
    });
    stops.push(active);
    const isTarget = await target.evaluate((element) => element === document.activeElement || element.contains(document.activeElement)).catch(() => false);
    if (isTarget) {
      const after = await target.evaluate((element) => {
        const style = getComputedStyle(element);
        return { outlineStyle: style.outlineStyle, outlineWidth: style.outlineWidth, outlineColor: style.outlineColor,
          boxShadow: style.boxShadow, borderColor: style.borderColor };
      });
      const focusVisible = Boolean(
        (after.outlineStyle !== "none" && Number.parseFloat(after.outlineWidth) > 0) ||
        after.boxShadow !== "none" ||
        after.borderColor !== before?.borderColor ||
        after.outlineColor !== before?.outlineColor,
      );
      return { found: true, tabStops: index + 1, targetIndex, stops, before, after, focusVisible };
    }
  }
  return { found: false, reason: "Campaign preview link was not reached within 220 Tab presses", targetIndex, stops };
}

async function activateWithKeyboard(page, context, expectedUrl) {
  let requested = null;
  let popup = null;
  const requests = [];
  const onRequest = (request) => {
    if (request.url() === expectedUrl || request.url().startsWith(expectedUrl)) requests.push(request.url());
  };
  const route = async (routeHandler) => {
    const url = routeHandler.request().url();
    if (url === expectedUrl || url.startsWith(expectedUrl)) {
      requested = url;
      await routeHandler.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><title>acceptance destination</title><p>acceptance destination</p>" });
      return;
    }
    await routeHandler.continue();
  };
  await context.route("**/*", route).catch(() => {});
  page.on("request", onRequest);
  const popupPromise = context.waitForEvent("page", { timeout: 4000 }).catch(() => null);
  const navigationPromise = page.waitForURL((url) => url.href === expectedUrl || url.href.startsWith(expectedUrl), { timeout: 4000 }).catch(() => null);
  await page.keyboard.press("Enter");
  popup = await popupPromise;
  await navigationPromise;
  await page.waitForTimeout(500);
  page.off("request", onRequest);
  await context.unroute("**/*").catch(() => {});
  if (popup) {
    const popupUrl = popup.url();
    await popup.close().catch(() => {});
    return { activated: Boolean(requested || popupUrl === expectedUrl || popupUrl.startsWith(expectedUrl)), requested, popupUrl, requests };
  }
  const finalUrl = page.url();
  return { activated: Boolean(requested || finalUrl === expectedUrl || finalUrl.startsWith(expectedUrl)), requested, popupUrl: null, requests, finalUrl };
}

async function regionLocator(page) {
  const role = page.getByRole("region", { name: "Campaign preview", exact: true }).first();
  if (await role.count()) return role;
  return page.locator('[aria-label="Campaign preview"], [data-testid="campaign-preview"]').first();
}

async function capture(page, recorder, outDir, details) {
  const relative = path.posix.join("captures", `${safeSegment(details.fixture)}-${details.viewport}-${safeSegment(details.state)}.png`);
  const absolute = path.join(outDir, relative);
  mkdirSync(path.dirname(absolute), { recursive: true });
  const target = details.region ? await regionLocator(page) : null;
  if (details.region && (await target?.count())) {
    await target.screenshot({ path: absolute, animations: "disabled", timeout: timeoutMs });
  } else {
    await page.screenshot({ path: absolute, animations: "disabled", timeout: timeoutMs, fullPage: false });
  }
  recorder.capture({ file: relative, fixture: details.fixture, viewport: details.viewport, state: details.state, purpose: details.purpose });
  return relative;
}

async function captureFull(page, recorder, outDir, details) {
  const relative = path.posix.join("captures", `${safeSegment(details.fixture)}-${details.viewport}-${safeSegment(details.state)}-full.png`);
  const absolute = path.join(outDir, relative);
  mkdirSync(path.dirname(absolute), { recursive: true });
  await page.screenshot({ path: absolute, animations: "disabled", timeout: timeoutMs, fullPage: true });
  recorder.capture({ file: relative, fixture: details.fixture, viewport: details.viewport, state: details.state, purpose: details.purpose });
  return relative;
}

async function captureImage(page, recorder, outDir, details, index = 0) {
  const region = await regionLocator(page);
  const image = region.locator("img").nth(index);
  if (!(await image.count())) return null;
  const relative = path.posix.join("captures", `${safeSegment(details.fixture)}-${details.viewport}-${safeSegment(details.state)}-product.png`);
  const absolute = path.join(outDir, relative);
  mkdirSync(path.dirname(absolute), { recursive: true });
  await image.scrollIntoViewIfNeeded().catch(() => {});
  await image.screenshot({ path: absolute, animations: "disabled", timeout: timeoutMs });
  recorder.capture({ file: relative, fixture: details.fixture, viewport: details.viewport, state: details.state, purpose: details.purpose });
  return relative;
}

function assetSource(image) {
  const candidates = [image.currentSrc, image.src].filter(Boolean);
  for (const candidate of candidates) {
    try {
      const url = new URL(candidate, "http://local.invalid");
      if (url.pathname === "/_next/image") {
        const original = url.searchParams.get("url");
        if (original) {
          const source = new URL(original, url.origin === "http://local.invalid" ? "http://local.invalid" : url);
          return { sourceUrl: source.href, sourcePath: source.pathname, via: "next-image-optimizer", displayUrl: candidate };
        }
      }
      return { sourceUrl: candidate, sourcePath: url.pathname, via: "direct", displayUrl: candidate };
    } catch {
      // Try the next candidate.
    }
  }
  return { sourceUrl: image.currentSrc, sourcePath: null, via: "unknown", displayUrl: image.currentSrc };
}

function pickProductImage(images, fixture) {
  const visible = images.filter((image) => image.visible);
  if (!visible.length) return null;
  const expectedAlt = fixture.image?.alt;
  const expectedName = fixture.image?.path ? String(fixture.image.path).split("/").pop() : null;
  const matchesAsset = (image) => {
    if (!expectedName) return false;
    const source = assetSource(image);
    return source.sourcePath?.endsWith(`/${expectedName}`) || image.currentSrc.includes(expectedName);
  };
  return visible.find((image) => expectedAlt && image.alt === expectedAlt)
    ?? visible.find(matchesAsset)
    ?? [...visible].sort((left, right) => (right.rect.width * right.rect.height) - (left.rect.width * left.rect.height))[0];
}

function expectedAssetMatch(image, expected) {
  if (!expected?.path) return { checked: false, reason: "no approved asset path" };
  try {
    const source = assetSource(image);
    const expectedUrl = /^https?:\/\//i.test(expected.path) ? new URL(expected.path) : new URL(expected.path, "http://local.invalid");
    const exact = /^https?:\/\//i.test(expected.path)
      ? source.sourceUrl === expected.path
      : source.sourcePath === expectedUrl.pathname;
    return { checked: true, exact, observedPath: source.sourcePath, observedUrl: source.sourceUrl, expectedPath: expectedUrl.pathname, via: source.via };
  } catch (error) {
    return { checked: true, exact: false, observedPath: image.currentSrc, expectedPath: expected.path, error: error.message };
  }
}

async function runFixtureViewport({ browser, base, manifest, fixture, viewport, outDir, recorder, responsesFor }) {
  const url = fixtureUrl(base, fixture);
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    screen: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: viewport.deviceScaleFactor,
    isMobile: viewport.isMobile,
    hasTouch: viewport.hasTouch,
    serviceWorkers: "block",
    reducedMotion: "reduce",
    locale: "en-US",
    timezoneId: "UTC",
  });
  const page = await context.newPage();
  const responses = responsesFor(page);
  const consoleErrors = [];
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const location = message.location()?.url ?? "";
    if (/\/favicon\.ico(?:$|\?)/i.test(location)) return;
    consoleErrors.push({ text: message.text().slice(0, 300), location });
  });
  page.on("pageerror", (error) => consoleErrors.push({ text: `pageerror: ${error.message.slice(0, 300)}`, location: "" }));
  const fixtureChecks = [];
  const add = (id, state, detail, evidence = {}, reproduction = null) => {
    const check = { id, fixture: fixture.name, viewport: viewport.name, state, detail, evidence, reproduction };
    recorder.add(check);
    fixtureChecks.push(check);
    return check;
  };
  const repro = (inputs) => defaultReproduction(url, viewport.name, inputs);
  const inputs = { productName: "", offer: "", destination: "" };
  let currentOffer = "";
  let currentDestination = "";
  let baseline = null;
  let baselineImageRef = null;
  let approvalAfterApprove = null;
  let lastValidSnapshot = null;
  let afterEditOffer = "";
  let afterEditDestination = "";

  try {
    let response;
    try {
      response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    } catch (error) {
      add("target-reachable", "failed", `Could not load ${url}: ${error.message}`, { url, error: error.message }, [`Open ${url} in Chromium at ${viewport.width} px.`]);
      return fixtureChecks;
    }
    if (response && !response.ok()) {
      add("target-reachable", "failed", `Campaign lab returned HTTP ${response.status()} for ${url}.`, { status: response.status(), url },
        [`Start the app that owns /campaign-lab and open ${url}.`]);
      return fixtureChecks;
    }
    await page.waitForLoadState("domcontentloaded").catch(() => {});
    await page.evaluate(() => document.fonts?.ready ?? Promise.resolve()).catch(() => {});
    await page.waitForTimeout(settleMs);

    const contract = await locateContract(page);
    const fieldPresence = {};
    for (const [name, locator] of Object.entries(contract.fields)) fieldPresence[name] = await locator.count() > 0;
    const regionPresent = await contract.region.count() > 0 && await contract.region.isVisible().catch(() => false);
    const generatePresent = await contract.generate.count() > 0;
    const approvePresent = await contract.approve.count() > 0;
    add("controls-present", fieldPresence.productName && fieldPresence.offer && fieldPresence.destination && fieldPresence.productImage && generatePresent && approvePresent && regionPresent ? "passed" : "failed",
      `Product name, Offer, Destination URL, Product image, Generate preview, Approve preview, and the named Campaign preview region must be present.`,
      { fields: fieldPresence, generatePresent, approvePresent, regionPresent, regionFallback: contract.regionFallback, url },
      [`Open ${url} and inspect the accessible names.`]);
    if (!regionPresent) {
      add("preview-region-exposed", "failed", "No visible region named 'Campaign preview' was found.", { url }, [`Add an accessible region named "Campaign preview" and reopen ${url}.`]);
      return fixtureChecks;
    }
    if (!fieldPresence.productName || !fieldPresence.offer || !fieldPresence.destination || !generatePresent || !approvePresent) {
      add("preview-region-exposed", "passed", "The preview is exposed as a region named 'Campaign preview'.", { regionFallback: contract.regionFallback });
      return fixtureChecks;
    }
    add("preview-region-exposed", "passed", "The preview is exposed as a region named 'Campaign preview'.", { regionFallback: contract.regionFallback });

    const productNameInfo = await fieldInfo(contract.fields.productName);
    const offerInfo = await fieldInfo(contract.fields.offer);
    const destinationInfo = await fieldInfo(contract.fields.destination);
    inputs.productName = productNameInfo.value ?? "";
    inputs.offer = offerInfo.value ?? "";
    inputs.destination = destinationInfo.value ?? "";
    currentOffer = inputs.offer;
    currentDestination = inputs.destination;

    const approved = hasApprovedMetadata(fixture) && manifest.status === "approved";
    if (fixture.product?.name) {
      const matches = normalizeText(productNameInfo.value) === normalizeText(fixture.product.name);
      add("fixture-product-name", approved ? (matches ? "passed" : "failed") : "pending",
        approved ? `Product name field must equal the approved fixture value.` : "Approved fixture metadata is not supplied; the product name is reported but not adjudicated.",
        { observed: productNameInfo.value, expected: fixture.product.name, manifestStatus: manifest.status },
        repro(inputs));
    }
    if (fixture.offer) {
      const matches = normalizeText(currentOffer) === normalizeText(fixture.offer);
      add("fixture-offer", approved ? (matches ? "passed" : "failed") : "pending",
        approved ? "The fixture must load its approved offer." : "Approved fixture metadata is not supplied; the fixture offer is reported but not adjudicated.",
        { observed: currentOffer, expected: fixture.offer, manifestStatus: manifest.status }, repro(inputs));
    } else {
      add("fixture-offer", approved ? "failed" : "pending", "No approved offer is supplied in the fixture manifest.",
        { observed: currentOffer, manifestStatus: manifest.status }, repro(inputs));
    }

    // Establish a known valid preview. The approved values are used when
    // supplied; otherwise the fixture's current valid values are used.
    const workingOffer = fixture.offer ?? currentOffer;
    const workingDestination = fixture.destination ?? currentDestination;
    const workingProductName = fixture.product?.name ?? productNameInfo.value;
    if (!workingOffer || !workingDestination) {
      add("fixture-has-working-values", "failed", "The fixture does not expose a usable offer and destination.", { currentOffer, currentDestination }, repro(inputs));
      return fixtureChecks;
    }
    inputs.productName = fixture.product?.name ?? inputs.productName;
    inputs.offer = workingOffer;
    inputs.destination = workingDestination;
    currentOffer = workingOffer;
    currentDestination = workingDestination;
    if (normalizeText(offerInfo.value) !== normalizeText(workingOffer)) await setText(contract.fields.offer, workingOffer);
    if (normalizeText(destinationInfo.value) !== normalizeText(workingDestination)) await setText(contract.fields.destination, workingDestination);

    await contract.generate.click({ timeout: timeoutMs });
    await page.waitForTimeout(settleMs);
    let generated = await waitForPreview(page, contract, (snapshot) =>
      comparableText(snapshot.text).includes(comparableText(workingOffer)) ||
      snapshot.links.some((link) => link.rawHref === workingDestination || link.resolvedHref === workingDestination));
    if (!generated) {
      add("generate-preview", "failed", "Generate preview did not render the offer or the destination.", { offer: workingOffer, destination: workingDestination },
        repro(inputs));
      return fixtureChecks;
    }
    add("generate-preview", "passed", "Generate preview rendered the valid offer and destination.", { offer: workingOffer, destination: workingDestination });
    const residualErrors = await errorMessages(page, { destination: contract.fields.destination, offer: contract.fields.offer, productName: contract.fields.productName });
    add("valid-generate-clears-error", residualErrors.length === 0 ? "passed" : "failed",
      residualErrors.length === 0 ? "A valid generation left no validation error visible." : "A validation error remained visible after a valid generation.",
      { messages: residualErrors }, repro(inputs));

    const approveBefore = await readApproval(page, contract);
    if (await contract.approve.isDisabled().catch(() => false)) {
      add("approve-preview", "failed", "Approve preview is disabled for a valid, generated preview.", { approval: approveBefore }, repro(inputs));
    } else {
      await contract.approve.click({ timeout: timeoutMs });
      approvalAfterApprove = await waitForApproval(page, contract, (state) => state.state !== approveBefore.state || state.state === "approved", 2500);
      if (approvalAfterApprove.state === "unknown" && approvalAfterApprove.approveDisabled && !approveBefore.approveDisabled) {
        approvalAfterApprove = { ...approvalAfterApprove, state: "approved", inferred: true, evidence: "Approve preview became disabled after a successful approval click." };
      }
      add("approve-preview", approvalAfterApprove.state === "approved" ? "passed" : "failed",
        approvalAfterApprove.state === "approved" ? "Approving the exact previewed revision produced an approved state." : "Approving the preview did not expose an approved state.",
        { before: approveBefore, after: approvalAfterApprove }, repro(inputs));
    }

    const regionHandle = await contract.region.elementHandle().catch(() => null);
    await page.waitForFunction((region) => {
      if (!region) return false;
      const images = [...region.querySelectorAll("img")];
      return images.length > 0 && images.every((image) => image.complete);
    }, regionHandle, { timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(120);

    baseline = await previewSnapshot(page, contract);
    lastValidSnapshot = baseline;
    if (!baseline) {
      add("preview-snapshot", "failed", "The Campaign preview region could not be read.", {}, repro(inputs));
      return fixtureChecks;
    }
    const ctaName = fixture.cta?.name ?? null;
    const visibleLinks = baseline.links.filter((link) => link.name);
    const primary = ctaName
      ? visibleLinks.find((link) => comparableText(link.name).includes(comparableText(ctaName))) ?? visibleLinks[0]
      : visibleLinks[0];
    const expectedDestination = fixture.destination ?? currentDestination;
    if (!primary) {
      add("cta-present", "failed", "No visible link was found in Campaign preview.", { links: baseline.links }, repro(inputs));
    } else {
      add("cta-present", "passed", `The preview exposes a primary link with an accessible name: ${primary.name}.`, { primary });
      const exactRaw = primary.rawHref === expectedDestination;
      const exactResolved = primary.resolvedHref === expectedDestination;
      add("cta-exact-destination", approved ? (exactResolved ? "passed" : "failed") : "pending",
        approved ? "The primary CTA must point to the approved exact destination after URL resolution." : "Approved destination metadata is not supplied; the exact expected URL cannot be adjudicated.",
        { expected: expectedDestination, rawHref: primary.rawHref, resolvedHref: primary.resolvedHref, exactRaw, exactResolved, manifestStatus: manifest.status },
        repro(inputs));
      add("cta-matches-form-destination", exactResolved ? "passed" : "failed",
        "The primary CTA must point to the exact destination entered in the form after URL resolution.",
        { expected: currentDestination, rawHref: primary.rawHref, resolvedHref: primary.resolvedHref, exactRaw, exactResolved }, repro(inputs));
    }

    await capture(page, recorder, outDir, { fixture: fixture.name, viewport: viewport.name, state: "approved", purpose: "Approved preview for crop, hierarchy, repetition, and brand-fit review.", region: true });
    await captureFull(page, recorder, outDir, { fixture: fixture.name, viewport: viewport.name, state: "approved", purpose: "Full-page approved render for surrounding context and repetition review." });

    const overflow = await assertNoHorizontalOverflow(page, contract);
    add("no-horizontal-overflow", overflow.overflow.length === 0 ? "passed" : "failed",
      overflow.overflow.length === 0 ? "No horizontal overflow was found in the document, preview region, or preview descendants." : "Horizontal overflow was detected.",
      overflow, repro(inputs));

    const health = await imageHealth(page, contract, responses);
    const productImages = health.images.filter((image) => image.visible);
    const productImage = pickProductImage(health.images, fixture);
    if (!productImages.length || !productImage) {
      add("product-image-present", "failed", "No visible product image was found in Campaign preview.", health, repro(inputs));
    } else {
      add("product-image-present", "passed", `${productImages.length} visible product image(s) found; the product candidate is image #${productImage.index}.`, { images: productImages, productImage });
      add("product-image-loads", productImage.complete && productImage.naturalWidth > 0 && productImage.naturalHeight > 0 ? "passed" : "failed",
        productImage.complete && productImage.naturalWidth > 0 && productImage.naturalHeight > 0 ? "The product image completed loading with non-zero natural dimensions." : "The product image is broken or has zero natural dimensions.",
        { productImage, brokenImages: health.broken, requests: health.requests }, repro(inputs));
      const image = productImage;
      const asset = expectedAssetMatch(image, fixture.image);
      add("product-asset-matches-approved", approved ? (asset.checked ? (asset.exact ? "passed" : "failed") : "failed") : "pending",
        approved ? "The rendered product asset must match the approved fixture asset path." : "Approved asset metadata is not supplied; the asset path is reported but not adjudicated.",
        { ...asset, currentSrc: image.currentSrc, manifestStatus: manifest.status }, repro(inputs));
      if (fixture.image?.sha256) {
        const bytes = await imageBytes(page, responses, image);
        const digest = bytes ? sha256(bytes) : null;
        add("product-asset-sha256", approved ? (digest === fixture.image.sha256.toLowerCase() ? "passed" : "failed") : "pending",
          approved ? "The rendered product asset bytes must match the approved SHA-256." : "Approved asset SHA-256 is not supplied.",
          { expected: fixture.image.sha256.toLowerCase(), observed: digest, manifestStatus: manifest.status }, repro(inputs));
      } else {
        add("product-asset-sha256", approved ? "failed" : "pending", "No approved SHA-256 is supplied; the asset identity is not pinned to bytes.",
          { observed: image.currentSrc, manifestStatus: manifest.status }, repro(inputs));
      }
      if (fixture.image?.alt != null) {
        const altMatches = image.alt === fixture.image.alt;
        add("product-alt-matches-approved", approved ? (altMatches ? "passed" : "failed") : "pending",
          approved ? "The product image alt text must exactly match the approved metadata." : "Approved alt text is not supplied; the observed alt text is reported but not adjudicated.",
          { expected: fixture.image.alt, observed: image.alt, manifestStatus: manifest.status }, repro(inputs));
      } else {
        add("product-alt-matches-approved", approved ? "failed" : "pending", "No approved alt text is supplied for the product image.",
          { observed: image.alt, manifestStatus: manifest.status }, repro(inputs));
      }
      const expectedLabel = fixture.product?.label ?? fixture.image?.label;
      if (expectedLabel) {
        const labelVisible = comparableText(baseline.text).toLowerCase().includes(comparableText(expectedLabel).toLowerCase());
        add("product-label-matches-approved", approved ? (labelVisible ? "passed" : "failed") : "pending",
          approved ? "The approved product label must be visible in the preview." : "Approved label metadata is not supplied; the label is reported but not adjudicated.",
          { expected: expectedLabel, previewText: baseline.text.slice(0, 500), manifestStatus: manifest.status }, repro(inputs));
      } else {
        add("product-label-matches-approved", approved ? "failed" : "pending", "No approved product label is supplied.",
          { previewText: baseline.text.slice(0, 500), manifestStatus: manifest.status }, repro(inputs));
      }
      await captureImage(page, recorder, outDir, { fixture: fixture.name, viewport: viewport.name, state: "approved", purpose: "Product image crop for packaging review." }, image.index);
      baselineImageRef = image;
    }

    const definitions = [
      { role: "product", selector: "h1, h2, h3, [data-role='product-name'], .product-name, [data-testid*='product'], p", text: fixture.product?.name ?? inputs.productName },
      { role: "offer", selector: "[data-role='offer'], .offer, p", text: workingOffer },
      { role: "cta", selector: "a[href]", text: fixture.cta?.name ?? primary?.name ?? "" },
    ];
    const legibility = await textLegibility(contract, definitions);
    for (const item of legibility) {
      if (!item.present) {
        add(`legibility-${item.role}`, "failed", `The ${item.role} was not found in Campaign preview.`, { item }, repro(inputs));
        continue;
      }
      const contrast = contrastValue(item);
      const minimum = requiredContrast(item.fontSize, item.fontWeight);
      const issues = [];
      if (item.fontSize < (item.role === "cta" ? 14 : 12)) issues.push(`font size ${item.fontSize}px is below the minimum`);
      if (item.clipped) issues.push("text is clipped by overflow");
      if (item.obscured) issues.push("text is obscured by another element");
      if (!item.insideRegion) issues.push("text extends outside the preview region");
      if (contrast != null && !item.backgroundHasImage && contrast < minimum) issues.push(`contrast ${contrast}:1 is below ${minimum}:1`);
      if (item.backgroundHasImage || contrast == null) {
        add(`legibility-${item.role}`, issues.length ? "failed" : "unassessed",
          issues.length ? issues.join("; ") : "Contrast could not be computed over an image or unresolved background; a reviewer must confirm readability.",
          { item, contrast, minimum, backgroundHasImage: item.backgroundHasImage }, repro(inputs));
      } else {
        add(`legibility-${item.role}`, issues.length === 0 ? "passed" : "failed",
          issues.length === 0 ? `${item.role} is visible, unclipped, and has ${contrast}:1 contrast at ${item.fontSize}px.` : issues.join("; "),
          { item, contrast, minimum }, repro(inputs));
      }
    }

    const focus = await keyboardFocus(page, contract, { href: primary?.rawHref, name: primary?.name });
    add("cta-keyboard-reachable", focus.found ? (focus.focusVisible ? "passed" : "failed") : "failed",
      focus.found ? (focus.focusVisible ? `The primary CTA was reached with Tab after ${focus.tabStops} stop(s) and showed a focus indicator.` : "The primary CTA received focus but no visible focus indicator was detected.") : focus.reason,
      focus, repro(inputs));
    if (focus.found) {
      await capture(page, recorder, outDir, { fixture: fixture.name, viewport: viewport.name, state: "cta-focus", purpose: "Keyboard focus state on the primary CTA.", region: true });
    }

    // Change only the offer and destination. The product name and image stay untouched.
    afterEditOffer = `${workingOffer} (acceptance revision)`;
    afterEditDestination = `https://example.com/ornigami-acceptance/${fixture.name}/revised`;
    inputs.offer = afterEditOffer;
    inputs.destination = afterEditDestination;
    await setText(contract.fields.offer, afterEditOffer);
    await setText(contract.fields.destination, afterEditDestination);
    await contract.generate.click({ timeout: timeoutMs });
    await page.waitForTimeout(settleMs);
    const edited = await waitForPreview(page, contract, (snapshot) =>
      comparableText(snapshot.text).includes(comparableText(afterEditOffer)) ||
      snapshot.links.some((link) => link.rawHref === afterEditDestination || link.resolvedHref === afterEditDestination));
    add("edit-updates-offer-and-destination", edited && comparableText(edited.text).includes(comparableText(afterEditOffer)) && edited.links.some((link) => link.rawHref === afterEditDestination)
      ? "passed" : "failed",
      "Changing only Offer and Destination URL must update both values in the preview.",
      { offer: afterEditOffer, destination: afterEditDestination, text: edited?.text?.slice(0, 700), links: edited?.links }, repro(inputs));
    const editedApproval = await waitForApproval(page, contract, (state) => state.state !== "approved", 2500);
    const invalidated = approvalAfterApprove?.state === "approved" && editedApproval.state !== "approved";
    add("edit-invalidates-approval", invalidated ? "passed" : (approvalAfterApprove?.state === "approved" ? "failed" : "unassessed"),
      invalidated ? "Editing the offer and destination invalidated the previous approval." : "The previous approval was not observably invalidated after the edit.",
      { before: approvalAfterApprove, after: editedApproval, beforeApproveDisabled: approvalAfterApprove?.approveDisabled, afterApproveDisabled: editedApproval.approveDisabled },
      [`Open ${url}, generate and approve a valid preview, change Offer to ${JSON.stringify(afterEditOffer)} and Destination URL to ${JSON.stringify(afterEditDestination)}, click Generate preview, and inspect the approval state.`]);
    if (edited) {
      const editedImage = edited.images.find((image) => image.visible && image.currentSrc === baselineImageRef?.currentSrc)
        ?? pickProductImage(edited.images, fixture);
      // Screenshot bytes can vary when the same image moves to another scroll position.
      const imageSignature = (image) => image ? [
        image.currentSrc, image.alt, image.naturalWidth, image.naturalHeight,
        image.rect.width, image.rect.height, image.objectFit, image.objectPosition, image.borderRadius,
      ] : null;
      const sameImage = Boolean(baselineImageRef && editedImage) &&
        JSON.stringify(imageSignature(editedImage)) === JSON.stringify(imageSignature(baselineImageRef));
      add("edit-preserves-image", sameImage ? "passed" : "failed",
        sameImage ? "The approved image source, alt text, dimensions, and crop styles were preserved." : "The product image or its crop changed after the offer/destination edit.",
        { before: baselineImageRef, after: editedImage }, repro(inputs));
      const diff = unrelatedCopyDiff(lastValidSnapshot?.contentText ?? "", edited.contentText ?? "", [
        [workingOffer, afterEditOffer],
        [workingDestination, afterEditDestination],
      ]);
      add("edit-preserves-unrelated-content", diff == null ? "passed" : "failed",
        diff == null ? "Only the offer and destination copy changed in Campaign preview." : "Unrelated preview copy changed after the offer/destination edit.",
        { diff, before: lastValidSnapshot?.contentText?.slice(0, 900), after: edited.contentText?.slice(0, 900) }, repro(inputs));
      await capture(page, recorder, outDir, { fixture: fixture.name, viewport: viewport.name, state: "edited", purpose: "Preview after changing only offer and destination; compare hierarchy and repetition with the approved capture.", region: true });
      lastValidSnapshot = edited;
    }

    // Invalid URL: visible error, approval blocked, prior valid preview intact.
    const validBeforeInvalid = lastValidSnapshot;
    const invalidDestination = "example.com/no-scheme";
    inputs.destination = invalidDestination;
    await setText(contract.fields.destination, invalidDestination);
    await contract.generate.click({ timeout: timeoutMs }).catch(() => {});
    await page.waitForTimeout(settleMs);
    let invalidErrors = [];
    for (let attempt = 0; attempt < 12; attempt += 1) {
      invalidErrors = await errorMessages(page, { destination: contract.fields.destination, offer: contract.fields.offer, productName: contract.fields.productName });
      if (invalidErrors.length) break;
      await page.waitForTimeout(100);
    }
    const invalidApproval = await readApproval(page, contract);
    const invalidBlocked = await confirmApprovalBlocked(page, contract, invalidApproval);
    add("invalid-url-visible-error", invalidErrors.length ? "passed" : "failed",
      invalidErrors.length ? "An invalid destination produced a visible or native validation error." : "No visible error was produced for an invalid destination URL.",
      { messages: invalidErrors, approval: invalidBlocked.approval, input: invalidDestination }, repro(inputs));
    add("invalid-url-blocks-approval", invalidBlocked.blocked ? "passed" : (invalidBlocked.approval.state === "unknown" ? "unassessed" : "failed"),
      invalidBlocked.blocked ? "Invalid input did not leave the preview approved; an approval attempt was refused or unavailable." : "The approval state was still approved after an invalid destination.",
      { approval: invalidBlocked.approval, approveDisabled: invalidBlocked.approval.approveDisabled }, repro(inputs));
    const invalidSnapshot = await previewSnapshot(page, contract);
    const preservedText = comparableText(invalidSnapshot?.contentText) === comparableText(validBeforeInvalid?.contentText);
    const preservedCta = jsonPreview(invalidSnapshot?.links?.map((link) => link.rawHref)) === jsonPreview(validBeforeInvalid?.links?.map((link) => link.rawHref));
    const preservedImage = jsonPreview(invalidSnapshot?.images?.map((image) => image.currentSrc)) === jsonPreview(validBeforeInvalid?.images?.map((image) => image.currentSrc));
    add("invalid-url-preserves-last-valid-preview", preservedText && preservedCta && preservedImage ? "passed" : "failed",
      "A failed validation must leave the last valid preview usable.",
      { preservedText, preservedCta, preservedImage, text: invalidSnapshot?.text?.slice(0, 700), links: invalidSnapshot?.links }, repro(inputs));
    await capture(page, recorder, outDir, { fixture: fixture.name, viewport: viewport.name, state: "invalid-url", purpose: "Visible validation state for an invalid destination URL.", region: true });
    await captureFull(page, recorder, outDir, { fixture: fixture.name, viewport: viewport.name, state: "invalid-url", purpose: "Full-page invalid URL state, including the form error and the preserved preview." });

    // Missing required input: restore the destination, clear the offer.
    inputs.destination = afterEditDestination;
    inputs.offer = "";
    await setText(contract.fields.destination, afterEditDestination);
    await setText(contract.fields.offer, "");
    await contract.generate.click({ timeout: timeoutMs }).catch(() => {});
    await page.waitForTimeout(settleMs);
    let missingErrors = [];
    for (let attempt = 0; attempt < 12; attempt += 1) {
      missingErrors = await errorMessages(page, { destination: contract.fields.destination, offer: contract.fields.offer, productName: contract.fields.productName });
      if (missingErrors.length) break;
      await page.waitForTimeout(100);
    }
    const missingApproval = await readApproval(page, contract);
    const missingBlocked = await confirmApprovalBlocked(page, contract, missingApproval);
    add("missing-required-visible-error", missingErrors.length ? "passed" : "failed",
      missingErrors.length ? "Clearing a required offer produced a visible or native validation error." : "No visible error was produced when the required offer was cleared.",
      { messages: missingErrors, approval: missingBlocked.approval }, repro(inputs));
    add("missing-required-blocks-approval", missingBlocked.blocked ? "passed" : (missingBlocked.approval.state === "unknown" ? "unassessed" : "failed"),
      missingBlocked.blocked ? "Missing required input did not leave the preview approved; an approval attempt was refused or unavailable." : "The approval state was still approved after clearing the required offer.",
      { approval: missingBlocked.approval, approveDisabled: missingBlocked.approval.approveDisabled }, repro(inputs));
    const missingSnapshot = await previewSnapshot(page, contract);
    const missingPreservedText = comparableText(missingSnapshot?.contentText) === comparableText(validBeforeInvalid?.contentText);
    const missingPreservedCta = jsonPreview(missingSnapshot?.links?.map((link) => link.rawHref)) === jsonPreview(validBeforeInvalid?.links?.map((link) => link.rawHref));
    const missingPreservedImage = jsonPreview(missingSnapshot?.images?.map((image) => image.currentSrc)) === jsonPreview(validBeforeInvalid?.images?.map((image) => image.currentSrc));
    add("missing-required-preserves-last-valid-preview", missingPreservedText && missingPreservedCta && missingPreservedImage ? "passed" : "failed",
      "A missing required input must leave the last valid preview usable.",
      { preservedText: missingPreservedText, preservedCta: missingPreservedCta, preservedImage: missingPreservedImage }, repro(inputs));
    await capture(page, recorder, outDir, { fixture: fixture.name, viewport: viewport.name, state: "missing-required", purpose: "Visible validation state for a missing required offer.", region: true });
    await captureFull(page, recorder, outDir, { fixture: fixture.name, viewport: viewport.name, state: "missing-required", purpose: "Full-page missing-required state, including the field error and the preserved preview." });

    // A second required field: clear the product name after restoring the offer.
    inputs.offer = afterEditOffer;
    inputs.productName = "";
    await setText(contract.fields.offer, afterEditOffer);
    await setText(contract.fields.productName, "");
    await contract.generate.click({ timeout: timeoutMs }).catch(() => {});
    await page.waitForTimeout(settleMs);
    let missingProductErrors = [];
    for (let attempt = 0; attempt < 12; attempt += 1) {
      missingProductErrors = await errorMessages(page, { destination: contract.fields.destination, offer: contract.fields.offer, productName: contract.fields.productName });
      if (missingProductErrors.length) break;
      await page.waitForTimeout(100);
    }
    const missingProductApproval = await readApproval(page, contract);
    const missingProductBlocked = await confirmApprovalBlocked(page, contract, missingProductApproval);
    add("missing-product-name-visible-error", missingProductErrors.length ? "passed" : "failed",
      missingProductErrors.length ? "Clearing the required product name produced a visible or native validation error." : "No visible error was produced when the required product name was cleared.",
      { messages: missingProductErrors, approval: missingProductBlocked.approval }, repro(inputs));
    add("missing-product-name-blocks-approval", missingProductBlocked.blocked ? "passed" : (missingProductBlocked.approval.state === "unknown" ? "unassessed" : "failed"),
      missingProductBlocked.blocked ? "A missing product name did not leave the preview approved; an approval attempt was refused or unavailable." : "The approval state was still approved after clearing the required product name.",
      { approval: missingProductBlocked.approval, approveDisabled: missingProductBlocked.approval.approveDisabled }, repro(inputs));
    const missingProductSnapshot = await previewSnapshot(page, contract);
    const productPreservedText = comparableText(missingProductSnapshot?.contentText) === comparableText(validBeforeInvalid?.contentText);
    const productPreservedCta = jsonPreview(missingProductSnapshot?.links?.map((link) => link.rawHref)) === jsonPreview(validBeforeInvalid?.links?.map((link) => link.rawHref));
    const productPreservedImage = jsonPreview(missingProductSnapshot?.images?.map((image) => image.currentSrc)) === jsonPreview(validBeforeInvalid?.images?.map((image) => image.currentSrc));
    add("missing-product-name-preserves-last-valid-preview", productPreservedText && productPreservedCta && productPreservedImage ? "passed" : "failed",
      "A missing product name must leave the last valid preview usable.",
      { preservedText: productPreservedText, preservedCta: productPreservedCta, preservedImage: productPreservedImage }, repro(inputs));
    await captureFull(page, recorder, outDir, { fixture: fixture.name, viewport: viewport.name, state: "missing-product-name", purpose: "Full-page missing product name state, including the form error and the preserved preview." });

    // Restore the edited valid preview before keyboard activation.
    inputs.productName = workingProductName;
    inputs.offer = afterEditOffer;
    inputs.destination = afterEditDestination;
    await setText(contract.fields.productName, workingProductName);
    await setText(contract.fields.offer, afterEditOffer);
    await setText(contract.fields.destination, afterEditDestination);
    await contract.generate.click({ timeout: timeoutMs }).catch(() => {});
    await page.waitForTimeout(settleMs);
    const restored = await waitForPreview(page, contract, (snapshot) => snapshot.links.some((link) => link.rawHref === afterEditDestination));
    if (restored) {
      const activationFocus = await keyboardFocus(page, contract, { href: afterEditDestination });
      if (!activationFocus.found) {
        add("cta-keyboard-activation", "failed", "The primary CTA could not be reached with Tab after restoring the valid preview.", activationFocus,
          [`Open ${url}, press Tab until the primary CTA receives focus, then press Enter.`]);
      } else {
        const activation = await activateWithKeyboard(page, context, afterEditDestination);
        add("cta-keyboard-activation", activation.activated ? "passed" : "failed",
          activation.activated ? "Pressing Enter on the focused primary CTA activated the exact destination." : "Keyboard activation did not reach the exact destination.",
          { ...activation, tabStops: activationFocus.tabStops }, [`Open ${url}, focus the primary CTA with Tab, press Enter, and confirm the exact destination ${afterEditDestination}.`]);
      }
    } else {
      add("cta-keyboard-activation", "unassessed", "The valid CTA could not be restored for keyboard activation.", {}, repro(inputs));
    }

    add("browser-console", consoleErrors.length === 0 ? "passed" : "failed",
      consoleErrors.length === 0 ? "No browser console errors or uncaught page errors were recorded." : "Browser console errors were recorded.",
      { consoleErrors }, repro(inputs));
  } catch (error) {
    add("runner-exception", "failed", `The runner stopped on an unexpected error: ${error.message}`, { stack: error.stack?.split("\n").slice(0, 8) }, repro(inputs));
  } finally {
    await context.close().catch(() => {});
  }
  return fixtureChecks;
}

function summarize(checks) {
  const counts = { passed: 0, failed: 0, pending: 0, unassessed: 0 };
  for (const check of checks) counts[check.state] = (counts[check.state] ?? 0) + 1;
  return counts;
}

function markdownEscape(value) {
  return String(value ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

function buildMarkdown(report) {
  const lines = [];
  lines.push(`# Campaign lab acceptance — ${report.generatedAt}`);
  lines.push("");
  lines.push(`**Status:** ${report.status.toUpperCase()}  `);
  lines.push(`**Target:** ${report.target.url}  `);
  lines.push(`**Manifest:** \`${report.target.manifest}\` (${report.target.manifestStatus})  `);
  lines.push(`**Command:** \`${report.command}\``);
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push("| Fixture | Viewport | Passed | Failed | Pending | Unassessed |");
  lines.push("| --- | --- | ---: | ---: | ---: | ---: |");
  for (const group of report.groups) {
    lines.push(`| ${markdownEscape(group.fixture)} | ${group.viewport} | ${group.counts.passed} | ${group.counts.failed} | ${group.counts.pending} | ${group.counts.unassessed} |`);
  }
  lines.push("");
  lines.push(`Totals: ${report.counts.passed} passed, ${report.counts.failed} failed, ${report.counts.pending} pending, ${report.counts.unassessed} unassessed.`);
  if (report.pendingNote) {
    lines.push("");
    lines.push(`> ${report.pendingNote}`);
  }
  lines.push("");
  lines.push("## Failures");
  lines.push("");
  if (!report.failures.length) {
    lines.push("No failed checks in this run.");
    lines.push("");
  } else {
    for (const check of report.failures) {
      lines.push(`### [${check.fixture} · ${check.viewport} px] \`${check.id}\``);
      lines.push("");
      lines.push(check.detail);
      lines.push("");
      lines.push("**Reproduce**");
      lines.push("");
      const steps = check.reproduction ?? [];
      steps.forEach((step, index) => lines.push(`${index + 1}. ${step}`));
      lines.push("");
      lines.push(`**Evidence:** ${jsonPreview(check.evidence, 1600)}`);
      const related = report.captures.filter((capture) => capture.fixture === check.fixture && capture.viewport === check.viewport);
      if (related.length) {
        lines.push("");
        lines.push("**Captures:**");
        for (const capture of related) lines.push(`- [${capture.file}](${capture.file}) — ${capture.purpose}`);
      }
      lines.push("");
    }
  }
  lines.push("## Pending");
  lines.push("");
  if (!report.pending.length) {
    lines.push("No pending checks.");
  } else {
    for (const check of report.pending) lines.push(`- **[${check.fixture} · ${check.viewport} px] \`${check.id}\`** — ${check.detail}`);
  }
  lines.push("");
  lines.push("## Unassessed");
  lines.push("");
  if (!report.unassessed.length) {
    lines.push("No unassessed checks.");
  } else {
    for (const check of report.unassessed) lines.push(`- **[${check.fixture} · ${check.viewport} px] \`${check.id}\`** — ${check.detail}`);
  }
  lines.push("");
  lines.push("## Captures for human review");
  lines.push("");
  if (!report.captures.length) {
    lines.push("No captures were produced.");
  } else {
    for (const capture of report.captures) {
      lines.push(`- [${capture.file}](${capture.file}) — ${capture.fixture} · ${capture.viewport} px · ${capture.purpose}`);
    }
  }
  lines.push("");
  lines.push("Review the captures for crop, hierarchy, repetition, and brand fit. A passing automated check is not a visual approval.");
  lines.push("");
  lines.push("## Asset check: automated versus human");
  lines.push("");
  lines.push("The runner verifies **identity and plumbing**: the rendered image URL matches the approved asset path, the bytes match the approved SHA-256 when supplied, the image loads with non-zero natural dimensions, the product label is present in the preview, and the alt text exactly matches the fixture metadata. It saves the rendered product crop next to the approved capture.");
  lines.push("");
  lines.push("The runner does **not** verify that the pictured packaging is the correct product. It cannot tell whether a generated or retouched image shows the right box, pouch, carton, wordmark, variant, count, or size. A reviewer must open the product capture and compare the visible packaging with the brand's approved packaging reference. The Momisa test showed the failure mode: an image can be present, byte-correct, and alt-correct while still showing the wrong package or an invented label. Treat the asset checks as a guard against broken or substituted files, not as packaging approval.");
  lines.push("");
  lines.push("## What this run does not assess");
  lines.push("");
  lines.push("- Subjective composition, brand fit, crop quality, hierarchy, and redundant copy: reviewer judgment from the captures.");
  lines.push("- Packaging truth: reviewer comparison with the approved physical or supplied packaging reference.");
  lines.push("- Contrast over background images, gradients, or text shadows: reported as unassessed unless a solid background is resolvable.");
  lines.push("- Non-Chromium browsers, physical devices, screen readers, zoom, and motion preferences beyond the reduced-motion capture context.");
  lines.push("- Publishing, live URLs, persistence, rollback, and analytics; this runner only exercises preview and approval in the lab.");
  lines.push("");
  lines.push("## Environment");
  lines.push("");
  lines.push(`- Node ${report.environment.node}`);
  lines.push(`- Playwright ${report.environment.playwrightVersion ?? "unknown"} · Chromium ${report.environment.chromiumVersion ?? "unknown"}`);
  lines.push(`- Viewports: ${report.environment.viewports.join(", ")}`);
  lines.push(`- Captures: \`${report.target.out}\``);
  lines.push("");
  return lines.join("\n");
}

async function main() {
  const cli = parseCli();
  const base = targetBase(cli.url);
  const manifest = readManifest(cli.manifest);
  const outDir = cli.out ?? path.join(root, ".local", "campaign-lab-acceptance", timestamp());
  mkdirSync(outDir, { recursive: true });

  const fixtures = manifest.fixtures.filter((fixture) => cli.only.length === 0 || cli.only.includes(fixture.name));
  if (!fixtures.length) throw new Error(`No fixtures matched --only ${cli.only.join(", ")}`);

  const probeUrl = fixtureUrl(base, fixtures[0]);
  const probe = await fetch(probeUrl, { redirect: "follow", signal: AbortSignal.timeout(8000) }).catch((error) => ({ error }));
  if (probe.error) {
    throw new Error(
      `Target is not reachable at ${probeUrl}: ${probe.error.message}\n` +
      "Start Agent 1's branch (or the integrated app) first, then pass its URL with --url.",
    );
  }
  if (!probe.ok) throw new Error(`Target returned HTTP ${probe.status} at ${probeUrl}. Start the campaign lab and retry.`);

  const { module: playwright, source: playwrightSource } = await loadPlaywright();
  const { chromium } = playwright;
  const chromiumExecutable = resolveChromiumExecutable(chromium);
  const browser = await chromium.launch({ headless: !cli.headed, chromiumSandbox: true, executablePath: chromiumExecutable.executablePath });
  const chromiumVersion = browser.version();
  const recorder = createRecorder();
  const command = `node scripts/campaign-lab-acceptance.mjs --url ${base.href} --manifest ${path.relative(root, cli.manifest)}`;
  const allChecks = [];

  const responsesFor = (page) => {
    const byUrl = new Map();
    const seen = [];
    page.on("response", (response) => {
      const url = response.url();
      const contentType = response.headers()["content-type"] ?? "";
      const entry = { url, status: response.status(), contentType, bodyPromise: null };
      if (/^image\//i.test(contentType) || response.request().resourceType() === "image") {
        entry.bodyPromise = response.body().catch(() => null);
      }
      byUrl.set(url, entry);
      seen.push({ url, status: response.status(), contentType });
    });
    return { byUrl, seen };
  };

  try {
    for (const fixture of fixtures) {
      for (const viewport of viewports) {
        const checks = await runFixtureViewport({ browser, base, manifest, fixture, viewport, outDir, recorder, responsesFor });
        allChecks.push(...checks);
      }
    }
  } finally {
    await browser.close().catch(() => {});
  }

  const counts = summarize(allChecks);
  const failures = allChecks.filter((check) => check.state === "failed");
  const pending = allChecks.filter((check) => check.state === "pending");
  const unassessed = allChecks.filter((check) => check.state === "unassessed");
  const pass = failures.length === 0 && (!cli.requireApproved || pending.length === 0);
  const groupKeys = [...new Set(allChecks.map((check) => `${check.fixture}\0${check.viewport}`))];
  const groups = groupKeys.map((key) => {
    const [fixture, viewport] = key.split("\0");
    return { fixture, viewport, counts: summarize(allChecks.filter((check) => check.fixture === fixture && check.viewport === viewport)) };
  });
  const status = failures.length ? "failed" : pending.length ? "pre-integration-pending" : unassessed.length ? "passed-with-unassessed" : "passed";
  const report = {
    schemaVersion: 1,
    suite: "campaign lab browser acceptance",
    generatedAt: new Date().toISOString(),
    status,
    pass,
    command,
    target: { url: base.href, manifest: path.relative(root, cli.manifest), manifestStatus: manifest.status, out: outDir, template: manifest.template ?? null },
    environment: {
      node: process.version,
      platform: `${process.platform} ${process.arch}`,
      playwrightSource,
      playwrightVersion: (() => {
        try {
          const packageFile = path.join(path.dirname(playwrightSource), "package.json");
          return JSON.parse(readFileSync(packageFile, "utf8")).version;
        } catch {
          return null;
        }
      })(),
      chromiumVersion,
      chromiumExecutable: `${chromiumExecutable.source}: ${chromiumExecutable.executablePath}`,
      viewports: viewports.map((viewport) => `${viewport.name} (${viewport.label})`),
      fixtureUrls: fixtures.map((fixture) => ({ name: fixture.name, url: fixtureUrl(base, fixture) })),
    },
    counts,
    groups,
    checks: allChecks,
    failures,
    pending,
    unassessed,
    captures: recorder.captures,
    pendingNote: pending.length
      ? "Pending checks are fixture-dependent. They are not passes. Supply the template owner's approved fixture metadata (status: \"approved\") and rerun with --require-approved before accepting the template."
      : null,
    limitations: [
      "Automated checks cover predictable failures (overflow, broken assets, exact links, keyboard focus, observable approval invalidation). They do not judge composition, crop quality, brand fit, or packaging truth.",
      "Reviewer must compare the saved product crop with the approved packaging reference. A correct image URL and alt text do not prove the packaging is correct.",
    ],
  };
  const reportJson = path.join(outDir, "report.json");
  const reportMd = path.join(outDir, "report.md");
  writeFileSync(reportJson, `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(reportMd, `${buildMarkdown(report)}\n`);

  console.log("Campaign lab acceptance");
  console.log(`Target:   ${base.href}`);
  console.log(`Manifest: ${path.relative(root, cli.manifest)} (${manifest.status})`);
  console.log(`Status:   ${status}`);
  console.log(`Checks:   ${counts.passed} passed, ${counts.failed} failed, ${counts.pending} pending, ${counts.unassessed} unassessed`);
  for (const group of groups) {
    console.log(`  ${group.fixture} @ ${group.viewport}px: ${group.counts.passed} passed, ${group.counts.failed} failed, ${group.counts.pending} pending, ${group.counts.unassessed} unassessed`);
  }
  if (failures.length) {
    console.log("\nFailures:");
    for (const check of failures) console.log(`  [${check.fixture} @ ${check.viewport}px] ${check.id}: ${check.detail}`);
  }
  if (pending.length) {
    console.log("\nPending (fixture metadata not approved; not passes):");
    for (const check of pending) console.log(`  [${check.fixture} @ ${check.viewport}px] ${check.id}: ${check.detail}`);
  }
  console.log(`\nReport:   ${path.relative(root, reportMd)}`);
  console.log(`Evidence: ${path.relative(root, reportJson)}`);
  console.log(`Captures: ${path.relative(root, outDir)}/captures`);
  if (!failures.length && pending.length) console.log("\nResult: setup and generic checks ran; fixture-dependent checks remain pending until integration supplies approved metadata.");
  if (!failures.length && pending.length && cli.requireApproved) console.log("Result: FAILED — --require-approved treats pending fixture-dependent checks as failures.");
  if (failures.length) console.log("\nResult: FAILED. Use the report's reproduction steps and captures.");
  if (!pass) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`campaign lab acceptance: ${error instanceof Error ? error.message : "unknown error"}`);
  process.exitCode = 2;
});
