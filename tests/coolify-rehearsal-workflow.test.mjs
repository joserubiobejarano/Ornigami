import assert from "node:assert/strict";
import { createHash as createHashImpl } from "node:crypto";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const workflowPath = join(repositoryRoot, ".github", "workflows", "ornigami-image-rehearsal.yml");
const workflow = readFileSync(workflowPath, "utf8");

function runBlock(id) {
  const lines = workflow.split(/\r?\n/);
  const idLine = lines.findIndex((line) => line === `        id: ${id}`);
  assert.notEqual(idLine, -1, `workflow step ${id} must exist`);
  let stepStart = idLine;
  while (stepStart >= 0 && !/^      - name: /.test(lines[stepStart])) stepStart -= 1;
  assert.notEqual(stepStart, -1, `workflow step ${id} must have a name`);
  let stepEnd = idLine + 1;
  while (stepEnd < lines.length && !/^      - (?:name|uses): /.test(lines[stepEnd])) stepEnd += 1;
  const runLine = lines.findIndex((line, index) => index > idLine && index < stepEnd && line === "        run: |");
  assert.notEqual(runLine, -1, `workflow step ${id} must have a block run script`);
  return `${lines.slice(runLine + 1, stepEnd).map((line) => line.startsWith("          ") ? line.slice(10) : line).join("\n").replace(/\n+$/, "")}\n`;
}

function bashPath() {
  const candidates = process.platform === "win32"
    ? [join(process.env.ProgramFiles ?? "C:\\Program Files", "Git", "bin", "bash.exe"), "bash"]
    : ["bash"];
  for (const candidate of candidates) {
    const result = spawnSync(candidate, ["--version"], { encoding: "utf8", windowsHide: true });
    if (result.status === 0) return candidate;
  }
  throw new Error("Bash is required for the local workflow harness test");
}

const bash = bashPath();

function withSandbox(callback) {
  const root = mkdtempSync(join(tmpdir(), "ornigami-rehearsal-workflow-"));
  try {
    return callback(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function writeExecutable(path, source) {
  writeFileSync(path, source, "utf8");
  chmodSync(path, 0o755);
}

function runShell(root, script, env) {
  const scriptPath = join(root, "step.sh");
  writeFileSync(scriptPath, script, "utf8");
  const syntax = spawnSync(bash, ["-n", scriptPath], { encoding: "utf8", windowsHide: true, env });
  assert.equal(syntax.status, 0, syntax.stderr || "workflow shell syntax failed");
  return spawnSync(bash, [scriptPath], { encoding: "utf8", windowsHide: true, env, timeout: 20_000 });
}

function fakeDocker(root) {
  const bin = join(root, "fake-bin");
  mkdirSync(bin, { recursive: true });
  const source = `#!/usr/bin/env bash
set -euo pipefail
printf '<%s>' "$@" >> "$FAKE_DOCKER_LOG"
printf '\\n' >> "$FAKE_DOCKER_LOG"
command_name=\${1:-}
shift || true
case "$command_name" in
  buildx)
    subcommand=\${1:-}; shift || true
    case "$subcommand" in
      ls) ;;
      create) printf 'created builder\\n' ;;
      *) printf 'unexpected fake buildx call: %s\\n' "$subcommand" >&2; exit 91 ;;
    esac
    ;;
  system)
    printf 'TYPE TOTAL ACTIVE SIZE RECLAIMABLE\\n'
    ;;
  inspect)
    target=\${1:-}; shift || true
    [[ \${1:-} == --format ]] && format=\${2:-} || format=''
    case "$format" in
      '{{.Id}}') if [[ "$target" == "$FAKE_BUILDER_ID" ]]; then printf '%s\\n' "$FAKE_INSPECTED_BUILDER_ID"; else printf '%s\\n' "$FAKE_INSPECTED_IMAGE_ID"; fi ;;
      '{{.Name}}') printf '%s\\n' "$FAKE_INSPECTED_BUILDER_NAME" ;;
      '{{.State.Running}}') printf '%s\\n' "$FAKE_BUILDER_RUNNING" ;;
      *) printf '%s\\n' "$FAKE_STATE_VOLUME" ;;
    esac
    ;;
  exec)
    printf '==memory.max==\\n805306368\\n==memory.swap.max==\\n0\\n==memory.peak==\\n1000000\\n==memory.events==\\nlow 0\\nhigh 0\\nmax 0\\noom 0\\noom_kill 0\\n==cpu.max==\\n75000 100000\\n==cpu.stat==\\nusage_usec 1\\nuser_usec 1\\nsystem_usec 0\\n'
    ;;
  ps)
    if [[ -n \${FAKE_PS_CONTAINER_ID:-} ]]; then printf '%s\\n' "$FAKE_PS_CONTAINER_ID"; fi
    ;;
  volume)
    subcommand=\${1:-}; shift || true
    if [[ "$subcommand" == inspect ]]; then printf '%s\\n' "$FAKE_STATE_VOLUME"; fi
    if [[ "$subcommand" == ls && \${FAKE_EXISTING_VOLUME:-0} == 1 ]]; then printf '%s\\n' "$FAKE_STATE_VOLUME"; fi
    ;;
  rm)
    ;;
  image)
    subcommand=\${1:-}; shift || true
    if [[ "$subcommand" == inspect ]]; then printf '%s\\n' "$FAKE_INSPECTED_IMAGE_ID"; fi
    ;;
  *)
    printf 'unexpected fake docker call: %s\\n' "$command_name" >&2
    exit 90
    ;;
esac
`;
  const path = join(bin, "docker");
  writeExecutable(path, source);
  return { bin, path };
}

function fakeEnvironment(root, overrides = {}) {
  const docker = fakeDocker(root);
  const runnerTemp = join(root, "runner-temp");
  mkdirSync(runnerTemp, { recursive: true });
  const summary = join(root, "summary.md");
  writeFileSync(summary, "fake workflow summary\n");
  const env = {
    ...process.env,
    PATH: `${docker.bin}${delimiter}${process.env.PATH ?? ""}`,
    FAKE_DOCKER_LOG: join(root, "docker.log"),
    FAKE_BUILDER_ID: "owned-builder-id",
    FAKE_INSPECTED_BUILDER_ID: "foreign-builder-id",
    FAKE_INSPECTED_BUILDER_NAME: "/buildx_buildkit_ornigami-external-rehearsal0",
    FAKE_BUILDER_RUNNING: "true",
    FAKE_STATE_VOLUME: "buildx_buildkit_ornigami-external-rehearsal0_state",
    FAKE_INSPECTED_IMAGE_ID: "foreign-image-id",
    RUNNER_TEMP: runnerTemp,
    GITHUB_STEP_SUMMARY: summary,
    ORNIGAMI_EVIDENCE_DIR: join(runnerTemp, "ornigami-evidence"),
    GITHUB_RUN_ID: "local-test-run",
    GITHUB_RUN_ATTEMPT: "1",
    GITHUB_SHA: "a".repeat(40),
    GITHUB_REF: "refs/heads/local-test",
    GITHUB_EVENT_NAME: "push",
    SOURCE_SHA: "b".repeat(40),
    EXPECTED_LOCK_SHA256: "c".repeat(64),
    ADMISSION_OUTCOME: "success",
    RUNNER_PREFLIGHT_OUTCOME: "success",
    BASE_SCAN_OUTCOME: "success",
    IMAGE_BUILD_OUTCOME: "success",
    IMAGE_BUILD_EXIT_CODE: "0",
    RUNTIME_OUTCOME: "success",
    RUNTIME_EXIT_CODE: "0",
    FINAL_SCAN_OUTCOME: "success",
    RESOURCE_OUTCOME: "success",
    BASE_GATE_OUTCOME: "success",
    OWNED_BUILDER_NAME: "ornigami-external-rehearsal",
    OWNED_BUILDER_CONTAINER_ID: "owned-builder-id",
    OWNED_BUILDER_STATE_VOLUME: "buildx_buildkit_ornigami-external-rehearsal0_state",
    OWNED_IMAGE_TAG: "ornigami:rehearsal-test",
    OWNED_IMAGE_ID: "owned-image-id",
    ...overrides,
  };
  return { env, runnerTemp, summary, dockerLog: env.FAKE_DOCKER_LOG };
}

function verifyManifest(evidenceDirectory) {
  const manifest = JSON.parse(readFileSync(join(evidenceDirectory, "manifest.json"), "utf8"));
  for (const item of manifest.files) {
    const path = join(evidenceDirectory, ...item.path.split("/"));
    const bytes = readFileSync(path);
    assert.equal(bytes.byteLength, item.bytes, `manifest byte count for ${item.path}`);
    assert.equal(createHash(bytes), item.sha256, `manifest SHA-256 for ${item.path}`);
  }
  assert.equal(manifest.runtime_evidence_status, "collected");
  assert.equal(manifest.image_build_exit_code, "0");
  assert.equal(manifest.runtime_exit_code, "0");
  assert.ok(!manifest.files.some((item) => item.path.includes("image.tar")));
  assert.ok(!manifest.files.some((item) => /\.raw$/.test(item.path)));
  assert.ok(!manifest.files.some((item) => /(?:stderr|container-logs)\.raw/.test(item.path)));
  assert.ok(!manifest.files.some((item) => item.path.startsWith("../")));
  assert.ok(!existsSync(join(evidenceDirectory, "ornigami-image.tar")));
  return manifest;
}

function createHash(bytes) {
  return createHashImpl("sha256").update(bytes).digest("hex");
}

test("evidence capture retains a hashed safe bundle and fails if an attempted runtime has no structured receipt", () => {
  withSandbox((root) => {
    const { env, runnerTemp } = fakeEnvironment(root, { RUNTIME_OUTCOME: "failure", RUNTIME_EXIT_CODE: "1" });
    const evidence = env.ORNIGAMI_EVIDENCE_DIR;
    mkdirSync(join(evidence, "runtime"), { recursive: true });
    writeFileSync(join(runnerTemp, "base-trivy.json"), "base report fixture\n");
    writeFileSync(join(runnerTemp, "trivy.json"), "final report fixture\n");
    writeFileSync(join(runnerTemp, "ornigami-image.tar"), "image archive sentinel; must never enter artifact");
    writeFileSync(join(runnerTemp, "runtime-acceptance.log"), "runtime harness failed before receipt\n");
    const result = runShell(root, runBlock("evidence_capture"), env);
    assert.equal(result.status, 1, result.stderr);
    const status = readFileSync(join(evidence, "runtime", "runtime-evidence-status.txt"), "utf8");
    assert.match(status, /status=missing/);
    assert.ok(existsSync(join(evidence, "manifest.json")), "failure must still produce a manifest for upload");
  });
});

test("success evidence capture hashes scan/runtime receipts and excludes the image archive", () => {
  withSandbox((root) => {
    const { env, runnerTemp } = fakeEnvironment(root);
    const evidence = env.ORNIGAMI_EVIDENCE_DIR;
    mkdirSync(join(evidence, "runtime"), { recursive: true });
    writeFileSync(join(runnerTemp, "base-trivy.json"), "base report fixture\n");
    writeFileSync(join(runnerTemp, "trivy.json"), "final report fixture\n");
    writeFileSync(join(runnerTemp, "ornigami-image.tar"), "image archive sentinel; must never enter artifact");
    writeFileSync(join(runnerTemp, "runtime-acceptance.log"), "runtime passed\n");
    writeFileSync(join(runnerTemp, "stderr.raw"), "raw diagnostic sentinel; must never enter artifact");
    writeFileSync(join(runnerTemp, "container-logs.raw"), "raw log sentinel; must never enter artifact");
    writeFileSync(join(evidence, "runtime", "runtime-http.json"), JSON.stringify({ schemaVersion: 1, result: "passed", exitStatus: 0, httpObservations: [] }));
    const result = runShell(root, runBlock("evidence_capture"), env);
    assert.equal(result.status, 0, result.stderr);
    verifyManifest(evidence);
    assert.ok(existsSync(join(evidence, "scans", "base-trivy.json")));
    assert.ok(existsSync(join(evidence, "scans", "trivy.json")));
    assert.ok(existsSync(join(evidence, "runtime", "runtime-http.json")));
  });
});

test("builder creation refuses a pre-existing state volume before creating or claiming resources", () => {
  withSandbox((root) => {
    const { env, dockerLog } = fakeEnvironment(root, { FAKE_EXISTING_VOLUME: "1" });
    const output = join(root, "github-output.txt");
    env.GITHUB_OUTPUT = output;
    const result = runShell(root, runBlock("buildkit"), env);
    assert.notEqual(result.status, 0, result.stdout);
    const calls = readFileSync(dockerLog, "utf8");
    assert.match(calls, /<volume><ls><--format><\{\{\.Name\}\}>/);
    assert.doesNotMatch(calls, /<buildx><create>/);
    assert.doesNotMatch(calls, /<rm>|<volume><rm>/);
    assert.ok(!existsSync(output) || readFileSync(output, "utf8") === "", "must not emit ownership outputs");
  });
});

test("builder creation does not claim a similarly named foreign container", () => {
  withSandbox((root) => {
    const { env, dockerLog } = fakeEnvironment(root, {
      FAKE_EXISTING_VOLUME: "0",
      FAKE_PS_CONTAINER_ID: "foreign-similar-id",
      FAKE_INSPECTED_BUILDER_NAME: "/buildx_buildkit_ornigami-external-rehearsal0-foreign",
    });
    const output = join(root, "github-output.txt");
    env.GITHUB_OUTPUT = output;
    const result = runShell(root, runBlock("buildkit"), env);
    assert.notEqual(result.status, 0, result.stdout);
    const calls = readFileSync(dockerLog, "utf8");
    assert.match(calls, /<buildx><create>/);
    assert.match(calls, /<ps><--no-trunc><--filter><name=\^\/buildx_buildkit_ornigami-external-rehearsal0\$>/);
    assert.match(calls, /<inspect><foreign-similar-id><--format><\{\{\.Name\}\}>/);
    assert.ok(!existsSync(output) || readFileSync(output, "utf8") === "", "must not emit ownership outputs");
    assert.doesNotMatch(calls, /<rm>|<volume><rm>/);
  });
});

test("builder creation uses anchored exact-name and state-volume checks", () => {
  const script = runBlock("buildkit");
  assert.match(script, /grep -Fxq "\$builder_state_volume"/);
  assert.match(script, /--filter "name=\^\/buildx_buildkit_\$\{builder\}0\$"/);
  assert.match(script, /\[\[ "\$container_name" == "\/buildx_buildkit_\$\{builder\}0" \]\]/);
  assert.match(script, /\[\[ "\$state_volume" == "\$builder_state_volume"/);
});

test("cleanup preserves foreign builder, state volume, and image IDs", () => {
  withSandbox((root) => {
    const { env, dockerLog, runnerTemp } = fakeEnvironment(root);
    writeFileSync(join(runnerTemp, "ornigami-image.tar"), "local-only archive");
    const result = runShell(root, runBlock("cleanup"), env);
    assert.equal(result.status, 0, result.stderr);
    const log = readFileSync(dockerLog, "utf8");
    assert.doesNotMatch(log, /<rm><-f><owned-builder-id>/);
    assert.doesNotMatch(log, /<volume><rm><buildx_buildkit_ornigami-external-rehearsal0_state>/);
    assert.doesNotMatch(log, /<image><rm><ornigami:rehearsal-test>/);
    assert.doesNotMatch(log, /<buildx><rm>/);
  });
});

test("cleanup removes only exact owned builder, unattached state volume, and matching image ID", () => {
  withSandbox((root) => {
    const { env, dockerLog, runnerTemp } = fakeEnvironment(root, {
      FAKE_INSPECTED_BUILDER_ID: "owned-builder-id",
      FAKE_INSPECTED_IMAGE_ID: "owned-image-id",
    });
    writeFileSync(join(runnerTemp, "ornigami-image.tar"), "local-only archive");
    const result = runShell(root, runBlock("cleanup"), env);
    assert.equal(result.status, 0, result.stderr);
    const log = readFileSync(dockerLog, "utf8");
    assert.match(log, /<rm><-f><owned-builder-id>/);
    assert.match(log, /<volume><rm><buildx_buildkit_ornigami-external-rehearsal0_state>/);
    assert.match(log, /<image><rm><ornigami:rehearsal-test>/);
    assert.doesNotMatch(log, /<buildx><rm>/);
  });
});
