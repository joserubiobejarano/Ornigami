#!/usr/bin/env node
/**
 * Write the retained-image custody receipt atomically.
 *
 * The caller must already have created the custody directory. This helper
 * refuses to invent missing directories, verifies the identity values, and
 * writes the receipt with an upload-readable mode before renaming it into place.
 */
import {
  closeSync,
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

function required(options, name) {
  const value = options[name];
  if (typeof value !== "string" || value.length === 0) fail(`--${name} is required`);
  return value;
}

function check(pattern, value, label) {
  if (!pattern.test(value)) fail(`${label} is invalid: ${value}`);
}

const { values } = parseArgs({
  options: {
    output: { type: "string" },
    "source-sha": { type: "string" },
    "producer-harness-sha": { type: "string" },
    "consumer-harness-sha": { type: "string" },
    "workflow-sha": { type: "string" },
    "image-id": { type: "string" },
    "archive-sha256": { type: "string" },
    "archive-bytes": { type: "string" },
    origin: { type: "string" },
    "qualification-path": { type: "string", default: "https-edge" },
    "app-container": { type: "string" },
    "proxy-container": { type: "string" },
    "store-volume": { type: "string" },
    "daemon-id": { type: "string" },
    "browser-mode": { type: "string" },
    "require-distinct-harness": { type: "boolean", default: false },
  },
  strict: true,
});

const output = required(values, "output");
const source = required(values, "source-sha");
const producer = required(values, "producer-harness-sha");
const consumer = required(values, "consumer-harness-sha");
const workflow = required(values, "workflow-sha");
const image = required(values, "image-id");
const archiveSha = required(values, "archive-sha256");
const archiveBytesRaw = required(values, "archive-bytes");
const origin = required(values, "origin");
const qualificationPath = required(values, "qualification-path");
const appContainer = required(values, "app-container");
const proxyContainer = required(values, "proxy-container");
const storeVolume = required(values, "store-volume");
const daemonId = required(values, "daemon-id");
const browserMode = required(values, "browser-mode");

check(/^[0-9a-f]{40}$/, source, "source SHA");
check(/^[0-9a-f]{40}$/, producer, "producer harness SHA");
check(/^[0-9a-f]{40}$/, consumer, "consumer harness SHA");
check(/^[0-9a-f]{40}$/, workflow, "workflow SHA");
check(/^sha256:[0-9a-f]{64}$/, image, "image ID");
check(/^[0-9a-f]{64}$/, archiveSha, "archive SHA-256");
if (!/^[0-9]+$/.test(archiveBytesRaw)) fail("archive bytes must be an integer");
const archiveBytes = Number(archiveBytesRaw);
if (!Number.isSafeInteger(archiveBytes) || archiveBytes <= 0) fail("archive bytes are out of range");
if (!/^https:\/\/[^/]+$/.test(origin)) fail(`origin is not an exact HTTPS origin: ${origin}`);
if (qualificationPath !== "https-edge") fail(`unsupported qualification path: ${qualificationPath}`);
if (!["sandbox", "no-sandbox"].includes(browserMode)) fail(`unsupported browser mode: ${browserMode}`);
if (values["require-distinct-harness"] && producer === consumer) {
  fail("producer and consumer harness SHAs must remain distinct");
}

const parent = path.dirname(path.resolve(output));
let parentStat;
try {
  parentStat = statSync(parent);
} catch {
  fail(`receipt parent directory is missing: ${parent}`);
}
if (!parentStat.isDirectory()) fail(`receipt parent is not a directory: ${parent}`);

const receipt = {
  schemaVersion: 1,
  status: "complete",
  producerApplicationSourceSha: source,
  producerHarnessSha: producer,
  consumerHarnessSha: consumer,
  workflowSha: workflow,
  imageId: image,
  archiveSha256: archiveSha,
  archiveBytes,
  applicationOrigin: origin,
  effectiveRuntimeOrigin: origin,
  qualificationPath,
  sameImageIdForEveryPhase: true,
  buildInvoked: false,
  edgeAppContainer: appContainer,
  edgeProxyContainer: proxyContainer,
  storeVolume,
  daemonId,
  browserMode,
  customerAdmission: "closed",
};

const body = `${JSON.stringify(receipt, null, 2)}\n`;
const temporary = path.join(parent, `.${path.basename(output)}.${process.pid}.tmp`);
let descriptor;
try {
  descriptor = openSync(temporary, "wx", 0o640);
  let offset = 0;
  while (offset < body.length) {
    offset += writeSync(descriptor, body, offset);
  }
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

const written = readFileSync(output, "utf8");
const parsed = JSON.parse(written);
for (const key of [
  "imageId",
  "archiveSha256",
  "producerHarnessSha",
  "consumerHarnessSha",
  "workflowSha",
]) {
  if (parsed[key] !== receipt[key]) fail(`read-back ${key} mismatch`);
}
console.log(JSON.stringify(receipt, null, 2));
