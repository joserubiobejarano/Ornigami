import { createHash } from "node:crypto";
import { spawn as nodeSpawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PREFLIGHT_CHECK_KEYS, PROVISIONING_TARGET, runProvisioningPreflight } from "./staging-provisioning-preflight.mjs";

export const NEON_CLI_VERSION = "4.14.3";
export const NEON_API_HOST = "https://console.neon.tech/api/v2";
export const NEON_OAUTH_HOST = "https://oauth2.neon.tech";
export const LAUNCHER_LIMITS = Object.freeze({ timeoutMs: 20_000, maxBytesPerStream: 16_384 });

const ENDPOINT_FINGERPRINT_ENV = "ORNIGAMI_PREVIEW_DB_EXPECTED_ENDPOINT_SHA256";
const DATABASE_NAME_ENV = "ORNIGAMI_PREVIEW_DB_EXPECTED_NAME";
const ROLE_NAME_ENV = "ORNIGAMI_PREVIEW_DB_EXPECTED_ROLE";
const LAUNCHER_STATUSES = new Set([
  "already_attempted",
  "cli_unavailable",
  "configuration_invalid",
  "endpoint_mismatch",
  "target_mismatch",
  "credential_response_invalid",
  "cli_failed",
  "cli_timeout",
  "output_too_large",
  "verification_failed",
  "identity_mismatch",
  "verified",
]);

function validFingerprint(value) {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

function digestEndpoint(hostname, port) {
  return createHash("sha256").update(`${hostname.toLowerCase()}:${port || "5432"}`, "utf8").digest("hex");
}

function fixedStatus(status) {
  return { status: LAUNCHER_STATUSES.has(status) ? status : "verification_failed" };
}

export function resolveInstalledNeonCli(appData = process.env.APPDATA) {
  if (!appData) return null;
  const packageRoot = join(appData, "npm", "node_modules", "neon");
  const packagePath = join(packageRoot, "package.json");
  const cliPath = join(packageRoot, "dist", "cli.js");
  try {
    const manifest = JSON.parse(readFileSync(packagePath, "utf8"));
    return manifest.name === "neon" && manifest.version === NEON_CLI_VERSION && existsSync(cliPath)
      ? cliPath
      : null;
  } catch {
    return null;
  }
}

export function buildNeonConnectionStringArgs({ endpointForm, approvedEndpointFingerprint }) {
  if (!validFingerprint(approvedEndpointFingerprint) || !["direct", "pooled"].includes(endpointForm)) return null;
  return [
    "--no-analytics",
    "--api-host", NEON_API_HOST,
    "--oauth-host", NEON_OAUTH_HOST,
    "--profile", "DEFAULT",
    "--no-color",
    "connection-string", "br-young-voice-bamzc53o",
    "--project-id", "dawn-lake-13525647",
    "--database-name", PROVISIONING_TARGET.databaseName,
    "--role-name", PROVISIONING_TARGET.roleName,
    "--endpoint-type", "read_write",
    ...(endpointForm === "pooled" ? ["--pooled"] : []),
  ];
}

function childEnvironment(source = process.env) {
  const allowed = new Set([
    "PATH", "SYSTEMROOT", "WINDIR", "COMSPEC", "TEMP", "TMP",
    "APPDATA", "LOCALAPPDATA", "USERPROFILE", "HOME", "HOMEDRIVE", "HOMEPATH", "XDG_CONFIG_HOME",
    "HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "NO_PROXY",
  ]);
  const env = {};
  for (const [key, value] of Object.entries(source)) {
    if (allowed.has(key.toUpperCase()) && typeof value === "string") env[key] = value;
  }
  env.NEON_API_HOST = NEON_API_HOST;
  env.NEON_OAUTH_HOST = NEON_OAUTH_HOST;
  env.CI = "true";
  return env;
}

function terminateProcessTree(child, spawnImpl = nodeSpawn) {
  if (!child?.pid) {
    try { child?.kill?.(); } catch {}
    return Promise.resolve();
  }
  if (process.platform !== "win32") {
    try { child.kill("SIGKILL"); } catch {}
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    let killer;
    try {
      killer = spawnImpl("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], {
        windowsHide: true,
        shell: false,
        stdio: "ignore",
      });
    } catch {
      try { child.kill(); } catch {}
      resolve();
      return;
    }
    const fallback = setTimeout(() => {
      try { killer.kill(); } catch {}
      try { child.kill(); } catch {}
      resolve();
    }, 2_000);
    killer.once("error", () => {
      clearTimeout(fallback);
      try { child.kill(); } catch {}
      resolve();
    });
    killer.once("close", () => {
      clearTimeout(fallback);
      resolve();
    });
  });
}

function captureCredentialOutput(args, {
  cliEntry,
  spawnImpl = nodeSpawn,
  killTree = (child) => terminateProcessTree(child, spawnImpl),
  timeoutMs = LAUNCHER_LIMITS.timeoutMs,
  maxBytesPerStream = LAUNCHER_LIMITS.maxBytesPerStream,
  envSource = process.env,
} = {}) {
  if (!cliEntry || !Array.isArray(args) || args.some((arg) => typeof arg !== "string")) {
    return Promise.resolve({ status: "launch_failed", stdout: Buffer.alloc(0), stderr: Buffer.alloc(0) });
  }
  return new Promise((resolve) => {
    let child;
    try {
      child = spawnImpl(process.execPath, [cliEntry, ...args], {
        cwd: tmpdir(),
        env: childEnvironment(envSource),
        windowsHide: true,
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch {
      resolve({ status: "launch_failed", stdout: Buffer.alloc(0), stderr: Buffer.alloc(0) });
      return;
    }
    let stdout = Buffer.alloc(0);
    let stderr = Buffer.alloc(0);
    let overflow = false;
    let timedOut = false;
    let settled = false;
    const discard = () => {
      stdout.fill(0);
      stderr.fill(0);
      stdout = Buffer.alloc(0);
      stderr = Buffer.alloc(0);
    };
    const finish = (status, exitCode = null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (status !== "closed") {
        discard();
        resolve({ status, exitCode, stdout: Buffer.alloc(0), stderr: Buffer.alloc(0) });
      } else {
        resolve({ status, exitCode, stdout, stderr });
      }
    };
    const collect = (buffer, chunk) => {
      if (buffer.length + chunk.length > maxBytesPerStream) {
        overflow = true;
        void Promise.resolve(killTree(child)).catch(() => {});
        return buffer;
      }
      return Buffer.concat([buffer, chunk]);
    };
    child.stdout?.on("data", (chunk) => { if (!settled && !overflow) stdout = collect(stdout, chunk); });
    child.stderr?.on("data", (chunk) => { if (!settled && !overflow) stderr = collect(stderr, chunk); });
    child.once("error", () => finish("launch_failed"));
    child.once("close", (code) => finish(
      overflow ? "output_too_large" : timedOut ? "timeout" : "closed",
      timedOut ? null : Number.isInteger(code) ? code : null,
    ));
    const timer = setTimeout(() => {
      timedOut = true;
      void Promise.resolve(killTree(child)).catch(() => {}).finally(() => finish("timeout"));
    }, timeoutMs);
  });
}

function parseCredentialUri(uri, { endpointForm, approvedEndpointFingerprint }) {
  if (typeof uri !== "string" || !uri || /[\r\n\t\s]/.test(uri)) return { status: "credential_response_invalid" };
  let parsed;
  try {
    parsed = new URL(uri);
  } catch {
    return { status: "credential_response_invalid" };
  }
  if (!["postgres:", "postgresql:"].includes(parsed.protocol)
    || !parsed.hostname || !parsed.username || !parsed.password
    || parsed.hash || !parsed.pathname || parsed.pathname === "/") {
    return { status: "credential_response_invalid" };
  }
  let databaseName;
  let roleName;
  try {
    databaseName = decodeURIComponent(parsed.pathname.slice(1));
    roleName = decodeURIComponent(parsed.username);
  } catch {
    return { status: "credential_response_invalid" };
  }
  if (databaseName !== PROVISIONING_TARGET.databaseName || roleName !== PROVISIONING_TARGET.roleName) {
    return { status: "target_mismatch" };
  }
  const actualFingerprint = digestEndpoint(parsed.hostname, parsed.port);
  if (actualFingerprint !== approvedEndpointFingerprint) return { status: "endpoint_mismatch" };
  return { status: "ok", actualFingerprint, endpointForm };
}

function sanitizePreflightResult(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return fixedStatus("verification_failed");
  if (value.status === "verified" || value.status === "identity_mismatch") {
    const source = value.checks && typeof value.checks === "object" && !Array.isArray(value.checks)
      ? value.checks
      : {};
    const checks = Object.fromEntries(PREFLIGHT_CHECK_KEYS.map((key) => [key, source[key] === true]));
    const status = Object.values(checks).every(Boolean) ? "verified" : "identity_mismatch";
    return { status, checks };
  }
  return fixedStatus(value.status);
}

function validateLocalExpectations(env, approvedEndpointFingerprint, endpointForm) {
  if (!validFingerprint(approvedEndpointFingerprint)
    || env?.[ENDPOINT_FINGERPRINT_ENV] !== approvedEndpointFingerprint
    || env?.[DATABASE_NAME_ENV] !== PROVISIONING_TARGET.databaseName
    || env?.[ROLE_NAME_ENV] !== PROVISIONING_TARGET.roleName
    || !["direct", "pooled"].includes(endpointForm)) return false;
  return true;
}

export function createOneShotProvisioningLauncher({
  cliEntry = resolveInstalledNeonCli(),
  spawnImpl = nodeSpawn,
  killTree,
  timeoutMs = LAUNCHER_LIMITS.timeoutMs,
  maxBytesPerStream = LAUNCHER_LIMITS.maxBytesPerStream,
  envSource = process.env,
  runPreflight = runProvisioningPreflight,
} = {}) {
  let attempted = false;
  return async function launch({ env = process.env, approvedEndpointFingerprint, endpointForm } = {}) {
    if (attempted) return fixedStatus("already_attempted");
    attempted = true;
    if (!validateLocalExpectations(env, approvedEndpointFingerprint, endpointForm)) {
      return fixedStatus("configuration_invalid");
    }
    if (!cliEntry) return fixedStatus("cli_unavailable");
    const args = buildNeonConnectionStringArgs({ endpointForm, approvedEndpointFingerprint });
    const captured = await captureCredentialOutput(args, {
      cliEntry,
      spawnImpl,
      killTree,
      timeoutMs,
      maxBytesPerStream,
      envSource,
    });
    if (captured.status !== "closed" || captured.exitCode !== 0) {
      captured.stdout.fill(0);
      captured.stderr.fill(0);
      return fixedStatus(captured.status === "timeout" ? "cli_timeout"
        : captured.status === "output_too_large" ? "output_too_large"
          : captured.status === "launch_failed" ? "cli_unavailable" : "cli_failed");
    }
    let connectionUri = captured.stdout.toString("utf8");
    let line = "";
    let preflightEnv = null;
    captured.stdout.fill(0);
    captured.stderr.fill(0);
    try {
      line = connectionUri.endsWith("\r\n") ? connectionUri.slice(0, -2)
        : connectionUri.endsWith("\n") ? connectionUri.slice(0, -1) : connectionUri;
      if (/[\r\n]/.test(line)) return fixedStatus("credential_response_invalid");
      const candidate = parseCredentialUri(line, { endpointForm, approvedEndpointFingerprint });
      if (candidate.status !== "ok") return fixedStatus(candidate.status);
      preflightEnv = {
        DATABASE_URL: line,
        [ENDPOINT_FINGERPRINT_ENV]: approvedEndpointFingerprint,
        [DATABASE_NAME_ENV]: PROVISIONING_TARGET.databaseName,
        [ROLE_NAME_ENV]: PROVISIONING_TARGET.roleName,
      };
      const result = await runPreflight({ env: preflightEnv, approvedEndpointFingerprint });
      return sanitizePreflightResult(result);
    } catch {
      return fixedStatus("verification_failed");
    } finally {
      if (preflightEnv) preflightEnv.DATABASE_URL = "";
      line = "";
      connectionUri = "";
    }
  };
}

function argumentValue(args, name) {
  const index = args.indexOf(name);
  return index < 0 ? undefined : args[index + 1];
}

async function main() {
  const args = process.argv.slice(2);
  const launch = createOneShotProvisioningLauncher();
  const result = await launch({
    approvedEndpointFingerprint: argumentValue(args, "--approved-endpoint-fingerprint"),
    endpointForm: argumentValue(args, "--endpoint-form"),
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
  process.exitCode = result.status === "verified" ? 0 : 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch(() => {
    process.stdout.write('{"status":"verification_failed"}\n');
    process.exitCode = 1;
  });
}
