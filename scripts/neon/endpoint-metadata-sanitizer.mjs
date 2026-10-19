import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const PINNED_TARGET = Object.freeze({
  organizationId: "org-orange-band-18388903",
  projectId: "dawn-lake-13525647",
  projectName: "ornigami-fictional-staging",
  branchId: "br-young-voice-bamzc53o",
  branchName: "fictional-staging",
  databaseName: "ornigami_staging",
  roleName: "ornigami_staging_owner",
  regionId: "aws-eu-central-1",
});

const MAX_CAPTURE_BYTES = 1_048_576;
const COMMAND_TIMEOUT_MS = 20_000;
const CLI_VERSION = "4.14.3";
const NEON_API_HOST = "https://console.neon.tech/api/v2";
const NEON_OAUTH_HOST = "https://oauth2.neon.tech";
const REGION_HOST = "eu-central-1.aws.neon.tech";

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function id(value, prefix) {
  return typeof value === "string" && new RegExp(`^${prefix}[a-z0-9-]{1,60}$`, "i").test(value)
    ? value
    : null;
}

function slug(value) {
  return typeof value === "string" && /^[a-z0-9][a-z0-9-]{0,59}$/i.test(value) ? value : null;
}

function directHost(value) {
  if (typeof value !== "string") return null;
  const safeHost = /^ep-[a-z0-9-]{1,80}(?:\.[a-z0-9-]{1,63})+\.neon\.tech$/i.test(value);
  return safeHost && !value.includes("-pooler.") ? value.toLowerCase() : null;
}

function endpointDigest(hostname, port = "5432") {
  return createHash("sha256").update(`${hostname.toLowerCase()}:${port}`, "utf8").digest("hex");
}

function pooledHostFor(host, endpointId) {
  if (!host || !endpointId || !host.startsWith(`${endpointId.toLowerCase()}.`)) return null;
  return `${endpointId.toLowerCase()}-pooler${host.slice(endpointId.length)}`;
}

export function projectMetadata(data) {
  const project = isRecord(data) && isRecord(data.project) ? data.project : null;
  if (!project) return { status: "schema_invalid", metadata: null };
  const record = {
    id: slug(project.id),
    name: slug(project.name),
    orgId: id(project.org_id, "org-"),
    regionId: slug(project.region_id),
  };
  if (record.id !== PINNED_TARGET.projectId
    || record.name !== PINNED_TARGET.projectName
    || record.orgId !== PINNED_TARGET.organizationId
    || record.regionId !== PINNED_TARGET.regionId) {
    return { status: "identity_mismatch", metadata: null };
  }
  return { status: "ok", metadata: record };
}

export function branchMetadata(data) {
  const branch = isRecord(data) && isRecord(data.branch) ? data.branch : null;
  if (!branch) return { status: "schema_invalid", metadata: null };
  const record = {
    id: id(branch.id, "br-"),
    name: slug(branch.name),
    default: typeof branch.default === "boolean" ? branch.default : null,
    currentState: ["init", "ready", "idle", "suspended", "error"].includes(branch.current_state)
      ? branch.current_state
      : null,
    parentId: branch.parent_id == null ? null : id(branch.parent_id, "br-"),
  };
  if (record.id !== PINNED_TARGET.branchId || record.name !== PINNED_TARGET.branchName
    || record.default !== true || record.currentState === null
    || (branch.parent_id != null && record.parentId === null)) {
    return { status: "identity_mismatch", metadata: null };
  }
  return { status: "ok", metadata: record };
}

export function endpointMetadata(data) {
  if (!isRecord(data) || !Array.isArray(data.endpoints) || data.endpoints.length === 0) {
    return { status: "schema_invalid", metadata: endpointSchemaSummary(data) };
  }
  const endpoints = data.endpoints.map((endpoint) => {
    if (!isRecord(endpoint)) return null;
    const host = directHost(endpoint.host);
    const endpointId = id(endpoint.id, "ep-");
    const branchId = id(endpoint.branch_id, "br-");
    const projectId = slug(endpoint.project_id);
    const type = ["read_write", "read_only"].includes(endpoint.type) ? endpoint.type : null;
    const regionId = slug(endpoint.region_id);
    const poolerEnabled = typeof endpoint.pooler_enabled === "boolean" ? endpoint.pooler_enabled : null;
    const currentState = ["init", "active", "idle", "suspended", "failed", "disabled"].includes(endpoint.current_state)
      ? endpoint.current_state
      : null;
    if (!host || !endpointId || !branchId || !projectId || !type || !regionId
      || poolerEnabled === null || currentState === null) return null;
    const pooledHost = poolerEnabled ? pooledHostFor(host, endpointId) : null;
    if (!host.startsWith(`${endpointId.toLowerCase()}.`) || (poolerEnabled && !pooledHost)) return null;
    return {
      id: endpointId,
      projectId,
      branchId,
      host,
      type,
      regionId,
      poolerEnabled,
      currentState,
      directPort: 5432,
      directSha256: endpointDigest(host),
      pooledHost,
      pooledPort: pooledHost ? 5432 : null,
      pooledSha256: pooledHost ? endpointDigest(pooledHost) : null,
    };
  });
  if (endpoints.some((endpoint) => endpoint === null)) {
    return { status: "schema_invalid", metadata: endpointSchemaSummary(data) };
  }
  if (endpoints.some((endpoint) => endpoint.projectId !== PINNED_TARGET.projectId
    || endpoint.branchId !== PINNED_TARGET.branchId
    || endpoint.regionId !== PINNED_TARGET.regionId
    || !endpoint.host.endsWith(`.${REGION_HOST}`))) {
    return { status: "identity_mismatch", metadata: null };
  }
  if (endpoints.filter((endpoint) => endpoint.type === "read_write").length !== 1) {
    return { status: "identity_mismatch", metadata: null };
  }
  return { status: "ok", metadata: endpoints };
}

export function endpointSchemaSummary(data) {
  if (!isRecord(data)) return { responseObject: false, endpointArray: false, endpointCount: 0, entries: [] };
  if (!Array.isArray(data.endpoints)) return { responseObject: true, endpointArray: false, endpointCount: 0, entries: [] };
  return {
    responseObject: true,
    endpointArray: true,
    endpointCount: Math.min(data.endpoints.length, 10),
    entries: data.endpoints.slice(0, 10).map((endpoint) => ({
      object: isRecord(endpoint),
      id: Boolean(id(endpoint?.id, "ep-")),
      projectId: Boolean(slug(endpoint?.project_id)),
      branchId: Boolean(id(endpoint?.branch_id, "br-")),
      host: Boolean(directHost(endpoint?.host)),
      safeHost: directHost(endpoint?.host),
      type: ["read_write", "read_only"].includes(endpoint?.type),
      regionId: Boolean(slug(endpoint?.region_id)),
      poolerEnabled: typeof endpoint?.pooler_enabled === "boolean",
      currentState: ["init", "active", "idle", "suspended", "failed", "disabled"].includes(endpoint?.current_state),
    })),
  };
}

export function projectEndpointMetadata(data, expected) {
  const endpoint = isRecord(data) && isRecord(data.endpoint) ? data.endpoint : null;
  if (!endpoint) return { status: "schema_invalid", metadata: null };
  const host = directHost(endpoint.host);
  const record = {
    id: id(endpoint.id, "ep-"),
    projectId: slug(endpoint.project_id),
    branchId: id(endpoint.branch_id, "br-"),
    host,
    type: ["read_write", "read_only"].includes(endpoint.type) ? endpoint.type : null,
    regionId: slug(endpoint.region_id),
    poolerEnabled: typeof endpoint.pooler_enabled === "boolean" ? endpoint.pooler_enabled : null,
  };
  if (!record.id || !record.host || !record.projectId || !record.branchId || !record.type
    || !record.regionId || record.poolerEnabled === null || !record.host.startsWith(`${record.id.toLowerCase()}.`)) {
    return { status: "schema_invalid", metadata: null };
  }
  if (record.id !== expected.id || record.projectId !== PINNED_TARGET.projectId
    || record.branchId !== PINNED_TARGET.branchId || record.host !== expected.host
    || record.type !== expected.type || record.regionId !== PINNED_TARGET.regionId
    || !record.host.endsWith(`.${REGION_HOST}`)
    || record.poolerEnabled !== expected.poolerEnabled) {
    return { status: "identity_mismatch", metadata: null };
  }
  return { status: "ok", metadata: record };
}

export function sanitizeCliResult({ status, exitCode = null, stdout = "", stderr = "" }, projector) {
  if (status !== "closed") return { status, exitCode: Number.isInteger(exitCode) ? exitCode : null, metadata: null };
  if (exitCode !== 0) return { status: "cli_nonzero", exitCode: Number.isInteger(exitCode) ? exitCode : null, metadata: null };
  let parsed;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return { status: "invalid_json", exitCode: 0, metadata: null };
  }
  const result = projector(parsed);
  return { status: result.status, exitCode: 0, metadata: result.metadata };
}

export function cliEntryFromAppData(appData = process.env.APPDATA) {
  if (!appData) return null;
  const root = join(appData, "npm", "node_modules", "neon");
  const manifestPath = join(root, "package.json");
  const entry = join(root, "dist", "cli.js");
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    if (manifest.name !== "neon" || manifest.version !== CLI_VERSION || !existsSync(entry)) return null;
    return entry;
  } catch {
    return null;
  }
}

function killTree(child) {
  if (!child.pid) return Promise.resolve();
  if (process.platform !== "win32") {
    try { child.kill("SIGKILL"); } catch {}
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const killer = spawn("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], {
      windowsHide: true,
      stdio: "ignore",
      shell: false,
    });
    const done = setTimeout(() => {
      try { killer.kill(); } catch {}
      try { child.kill(); } catch {}
      resolve();
    }, 2_000);
    killer.once("error", () => {
      clearTimeout(done);
      try { child.kill(); } catch {}
      resolve();
    });
    killer.once("close", () => {
      clearTimeout(done);
      resolve();
    });
  });
}

export function captureCli(args, { cliEntry, timeoutMs = COMMAND_TIMEOUT_MS, spawnImpl = spawn } = {}) {
  if (!cliEntry || !Array.isArray(args) || args.some((arg) => typeof arg !== "string")) {
    return Promise.resolve({ status: "launch_failed", exitCode: null, stdout: "", stderr: "" });
  }
  return new Promise((resolve) => {
    let child;
    try {
      child = spawnImpl(process.execPath, [cliEntry, ...args], {
        cwd: tmpdir(),
        env: { ...process.env, NEON_API_HOST, NEON_OAUTH_HOST },
        windowsHide: true,
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch {
      resolve({ status: "launch_failed", exitCode: null, stdout: "", stderr: "" });
      return;
    }
    let stdout = Buffer.alloc(0);
    let stderr = Buffer.alloc(0);
    let overflow = false;
    let timedOut = false;
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    const collect = (current, chunk) => {
      if (current.length + chunk.length > MAX_CAPTURE_BYTES) {
        overflow = true;
        void killTree(child);
        return current;
      }
      return Buffer.concat([current, chunk]);
    };
    child.stdout?.on("data", (chunk) => { stdout = collect(stdout, chunk); });
    child.stderr?.on("data", (chunk) => { stderr = collect(stderr, chunk); });
    child.once("error", () => finish({ status: "launch_failed", exitCode: null, stdout: "", stderr: "" }));
    child.once("close", (code) => finish({
      status: overflow ? "output_too_large" : timedOut ? "timeout" : "closed",
      exitCode: timedOut ? null : Number.isInteger(code) ? code : null,
      stdout: overflow || timedOut ? "" : stdout.toString("utf8"),
      stderr: overflow || timedOut ? "" : stderr.toString("utf8"),
    }));
    const timer = setTimeout(() => {
      timedOut = true;
      void killTree(child).finally(() => finish({ status: "timeout", exitCode: null, stdout: "", stderr: "" }));
    }, timeoutMs);
  });
}

export function createCommandPlan(cliEntry) {
  const base = `/projects/${PINNED_TARGET.projectId}`;
  return [
    {
      key: "project",
      args: ["--no-analytics", "--api-host", NEON_API_HOST, "api", base, "--output", "json"],
      projector: projectMetadata,
    },
    {
      key: "branch",
      args: ["--no-analytics", "--api-host", NEON_API_HOST, "api", `${base}/branches/${PINNED_TARGET.branchId}`, "--output", "json"],
      projector: branchMetadata,
    },
    {
      key: "endpoints",
      args: ["--no-analytics", "--api-host", NEON_API_HOST, "api", `${base}/branches/${PINNED_TARGET.branchId}/endpoints`, "--output", "json"],
      projector: endpointMetadata,
    },
  ].map((entry) => ({ ...entry, cliEntry }));
}

export async function runAssessment({ capture = captureCli, cliEntry = cliEntryFromAppData() } = {}) {
  const startedAt = new Date().toISOString();
  if (!cliEntry) return { status: "cli_unavailable", target: PINNED_TARGET, project: null, branch: null, endpoints: null };
  const results = {};
  for (const command of createCommandPlan(cliEntry)) {
    const captured = await capture(command.args, { cliEntry: command.cliEntry });
    results[command.key] = sanitizeCliResult(captured, command.projector);
    if (results[command.key].status !== "ok") {
      return { status: results[command.key].status, target: PINNED_TARGET, ...results };
    }
  }
  const readOnlyEndpoints = results.endpoints.metadata;
  const details = [];
  for (const endpoint of readOnlyEndpoints) {
    const args = [
      "--no-analytics",
      "--api-host",
      NEON_API_HOST,
      "api",
      `/projects/${PINNED_TARGET.projectId}/endpoints/${endpoint.id}`,
      "--output",
      "json",
    ];
    const captured = await capture(args, { cliEntry });
    const detail = sanitizeCliResult(captured, (data) => projectEndpointMetadata(data, endpoint));
    details.push(detail);
    if (detail.status !== "ok") {
      return { status: detail.status, target: PINNED_TARGET, ...results, endpointDetails: details };
    }
  }
  const listedEndpoints = results.endpoints.metadata;
  const verified = details.map((detail) => {
    const readback = detail.metadata;
    const listed = listedEndpoints.find((endpoint) => endpoint.id === readback.id);
    return listed ? { ...listed, ...readback, currentState: listed.currentState } : readback;
  });
  return {
    status: "ok",
    startedAt,
    completedAt: new Date().toISOString(),
    target: PINNED_TARGET,
    project: results.project.metadata,
    branch: results.branch.metadata,
    endpoints: verified.map((endpoint) => ({
      ...endpoint,
      directPort: 5432,
      directSha256: endpointDigest(endpoint.host),
      pooledHost: endpoint.poolerEnabled ? pooledHostFor(endpoint.host, endpoint.id) : null,
      pooledPort: endpoint.poolerEnabled ? 5432 : null,
      pooledSha256: endpoint.poolerEnabled
        ? endpointDigest(pooledHostFor(endpoint.host, endpoint.id))
        : null,
    })),
    endpointDetails: verified.map((endpoint) => ({ id: endpoint.id, status: "matched" })),
    deployedDatabaseUrlSelection: "not_observed",
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runAssessment().then((result) => {
    process.stdout.write(`${JSON.stringify(result)}\n`);
    process.exitCode = result.status === "ok" ? 0 : 1;
  }).catch(() => {
    process.stdout.write('{"status":"internal_error"}\n');
    process.exitCode = 1;
  });
}
