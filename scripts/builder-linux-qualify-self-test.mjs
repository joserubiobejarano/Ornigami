#!/usr/bin/env node
/**
 * Locally runnable qualification rerun-safety check.
 *
 * It runs deploy/builder/qualify-linux.sh in QUALIFY_SELF_TEST=1 mode against a
 * stub container engine and verifies:
 * - an existing evidence directory is refused and left intact;
 * - existing network/volume/container resources are refused and left intact;
 * - a normal run creates only run-scoped resources and removes only those;
 * - prior run evidence is preserved;
 * - KEEP_VOLUMES=0 removes only the run's own volume.
 *
 * This does not build or run the image. Actual Linux execution remains pending
 * until the exact commands in the handoff run on an authorized Linux runner.
 */
import assert from "node:assert/strict";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const tempRoot = path.join(
  root,
  ".local",
  "builder-linux-qualify-self-test",
  `${stamp}-${process.pid}`,
);
const binDir = path.join(tempRoot, "bin");
const stubState = path.join(tempRoot, "stub-state");
const evidenceRoot = path.join(tempRoot, "evidence");
mkdirSync(binDir, { recursive: true });
mkdirSync(stubState, { recursive: true });

function relative(target) {
  return path.relative(root, target).split(path.sep).join("/");
}

const stubSource = path.join(root, "deploy", "builder", "tests", "stub-engine.sh");
const stubPath = path.join(binDir, "docker");
copyFileSync(stubSource, stubPath);
chmodSync(stubPath, 0o755);

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
const version = spawnSync(bash, ["--version"], { encoding: "utf8" });
assert.equal(version.status, 0, `bash is required: ${version.stderr || version.stdout}`);

const git = spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" });
assert.equal(git.status, 0, git.stderr);
const sourceSha = git.stdout.trim();
assert.match(sourceSha, /^[0-9a-f]{40}$/);
const qualifyScript = readFileSync(
  path.join(root, "deploy", "builder", "qualify-linux.sh"),
  "utf8",
);

function bashAbsolute(target) {
  if (process.platform !== "win32") return target;
  const result = spawnSync(bash, ["-c", 'cygpath -u "$1"', "bash", target], {
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}

function runQualify(extraEnv) {
  return spawnSync(bash, ["deploy/builder/qualify-linux.sh"], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      SOURCE_SHA: sourceSha,
      ALLOW_DIRTY: "1",
      ALLOW_NON_LINUX_ENGINE: "1",
      QUALIFY_SELF_TEST: "1",
      ENGINE: relative(stubPath),
      STUB_STATE: relative(stubState),
      EVIDENCE_ROOT: relative(evidenceRoot),
      STORE_MODE: "volume",
      ...extraEnv,
    },
  });
}

function resourceExists(kind, name) {
  return existsSync(path.join(stubState, kind, name));
}
function resourceLabel(kind, name) {
  return readFileSync(path.join(stubState, kind, name, "label"), "utf8");
}
function resourceNames(kind) {
  const dir = path.join(stubState, kind);
  return existsSync(dir) ? readdirSync(dir).sort() : [];
}
function calls() {
  const file = path.join(stubState, "calls.log");
  return existsSync(file) ? readFileSync(file, "utf8") : "";
}
function createCall(name) {
  const line = calls()
    .split(/\r?\n/)
    .find((entry) => entry.startsWith("create ") && entry.includes(`--name ${name} `));
  assert.ok(line, `missing create call for ${name}`);
  return line;
}
function resultsOk(runId) {
  const file = path.join(evidenceRoot, "runs", runId, "results.txt");
  if (!existsSync(file)) return false;
  return /^ok=true$/m.test(readFileSync(file, "utf8"));
}

const results = [];
function pass(name, detail = "") {
  results.push({ name, ok: true, detail });
  console.log(`ok ${results.length} - ${name}${detail ? ` (${detail})` : ""}`);
}

try {
  // 0. The runtime mount arguments explicitly scope every writable tmpfs to
  //    the runtime UID/GID and keep the existing noexec/nosuid flags.
  const runtimeStart = qualifyScript.indexOf("start_runtime() {");
  const runtimeEnd = qualifyScript.indexOf("# Build and image contract.", runtimeStart);
  assert.ok(runtimeStart >= 0 && runtimeEnd > runtimeStart);
  const runtimeBlock = qualifyScript.slice(runtimeStart, runtimeEnd);
  for (const expected of [
    "--read-only",
    "--tmpfs /tmp:rw,noexec,nosuid,size=64m,uid=1000,gid=1000,mode=0700",
    "--tmpfs /app/builder-runtime/.next/cache:rw,noexec,nosuid,size=64m,uid=1000,gid=1000,mode=0700",
    "--tmpfs /home/node:rw,noexec,nosuid,size=16m,uid=1000,gid=1000,mode=0700",
    '"${STORE_MOUNT_ARGS[@]}"',
    "--user 1000:1000",
  ]) {
    assert.ok(runtimeBlock.includes(expected), `runtime mount missing: ${expected}`);
  }
  assert.equal(
    (runtimeBlock.match(/--tmpfs /g) ?? []).length,
    3,
    "runtime must declare exactly three tmpfs mounts",
  );
  for (const [name, pathValue] of [
    ["store", "/data/builder"],
    ["tmp", "/tmp"],
    ["next-cache", "/app/builder-runtime/.next/cache"],
    ["home", "/home/node"],
  ]) {
    assert.ok(
      qualifyScript.includes(`check_writable_path "${name}" "${pathValue}" "700"`),
      `missing writable-path check for ${pathValue}`,
    );
  }
  const builderDockerfile = readFileSync(
    path.join(root, "deploy", "builder", "Dockerfile"),
    "utf8",
  );
  assert.match(builderDockerfile, /chmod 0700 \/data\/builder/);
  pass("runtime tmpfs mounts, writable paths and store mode assert owner, mode and flags");

  // 1. A pre-existing evidence directory is never deleted or reused.
  const preEvidence = path.join(tempRoot, "pre-existing-evidence");
  mkdirSync(preEvidence, { recursive: true });
  writeFileSync(path.join(preEvidence, "sentinel.txt"), "preserve-me\n");
  const collisionEvidence = runQualify({
    RUN_ID: "selftest-evidence-collision",
    EVIDENCE_DIR: relative(preEvidence),
  });
  assert.notEqual(collisionEvidence.status, 0, "existing evidence must be refused");
  assert.equal(
    readFileSync(path.join(preEvidence, "sentinel.txt"), "utf8"),
    "preserve-me\n",
    "pre-existing evidence must be unchanged",
  );
  assert.equal(resourceNames("networks").length, 0);
  assert.equal(resourceNames("volumes").length, 0);
  assert.equal(resourceNames("containers").length, 0);
  pass("pre-existing evidence directory refused and preserved");

  // 2. Pre-existing engine resources are never removed or reused.
  writing: {
    mkdirSync(path.join(stubState, "networks", "pre-existing-network"), { recursive: true });
    writeFileSync(
      path.join(stubState, "networks", "pre-existing-network", "label"),
      "pre-existing",
    );
    mkdirSync(path.join(stubState, "volumes", "pre-existing-volume"), { recursive: true });
    writeFileSync(
      path.join(stubState, "volumes", "pre-existing-volume", "label"),
      "pre-existing",
    );
    mkdirSync(path.join(stubState, "containers", "pre-existing-container"), { recursive: true });
    writeFileSync(
      path.join(stubState, "containers", "pre-existing-container", "label"),
      "pre-existing",
    );
  }
  const collisionResource = runQualify({
    RUN_ID: "selftest-resource-collision",
    EVIDENCE_DIR: relative(path.join(tempRoot, "evidence-resource-collision")),
    NETWORK: "pre-existing-network",
    STORE_VOLUME: "pre-existing-volume",
    CONTAINER: "pre-existing-container",
  });
  assert.notEqual(collisionResource.status, 0, "existing resources must be refused");
  assert.equal(resourceLabel("networks", "pre-existing-network"), "pre-existing");
  assert.equal(resourceLabel("volumes", "pre-existing-volume"), "pre-existing");
  assert.equal(resourceLabel("containers", "pre-existing-container"), "pre-existing");
  pass("pre-existing network, volume and container refused and preserved");

  // 3. A normal run creates and removes only its own resources.
  const priorRun = path.join(evidenceRoot, "runs", "prior-run");
  mkdirSync(priorRun, { recursive: true });
  writeFileSync(path.join(priorRun, "sentinel.txt"), "prior-run\n");
  const normal = runQualify({
    RUN_ID: "selftest-normal",
    SELF_TEST_CREATE_CONTAINER: "1",
    KEEP_VOLUMES: "1",
  });
  assert.equal(normal.status, 0, `${normal.stdout}\n${normal.stderr}`);
  const resultsFile = path.join(evidenceRoot, "runs", "selftest-normal", "results.txt");
  assert.equal(existsSync(resultsFile), true, "self-test results were not written");
  assert.match(readFileSync(resultsFile, "utf8"), /self_test=true/);
  const normalCreate = createCall("ornigami-builder-qualify-selftest-normal");
  assert.match(
    normalCreate,
    /--mount type=volume,src=ornigami-builder-store-selftest-normal,dst=\/data\/builder/,
    "normal run must pass the exact volume mount",
  );
  assert.equal(
    (normalCreate.match(/--mount/g) ?? []).length,
    1,
    "normal run must pass exactly one store mount",
  );
  assert.equal(resourceExists("networks", "ornigami-builder-qualify-net-selftest-normal"), false);
  assert.equal(
    resourceExists("containers", "ornigami-builder-qualify-selftest-normal"),
    false,
  );
  assert.equal(resourceExists("volumes", "ornigami-builder-store-selftest-normal"), true);
  assert.equal(readFileSync(path.join(priorRun, "sentinel.txt"), "utf8"), "prior-run\n");
  assert.equal(resourceLabel("networks", "pre-existing-network"), "pre-existing");
  assert.equal(resourceLabel("volumes", "pre-existing-volume"), "pre-existing");
  assert.equal(resourceLabel("containers", "pre-existing-container"), "pre-existing");
  assert.match(calls(), /network rm ornigami-builder-qualify-net-selftest-normal/);
  assert.match(calls(), /rm -f ornigami-builder-qualify-selftest-normal/);
  pass("normal run removed only its own network and container");

  // 4. KEEP_VOLUMES=0 removes only the run-owned volume and preserves evidence.
  const clean = runQualify({
    RUN_ID: "selftest-clean",
    KEEP_VOLUMES: "0",
  });
  assert.equal(clean.status, 0, `${clean.stdout}\n${clean.stderr}`);
  assert.equal(resourceExists("volumes", "ornigami-builder-store-selftest-clean"), false);
  assert.equal(resourceExists("volumes", "ornigami-builder-store-selftest-normal"), true);
  assert.equal(existsSync(resultsFile), true, "prior run evidence must survive a rerun");
  assert.equal(readFileSync(path.join(priorRun, "sentinel.txt"), "utf8"), "prior-run\n");
  pass("KEEP_VOLUMES=0 removed only the run-owned volume");

  // 5. The supported operator wrapper prints the exact isolated command for a
  //    named volume and for a bind store, without requiring an engine.
  const printVolume = spawnSync(
    bash,
    ["deploy/builder/operator.sh", "--print-command", "lock-status", "--json"],
    {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        ENGINE: "docker",
        BUILDER_OPERATOR_IMAGE: "ornigami-builder:test",
        BUILDER_OPERATOR_VOLUME: "operator-volume",
        BUILDER_RUNTIME_STORE_HOST_ID: "operator-host",
      },
    },
  );
  assert.equal(printVolume.status, 0, printVolume.stderr || printVolume.stdout);
  const printVolumeOutput = printVolume.stdout.replace(/\\,/g, ",");
  for (const expected of [
    "docker run --rm",
    "--network none",
    "--read-only",
    "--user 1000:1000",
    "--tmpfs /tmp:rw,noexec,nosuid,size=16m,uid=1000,gid=1000,mode=0700",
    "--tmpfs /home/node:rw,noexec,nosuid,size=16m,uid=1000,gid=1000,mode=0700",
    "type=volume",
    "src=operator-volume",
    "BUILDER_RUNTIME_STORE_HOST_ID=operator-host",
    "/app/scripts/builder-invite-operator.mjs",
    "lock-status --store /data/builder",
    "--json",
  ]) {
    assert.match(printVolumeOutput, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  pass("operator wrapper prints the isolated named-volume command");

  const printBind = spawnSync(
    bash,
    ["deploy/builder/operator.sh", "--print-command", "list", "--json"],
    {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        ENGINE: "docker",
        BUILDER_OPERATOR_IMAGE: "ornigami-builder:test",
        BUILDER_OPERATOR_STORE: "/var/lib/ornigami-builder-store",
        BUILDER_RUNTIME_STORE_HOST_ID: "operator-host",
      },
    },
  );
  assert.equal(printBind.status, 0, printBind.stderr || printBind.stdout);
  assert.match(printBind.stdout, /type=bind/);
  assert.match(printBind.stdout, /src=\/var\/lib\/ornigami-builder-store/);
  pass("operator wrapper prints the isolated bind-store command");

  // 6. Bind mode creates no named volume and still cleans up its network.
  const bindStore = path.join(tempRoot, "bind-store");
  const bindRun = runQualify({
    RUN_ID: "selftest-bind",
    STORE_MODE: "bind",
    STORE_DIR: bashAbsolute(bindStore),
    SELF_TEST_CREATE_CONTAINER: "1",
    KEEP_VOLUMES: "0",
  });
  assert.equal(bindRun.status, 0, `${bindRun.stdout}\n${bindRun.stderr}`);
  assert.equal(existsSync(bindStore), true, "bind store directory was not created");
  assert.equal(resourceExists("volumes", "ornigami-builder-store-selftest-bind"), false);
  assert.equal(resourceExists("networks", "ornigami-builder-qualify-net-selftest-bind"), false);
  assert.equal(
    resourceExists("containers", "ornigami-builder-qualify-selftest-bind"),
    false,
  );
  const bindCreate = createCall("ornigami-builder-qualify-selftest-bind");
  assert.match(
    bindCreate,
    new RegExp(
      `--mount type=bind,src=${bashAbsolute(bindStore).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")},dst=/data/builder`,
    ),
    "bind run must pass the exact bind mount",
  );
  assert.equal(
    (bindCreate.match(/--mount/g) ?? []).length,
    1,
    "bind run must pass exactly one store mount",
  );
  pass("bind mode created no named volume and cleaned up its network");

  // 7. Mount construction failure aborts before results. A comma is invalid in
  //    the Docker --mount value and must never be silently dropped.
  const badMount = runQualify({
    RUN_ID: "selftest-bad-mount",
    STORE_VOLUME: "bad,volume",
    SELF_TEST_CREATE_CONTAINER: "1",
    KEEP_ON_FAILURE: "0",
  });
  assert.notEqual(badMount.status, 0, "invalid mount source must fail the run");
  assert.equal(resultsOk("selftest-bad-mount"), false);
  assert.equal(
    existsSync(path.join(evidenceRoot, "runs", "selftest-bad-mount", "results.txt")),
    false,
    "mount failure must not write ok=true",
  );
  pass("mount construction failure aborts without an ok result");

  // 8. A helper/engine failure also aborts before results.
  const createFailure = runQualify({
    RUN_ID: "selftest-create-failure",
    SELF_TEST_CREATE_CONTAINER: "1",
    STUB_FAIL_CREATE: "1",
    KEEP_ON_FAILURE: "0",
  });
  assert.notEqual(createFailure.status, 0, "engine create failure must fail the run");
  assert.equal(resultsOk("selftest-create-failure"), false);
  assert.equal(
    existsSync(path.join(evidenceRoot, "runs", "selftest-create-failure", "results.txt")),
    false,
    "helper failure must not write ok=true",
  );
  pass("helper failure aborts without an ok result");

  console.log(
    JSON.stringify(
      {
        ok: true,
        checks: results.length,
        sourceSha,
        bash,
        selfTestRoot: relative(tempRoot),
        results,
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(
    JSON.stringify(
      {
        ok: false,
        sourceSha,
        selfTestRoot: relative(tempRoot),
        results,
        error: error instanceof Error ? error.message : String(error),
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
}
