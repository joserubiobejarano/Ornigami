#!/usr/bin/env node
/**
 * Verify the clean candidate-gate receipt against the exact build-job checkout.
 *
 * A mismatch stops the build job before any image is built. The receipt binds
 * control-plane, application, harness and lockfile identities to the complete
 * serialized suite result and the retained gate log.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function sha256File(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

const receiptPath = required("RECEIPT_PATH");
const logPath = required("GATE_LOG_PATH");
if (!existsSync(receiptPath)) throw new Error(`receipt is missing: ${receiptPath}`);
if (!existsSync(logPath)) throw new Error(`gate log is missing: ${logPath}`);
const receipt = JSON.parse(readFileSync(receiptPath, "utf8"));

const checks = [];
function check(name, actual, expected) {
  const ok = actual === expected;
  checks.push({ name, ok, actual, expected });
  if (!ok) throw new Error(`${name} mismatch: actual=${actual} expected=${expected}`);
}

check("schemaVersion", receipt.schemaVersion, 1);
check("status", receipt.status, "passed");
check("applicationSourceSha", receipt.applicationSourceSha, required("EXPECTED_SOURCE_SHA"));
check("harnessSha", receipt.harnessSha, required("EXPECTED_HARNESS_SHA"));
check("controlPlaneSha", receipt.controlPlaneSha, required("EXPECTED_CONTROL_PLANE_SHA"));
check("candidateHead", receipt.candidateHead, required("EXPECTED_SOURCE_SHA"));
check("lockfileSha256", receipt.lockfileSha256, required("EXPECTED_LOCKFILE_SHA256"));
check("gateLogSha256", receipt.gateLogSha256, sha256File(logPath));

if (!Number.isInteger(receipt.tests) || receipt.tests <= 0) throw new Error("receipt tests must be a positive integer");
if (receipt.fail !== 0) throw new Error(`receipt records ${receipt.fail} failing tests`);
if (!Number.isInteger(receipt.suiteCount) || receipt.suiteCount <= 0) throw new Error("receipt suiteCount must be positive");
if (receipt.pass + receipt.fail + receipt.skipped + receipt.todo !== receipt.tests) {
  throw new Error("receipt test counts do not reconcile");
}

const result = {
  ok: true,
  status: receipt.status,
  applicationSourceSha: receipt.applicationSourceSha,
  harnessSha: receipt.harnessSha,
  controlPlaneSha: receipt.controlPlaneSha,
  lockfileSha256: receipt.lockfileSha256,
  gateLogSha256: receipt.gateLogSha256,
  suiteCount: receipt.suiteCount,
  tests: receipt.tests,
  pass: receipt.pass,
  fail: receipt.fail,
  skipped: receipt.skipped,
  todo: receipt.todo,
  checks,
};
console.log(JSON.stringify(result, null, 2));
