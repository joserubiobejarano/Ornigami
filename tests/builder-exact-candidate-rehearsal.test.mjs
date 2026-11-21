import assert from "node:assert/strict";
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const root = process.cwd();
const imageId = `sha256:${"a".repeat(64)}`;
const otherImageId = `sha256:${"b".repeat(64)}`;
const origin = "https://builder-staging.ornigami.test";
const sourceSha = spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).stdout.trim();
const harnessSha = sourceSha;

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

function setupTools(tempDir) {
  const bin = path.join(tempDir, "bin");
  mkdirSync(bin, { recursive: true });
  const engine = path.join(bin, "docker");
  copyFileSync(path.join(root, "deploy", "builder", "tests", "stub-rehearsal-engine.sh"), engine);
  chmodSync(engine, 0o755);
  const qualification = path.join(bin, "stub-qualification.sh");
  copyFileSync(path.join(root, "deploy", "builder", "tests", "stub-qualification.sh"), qualification);
  chmodSync(qualification, 0o755);
  return {
    engine: relative(engine),
    qualification: relative(qualification),
    state: relative(path.join(tempDir, "state")),
    calls: relative(path.join(tempDir, "calls.log")),
  };
}

function baseEnv(tempDir, tools) {
  return {
    ...process.env,
    SOURCE_SHA: sourceSha,
    HARNESS_SHA: harnessSha,
    APP_URL: origin,
    PLATFORM: "linux/amd64",
    EXPECTED_USER: "1000:1000",
    REHEARSAL_DIR: relative(path.join(tempDir, "rehearsal")),
    BUILD_ENGINE: tools.engine,
    VERIFY_ENGINE: tools.engine,
    PHASE_ENGINE: tools.engine,
    BUILD_CONTEXT: "build",
    VERIFY_CONTEXT: "verify",
    PHASE_CONTEXT: "verify",
    STUB_STATE: tools.state,
    STUB_CALL_LOG: tools.calls,
    STUB_BUILT_IMAGE_ID: imageId,
    STUB_BUILT_SOURCE_SHA: sourceSha,
    STUB_BUILT_ORIGIN: origin,
    STUB_BUILT_USER: "1000:1000",
    ENGINE_SHELL: "bash",
    ALLOW_DIRTY: "1",
    REHEARSAL_TEST_MODE: "1",
    REHEARSAL_QUALIFICATION_SCRIPT: tools.qualification,
    TMPDIR: os.tmpdir().split(path.sep).join("/"),
  };
}

function writeDaemonMap(tempDir, mapping) {
  const file = path.join(tempDir, "daemon-map");
  writeFileSync(file, Object.entries(mapping).map(([key, value]) => `${key}=${value}`).join("\n") + "\n");
  return relative(file);
}

function writeEdge(daemonState, { image = imageId, source = sourceSha, edgeOrigin = origin, includeApp = true } = {}) {
  if (!includeApp) return;
  const containers = path.join(daemonState, "containers");
  for (const name of ["edge-app", "edge-proxy"]) {
    const dir = path.join(containers, name);
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, "label"), "edge");
    writeFileSync(path.join(dir, "running"), "true\n");
    writeFileSync(path.join(dir, "health"), "healthy\n");
    if (name === "edge-app") {
      writeFileSync(path.join(dir, "image"), image);
      writeFileSync(path.join(dir, "source"), source);
      writeFileSync(path.join(dir, "origin"), edgeOrigin);
    }
  }
  mkdirSync(path.join(daemonState, "volumes", "edge-store"), { recursive: true });
}

function edgeEnv(tempDir) {
  return {
    EDGE_APP_CONTAINER: "edge-app",
    EDGE_PROXY_CONTAINER: "edge-proxy",
    EDGE_STORE_VOLUME: "edge-store",
    BUILDER_OPERATOR_VOLUME: "edge-store",
    BUILDER_RUNTIME_STORE_HOST_ID: "edge-store-host",
    STAGING_BASIC_AUTH_USER: "synthetic",
    STAGING_BASIC_AUTH_PASSWORD: "synthetic",
  };
}

function runRehearsal(env, action) {
  return spawnSync(bash, ["deploy/builder/private-staging/rehearse-exact-candidate.sh"], {
    cwd: root,
    encoding: "utf8",
    env: { ...env, ACTION: action },
  });
}

function calls(tempDir) {
  const file = path.join(tempDir, "calls.log");
  return existsSync(file) ? readFileSync(file, "utf8") : "";
}

test(
  "plan-only mode writes the plan without contacting an engine or origin",
  { skip: !bashAvailable && "bash is required for the shell harness checks" },
  () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "ornigami-rehearsal-plan-"));
    try {
      const tools = setupTools(tempDir);
      const env = baseEnv(tempDir, tools);
      delete env.STUB_CALL_LOG;
      const result = runRehearsal(env, "plan");
      assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
      const plan = JSON.parse(readFileSync(path.join(tempDir, "rehearsal", "rehearsal-plan.json"), "utf8"));
      assert.equal(plan.status, "planned");
      assert.equal(plan.build.daemonIdentity, "pending");
      assert.equal(plan.checkpoint.required, true);
      assert.match(result.stdout, /No engine, registry or origin was contacted/);
      assert.equal(existsSync(path.join(tempDir, "calls.log")), false);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  },
);

test(
  "checkpoint then resume routes every engine invocation and qualifies the same image",
  { skip: !bashAvailable && "bash is required for the shell harness checks" },
  () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "ornigami-rehearsal-success-"));
    try {
      const tools = setupTools(tempDir);
      const env = baseEnv(tempDir, tools);
      env.STUB_DAEMON_MAP = writeDaemonMap(tempDir, { build: "daemon-build", verify: "daemon-verify" });
      const checkpoint = runRehearsal(env, "checkpoint");
      assert.equal(checkpoint.status, 0, `${checkpoint.stdout}\n${checkpoint.stderr}`);
      const checkpointJson = JSON.parse(readFileSync(path.join(tempDir, "rehearsal", "checkpoint.json"), "utf8"));
      assert.equal(checkpointJson.status, "awaiting-edge-setup");
      assert.equal(checkpointJson.imageId, imageId);
      assert.equal(checkpointJson.phase.transferRequired, false);
      assert.equal(checkpointJson.qualificationStarted, false);
      assert.equal(existsSync(path.join(tempDir, "rehearsal", "REHEARSAL_COMPLETE.txt")), false);
      const callLog = calls(tempDir);
      assert.match(callLog, /daemon=build .*args=build /);
      assert.match(callLog, /daemon=verify .*args=load /);
      for (const line of callLog.trim().split(/\r?\n/)) {
        assert.match(line, /^daemon=(build|verify|phase) /, line);
      }
      assert.doesNotMatch(callLog, /qualification/i);

      writeEdge(path.join(tempDir, "state", "verify"));
      const resumed = runRehearsal({ ...env, ...edgeEnv(tempDir) }, "qualify");
      assert.equal(resumed.status, 0, `${resumed.stdout}\n${resumed.stderr}`);
      const attempt = JSON.parse(readFileSync(path.join(tempDir, "rehearsal", "resume-attempt-1.json"), "utf8"));
      assert.equal(attempt.status, "complete");
      const qualificationEnv = JSON.parse(
        readFileSync(path.join(tempDir, "rehearsal", "qualification-attempt-1", "qualification-env.json"), "utf8"),
      );
      assert.equal(qualificationEnv.dockerContext, "verify");
      assert.equal(qualificationEnv.imageReference, imageId);
      assert.equal(qualificationEnv.applicationOrigin, origin);
      assert.match(readFileSync(path.join(tempDir, "rehearsal", "REHEARSAL_COMPLETE.txt"), "utf8"), /customer_admission=closed/);
      assert.equal((calls(tempDir).match(/args=build /g) ?? []).length, 1, "build must run only once");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  },
);

test(
  "explicit endpoints route DOCKER_HOST and context plus endpoint is rejected before build",
  { skip: !bashAvailable && "bash is required for the shell harness checks" },
  () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "ornigami-rehearsal-endpoint-"));
    try {
      const tools = setupTools(tempDir);
      const env = baseEnv(tempDir, tools);
      env.BUILD_CONTEXT = "default";
      env.VERIFY_CONTEXT = "default";
      env.PHASE_CONTEXT = "default";
      env.BUILD_ENDPOINT = "unix:///build.sock";
      env.VERIFY_ENDPOINT = "unix:///verify.sock";
      env.PHASE_ENDPOINT = "unix:///verify.sock";
      env.STUB_DAEMON_MAP = writeDaemonMap(tempDir, {
        "unix:///build.sock": "daemon-build-endpoint",
        "unix:///verify.sock": "daemon-verify-endpoint",
      });
      const checkpoint = runRehearsal(env, "checkpoint");
      assert.equal(checkpoint.status, 0, `${checkpoint.stdout}\n${checkpoint.stderr}`);
      const callLog = calls(tempDir);
      assert.match(callLog, /daemon=unix:\/\/\/build\.sock .*host=unix:\/\/\/build\.sock .*args=build /);
      assert.match(callLog, /daemon=unix:\/\/\/verify\.sock .*host=unix:\/\/\/verify\.sock .*args=load /);

      const conflictDir = mkdtempSync(path.join(os.tmpdir(), "ornigami-rehearsal-conflict-"));
      try {
        const conflictTools = setupTools(conflictDir);
        const conflictEnv = baseEnv(conflictDir, conflictTools);
        conflictEnv.BUILD_CONTEXT = "build";
        conflictEnv.BUILD_ENDPOINT = "unix:///build.sock";
        const conflict = runRehearsal(conflictEnv, "checkpoint");
        assert.notEqual(conflict.status, 0, "context plus endpoint must fail");
        assert.match(`${conflict.stdout}\n${conflict.stderr}`, /select one daemon/);
        assert.doesNotMatch(calls(conflictDir), /args=build /);
      } finally {
        rmSync(conflictDir, { recursive: true, force: true });
      }
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  },
);

test(
  "two selector aliases resolving to one daemon fail before build",
  { skip: !bashAvailable && "bash is required for the shell harness checks" },
  () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "ornigami-rehearsal-alias-"));
    try {
      const tools = setupTools(tempDir);
      const env = baseEnv(tempDir, tools);
      env.STUB_DAEMON_MAP = writeDaemonMap(tempDir, { build: "same-daemon", verify: "same-daemon" });
      const result = runRehearsal(env, "checkpoint");
      assert.notEqual(result.status, 0, "same observed daemon must fail");
      assert.match(`${result.stdout}\n${result.stderr}`, /resolve to the same daemon/);
      assert.doesNotMatch(calls(tempDir), /args=build /);
      assert.equal(existsSync(path.join(tempDir, "rehearsal")), false);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  },
);

test(
  "phase daemon differing from verification requires a verified transfer before qualification",
  { skip: !bashAvailable && "bash is required for the shell harness checks" },
  () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "ornigami-rehearsal-transfer-"));
    try {
      const tools = setupTools(tempDir);
      const env = { ...baseEnv(tempDir, tools), PHASE_CONTEXT: "phase" };
      env.STUB_DAEMON_MAP = writeDaemonMap(tempDir, {
        build: "daemon-build",
        verify: "daemon-verify",
        phase: "daemon-phase",
      });
      const checkpoint = runRehearsal(env, "checkpoint");
      assert.equal(checkpoint.status, 0, `${checkpoint.stdout}\n${checkpoint.stderr}`);
      const checkpointJson = JSON.parse(readFileSync(path.join(tempDir, "rehearsal", "checkpoint.json"), "utf8"));
      assert.equal(checkpointJson.phase.transferRequired, true);
      assert.ok(existsSync(path.join(tempDir, "rehearsal", "phase-archive-verification", "archive-verification.json")));
      const callLog = calls(tempDir);
      assert.match(callLog, /daemon=verify .*args=load /);
      assert.match(callLog, /daemon=phase .*args=load /);

      writeEdge(path.join(tempDir, "state", "phase"));
      const resumed = runRehearsal({ ...env, ...edgeEnv(tempDir) }, "qualify");
      assert.equal(resumed.status, 0, `${resumed.stdout}\n${resumed.stderr}`);
      const qualificationEnv = JSON.parse(
        readFileSync(path.join(tempDir, "rehearsal", "qualification-attempt-1", "qualification-env.json"), "utf8"),
      );
      assert.equal(qualificationEnv.dockerContext, "phase");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  },
);

test(
  "wrong or missing edge image fails resume without a complete result",
  { skip: !bashAvailable && "bash is required for the shell harness checks" },
  () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "ornigami-rehearsal-edge-"));
    try {
      const tools = setupTools(tempDir);
      const env = baseEnv(tempDir, tools);
      env.STUB_DAEMON_MAP = writeDaemonMap(tempDir, { build: "daemon-build", verify: "daemon-verify" });
      assert.equal(runRehearsal(env, "checkpoint").status, 0);

      let resumed = runRehearsal({ ...env, ...edgeEnv(tempDir) }, "qualify");
      assert.notEqual(resumed.status, 0, "missing edge must fail");
      assert.match(`${resumed.stdout}\n${resumed.stderr}`, /edge app container is missing/);
      assert.equal(existsSync(path.join(tempDir, "rehearsal", "REHEARSAL_COMPLETE.txt")), false);
      assert.equal(existsSync(path.join(tempDir, "rehearsal", "qualification-attempt-1")), false);

      writeEdge(path.join(tempDir, "state", "verify"), { image: otherImageId });
      resumed = runRehearsal({ ...env, ...edgeEnv(tempDir) }, "qualify");
      assert.notEqual(resumed.status, 0, "wrong edge image must fail");
      assert.match(`${resumed.stdout}\n${resumed.stderr}`, /edge app container image mismatch/);
      assert.equal(existsSync(path.join(tempDir, "rehearsal", "REHEARSAL_COMPLETE.txt")), false);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  },
);

test(
  "interrupted resume preserves evidence and a later resume uses a new attempt",
  { skip: !bashAvailable && "bash is required for the shell harness checks" },
  () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "ornigami-rehearsal-interrupt-"));
    try {
      const tools = setupTools(tempDir);
      const env = baseEnv(tempDir, tools);
      env.STUB_DAEMON_MAP = writeDaemonMap(tempDir, { build: "daemon-build", verify: "daemon-verify" });
      assert.equal(runRehearsal(env, "checkpoint").status, 0);
      writeEdge(path.join(tempDir, "state", "verify"));

      let resumed = runRehearsal({ ...env, ...edgeEnv(tempDir), STUB_QUAL_FAIL: "1" }, "qualify");
      assert.notEqual(resumed.status, 0, "interrupted qualification must fail");
      assert.ok(existsSync(path.join(tempDir, "rehearsal", "qualification-attempt-1", "PARTIAL.txt")));
      assert.equal(existsSync(path.join(tempDir, "rehearsal", "REHEARSAL_COMPLETE.txt")), false);

      resumed = runRehearsal({ ...env, ...edgeEnv(tempDir) }, "qualify");
      assert.equal(resumed.status, 0, `${resumed.stdout}\n${resumed.stderr}`);
      assert.ok(existsSync(path.join(tempDir, "rehearsal", "qualification-attempt-1", "PARTIAL.txt")));
      assert.ok(existsSync(path.join(tempDir, "rehearsal", "qualification-attempt-2", "existing-image-qualification.json")));
      assert.equal(JSON.parse(readFileSync(path.join(tempDir, "rehearsal", "resume-attempt-1.json"), "utf8")).status, "failed");
      assert.equal(JSON.parse(readFileSync(path.join(tempDir, "rehearsal", "resume-attempt-2.json"), "utf8")).status, "complete");
      assert.equal((calls(tempDir).match(/args=build /g) ?? []).length, 1);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  },
);

test(
  "resume rejects changed source, origin and daemon inputs without a second build",
  { skip: !bashAvailable && "bash is required for the shell harness checks" },
  () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "ornigami-rehearsal-changed-"));
    try {
      const tools = setupTools(tempDir);
      const env = baseEnv(tempDir, tools);
      env.STUB_DAEMON_MAP = writeDaemonMap(tempDir, { build: "daemon-build", verify: "daemon-verify" });
      assert.equal(runRehearsal(env, "checkpoint").status, 0);
      writeEdge(path.join(tempDir, "state", "verify"));

      const cases = [
        { SOURCE_SHA: "e".repeat(40) },
        { APP_URL: "https://unexpected.ornigami.test" },
        { PHASE_CONTEXT: "other-phase" },
        { BUILD_ENGINE_BIN: `${tools.engine}-other` },
      ];
      for (const change of cases) {
        const resumed = runRehearsal({ ...env, ...edgeEnv(tempDir), ...change }, "qualify");
        assert.notEqual(resumed.status, 0, JSON.stringify(change));
        assert.match(`${resumed.stdout}\n${resumed.stderr}`, /resume input changed|HEAD does not equal HARNESS_SHA/);
      }
      assert.equal(existsSync(path.join(tempDir, "rehearsal", "REHEARSAL_COMPLETE.txt")), false);
      assert.equal((calls(tempDir).match(/args=build /g) ?? []).length, 1);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  },
);
