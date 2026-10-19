#!/usr/bin/env node
// Bounded local-only browser SRI/CSP acceptance for the fixed Ornigami candidate.
// Requires an already-built isolated checkout and Microsoft Edge/Chromium.
import { createHash, randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { createServer, connect } from "node:net";
import { setTimeout as delay } from "node:timers/promises";

const EXPECTED_COMMIT = "71af037843847f75831c28422906a26e1a7e5f45";
const LOOPBACK_HOST = "127.0.0.1";
const SAFE_TIMEOUT_MS = 180_000;
const outputPath = process.argv[2];
const edgePath = process.env.ORNIGAMI_EDGE_PATH;
const serverPort = Number(process.env.ORNIGAMI_PREVIEW_PORT);
if (!outputPath || !edgePath || !Number.isInteger(serverPort)) {
  console.error("usage: ORNIGAMI_EDGE_PATH=<Edge executable> ORNIGAMI_PREVIEW_PORT=<port> node private-preview-browser-acceptance.mjs <result.json>");
  process.exit(2);
}

const origin = `http://${LOOPBACK_HOST}:${serverPort}`;
const browserPortServer = createServer();
await new Promise((resolve, reject) => browserPortServer.once("error", reject).listen(0, LOOPBACK_HOST, resolve));
const browserPort = browserPortServer.address().port;
await new Promise((resolve) => browserPortServer.close(resolve));

const findings = {
  schemaVersion: 1,
  candidateCommit: EXPECTED_COMMIT,
  browser: { product: "Microsoft Edge", version: null, headless: true, cleanProfile: true },
  origin,
  scope: "One clean headless browser context; all browser requests outside this exact loopback origin are failed before dispatch.",
  steps: [],
  requests: { scripts: [], blockedOffOrigin: [], otherLoopback: [] },
  scriptResponses: [],
  scriptReferences: [],
  observedScriptElements: [],
  documentPolicies: [],
  cspViolations: [],
  browserFailures: [],
  ssgManifest: { requested: false, scriptParsed: false, runtimeGlobalObserved: false, requestPaths: [] },
  coverage: { hydrationEvidence: [], dynamicScriptRequestsAfterInitialNavigation: [], publicNavigation: false },
};

let edge;
let ws;
let cdpId = 0;
const pending = new Map();
const responseByUrl = new Map();
const requestById = new Map();
const pendingCaptures = new Set();
const knownScriptPaths = new Set();
let initialScriptsCaptured = false;
let currentPhase = "startup";
let closeSocket;
const safePath = (value) => {
  try { const url = new URL(value); return `${url.pathname}${url.hash ? "#fragment" : ""}`; }
  catch { return "[invalid-url]"; }
};
const hostnameOf = (value) => { try { return new URL(value).hostname; } catch { return "[invalid-url]"; } };
const fixedError = (error) => error?.name === "TimeoutError" ? "timeout" : "browser_protocol_error";

function cdp(method, params = {}) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return Promise.reject(new Error("CDP closed"));
  const id = ++cdpId;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(Object.assign(new Error("timeout"), { name: "TimeoutError" })); }, 15_000);
    pending.set(id, { resolve, reject, timer });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression, awaitPromise = true) {
  const result = await cdp("Runtime.evaluate", { expression, awaitPromise, returnByValue: true, userGesture: true });
  if (result.exceptionDetails) throw new Error("page evaluation failed");
  return result.result?.value;
}

function hashScript(bytes) { return `sha256-${createHash("sha256").update(bytes).digest("base64")}`; }

async function captureResponse(requestId) {
  const request = requestById.get(requestId);
  if (!request || request.type !== "Script" || !request.responseUrl) return;
  try {
    const body = await cdp("Network.getResponseBody", { requestId });
    const bytes = body.base64Encoded ? Buffer.from(body.body, "base64") : Buffer.from(body.body, "utf8");
    const record = { path: safePath(request.responseUrl), phase: request.phase, bytes: bytes.length, sha256: hashScript(bytes), status: "captured" };
    findings.scriptResponses.push(record);
    const history = responseByUrl.get(request.responseUrl) ?? [];
    history.push(record);
    responseByUrl.set(request.responseUrl, history);
  } catch {
    findings.scriptResponses.push({ path: safePath(request.responseUrl), phase: request.phase, bytes: null, sha256: null, status: "body_unavailable" });
  }
}

async function waitForPageLoad() {
  const start = Date.now();
  while (Date.now() - start < SAFE_TIMEOUT_MS) {
    const state = await evaluate("document.readyState").catch(() => "");
    const pendingScripts = [...requestById.values()].some((item) => item.type === "Script" && item.finished !== true);
    if (state === "complete" && !pendingScripts && pendingCaptures.size === 0) { await delay(800); return; }
    await delay(100);
  }
  throw Object.assign(new Error("timeout"), { name: "TimeoutError" });
}

async function navigate(path, label) {
  currentPhase = label;
  const before = findings.scriptResponses.length;
  await cdp("Page.navigate", { url: `${origin}${path}` });
  await waitForPageLoad();
  const snapshot = await evaluate(`(() => {
    const scripts = [...document.scripts].filter((s) => s.src).map((s) => ({url:s.src, integrity:s.integrity || "", crossOrigin:s.crossOrigin || ""}));
    const reactNodes = [...document.querySelectorAll("body *")].slice(0, 5000);
    const hydrationSignals = reactNodes.filter((n) => Object.keys(n).some((key) => key.startsWith("__reactFiber$") || key.startsWith("__reactProps$"))).length;
    return {path:location.pathname, title:document.title, scripts, hydrationSignals, bodyPresent:!!document.body, textLength:document.body?.innerText?.length || 0, ssgGlobal:!!window.__SSG_MANIFEST};
  })()`);
  findings.steps.push({ label, path: snapshot.path, titlePresent: Boolean(snapshot.title), bodyPresent: snapshot.bodyPresent, textLength: snapshot.textLength, status: "loaded" });
  findings.coverage.hydrationEvidence.push({ label, reactBoundNodes: snapshot.hydrationSignals, observed: snapshot.hydrationSignals > 0 });
  findings.ssgManifest.runtimeGlobalObserved ||= snapshot.ssgGlobal;
  for (const item of snapshot.scripts) {
    let url;
    try { url = new URL(item.url); } catch { continue; }
    const latest = responseByUrl.get(item.url)?.at(-1);
    const integrity = item.integrity || null;
    const expected = integrity?.split(/\s+/).find((token) => token.startsWith("sha256-")) ?? null;
    const key = `${label}\n${url.pathname}\n${integrity}`;
    if (!findings.scriptReferences.some((entry) => entry.key === key)) {
      findings.scriptReferences.push({ key, phase: label, path: url.pathname, integrity, responseCaptured: Boolean(latest && latest.status === "captured"), expectedIntegrity: expected, actualIntegrity: latest?.sha256 ?? null, byteLength: latest?.bytes ?? null, integrityMatchesCapturedBytes: expected && latest?.sha256 ? expected === latest.sha256 : null });
    }
  }
  if (!initialScriptsCaptured) {
    for (const item of snapshot.scripts) { try { knownScriptPaths.add(new URL(item.url).pathname); } catch {} }
    initialScriptsCaptured = true;
  } else {
    for (const item of findings.scriptResponses.slice(before)) {
      if (!knownScriptPaths.has(item.path) && item.status === "captured") findings.coverage.dynamicScriptRequestsAfterInitialNavigation.push({ phase: label, path: item.path, sha256: item.sha256, bytes: item.bytes });
    }
  }
  if (label === "public-about-navigation") findings.coverage.publicNavigation = snapshot.path === "/about";
  return snapshot;
}

try {
  edge = spawn(edgePath, [
    "--headless=new", "--no-first-run", "--no-default-browser-check", "--disable-background-networking",
    "--disable-component-update", "--disable-default-apps", "--disable-sync", "--metrics-recording-only",
    "--disable-extensions", "--disable-features=OptimizationHints,MediaRouter,Translate,AutofillServerCommunication",
    "--disable-breakpad", "--disable-crash-reporter", "--disable-client-side-phishing-detection",
    "--host-resolver-rules=MAP * ~NOTFOUND,EXCLUDE 127.0.0.1,EXCLUDE localhost",
    `--remote-debugging-port=${browserPort}`, `--user-data-dir=${process.env.ORNIGAMI_BROWSER_PROFILE}`,
    "about:blank",
  ], { stdio: "ignore", windowsHide: true, env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, TEMP: process.env.TEMP, TMP: process.env.TMP } });
  const browserEndpoint = `http://${LOOPBACK_HOST}:${browserPort}`;
  let version;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (edge.exitCode !== null) throw new Error("browser launch failed");
    try { version = await (await fetch(`${browserEndpoint}/json/version`)).json(); break; } catch { await delay(100); }
  }
  if (!version?.webSocketDebuggerUrl) throw Object.assign(new Error("timeout"), { name: "TimeoutError" });
  findings.browser.version = String(version.Browser ?? "unknown").replace(/[^\w./ -]/g, "").slice(0, 80);
  const target = await (await fetch(`${browserEndpoint}/json/new?${encodeURIComponent("about:blank")}`, { method: "PUT" })).json();
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", () => reject(new Error("CDP websocket failed")), { once: true });
  });
  ws.addEventListener("message", (event) => {
    let message;
    try { message = JSON.parse(event.data); } catch { return; }
    if (message.id) {
      const item = pending.get(message.id);
      if (!item) return;
      clearTimeout(item.timer); pending.delete(message.id);
      if (message.error) item.reject(new Error("CDP command failed")); else item.resolve(message.result ?? {});
      return;
    }
    const { method, params = {} } = message;
    if (method === "Fetch.requestPaused") {
      let allowed = false;
      try { allowed = new URL(params.request.url).origin === origin; } catch {}
      if (!allowed) {
        const host = hostnameOf(params.request.url);
        findings.requests.blockedOffOrigin.push({ host, resourceType: params.resourceType ?? "unknown", phase: currentPhase, decision: "blocked-before-dispatch" });
        void cdp("Fetch.failRequest", { requestId: params.requestId, errorReason: "BlockedByClient" }).catch(() => {});
      } else {
        void cdp("Fetch.continueRequest", { requestId: params.requestId }).catch(() => {});
      }
    } else if (method === "Network.requestWillBeSent") {
      const item = { type: params.type ?? "Other", url: params.request.url, phase: currentPhase, finished: false };
      requestById.set(params.requestId, item);
      if (item.type === "Script") {
        const path = safePath(item.url);
        findings.requests.scripts.push({ path, phase: item.phase, initiator: params.initiator?.type ?? "unknown" });
        if (/_ssgManifest\.js(?:$|[#?])/.test(item.url)) {
          findings.ssgManifest.requested = true;
          findings.ssgManifest.requestPaths.push(path);
        }
      } else if (item.type !== "Document") findings.requests.otherLoopback.push({ type: item.type, path: safePath(item.url), phase: item.phase });
    } else if (method === "Network.responseReceived") {
      const item = requestById.get(params.requestId);
      if (item) item.responseUrl = params.response.url;
      if (item?.type === "Document") {
        const headers = Object.fromEntries(Object.entries(params.response.headers ?? {}).map(([key, value]) => [key.toLowerCase(), String(value)]));
        const csp = headers["content-security-policy"] ?? "";
        const reportOnly = headers["content-security-policy-report-only"] ?? "";
        const policy = csp || reportOnly;
        findings.documentPolicies.push({ path: safePath(params.response.url), contentSecurityPolicyPresent: Boolean(csp), reportOnlyPolicyPresent: Boolean(reportOnly), scriptNonceRequired: /script-src[^;]*'nonce-[^']+'/i.test(csp), directiveNames: [...new Set(policy.split(";").map((part) => part.trim().split(/\s+/, 1)[0]).filter(Boolean))].sort() });
      }
    } else if (method === "Network.loadingFinished") {
      const item = requestById.get(params.requestId);
      if (item) {
        item.finished = true;
        const capture = captureResponse(params.requestId).finally(() => pendingCaptures.delete(capture));
        pendingCaptures.add(capture);
      }
    } else if (method === "Network.loadingFailed") {
      const item = requestById.get(params.requestId);
      if (item) item.finished = true;
      if (params.blockedReason === "inspector") return;
      const category = params.blockedReason === "integrity" ? "sri_failure" : params.errorText?.includes("ERR_BLOCKED_BY_CLIENT") ? "request_blocked" : params.errorText?.includes("ERR_ABORTED") ? "request_cancelled" : "network_failure";
      findings.browserFailures.push({ category, path: item ? safePath(item.url) : "[unknown]", phase: item?.phase ?? currentPhase });
    } else if (method === "Debugger.scriptParsed" && /_ssgManifest\.js(?:$|[?#])/.test(params.url ?? "")) {
      findings.ssgManifest.scriptParsed = true;
    } else if (method === "Runtime.bindingCalled" && params.name === "__ornigamiEvidence") {
      try {
        const event = JSON.parse(params.payload);
        if (event.kind === "csp") findings.cspViolations.push({ phase: currentPhase, effectiveDirective: String(event.effectiveDirective ?? "unknown").slice(0, 80), disposition: String(event.disposition ?? "unknown").slice(0, 32), blockedUriClass: event.blockedUri === "inline" ? "inline" : event.blockedUri === "eval" ? "eval" : event.blockedUri ? "url" : "none" });
        else if (event.kind === "error") findings.browserFailures.push({ category: "javascript_runtime_error", phase: currentPhase, path: safePath(event.source ?? origin), line: Number.isInteger(event.line) ? event.line : null });
        else if (event.kind === "rejection") findings.browserFailures.push({ category: "unhandled_rejection", phase: currentPhase });
        else if (event.kind === "script") {
          const key = `${event.path}\n${event.integrity ?? ""}`;
          if (!findings.observedScriptElements.some((entry) => `${entry.path}\n${entry.integrity ?? ""}` === key)) findings.observedScriptElements.push({ path: event.path, integrity: event.integrity || null, crossOrigin: event.crossOrigin || null, phase: currentPhase });
        }
      } catch {}
    } else if (method === "Runtime.exceptionThrown") {
      findings.browserFailures.push({ category: /integrity|subresource/i.test(params.exceptionDetails?.text ?? "") ? "sri_failure" : "javascript_runtime_error", phase: currentPhase, path: "[runtime]" });
    } else if (method === "Log.entryAdded" && params.entry?.level === "error") {
      const text = String(params.entry.text ?? "");
      const category = /integrity|subresource integrity|Failed to find a valid digest/i.test(text) ? "sri_failure" : /content security policy|violates the following/i.test(text) ? "csp_console_error" : /hydration|server html/i.test(text) ? "hydration_error" : "console_error";
      findings.browserFailures.push({ category, phase: currentPhase, path: "[console]" });
    }
  });
  await cdp("Page.enable");
  await cdp("Runtime.enable");
  await cdp("Network.enable", { maxTotalBufferSize: 50_000_000, maxResourceBufferSize: 10_000_000 });
  await cdp("Debugger.enable");
  await cdp("Log.enable");
  await cdp("Runtime.addBinding", { name: "__ornigamiEvidence" });
  await cdp("Page.addScriptToEvaluateOnNewDocument", { source: `(() => {
    const send = (v) => { try { globalThis.__ornigamiEvidence(JSON.stringify(v)); } catch {} };
    addEventListener("securitypolicyviolation", (e) => send({kind:"csp", effectiveDirective:e.effectiveDirective, disposition:e.disposition, blockedUri:e.blockedURI === "inline" || e.blockedURI === "eval" ? e.blockedURI : e.blockedURI ? "url" : ""}), true);
    addEventListener("error", (e) => send({kind:"error", source:e.filename || "", line:e.lineno || 0}), true);
    addEventListener("unhandledrejection", () => send({kind:"rejection"}), true);
    const reportScript = (node) => { if (!(node instanceof HTMLScriptElement) || !node.src) return; let path="[invalid-url]"; try { path = new URL(node.src, location.href).pathname; } catch {} send({kind:"script", path, integrity:node.integrity || "", crossOrigin:node.crossOrigin || ""}); };
    new MutationObserver((records) => { for (const record of records) { if (record.type === "attributes") reportScript(record.target); for (const node of record.addedNodes || []) { reportScript(node); if (node.querySelectorAll) for (const script of node.querySelectorAll("script[src]")) reportScript(script); } } }).observe(document, {subtree:true, childList:true, attributes:true, attributeFilter:["src","integrity","crossorigin"]});
  })();` });
  await cdp("Fetch.enable", { patterns: [{ urlPattern: "*", requestStage: "Request" }] });

  await navigate("/", "home-initial-load");
  // Exercise a real public-page React interaction without submitting forms.
  currentPhase = "faq-interaction";
  const faqClicked = await evaluate(`(() => { const s=[...document.querySelectorAll("summary")].find((x)=>/website/i.test(x.innerText)); if (!s) return false; s.click(); return true; })()`);
  findings.steps.push({ label: "faq-interaction", status: faqClicked ? "clicked" : "control_not_found" });
  if (faqClicked) await delay(250);
  // Exercise a Next Link client-side transition, which can request route chunks.
  const aboutClicked = await evaluate(`(() => { const a=[...document.querySelectorAll('a[href="/about"]')][0]; if (!a) return false; a.click(); return true; })()`);
  if (aboutClicked) {
    currentPhase = "public-about-navigation";
    const start = Date.now();
    while (Date.now() - start < 15_000 && await evaluate("location.pathname") !== "/about") await delay(100);
    await waitForPageLoad();
  }
  findings.steps.push({ label: "public-about-link", status: aboutClicked ? "clicked" : "link_not_found" });
  if (aboutClicked) {
    const state = await evaluate("location.pathname");
    findings.coverage.publicNavigation = state === "/about";
    const snap = await evaluate(`(() => ({path:location.pathname, reactNodes:[...document.querySelectorAll('body *')].filter(n=>Object.keys(n).some(k=>k.startsWith('__reactFiber$')||k.startsWith('__reactProps$'))).length}))()`);
    findings.coverage.hydrationEvidence.push({ label: "public-about-navigation", reactBoundNodes: snap.reactNodes, observed: snap.reactNodes > 0 });
    findings.steps.push({ label: "public-about-navigation", path: state, status: state === "/about" ? "loaded" : "navigation_failed" });
    for (const item of [...requestById.values()].filter((item) => item.type === "Script" && item.phase === "public-about-link" && !knownScriptPaths.has(safePath(item.url)))) {
      const found = findings.scriptResponses.find((entry) => entry.path === safePath(item.url) && entry.phase === item.phase && entry.status === "captured");
      if (found && !findings.coverage.dynamicScriptRequestsAfterInitialNavigation.some((entry) => entry.path === found.path && entry.phase === item.phase)) findings.coverage.dynamicScriptRequestsAfterInitialNavigation.push({ phase: item.phase, path: found.path, sha256: found.sha256, bytes: found.bytes });
    }
  }
  const loginLink = await evaluate(`(() => { const a=[...document.querySelectorAll('a[href="/login"]')][0]; return Boolean(a); })()`);
  if (loginLink) {
    currentPhase = "login-link-navigation";
    await evaluate(`(() => { const a=[...document.querySelectorAll('a[href="/login"]')][0]; a.click(); return true; })()`);
    const start = Date.now();
    while (Date.now() - start < 15_000 && await evaluate("location.pathname") !== "/login") await delay(100);
    await waitForPageLoad();
    const path = await evaluate("location.pathname");
    findings.steps.push({ label: "login-link-navigation", path, status: path === "/login" ? "loaded" : "navigation_failed" });
    const loginState = await evaluate(`(() => ({reactNodes:[...document.querySelectorAll('body *')].filter(n=>Object.keys(n).some(k=>k.startsWith('__reactFiber$')||k.startsWith('__reactProps$'))).length, passwordInput:Boolean(document.querySelector('input[type=password]')), loginForm:Boolean(document.querySelector('form'))}))()`);
    findings.coverage.hydrationEvidence.push({ label: "login", reactBoundNodes: loginState.reactNodes, observed: loginState.reactNodes > 0 });
    findings.steps.push({ label: "login-form", passwordInputPresent: loginState.passwordInput, formPresent: loginState.loginForm, status: loginState.passwordInput && loginState.loginForm ? "present_not_submitted" : "expected_controls_missing" });
  } else {
    await navigate("/login", "login-direct-fallback");
    findings.steps.push({ label: "login-link-navigation", status: "link_not_found_direct_route_used" });
  }

  findings.ssgManifest.runtimeGlobalObserved ||= await evaluate("Boolean(window.__SSG_MANIFEST)").catch(() => false);
  for (const item of findings.scriptReferences) delete item.key;
  findings.summary = {
    scriptRequestCount: findings.requests.scripts.length,
    scriptResponseCount: findings.scriptResponses.length,
    scriptReferenceCount: findings.scriptReferences.length,
    referencesWithCapturedBytes: findings.scriptReferences.filter((entry) => entry.responseCaptured).length,
    referencesWithMatchingIntegrity: findings.scriptReferences.filter((entry) => entry.integrityMatchesCapturedBytes === true).length,
    referencesWithMismatchingIntegrity: findings.scriptReferences.filter((entry) => entry.integrityMatchesCapturedBytes === false).length,
    dynamicScriptRequestCount: findings.coverage.dynamicScriptRequestsAfterInitialNavigation.length,
    cspViolationCount: findings.cspViolations.length,
    sriFailureCount: findings.browserFailures.filter((entry) => entry.category === "sri_failure").length,
    runtimeFailureCount: findings.browserFailures.filter((entry) => ["javascript_runtime_error", "unhandled_rejection", "hydration_error"].includes(entry.category)).length,
    offOriginBrowserAttemptCount: findings.requests.blockedOffOrigin.length,
    allOffOriginRequestsBlocked: true,
  };
} catch (error) {
  findings.harnessFailure = fixedError(error);
} finally {
  try { if (ws) ws.close(); } catch {}
  if (edge?.pid && edge.exitCode === null) {
    await new Promise((resolve) => {
      const killer = spawn("taskkill", ["/PID", String(edge.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
      const timer = setTimeout(resolve, 10_000);
      killer.once("exit", () => { clearTimeout(timer); resolve(); });
    });
  }
  findings.browser.exitCode = edge?.exitCode ?? null;
  await import("node:fs/promises").then(({ writeFile }) => writeFile(outputPath, `${JSON.stringify(findings, null, 2)}\n`, { mode: 0o600 }));
}

if (findings.harnessFailure) {
  console.error(`browser harness ended with ${findings.harnessFailure}; sanitized evidence was written`);
  process.exitCode = 1;
} else {
  console.log(JSON.stringify(findings.summary));
}
