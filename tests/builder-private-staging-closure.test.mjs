import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import {
  IMMUTABLE_IMAGE_ID,
  parseImmutableReference,
  verifyImageIdentity,
} from "../deploy/builder/private-staging/image-identity.mjs";
import { validateProxyBindings } from "../deploy/builder/private-staging/proxy-bindings.mjs";
import {
  diffScriptAudits,
  updateScriptRegistry,
} from "../deploy/builder/private-staging/sri-script-audit.mjs";
import { evaluateArchiveHandoff, verifyArchiveReceipt } from "../deploy/builder/private-staging/verify-image-archive.mjs";

const root = process.cwd();
const imageId = `sha256:${"a".repeat(64)}`;
const otherImageId = `sha256:${"b".repeat(64)}`;
const sourceSha = "4e3e00af212a3d97de582ab6fca6ecca8d0665dd";
const harnessSha = "f".repeat(40);

function inspect(overrides = {}) {
  return [
    {
      Id: overrides.Id ?? imageId,
      Os: overrides.Os ?? "linux",
      Architecture: overrides.Architecture ?? "amd64",
      Config: {
        User: overrides.User ?? "1000:1000",
        Labels: {
          "org.opencontainers.image.revision": overrides.sourceSha ?? sourceSha,
          "org.ornigami.public-origin": overrides.origin ?? "https://builder-staging.ornigami.test",
          "org.ornigami.single-replica": "true",
          "org.ornigami.operator-cli": "/app/scripts/builder-invite-operator.mjs",
          "org.ornigami.qualify.run": "stub-build",
        },
      },
    },
  ];
}

test("existing-image references must be immutable", () => {
  assert.equal(parseImmutableReference(imageId).kind, "image-id");
  assert.equal(parseImmutableReference(`registry.example/team/builder@${imageId}`).kind, "repository-digest");
  for (const invalid of [
    "ornigami-builder:latest",
    "ornigami-builder:staging-44845147243-1",
    "registry.example/team/builder:tag",
    imageId.replace("a", "A"),
    "",
  ]) {
    assert.throws(() => parseImmutableReference(invalid), /immutable|unsupported/, invalid);
  }
});

test("image identity rejects source, origin, platform, user and image ID mismatches", () => {
  const expected = {
    expectedImageId: imageId,
    expectedSourceSha: sourceSha,
    expectedOrigin: "https://builder-staging.ornigami.test",
    expectedPlatform: "linux/amd64",
    expectedUser: "1000:1000",
  };
  assert.equal(verifyImageIdentity(inspect(), expected).ok, true);
  for (const [name, value] of [
    ["sourceSha", "e".repeat(40)],
    ["origin", "https://unexpected.example"],
    ["Os", "windows"],
    ["User", "0:0"],
    ["Id", otherImageId],
  ]) {
    const result = verifyImageIdentity(inspect({ [name]: value }), expected);
    assert.equal(result.ok, false, name);
    assert.ok(result.errors.length > 0, name);
  }
  assert.match(IMMUTABLE_IMAGE_ID.source, /sha256/);
});

test("proxy port bindings require the exact approved structure", () => {
  const approved = {
    "80/tcp": [{ HostIp: "", HostPort: "80" }],
    "443/tcp": [
      { HostIp: "0.0.0.0", HostPort: "443" },
      { HostIp: "::", HostPort: "443" },
    ],
    "443/udp": [{ HostIp: "0.0.0.0", HostPort: "443" }],
  };
  assert.equal(validateProxyBindings(approved).ok, true);

  const negative = [
    ["additional 8080 container binding", { ...approved, "8080/tcp": [{ HostIp: "", HostPort: "8080" }] }],
    ["altered host port", { ...approved, "443/tcp": [{ HostIp: "0.0.0.0", HostPort: "8443" }] }],
    ["unexpected bind address", { ...approved, "443/tcp": [{ HostIp: "127.0.0.1", HostPort: "443" }] }],
    ["unexpected protocol", { ...approved, "80/udp": [{ HostIp: "", HostPort: "80" }] }],
    ["missing protocol", { ...approved, "443/udp": [] }],
    ["additional binding on same port", {
      ...approved,
      "443/tcp": [
        { HostIp: "0.0.0.0", HostPort: "443" },
        { HostIp: "10.0.0.5", HostPort: "443" },
      ],
    }],
  ];
  for (const [name, value] of negative) {
    const result = validateProxyBindings(value);
    assert.equal(result.ok, false, name);
    assert.ok(result.errors.length > 0, name);
  }

  const loopback = {
    "80/tcp": [{ HostIp: "127.0.0.1", HostPort: "80" }],
    "443/tcp": [{ HostIp: "127.0.0.1", HostPort: "443" }],
    "443/udp": [{ HostIp: "127.0.0.1", HostPort: "443" }],
  };
  const loopbackResult = validateProxyBindings(loopback, "loopback");
  assert.equal(loopbackResult.ok, true, JSON.stringify(loopbackResult.errors));
  assert.equal(loopbackResult.profile, "loopback");
  assert.equal(validateProxyBindings(loopback).ok, false, "wildcard profile must reject loopback addresses");
  assert.equal(validateProxyBindings(approved, "loopback").ok, false, "loopback profile must reject wildcard addresses");
  for (const [name, value] of [
    ["loopback extra port", { ...loopback, "8080/tcp": [{ HostIp: "127.0.0.1", HostPort: "8080" }] }],
    ["loopback changed host port", { ...loopback, "443/tcp": [{ HostIp: "127.0.0.1", HostPort: "8443" }] }],
    ["loopback wildcard mixed", { ...loopback, "443/tcp": [{ HostIp: "0.0.0.0", HostPort: "443" }] }],
    ["loopback non-loopback address", { ...loopback, "443/tcp": [{ HostIp: "10.0.0.5", HostPort: "443" }] }],
    ["loopback duplicate", { ...loopback, "443/tcp": [{ HostIp: "127.0.0.1", HostPort: "443" }, { HostIp: "127.0.0.1", HostPort: "443" }] }],
    ["loopback missing udp", { ...loopback, "443/udp": [] }],
  ]) {
    const result = validateProxyBindings(value, "loopback");
    assert.equal(result.ok, false, name);
    assert.ok(result.errors.length > 0, name);
  }
  assert.equal(validateProxyBindings(loopback, "unknown").ok, false);
});

test("SRI audit history records inserted and later removed script URLs and hashes", () => {
  const first = {
    label: "login-page",
    completedAt: "2026-11-21T00:00:00Z",
    scriptRecords: [
      { src: "https://staging.test/_next/a.js", path: "/_next/a.js", integrity: "sha256-a", sha256: "a".repeat(64), verified: true },
      { src: "https://staging.test/_next/b.js", path: "/_next/b.js", integrity: "sha256-b", sha256: "b".repeat(64), verified: true },
    ],
  };
  const second = {
    label: "initial",
    completedAt: "2026-11-21T00:00:01Z",
    scriptRecords: [
      { src: "https://staging.test/_next/b.js", path: "/_next/b.js", integrity: "sha256-b", sha256: "b".repeat(64), verified: true },
      { src: "https://staging.test/_next/c.js", path: "/_next/c.js", integrity: "sha256-c", sha256: "c".repeat(64), verified: true },
    ],
  };
  const delta = diffScriptAudits(first, second);
  assert.deepEqual(delta.inserted.map((entry) => entry.src), ["https://staging.test/_next/c.js"]);
  assert.deepEqual(delta.removed.map((entry) => entry.src), ["https://staging.test/_next/a.js"]);
  assert.equal(delta.unchanged.length, 1);

  let registry = updateScriptRegistry([], first);
  registry = updateScriptRegistry(registry, second);
  const removed = registry.find((entry) => entry.src.endsWith("/a.js"));
  assert.equal(removed.removedAt, "initial");
  assert.equal(removed.lastSha256, "a".repeat(64));
  assert.equal(removed.presentAtLastAudit, false);
  const inserted = registry.find((entry) => entry.src.endsWith("/c.js"));
  assert.equal(inserted.firstSeen, "initial");
  assert.equal(inserted.lastSha256, "c".repeat(64));
});

test("archive receipt verification rejects hash, source and image mismatches", () => {
  const receipt = {
    applicationSourceSha: sourceSha,
    imageId,
    origin: "https://builder-staging.ornigami.test",
    platform: "linux/amd64",
    user: "1000:1000",
    archiveSha256: "d".repeat(64),
    archiveBytes: 10,
  };
  assert.equal(
    verifyArchiveReceipt(receipt, { archiveSha256: "d".repeat(64), archiveBytes: 10 }).ok,
    true,
  );
  const cases = [
    { archiveSha256: "e".repeat(64), archiveBytes: 10 },
    { archiveSha256: "d".repeat(64), archiveBytes: 11 },
    { archiveSha256: "d".repeat(64), archiveBytes: 10, expectedImageId: otherImageId },
    { archiveSha256: "d".repeat(64), archiveBytes: 10, expectedSourceSha: "e".repeat(40) },
  ];
  for (const options of cases) {
    const result = verifyArchiveReceipt(receipt, options);
    assert.equal(result.ok, false, JSON.stringify(options));
    assert.ok(result.errors.length > 0);
  }
  assert.equal(verifyArchiveReceipt({ ...receipt, archiveSha256: "" }, { archiveSha256: "d".repeat(64) }).ok, false);
});

test("archive handoff cannot be complete when fresh-daemon requirements are bypassed or missing", () => {
  const completeChecks = {
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
  };
  assert.equal(evaluateArchiveHandoff(completeChecks).complete, true);
  for (const [name, value] of [
    ["freshDaemonRequired", false],
    ["freshDaemonVerified", false],
    ["imageAbsentBeforeLoad", false],
    ["loadPerformed", false],
    ["loadSucceeded", false],
    ["identityVerified", false],
  ]) {
    const result = evaluateArchiveHandoff({ ...completeChecks, [name]: value });
    assert.equal(result.complete, false, name);
    assert.equal(result.independentHandoff, false, name);
    assert.ok(result.missing.includes(name), name);
  }
});

function findBash() {
  if (process.env.BASH) return process.env.BASH;
  if (process.platform === "win32") {
    for (const candidate of [
      "C:\\Program Files\\Git\\bin\\bash.exe",
      "C:\\Program Files\\Git\\usr\\bin\\bash.exe",
      "C:\\Program Files (x86)\\Git\\bin\\bash.exe",
    ]) {
      if (existsSync(candidate)) return candidate;
    }
  }
  return "bash";
}
const bash = findBash();
const bashAvailable = spawnSync(bash, ["--version"], { encoding: "utf8" }).status === 0;

function relative(target) {
  return path.relative(root, target).split(path.sep).join("/");
}

function setupStub(tempDir) {
  const stubSource = path.join(root, "deploy", "builder", "tests", "stub-engine.sh");
  const binDir = path.join(tempDir, "bin");
  const stubPath = path.join(binDir, "docker");
  mkdirSync(binDir, { recursive: true });
  copyFileSync(stubSource, stubPath);
  chmodSync(stubPath, 0o755);
  return relative(stubPath);
}

test(
  "http-loopback qualification executes beyond validation and never invokes a build",
  { skip: !bashAvailable && "bash is required for the shell harness checks" },
  () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "ornigami-existing-image-"));
    try {
      const stubEngine = setupStub(tempDir);
      const state = relative(path.join(tempDir, "state"));
      const evidence = relative(path.join(tempDir, "evidence"));
      const env = {
        ...process.env,
        ENGINE: stubEngine,
        STUB_STATE: state,
        STUB_EXISTING_IMAGE_ID: imageId,
        STUB_EXISTING_SOURCE_SHA: sourceSha,
        STUB_EXISTING_ORIGIN: "http://127.0.0.1:3100",
        STUB_EXISTING_PLATFORM: "linux/amd64",
        STUB_EXISTING_USER: "1000:1000",
        HARNESS_SHA: harnessSha,
        IMAGE_REFERENCE: imageId,
        EXPECTED_SOURCE_SHA: sourceSha,
        EXPECTED_ORIGIN: "http://127.0.0.1:3100",
        EXPECTED_PLATFORM: "linux/amd64",
        EXPECTED_USER: "1000:1000",
        QUALIFICATION_PATH: "http-loopback",
        EVIDENCE_DIR: evidence,
        ALLOW_DIRTY: "1",
        ALLOW_NON_LINUX_ENGINE: "1",
        BROWSER_PHASE: "0",
        MOUNT_ONLY: "1",
        RUN_ID: "existing-image-loopback",
        TMPDIR: os.tmpdir().split(path.sep).join("/"),
      };
      const result = spawnSync(bash, ["deploy/builder/private-staging/qualify-existing-image.sh"], {
        cwd: root,
        encoding: "utf8",
        env,
      });
      assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
      const calls = readFileSync(path.join(tempDir, "state", "calls.log"), "utf8");
      assert.doesNotMatch(calls, /^build\b/m, "existing-image mode must not invoke a build");
      assert.match(calls, /^image inspect /m);
      assert.match(calls, /^network create /m, "mount-only path must create its run-scoped network");
      assert.match(calls, /^volume create /m, "mount-only path must create its run-scoped volume");
      const results = readFileSync(path.join(tempDir, "evidence", "runtime", "results.txt"), "utf8");
      assert.match(results, /^image_mode=existing$/m);
      assert.match(results, new RegExp(`^image_id=${imageId}$`, "m"));
      assert.match(results, new RegExp(`^application_source_sha=${sourceSha}$`, "m"));
      assert.match(results, new RegExp(`^harness_sha=${harnessSha}$`, "m"));
      assert.match(results, /^qualification_path=http-loopback$/m);
      assert.match(results, /^effective_runtime_origin=http:\/\/127\.0\.0\.1:3100$/m);
      assert.match(results, /^mount_only=true$/m);
      const summary = JSON.parse(readFileSync(path.join(tempDir, "evidence", "existing-image-qualification.json"), "utf8"));
      assert.equal(summary.buildInvoked, false);
      assert.equal(summary.imageId, imageId);
      assert.equal(summary.qualificationPath, "http-loopback");
      assert.equal(summary.httpsAcceptance, false);
      assert.equal(summary.fullHttpsAcceptance, false);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  },
);

test(
  "existing-image validation rejects an image identity mismatch before any build or resource creation",
  { skip: !bashAvailable && "bash is required for the shell harness checks" },
  () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "ornigami-existing-image-negative-"));
    try {
      const stubEngine = setupStub(tempDir);
      const state = relative(path.join(tempDir, "state"));
      const evidence = relative(path.join(tempDir, "evidence"));
      const result = spawnSync(bash, ["deploy/builder/qualify-linux.sh"], {
        cwd: root,
        encoding: "utf8",
        env: {
          ...process.env,
          ENGINE: stubEngine,
          STUB_STATE: state,
          STUB_EXISTING_IMAGE_ID: imageId,
          STUB_EXISTING_SOURCE_SHA: sourceSha,
          STUB_EXISTING_ORIGIN: "https://builder-staging.ornigami.test",
          STUB_EXISTING_PLATFORM: "linux/amd64",
          STUB_EXISTING_USER: "1000:1000",
          IMAGE_MODE: "existing",
          IMAGE: imageId,
          SOURCE_SHA: "e".repeat(40),
          APP_URL: "https://builder-staging.ornigami.test",
          QUALIFICATION_PATH: "https-edge",
          APPLICATION_ORIGIN: "https://builder-staging.ornigami.test",
          BROWSER_ORIGIN: "https://builder-staging.ornigami.test",
          EXPECTED_ORIGIN: "https://builder-staging.ornigami.test",
          EXPECTED_PLATFORM: "linux/amd64",
          EXPECTED_USER: "1000:1000",
          HARNESS_SHA: harnessSha,
          IMAGE_VALIDATE_ONLY: "1",
          EVIDENCE_DIR: evidence,
          ALLOW_DIRTY: "1",
          ALLOW_NON_LINUX_ENGINE: "1",
          BROWSER_PHASE: "0",
          RUN_ID: "existing-image-negative",
        },
      });
      assert.notEqual(result.status, 0, "mismatched source label must fail");
      assert.match(`${result.stdout}\n${result.stderr}`, /source label mismatch/);
      const calls = existsSync(path.join(tempDir, "state", "calls.log"))
        ? readFileSync(path.join(tempDir, "state", "calls.log"), "utf8")
        : "";
      assert.doesNotMatch(calls, /^build\b/m);
      assert.doesNotMatch(calls, /^network create/m);
      assert.doesNotMatch(calls, /^volume create/m);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  },
);

test(
  "existing-image validation exercises the image contract without a build",
  { skip: !bashAvailable && "bash is required for the shell harness checks" },
  () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "ornigami-existing-image-contract-"));
    try {
      const stubEngine = setupStub(tempDir);
      const state = relative(path.join(tempDir, "state"));
      const evidence = relative(path.join(tempDir, "evidence"));
      const result = spawnSync(bash, ["deploy/builder/qualify-linux.sh"], {
        cwd: root,
        encoding: "utf8",
        env: {
          ...process.env,
          ENGINE: stubEngine,
          STUB_STATE: state,
          STUB_EXISTING_IMAGE_ID: imageId,
          STUB_EXISTING_SOURCE_SHA: sourceSha,
          STUB_EXISTING_ORIGIN: "https://builder-staging.ornigami.test",
          STUB_EXISTING_PLATFORM: "linux/amd64",
          STUB_EXISTING_USER: "1000:1000",
          IMAGE_MODE: "existing",
          IMAGE: imageId,
          SOURCE_SHA: sourceSha,
          APP_URL: "https://builder-staging.ornigami.test",
          QUALIFICATION_PATH: "https-edge",
          APPLICATION_ORIGIN: "https://builder-staging.ornigami.test",
          BROWSER_ORIGIN: "https://builder-staging.ornigami.test",
          EXPECTED_ORIGIN: "https://builder-staging.ornigami.test",
          EXPECTED_PLATFORM: "linux/amd64",
          EXPECTED_USER: "1000:1000",
          HARNESS_SHA: harnessSha,
          IMAGE_VALIDATE_ONLY: "1",
          EVIDENCE_DIR: evidence,
          ALLOW_DIRTY: "1",
          ALLOW_NON_LINUX_ENGINE: "1",
          BROWSER_PHASE: "0",
          RUN_ID: "existing-image-contract",
        },
      });
      assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
      const calls = readFileSync(path.join(tempDir, "state", "calls.log"), "utf8");
      assert.doesNotMatch(calls, /^build\b/m, "existing-image mode must not invoke a build");
      assert.doesNotMatch(calls, /^network create/m);
      assert.doesNotMatch(calls, /^volume create/m);
      const results = readFileSync(path.join(tempDir, "evidence", "results.txt"), "utf8");
      assert.match(results, /^image_mode=existing$/m);
      assert.match(results, new RegExp(`^image_id=${imageId}$`, "m"));
      assert.match(results, /^ok=true$/m);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  },
);

test(
  "https-edge mount-only qualification keeps the HTTPS runtime origin and never builds",
  { skip: !bashAvailable && "bash is required for the shell harness checks" },
  () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "ornigami-existing-image-https-"));
    try {
      const stubEngine = setupStub(tempDir);
      const state = relative(path.join(tempDir, "state"));
      const evidence = relative(path.join(tempDir, "evidence"));
      const result = spawnSync(bash, ["deploy/builder/qualify-linux.sh"], {
        cwd: root,
        encoding: "utf8",
        env: {
          ...process.env,
          ENGINE: stubEngine,
          STUB_STATE: state,
          STUB_EXISTING_IMAGE_ID: imageId,
          STUB_EXISTING_SOURCE_SHA: sourceSha,
          STUB_EXISTING_ORIGIN: "https://builder-staging.ornigami.test",
          STUB_EXISTING_PLATFORM: "linux/amd64",
          STUB_EXISTING_USER: "1000:1000",
          IMAGE_MODE: "existing",
          IMAGE: imageId,
          SOURCE_SHA: sourceSha,
          APP_URL: "https://builder-staging.ornigami.test",
          QUALIFICATION_PATH: "https-edge",
          APPLICATION_ORIGIN: "https://builder-staging.ornigami.test",
          BROWSER_ORIGIN: "https://builder-staging.ornigami.test",
          EXPECTED_ORIGIN: "https://builder-staging.ornigami.test",
          EXPECTED_PLATFORM: "linux/amd64",
          EXPECTED_USER: "1000:1000",
          HARNESS_SHA: harnessSha,
          MOUNT_ONLY: "1",
          EVIDENCE_DIR: evidence,
          ALLOW_DIRTY: "1",
          ALLOW_NON_LINUX_ENGINE: "1",
          BROWSER_PHASE: "0",
          RUN_ID: "existing-image-https-mount",
        },
      });
      assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
      const calls = readFileSync(path.join(tempDir, "state", "calls.log"), "utf8");
      assert.doesNotMatch(calls, /^build\b/m, "existing-image mode must not invoke a build");
      assert.match(calls, /^network create /m);
      assert.match(calls, /^volume create /m);
      const results = readFileSync(path.join(tempDir, "evidence", "results.txt"), "utf8");
      assert.match(results, /^qualification_path=https-edge$/m);
      assert.match(results, /^application_origin=https:\/\/builder-staging\.ornigami\.test$/m);
      assert.match(results, /^browser_origin=https:\/\/builder-staging\.ornigami\.test$/m);
      assert.match(results, /^effective_runtime_origin=https:\/\/builder-staging\.ornigami\.test$/m);
      assert.match(results, /^diagnostic_transport_origin=$/m);
      assert.match(results, /^https_acceptance=false$/m);
      assert.doesNotMatch(results, /effective_runtime_origin=http:\/\/127\.0\.0\.1/m);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  },
);

test(
  "https-edge qualification rejects conflicting origin inputs before run resources",
  { skip: !bashAvailable && "bash is required for the shell harness checks" },
  () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "ornigami-existing-image-conflict-"));
    try {
      const stubEngine = setupStub(tempDir);
      const state = relative(path.join(tempDir, "state"));
      const evidence = relative(path.join(tempDir, "evidence"));
      const result = spawnSync(bash, ["deploy/builder/private-staging/qualify-existing-image.sh"], {
        cwd: root,
        encoding: "utf8",
        env: {
          ...process.env,
          ENGINE: stubEngine,
          STUB_STATE: state,
          STUB_EXISTING_IMAGE_ID: imageId,
          STUB_EXISTING_SOURCE_SHA: sourceSha,
          STUB_EXISTING_ORIGIN: "https://builder-staging.ornigami.test",
          HARNESS_SHA: harnessSha,
          IMAGE_REFERENCE: imageId,
          EXPECTED_SOURCE_SHA: sourceSha,
          EXPECTED_ORIGIN: "https://builder-staging.ornigami.test",
          QUALIFICATION_PATH: "https-edge",
          STAGING_ORIGIN: "https://builder-staging.ornigami.test",
          APP_URL: "http://127.0.0.1:3100",
          EVIDENCE_DIR: evidence,
          ALLOW_DIRTY: "1",
          ALLOW_NON_LINUX_ENGINE: "1",
        },
      });
      assert.notEqual(result.status, 0, "conflicting APP_URL must fail");
      assert.match(`${result.stdout}\n${result.stderr}`, /APP_URL .* conflicts with the image origin/);
      assert.equal(existsSync(path.join(tempDir, "evidence")), false, "evidence must not be created");
      const calls = existsSync(path.join(tempDir, "state", "calls.log"))
        ? readFileSync(path.join(tempDir, "state", "calls.log"), "utf8")
        : "";
      assert.doesNotMatch(calls, /^build\b/m);
      assert.doesNotMatch(calls, /^network create/m);
      assert.doesNotMatch(calls, /^volume create/m);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  },
);

test(
  "https-edge qualification rejects a conflicting staging origin before run resources",
  { skip: !bashAvailable && "bash is required for the shell harness checks" },
  () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "ornigami-existing-image-staging-conflict-"));
    try {
      const stubEngine = setupStub(tempDir);
      const state = relative(path.join(tempDir, "state"));
      const evidence = relative(path.join(tempDir, "evidence"));
      const result = spawnSync(bash, ["deploy/builder/private-staging/qualify-existing-image.sh"], {
        cwd: root,
        encoding: "utf8",
        env: {
          ...process.env,
          ENGINE: stubEngine,
          STUB_STATE: state,
          STUB_EXISTING_IMAGE_ID: imageId,
          STUB_EXISTING_SOURCE_SHA: sourceSha,
          STUB_EXISTING_ORIGIN: "https://builder-staging.ornigami.test",
          HARNESS_SHA: harnessSha,
          IMAGE_REFERENCE: imageId,
          EXPECTED_SOURCE_SHA: sourceSha,
          EXPECTED_ORIGIN: "https://builder-staging.ornigami.test",
          QUALIFICATION_PATH: "https-edge",
          STAGING_ORIGIN: "https://other-staging.ornigami.test",
          EVIDENCE_DIR: evidence,
        },
      });
      assert.notEqual(result.status, 0, "conflicting STAGING_ORIGIN must fail");
      assert.match(`${result.stdout}\n${result.stderr}`, /STAGING_ORIGIN .* conflicts with the image origin/);
      assert.equal(existsSync(path.join(tempDir, "evidence")), false, "evidence must not be created");
      const calls = existsSync(path.join(tempDir, "state", "calls.log"))
        ? readFileSync(path.join(tempDir, "state", "calls.log"), "utf8")
        : "";
      assert.doesNotMatch(calls, /^build\b/m);
      assert.doesNotMatch(calls, /^network create/m);
      assert.doesNotMatch(calls, /^volume create/m);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  },
);

test(
  "https-edge qualification rejects an edge container running a different image before run resources",
  { skip: !bashAvailable && "bash is required for the shell harness checks" },
  () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "ornigami-existing-image-edge-mismatch-"));
    try {
      const stubEngine = setupStub(tempDir);
      const state = relative(path.join(tempDir, "state"));
      const containerDir = path.join(tempDir, "state", "containers", "edge-app");
      mkdirSync(containerDir, { recursive: true });
      writeFileSync(path.join(containerDir, "label"), "edge");
      writeFileSync(path.join(containerDir, "image"), otherImageId);
      writeFileSync(path.join(containerDir, "running"), "true\n");
      const evidence = relative(path.join(tempDir, "evidence"));
      const result = spawnSync(bash, ["deploy/builder/private-staging/qualify-existing-image.sh"], {
        cwd: root,
        encoding: "utf8",
        env: {
          ...process.env,
          ENGINE: stubEngine,
          STUB_STATE: state,
          STUB_EXISTING_IMAGE_ID: imageId,
          STUB_EXISTING_SOURCE_SHA: sourceSha,
          STUB_EXISTING_ORIGIN: "https://builder-staging.ornigami.test",
          STUB_EXISTING_PLATFORM: "linux/amd64",
          STUB_EXISTING_USER: "1000:1000",
          HARNESS_SHA: harnessSha,
          IMAGE_REFERENCE: imageId,
          EXPECTED_SOURCE_SHA: sourceSha,
          EXPECTED_ORIGIN: "https://builder-staging.ornigami.test",
          QUALIFICATION_PATH: "https-edge",
          STAGING_ORIGIN: "https://builder-staging.ornigami.test",
          STAGING_BASIC_AUTH_USER: "synthetic",
          STAGING_BASIC_AUTH_PASSWORD: "synthetic",
          EDGE_APP_CONTAINER: "edge-app",
          EDGE_PROXY_CONTAINER: "edge-proxy",
          BUILDER_OPERATOR_VOLUME: "edge-store",
          BUILDER_RUNTIME_STORE_HOST_ID: "edge-host",
          EVIDENCE_DIR: evidence,
          ALLOW_DIRTY: "1",
          ALLOW_NON_LINUX_ENGINE: "1",
        },
      });
      assert.notEqual(result.status, 0, "edge image mismatch must fail");
      assert.match(`${result.stdout}\n${result.stderr}`, /edge app container image mismatch/);
      assert.equal(existsSync(path.join(tempDir, "evidence")), false, "evidence must not be created");
      const calls = readFileSync(path.join(tempDir, "state", "calls.log"), "utf8");
      assert.doesNotMatch(calls, /^build\b/m);
      assert.doesNotMatch(calls, /^network create/m);
      assert.doesNotMatch(calls, /^volume create/m);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  },
);

test(
  "archive verification reports an incomplete handoff when the archive is missing",
  { skip: !bashAvailable && "bash is required for the shell harness checks" },
  () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "ornigami-archive-missing-"));
    try {
      const evidence = path.join(tempDir, "evidence");
      const result = spawnSync(
        process.execPath,
        ["deploy/builder/private-staging/verify-image-archive.mjs"],
        {
          cwd: root,
          encoding: "utf8",
          env: {
            ...process.env,
            ARCHIVE_PATH: path.join(tempDir, "missing.tar"),
            RECEIPT_PATH: path.join(tempDir, "missing-receipt.json"),
            EVIDENCE_DIR: evidence,
            ENGINE: "docker",
            REQUIRE_FRESH_DAEMON: "1",
          },
        },
      );
      assert.notEqual(result.status, 0, "missing archive must fail");
      const record = JSON.parse(readFileSync(path.join(evidence, "archive-verification.json"), "utf8"));
      assert.equal(record.complete, false);
      assert.match(record.reason, /archive is missing/);
      assert.equal(record.checks.archivePresent, false);
      assert.equal(existsSync(path.join(evidence, "ACCEPTED.txt")), false);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  },
);

test(
  "archive fresh-daemon bypass remains an incomplete, non-independent handoff",
  { skip: !bashAvailable && "bash is required for the shell harness checks" },
  () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "ornigami-archive-bypass-"));
    try {
      const archive = path.join(tempDir, "archive.tar");
      const receiptPath = path.join(tempDir, "receipt.json");
      const evidence = path.join(tempDir, "evidence");
      const archiveBytes = Buffer.from("synthetic archive bytes");
      writeFileSync(archive, archiveBytes);
      const archiveSha256 = createHash("sha256").update(archiveBytes).digest("hex");
      writeFileSync(
        receiptPath,
        JSON.stringify({
          applicationSourceSha: sourceSha,
          harnessSha,
          imageId,
          origin: "https://builder-staging.ornigami.test",
          platform: "linux/amd64",
          user: "1000:1000",
          archiveSha256,
          archiveBytes: archiveBytes.length,
        }),
      );
      const result = spawnSync(
        process.execPath,
        ["deploy/builder/private-staging/verify-image-archive.mjs"],
        {
          cwd: root,
          encoding: "utf8",
          env: {
            ...process.env,
            ARCHIVE_PATH: archive,
            RECEIPT_PATH: receiptPath,
            EVIDENCE_DIR: evidence,
            ENGINE: "docker",
            REQUIRE_FRESH_DAEMON: "0",
            EXPECTED_SOURCE_SHA: sourceSha,
            EXPECTED_IMAGE_ID: imageId,
            EXPECTED_ORIGIN: "https://builder-staging.ornigami.test",
            HARNESS_SHA: harnessSha,
          },
        },
      );
      assert.notEqual(result.status, 0, "bypass must not pass");
      const record = JSON.parse(readFileSync(path.join(evidence, "archive-verification.json"), "utf8"));
      assert.equal(record.complete, false);
      assert.notEqual(record.independentHandoff, true);
      assert.match(record.reason, /fresh-daemon image-absence requirement was bypassed/);
      assert.equal(record.checks.archivePresent, true);
      assert.equal(record.checks.receiptPresent, true);
      assert.equal(record.checks.freshDaemonRequired, false);
      assert.equal(existsSync(path.join(evidence, "ACCEPTED.txt")), false);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  },
);
