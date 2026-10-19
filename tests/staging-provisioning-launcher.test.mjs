import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  LAUNCHER_LIMITS,
  NEON_API_HOST,
  NEON_OAUTH_HOST,
  buildNeonConnectionStringArgs,
  createOneShotProvisioningLauncher,
} from "../scripts/staging-provisioning-launcher.mjs";
import { PREFLIGHT_CHECK_KEYS, PROVISIONING_TARGET } from "../scripts/staging-provisioning-preflight.mjs";

const hostname = "ep-synthetic-fixture.c-8.eu-central-1.aws.neon.tech";
const fingerprint = createHash("sha256").update(`${hostname}:5432`).digest("hex");
const approvedEnv = {
  ORNIGAMI_PREVIEW_DB_EXPECTED_ENDPOINT_SHA256: fingerprint,
  ORNIGAMI_PREVIEW_DB_EXPECTED_NAME: PROVISIONING_TARGET.databaseName,
  ORNIGAMI_PREVIEW_DB_EXPECTED_ROLE: PROVISIONING_TARGET.roleName,
  DATABASE_URL: "postgresql://parent-secret-must-not-be-forwarded.invalid/ignored",
};
const allChecks = Object.fromEntries(PREFLIGHT_CHECK_KEYS.map((key) => [key, true]));
const credentialUri = `postgresql://${PROVISIONING_TARGET.roleName}:synthetic-password@${hostname}:5432/${PROVISIONING_TARGET.databaseName}?sslmode=require&channel_binding=require`;

function syntheticSpawn({ stdout = "", stderr = "", exitCode = 0, stalled = false, record = {} } = {}) {
  return (_executable, args, options) => {
    record.args = args;
    record.options = options;
    const child = new EventEmitter();
    child.pid = undefined;
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.kill = () => true;
    record.child = child;
    queueMicrotask(() => {
      if (stalled) return;
      if (stdout) child.stdout.emit("data", Buffer.from(stdout));
      if (stderr) child.stderr.emit("data", Buffer.from(stderr));
      child.emit("close", exitCode);
    });
    return child;
  };
}

function createLauncher({ stdout = credentialUri, stderr = "", exitCode = 0, stalled = false, ...deps } = {}) {
  const record = {};
  let spawnCalls = 0;
  const spawnImpl = syntheticSpawn({ stdout, stderr, exitCode, stalled, record });
  const launcher = createOneShotProvisioningLauncher({
    cliEntry: "synthetic-neon-cli-entry",
    spawnImpl: (...args) => { spawnCalls += 1; return spawnImpl(...args); },
    killTree: async (child) => queueMicrotask(() => child.emit("close", null)),
    envSource: {
      PATH: "C:\\synthetic-path",
      USERPROFILE: "C:\\synthetic-user",
      DATABASE_URL: "parent-uri-sentinel",
      NEON_API_KEY: "parent-api-key-sentinel",
      NEON_PROFILE: "wrong-profile-sentinel",
      NEON_CONFIG_DIR: "wrong-config-dir-sentinel",
      NEON_API_HOST: "https://untrusted-api.invalid",
      NEON_OAUTH_HOST: "https://untrusted-oauth.invalid",
      ...deps.envSource,
    },
    ...deps,
  });
  return { launcher, record, get spawnCalls() { return spawnCalls; } };
}

test("builds the reviewed exact-target command and explicit direct/pooled selector", () => {
  const direct = buildNeonConnectionStringArgs({ endpointForm: "direct", approvedEndpointFingerprint: fingerprint });
  const pooled = buildNeonConnectionStringArgs({ endpointForm: "pooled", approvedEndpointFingerprint: fingerprint });
  assert.deepEqual(direct.slice(0, 7), [
    "--no-analytics", "--api-host", NEON_API_HOST, "--oauth-host", NEON_OAUTH_HOST, "--profile", "DEFAULT",
  ]);
  assert.ok(direct.includes("--no-color"));
  assert.ok(direct.includes("connection-string"));
  assert.ok(direct.includes("br-young-voice-bamzc53o"));
  assert.ok(direct.includes("--project-id"));
  assert.ok(direct.includes("dawn-lake-13525647"));
  assert.ok(direct.includes("--database-name"));
  assert.ok(direct.includes("ornigami_staging"));
  assert.ok(direct.includes("--role-name"));
  assert.ok(direct.includes("ornigami_staging_owner"));
  assert.ok(direct.includes("--endpoint-type"));
  assert.ok(direct.includes("read_write"));
  assert.equal(direct.includes("--pooled"), false);
  assert.equal(pooled.includes("--pooled"), true);
  assert.equal(direct.some((arg) => /password|synthetic-password|postgresql:/.test(arg)), false);
  assert.equal(buildNeonConnectionStringArgs({ endpointForm: "unknown", approvedEndpointFingerprint: fingerprint }), null);
});

test("successful credential response is handed to existing preflight only in memory", async () => {
  let preflightCalls = 0;
  let memoryUrl;
  const state = createLauncher({
    runPreflight: async ({ env, approvedEndpointFingerprint }) => {
      preflightCalls += 1;
      memoryUrl = env.DATABASE_URL;
      assert.equal(env.ORNIGAMI_PREVIEW_DB_EXPECTED_ENDPOINT_SHA256, approvedEndpointFingerprint);
      assert.equal(env.ORNIGAMI_PREVIEW_DB_EXPECTED_NAME, PROVISIONING_TARGET.databaseName);
      assert.equal(env.ORNIGAMI_PREVIEW_DB_EXPECTED_ROLE, PROVISIONING_TARGET.roleName);
      return { status: "verified", checks: allChecks, connection: memoryUrl };
    },
  });
  const result = await state.launcher({ env: approvedEnv, approvedEndpointFingerprint: fingerprint, endpointForm: "direct" });
  assert.equal(state.spawnCalls, 1);
  assert.equal(preflightCalls, 1);
  assert.equal(memoryUrl, credentialUri);
  assert.deepEqual(result, { status: "verified", checks: allChecks });
  const emitted = JSON.stringify(result);
  for (const secret of ["synthetic-password", PROVISIONING_TARGET.roleName, "postgresql://"]) {
    assert.equal(emitted.includes(secret), false);
  }
  assert.equal(Object.hasOwn(state.record.options.env, "DATABASE_URL"), false);
  assert.equal(Object.hasOwn(state.record.options.env, "NEON_API_KEY"), false);
  assert.equal(Object.hasOwn(state.record.options.env, "NEON_PROFILE"), false);
  assert.equal(Object.hasOwn(state.record.options.env, "NEON_CONFIG_DIR"), false);
  assert.equal(state.record.options.env.NEON_API_HOST, NEON_API_HOST);
  assert.equal(state.record.options.env.NEON_OAUTH_HOST, NEON_OAUTH_HOST);
  assert.equal(state.record.options.env.CI, "true");
  assert.equal(state.record.args.includes(credentialUri), false);
  assert.equal(state.record.args.some((arg) => arg.includes("synthetic-password")), false);
});

test("wrong database/role selectors, endpoint fingerprint and malformed credentials stop before preflight", async () => {
  const cases = [
    { stdout: "postgresql://wrong_role:pw@" + hostname + ":5432/ornigami_staging", expected: "target_mismatch" },
    { stdout: "postgresql://ornigami_staging_owner:pw@" + hostname + ":5432/other_db", expected: "target_mismatch" },
    { stdout: "postgresql://ornigami_staging_owner:pw@wrong.example.invalid/ornigami_staging", expected: "endpoint_mismatch" },
    { stdout: "{\"connection_string\":\"postgresql://secret-value\"}", expected: "credential_response_invalid" },
    { stdout: `${credentialUri}\nextra-output`, expected: "credential_response_invalid" },
  ];
  for (const item of cases) {
    let preflightCalls = 0;
    const { launcher } = createLauncher({
      stdout: item.stdout,
      runPreflight: async () => { preflightCalls += 1; return { status: "verified", checks: allChecks }; },
    });
    const result = await launcher({ env: approvedEnv, approvedEndpointFingerprint: fingerprint, endpointForm: "direct" });
    assert.deepEqual(result, { status: item.expected });
    assert.equal(preflightCalls, 0);
  }
});

test("configuration and endpoint-form guards prevent credential retrieval", async () => {
  let calls = 0;
  const dependencies = {
    cliEntry: "synthetic-neon-cli-entry",
    spawnImpl: () => { calls += 1; throw new Error("must not launch"); },
  };
  const missing = createOneShotProvisioningLauncher(dependencies);
  const invalidForm = createOneShotProvisioningLauncher(dependencies);
  assert.deepEqual(await missing({ env: {}, approvedEndpointFingerprint: fingerprint, endpointForm: "direct" }), { status: "configuration_invalid" });
  assert.deepEqual(await invalidForm({ env: approvedEnv, approvedEndpointFingerprint: fingerprint, endpointForm: "invalid" }), { status: "configuration_invalid" });
  assert.equal(calls, 0);
});

test("secret-bearing CLI errors and non-success exits remain private and are never retried", async () => {
  const secretError = `provider error ${credentialUri} key=synthetic-api-key`;
  const state = createLauncher({ stdout: credentialUri, stderr: secretError, exitCode: 1 });
  const first = await state.launcher({ env: approvedEnv, approvedEndpointFingerprint: fingerprint, endpointForm: "direct" });
  const second = await state.launcher({ env: approvedEnv, approvedEndpointFingerprint: fingerprint, endpointForm: "direct" });
  assert.deepEqual(first, { status: "cli_failed" });
  assert.deepEqual(second, { status: "already_attempted" });
  assert.equal(state.spawnCalls, 1);
  assert.equal(JSON.stringify([first, second]).includes("synthetic-password"), false);
  assert.equal(JSON.stringify([first, second]).includes("synthetic-api-key"), false);
});

test("timeout kills the child tree and output overflow stops without retry or preflight", async () => {
  let timeoutKills = 0;
  let probeCalls = 0;
  const timeout = createLauncher({
    stalled: true,
    timeoutMs: 10,
    killTree: async (child) => { timeoutKills += 1; queueMicrotask(() => child.emit("close", null)); },
    runPreflight: async () => { probeCalls += 1; return { status: "verified", checks: allChecks }; },
  });
  const timeoutResult = await timeout.launcher({ env: approvedEnv, approvedEndpointFingerprint: fingerprint, endpointForm: "direct" });
  assert.deepEqual(timeoutResult, { status: "cli_timeout" });
  assert.equal(timeoutKills, 1);
  assert.equal(timeout.spawnCalls, 1);

  let overflowKills = 0;
  const overflow = createLauncher({
    stdout: "x".repeat(128),
    maxBytesPerStream: 64,
    killTree: async (child) => { overflowKills += 1; queueMicrotask(() => child.emit("close", null)); },
    runPreflight: async () => { probeCalls += 1; return { status: "verified", checks: allChecks }; },
  });
  const overflowResult = await overflow.launcher({ env: approvedEnv, approvedEndpointFingerprint: fingerprint, endpointForm: "direct" });
  assert.deepEqual(overflowResult, { status: "output_too_large" });
  assert.equal(overflowKills, 1);
  assert.equal(overflow.spawnCalls, 1);
  assert.equal(probeCalls, 0);
  assert.deepEqual(LAUNCHER_LIMITS, { timeoutMs: 20_000, maxBytesPerStream: 16_384 });
});

test("preflight errors and unexpected result keys are fixed and sanitized", async () => {
  const failed = createLauncher({
    runPreflight: async () => { throw new Error(`database ${credentialUri}`); },
  });
  assert.deepEqual(await failed.launcher({ env: approvedEnv, approvedEndpointFingerprint: fingerprint, endpointForm: "direct" }), { status: "verification_failed" });

  const secretResult = createLauncher({
    runPreflight: async () => ({
      status: `verified ${credentialUri}`,
      checks: { ...allChecks, password_hash: "synthetic-hash", token: "synthetic-token" },
      rawError: credentialUri,
    }),
  });
  const result = await secretResult.launcher({ env: approvedEnv, approvedEndpointFingerprint: fingerprint, endpointForm: "direct" });
  assert.deepEqual(result, { status: "verification_failed" });
  assert.equal(JSON.stringify(result).includes("synthetic-password"), false);
  assert.equal(JSON.stringify(result).includes("synthetic-hash"), false);
});
