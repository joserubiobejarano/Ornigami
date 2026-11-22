import assert from "node:assert/strict";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

// Linux-only POSIX ownership regression. It calls the real preflight with two
// distinct accounts: the current runner and the UID-1000 builder. It is skipped
// on Windows/Git Bash and wherever passwordless sudo or a distinct UID-1000
// account is unavailable; it is not a substitute for the real workflow run.

const root = process.cwd();
const script = "deploy/builder/private-staging/verify-linux-ownership.sh";
const bash = process.env.BASH || "bash";
const isLinux = process.platform === "linux";

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    ...options,
  });
}

function sudo(args) {
  return run("sudo", ["-n", ...args]);
}

function sudoAs(user, args) {
  return run("sudo", ["-n", "-u", user, "--", ...args]);
}

function currentUser() {
  const result = run("id", ["-un"]);
  return result.status === 0 && result.stdout ? result.stdout.trim() : "";
}

function userForUid(uid) {
  if (!isLinux) return null;
  const result = run("id", ["-nu", String(uid)]);
  return result.status === 0 && result.stdout ? result.stdout.trim() : null;
}

function groupForUser(user) {
  if (!user) return "";
  const result = run("id", ["-gn", user]);
  return result.status === 0 && result.stdout ? result.stdout.trim() : "";
}

function uidForUser(user) {
  if (!user) return "";
  const result = run("id", ["-u", user]);
  return result.status === 0 && result.stdout ? result.stdout.trim() : "";
}

function gidForUser(user) {
  if (!user) return "";
  const result = run("id", ["-g", user]);
  return result.status === 0 && result.stdout ? result.stdout.trim() : "";
}

const runnerUser = isLinux ? process.env.PREFLIGHT_TEST_RUNNER_USER || currentUser() : "";
const builderUser = isLinux ? process.env.PREFLIGHT_TEST_BUILDER_USER || userForUid(1000) : "";
const runnerGroup = groupForUser(runnerUser);
const builderGroup = groupForUser(builderUser);
const runnerUid = uidForUser(runnerUser);
const runnerGid = gidForUser(runnerUser);
const builderUid = uidForUser(builderUser);
const builderGid = gidForUser(builderUser);
const sudoAvailable = isLinux && sudo(["true"]).status === 0;
const prerequisites = Boolean(
  isLinux &&
    sudoAvailable &&
    runnerUser &&
    builderUser &&
    runnerUser !== builderUser &&
    builderUid === "1000",
);
const skip = prerequisites
  ? false
  : "Linux, passwordless sudo, and a distinct UID-1000 builder account are required";

function makeFixture() {
  const base = mkdtempSync(path.join(os.tmpdir(), "ornigami-preflight-regression-"));
  chmodSync(base, 0o755);
  const evidence = path.join(base, "evidence");
  const builderRoot = path.join(evidence, "builder");
  const staging = path.join(evidence, "staging");
  const upload = path.join(evidence, "upload");
  const logs = path.join(base, "logs");
  const diagnostics = path.join(base, "diagnostics");
  const source = path.join(base, "source");
  const helperDir = path.join(source, "deploy", "builder", "private-staging");
  mkdirSync(helperDir, { recursive: true });
  copyFileSync(
    path.join(root, "deploy", "builder", "private-staging", "proxy-bindings.mjs"),
    path.join(helperDir, "proxy-bindings.mjs"),
  );
  copyFileSync(
    path.join(root, "deploy", "builder", "private-staging", "run-exact-rehearsal-linux.sh"),
    path.join(helperDir, "run-exact-rehearsal-linux.sh"),
  );
  for (const directory of [evidence, builderRoot, staging, upload, logs, diagnostics]) {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
  }
  sudo(["install", "-d", "-m", "0755", "-o", runnerUser, "-g", runnerGroup, evidence]);
  sudo(["install", "-d", "-m", "0700", "-o", builderUser, "-g", builderGroup, builderRoot]);
  sudo(["install", "-d", "-m", "2770", "-o", builderUser, "-g", runnerGroup, staging]);
  sudo(["install", "-d", "-m", "0700", "-o", runnerUser, "-g", runnerGroup, upload]);
  sudo(["install", "-d", "-m", "0700", "-o", runnerUser, "-g", runnerGroup, logs]);
  sudo(["install", "-d", "-m", "0700", "-o", runnerUser, "-g", runnerGroup, diagnostics]);
  sudo(["chown", "-R", `${builderUser}:${builderGroup}`, source]);
  return { base, evidence, builderRoot, staging, upload, logs, diagnostics, source };
}

function preflightEnv(fixture, overrides = {}) {
  return {
    ...process.env,
    RUNNER_USER: runnerUser,
    BUILDER_USER: builderUser,
    SOURCE_ROOT: fixture.source,
    CONTROL_ROOT: fixture.source,
    EMERGENCY_DIAGNOSTICS_ROOT: fixture.diagnostics,
    RUNNER_LOG_ROOT: fixture.logs,
    BUILDER_EVIDENCE_ROOT: fixture.builderRoot,
    EXPORT_STAGING: fixture.staging,
    UPLOAD_STAGING: fixture.upload,
    NODE_BIN: "node",
    PREFLIGHT_SKIP_DOCKER: "1",
    DOCKER_HOST_ENDPOINT: process.env.DOCKER_HOST_ENDPOINT || "unix:///var/run/docker.sock",
    DOCKER_BUILD_ENDPOINT: process.env.DOCKER_BUILD_ENDPOINT || "tcp://127.0.0.1:2375",
    ...overrides,
  };
}

function runPreflight(fixture, overrides = {}) {
  return run(bash, [script], { env: preflightEnv(fixture, overrides) });
}

function cleanup(fixture) {
  if (fixture) sudo(["rm", "-rf", "--", fixture.base]);
}

function summary(fixture) {
  return readFileSync(path.join(fixture.logs, "ownership-preflight.txt"), "utf8");
}

function observations(fixture) {
  const json = JSON.parse(readFileSync(path.join(fixture.logs, "ownership-preflight.json"), "utf8"));
  return { json, values: Object.fromEntries(json.observations.map((item) => [item.key, item.value])) };
}

function failure(fixture) {
  return readFileSync(path.join(fixture.logs, "ownership-preflight-failure.txt"), "utf8");
}

test("valid ownership and export setup passes and records effective users", { skip }, () => {
  const fixture = makeFixture();
  try {
    const result = runPreflight(fixture);
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.equal(existsSync(path.join(fixture.logs, "ownership-preflight-failure.txt")), false);
    assert.match(summary(fixture), /^status=0$/m);
    const { json, values } = observations(fixture);
    assert.equal(json.status, 0);
    assert.equal(values.builder_uid, "1000");
    assert.equal(values.builder_evidence_owner_mode, `${builderUid}:${builderGid}:700`);
    assert.equal(values.builder_store_root_owner_mode, `${builderUid}:${builderGid}:700`);
    assert.equal(values.builder_store_file_owner_mode, `${builderUid}:${builderGid}:600`);
    assert.equal(values.runner_can_read_export, "true");
    assert.equal(values.runner_cannot_read_builder_evidence, "true");
    assert.equal(values.runner_cannot_traverse_builder_root, "true");
    assert.equal(values.builder_cannot_read_runner_logs, "true");
    assert.equal(values.builder_cannot_read_upload_staging, "true");
    assert.equal(values.loopback_profile, "valid");
    assert.equal(values.wildcard_profile, "valid");
  } finally {
    cleanup(fixture);
  }
});

test("wrong builder-root owner is rejected with expected and observed identity", { skip }, () => {
  const fixture = makeFixture();
  try {
    sudo(["chown", "-R", `${runnerUser}:${runnerGroup}`, fixture.builderRoot]);
    const result = runPreflight(fixture);
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}\n${result.stderr}`, /FAIL: builder_evidence_owner_mode/);
    const text = failure(fixture);
    assert.match(text, /^status=1$/m);
    assert.match(text, /assertion=builder_evidence_owner_mode/);
    assert.match(text, new RegExp(`expected=${builderUid}:${builderGid}:700`));
    assert.match(text, new RegExp(`observed=${runnerUid}:${runnerGid}:700`));
    assert.match(text, new RegExp(`effective_user=${builderUser}`));
    assert.equal(observations(fixture).json.status, 1);
  } finally {
    cleanup(fixture);
  }
});

test("wrong builder-root and store modes are rejected", { skip }, () => {
  const fixture = makeFixture();
  try {
    sudo(["chmod", "0755", fixture.builderRoot]);
    const result = runPreflight(fixture);
    assert.notEqual(result.status, 0);
    assert.match(failure(fixture), /assertion=builder_evidence_owner_mode/);
    assert.match(failure(fixture), /observed=\d+:\d+:755/);
  } finally {
    cleanup(fixture);
  }

  const storeFixture = makeFixture();
  try {
    const storeDir = path.join(storeFixture.builderRoot, "preflight-store");
    const storeFile = path.join(storeDir, "identity-store.json");
    sudo(["install", "-d", "-m", "0755", "-o", builderUser, "-g", builderGroup, storeDir]);
    sudo(["install", "-m", "0644", "-o", builderUser, "-g", builderGroup, "/dev/null", storeFile]);
    sudoAs(builderUser, ["bash", "-c", 'printf "%s\n" store-ok > "$1"', "_", storeFile]);
    const result = runPreflight(storeFixture);
    assert.notEqual(result.status, 0);
    assert.match(failure(storeFixture), /assertion=builder_store_root_owner_mode/);
    assert.match(failure(storeFixture), /expected=\d+:\d+:700/);
    assert.match(failure(storeFixture), /observed=\d+:\d+:755/);
  } finally {
    cleanup(storeFixture);
  }

  const storeFileFixture = makeFixture();
  try {
    const storeDir = path.join(storeFileFixture.builderRoot, "preflight-store");
    const storeFile = path.join(storeDir, "identity-store.json");
    sudo(["install", "-d", "-m", "0700", "-o", builderUser, "-g", builderGroup, storeDir]);
    sudo(["install", "-m", "0644", "-o", builderUser, "-g", builderGroup, "/dev/null", storeFile]);
    sudoAs(builderUser, ["bash", "-c", 'printf "%s\n" store-ok > "$1"', "_", storeFile]);
    const result = runPreflight(storeFileFixture);
    assert.notEqual(result.status, 0);
    assert.match(failure(storeFileFixture), /assertion=builder_store_file_owner_mode/);
    assert.match(failure(storeFileFixture), /expected=\d+:\d+:600/);
    assert.match(failure(storeFileFixture), /observed=\d+:\d+:644/);
  } finally {
    cleanup(storeFileFixture);
  }
});

test("store access is builder-positive and runner-negative", { skip }, () => {
  const fixture = makeFixture();
  try {
    const result = runPreflight(fixture);
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    const storeDir = path.join(fixture.builderRoot, "preflight-store");
    const storeFile = path.join(storeDir, "identity-store.json");
    assert.equal(sudoAs(builderUser, ["stat", "-c", "%u:%g:%a", storeDir]).stdout.trim(), `${builderUid}:${builderGid}:700`);
    assert.equal(sudoAs(builderUser, ["test", "-x", storeDir]).status, 0);
    assert.equal(sudoAs(builderUser, ["test", "-r", storeFile]).status, 0);
    assert.equal(sudoAs(builderUser, ["test", "-w", storeFile]).status, 0);
    assert.notEqual(run("test", ["-x", storeDir]).status, 0, "runner must not traverse the store");
    assert.notEqual(run("test", ["-r", storeFile]).status, 0, "runner must not read the store file");
  } finally {
    cleanup(fixture);
  }
});

test("approved export is builder-written and runner-readable at 0640", { skip }, () => {
  const fixture = makeFixture();
  try {
    const result = runPreflight(fixture);
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    const exportFile = path.join(fixture.staging, "regression-export.txt");
    assert.equal(
      sudoAs(builderUser, ["install", "-m", "0640", "/dev/null", exportFile]).status,
      0,
    );
    assert.equal(
      sudoAs(builderUser, ["bash", "-c", 'printf "%s\n" export-ok > "$1"', "_", exportFile]).status,
      0,
    );
    assert.equal(readFileSync(exportFile, "utf8").trim(), "export-ok");
    assert.equal(statSync(exportFile).mode & 0o777, 0o640);
    assert.equal(statSync(exportFile).uid, Number(builderUid));
    assert.equal(statSync(exportFile).gid, Number(runnerGid));
  } finally {
    cleanup(fixture);
  }

  const wrongGroup = makeFixture();
  try {
    sudo(["chgrp", builderGroup, wrongGroup.staging]);
    const result = runPreflight(wrongGroup);
    assert.notEqual(result.status, 0);
    assert.match(failure(wrongGroup), /assertion=export_staging_owner_mode/);
    assert.match(failure(wrongGroup), new RegExp(`expected=${builderUid}:${runnerGid}:2770`));
    assert.match(failure(wrongGroup), new RegExp(`observed=${builderUid}:${builderGid}:2770`));
  } finally {
    cleanup(wrongGroup);
  }
});

test("builder cannot read runner logs, upload staging or diagnostics", { skip }, () => {
  const fixture = makeFixture();
  try {
    const result = runPreflight(fixture);
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    for (const target of [
      path.join(fixture.logs, "preflight-runner.txt"),
      fixture.logs,
      path.join(fixture.upload, "preflight-upload.txt"),
      fixture.upload,
      fixture.diagnostics,
    ]) {
      assert.notEqual(sudoAs(builderUser, ["test", "-r", target]).status, 0, `builder read ${target}`);
      assert.notEqual(sudoAs(builderUser, ["test", "-x", target]).status, 0, `builder traversed ${target}`);
    }
  } finally {
    cleanup(fixture);
  }
});

test("deliberate preflight failure stays bounded in diagnostics with nonzero status", { skip }, () => {
  const fixture = makeFixture();
  try {
    sudo(["chmod", "0755", fixture.builderRoot]);
    const result = runPreflight(fixture);
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}\n${result.stderr}`, /FAIL: builder_evidence_owner_mode/);
    const text = failure(fixture);
    assert.match(text, /^status=1$/m);
    assert.match(text, /assertion=builder_evidence_owner_mode/);
    assert.match(text, /expected=\d+:\d+:700/);
    assert.match(text, /observed=\d+:\d+:755/);
    assert.match(text, new RegExp(`effective_user=${builderUser}`));

    writeFileSync(
      path.join(fixture.logs, "ownership-preflight-console.txt"),
      `${result.stdout}\n${result.stderr}`,
    );
    const staged = run(process.execPath, ["deploy/builder/private-staging/stage-approved-evidence.mjs"], {
      env: {
        ...process.env,
        SOURCE_ROOTS: fixture.logs,
        UPLOAD_ROOT: fixture.diagnostics,
        MAX_ARCHIVE_BYTES: "0",
        MAX_ARTIFACT_BYTES: String(64 * 1024 * 1024),
        MAX_DIAGNOSTIC_BYTES: String(64 * 1024 * 1024),
        RECEIPT_PATH: path.join(fixture.base, "staging-receipt.json"),
      },
    });
    assert.equal(staged.status, 0, `${staged.stdout}\n${staged.stderr}`);
    const retainedFailure = path.join(fixture.diagnostics, "logs", "ownership-preflight-failure.txt");
    const retainedConsole = path.join(fixture.diagnostics, "logs", "ownership-preflight-console.txt");
    assert.equal(existsSync(retainedFailure), true, "failure record was not staged into diagnostics");
    assert.equal(existsSync(retainedConsole), true, "console log was not staged into diagnostics");
    assert.match(readFileSync(retainedFailure, "utf8"), /assertion=builder_evidence_owner_mode/);
    assert.match(readFileSync(retainedConsole, "utf8"), /FAIL: builder_evidence_owner_mode/);
  } finally {
    cleanup(fixture);
  }
});

test("selected Docker endpoints are reachable as the builder with distinct IDs", { skip }, (t) => {
  const hostEndpoint = process.env.DOCKER_HOST_ENDPOINT || "unix:///var/run/docker.sock";
  const buildEndpoint = process.env.DOCKER_BUILD_ENDPOINT || "tcp://127.0.0.1:2375";
  const host = sudoAs(builderUser, ["env", `DOCKER_HOST=${hostEndpoint}`, "docker", "info", "--format", "{{.ID}}"]);
  const build = sudoAs(builderUser, ["env", `DOCKER_HOST=${buildEndpoint}`, "docker", "info", "--format", "{{.ID}}"]);
  if (host.status !== 0 || build.status !== 0 || host.stdout.trim() === build.stdout.trim()) {
    t.skip("selected Docker endpoints are not both reachable as the builder here");
    return;
  }
  const fixture = makeFixture();
  try {
    const result = runPreflight(fixture, { PREFLIGHT_SKIP_DOCKER: "0" });
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    const { values } = observations(fixture);
    assert.equal(values.distinct_docker_daemons, "true");
    assert.equal(values.builder_host_docker_id, host.stdout.trim());
    assert.equal(values.builder_build_docker_id, build.stdout.trim());
  } finally {
    cleanup(fixture);
  }
});
