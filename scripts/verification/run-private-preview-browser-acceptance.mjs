#!/usr/bin/env node
// Rebuilds the fixed candidate in an isolated worktree, runs the local-only
// browser harness, retains sanitized JSON in the handoff, then removes only
// the exact task-owned temporary root/worktree.
import { createHash, randomBytes } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { createServer, connect } from "node:net";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const EXPECTED_BRANCH = "codex/ornigami-staging-readiness-20261018";
const REQUIRED_START_HEAD = process.env.ORNIGAMI_EXPECTED_START_HEAD || null;
const CANDIDATE = "71af037843847f75831c28422906a26e1a7e5f45";
const REPO = process.cwd();
const SELF = fileURLToPath(import.meta.url);
const CHECKER = path.join(REPO, "scripts/verification/ornigami-build-artifact-inventory.mjs");
const BROWSER_HARNESS = path.join(REPO, "scripts/verification/private-preview-browser-acceptance.mjs");
const RETAINED = path.join(REPO, "docs/handoffs/ORNIGAMI_PRIVATE_PREVIEW_BROWSER_71AF037_20261019.json");
const ALLOWED_HOSTS = new Set(["registry.npmjs.org", "fonts.googleapis.com", "fonts.gstatic.com"]);
const BASE_ENV_ALLOWLIST = ["PATH", "SystemRoot", "WINDIR", "SystemDrive", "TEMP", "TMP", "USERPROFILE", "APPDATA", "LOCALAPPDATA", "ProgramFiles", "ProgramFiles(x86)", "CommonProgramFiles", "ComSpec", "PATHEXT"];
const RUNNER_ENV_ALLOWLIST = ["VERCEL_ENV", "VERCEL_GIT_COMMIT_REF", "VERCEL_GIT_COMMIT_SHA", "ORNIGAMI_PRIVATE_STAGING_MODE", "AUTH_SECRET", "NEXT_PUBLIC_APP_URL", "NEXT_PUBLIC_SENTRY_DSN", "SENTRY_DSN", "SENTRY_ORG", "SENTRY_PROJECT", "NEXT_TELEMETRY_DISABLED", "NODE_OPTIONS", "HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy", "NO_PROXY", "no_proxy", "NPM_CONFIG_USERCONFIG", "NPM_CONFIG_GLOBALCONFIG", "NPM_CONFIG_CACHE", "NPM_CONFIG_REGISTRY", "NPM_CONFIG_AUDIT", "NPM_CONFIG_FUND", "NPM_CONFIG_UPDATE_NOTIFIER", "NPM_CONFIG_PROXY", "NPM_CONFIG_HTTPS_PROXY"];
const npmCli = path.resolve(path.dirname(process.execPath), "node_modules/npm/bin/npm-cli.js");
let results = {
  schemaVersion: 1,
  recordedAt: new Date().toISOString(),
  purpose: "Sanitized local browser SRI/CSP evidence for the exact application candidate; not hosted acceptance.",
  candidate: { branch: EXPECTED_BRANCH, commit: CANDIDATE, isolatedDetachedWorktree: true },
  startingRepository: { requiredHead: REQUIRED_START_HEAD, actualHead: null, branch: null },
  dependencyIdentity: null,
  guidesRead: [],
  environment: null,
  network: { scope: "Node/npm build child traffic that honors the configured local proxy only; not system-wide enforcement.", events: [], counts: {}, deniedCount: 0 },
  commands: [],
  artifactInventory: null,
  browserEvidence: null,
  temporaryResources: null,
  limitations: ["No authenticated session, application writes, provider action, database request, or hosted environment was used."],
};

function git(args, cwd = REPO) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8", windowsHide: true });
  if (result.status !== 0) throw new Error("git_precondition_failed");
  return result.stdout.trim();
}

function sha(bytes, algorithm = "sha256") { return createHash(algorithm).update(bytes).digest("hex"); }
function fixedFailure(error) { return error?.message === "git_precondition_failed" ? "git_precondition_failed" : error?.name === "TimeoutError" ? "timeout" : "runner_failure"; }

function enrichBrowserEvidence(browser, inventory) {
  const manifest = new Map((inventory?.sriEntries ?? []).map((entry) => [entry.path.replaceAll("\\", "/"), entry.expectedIntegrity]));
  const initialPaths = new Set(browser.requests.scripts.filter((entry) => entry.phase === "home-initial-load").map((entry) => entry.path));
  const checks = browser.requests.scripts.map((request) => {
    const assetPath = request.path.replace(/^\/_next\//, "");
    const expected = manifest.get(assetPath) ?? null;
    const response = browser.scriptResponses.find((entry) => entry.path === request.path && entry.phase === request.phase && entry.status === "captured") ?? null;
    const dom = browser.observedScriptElements.find((entry) => entry.path === request.path && entry.integrity) ?? null;
    const observedIntegrity = dom?.integrity ?? null;
    let status = "verified";
    if (!expected) status = "not_in_sri_manifest";
    else if (!response) status = "response_bytes_unavailable";
    else if (!observedIntegrity) status = "dom_integrity_attribute_unobserved";
    else if (observedIntegrity !== expected) status = "dom_integrity_differs_from_manifest";
    else if (response.sha256 !== expected) status = "response_digest_differs_from_manifest";
    return { path: request.path, phase: request.phase, initiator: request.initiator, manifestPath: expected ? assetPath : null, expectedIntegrity: expected, observedIntegrity, integrityObserved: Boolean(observedIntegrity), responseCaptured: Boolean(response), responseBytes: response?.bytes ?? null, actualIntegrity: response?.sha256 ?? null, integrityMatches: expected && observedIntegrity ? expected === observedIntegrity : null, responseDigestMatches: expected && response ? expected === response.sha256 : null, status };
  });
  browser.documentScriptElementChecks = browser.observedScriptElements.map((element) => {
    const assetPath = element.path.replace(/^\/_next\//, "");
    const expected = manifest.get(assetPath) ?? null;
    const response = browser.scriptResponses.find((entry) => entry.path === element.path && entry.status === "captured") ?? null;
    const requested = browser.requests.scripts.some((entry) => entry.path === element.path);
    const status = !requested ? "referenced_but_not_requested" : !response ? "requested_bytes_unavailable" : !expected ? "requested_asset_not_in_sri_manifest" : element.integrity !== expected ? "dom_integrity_differs_from_manifest" : response.sha256 !== expected ? "response_digest_differs_from_manifest" : "verified";
    return { path: element.path, phase: element.phase, integrity: element.integrity, expectedIntegrity: expected, responseCaptured: Boolean(response), actualIntegrity: response?.sha256 ?? null, status };
  });
  browser.requestedScriptChecks = checks;
  browser.coverage.dynamicScriptRequestsAfterInitialNavigation = checks.filter((entry) => entry.phase !== "home-initial-load" && !initialPaths.has(entry.path) && entry.initiator === "script").map((entry) => ({ phase: entry.phase, path: entry.path, status: entry.status, responseDigestMatches: entry.responseDigestMatches }));
  browser.summary = {
    ...browser.summary,
    scriptRequestCount: browser.requests.scripts.length,
    scriptResponseCount: browser.scriptResponses.filter((entry) => entry.status === "captured").length,
    scriptReferenceCount: browser.observedScriptElements.length,
    referencesWithCapturedBytes: checks.filter((entry) => entry.responseCaptured).length,
    referencesWithMatchingIntegrity: checks.filter((entry) => entry.status === "verified").length,
    documentScriptElementCount: browser.documentScriptElementChecks.length,
    scriptElementsReferencedButNotRequested: browser.documentScriptElementChecks.filter((entry) => entry.status === "referenced_but_not_requested").length,
    referencesWithMismatchingIntegrity: checks.filter((entry) => ["dom_integrity_differs_from_manifest", "response_digest_differs_from_manifest"].includes(entry.status)).length,
    dynamicScriptRequestCount: browser.coverage.dynamicScriptRequestsAfterInitialNavigation.length,
    cspViolationCount: browser.cspViolations.length,
    cspEnforceViolationCount: browser.cspViolations.filter((entry) => entry.disposition === "enforce").length,
    cspReportOnlyViolationCount: browser.cspViolations.filter((entry) => entry.disposition === "report").length,
    sriFailureCount: browser.browserFailures.filter((entry) => entry.category === "sri_failure").length,
    runtimeFailureCount: browser.browserFailures.filter((entry) => ["javascript_runtime_error", "unhandled_rejection", "hydration_error"].includes(entry.category)).length,
  };
}

function cleanBaseEnv() {
  const env = {};
  for (const name of BASE_ENV_ALLOWLIST) if (process.env[name] !== undefined) env[name] = process.env[name];
  return env;
}

function terminateTree(pid, child) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (method) => { if (done) return; done = true; resolve(method); };
    const killer = spawn("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
    const timer = setTimeout(() => { try { child.kill("SIGKILL"); } catch {} finish("taskkill_timeout_child_kill_fallback"); }, 10_000);
    killer.once("error", () => { clearTimeout(timer); try { child.kill("SIGKILL"); } catch {} finish("taskkill_launch_failed_child_kill_fallback"); });
    killer.once("exit", () => { clearTimeout(timer); finish("taskkill_pid_tree"); });
  });
}

async function runCommand(label, command, args, cwd, env, timeoutMs) {
  const started = Date.now();
  const child = spawn(command, args, { cwd, env, stdio: "ignore", windowsHide: true });
  let timedOut = false;
  let cleanupMethod = "not_needed";
  const exit = new Promise((resolve, reject) => {
    child.once("error", () => reject(Object.assign(new Error("launch"), { code: "LAUNCH" })));
    child.once("exit", (code, signal) => resolve({ code, signal }));
  });
  const deadline = new Promise((resolve) => {
    const timer = setTimeout(async () => {
      timedOut = true;
      cleanupMethod = await terminateTree(child.pid, child);
      resolve({ code: null, signal: null });
    }, timeoutMs);
    exit.finally(() => clearTimeout(timer));
  });
  const outcome = await Promise.race([exit, deadline]);
  const commandResult = { label, executable: command === process.execPath ? "node" : path.basename(command), args: args.map((arg) => arg === npmCli ? "<npm-cli.js>" : arg.replaceAll(cwd, "<isolated-checkout>")), exitCode: timedOut ? null : outcome.code, signal: timedOut ? null : outcome.signal, durationMs: Date.now() - started, timeoutMs, timedOut, timeoutCleanup: cleanupMethod };
  results.commands.push(commandResult);
  if (timedOut) throw Object.assign(new Error("timeout"), { name: "TimeoutError" });
  if (outcome.code !== 0) throw new Error(`${label}_failed`);
  return commandResult;
}

async function startProxy() {
  const events = [];
  const sockets = new Set();
  const server = createServer((client) => {
    sockets.add(client);
    client.once("close", () => sockets.delete(client));
    let header = Buffer.alloc(0);
    const onData = (chunk) => {
      header = Buffer.concat([header, chunk]);
      const end = header.indexOf("\r\n\r\n");
      if (end < 0 && header.length < 8192) return;
      client.removeListener("data", onData);
      const firstLine = header.subarray(0, end < 0 ? header.length : end).toString("ascii").split("\r\n", 1)[0];
      const match = firstLine.match(/^CONNECT\s+([^\s]+)\s+HTTP\/1\.[01]$/i);
      let hostname = "[invalid]";
      let port = "";
      try { const parsed = new URL(`http://${match?.[1] ?? "invalid"}`); hostname = parsed.hostname.toLowerCase(); port = parsed.port || "80"; } catch {}
      const allowed = Boolean(match && port === "443" && ALLOWED_HOSTS.has(hostname));
      events.push({ at: new Date().toISOString(), hostname, port, decision: allowed ? "allowed" : "denied" });
      if (!allowed) { client.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n"); return; }
      const remote = connect(443, hostname);
      remote.once("connect", () => {
        client.write("HTTP/1.1 200 Connection Established\r\n\r\n");
        remote.pipe(client);
        client.pipe(remote);
      });
      remote.once("error", () => client.destroy());
      client.once("error", () => remote.destroy());
      client.once("close", () => remote.destroy());
    };
    client.on("data", onData);
    client.once("error", () => {});
  });
  await new Promise((resolve, reject) => server.once("error", reject).listen(0, "127.0.0.1", resolve));
  return { server, events, sockets, url: `http://127.0.0.1:${server.address().port}` };
}

async function closeProxy(activeProxy) {
  if (!activeProxy) return;
  for (const socket of activeProxy.sockets) socket.destroy();
  await new Promise((resolve) => activeProxy.server.close(resolve));
}

async function portNumber() {
  const server = createServer();
  await new Promise((resolve, reject) => server.once("error", reject).listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function ensureLoopbackServer(port, child) {
  const until = Date.now() + 90_000;
  while (Date.now() < until) {
    if (child.exitCode !== null) throw new Error("preview_server_exited");
    const connected = await new Promise((resolve) => {
      const socket = connect(port, "127.0.0.1");
      const timer = setTimeout(() => { socket.destroy(); resolve(false); }, 500);
      socket.once("connect", () => { clearTimeout(timer); socket.destroy(); resolve(true); });
      socket.once("error", () => { clearTimeout(timer); resolve(false); });
    });
    if (connected) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw Object.assign(new Error("timeout"), { name: "TimeoutError" });
}

async function replayBrowserOnRetainedBuild(rootArgument) {
  const normalize = (value) => path.resolve(value).replaceAll("\\", "/").toLowerCase();
  const saved = JSON.parse(await readFile(RETAINED, "utf8"));
  const root = path.resolve(rootArgument);
  const checkout = path.join(root, "checkout");
  const expectedRoot = saved.temporaryResources?.root;
  const tmp = normalize(os.tmpdir());
  if (!expectedRoot || normalize(expectedRoot) !== normalize(root) || !normalize(root).startsWith(`${tmp}/ornigami-private-preview-browser-${CANDIDATE}-20261019-`) || path.resolve(checkout).substring(0, root.length + 1).toLowerCase() !== `${root.toLowerCase()}${path.sep}`.toLowerCase()) throw new Error("unsafe_existing_root_identity");
  if (git(["rev-parse", "HEAD"], checkout) !== CANDIDATE || !existsSync(path.join(checkout, ".next/BUILD_ID"))) throw new Error("existing_candidate_build_missing");
  const registrationPath = git(["worktree", "list", "--porcelain"]).split(/\r?\n\r?\n/).flatMap((block) => block.split(/\r?\n/)).find((line) => line.startsWith("worktree ") && normalize(line.slice(9)) === normalize(checkout));
  if (!registrationPath) throw new Error("existing_task_worktree_registration_missing");
  const previous = saved.browserEvidence;
  saved.browserHarnessPassHistory = [...(saved.browserHarnessPassHistory ?? []), {
    status: "superseded_incomplete_harness_reference_capture",
    buildRerun: false,
    summary: previous?.summary ?? null,
    limitation: "The first browser pass captured response bytes but only sampled script nodes remaining after route load; a document-start observer is used in the retained final pass.",
  }];
  const profile = path.join(root, "browser-profile");
  const resultPath = path.join(root, "browser-result.json");
  for (const target of [profile, resultPath]) {
    if (path.dirname(target).toLowerCase() !== root.toLowerCase()) throw new Error("unsafe_browser_state_path");
    await rm(target, { recursive: true, force: true, maxRetries: 2, retryDelay: 200 });
  }
  await mkdir(profile, { recursive: true });
  const authSecret = randomBytes(32).toString("base64url");
  const port = await portNumber();
  saved.localRuntime = { server: "next start --hostname 127.0.0.1 --port <ephemeral>", bindingHost: "127.0.0.1", port, databaseUrlConfigured: false, hostedCredentialsConfigured: false, applicationIntegrationActionsInvoked: false };
  const serverEnv = { ...cleanBaseEnv(), VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: EXPECTED_BRANCH, VERCEL_GIT_COMMIT_SHA: CANDIDATE, ORNIGAMI_PRIVATE_STAGING_MODE: "true", AUTH_SECRET: authSecret, NEXT_PUBLIC_APP_URL: "https://ornigami-preview.invalid", NEXT_PUBLIC_SENTRY_DSN: "https://synthetic@events.invalid/1", SENTRY_DSN: "https://synthetic@events.invalid/1", SENTRY_ORG: "synthetic-private-preview", SENTRY_PROJECT: "synthetic", NEXT_TELEMETRY_DISABLED: "1" };
  const server = spawn(process.execPath, [path.join(checkout, "node_modules/next/dist/bin/next"), "start", "--hostname", "127.0.0.1", "--port", String(port)], { cwd: checkout, env: serverEnv, stdio: "ignore", windowsHide: true });
  let serverCleanup = "not_needed";
  let browserCommand;
  let browserFailure = null;
  try {
    await ensureLoopbackServer(port, server);
    const edge = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
    if (!existsSync(edge)) throw new Error("approved_local_browser_not_found");
    const browserEnv = { ...cleanBaseEnv(), PATH: process.env.PATH, ORNIGAMI_EDGE_PATH: edge, ORNIGAMI_PREVIEW_PORT: String(port), ORNIGAMI_BROWSER_PROFILE: profile };
    browserCommand = await runCommand("local_browser_harness_corrected_capture", process.execPath, [BROWSER_HARNESS, resultPath], checkout, browserEnv, 240_000);
    saved.browserEvidence = JSON.parse(await readFile(resultPath, "utf8"));
    enrichBrowserEvidence(saved.browserEvidence, saved.artifactInventory);
  } catch (error) {
    browserFailure = fixedFailure(error);
    const attempted = results.commands.at(-1);
    if (attempted?.label === "local_browser_harness_corrected_capture") browserCommand = attempted;
    saved.browserRerunFailure = browserFailure;
  } finally {
    if (server.pid && server.exitCode === null) serverCleanup = await terminateTree(server.pid, server);
    saved.serverCleanupAfterBrowserRerun = serverCleanup;
  }
  if (browserCommand) saved.commands.push(browserCommand);

  const registration = () => git(["worktree", "list", "--porcelain"]).split(/\r?\n/).some((line) => line.startsWith("worktree ") && normalize(line.slice(9)) === normalize(checkout));
  const cleanupEvidence = { root, checkout, containmentValidated: true, worktreeRegistrationInitiallyPresent: true, worktreeRemoveExitCode: null, checkoutCleanupMethod: null, rootCleanupMethod: null };
  const removal = spawnSync("git", ["worktree", "remove", "--force", checkout], { cwd: REPO, encoding: "utf8", windowsHide: true, timeout: 30_000 });
  cleanupEvidence.worktreeRemoveExitCode = removal.status;
  if (registration()) {
    throw new Error("task_worktree_registration_remains_after_git_remove");
  }
  if (existsSync(checkout)) {
    try { await rm(checkout, { recursive: true, force: true, maxRetries: 2, retryDelay: 250 }); }
    catch {
      const literal = checkout.replaceAll("'", "''");
      const ps = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", `Remove-Item -LiteralPath '${literal}' -Recurse -Force -ErrorAction Stop`], { encoding: "utf8", windowsHide: true, timeout: 60_000 });
      cleanupEvidence.fallbackMethod = "validated PowerShell Remove-Item -LiteralPath";
      if (ps.status !== 0) throw new Error("task_checkout_cleanup_failed");
    }
  }
  cleanupEvidence.checkoutCleanupMethod = removal.status === 0 ? "git worktree remove --force" : cleanupEvidence.fallbackMethod ?? "node fs.rm after confirming worktree registration was absent";
  if (existsSync(checkout)) throw new Error("task_checkout_still_present");
  try { await rm(root, { recursive: true, force: true, maxRetries: 2, retryDelay: 250 }); }
  catch {
    const literal = root.replaceAll("'", "''");
    const ps = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", `Remove-Item -LiteralPath '${literal}' -Recurse -Force -ErrorAction Stop`], { encoding: "utf8", windowsHide: true, timeout: 60_000 });
    cleanupEvidence.fallbackMethod = "validated PowerShell Remove-Item -LiteralPath";
    if (ps.status !== 0) throw new Error("task_root_cleanup_failed");
  }
  cleanupEvidence.rootCleanupMethod = cleanupEvidence.fallbackMethod?.includes("PowerShell") ? cleanupEvidence.fallbackMethod : "node fs.rm after confirming checkout absence";
  cleanupEvidence.worktreeRegistrationAbsent = !registration();
  cleanupEvidence.checkoutAbsent = !existsSync(checkout);
  cleanupEvidence.rootAbsent = !existsSync(root);
  const remaining = git(["worktree", "list", "--porcelain"]).split(/\r?\n\r?\n/).map((block) => block.split(/\r?\n/).find((line) => line.startsWith("worktree "))?.slice(9)).filter(Boolean);
  cleanupEvidence.unrelatedWorktreesPreserved = remaining.filter((entry) => normalize(entry) !== normalize(REPO));
  cleanupEvidence.cleanupComplete = cleanupEvidence.worktreeRegistrationAbsent && cleanupEvidence.checkoutAbsent && cleanupEvidence.rootAbsent;
  saved.temporaryResources = cleanupEvidence;
  saved.harnessSources = {
    runner: { path: "scripts/verification/run-private-preview-browser-acceptance.mjs", sha256: sha(await readFile(SELF)) },
    browserHarness: { path: "scripts/verification/private-preview-browser-acceptance.mjs", sha256: sha(await readFile(BROWSER_HARNESS)) },
    execution: "Node.js DevTools Protocol; no browser automation dependency added.",
  };
  saved.recordedAt = new Date().toISOString();
  await writeFile(RETAINED, `${JSON.stringify(saved, null, 2)}\n`, { mode: 0o600 });
  if (browserFailure) throw new Error(`browser_replay_${browserFailure}`);
  return { browser: saved.browserEvidence.summary, cleanup: cleanupEvidence };
}

if (process.argv[2] === "--browser-only-task-root") {
  try {
    const summary = await replayBrowserOnRetainedBuild(process.argv[3]);
    console.log(JSON.stringify(summary));
  } catch (error) {
    console.error(`browser replay stopped with ${fixedFailure(error)}; prior sanitized evidence retained`);
    process.exitCode = 1;
  }
  if (process.exitCode) process.exit(process.exitCode);
  process.exit(0);
}

let taskRoot;
let checkout;
let worktreeRegistered = false;
let npmConfigEnv;
let proxy;
let proxyEvents = [];
let serverChild;
let serverCleanup = "not_needed";
let buildSucceeded = false;
let finalError = null;
try {
  const actualBranch = git(["branch", "--show-current"]);
  const actualHead = git(["rev-parse", "HEAD"]);
  results.startingRepository = { requiredHead: REQUIRED_START_HEAD, actualHead, branch: actualBranch };
  const dirtyPaths = git(["status", "--porcelain=v1"]).split(/\r?\n/).filter(Boolean).map((line) => line.slice(3).replaceAll("\\", "/")).sort();
  const allowedHarnessChanges = ["scripts/verification/private-preview-browser-acceptance.mjs", "scripts/verification/run-private-preview-browser-acceptance.mjs"].sort();
  if (actualBranch !== EXPECTED_BRANCH || (REQUIRED_START_HEAD && actualHead !== REQUIRED_START_HEAD) || (dirtyPaths.length && JSON.stringify(dirtyPaths) !== JSON.stringify(allowedHarnessChanges))) throw new Error("git_precondition_failed");
  git(["cat-file", "-e", `${CANDIDATE}^{commit}`]);
  taskRoot = await mkdtemp(path.join(os.tmpdir(), `ornigami-private-preview-browser-${CANDIDATE}-20261019-`));
  checkout = path.join(taskRoot, "checkout");
  if (!path.resolve(checkout).startsWith(`${path.resolve(taskRoot)}${path.sep}`)) throw new Error("unsafe_checkout_path");
  git(["worktree", "add", "--detach", checkout, CANDIDATE]);
  worktreeRegistered = true;
  if (git(["rev-parse", "HEAD"], checkout) !== CANDIDATE || git(["status", "--porcelain=v1"], checkout)) throw new Error("candidate_checkout_mismatch");
  const preinstall = [".env", ".env.local", ".env.production", ".vercel", ".next", "node_modules", "private evidence"];
  const unexpectedlyPresent = preinstall.filter((name) => existsSync(path.join(checkout, name)));
  results.isolatedCheckout = { commit: CANDIDATE, trackedDotEnvTemplate: existsSync(path.join(checkout, ".env.example")), expectedAbsent: preinstall, unexpectedlyPresent };
  if (unexpectedlyPresent.length) throw new Error("unexpected_checkout_state");
  const archive = path.join(checkout, "vendor/framework/next-16.4.2-ornigami-sri.2.tgz");
  const lockBytes = await readFile(path.join(checkout, "package-lock.json"));
  const archiveBytes = await readFile(archive);
  const lock = JSON.parse(lockBytes.toString("utf8"));
  const lockedNext = lock.packages?.["node_modules/next"];
  const archiveSha512 = `sha512-${createHash("sha512").update(archiveBytes).digest("base64")}`;
  results.dependencyIdentity = { node: process.version, npm: null, packageLockSha256: sha(lockBytes), next: lockedNext?.version, nextResolved: lockedNext?.resolved, nextIntegrity: lockedNext?.integrity, nextArchiveBytes: archiveBytes.length, nextArchiveSha256: sha(archiveBytes), nextArchiveSha512Integrity: archiveSha512, nextArchiveMatchesLock: archiveSha512 === lockedNext?.integrity };
  if (!results.dependencyIdentity.nextArchiveMatchesLock || lockedNext?.version !== "16.4.2") throw new Error("dependency_identity_mismatch");

  const userConfig = path.join(taskRoot, "npm-user-empty.rc");
  const globalConfig = path.join(taskRoot, "npm-global-empty.rc");
  const npmCache = path.join(taskRoot, "npm-cache");
  await Promise.all([writeFile(userConfig, "", { mode: 0o600 }), writeFile(globalConfig, "", { mode: 0o600 }), mkdir(npmCache, { recursive: true })]);
  proxy = await startProxy();
  const disposableAuthSecret = randomBytes(32).toString("base64url");
  const runnerEnvValues = {
    VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: EXPECTED_BRANCH, VERCEL_GIT_COMMIT_SHA: CANDIDATE,
    ORNIGAMI_PRIVATE_STAGING_MODE: "true", AUTH_SECRET: disposableAuthSecret,
    NEXT_PUBLIC_APP_URL: "https://ornigami-preview.invalid", NEXT_PUBLIC_SENTRY_DSN: "https://synthetic@events.invalid/1",
    SENTRY_DSN: "https://synthetic@events.invalid/1", SENTRY_ORG: "synthetic-private-preview", SENTRY_PROJECT: "synthetic",
    NEXT_TELEMETRY_DISABLED: "1", NODE_OPTIONS: "--use-env-proxy",
    HTTP_PROXY: proxy.url, HTTPS_PROXY: proxy.url, http_proxy: proxy.url, https_proxy: proxy.url,
    NO_PROXY: "127.0.0.1,localhost", no_proxy: "127.0.0.1,localhost",
    NPM_CONFIG_USERCONFIG: userConfig, NPM_CONFIG_GLOBALCONFIG: globalConfig, NPM_CONFIG_CACHE: npmCache,
    NPM_CONFIG_REGISTRY: "https://registry.npmjs.org/", NPM_CONFIG_AUDIT: "false", NPM_CONFIG_FUND: "false",
    NPM_CONFIG_UPDATE_NOTIFIER: "false", NPM_CONFIG_PROXY: proxy.url, NPM_CONFIG_HTTPS_PROXY: proxy.url,
  };
  npmConfigEnv = { ...cleanBaseEnv(), ...runnerEnvValues };
  const npmVersion = spawnSync(process.execPath, [npmCli, "--version"], { encoding: "utf8", windowsHide: true, env: npmConfigEnv });
  if (npmVersion.status !== 0 || !/^\d+\.\d+\.\d+$/.test(npmVersion.stdout.trim())) throw new Error("npm_version_unavailable");
  results.dependencyIdentity.npm = npmVersion.stdout.trim();
  results.environment = {
    inheritedProcessEnvironmentNameAllowlist: BASE_ENV_ALLOWLIST.filter((name) => process.env[name] !== undefined),
    explicitChildEnvironmentNameAllowlist: RUNNER_ENV_ALLOWLIST,
    syntheticValues: Object.fromEntries(Object.entries(runnerEnvValues).map(([name, value]) => [name, name === "AUTH_SECRET" ? "one-run random 32-byte base64url value, in-memory only; not retained" : name.includes("DSN") ? "synthetic .invalid DSN" : name.includes("PROXY") ? "task-scoped loopback proxy URL" : value])),
    explicitlyAbsent: ["DATABASE_URL", "SENTRY_AUTH_TOKEN", "Google credentials", "hosted/provider credentials"],
    npmUserAndGlobalConfig: "empty files under the task temporary root",
    npmCache: "task temporary root",
    proxyDestinationAllowlist: [...ALLOWED_HOSTS].sort(),
    childReceivesOnlyAllowlistedInheritedAndExplicitNames: true,
  };
  const node = process.execPath;
  await runCommand("npm_ci", node, [npmCli, "ci", "--no-audit", "--no-fund", "--loglevel=error"], checkout, npmConfigEnv, 1_800_000);
  for (const guide of ["node_modules/next/dist/docs/01-app/02-guides/building.md", "node_modules/next/dist/docs/01-app/02-guides/environment-variables.md", "node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md", "node_modules/next/dist/docs/01-app/02-guides/testing/playwright.md", "node_modules/next/dist/docs/01-app/01-getting-started/04-linking-and-navigating.md", "node_modules/next/dist/docs/01-app/01-getting-started/13-fonts.md"]) {
    const bytes = await readFile(path.join(checkout, guide));
    results.guidesRead.push({ path: guide.replaceAll("\\", "/"), bytes: bytes.length, sha256: sha(bytes) });
  }
  const installedNext = JSON.parse(await readFile(path.join(checkout, "node_modules/next/package.json"), "utf8"));
  if (installedNext.version !== "16.4.2") throw new Error("installed_next_version_mismatch");
  await runCommand("npm_run_build", node, [npmCli, "run", "build"], checkout, npmConfigEnv, 900_000);
  buildSucceeded = true;
  if (proxy) {
    proxyEvents = proxy.events;
    await closeProxy(proxy);
    proxy = null;
  }
  const artifact = spawnSync(node, [CHECKER, path.join(checkout, ".next")], { cwd: checkout, env: { ...cleanBaseEnv(), PATH: process.env.PATH }, encoding: "utf8", windowsHide: true, timeout: 120_000, maxBuffer: 25_000_000 });
  results.commands.push({ label: "artifact_inventory", executable: "node", args: ["scripts/verification/ornigami-build-artifact-inventory.mjs", ".next"], exitCode: artifact.status, signal: artifact.signal, timeoutMs: 120_000, timedOut: artifact.error?.code === "ETIMEDOUT", timeoutCleanup: "node child process; bounded 120000 ms" });
  if (artifact.status !== 0) throw new Error("artifact_inventory_failed");
  results.artifactInventory = JSON.parse(artifact.stdout);

  const startPort = await portNumber();
  results.localRuntime = { server: "next start --hostname 127.0.0.1 --port <ephemeral>", bindingHost: "127.0.0.1", port: startPort, databaseUrlConfigured: false, hostedCredentialsConfigured: false, applicationIntegrationActionsInvoked: false };
  const serverEnv = { ...cleanBaseEnv(), VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: EXPECTED_BRANCH, VERCEL_GIT_COMMIT_SHA: CANDIDATE, ORNIGAMI_PRIVATE_STAGING_MODE: "true", AUTH_SECRET: disposableAuthSecret, NEXT_PUBLIC_APP_URL: "https://ornigami-preview.invalid", NEXT_PUBLIC_SENTRY_DSN: "https://synthetic@events.invalid/1", SENTRY_DSN: "https://synthetic@events.invalid/1", SENTRY_ORG: "synthetic-private-preview", SENTRY_PROJECT: "synthetic", NEXT_TELEMETRY_DISABLED: "1" };
  serverChild = spawn(node, [path.join(checkout, "node_modules/next/dist/bin/next"), "start", "--hostname", "127.0.0.1", "--port", String(startPort)], { cwd: checkout, env: serverEnv, stdio: "ignore", windowsHide: true });
  await ensureLoopbackServer(startPort, serverChild);
  const edge = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
  if (!existsSync(edge)) throw new Error("approved_local_browser_not_found");
  const profile = path.join(taskRoot, "browser-profile");
  await mkdir(profile, { recursive: true });
  const browserResultPath = path.join(taskRoot, "browser-result.json");
  const browserEnv = { ...cleanBaseEnv(), PATH: process.env.PATH, ORNIGAMI_EDGE_PATH: edge, ORNIGAMI_PREVIEW_PORT: String(startPort), ORNIGAMI_BROWSER_PROFILE: profile };
  await runCommand("local_browser_harness", node, [BROWSER_HARNESS, browserResultPath], checkout, browserEnv, 240_000);
  results.browserEvidence = JSON.parse(await readFile(browserResultPath, "utf8"));
  enrichBrowserEvidence(results.browserEvidence, results.artifactInventory);
} catch (error) {
  finalError = fixedFailure(error);
  results.runnerFailure = finalError;
} finally {
  if (serverChild?.pid && serverChild.exitCode === null) serverCleanup = await terminateTree(serverChild.pid, serverChild);
  if (proxy) {
    proxyEvents = proxy.events;
    await closeProxy(proxy);
    proxy = null;
  }
  results.network.events = proxyEvents;
  results.network.deniedCount = proxyEvents.filter((event) => event.decision === "denied").length;
  results.network.counts = Object.fromEntries([...new Set(proxyEvents.map((event) => event.hostname))].sort().map((host) => [host, proxyEvents.filter((event) => event.hostname === host).length]));
  results.serverCleanup = serverCleanup;
  if (checkout && taskRoot) {
    const resolvedRoot = path.resolve(taskRoot);
    const resolvedCheckout = path.resolve(checkout);
    const safe = resolvedCheckout.startsWith(`${resolvedRoot}${path.sep}`) && path.basename(resolvedCheckout) === "checkout" && path.basename(resolvedRoot).startsWith(`ornigami-private-preview-browser-${CANDIDATE}-20261019-`);
    if (safe) {
        const normalizePath = (value) => path.resolve(value).replaceAll("\\", "/").toLowerCase();
        const exactRegistration = git(["worktree", "list", "--porcelain"]).split(/\r?\n\r?\n/).find((block) => block.split(/\r?\n/).some((line) => line.startsWith("worktree ") && normalizePath(line.slice(9)) === normalizePath(resolvedCheckout)));
      if (exactRegistration) {
        const removed = spawnSync("git", ["worktree", "remove", "--force", resolvedCheckout], { cwd: REPO, encoding: "utf8", windowsHide: true, timeout: 30_000 });
        results.worktreeRemoval = { method: "git worktree remove --force", exitCode: removed.status, timedOut: removed.error?.code === "ETIMEDOUT" };
        worktreeRegistered = removed.status !== 0 && git(["worktree", "list", "--porcelain"]).split(/\r?\n/).some((line) => line.startsWith("worktree ") && normalizePath(line.slice(9)) === normalizePath(resolvedCheckout));
        if (removed.status === 0) results.checkoutCleanupMethod = "git worktree remove --force";
      }
      const remains = existsSync(resolvedCheckout);
      if (remains && !worktreeRegistered) {
        try {
          await rm(resolvedCheckout, { recursive: true, force: true, maxRetries: 2, retryDelay: 250 });
          results.checkoutFallbackRemoved = true;
          results.checkoutCleanupMethod = "node fs.rm after confirming worktree registration was absent";
        } catch { results.checkoutFallbackRemoved = false; }
      }
      const checkoutAbsent = !existsSync(resolvedCheckout);
      if (checkoutAbsent && !worktreeRegistered) {
        try { await rm(resolvedRoot, { recursive: true, force: true, maxRetries: 2, retryDelay: 250 }); results.rootCleanupMethod = "node fs.rm after confirming checkout absence"; }
        catch { results.rootRemovalFailed = true; }
      }
      const remainingRegistration = git(["worktree", "list", "--porcelain"]).split(/\r?\n/).some((line) => line.startsWith("worktree ") && normalizePath(line.slice(9)) === normalizePath(resolvedCheckout));
      results.temporaryResources = { root: resolvedRoot, checkout: resolvedCheckout, containmentValidated: safe, worktreeRegistrationAbsent: !remainingRegistration, checkoutAbsent: !existsSync(resolvedCheckout), rootAbsent: !existsSync(resolvedRoot), cleanupIncomplete: remainingRegistration || existsSync(resolvedCheckout) || existsSync(resolvedRoot), unrelatedWorktreesPreserved: git(["worktree", "list", "--porcelain"]).split(/\r?\n\r?\n/).map((block) => block.split(/\r?\n/).find((line) => line.startsWith("worktree "))?.slice(9)).filter(Boolean).filter((entry) => entry !== REPO && !entry.toLowerCase().includes(CANDIDATE)) };
    } else {
      results.temporaryResources = { status: "cleanup_stopped_unsafe_identity", root: resolvedRoot, checkout: resolvedCheckout, containmentValidated: false };
    }
  } else {
    results.temporaryResources = { status: "task_root_not_created" };
  }
  results.recordedAt = new Date().toISOString();
  results.harnessSources = {
    runner: { path: "scripts/verification/run-private-preview-browser-acceptance.mjs", sha256: sha(await readFile(SELF)) },
    browserHarness: { path: "scripts/verification/private-preview-browser-acceptance.mjs", sha256: sha(await readFile(BROWSER_HARNESS)) },
    execution: "Node.js DevTools Protocol; no browser automation dependency added.",
  };
  await writeFile(RETAINED, `${JSON.stringify(results, null, 2)}\n`, { mode: 0o600 });
}

if (finalError) {
  console.error(`isolated browser acceptance ended with ${finalError}; sanitized record retained`);
  process.exitCode = 1;
} else {
  const summary = { commands: results.commands.map(({ label, exitCode, durationMs, timedOut }) => ({ label, exitCode, durationMs, timedOut })), browser: results.browserEvidence?.summary, temporaryResources: results.temporaryResources };
  console.log(JSON.stringify(summary));
}
