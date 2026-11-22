import assert from "node:assert/strict";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

// Executable regression for the builder -> candidate-test environment boundary.
// It runs the real run-candidate-gates.sh helper with fake node/PG executables,
// so it observes the environment actually handed to the test subprocess rather
// than matching shell text.

const root = process.cwd();
const helper = "deploy/builder/private-staging/run-candidate-gates.sh";

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

function makeExecutable(file, body) {
  writeFileSync(file, body, { mode: 0o755 });
  chmodSync(file, 0o755);
}

function fixture() {
  const dir = mkdtempSync(path.join(os.tmpdir(), "ornigami-gate-boundary-"));
  const source = path.join(dir, "source");
  const tests = path.join(source, "tests");
  const nodeModules = path.join(source, "node_modules");
  const fakeBin = path.join(dir, "bin");
  const pg = path.join(dir, "pg");
  for (const directory of [
    tests,
    path.join(nodeModules, "typescript", "bin"),
    path.join(nodeModules, "eslint", "bin"),
    fakeBin,
    pg,
  ]) {
    mkdirSync(directory, { recursive: true, mode: 0o755 });
    chmodSync(directory, 0o755);
  }
  writeFileSync(path.join(tests, "a.test.mjs"), "// synthetic\n");
  writeFileSync(path.join(tests, "b.test.mts"), "// synthetic\n");
  writeFileSync(path.join(tests, "not-a-test.txt"), "ignored\n");
  const npmCli = path.join(dir, "npm-cli.js");
  writeFileSync(npmCli, "// synthetic npm cli\n");
  makeExecutable(path.join(pg, "initdb"), "#!/usr/bin/env bash\nexit 0\n");
  makeExecutable(path.join(pg, "postgres"), "#!/usr/bin/env bash\nexit 0\n");

  const calls = path.join(dir, "calls.jsonl");
  const fakeNode = path.join(fakeBin, "node");
  makeExecutable(fakeNode, `#!/usr/bin/env bash
set -euo pipefail
{
  printf 'ARGV'
  for arg in "$@"; do printf '\\t%s' "$arg"; done
  printf '\\tENV\\t%s\\t%s\\t%s\\t%s\\t%s\\t%s\\t%s\\t%s\\t%s\\n' \\
    "\${A04_PG_BIN:-}" "\${PG_BIN:-}" "\${BUILD_ENDPOINT:-}" "\${BUILD_CONTEXT:-}" \\
    "\${SOURCE_SHA:-}" "\${HARNESS_SHA:-}" "\${STAGING_ORIGIN:-}" "\${NODE_OPTIONS:-}" \\
    "\${BUILDER_RUNTIME_STORE_HOST_ID:-}"
} >> "\${FAKE_NODE_LOG:?}"
exit 0
`);
  return { dir, source, pg, npmCli, fakeBin, calls };
}

function contaminatedEnv(f, overrides = {}) {
  return {
    ...process.env,
    FAKE_NODE_LOG: f.calls,
    NODE_BIN: path.join(f.fakeBin, "node"),
    NPM_CLI_FOR_REHEARSAL: f.npmCli,
    SOURCE_ROOT: f.source,
    A04_PG_BIN: f.pg,
    PG_BIN: f.pg,
    BUILD_ENDPOINT: "tcp://127.0.0.1:2375",
    BUILD_CONTEXT: "default",
    VERIFY_ENDPOINT: "unix:///verify.sock",
    PHASE_ENDPOINT: "unix:///phase.sock",
    BUILD_ENGINE: "docker",
    REHEARSAL_DIR: path.join(f.dir, "rehearsal"),
    ACTION: "checkpoint",
    SOURCE_SHA: "a".repeat(40),
    HARNESS_SHA: "b".repeat(40),
    WORKFLOW_SHA: "c".repeat(40),
    STAGING_ORIGIN: "https://builder-rehearsal.invalid",
    STAGING_HOST: "builder-rehearsal.invalid",
    DOCKER_HOST_ENDPOINT: "unix:///var/run/docker.sock",
    BUILDER_RUNTIME_STORE_HOST_ID: "ornigami-builder-rehearsal-store-v1",
    NODE_OPTIONS: "--max-old-space-size=256",
    ...overrides,
  };
}

function runWrapper(f, env) {
  const parentLog = path.join(f.dir, "parent-after.txt");
  const script = `
set +e
SOURCE_ROOT="$SOURCE_ROOT" \
NPM_CLI_FOR_REHEARSAL="$NPM_CLI_FOR_REHEARSAL" \
NODE_BIN="$NODE_BIN" \
A04_PG_BIN="$A04_PG_BIN" \
PG_BIN="$PG_BIN" \
  bash ${JSON.stringify(helper)}
rc=$?
{
  printf 'parent_build_endpoint=%s\\n' "\${BUILD_ENDPOINT:-}"
  printf 'parent_source_sha=%s\\n' "\${SOURCE_SHA:-}"
  printf 'parent_staging_origin=%s\\n' "\${STAGING_ORIGIN:-}"
  printf 'parent_harness_sha=%s\\n' "\${HARNESS_SHA:-}"
} > ${JSON.stringify(parentLog)}
exit "$rc"
`;
  const result = spawnSync(bash, ["-c", script], {
    cwd: root,
    encoding: "utf8",
    env,
    maxBuffer: 16 * 1024 * 1024,
  });
  return { result, parentLog };
}

function readCalls(file) {
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const parts = line.split("\t");
      const envIndex = parts.indexOf("ENV");
      const argv = parts.slice(1, envIndex);
      const [A04_PG_BIN, PG_BIN, BUILD_ENDPOINT, BUILD_CONTEXT, SOURCE_SHA, HARNESS_SHA, STAGING_ORIGIN, NODE_OPTIONS, BUILDER_RUNTIME_STORE_HOST_ID] =
        parts.slice(envIndex + 1);
      return {
        argv,
        env: { A04_PG_BIN, PG_BIN, BUILD_ENDPOINT, BUILD_CONTEXT, SOURCE_SHA, HARNESS_SHA, STAGING_ORIGIN, NODE_OPTIONS, BUILDER_RUNTIME_STORE_HOST_ID },
      };
    });
}

test("candidate gate hands tests an isolated environment and preserves PG/toolchain values", { skip: !bashAvailable && "bash is required" }, () => {
  const f = fixture();
  try {
    const { result, parentLog } = runWrapper(f, contaminatedEnv(f));
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(result.stderr, /candidate_gate_pg_bin=/);
    assert.match(result.stderr, /candidate_gate_initdb=/);
    assert.match(result.stderr, /candidate_gate_postgres=/);
    assert.match(result.stderr, /candidate_gate_test_count=2/);
    assert.match(result.stderr, /candidate_gate_rehearsal_selectors_cleared=true/);
    assert.match(result.stdout, /candidate_gate_status=pass/);

    const calls = readCalls(f.calls);
    assert.equal(calls.length, 6, JSON.stringify(calls.map((call) => call.argv)));
    const testCall = calls.find((call) => call.argv.includes("--test"));
    assert.ok(testCall, "test invocation was not observed");
    assert.ok(testCall.argv.includes("--test-concurrency=1"));
    assert.ok(testCall.argv.includes("tests/a.test.mjs"));
    assert.ok(testCall.argv.includes("tests/b.test.mts"));
    assert.equal(testCall.argv.includes("tests/not-a-test.txt"), false);

    assert.equal(testCall.env.A04_PG_BIN, f.pg);
    assert.equal(testCall.env.PG_BIN, f.pg);
    assert.equal(testCall.env.NODE_OPTIONS, "--max-old-space-size=256");
    for (const key of ["BUILD_ENDPOINT", "BUILD_CONTEXT", "SOURCE_SHA", "HARNESS_SHA", "STAGING_ORIGIN", "BUILDER_RUNTIME_STORE_HOST_ID"]) {
      assert.equal(testCall.env[key], "", `${key} leaked into the test subprocess`);
    }

    const parent = readFileSync(parentLog, "utf8");
    assert.match(parent, /parent_build_endpoint=tcp:\/\/127\.0\.0\.1:2375/);
    assert.match(parent, new RegExp(`parent_source_sha=${"a".repeat(40)}`));
    assert.match(parent, /parent_staging_origin=https:\/\/builder-rehearsal\.invalid/);
    assert.match(parent, new RegExp(`parent_harness_sha=${"b".repeat(40)}`));
  } finally {
    rmSync(f.dir, { recursive: true, force: true });
  }
});

test("candidate gate fails early when PostgreSQL executables are unavailable", { skip: !bashAvailable && "bash is required" }, () => {
  const f = fixture();
  try {
    rmSync(path.join(f.pg, "postgres"), { force: true });
    const { result } = runWrapper(f, contaminatedEnv(f));
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}\n${result.stderr}`, /does not contain executable postgres/);
    assert.equal(existsSync(f.calls), false, "no candidate command should run without PostgreSQL");
  } finally {
    rmSync(f.dir, { recursive: true, force: true });
  }

  const missing = fixture();
  try {
    const { result } = runWrapper(missing, contaminatedEnv(missing, { A04_PG_BIN: "" }));
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}\n${result.stderr}`, /A04_PG_BIN is required/);
    assert.equal(existsSync(missing.calls), false);
  } finally {
    rmSync(missing.dir, { recursive: true, force: true });
  }
});
