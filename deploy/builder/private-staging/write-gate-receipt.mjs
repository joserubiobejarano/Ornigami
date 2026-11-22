#!/usr/bin/env node
/**
 * Write the clean candidate-gate identity/results receipt.
 *
 * The receipt is the handoff from the no-DinD gate job to the build job. It
 * binds the exact control-plane, application, harness and lockfile identities
 * to the complete serialized suite result and the retained gate log.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function sha256File(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

const logPath = required("GATE_LOG_PATH");
const receiptPath = required("RECEIPT_PATH");
const log = readFileSync(logPath, "utf8");
const lines = log.split(/\r?\n/);

function summaryBlocks() {
  const blocks = [];
  for (let index = 0; index < lines.length; index += 1) {
    const match = /^# tests (\d+)$/.exec(lines[index]);
    if (!match) continue;
    const block = { tests: Number(match[1]), pass: null, fail: null, skipped: null, todo: null };
    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      const pass = /^# pass (\d+)$/.exec(lines[cursor]);
      const fail = /^# fail (\d+)$/.exec(lines[cursor]);
      const skipped = /^# skipped (\d+)$/.exec(lines[cursor]);
      const todo = /^# todo (\d+)$/.exec(lines[cursor]);
      if (pass) block.pass = Number(pass[1]);
      else if (fail) block.fail = Number(fail[1]);
      else if (skipped) block.skipped = Number(skipped[1]);
      else if (todo) block.todo = Number(todo[1]);
      else if (block.pass !== null && block.fail !== null && block.skipped !== null && block.todo !== null) break;
    }
    blocks.push(block);
  }
  return blocks;
}

const blocks = summaryBlocks().filter((block) => block.pass !== null && block.fail !== null);
if (blocks.length === 0) throw new Error(`no test summary found in ${logPath}`);
const summary = blocks.reduce((best, block) => (block.tests > best.tests ? block : best));

const receipt = {
  schemaVersion: 1,
  status: summary.fail === 0 && summary.tests > 0 ? "passed" : "failed",
  applicationSourceSha: required("APPLICATION_SOURCE_SHA"),
  harnessSha: required("HARNESS_SHA"),
  controlPlaneSha: required("CONTROL_PLANE_SHA"),
  candidateHead: required("CANDIDATE_HEAD"),
  lockfileSha256: sha256File(required("LOCKFILE_PATH")),
  gateLogSha256: sha256File(logPath),
  builderUser: process.env.BUILDER_USER ?? null,
  nodeVersion: process.env.NODE_VERSION ?? null,
  npmVersion: process.env.NPM_VERSION ?? null,
  postgresVersion: process.env.PG_VERSION ?? null,
  suiteCount: Number(required("SUITE_COUNT")),
  tests: summary.tests,
  pass: summary.pass,
  fail: summary.fail,
  skipped: summary.skipped ?? 0,
  todo: summary.todo ?? 0,
  completedAt: new Date().toISOString(),
};
if (receipt.tests !== receipt.pass + receipt.fail + receipt.skipped + receipt.todo) {
  receipt.status = "failed";
  receipt.countMismatch = true;
}
writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
console.log(JSON.stringify(receipt, null, 2));
if (receipt.status !== "passed") process.exit(2);
