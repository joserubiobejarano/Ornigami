import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  PINNED_TARGET,
  branchMetadata,
  captureCli,
  createCommandPlan,
  endpointMetadata,
  endpointSchemaSummary,
  projectEndpointMetadata,
  projectMetadata,
  runAssessment,
  sanitizeCliResult,
} from "../scripts/neon/endpoint-metadata-sanitizer.mjs";

const host = "ep-synthetic-blue-123456.eu-central-1.aws.neon.tech";
const project = {
  project: {
    id: PINNED_TARGET.projectId,
    name: PINNED_TARGET.projectName,
    org_id: PINNED_TARGET.organizationId,
    region_id: PINNED_TARGET.regionId,
    credentialValue: "synthetic-project-secret",
  },
  "api-key=synthetic-secret": "synthetic-secret",
};
const branch = {
  branch: {
    id: PINNED_TARGET.branchId,
    name: PINNED_TARGET.branchName,
    project_id: PINNED_TARGET.projectId,
    default: true,
    current_state: "ready",
    parent_id: null,
    password: "synthetic-branch-secret",
  },
  "DATABASE_URL=synthetic-secret": "synthetic-secret",
};
const endpoint = {
  id: "ep-synthetic-blue-123456",
  project_id: PINNED_TARGET.projectId,
  branch_id: PINNED_TARGET.branchId,
  host,
  type: "read_write",
  region_id: PINNED_TARGET.regionId,
  pooler_enabled: true,
  current_state: "idle",
  settings: { password: "synthetic-endpoint-secret" },
  "credential=synthetic-secret": "synthetic-secret",
};

test("projects only pinned project, branch and endpoint metadata; computes direct and pooled fingerprints", () => {
  assert.deepEqual(projectMetadata(project).status, "ok");
  assert.deepEqual(branchMetadata(branch).status, "ok");
  const endpoints = endpointMetadata({ endpoints: [endpoint] });
  assert.equal(endpoints.status, "ok");
  assert.deepEqual(endpoints.metadata[0], {
    id: endpoint.id,
    projectId: PINNED_TARGET.projectId,
    branchId: PINNED_TARGET.branchId,
    host,
    type: "read_write",
    regionId: PINNED_TARGET.regionId,
    poolerEnabled: true,
    currentState: "idle",
    directPort: 5432,
    directSha256: createHash("sha256").update(`${host}:5432`).digest("hex"),
    pooledHost: "ep-synthetic-blue-123456-pooler.eu-central-1.aws.neon.tech",
    pooledPort: 5432,
    pooledSha256: createHash("sha256")
      .update("ep-synthetic-blue-123456-pooler.eu-central-1.aws.neon.tech:5432")
      .digest("hex"),
  });
  const detail = projectEndpointMetadata({ endpoint }, endpoints.metadata[0]);
  assert.equal(detail.status, "ok");
  const emitted = JSON.stringify({ project: projectMetadata(project), branch: branchMetadata(branch), endpoints, detail });
  for (const secret of [
    "synthetic-project-secret",
    "synthetic-branch-secret",
    "synthetic-endpoint-secret",
    "credential=synthetic-secret",
    "DATABASE_URL=synthetic-secret",
    "api-key=synthetic-secret",
  ]) assert.equal(emitted.includes(secret), false);
});

test("fails closed for project, branch or endpoint mapping drift", () => {
  const wrongProject = projectMetadata({ project: { ...project.project, org_id: "org-wrong" } });
  assert.equal(wrongProject.status, "identity_mismatch");
  assert.equal(wrongProject.metadata, null);
  const wrongBranch = branchMetadata({ branch: { ...branch.branch, id: "br-other-branch" } });
  assert.equal(wrongBranch.status, "identity_mismatch");
  assert.equal(wrongBranch.metadata, null);
  const wrongEndpoint = endpointMetadata({ endpoints: [{ ...endpoint, branch_id: "br-other-branch" }] });
  assert.equal(wrongEndpoint.status, "identity_mismatch");
  assert.equal(wrongEndpoint.metadata, null);
  assert.equal(endpointMetadata({ endpoints: [{ ...endpoint, host: `${endpoint.id}.us-east-2.aws.neon.tech` }] }).status, "identity_mismatch");
  assert.equal(endpointMetadata({ endpoints: [{ ...endpoint, pooler_enabled: "yes" }] }).status, "schema_invalid");
  const summary = endpointSchemaSummary({ endpoints: [{ ...endpoint, password: "do-not-retain" }] });
  assert.deepEqual(summary.entries[0], {
    object: true,
    id: true,
    projectId: true,
    branchId: true,
    host: true,
    safeHost: host,
    type: true,
    regionId: true,
    poolerEnabled: true,
    currentState: true,
  });
  assert.equal(JSON.stringify(summary).includes("do-not-retain"), false);
});

test("places a supported pooler suffix after endpoint ID while preserving cluster hostname labels", () => {
  const id = "ep-synthetic-cluster-123456";
  const clustered = {
    ...endpoint,
    id,
    host: `${id}.c-8.eu-central-1.aws.neon.tech`,
    pooler_enabled: true,
  };
  const result = endpointMetadata({ endpoints: [clustered] });
  assert.equal(result.status, "ok");
  assert.equal(result.metadata[0].pooledHost, `${id}-pooler.c-8.eu-central-1.aws.neon.tech`);
  assert.equal(result.metadata[0].pooledSha256, createHash("sha256")
    .update(`${id}-pooler.c-8.eu-central-1.aws.neon.tech:5432`).digest("hex"));
});

test("fixed nonzero and malformed outputs suppress secret-bearing stdout, stderr, and keys", () => {
  const rawFailure = JSON.stringify({
    error: "synthetic raw failure",
    "password=secret-key": "synthetic-secret-value",
    DATABASE_URL: "postgres://synthetic-secret-value@synthetic.invalid/db",
  });
  const failure = sanitizeCliResult({
    status: "closed",
    exitCode: 1,
    stdout: rawFailure,
    stderr: "synthetic stderr secret-value",
  }, projectMetadata);
  assert.deepEqual(failure, { status: "cli_nonzero", exitCode: 1, metadata: null });
  const malformed = sanitizeCliResult({
    status: "closed",
    exitCode: 0,
    stdout: rawFailure,
    stderr: "synthetic stderr secret-value",
  }, projectMetadata);
  assert.deepEqual(malformed, { status: "schema_invalid", exitCode: 0, metadata: null });
  const emitted = JSON.stringify({ failure, malformed });
  assert.equal(emitted.includes("synthetic"), false);
  assert.equal(emitted.includes("password=secret-key"), false);
});

test("command plan is pinned to read-only GET paths for one project and branch", () => {
  const plan = createCommandPlan("/pinned/neon/dist/cli.js");
  assert.deepEqual(plan.map(({ args }) => args), [
    ["--no-analytics", "--api-host", "https://console.neon.tech/api/v2", "api", `/projects/${PINNED_TARGET.projectId}`, "--output", "json"],
    ["--no-analytics", "--api-host", "https://console.neon.tech/api/v2", "api", `/projects/${PINNED_TARGET.projectId}/branches/${PINNED_TARGET.branchId}`, "--output", "json"],
    ["--no-analytics", "--api-host", "https://console.neon.tech/api/v2", "api", `/projects/${PINNED_TARGET.projectId}/branches/${PINNED_TARGET.branchId}/endpoints`, "--output", "json"],
  ]);
  assert.equal(plan.some(({ args }) => args.some((arg) => /connection_uri|password|sql/i.test(arg))), false);
  assert.equal(plan.every(({ args }) => args[0] === "--no-analytics"), true);
});

test("composed assessment joins endpoint detail to list state without leaking response keys or values", async () => {
  const detail = {
    endpoint: { ...endpoint, current_state: "idle", privateValue: "synthetic-detail-secret" },
    "bypassCredential=synthetic-secret": "synthetic-secret",
  };
  const responses = new Map([
    [`/projects/${PINNED_TARGET.projectId}`, project],
    [`/projects/${PINNED_TARGET.projectId}/branches/${PINNED_TARGET.branchId}`, branch],
    [`/projects/${PINNED_TARGET.projectId}/branches/${PINNED_TARGET.branchId}/endpoints`, { endpoints: [endpoint] }],
    [`/projects/${PINNED_TARGET.projectId}/endpoints/${endpoint.id}`, detail],
  ]);
  const assessment = await runAssessment({
    cliEntry: "synthetic-cli-entry",
    capture: async (args) => {
      const path = args.find((arg) => typeof arg === "string" && arg.startsWith("/projects/"));
      const response = responses.get(path);
      return response
        ? { status: "closed", exitCode: 0, stdout: JSON.stringify(response), stderr: "synthetic hidden error" }
        : { status: "closed", exitCode: 1, stdout: "", stderr: "synthetic secret" };
    },
  });
  assert.equal(assessment.status, "ok");
  assert.equal(assessment.endpoints[0].currentState, "idle");
  assert.deepEqual(assessment.endpointDetails, [{ id: endpoint.id, status: "matched" }]);
  const emitted = JSON.stringify(assessment);
  for (const secret of [
    "synthetic-project-secret",
    "synthetic-branch-secret",
    "synthetic-endpoint-secret",
    "synthetic-detail-secret",
    "synthetic hidden error",
    "bypassCredential=synthetic-secret",
  ]) assert.equal(emitted.includes(secret), false);
});

test("capture pins official API and OAuth hosts over synthetic inherited overrides", async () => {
  const originalApi = process.env.NEON_API_HOST;
  const originalOauth = process.env.NEON_OAUTH_HOST;
  process.env.NEON_API_HOST = "https://untrusted.invalid/api";
  process.env.NEON_OAUTH_HOST = "https://untrusted.invalid/oauth";
  let capturedEnv;
  try {
    const result = await captureCli([], {
      cliEntry: "dummy-cli.mjs",
      spawnImpl: (_exe, _args, options) => {
        capturedEnv = options.env;
        const child = new EventEmitter();
        child.pid = undefined;
        child.stdout = new EventEmitter();
        child.stderr = new EventEmitter();
        queueMicrotask(() => child.emit("close", 0));
        return child;
      },
    });
    assert.equal(result.status, "closed");
    assert.equal(capturedEnv.NEON_API_HOST, "https://console.neon.tech/api/v2");
    assert.equal(capturedEnv.NEON_OAUTH_HOST, "https://oauth2.neon.tech");
  } finally {
    if (originalApi === undefined) delete process.env.NEON_API_HOST;
    else process.env.NEON_API_HOST = originalApi;
    if (originalOauth === undefined) delete process.env.NEON_OAUTH_HOST;
    else process.env.NEON_OAUTH_HOST = originalOauth;
  }
});

test("capture wrapper bounds launch, timeout, and buffer outcomes without exposing child data", async () => {
  const launch = await captureCli([], { cliEntry: null });
  assert.deepEqual(launch, { status: "launch_failed", exitCode: null, stdout: "", stderr: "" });

  class StalledChild extends EventEmitter {
    pid = undefined;
    stdout = new EventEmitter();
    stderr = new EventEmitter();
    kill() { return true; }
  }
  let child;
  const timeout = await captureCli(["api"], {
    cliEntry: "dummy-cli.mjs",
    timeoutMs: 5,
    spawnImpl: () => {
      child = new StalledChild();
      return child;
    },
  });
  assert.equal(timeout.status, "timeout");
  assert.equal(timeout.stdout, "");
  assert.equal(timeout.stderr, "");

  const overflow = await captureCli(["api"], {
    cliEntry: "dummy-cli.mjs",
    timeoutMs: 100,
    spawnImpl: () => {
      const stalled = new StalledChild();
      queueMicrotask(() => {
        stalled.stdout.emit("data", Buffer.alloc(1_048_577, 0x78));
        stalled.emit("close", 0);
      });
      return stalled;
    },
  });
  assert.deepEqual(overflow, { status: "output_too_large", exitCode: 0, stdout: "", stderr: "" });
});
