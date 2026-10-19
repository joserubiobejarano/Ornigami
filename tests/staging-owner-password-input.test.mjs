import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { EventEmitter } from "node:events";
import { createHash } from "node:crypto";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  readConfirmedPassword,
  readMaskedValue,
  runOwnerSuppliedPasswordProvisioning,
  runProvisionerWithHash,
} from "../scripts/staging-owner-password-input.mjs";

const PASSWORD = "synthetic-owner-password";
const HASH = `$2b$10$${"b".repeat(53)}`;
const HOST = "ep-synthetic-owner-input.neon.tech";
const FINGERPRINT = createHash("sha256").update(`${HOST}:5432`).digest("hex");
const ENV = {
  PATH: "C:\\synthetic-path",
  APPDATA: "C:\\synthetic-appdata",
  ORNIGAMI_PREVIEW_DB_EXPECTED_ENDPOINT_SHA256: FINGERPRINT,
  ORNIGAMI_PREVIEW_DB_EXPECTED_NAME: "ornigami_staging",
  ORNIGAMI_PREVIEW_DB_EXPECTED_ROLE: "ornigami_staging_owner",
  DATABASE_URL: "must-not-pass-to-child",
  NEON_API_KEY: "must-not-pass-to-child",
};

class FakeTerminal extends EventEmitter {
  isTTY = true;
  rawModes = [];
  encodings = [];
  paused = false;
  setRawMode(value) { this.rawModes.push(value); }
  setEncoding(value) { this.encodings.push(value); }
  resume() { this.paused = false; }
  pause() { this.paused = true; }
}

test("masked input never echoes entered characters and restores terminal mode", async () => {
  const input = new FakeTerminal();
  let output = "";
  const reading = readMaskedValue("Password (hidden): ", { input, output: { write: (text) => { output += text; } } });
  input.emit("data", PASSWORD);
  input.emit("data", "\r");
  assert.equal(await reading, PASSWORD);
  assert.equal(output, "Password (hidden): \n");
  assert.deepEqual(input.rawModes, [true, false]);
  assert.equal(input.paused, true);
});

test("confirmed owner input follows the exact application password policy", async () => {
  const values = [PASSWORD, PASSWORD];
  const valid = await readConfirmedPassword({ readValue: async () => values.shift() });
  assert.deepEqual(valid, { status: "confirmed", password: PASSWORD });

  const mismatchValues = ["synthetic-one", "synthetic-two"];
  const mismatch = await readConfirmedPassword({ readValue: async () => mismatchValues.shift() });
  assert.deepEqual(mismatch, { status: "confirmation_mismatch" });

  const tooShort = await readConfirmedPassword({ readValue: async () => "short" });
  assert.deepEqual(tooShort, { status: "password_invalid" });

  const overByteLimit = "é".repeat(37);
  const tooManyBytes = await readConfirmedPassword({ readValue: async () => overByteLimit });
  assert.deepEqual(tooManyBytes, { status: "password_invalid" });
  const exactByteLimitValues = ["é".repeat(36), "é".repeat(36)];
  const exactByteLimit = await readConfirmedPassword({ readValue: async () => exactByteLimitValues.shift() });
  assert.equal(exactByteLimit.status, "confirmed");
});

test("CLI entrypoint stays inert without execution and owner-held custody approvals", () => {
  const env = { ...process.env };
  delete env.ORNIGAMI_PREVIEW_DB_EXPECTED_ENDPOINT_SHA256;
  delete env.ORNIGAMI_PREVIEW_DB_EXPECTED_NAME;
  delete env.ORNIGAMI_PREVIEW_DB_EXPECTED_ROLE;
  const script = fileURLToPath(new URL("../scripts/staging-owner-password-input.mjs", import.meta.url));
  const noExecution = spawnSync(process.execPath, ["--experimental-strip-types", script], { encoding: "utf8", env, input: "" });
  assert.equal(noExecution.status, 1);
  assert.equal(noExecution.stdout.trim(), '{"status":"execution_not_authorized"}');
  assert.doesNotMatch(noExecution.stderr, /synthetic-owner-password|\$2b\$10\$/);
  const noCustody = spawnSync(process.execPath, ["--experimental-strip-types", script, "--execute-existing-fixture-write"], {
    encoding: "utf8", env, input: "",
  });
  assert.equal(noCustody.status, 1);
  assert.equal(noCustody.stdout.trim(), '{"status":"credential_custody_approval_required"}');
  assert.doesNotMatch(noCustody.stderr, /synthetic-owner-password|\$2b\$10\$/);
});

test("explicit execution, owner-held custody and endpoint guards run before prompting", async () => {
  let prompts = 0;
  let hashes = 0;
  let launches = 0;
  const invoke = (overrides = {}) => runOwnerSuppliedPasswordProvisioning({
    approvedEndpointFingerprint: FINGERPRINT,
    endpointForm: "direct",
    executionAuthorized: true,
    ownerHeldPasswordApproved: true,
    env: ENV,
    readValue: async () => { prompts += 1; return PASSWORD; },
    hashPassword: async () => { hashes += 1; return HASH; },
    runProvisioner: async () => { launches += 1; return { status: "credential_write_applied" }; },
    ...overrides,
  });
  assert.equal((await invoke({ executionAuthorized: false })).status, "execution_not_authorized");
  assert.equal((await invoke({ ownerHeldPasswordApproved: false })).status, "credential_custody_approval_required");
  assert.equal((await invoke({ env: { ...ENV, ORNIGAMI_PREVIEW_DB_EXPECTED_NAME: "wrong" } })).status, "configuration_invalid");
  assert.deepEqual([prompts, hashes, launches], [0, 0, 0]);
});

test("only a synthetic cost-10 hash reaches the provisioner; password stays out of args and environment", async () => {
  let receivedHash;
  let receivedOptions;
  let hashRounds;
  const result = await runOwnerSuppliedPasswordProvisioning({
    approvedEndpointFingerprint: FINGERPRINT,
    endpointForm: "direct",
    executionAuthorized: true,
    ownerHeldPasswordApproved: true,
    env: ENV,
    readValue: async () => PASSWORD,
    hashPassword: async (value, rounds) => {
      assert.equal(value, PASSWORD);
      hashRounds = rounds;
      return HASH;
    },
    runProvisioner: async (hash, options) => {
      receivedHash = hash;
      receivedOptions = options;
      return { status: "credential_write_applied", arbitrary: PASSWORD };
    },
  });
  assert.equal(hashRounds, 10);
  assert.equal(receivedHash, HASH);
  assert.equal(receivedOptions.approvedEndpointFingerprint, FINGERPRINT);
  assert.equal(receivedOptions.endpointForm, "direct");
  assert.equal(Object.values(receivedOptions.env).includes(PASSWORD), false);
  assert.equal(result.status, "credential_write_applied");
  assert.doesNotMatch(JSON.stringify(result), /synthetic-owner-password|\$2b\$10\$/);
});

test("provisioner handoff sends the hash only on stdin and strips unrelated environment values", async () => {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.stdin = {
    end(buffer, callback) {
      this.received = Buffer.from(buffer);
      callback?.();
    },
  };
  let captured;
  const spawnImpl = (command, args, options) => {
    captured = { command, args, options };
    setImmediate(() => {
      child.stdout.emit("data", Buffer.from('{"status":"credential_write_applied","checks":{"identityMatch":true},"secret":"suppressed"}\n'));
      child.emit("close", 0);
    });
    return child;
  };
  const result = await runProvisionerWithHash(HASH, {
    approvedEndpointFingerprint: FINGERPRINT,
    endpointForm: "direct",
    spawnImpl,
    env: ENV,
  });
  assert.equal(result.status, "credential_write_applied");
  assert.deepEqual(result.checks, {
    identityMatch: true,
    passwordHashAbsent: false,
    emailUnverified: false,
    deletionClear: false,
    authVersionExpected: false,
    noVerificationToken: false,
    noResetToken: false,
  });
  assert.ok(captured.args.includes("--owner-held-password-approved"));
  assert.ok(captured.args.includes(FINGERPRINT));
  assert.equal(captured.args.includes(HASH), false);
  assert.equal(captured.options.env.DATABASE_URL, undefined);
  assert.equal(captured.options.env.NEON_API_KEY, undefined);
  assert.equal(captured.options.env.ORNIGAMI_PREVIEW_DB_EXPECTED_NAME, "ornigami_staging");
  assert.equal(child.stdin.received.toString("utf8"), `${HASH}\n`);
  assert.doesNotMatch(JSON.stringify(result), /secret|\$2b\$10\$/);
});

test("uncertain or secret-bearing provisioner output is reduced to a fixed uncertain status", async () => {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.stdin = { end(_buffer, callback) { callback?.(); } };
  const spawnImpl = (_command, _args, _options) => {
    setImmediate(() => {
      child.stdout.emit("data", Buffer.from(`raw secret ${PASSWORD}`));
      child.stderr.emit("data", Buffer.from(`secret error ${HASH}`));
      child.emit("close", 1);
    });
    return child;
  };
  const result = await runProvisionerWithHash(HASH, {
    approvedEndpointFingerprint: FINGERPRINT,
    endpointForm: "direct",
    spawnImpl,
    env: ENV,
  });
  assert.deepEqual(result, { status: "write_outcome_uncertain" });
  assert.doesNotMatch(JSON.stringify(result), /synthetic-owner-password|\$2b\$10\$|secret error/);
});
