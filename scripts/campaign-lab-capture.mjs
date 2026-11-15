import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const chromeCandidates = [
  process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "google-chrome",
  "chromium",
].filter(Boolean);

const chromePath = chromeCandidates.find((candidate) => {
  if (candidate.includes("/") || candidate.includes("\\")) return existsSync(candidate);
  return true;
});

if (!chromePath) {
  throw new Error("Chrome or Edge was not found. Set CHROME_PATH to a browser executable.");
}

const base = process.env.CAMPAIGN_LAB_BASE ?? "http://localhost:3000";
const outputDir = resolve(".local/campaign-lab");
await mkdir(outputDir, { recursive: true });

const port = 9400 + Math.floor(Math.random() * 200);
const profileDir = join(tmpdir(), `ornigami-campaign-lab-capture-${process.pid}`);
await mkdir(profileDir, { recursive: true });

const browser = spawn(
  chromePath,
  [
    "--headless=new",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    "--hide-scrollbars",
    "--force-color-profile=srgb",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-background-networking",
    "--disable-component-update",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profileDir}`,
    "about:blank",
  ],
  { stdio: "ignore" },
);

async function waitForDevtools() {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (response.ok) return response.json();
    } catch {
      // Browser is still starting.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 120));
  }
  throw new Error("Chrome DevTools did not start.");
}

const version = await waitForDevtools();
const socket = new WebSocket(version.webSocketDebuggerUrl);
await new Promise((resolveOpen, rejectOpen) => {
  socket.addEventListener("open", resolveOpen, { once: true });
  socket.addEventListener("error", rejectOpen, { once: true });
});

let nextId = 1;
const pending = new Map();
socket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (!message.id) return;
  const entry = pending.get(message.id);
  if (!entry) return;
  pending.delete(message.id);
  if (message.error) entry.reject(new Error(message.error.message));
  else entry.resolve(message.result);
});

function send(method, params = {}, sessionId) {
  const id = nextId++;
  return new Promise((resolveSend, rejectSend) => {
    pending.set(id, { resolve: resolveSend, reject: rejectSend });
    socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
}

async function evaluate(sessionId, script) {
  const result = await send(
    "Runtime.evaluate",
    { expression: script, awaitPromise: true, returnByValue: true },
    sessionId,
  );
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text ?? "Page evaluation failed.");
  }
  return result.result?.value;
}

async function waitForPageReady(sessionId) {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    try {
      const ready = await evaluate(
        sessionId,
        `new Promise((resolve) => {
          const started = Date.now();
          const tick = () => {
            if (document.readyState === "complete" && document.body && document.body.innerText.includes("Campaign preview")) {
              resolve(true);
              return;
            }
            if (Date.now() - started > 8000) {
              resolve(false);
              return;
            }
            setTimeout(tick, 100);
          };
          tick();
        })`,
      );
      if (ready) break;
    } catch {
      // Navigation may not have created the execution context yet.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 150));
  }

  await evaluate(
    sessionId,
    `Promise.all([
      document.fonts.ready,
      new Promise((resolveImages) => {
        const images = [...document.images];
        if (images.every((image) => image.complete)) return resolveImages(true);
        let remaining = images.length;
        const finish = () => {
          remaining -= 1;
          if (remaining <= 0) resolveImages(true);
        };
        for (const image of images) {
          if (image.complete) finish();
          else {
            image.addEventListener("load", finish, { once: true });
            image.addEventListener("error", finish, { once: true });
          }
        }
        setTimeout(() => resolveImages(true), 5000);
      }),
    ])`,
  );

  await new Promise((resolveWait) => setTimeout(resolveWait, 250));
}

async function capture({ url, width, height, out, fullPage = false, selector, firstScreen = false }) {
  const { targetId } = await send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });

  await send("Page.enable", {}, sessionId);
  await send("Runtime.enable", {}, sessionId);
  await send(
    "Emulation.setDeviceMetricsOverride",
    {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: width < 600,
      screenWidth: width,
      screenHeight: height,
    },
    sessionId,
  );
  await send("Page.navigate", { url }, sessionId);
  await waitForPageReady(sessionId);

  await evaluate(
    sessionId,
    `(() => {
      document.querySelectorAll("nextjs-portal").forEach((element) => element.remove());
      document.querySelectorAll("[data-nextjs-toast]").forEach((element) => element.remove());
      return true;
    })()`,
  );

  let clip = null;
  if (selector) {
    const rect = await evaluate(
      sessionId,
      `(() => {
        const element = document.querySelector(${JSON.stringify(selector)});
        if (!element) return null;
        const bounds = element.getBoundingClientRect();
        return {
          x: bounds.left + window.scrollX,
          y: bounds.top + window.scrollY,
          width: bounds.width,
          height: bounds.height,
        };
      })()`,
    );
    if (!rect) throw new Error(`Selector not found: ${selector}`);
    clip = {
      x: Math.max(0, Math.floor(rect.x)),
      y: Math.max(0, Math.floor(rect.y)),
      width: Math.ceil(rect.width),
      height: firstScreen ? Math.min(Math.ceil(rect.height), Math.ceil(height)) : Math.ceil(rect.height),
      scale: 1,
    };
  } else if (fullPage) {
    const metrics = await send("Page.getLayoutMetrics", {}, sessionId);
    const content = metrics.cssContentSize ?? metrics.contentSize;
    clip = {
      x: 0,
      y: 0,
      width: Math.ceil(content.width),
      height: Math.ceil(content.height),
      scale: 1,
    };
  }

  const screenshot = await send(
    "Page.captureScreenshot",
    {
      format: "png",
      fromSurface: true,
      captureBeyondViewport: true,
      ...(clip ? { clip } : {}),
    },
    sessionId,
  );

  const outputPath = join(outputDir, out);
  await writeFile(outputPath, Buffer.from(screenshot.data, "base64"));

  const metrics = await evaluate(
    sessionId,
    `(() => {
      const canvas = document.querySelector("[data-preview-canvas]");
      if (!canvas) return null;
      const base = canvas.getBoundingClientRect();
      const relative = (element) => {
        if (!element) return null;
        const bounds = element.getBoundingClientRect();
        return {
          top: Math.round(bounds.top - base.top),
          left: Math.round(bounds.left - base.left),
          width: Math.round(bounds.width),
          height: Math.round(bounds.height),
        };
      };
      return {
        viewport: { width: window.innerWidth, height: window.innerHeight },
        canvas: { width: Math.round(base.width), height: Math.round(base.height) },
        horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth,
        headline: relative(canvas.querySelector("h1")),
        image: relative(canvas.querySelector("figure")),
        firstOffer: relative(canvas.querySelector("[class*='offer']")),
        firstAction: relative(canvas.querySelector("a")),
        regionName: (() => {
          const region = canvas.closest("section[aria-labelledby]");
          const heading = region && document.getElementById(region.getAttribute("aria-labelledby"));
          return heading ? heading.textContent.trim() : null;
        })(),
      };
    })()`,
  );

  await send("Target.closeTarget", { targetId });
  return { outputPath, clip, metrics };
}

const captures = [];

captures.push(
  await capture({
    url: `${base}/campaign-lab?fixture=sparse`,
    width: 1440,
    height: 1000,
    out: "desktop-lab-sparse.png",
    fullPage: true,
  }),
);
captures.push(
  await capture({
    url: `${base}/campaign-lab?fixture=sparse`,
    width: 1440,
    height: 1000,
    out: "desktop-preview-sparse.png",
    selector: "[data-preview-canvas]",
  }),
);
captures.push(
  await capture({
    url: `${base}/campaign-lab?fixture=sparse`,
    width: 1440,
    height: 1000,
    out: "desktop-first-screen-sparse.png",
    selector: "[data-preview-canvas]",
    firstScreen: true,
  }),
);
captures.push(
  await capture({
    url: `${base}/campaign-lab?fixture=sparse`,
    width: 390,
    height: 844,
    out: "mobile-preview-sparse.png",
    selector: "[data-preview-canvas]",
  }),
);
captures.push(
  await capture({
    url: `${base}/campaign-lab?fixture=sparse`,
    width: 390,
    height: 844,
    out: "mobile-first-screen-sparse.png",
    selector: "[data-preview-canvas]",
    firstScreen: true,
  }),
);
captures.push(
  await capture({
    url: `${base}/campaign-lab?fixture=long-copy`,
    width: 1440,
    height: 1000,
    out: "desktop-preview-long-copy.png",
    selector: "[data-preview-canvas]",
  }),
);
captures.push(
  await capture({
    url: `${base}/campaign-lab?fixture=long-copy`,
    width: 1440,
    height: 1000,
    out: "desktop-first-screen-long-copy.png",
    selector: "[data-preview-canvas]",
    firstScreen: true,
  }),
);
captures.push(
  await capture({
    url: `${base}/campaign-lab?fixture=long-copy`,
    width: 390,
    height: 844,
    out: "mobile-preview-long-copy.png",
    selector: "[data-preview-canvas]",
  }),
);
captures.push(
  await capture({
    url: `${base}/campaign-lab?fixture=long-copy`,
    width: 390,
    height: 844,
    out: "mobile-first-screen-long-copy.png",
    selector: "[data-preview-canvas]",
    firstScreen: true,
  }),
);
captures.push(
  await capture({
    url: `${base}/campaign-lab?fixture=long-copy`,
    width: 390,
    height: 844,
    out: "mobile-lab-long-copy.png",
    fullPage: true,
  }),
);

console.log(JSON.stringify({ outputDir, captures }, null, 2));

socket.close();
browser.kill();
await rm(profileDir, { recursive: true, force: true }).catch(() => {});
