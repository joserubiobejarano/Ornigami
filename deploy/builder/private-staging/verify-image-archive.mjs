#!/usr/bin/env node
/**
 * Verify an archive handoff on a fresh/isolated daemon.
 *
 * The archive receipt is the custody record. This script checks the archive
 * SHA-256 against the receipt, requires the image to be absent on the target
 * daemon, loads the archive, re-inspects the exact immutable image ID and
 * verifies the application source SHA, origin, platform and user.
 *
 * A missing archive, missing receipt, hash mismatch, pre-existing image or
 * identity mismatch exits non-zero and never writes `complete: true`.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { IMMUTABLE_IMAGE_ID, SOURCE_SHA, verifyImageIdentity } from "./image-identity.mjs";

export function verifyArchiveReceipt(
  receipt,
  {
    archiveSha256,
    archiveBytes,
    expectedSourceSha,
    expectedHarnessSha,
    expectedImageId,
    expectedOrigin,
    expectedPlatform,
    expectedUser,
  } = {},
) {
  const errors = [];
  if (!receipt || typeof receipt !== "object") {
    return { ok: false, errors: ["archive receipt is missing or invalid"] };
  }
  const sourceSha = receipt.applicationSourceSha ?? receipt.sourceSha;
  const imageId = receipt.imageId ?? receipt.localImageId;
  const harnessSha = receipt.harnessSha ?? null;
  const origin = receipt.origin;
  const platform = receipt.platform ?? "linux/amd64";
  const user = receipt.user ?? "1000:1000";
  if (!SOURCE_SHA.test(sourceSha ?? "")) errors.push(`receipt source SHA is invalid: ${sourceSha}`);
  if (!IMMUTABLE_IMAGE_ID.test(imageId ?? "")) errors.push(`receipt image ID is not immutable: ${imageId}`);
  if (!origin) errors.push("receipt origin is missing");
  if (!platform) errors.push("receipt platform is missing");
  if (!user) errors.push("receipt user is missing");
  if (receipt.archiveSha256 && archiveSha256 && receipt.archiveSha256 !== archiveSha256) {
    errors.push(`archive hash mismatch: receipt ${receipt.archiveSha256}, actual ${archiveSha256}`);
  }
  if (!receipt.archiveSha256) errors.push("receipt archive SHA-256 is missing");
  if (typeof receipt.archiveBytes === "number" && archiveBytes !== receipt.archiveBytes) {
    errors.push(`archive size mismatch: receipt ${receipt.archiveBytes}, actual ${archiveBytes}`);
  }
  for (const [name, actual, expected] of [
    ["source SHA", sourceSha, expectedSourceSha],
    ["harness SHA", harnessSha, expectedHarnessSha],
    ["image ID", imageId, expectedImageId],
    ["origin", origin, expectedOrigin],
    ["platform", platform, expectedPlatform],
    ["user", user, expectedUser],
  ]) {
    if (expected && actual !== expected) {
      errors.push(`${name} mismatch: expected ${expected}, receipt ${actual}`);
    }
  }
  return {
    ok: errors.length === 0,
    errors,
    sourceSha,
    harnessSha,
    imageId,
    origin,
    platform,
    user,
    archiveSha256,
    archiveBytes,
  };
}

function sha256File(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function run(engine, args) {
  return spawnSync(engine, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

const evidenceDir = process.env.EVIDENCE_DIR ?? null;
function incomplete(reason, details = {}) {
  const result = { ok: false, complete: false, reason, ...details, completedAt: new Date().toISOString() };
  if (evidenceDir && !existsSync(evidenceDir)) {
    mkdirSync(evidenceDir, { recursive: true });
    writeFileSync(path.join(evidenceDir, "archive-verification.json"), `${JSON.stringify(result, null, 2)}\n`);
    writeFileSync(path.join(evidenceDir, "INCOMPLETE.txt"), `${reason}\n`);
  }
  console.error(JSON.stringify(result, null, 2));
  process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const archivePath = process.env.ARCHIVE_PATH;
  const receiptPath = process.env.RECEIPT_PATH;
  const engine = process.env.ENGINE ?? "docker";
  const requireFresh = process.env.REQUIRE_FRESH_DAEMON ?? "1";
  if (!archivePath) incomplete("ARCHIVE_PATH is required");
  if (!receiptPath) incomplete("RECEIPT_PATH is required");
  if (!existsSync(archivePath)) incomplete(`archive is missing: ${archivePath}`);
  if (!existsSync(receiptPath)) incomplete(`archive receipt is missing: ${receiptPath}`);
  if (!evidenceDir) incomplete("EVIDENCE_DIR is required for a verifiable handoff");
  if (existsSync(evidenceDir)) incomplete(`EVIDENCE_DIR already exists and will not be reused: ${evidenceDir}`);

  let receipt;
  try {
    receipt = JSON.parse(readFileSync(receiptPath, "utf8"));
  } catch (error) {
    incomplete(`archive receipt is unreadable: ${error.message}`);
  }
  const archiveSha256 = sha256File(archivePath);
  const archiveBytes = statSync(archivePath).size;
  const receiptCheck = verifyArchiveReceipt(receipt, {
    archiveSha256,
    archiveBytes,
    expectedSourceSha: process.env.EXPECTED_SOURCE_SHA,
    expectedHarnessSha: process.env.HARNESS_SHA,
    expectedImageId: process.env.EXPECTED_IMAGE_ID,
    expectedOrigin: process.env.EXPECTED_ORIGIN,
    expectedPlatform: process.env.EXPECTED_PLATFORM,
    expectedUser: process.env.EXPECTED_USER,
  });
  if (!receiptCheck.ok) incomplete(receiptCheck.errors.join("; "), { receiptCheck });

  const before = run(engine, ["image", "inspect", "--format", "{{.Id}}", receiptCheck.imageId]);
  if (requireFresh === "1" && before.status === 0) {
    incomplete(`target daemon already has ${receiptCheck.imageId}; a fresh daemon is required to prove archive loading`, {
      existingImageId: before.stdout.trim(),
    });
  }
  const load = run(engine, ["load", "-i", archivePath]);
  if (load.status !== 0) {
    incomplete(`engine load failed: ${load.stderr || load.stdout}`, { receiptCheck });
  }
  const inspect = run(engine, ["image", "inspect", receiptCheck.imageId]);
  if (inspect.status !== 0) {
    incomplete(`loaded image ID is absent after load: ${receiptCheck.imageId}`, {
      receiptCheck,
      load: `${load.stdout}${load.stderr}`.trim(),
    });
  }
  let inspectJson;
  try {
    inspectJson = JSON.parse(inspect.stdout);
  } catch (error) {
    incomplete(`loaded image inspect is not JSON: ${error.message}`, { receiptCheck });
  }
  const identity = verifyImageIdentity(inspectJson, {
    expectedImageId: receiptCheck.imageId,
    expectedSourceSha: receiptCheck.sourceSha,
    expectedOrigin: receiptCheck.origin,
    expectedPlatform: receiptCheck.platform,
    expectedUser: receiptCheck.user,
  });
  if (!identity.ok) incomplete(identity.errors.join("; "), { receiptCheck, identity });

  mkdirSync(evidenceDir, { recursive: true });
  const result = {
    ok: true,
    complete: true,
    applicationSourceSha: receiptCheck.sourceSha,
    harnessSha: receiptCheck.harnessSha ?? process.env.HARNESS_SHA ?? null,
    imageId: receiptCheck.imageId,
    archiveSha256,
    archiveBytes,
    archivePath,
    receiptPath,
    loadedImageId: identity.observed.imageId,
    identity,
    completedAt: new Date().toISOString(),
  };
  writeFileSync(path.join(evidenceDir, "archive-verification.json"), `${JSON.stringify(result, null, 2)}\n`);
  writeFileSync(path.join(evidenceDir, "ACCEPTED.txt"), "archive_handoff=verified\ncomplete=true\n");
  console.log(JSON.stringify(result, null, 2));
}
