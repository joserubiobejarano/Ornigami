import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  PREFLIGHT_CHECK_KEYS,
  PREFLIGHT_DEADLINES,
  PROVISIONING_TARGET,
  executeReadOnlyProbe,
  runProvisioningPreflight,
} from "../scripts/staging-provisioning-preflight.mjs";

const databaseUrl = "postgresql://synthetic-user:synthetic-password@ep-fixture.c-8.eu-central-1.aws.neon.tech/ornigami_staging";
const fingerprint = createHash("sha256")
  .update("ep-fixture.c-8.eu-central-1.aws.neon.tech:5432")
  .digest("hex");
const env = {
  DATABASE_URL: databaseUrl,
  ORNIGAMI_PREVIEW_DB_EXPECTED_ENDPOINT_SHA256: fingerprint,
  ORNIGAMI_PREVIEW_DB_EXPECTED_NAME: PROVISIONING_TARGET.databaseName,
  ORNIGAMI_PREVIEW_DB_EXPECTED_ROLE: PROVISIONING_TARGET.roleName,
};
const allChecks = Object.fromEntries(PREFLIGHT_CHECK_KEYS.map((key) => [key, true]));

test("module import is inert and the passing orchestration calls only the injected offline probe", async () => {
  let calls = 0;
  const result = await runProvisioningPreflight({
    env,
    approvedEndpointFingerprint: fingerprint,
    probe: async (options) => {
      calls += 1;
      assert.equal(options.readOnly, true);
      assert.equal(options.statementTimeoutMs, 4_000);
      assert.equal(options.requestTimeoutMs, 5_000);
      return allChecks;
    },
  });
  assert.equal(calls, 1);
  assert.deepEqual(result, { status: "verified", checks: allChecks });
});

test("direct CLI invocation with no endpoint approval fails before database-client loading", () => {
  const allowedEnv = {};
  for (const key of ["PATH", "SystemRoot", "WINDIR", "ComSpec", "TEMP", "TMP"]) {
    if (process.env[key]) allowedEnv[key] = process.env[key];
  }
  const result = spawnSync(process.execPath, [
    fileURLToPath(new URL("../scripts/staging-provisioning-preflight.mjs", import.meta.url)),
  ], { encoding: "utf8", env: allowedEnv, timeout: 2_000, windowsHide: true });
  assert.equal(result.status, 1);
  assert.equal(result.signal, null);
  assert.equal(result.stdout.trim(), '{"status":"configuration_invalid"}');
  assert.equal(result.stderr, "");
});

test("missing or invalid expectations reject before invoking the database probe", async () => {
  for (const invalidEnv of [
    { ...env, ORNIGAMI_PREVIEW_DB_EXPECTED_ENDPOINT_SHA256: undefined },
    { ...env, ORNIGAMI_PREVIEW_DB_EXPECTED_NAME: "wrong_database" },
    { ...env, ORNIGAMI_PREVIEW_DB_EXPECTED_ROLE: undefined },
  ]) {
    let calls = 0;
    const result = await runProvisioningPreflight({
      env: invalidEnv,
      approvedEndpointFingerprint: fingerprint,
      probe: async () => { calls += 1; return allChecks; },
    });
    assert.deepEqual(result, { status: "configuration_invalid" });
    assert.equal(calls, 0);
  }
  let calls = 0;
  const unapproved = await runProvisioningPreflight({
    env,
    probe: async () => { calls += 1; return allChecks; },
  });
  assert.deepEqual(unapproved, { status: "configuration_invalid" });
  assert.equal(calls, 0);
});

test("approved expected fingerprint mismatch rejects before database access", async () => {
  let calls = 0;
  const result = await runProvisioningPreflight({
    env,
    approvedEndpointFingerprint: "a".repeat(64),
    probe: async () => { calls += 1; return allChecks; },
  });
  assert.deepEqual(result, { status: "configuration_invalid" });
  assert.equal(calls, 0);
});

test("actual endpoint mismatch rejects before database access", async () => {
  let calls = 0;
  const result = await runProvisioningPreflight({
    env: {
      ...env,
      DATABASE_URL: "postgresql://user:password@wrong.example.invalid/ornigami_staging",
    },
    approvedEndpointFingerprint: fingerprint,
    probe: async () => { calls += 1; return allChecks; },
  });
  assert.deepEqual(result, { status: "endpoint_mismatch" });
  assert.equal(calls, 0);
});

test("fixture or dependent-record drift returns only fixed booleans", async () => {
  const drifted = { ...allChecks, businessMatch: false, reviewCountMatch: false };
  const result = await runProvisioningPreflight({
    env,
    approvedEndpointFingerprint: fingerprint,
    probe: async () => drifted,
  });
  assert.deepEqual(result, { status: "identity_mismatch", checks: drifted });
  assert.equal(Object.values(result.checks).every((value) => typeof value === "boolean"), true);
});

test("read-only adapter uses Neon readOnly transaction and bounded statement/request deadlines", async () => {
  let transactionOptions;
  let statements;
  let clientUrl;
  const rows = [{ ignored: true }, [allChecks]];
  const createClient = async (url) => {
    clientUrl = url;
    return {
      transaction: async (build, options) => {
        transactionOptions = options;
        const tx = (strings, ...values) => ({
          text: strings.reduce((out, part, index) => out + part + (values[index] ?? ""), ""),
        });
        statements = build(tx);
        return rows;
      },
    };
  };
  const result = await executeReadOnlyProbe({ databaseUrl }, { createClient });
  assert.equal(clientUrl, databaseUrl);
  assert.deepEqual(result, allChecks);
  assert.equal(transactionOptions.readOnly, true);
  assert.equal(transactionOptions.fetchOptions.signal instanceof AbortSignal, true);
  assert.equal(transactionOptions.fetchOptions.signal.aborted, false);
  assert.equal(statements.length, 2);
  assert.match(statements[0].text, /^\s*SELECT\b/i);
  assert.match(statements[0].text, /4000ms/);
  assert.match(statements[1].text, /^\s*SELECT\b/i);
  assert.match(statements[1].text, /6f3a17d2-8ce1-4b51-9c6a-4d3c2b1a0001/);
  assert.match(statements[1].text, /6f3a17d2-8ce1-4b51-9c6a-4d3c2b1a0002/);
  assert.doesNotMatch(statements.map((statement) => statement.text).join("\n"), /\b(INSERT|UPDATE|DELETE|password_hash|token)\b/i);
  assert.deepEqual(PREFLIGHT_DEADLINES, { statementTimeoutMs: 4_000, requestTimeoutMs: 5_000 });
});

test("query failures and secret-bearing extra keys are reduced to fixed sanitized output", async () => {
  const failure = await runProvisioningPreflight({
    env,
    approvedEndpointFingerprint: fingerprint,
    probe: async () => { throw new Error(`postgres://secret-host ERROR ${"x".repeat(64)}`); },
  });
  assert.deepEqual(failure, { status: "verification_failed" });

  const projected = await runProvisioningPreflight({
    env,
    approvedEndpointFingerprint: fingerprint,
    probe: async () => ({
      ...allChecks,
      password_hash: "synthetic-hash-must-not-escape",
      token: "synthetic-token-must-not-escape",
      DATABASE_URL: databaseUrl,
      email: "preview.owner@ornigami.example.test",
      rawError: "synthetic raw database error",
    }),
  });
  const output = JSON.stringify(projected);
  assert.deepEqual(projected, { status: "verified", checks: allChecks });
  for (const forbidden of ["synthetic-hash", "synthetic-token", "postgresql://", "preview.owner@", "raw database error"]) {
    assert.equal(output.includes(forbidden), false);
  }
});
