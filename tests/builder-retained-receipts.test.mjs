import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const custodyHelper = path.resolve("deploy/builder/private-staging/write-retained-custody-receipt.mjs");
const retrievalHelper = path.resolve("deploy/builder/private-staging/write-retrieval-receipt.mjs");

const source = "156259d0c4330b185a0844711b7004b0b4467887";
const producer = "156259d0c4330b185a0844711b7004b0b4467887";
const consumer = "b1c6cce04f1fd5ad6ffdbdc3834bf28e8c1a2144";
const workflow = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const image = "sha256:d50ef3d2c02cf002433dfc48e03efdcae895f9ae3d1f6042b17bc9cfe8836b57";
const archiveSha = "a44a81f843033f50479dad8d5dd196acc8587b9e5c31090b7794df51a680d7df";
const archiveBytes = 1000632832;
const origin = "https://builder-rehearsal.invalid";

function fixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), "ornigami-receipts-"));
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

function verification(overrides = {}) {
  return {
    ok: true,
    complete: true,
    independentHandoff: true,
    applicationSourceSha: source,
    harnessSha: producer,
    imageId: image,
    applicationOrigin: origin,
    archiveSha256: archiveSha,
    archiveBytes,
    loadedImageId: image,
    checks: {
      archivePresent: true,
      receiptPresent: true,
      archiveHashPerformed: true,
      archiveHashMatched: true,
      receiptIdentityValid: true,
      freshDaemonRequired: true,
      freshDaemonVerified: true,
      imageAbsentBeforeLoad: true,
      loadPerformed: true,
      loadSucceeded: true,
      loadedImageInspected: true,
      identityVerified: true,
    },
    ...overrides,
  };
}

function qualification(overrides = {}) {
  return {
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
    qualificationPath: "https-edge",
    sameImageIdForEveryPhase: true,
    buildInvoked: false,
    edgeAppContainer: "app",
    edgeProxyContainer: "proxy",
    storeVolume: "store",
    daemonId: "qual-daemon-1",
    browserMode: "no-sandbox",
    customerAdmission: "closed",
    ...overrides,
  };
}

function writeJson(file, value) {
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function writeIdentity(file) {
  writeFileSync(
    file,
    [
      "archive=synthetic.tar",
      "receipt=archive-receipt.json",
      `sha256=${archiveSha}`,
      `bytes=${archiveBytes}`,
      "",
    ].join("\n"),
  );
}

function retrievalArgs(root, overrides = {}) {
  return [
    retrievalHelper,
    "--archive-verification",
    path.join(root, "archive-verification.json"),
    "--identity",
    path.join(root, "identity.txt"),
    "--output",
    path.join(root, "retrieval-receipt.json"),
    "--workflow-sha",
    workflow,
    "--retrieval-daemon-id",
    "retrieval-daemon-1",
    "--expected-source-sha",
    source,
    "--expected-image-id",
    image,
    "--expected-archive-sha256",
    archiveSha,
    "--expected-archive-bytes",
    String(archiveBytes),
    "--expected-producer-harness-sha",
    producer,
    "--expected-consumer-harness-sha",
    consumer,
    "--require-distinct-harness",
    ...overrides,
  ];
}

function runRetrieval(root, overrides = []) {
  return spawnSync(process.execPath, retrievalArgs(root, overrides), { encoding: "utf8" });
}

function seedRetrieval(root, overrides = {}) {
  writeJson(path.join(root, "archive-verification.json"), verification(overrides.verification));
  writeIdentity(path.join(root, "identity.txt"));
  if (overrides.qualification !== undefined) {
    writeJson(path.join(root, "qualification.json"), overrides.qualification);
  }
}

test("archive verified with no qualification receipt stays qualification-incomplete", () => {
  const { root, cleanup } = fixture();
  try {
    seedRetrieval(root);
    const result = runRetrieval(root);
    assert.equal(result.status, 0, result.stderr);
    const receipt = JSON.parse(readFileSync(path.join(root, "retrieval-receipt.json"), "utf8"));
    assert.equal(receipt.status, "archive-verified-qualification-incomplete");
    assert.equal(receipt.retrievalStatus, "complete");
    assert.equal(receipt.archiveVerification, "complete");
    assert.equal(receipt.archiveIndependentHandoff, true);
    assert.equal(receipt.qualificationStatus, "incomplete");
    assert.equal(receipt.qualificationReason, "missing-qualification-receipt");
    assert.equal(receipt.freshDaemonId, "retrieval-daemon-1");
    assert.equal(receipt.qualificationDaemonId, null);
    assert.equal(receipt.producerHarnessSha, producer);
    assert.equal(receipt.consumerHarnessSha, consumer);
    assert.notEqual(receipt.producerHarnessSha, receipt.consumerHarnessSha);
  } finally {
    cleanup();
  }
});

test("archive verified with a valid qualification receipt can be complete", () => {
  const { root, cleanup } = fixture();
  try {
    seedRetrieval(root, { qualification: qualification() });
    const result = runRetrieval(root, [
      "--qualification-receipt",
      path.join(root, "qualification.json"),
    ]);
    assert.equal(result.status, 0, result.stderr);
    const receipt = JSON.parse(readFileSync(path.join(root, "retrieval-receipt.json"), "utf8"));
    assert.equal(receipt.status, "complete");
    assert.equal(receipt.qualificationStatus, "complete");
    assert.equal(receipt.qualificationDaemonId, "qual-daemon-1");
    assert.equal(receipt.browserMode, "no-sandbox");
    assert.equal(receipt.producerHarnessSha, producer);
    assert.equal(receipt.consumerHarnessSha, consumer);
    assert.notEqual(receipt.producerHarnessSha, receipt.consumerHarnessSha);
  } finally {
    cleanup();
  }
});

test("a missing qualification receipt file is incomplete, not complete and not a crash", () => {
  const { root, cleanup } = fixture();
  try {
    seedRetrieval(root);
    const result = runRetrieval(root, [
      "--qualification-receipt",
      path.join(root, "not-present.json"),
    ]);
    assert.equal(result.status, 0, result.stderr);
    const receipt = JSON.parse(readFileSync(path.join(root, "retrieval-receipt.json"), "utf8"));
    assert.equal(receipt.status, "archive-verified-qualification-incomplete");
    assert.equal(receipt.qualificationStatus, "incomplete");
    assert.equal(receipt.qualificationReason, "qualification-receipt-not-present");
  } finally {
    cleanup();
  }
});

test("a non-complete qualification receipt is not promoted to complete", () => {
  const { root, cleanup } = fixture();
  try {
    seedRetrieval(root, { qualification: qualification({ status: "failed" }) });
    const result = runRetrieval(root, [
      "--qualification-receipt",
      path.join(root, "qualification.json"),
    ]);
    assert.equal(result.status, 0, result.stderr);
    const receipt = JSON.parse(readFileSync(path.join(root, "retrieval-receipt.json"), "utf8"));
    assert.equal(receipt.status, "archive-verified-qualification-incomplete");
    assert.equal(receipt.qualificationStatus, "incomplete");
    assert.equal(receipt.qualificationReason, "qualification-receipt-status-failed");
  } finally {
    cleanup();
  }
});

test("bad archive identity or hash fails instead of writing a receipt", () => {
  for (const [label, overrides] of [
    ["image", { imageId: "sha256:" + "0".repeat(64) }],
    ["source", { applicationSourceSha: "0".repeat(40) }],
    ["archive", { archiveSha256: "0".repeat(64) }],
    ["bytes", { archiveBytes: archiveBytes + 1 }],
    ["completeness", { complete: false }],
    ["fresh daemon", { checks: { ...verification().checks, freshDaemonVerified: false } }],
  ]) {
    const { root, cleanup } = fixture();
    try {
      seedRetrieval(root, { verification: overrides });
      const result = runRetrieval(root);
      assert.notEqual(result.status, 0, label);
      assert.equal(existsSync(path.join(root, "retrieval-receipt.json")), false, label);
    } finally {
      cleanup();
    }
  }
});

test("a bad original identity hash fails", () => {
  const { root, cleanup } = fixture();
  try {
    seedRetrieval(root);
    writeFileSync(path.join(root, "identity.txt"), `sha256=${"0".repeat(64)}\nbytes=${archiveBytes}\n`);
    const result = runRetrieval(root);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /identity archive hash mismatch/);
    assert.equal(existsSync(path.join(root, "retrieval-receipt.json")), false);
  } finally {
    cleanup();
  }
});

test("missing archive verification fails", () => {
  const { root, cleanup } = fixture();
  try {
    writeIdentity(path.join(root, "identity.txt"));
    const result = runRetrieval(root);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /archive verification is missing/);
  } finally {
    cleanup();
  }
});

test("same producer and consumer harness is rejected when distinctness is required", () => {
  const { root, cleanup } = fixture();
  try {
    seedRetrieval(root, { qualification: qualification({ consumerHarnessSha: producer }) });
    const args = retrievalArgs(root, [
      "--qualification-receipt",
      path.join(root, "qualification.json"),
    ]);
    const consumerIndex = args.indexOf("--expected-consumer-harness-sha");
    args[consumerIndex + 1] = producer;
    const result = spawnSync(process.execPath, args, { encoding: "utf8" });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /must remain distinct/);
  } finally {
    cleanup();
  }
});

test("retrieval receipt is readable by a separate process and has upload mode", () => {
  const { root, cleanup } = fixture();
  try {
    seedRetrieval(root, { qualification: qualification() });
    const result = runRetrieval(root, [
      "--qualification-receipt",
      path.join(root, "qualification.json"),
    ]);
    assert.equal(result.status, 0, result.stderr);
    const receipt = path.join(root, "retrieval-receipt.json");
    const reader = spawnSync(
      process.execPath,
      ["-e", "const fs=require('node:fs');const r=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));process.stdout.write(r.status)", receipt],
      { encoding: "utf8" },
    );
    assert.equal(reader.status, 0, reader.stderr);
    assert.equal(reader.stdout, "complete");
    if (process.platform !== "win32") {
      assert.equal(statSync(receipt).mode & 0o777, 0o640);
    }
  } finally {
    cleanup();
  }
});

function custodyArgs(root, overrides = {}) {
  const values = {
    source,
    producer,
    consumer,
    workflow,
    image,
    archiveSha,
    archiveBytes,
    origin,
    browserMode: "no-sandbox",
    ...overrides,
  };
  return [
    custodyHelper,
    "--output",
    path.join(root, "custody", "retained-image-custody-receipt.json"),
    "--source-sha",
    values.source,
    "--producer-harness-sha",
    values.producer,
    "--consumer-harness-sha",
    values.consumer,
    "--workflow-sha",
    values.workflow,
    "--image-id",
    values.image,
    "--archive-sha256",
    values.archiveSha,
    "--archive-bytes",
    String(values.archiveBytes),
    "--origin",
    values.origin,
    "--app-container",
    "app",
    "--proxy-container",
    "proxy",
    "--store-volume",
    "store",
    "--daemon-id",
    "qual-daemon-1",
    "--browser-mode",
    values.browserMode,
    "--require-distinct-harness",
  ];
}

function runCustody(root, overrides = {}) {
  mkdirSync(path.join(root, "custody"), { recursive: true });
  return spawnSync(process.execPath, custodyArgs(root, overrides), { encoding: "utf8" });
}

test("custody receipt records both harness identities and the real daemon ID", () => {
  const { root, cleanup } = fixture();
  try {
    const result = runCustody(root);
    assert.equal(result.status, 0, result.stderr);
    const receipt = JSON.parse(
      readFileSync(path.join(root, "custody", "retained-image-custody-receipt.json"), "utf8"),
    );
    assert.equal(receipt.status, "complete");
    assert.equal(receipt.producerHarnessSha, producer);
    assert.equal(receipt.consumerHarnessSha, consumer);
    assert.notEqual(receipt.producerHarnessSha, receipt.consumerHarnessSha);
    assert.equal(receipt.daemonId, "qual-daemon-1");
    assert.equal(receipt.browserMode, "no-sandbox");
    assert.equal(receipt.customerAdmission, "closed");
  } finally {
    cleanup();
  }
});

test("custody receipt refuses a missing parent and bad identity values", () => {
  const bad = [
    ["image", { image: "not-an-image-id" }],
    ["archive", { archiveSha: "not-an-archive-hash" }],
    ["browser mode", { browserMode: "true" }],
    ["same harness", { consumer: producer }],
  ];
  for (const [label, overrides] of bad) {
    const { root, cleanup } = fixture();
    try {
      const result = runCustody(root, overrides);
      assert.notEqual(result.status, 0, label);
      assert.equal(
        existsSync(path.join(root, "custody", "retained-image-custody-receipt.json")),
        false,
        label,
      );
    } finally {
      cleanup();
    }
  }

  const { root, cleanup } = fixture();
  try {
    const result = spawnSync(process.execPath, custodyArgs(root), { encoding: "utf8" });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /parent directory is missing/);
  } finally {
    cleanup();
  }
});
