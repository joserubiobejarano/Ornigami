import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  createOneShotFixtureCredentialProvisioner,
  FIXTURE_STATE_CHECK_KEYS,
  inspectAndProvisionExistingFixture,
  isBcryptCost10Hash,
} from "../scripts/staging-fixture-credential-provisioner.mjs";

const HASH = `$2b$10$${"a".repeat(53)}`;
const HOST = "ep-synthetic-test.neon.tech";
const DATABASE_URL = `postgresql://ornigami_staging_owner:synthetic-password@${HOST}/ornigami_staging`;
const FINGERPRINT = createHash("sha256").update(`${HOST}:5432`).digest("hex");
const ENV = {
  ORNIGAMI_PREVIEW_DB_EXPECTED_ENDPOINT_SHA256: FINGERPRINT,
  ORNIGAMI_PREVIEW_DB_EXPECTED_NAME: "ornigami_staging",
  ORNIGAMI_PREVIEW_DB_EXPECTED_ROLE: "ornigami_staging_owner",
};
const AUTH = { executionAuthorized: true, deliveryPlanApproved: true };
const READY = Object.fromEntries(FIXTURE_STATE_CHECK_KEYS.map((key) => [key, true]));

function fakeClient({ state = READY, updateRows = [{ updated: true }], throwOnRead = false, throwOnWrite = false } = {}) {
  const calls = [];
  const sql = {
    transaction: async (build, options) => {
      const tx = (strings, ...values) => ({ kind: "tagged", text: strings.join("?"), values });
      tx.query = (text, values) => ({ kind: "query", text, values });
      const queries = typeof build === "function" ? build(tx) : build;
      calls.push({ kind: "transaction", queries, options });
      if (options?.readOnly && throwOnRead) throw new Error("synthetic secret-bearing state failure marker");
      if (options?.readOnly) return [[state]];
      if (throwOnWrite) throw new Error("synthetic secret-bearing write failure marker");
      return [[{ configured: true }], [{ locked: true }], [{ locked: true }], updateRows];
    },
  };
  return { calls, createClient: async () => sql };
}

test("import is inert and bcrypt hash validation accepts only cost-10 encoded hashes", () => {
  assert.equal(isBcryptCost10Hash(HASH), true);
  assert.equal(isBcryptCost10Hash("synthetic-password"), false);
  assert.equal(isBcryptCost10Hash("$2b$12$" + "a".repeat(53)), false);
});

test("CLI entrypoint is inert without explicit execution and target guards", () => {
  const env = { ...process.env };
  delete env.ORNIGAMI_PREVIEW_DB_EXPECTED_ENDPOINT_SHA256;
  delete env.ORNIGAMI_PREVIEW_DB_EXPECTED_NAME;
  delete env.ORNIGAMI_PREVIEW_DB_EXPECTED_ROLE;
  const script = fileURLToPath(new URL("../scripts/staging-fixture-credential-provisioner.mjs", import.meta.url));
  const noAuthorization = spawnSync(process.execPath, [script], { encoding: "utf8", env, input: "" });
  assert.equal(noAuthorization.status, 1);
  assert.equal(noAuthorization.stdout.trim(), '{"status":"execution_not_authorized"}');
  assert.equal(noAuthorization.stderr, "");
  const noTarget = spawnSync(process.execPath, [script, "--execute-existing-fixture-write", "--delivery-plan-approved"], {
    encoding: "utf8",
    env,
    input: HASH,
  });
  assert.equal(noTarget.status, 1);
  assert.equal(noTarget.stdout.trim(), '{"status":"configuration_invalid"}');
  assert.equal(noTarget.stderr, "");
  const conflictingCustody = spawnSync(process.execPath, [
    script,
    "--execute-existing-fixture-write",
    "--delivery-plan-approved",
    "--owner-held-password-approved",
  ], { encoding: "utf8", env, input: "" });
  assert.equal(conflictingCustody.status, 1);
  assert.equal(conflictingCustody.stdout.trim(), '{"status":"credential_custody_approval_required"}');
  assert.equal(conflictingCustody.stderr, "");
});

test("endpoint, expected target and malformed hash guards reject before client construction", async () => {
  let clientCalls = 0;
  const createClient = async () => { clientCalls += 1; throw new Error("must not construct"); };
  const invoke = (overrides = {}) => inspectAndProvisionExistingFixture({
    databaseUrl: DATABASE_URL,
    approvedEndpointFingerprint: FINGERPRINT,
    endpointForm: "direct",
    passwordHash: HASH,
    ...AUTH,
    env: ENV,
    createClient,
    ...overrides,
  });
  assert.equal((await invoke({ env: { ...ENV, ORNIGAMI_PREVIEW_DB_EXPECTED_ROLE: "wrong" } })).status, "configuration_invalid");
  assert.equal((await invoke({ databaseUrl: "postgresql://ornigami_staging_owner:synthetic-password@wrong.neon.tech/ornigami_staging" })).status, "endpoint_mismatch");
  assert.equal((await invoke({ databaseUrl: `postgresql://wrong-role:synthetic-password@${HOST}/ornigami_staging` })).status, "target_mismatch");
  assert.equal((await invoke({ databaseUrl: `postgresql://ornigami_staging_owner:synthetic-password@${HOST}/wrong-db` })).status, "target_mismatch");
  assert.equal((await invoke({ passwordHash: "plaintext" })).status, "credential_hash_invalid");
  assert.equal((await invoke({ executionAuthorized: false })).status, "execution_not_authorized");
  assert.equal((await invoke({ deliveryPlanApproved: false })).status, "credential_custody_approval_required");
  assert.equal(clientCalls, 0);
});

test("state readiness is read-only, bounded and returns fixed booleans before any write", async () => {
  const { calls, createClient } = fakeClient({ state: { ...READY, deletionClear: false } });
  const result = await inspectAndProvisionExistingFixture({
    databaseUrl: DATABASE_URL,
    approvedEndpointFingerprint: FINGERPRINT,
    endpointForm: "direct",
    passwordHash: HASH,
    ...AUTH,
    env: ENV,
    createClient,
  });
  assert.deepEqual(result, { status: "credential_state_not_ready", checks: { ...READY, deletionClear: false } });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.readOnly, true);
  assert.ok(calls[0].options.fetchOptions.signal instanceof AbortSignal);
  assert.match(calls[0].queries[0].text, /password_hash IS NULL/);
  assert.match(calls[0].queries[0].text, /privacy_deletion_requested_at IS NULL/);
  assert.doesNotMatch(JSON.stringify(result), /synthetic-password|password_hash|preview\.owner/);
});

test("credential state must be one complete fixture row; missing rows stop before write", async () => {
  const { calls, createClient } = fakeClient({ state: null });
  const result = await inspectAndProvisionExistingFixture({
    databaseUrl: DATABASE_URL,
    approvedEndpointFingerprint: FINGERPRINT,
    endpointForm: "direct",
    passwordHash: HASH,
    ...AUTH,
    env: ENV,
    createClient,
  });
  assert.equal(result.status, "credential_state_not_ready");
  assert.deepEqual(result.checks, Object.fromEntries(FIXTURE_STATE_CHECK_KEYS.map((key) => [key, false])));
  assert.equal(calls.length, 1);
});

test("single guarded update is parameterized, concurrency-safe and limited to the existing user", async () => {
  const { calls, createClient } = fakeClient();
  const result = await inspectAndProvisionExistingFixture({
    databaseUrl: DATABASE_URL,
    approvedEndpointFingerprint: FINGERPRINT,
    endpointForm: "direct",
    passwordHash: HASH,
    ...AUTH,
    env: ENV,
    createClient,
  });
  assert.equal(result.status, "credential_write_applied");
  assert.deepEqual(result.checks, READY);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].options.readOnly, false);
  assert.ok(calls[1].options.fetchOptions.signal instanceof AbortSignal);
  assert.match(calls[1].queries[1].text, /billing-customer:/);
  assert.match(calls[1].queries[2].text, /billing-checkout-owner:/);
  const update = calls[1].queries[3];
  assert.equal(update.kind, "query");
  assert.deepEqual(update.values, [HASH]);
  assert.match(update.text, /^UPDATE public\.users/);
  assert.equal(update.text.match(/\bSET\b/gi)?.length, 1);
  const assignments = update.text.match(/SET([\s\S]*?)WHERE/)?.[1].replace(/\s+/g, " ").trim();
  assert.equal(assignments, "password_hash = $1, email_verified = now(), updated_at = now(), auth_version = u.auth_version + 1");
  assert.match(update.text, /u\.id = '6f3a17d2-8ce1-4b51-9c6a-4d3c2b1a0001'/);
  assert.match(update.text, /u\.password_hash IS NULL/);
  assert.match(update.text, /u\.email_verified IS NULL/);
  assert.match(update.text, /u\.privacy_deletion_requested_at IS NULL/);
  assert.match(update.text, /u\.auth_version = 0/);
  assert.match(update.text, /NOT EXISTS \(SELECT 1 FROM public\.password_reset_tokens/);
  assert.match(update.text, /NOT EXISTS \(SELECT 1 FROM public\.email_verification_tokens/);
  assert.match(update.text, /RETURNING true AS "updated"/);
  assert.doesNotMatch(update.text, /\b(?:INSERT|DELETE)\b/i);
  assert.doesNotMatch(JSON.stringify(result), /\$2b\$10\$|synthetic-password/);
});

test("zero updated rows are a concurrency conflict and never trigger a retry", async () => {
  const { calls, createClient } = fakeClient({ updateRows: [] });
  const result = await inspectAndProvisionExistingFixture({
    databaseUrl: DATABASE_URL,
    approvedEndpointFingerprint: FINGERPRINT,
    endpointForm: "direct",
    passwordHash: HASH,
    ...AUTH,
    env: ENV,
    createClient,
  });
  assert.deepEqual(result, { status: "concurrent_state_change", checks: READY });
  assert.equal(calls.length, 2);
});

test("multiple returned rows fail closed as uncertain rather than claiming success", async () => {
  const { calls, createClient } = fakeClient({ updateRows: [{ updated: true }, { updated: true }] });
  const result = await inspectAndProvisionExistingFixture({
    databaseUrl: DATABASE_URL,
    approvedEndpointFingerprint: FINGERPRINT,
    endpointForm: "direct",
    passwordHash: HASH,
    ...AUTH,
    env: ENV,
    createClient,
  });
  assert.deepEqual(result, { status: "write_outcome_uncertain" });
  assert.equal(calls.length, 2);
});

test("write transport errors are sanitized as uncertain and are not retried", async () => {
  const { calls, createClient } = fakeClient({ throwOnWrite: true });
  const result = await inspectAndProvisionExistingFixture({
    databaseUrl: DATABASE_URL,
    approvedEndpointFingerprint: FINGERPRINT,
    endpointForm: "direct",
    passwordHash: HASH,
    ...AUTH,
    env: ENV,
    createClient,
  });
  assert.deepEqual(result, { status: "write_outcome_uncertain" });
  assert.equal(calls.length, 2);
  assert.doesNotMatch(JSON.stringify(result), /synthetic secret-bearing/);
});

test("state-read failures stop before the write and report no commit ambiguity", async () => {
  const { calls, createClient } = fakeClient({ throwOnRead: true });
  const result = await inspectAndProvisionExistingFixture({
    databaseUrl: DATABASE_URL,
    approvedEndpointFingerprint: FINGERPRINT,
    endpointForm: "direct",
    passwordHash: HASH,
    ...AUTH,
    env: ENV,
    createClient,
  });
  assert.deepEqual(result, { status: "verification_failed" });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.readOnly, true);
  assert.doesNotMatch(JSON.stringify(result), /synthetic secret-bearing/);
});

test("one-shot wrapper requires execution and delivery approvals and runs identity check before write", async () => {
  const order = [];
  const createLauncher = (options) => {
    return async ({ approvedEndpointFingerprint, endpointForm, env }) => options.sanitizeResult(await options.runPreflight({
      env: { ...ENV, ...env, DATABASE_URL },
      approvedEndpointFingerprint,
      endpointForm,
    }));
  };
  const deniedExecution = createOneShotFixtureCredentialProvisioner({
    createLauncher,
    runIdentityPreflight: async () => { order.push("identity"); return { status: "verified", checks: {} }; },
    provision: async (input) => { order.push("write"); assert.equal(input.passwordHash, HASH); return { status: "credential_write_applied", checks: READY, secret: "suppressed" }; },
  });
  assert.equal((await deniedExecution({})).status, "execution_not_authorized");
  assert.equal((await deniedExecution({ executionAuthorized: true })).status, "already_attempted");
  assert.deepEqual(order, []);

  const deniedDelivery = createOneShotFixtureCredentialProvisioner({
    createLauncher,
    runIdentityPreflight: async () => { order.push("identity"); return { status: "verified", checks: {} }; },
    provision: async (input) => { order.push("write"); assert.equal(input.passwordHash, HASH); return { status: "credential_write_applied", checks: READY, secret: "suppressed" }; },
  });
  assert.equal((await deniedDelivery({ executionAuthorized: true, deliveryPlanApproved: false })).status, "credential_custody_approval_required");
  assert.deepEqual(order, []);

  const deniedBothCustodyModes = createOneShotFixtureCredentialProvisioner({ createLauncher });
  assert.equal((await deniedBothCustodyModes({
    executionAuthorized: true,
    deliveryPlanApproved: true,
    ownerHeldPasswordApproved: true,
  })).status, "credential_custody_approval_required");

  const provisionApproved = createOneShotFixtureCredentialProvisioner({
    createLauncher,
    runIdentityPreflight: async () => { order.push("identity"); return { status: "verified", checks: {} }; },
    provision: async (input) => {
      order.push("write");
      assert.equal(input.passwordHash, HASH);
      assert.equal(input.ownerHeldPasswordApproved, true);
      assert.equal(input.deliveryPlanApproved, false);
      return { status: "credential_write_applied", checks: READY, secret: "suppressed" };
    },
  });
  const result = await provisionApproved({
    executionAuthorized: true,
    ownerHeldPasswordApproved: true,
    approvedEndpointFingerprint: FINGERPRINT,
    endpointForm: "direct",
    passwordHash: HASH,
    env: ENV,
  });
  assert.equal(result.status, "credential_write_applied");
  assert.deepEqual(order, ["identity", "write"]);
  assert.deepEqual(result.checks, READY);
  assert.doesNotMatch(JSON.stringify(result), /secret|\$2b\$10\$/);
});

test("approved one-shot path preserves fixed output and does not expose unexpected result fields", async () => {
  const createLauncher = (optionsArg) => {
    return async ({ approvedEndpointFingerprint, endpointForm, env }) => optionsArg.sanitizeResult(await optionsArg.runPreflight({
      env: { ...ENV, ...env, DATABASE_URL },
      approvedEndpointFingerprint,
      endpointForm,
    }));
  };
  const provisionOnce = createOneShotFixtureCredentialProvisioner({
    createLauncher,
    runIdentityPreflight: async () => ({ status: "verified" }),
    provision: async () => ({ status: "credential_write_applied", checks: READY, rawError: "secret-marker" }),
  });
  const result = await provisionOnce({
    executionAuthorized: true,
    deliveryPlanApproved: true,
    approvedEndpointFingerprint: FINGERPRINT,
    endpointForm: "direct",
    passwordHash: HASH,
    env: ENV,
  });
  // The fake launcher above mirrors the reviewed launcher's injected callback path.
  assert.equal(result.status, "credential_write_applied");
  assert.deepEqual(result.checks, READY);
  assert.doesNotMatch(JSON.stringify(result), /secret-marker|\$2b\$10\$/);
});

test("provisioner result sanitizer rejects incomplete or contradictory success checks", async (t) => {
  const cases = [
    { name: "missing check", checks: Object.fromEntries(FIXTURE_STATE_CHECK_KEYS.slice(0, -1).map((key) => [key, true])) },
    { name: "false check", checks: { ...READY, deletionClear: false } },
    { name: "wrong-type check", checks: { ...READY, authVersionExpected: 1 } },
  ];
  for (const item of cases) await t.test(item.name, async () => {
    let provisionCalls = 0;
    const createLauncher = (options) => async ({ approvedEndpointFingerprint, endpointForm, env }) => options.sanitizeResult(await options.runPreflight({
      env: { ...ENV, ...env, DATABASE_URL }, approvedEndpointFingerprint, endpointForm,
    }));
    const provisionOnce = createOneShotFixtureCredentialProvisioner({
      createLauncher,
      runIdentityPreflight: async () => ({ status: "verified" }),
      provision: async () => {
        provisionCalls += 1;
        return { status: "credential_write_applied", checks: item.checks, secret: "suppressed" };
      },
    });
    const result = await provisionOnce({
      executionAuthorized: true, deliveryPlanApproved: true,
      approvedEndpointFingerprint: FINGERPRINT, endpointForm: "direct", passwordHash: HASH, env: ENV,
    });
    assert.deepEqual(result, { status: "write_outcome_uncertain" });
    assert.equal(provisionCalls, 1);
    assert.doesNotMatch(JSON.stringify(result), /secret|suppressed|\$2b\$10\$/);
  });
});
