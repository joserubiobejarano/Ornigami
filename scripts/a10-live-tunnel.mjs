import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, realpath } from "node:fs/promises";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { checkPrivateArtifact } from "./a12-support-access-verify.mjs";

export const A10_CLOUDFLARED_SHA256 = "f096265ec2fcbe9bb6e2d64268db167ced3fcbb83d894bdb9e2fcdb26f2ea7e2";
const DEFAULT_STARTUP_TIMEOUT_MS = 45_000;
const DEFAULT_SHUTDOWN_TIMEOUT_MS = 8_000;
const MAX_STARTUP_TIMEOUT_MS = 60_000;
const MAX_SHUTDOWN_TIMEOUT_MS = 15_000;

/** @typedef {{ url: string, close: () => Promise<void> }} A10WebhookProxy */
/** @typedef {{ publicBaseUrl: string, webhookUrl: string, close: () => Promise<void> }} A10LiveTunnel */
/** @typedef {(command: string, args: readonly string[], options: import("node:child_process").SpawnOptions) => import("node:child_process").ChildProcess} A10TunnelSpawner */

function validateProxy(proxy) {
  if (!proxy || typeof proxy.close !== "function" || typeof proxy.url !== "string") {
    throw new Error("A10 tunnel requires the live webhook proxy handle");
  }
  let url;
  try { url = new URL(proxy.url); }
  catch { throw new Error("A10 tunnel target must be the loopback webhook proxy"); }
  if (url.protocol !== "http:" || url.hostname !== "127.0.0.1" || !url.port || url.username || url.password ||
      (url.pathname !== "" && url.pathname !== "/") || url.search || url.hash) {
    throw new Error("A10 tunnel accepts only the loopback webhook proxy URL");
  }
  return url.origin;
}

async function sha256File(path) {
  return new Promise((resolveHash, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(path);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.once("error", reject);
    stream.once("end", () => resolveHash(hash.digest("hex")));
  });
}

/** Verify the task-local executable's identity, digest and private ACL before launch. */
export async function verifyA10Cloudflared(workspaceRoot = process.cwd()) {
  const root = resolve(workspaceRoot);
  const expectedPath = resolve(root, ".env.a10-live-resend", "tools", "cloudflared.exe");
  let stat;
  try { stat = await lstat(expectedPath); }
  catch { throw new Error("Pinned task-local cloudflared executable is unavailable"); }
  if (!stat.isFile() || stat.isSymbolicLink() || await realpath(expectedPath) !== expectedPath) {
    throw new Error("Pinned task-local cloudflared executable identity is invalid");
  }
  try { await checkPrivateArtifact(expectedPath); }
  catch { throw new Error("Pinned task-local cloudflared executable is not private to the current user"); }
  if (await sha256File(expectedPath) !== A10_CLOUDFLARED_SHA256) {
    throw new Error("Pinned task-local cloudflared executable checksum did not match");
  }
  return expectedPath;
}

function safeChildEnvironment(source = process.env) {
  const output = Object.create(null);
  for (const key of ["PATH", "Path", "SystemRoot", "WINDIR", "ComSpec", "PATHEXT", "TEMP", "TMP"]) {
    if (source[key]) output[key] = source[key];
  }
  return output;
}

function isExit(child) {
  return child.exitCode !== null || child.signalCode !== null;
}

function waitForExit(child, timeoutMs) {
  if (isExit(child)) return Promise.resolve();
  return new Promise((resolveExit, reject) => {
    const timer = setTimeout(() => {
      child.off("exit", onExit);
      reject(new Error("A10 tunnel process did not stop within its deadline"));
    }, timeoutMs);
    const onExit = () => {
      clearTimeout(timer);
      resolveExit();
    };
    child.once("exit", onExit);
    if (isExit(child)) onExit();
  });
}

function createStopHandle(child, shutdownTimeoutMs) {
  let closing;
  return async function close() {
    if (closing) return closing;
    closing = (async () => {
      if (isExit(child)) return;
      try { child.kill("SIGTERM"); }
      catch { throw new Error("A10 tunnel process could not be terminated"); }
      try { await waitForExit(child, shutdownTimeoutMs); return; }
      catch { /* Escalate only against the exact process object returned by spawn. */ }
      try { child.kill("SIGKILL"); }
      catch { throw new Error("A10 tunnel process could not be force-terminated"); }
      await waitForExit(child, Math.min(3_000, shutdownTimeoutMs));
    })();
    return closing;
  };
}

function parseQuickTunnelHost(line) {
  const matches = [];
  for (const match of line.matchAll(/https:\/\/([^\s"'<>]+)/gi)) {
    const token = match[1].replace(/[),;!?]+$/, "");
    try {
      const url = new URL(`https://${token}`);
      if (url.protocol === "https:" && /^[a-z0-9-]+\.trycloudflare\.com$/i.test(url.hostname) &&
          !url.port && !url.username && !url.password && url.pathname === "/" && !url.search && !url.hash) {
        matches.push(url.hostname.toLowerCase());
      }
    } catch { /* Ignore CLI URLs outside the exact Quick Tunnel host shape. */ }
  }
  if (matches.length > 1) throw new Error("A10 tunnel emitted multiple public hostnames");
  return matches[0] || null;
}

/**
 * Waits for a URL and an active connection message without retaining raw CLI output.
 * @param {import("node:child_process").ChildProcess} child
 * @param {{ startupTimeoutMs?: number, shutdownTimeoutMs?: number }} options
 * @returns {Promise<{ publicBaseUrl: string, close: () => Promise<void> }>}
 */
export async function waitForA10QuickTunnel(child, { startupTimeoutMs = DEFAULT_STARTUP_TIMEOUT_MS, shutdownTimeoutMs = DEFAULT_SHUTDOWN_TIMEOUT_MS } = {}) {
  if (!Number.isInteger(startupTimeoutMs) || startupTimeoutMs < 1 || startupTimeoutMs > MAX_STARTUP_TIMEOUT_MS ||
      !Number.isInteger(shutdownTimeoutMs) || shutdownTimeoutMs < 1 || shutdownTimeoutMs > MAX_SHUTDOWN_TIMEOUT_MS) {
    throw new Error("A10 tunnel lifecycle timeout is invalid");
  }
  if (!child?.stdout || !child?.stderr || typeof child.kill !== "function") throw new Error("A10 tunnel process handle is invalid");
  const close = createStopHandle(child, shutdownTimeoutMs);
  const drain = () => {};
  const readiness = new Promise((resolveReady, rejectReady) => {
    let host;
    let registered = false;
    let pending = "";
    let settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.off("error", onError);
      child.off("exit", onExit);
      child.stdout.off("data", onStdout);
      child.stderr.off("data", onStderr);
      if (!error) {
        // Keep the child's pipes flowing for the rest of the tunnel session,
        // while discarding all post-readiness logs.
        child.stdout.on("data", drain);
        child.stderr.on("data", drain);
      }
      if (error) rejectReady(error);
      else resolveReady(value);
    };
    const acceptLine = (line) => {
      const discovered = parseQuickTunnelHost(line);
      if (discovered) host = discovered;
      if (/registered tunnel connection/i.test(line)) registered = true;
      if (host && registered) finish(undefined, `https://${host}`);
    };
    const consume = (chunk) => {
      pending += chunk.toString("utf8");
      if (pending.length > 8_192) pending = pending.slice(-8_192);
      const lines = pending.split(/\r?\n/);
      pending = lines.pop() || "";
      for (const line of lines) acceptLine(line);
      if (pending.length > 4_096) pending = pending.slice(-4_096);
      if (pending) acceptLine(pending);
    };
    const onStdout = (chunk) => { try { consume(chunk); } catch { finish(new Error("A10 tunnel output was invalid")); } };
    const onStderr = (chunk) => { try { consume(chunk); } catch { finish(new Error("A10 tunnel output was invalid")); } };
    const onError = () => finish(new Error("A10 tunnel process could not start"));
    const onExit = () => finish(new Error("A10 tunnel exited before readiness"));
    const timer = setTimeout(() => finish(new Error("A10 tunnel readiness timed out")), startupTimeoutMs);
    child.stdout.on("data", onStdout);
    child.stderr.on("data", onStderr);
    child.once("error", onError);
    child.once("exit", onExit);
  });
  try {
    const publicBaseUrl = await readiness;
    return Object.freeze({
      publicBaseUrl,
      close: async () => {
        await close();
        child.stdout.off("data", drain);
        child.stderr.off("data", drain);
      },
    });
  } catch (error) {
    try { await close(); }
    catch (cleanupError) { throw new AggregateError([error, cleanupError], "A10 tunnel startup failed and its child process did not stop cleanly"); }
    throw error;
  }
}

/** Start Cloudflare Quick Tunnel to the path-limited proxy, never directly to the app. */
/** @param {{ workspaceRoot?: string, webhookProxy: A10WebhookProxy, spawnProcess?: A10TunnelSpawner, startupTimeoutMs?: number, shutdownTimeoutMs?: number }} options */
export async function startA10LiveTunnel({ workspaceRoot = process.cwd(), webhookProxy, spawnProcess = spawn, startupTimeoutMs = DEFAULT_STARTUP_TIMEOUT_MS, shutdownTimeoutMs = DEFAULT_SHUTDOWN_TIMEOUT_MS }) {
  const target = validateProxy(webhookProxy);
  const binary = await verifyA10Cloudflared(workspaceRoot);
  const child = spawnProcess(binary, ["tunnel", "--no-autoupdate", "--loglevel", "info", "--url", target], {
    cwd: resolve(workspaceRoot),
    env: safeChildEnvironment(),
    shell: false,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const tunnel = await waitForA10QuickTunnel(child, { startupTimeoutMs, shutdownTimeoutMs });
  return Object.freeze({
    publicBaseUrl: tunnel.publicBaseUrl,
    webhookUrl: `${tunnel.publicBaseUrl}/api/webhooks/resend`,
    close: tunnel.close,
  });
}
