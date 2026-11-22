#!/usr/bin/env node
/**
 * Write the independent retrieval receipt.
 *
 * Archive recovery and qualification are separate results. A successful archive
 * load never marks overall qualification complete by itself: the retrieval
 * receipt stays "archive-verified-qualification-incomplete" unless a valid,
 * complete qualification custody receipt is supplied.
 */
import {
  closeSync,
  existsSync,
  fsyncSync,
  openSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeSync,
} from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";

function fail(message) {
  throw new Error(message);
}

function required(values, name) {
  const value = values[name];
  if (typeof value !== "string" || value.length === 0) fail(`--${name} is required`);
  return value;
}

function check(pattern, value, label) {
  if (!pattern.test(value)) fail(`${label} is invalid: ${value}`);
}

function readJson(file, label) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    fail(`could not read ${label}: ${error.message}`);
  }
}

function parseIdentity(file) {
  const lines = readFileSync(file, "utf8").trim().split(/\r?\n/);
  return Object.fromEntries(
    lines.map((line) => {
      const index = line.indexOf("=");
      if (index <= 0) fail(`invalid identity line: ${line}`);
      return [line.slice(0, index), line.slice(index + 1)];
    }),
  );
}

const { values } = parseArgs({
  options: {
    "archive-verification": { type: "string" },
    identity: { type: "string" },
    "qualification-receipt": { type: "string", default: "" },
    output: { type: "string" },
    "workflow-sha": { type: "string" },
    "retrieval-daemon-id": { type: "string" },
    "expected-source-sha": { type: "string" },
    "expected-image-id": { type: "string" },
    "expected-archive-sha256": { type: "string" },
    "expected-archive-bytes": { type: "string" },
    "expected-producer-harness-sha": { type: "string" },
    "expected-consumer-harness-sha": { type: "string" },
    "require-distinct-harness": { type: "boolean", default: false },
  },
  strict: true,
});

const verificationPath = required(values, "archive-verification");
const identityPath = required(values, "identity");
const output = required(values, "output");
const workflow = required(values, "workflow-sha");
const retrievalDaemon = required(values, "retrieval-daemon-id");
const expectedSource = required(values, "expected-source-sha");
const expectedImage = required(values, "expected-image-id");
const expectedArchiveSha = required(values, "expected-archive-sha256");
const expectedArchiveBytes = required(values, "expected-archive-bytes");
const expectedProducer = required(values, "expected-producer-harness-sha");
const expectedConsumer = required(values, "expected-consumer-harness-sha");

check(/^[0-9a-f]{40}$/, workflow, "workflow SHA");
check(/^[0-9a-f]{40}$/, expectedSource, "expected source SHA");
check(/^sha256:[0-9a-f]{64}$/, expectedImage, "expected image ID");
check(/^[0-9a-f]{64}$/, expectedArchiveSha, "expected archive SHA-256");
if (!/^[0-9]+$/.test(expectedArchiveBytes)) fail("expected archive bytes must be an integer");
const archiveBytesExpected = Number(expectedArchiveBytes);
if (!Number.isSafeInteger(archiveBytesExpected) || archiveBytesExpected <= 0) {
  fail("expected archive bytes are out of range");
}
check(/^[0-9a-f]{40}$/, expectedProducer, "expected producer harness SHA");
check(/^[0-9a-f]{40}$/, expectedConsumer, "expected consumer harness SHA");
if (values["require-distinct-harness"] && expectedProducer === expectedConsumer) {
  fail("producer and consumer harness SHAs must remain distinct");
}

for (const [file, label] of [
  [verificationPath, "archive verification"],
  [identityPath, "original identity"],
]) {
  if (!existsSync(file)) fail(`${label} is missing: ${file}`);
}

const verification = readJson(verificationPath, "archive verification");
for (const key of ["ok", "complete", "independentHandoff"]) {
  if (verification[key] !== true) fail(`archive verification ${key} is not true`);
}
for (const key of [
  "freshDaemonVerified",
  "archiveHashMatched",
  "receiptIdentityValid",
  "loadSucceeded",
  "identityVerified",
]) {
  if (verification.checks?.[key] !== true) fail(`archive verification check ${key} is not true`);
}
if (verification.imageId !== expectedImage) fail("archive verification image ID mismatch");
if (verification.applicationSourceSha !== expectedSource) fail("archive verification source SHA mismatch");
if (verification.harnessSha !== expectedProducer) fail("archive verification producer harness mismatch");
if (verification.archiveSha256 !== expectedArchiveSha) fail("archive verification archive hash mismatch");
if (Number(verification.archiveBytes) !== archiveBytesExpected) {
  fail("archive verification archive bytes mismatch");
}
if (verification.applicationOrigin && !/^https:\/\/[^/]+$/.test(verification.applicationOrigin)) {
  fail(`archive verification origin is not an exact HTTPS origin: ${verification.applicationOrigin}`);
}

const identity = parseIdentity(identityPath);
if (identity.sha256 !== expectedArchiveSha) fail("original identity archive hash mismatch");
if (Number(identity.bytes) !== archiveBytesExpected) fail("original identity archive bytes mismatch");

const qualificationPath = values["qualification-receipt"];
let qualification = null;
let qualificationStatus = "incomplete";
let qualificationReason = "missing-qualification-receipt";
if (qualificationPath) {
  if (!existsSync(qualificationPath)) {
    qualificationReason = "qualification-receipt-not-present";
  } else {
    qualification = readJson(qualificationPath, "qualification custody receipt");
    if (qualification.status !== "complete") {
      qualificationReason = `qualification-receipt-status-${qualification.status ?? "missing"}`;
    } else {
      if (qualification.imageId !== expectedImage) fail("qualification image ID mismatch");
      if (qualification.producerApplicationSourceSha !== expectedSource) {
        fail("qualification producer application source mismatch");
      }
      if (qualification.producerHarnessSha !== expectedProducer) {
        fail("qualification producer harness mismatch");
      }
      if (qualification.consumerHarnessSha !== expectedConsumer) {
        fail("qualification consumer harness mismatch");
      }
      if (qualification.archiveSha256 !== expectedArchiveSha) fail("qualification archive hash mismatch");
      if (Number(qualification.archiveBytes) !== archiveBytesExpected) {
        fail("qualification archive bytes mismatch");
      }
      if (qualification.qualificationPath !== "https-edge") {
        fail("qualification path is not https-edge");
      }
      if (qualification.sameImageIdForEveryPhase !== true) {
        fail("qualification phases did not use one image ID");
      }
      if (qualification.buildInvoked !== false) fail("qualification invoked a build");
      if (!["sandbox", "no-sandbox"].includes(qualification.browserMode)) {
        fail(`qualification browser mode is invalid: ${qualification.browserMode}`);
      }
      if (typeof qualification.daemonId !== "string" || !qualification.daemonId) {
        fail("qualification daemon ID is missing");
      }
      qualificationStatus = "complete";
      qualificationReason = null;
    }
  }
}

const overallComplete = qualificationStatus === "complete";
const receipt = {
  schemaVersion: 1,
  status: overallComplete ? "complete" : "archive-verified-qualification-incomplete",
  retrievalStatus: "complete",
  archiveVerification: "complete",
  archiveIndependentHandoff: true,
  qualificationStatus,
  qualificationReason,
  producerApplicationSourceSha: expectedSource,
  producerHarnessSha: expectedProducer,
  consumerHarnessSha: expectedConsumer,
  workflowSha: workflow,
  imageId: expectedImage,
  archiveSha256: expectedArchiveSha,
  archiveBytes: archiveBytesExpected,
  applicationOrigin: verification.applicationOrigin ?? null,
  browserMode: qualification?.browserMode ?? null,
  freshDaemonId: retrievalDaemon,
  qualificationDaemonId: qualification?.daemonId ?? null,
  qualificationWorkflowSha: qualification?.workflowSha ?? null,
  customerAdmission: "closed",
};

const body = `${JSON.stringify(receipt, null, 2)}\n`;
const parent = path.dirname(path.resolve(output));
let parentStat;
try {
  parentStat = statSync(parent);
} catch {
  fail(`receipt parent directory is missing: ${parent}`);
}
if (!parentStat.isDirectory()) fail(`receipt parent is not a directory: ${parent}`);

const temporary = path.join(parent, `.${path.basename(output)}.${process.pid}.tmp`);
let descriptor;
try {
  descriptor = openSync(temporary, "wx", 0o640);
  let offset = 0;
  while (offset < body.length) offset += writeSync(descriptor, body, offset);
  fsyncSync(descriptor);
  closeSync(descriptor);
  descriptor = undefined;
  renameSync(temporary, output);
} catch (error) {
  if (descriptor !== undefined) {
    try {
      closeSync(descriptor);
    } catch {}
  }
  try {
    unlinkSync(temporary);
  } catch {}
  throw error;
}

const parsed = JSON.parse(readFileSync(output, "utf8"));
for (const key of ["status", "imageId", "archiveSha256", "producerHarnessSha", "consumerHarnessSha"]) {
  if (parsed[key] !== receipt[key]) fail(`read-back ${key} mismatch`);
}
console.log(JSON.stringify(receipt, null, 2));
