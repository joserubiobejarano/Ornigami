import { spawn as nodeSpawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { isValidAuthPassword } from "../src/lib/auth-password-policy.ts";
import { isBcryptCost10Hash } from "./staging-fixture-credential-provisioner.mjs";

const PROVISIONER_PATH = fileURLToPath(new URL("./staging-fixture-credential-provisioner.mjs", import.meta.url));
const EXPECTED_ENV = Object.freeze({
  endpointFingerprint: "ORNIGAMI_PREVIEW_DB_EXPECTED_ENDPOINT_SHA256",
  databaseName: "ORNIGAMI_PREVIEW_DB_EXPECTED_NAME",
  roleName: "ORNIGAMI_PREVIEW_DB_EXPECTED_ROLE",
});
const FIXTURE_RESULTS = new Set([
  "execution_not_authorized",
  "credential_custody_approval_required",
  "confirmation_mismatch",
  "password_invalid",
  "input_failed",
  "input_timeout",
  "input_cancelled",
  "input_too_large",
  "credential_hash_invalid",
  "configuration_invalid",
  "endpoint_mismatch",
  "verification_failed",
  "cli_unavailable",
  "already_attempted",
  "cli_timeout",
  "output_too_large",
  "cli_failed",
  "credential_response_invalid",
  "target_mismatch",
  "identity_mismatch",
  "credential_state_not_ready",
  "concurrent_state_change",
  "write_outcome_uncertain",
  "credential_write_applied",
]);
const CHECK_KEYS = Object.freeze([
  "identityMatch",
  "passwordHashAbsent",
  "emailUnverified",
  "deletionClear",
  "authVersionExpected",
  "noVerificationToken",
  "noResetToken",
]);
const RUN_LIMITS = Object.freeze({ inputTimeoutMs: 300_000, maxInputBytes: 256, childTimeoutMs: 60_000, maxOutputBytes: 4_096 });

function fixedResult(status) {
  return { status: FIXTURE_RESULTS.has(status) ? status : "write_outcome_uncertain" };
}

function validInvocation({ env, approvedEndpointFingerprint, endpointForm }) {
  return typeof approvedEndpointFingerprint === "string"
    && /^[a-f0-9]{64}$/.test(approvedEndpointFingerprint)
    && env?.[EXPECTED_ENV.endpointFingerprint] === approvedEndpointFingerprint
    && env?.[EXPECTED_ENV.databaseName] === "ornigami_staging"
    && env?.[EXPECTED_ENV.roleName] === "ornigami_staging_owner"
    && ["direct", "pooled"].includes(endpointForm);
}

export async function readMaskedValue(prompt, {
  input = process.stdin,
  output = process.stdout,
  maxInputBytes = RUN_LIMITS.maxInputBytes,
  timeoutMs = RUN_LIMITS.inputTimeoutMs,
} = {}) {
  if (!input?.isTTY || typeof input.setRawMode !== "function") throw new Error("input_not_interactive");
  let value = "";
  let settled = false;
  let onData;
  let onError;
  let timer;
  const cleanup = () => {
    clearTimeout(timer);
    if (onData) input.removeListener("data", onData);
    if (onError) input.removeListener("error", onError);
    try { input.setRawMode(false); } catch {}
    try { input.setEncoding(null); } catch {}
    input.pause();
  };
  return new Promise((resolve, reject) => {
    const finish = (error) => {
      if (settled) return;
      settled = true;
      cleanup();
      output.write("\n");
      if (error) {
        value = "";
        reject(new Error(error));
      } else {
        resolve(value);
      }
    };
    onError = () => finish("input_failed");
    onData = (chunk) => {
      for (const char of String(chunk)) {
        if (char === "\u0003") return finish("input_cancelled");
        if (char === "\r" || char === "\n") return finish(null);
        if (char === "\u0008" || char === "\u007f") {
          value = [...value].slice(0, -1).join("");
          continue;
        }
        if (char < " " || char === "\u007f") continue;
        if (Buffer.byteLength(value + char, "utf8") > maxInputBytes) return finish("input_too_large");
        value += char;
      }
    };
    try {
      input.setEncoding("utf8");
      input.setRawMode(true);
      input.resume();
      input.on("data", onData);
      input.once("error", onError);
      output.write(prompt);
      timer = setTimeout(() => finish("input_timeout"), timeoutMs);
    } catch {
      finish("input_failed");
    }
  });
}

export async function readConfirmedPassword({ readValue = readMaskedValue } = {}) {
  let password = "";
  let confirmation = "";
  try {
    password = await readValue("Choose password (hidden): ");
    confirmation = await readValue("Confirm password (hidden): ");
    if (password !== confirmation) return { status: "confirmation_mismatch" };
    if (!isValidAuthPassword(password)) return { status: "password_invalid" };
    return { status: "confirmed", password };
  } catch (error) {
    const status = error && typeof error.message === "string" && FIXTURE_RESULTS.has(error.message)
      && ["input_failed", "input_timeout", "input_cancelled", "input_too_large"].includes(error.message)
      ? error.message
      : "input_failed";
    return { status };
  } finally {
    password = "";
    confirmation = "";
  }
}

function sanitizeProvisionerOutput(stdout, exitCode) {
  let parsed;
  try {
    const text = stdout.toString("utf8").trim();
    if (!text || /[\r\n]/.test(text)) return fixedResult("write_outcome_uncertain");
    parsed = JSON.parse(text);
  } catch {
    return fixedResult("write_outcome_uncertain");
  }
  return sanitizeProvisionerResult(parsed, exitCode);
}

function sanitizeProvisionerResult(parsed, exitCode = 0) {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || !FIXTURE_RESULTS.has(parsed.status)) {
    return fixedResult("write_outcome_uncertain");
  }
  if (parsed.status === "credential_write_applied") {
    const checks = parsed.checks;
    const completeSuccess = exitCode === 0
      && checks && typeof checks === "object" && !Array.isArray(checks)
      && CHECK_KEYS.every((key) => checks[key] === true);
    if (!completeSuccess) return fixedResult("write_outcome_uncertain");
  }
  const result = { status: parsed.status };
  if (["credential_state_not_ready", "concurrent_state_change", "credential_write_applied"].includes(parsed.status)) {
    const checks = parsed.checks && typeof parsed.checks === "object" ? parsed.checks : {};
    result.checks = Object.fromEntries(CHECK_KEYS.map((key) => [key, checks[key] === true]));
  }
  return result;
}

function killChildTree(child, spawnImpl) {
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
        windowsHide: true, shell: false, stdio: "ignore",
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
    killer.once("error", () => { clearTimeout(fallback); try { child.kill(); } catch {} resolve(); });
    killer.once("close", () => { clearTimeout(fallback); resolve(); });
  });
}

function provisionerEnvironment(source, approvedEndpointFingerprint) {
  const allowed = new Set([
    "PATH", "SYSTEMROOT", "WINDIR", "COMSPEC", "TEMP", "TMP",
    "APPDATA", "LOCALAPPDATA", "USERPROFILE", "HOME", "HOMEDRIVE", "HOMEPATH", "XDG_CONFIG_HOME",
    "HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "NO_PROXY",
  ]);
  const env = {};
  for (const [key, value] of Object.entries(source ?? {})) {
    if (allowed.has(key.toUpperCase()) && typeof value === "string") env[key] = value;
  }
  env[EXPECTED_ENV.endpointFingerprint] = approvedEndpointFingerprint;
  env[EXPECTED_ENV.databaseName] = "ornigami_staging";
  env[EXPECTED_ENV.roleName] = "ornigami_staging_owner";
  return env;
}

export function runProvisionerWithHash(hash, {
  approvedEndpointFingerprint,
  endpointForm,
  spawnImpl = nodeSpawn,
  timeoutMs = RUN_LIMITS.childTimeoutMs,
  maxOutputBytes = RUN_LIMITS.maxOutputBytes,
  env = process.env,
} = {}) {
  if (!validInvocation({ env, approvedEndpointFingerprint, endpointForm }) || !isBcryptCost10Hash(hash)) {
    return Promise.resolve(fixedResult("configuration_invalid"));
  }
  const args = [
    PROVISIONER_PATH,
    "--execute-existing-fixture-write",
    "--owner-held-password-approved",
    "--approved-endpoint-fingerprint", approvedEndpointFingerprint,
    "--endpoint-form", endpointForm,
  ];
  return new Promise((resolve) => {
    let child;
    try {
      child = spawnImpl(process.execPath, args, {
        windowsHide: true,
        shell: false,
        env: provisionerEnvironment(env, approvedEndpointFingerprint),
        stdio: ["pipe", "pipe", "pipe"],
      });
    } catch {
      resolve(fixedResult("cli_unavailable"));
      return;
    }
    let stdout = Buffer.alloc(0);
    let stderr = Buffer.alloc(0);
    let hashBuffer = Buffer.alloc(0);
    let overflow = false;
    let settled = false;
    let timer;
    const discard = () => {
      stdout.fill(0);
      stderr.fill(0);
      stdout = Buffer.alloc(0);
      stderr = Buffer.alloc(0);
    };
    const finish = (status, code = null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      hashBuffer.fill(0);
      if (status) {
        discard();
        resolve(fixedResult(status));
      } else {
        const result = overflow ? fixedResult("write_outcome_uncertain") : sanitizeProvisionerOutput(stdout, code);
        discard();
        resolve(result);
      }
    };
    const collect = (buffer, chunk) => {
      if (buffer.length + chunk.length > maxOutputBytes) {
        overflow = true;
        void killChildTree(child, spawnImpl);
        return buffer;
      }
      return Buffer.concat([buffer, chunk]);
    };
    child.stdout?.on("data", (chunk) => { if (!settled && !overflow) stdout = collect(stdout, chunk); });
    child.stderr?.on("data", (chunk) => { if (!settled && !overflow) stderr = collect(stderr, chunk); });
    child.once("error", () => finish("cli_unavailable"));
    child.once("close", (code) => finish(null, Number.isInteger(code) ? code : null));
    timer = setTimeout(() => {
      void killChildTree(child, spawnImpl).finally(() => finish("write_outcome_uncertain"));
    }, timeoutMs);
    hashBuffer = Buffer.from(`${hash}\n`, "utf8");
    child.stdin?.once?.("error", () => {
      void killChildTree(child, spawnImpl).finally(() => finish("write_outcome_uncertain"));
    });
    child.stdin?.end(hashBuffer, () => hashBuffer.fill(0));
  });
}

export async function runOwnerSuppliedPasswordProvisioning({
  approvedEndpointFingerprint,
  endpointForm,
  executionAuthorized,
  ownerHeldPasswordApproved,
  env = process.env,
  readValue = readMaskedValue,
  hashPassword,
  runProvisioner = runProvisionerWithHash,
} = {}) {
  if (executionAuthorized !== true) return fixedResult("execution_not_authorized");
  if (ownerHeldPasswordApproved !== true) return fixedResult("credential_custody_approval_required");
  if (!validInvocation({ env, approvedEndpointFingerprint, endpointForm })) return fixedResult("configuration_invalid");
  const input = await readConfirmedPassword({ readValue });
  if (input.status !== "confirmed") return fixedResult(input.status);

  let password = input.password;
  input.password = "";
  let hash = "";
  try {
    const hashFunction = hashPassword ?? (async (plain) => {
      const bcrypt = await import("bcryptjs");
      return bcrypt.hash(plain, 10);
    });
    try {
      hash = await hashFunction(password, 10);
    } catch {
      return fixedResult("credential_hash_invalid");
    }
    if (!isBcryptCost10Hash(hash)) return fixedResult("credential_hash_invalid");
    try {
      const result = await runProvisioner(hash, { approvedEndpointFingerprint, endpointForm, env });
      return sanitizeProvisionerResult(result);
    } catch {
      return fixedResult("write_outcome_uncertain");
    }
  } catch {
    return fixedResult("verification_failed");
  } finally {
    password = "";
    hash = "";
  }
}

function argPresent(args, name) { return args.includes(name); }
function argValue(args, name) { const index = args.indexOf(name); return index < 0 ? undefined : args[index + 1]; }

async function main() {
  const args = process.argv.slice(2);
  const result = await runOwnerSuppliedPasswordProvisioning({
    approvedEndpointFingerprint: argValue(args, "--approved-endpoint-fingerprint"),
    endpointForm: argValue(args, "--endpoint-form"),
    executionAuthorized: argPresent(args, "--execute-existing-fixture-write"),
    ownerHeldPasswordApproved: argPresent(args, "--owner-held-password-approved"),
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
  process.exitCode = result.status === "credential_write_applied" ? 0 : 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch(() => {
    process.stdout.write('{"status":"verification_failed"}\n');
    process.exitCode = 1;
  });
}
