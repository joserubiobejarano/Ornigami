import assert from "node:assert/strict";
import { createHash as createHashImpl } from "node:crypto";
import { spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
      build) printf 'build stdout fixture\\n'; printf 'build stderr fixture\\n' >&2; exit "\${FAKE_BUILD_EXIT:-17}" ;;
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
  const stepSummary = join(root, "step-local-summary.md");
  writeFileSync(stepSummary, "");
  const sourceDir=join(runnerTemp,"source/scripts/framework-prototype");mkdirSync(sourceDir,{recursive:true});for(const name of ["serial-scan-driver.mjs","scan-image-stages.mjs","validate-build-observation.mjs"])copyFileSync(join(repositoryRoot,"scripts/framework-prototype",name),join(sourceDir,name));
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
    GITHUB_STEP_SUMMARY: stepSummary,
    ORNIGAMI_JOB_SUMMARY: summary,
    ORNIGAMI_EVIDENCE_DIR: join(runnerTemp, "ornigami-evidence"),
    GITHUB_RUN_ID: "local-test-run",
    GITHUB_RUN_ATTEMPT: "1",
    GITHUB_SHA: "a".repeat(40),
    GITHUB_REF: "refs/heads/local-test",
    GITHUB_EVENT_NAME: "push",
    SOURCE_SHA: "b".repeat(40),
    ORNIGAMI_WORK_DEADLINE_EPOCH: String(Math.floor(Date.now()/1000)+1440),
    EXPECTED_OBSERVED_BUILDER_ID: 'a'.repeat(64),
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
  assert.equal(manifest.capture_completeness_status, "passed");
  assert.equal(manifest.custody_status, "not-assessed-by-capture");
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

test('initialization exports a persistent summary path rather than a step-local summary', () => withSandbox(root => {
  const { env } = fakeEnvironment(root); env.GITHUB_ENV = join(root, 'github-env.txt');
  // NTFS/Git Bash install cannot enforce Linux modes. Verify the exact requested
  // mode, then model directory creation only on Windows; Linux uses real install.
  const windowsInstall = process.platform === 'win32' ? `install() { [[ "$1" == -d && "$2" == -m && "$3" == 700 ]] || return 97; printf '%s\\n' "$*" > "$RUNNER_TEMP/install-arguments.txt"; shift 3; mkdir -p -- "$@"; }\n` : '';
  const result = runShell(root, windowsInstall + runBlock('evidence_initialize'), env);
  assert.equal(result.status, 0, result.stderr);
  if (process.platform === 'win32') assert.match(readFileSync(join(env.RUNNER_TEMP, 'install-arguments.txt'), 'utf8'), /^-d -m 700 /);
  assert.match(readFileSync(env.GITHUB_ENV, 'utf8'), /ORNIGAMI_JOB_SUMMARY=.*ornigami-job-summary.md/);
  assert.match(readFileSync(join(env.RUNNER_TEMP, 'ornigami-job-summary.md'), 'utf8'), /Ornigami diagnostic evidence/);
  assert.equal(readFileSync(env.GITHUB_STEP_SUMMARY, 'utf8'), '');
}));

test('failed initialization with neither exported path still retains a failed capture manifest', () => withSandbox(root => {
  const { env } = fakeEnvironment(root, { RUNTIME_OUTCOME:'skipped', IMAGE_BUILD_OUTCOME:'skipped', ADMISSION_OUTCOME:'skipped' });
  delete env.ORNIGAMI_EVIDENCE_DIR; delete env.ORNIGAMI_JOB_SUMMARY;
  const result = runShell(root, runBlock('evidence_capture'), env);
  assert.equal(result.status, 1, result.stderr);
  const evidence = join(env.RUNNER_TEMP,'ornigami-evidence');
  const manifest = JSON.parse(readFileSync(join(evidence,'manifest.json'),'utf8'));
  assert.equal(manifest.capture_completeness_status,'failed'); assert.equal(manifest.runtime_evidence_status,'not-run');
  assert.match(readFileSync(join(evidence,'step-summary.md'),'utf8'),/Incomplete evidence capture/);
}));

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
    for (const file of ["runtime-first-cgroup.txt", "runtime-after-restart-cgroup.txt", "runtime-after-recreate-cgroup.txt"]) {
      writeFileSync(join(evidence, "runtime", file), counters());
    }
    writeFileSync(join(evidence,"runtime/native-image-formats.json"),JSON.stringify({result:"passed"}));
    const result = runShell(root, runBlock("evidence_capture"), env);
    assert.equal(result.status, 0, result.stderr);
    verifyManifest(evidence);
    assert.ok(existsSync(join(evidence, "scans", "base-trivy.json")));
    assert.ok(existsSync(join(evidence, "scans", "trivy.json")));
    assert.ok(existsSync(join(evidence, "runtime", "runtime-http.json")));
    assert.equal(readFileSync(join(evidence, "step-summary.md"), "utf8"), "fake workflow summary\n");
    assert.equal(readFileSync(env.GITHUB_STEP_SUMMARY, "utf8"), "fake workflow summary\n");
    assert.equal(JSON.parse(readFileSync(join(evidence, "manifest.json"), "utf8")).summary_evidence_status, "collected");
  });
});

test("cold failure before runtime creates every directory and a complete skipped-stage manifest", () => {
  withSandbox(root => {
    const {env}=fakeEnvironment(root,{IMAGE_BUILD_OUTCOME:'failure',IMAGE_BUILD_EXIT_CODE:'17',RUNTIME_OUTCOME:'skipped',RUNTIME_EXIT_CODE:'',FINAL_SCAN_OUTCOME:'skipped',FRAMEWORK_BROWSER_OUTCOME:'skipped'});
    assert.ok(!existsSync(env.ORNIGAMI_EVIDENCE_DIR));
    const result=runShell(root,runBlock('evidence_capture'),env);
    assert.equal(result.status,0,result.stderr);
    const manifest=JSON.parse(readFileSync(join(env.ORNIGAMI_EVIDENCE_DIR,'manifest.json'),'utf8'));
    assert.equal(manifest.runtime_evidence_status,'not-run');
    assert.equal(manifest.image_build_exit_code,'17');
    assert.equal(manifest.framework_browser_outcome,'skipped');
    assert.equal(manifest.capture_completeness_status,'passed');
    assert.ok(readFileSync(join(env.ORNIGAMI_EVIDENCE_DIR,'step-summary.md'),'utf8').length>0);
    for(const file of manifest.files)assert.equal(createHash(readFileSync(join(env.ORNIGAMI_EVIDENCE_DIR,file.path))),file.sha256);
    assert.ok(existsSync(join(env.ORNIGAMI_EVIDENCE_DIR,'build/workflow-status.txt')));
    assert.ok(existsSync(join(env.ORNIGAMI_EVIDENCE_DIR,'browser/workflow-status.txt')));
    assert.ok(existsSync(join(env.ORNIGAMI_EVIDENCE_DIR,'runner/pre-cleanup-usage.txt')));
  });
});

test("cold attempted-runtime failure retains manifest and fails without structured assertions",()=>{
  withSandbox(root=>{
    const {env}=fakeEnvironment(root,{RUNTIME_OUTCOME:'failure',RUNTIME_EXIT_CODE:'23'});
    const result=runShell(root,runBlock('evidence_capture'),env);
    assert.equal(result.status,1,result.stderr);
    const manifest=JSON.parse(readFileSync(join(env.ORNIGAMI_EVIDENCE_DIR,'manifest.json'),'utf8'));
    assert.equal(manifest.runtime_evidence_status,'missing');
    assert.equal(manifest.runtime_exit_code,'23');
    assert.match(readFileSync(join(env.ORNIGAMI_EVIDENCE_DIR,'runtime/runtime-evidence-status.txt'),'utf8'),/exit_code=23/);
  });
});

test("failed build retains combined stdout/stderr and exact exit before runtime exists",()=>{
  withSandbox(root=>{
    const {env}=fakeEnvironment(root,{FAKE_BUILD_EXIT:'17',BUILDKIT_CONTAINER_ID:'owned-builder-id',BUILDKIT_CONTAINER_NAME:'ornigami-external-rehearsal'});
    env.GITHUB_OUTPUT=join(root,'outputs.txt');
    const result=runShell(root,runBlock('image_build'),env);
    assert.equal(result.status,1,result.stderr);
    const log=readFileSync(join(env.ORNIGAMI_EVIDENCE_DIR,'build/stdout.log'),'utf8');
    assert.match(log,/build stdout fixture/);assert.match(log,/build stderr fixture/);
    assert.match(readFileSync(join(env.ORNIGAMI_EVIDENCE_DIR,'build/exit-code.txt'),'utf8'),/docker_exit_code=17\nlog_exit_code=0/);
    assert.match(readFileSync(env.GITHUB_OUTPUT,'utf8'),/build_exit_code=17/);
  });
});

function counters({oom=0,cpu=1,peak=1000000}={}) {
  return `==memory.max==\n8589934592\n==memory.swap.max==\n0\n==memory.peak==\n${peak}\n==memory.events==\nlow 0\nhigh 0\nmax 0\noom ${oom}\noom_kill 0\noom_group_kill 0\n==cpu.max==\n300000 100000\n==cpu.stat==\nusage_usec ${cpu}\nuser_usec ${cpu}\nsystem_usec 0\n`;
}

function fixtureRuntime(root, env, { failure = false } = {}) {
  const harness = join(env.RUNNER_TEMP, 'source/deploy/coolify/linux-runtime-acceptance.sh');
  mkdirSync(resolve(harness, '..'), { recursive: true });
  writeFileSync(harness, `#!/usr/bin/env bash
set -euo pipefail
report_dir="$RUNNER_TEMP/ornigami-runtime-acceptance-fixture"
mkdir -p "$report_dir"
printf 'result=${failure ? 'failed' : 'passed'}\\n' > "$report_dir/report.txt"
printf '%s\\n' '{"schemaVersion":1,"result":"${failure ? 'failed' : 'passed'}","exitStatus":${failure ? 23 : 0},"assertions":${failure ? '["exact-fixture-assertion"]' : '[]'}}' > "$report_dir/runtime-http.json"
printf 'cold fixture counters\\n' > "$report_dir/runtime-first-cgroup.txt"
${failure ? `printf '%s\\n' '{"assertion":"exact-fixture-assertion","status":403,"exitStatus":23,"headers":{"x-frame-options":"DENY"},"body":"sanitized fictional body"}' > "$report_dir/failure.json"
printf 'exact-fixture-assertion; status=403; exit=23\\n' > "$report_dir/failure-evidence.txt"` : `printf 'restart fixture counters\\n' > "$report_dir/runtime-after-restart-cgroup.txt"
printf 'recreate fixture counters\\n' > "$report_dir/runtime-after-recreate-cgroup.txt"`}
printf 'final fixture counters\\n' > "$report_dir/runtime-final-cgroup.txt"
printf '{"result":"passed"}\\n' > "$report_dir/native-image-formats.json"
printf 'sanitized container log\\n' > "$report_dir/container-logs.txt"
printf 'report=%s/report.txt\\n' "$report_dir"
exit ${failure ? 23 : 0}
`);
  env.GITHUB_OUTPUT = join(root, 'outputs.txt');
}

test('runtime receipt copy uses qualified report paths despite a decoy glob in cwd', () => withSandbox(root => {
  const { env } = fakeEnvironment(root);
  fixtureRuntime(root, env);
  writeFileSync(join(env.RUNNER_TEMP, 'runtime-poison-cgroup.txt'), 'must not copy cwd decoy');
  const result = runShell(root, 'cd "$RUNNER_TEMP"\n' + runBlock('runtime_acceptance'), env);
  assert.equal(result.status, 0, result.stderr);
  const runtime = join(env.ORNIGAMI_EVIDENCE_DIR, 'runtime');
  for (const phase of ['first', 'after-restart', 'after-recreate', 'final']) assert.ok(existsSync(join(runtime, `runtime-${phase}-cgroup.txt`)));
  assert.ok(!existsSync(join(runtime, 'runtime-poison-cgroup.txt')));
  const captured = runShell(root, runBlock('evidence_capture'), env);
  assert.equal(captured.status, 0, captured.stderr);
  verifyManifest(env.ORNIGAMI_EVIDENCE_DIR);
}));

test('failed runtime preserves available snapshots, exact assertion/status/body/log/exit before manifest', () => withSandbox(root => {
  const { env } = fakeEnvironment(root, { RUNTIME_OUTCOME: 'failure', RUNTIME_EXIT_CODE: '23' });
  fixtureRuntime(root, env, { failure: true });
  const runtimeResult = runShell(root, runBlock('runtime_acceptance'), env);
  assert.equal(runtimeResult.status, 23, runtimeResult.stderr);
  const captured = runShell(root, runBlock('evidence_capture'), env);
  assert.equal(captured.status, 0, captured.stderr); // successful collection of a failed acceptance
  const runtime = join(env.ORNIGAMI_EVIDENCE_DIR, 'runtime');
  const diagnostic = JSON.parse(readFileSync(join(runtime, 'failure.json'), 'utf8'));
  assert.equal(diagnostic.assertion, 'exact-fixture-assertion'); assert.equal(diagnostic.status, 403); assert.equal(diagnostic.exitStatus, 23);
  assert.equal(diagnostic.headers['x-frame-options'], 'DENY'); assert.equal(diagnostic.body, 'sanitized fictional body');
  assert.match(readFileSync(join(runtime, 'container-logs.txt'), 'utf8'), /sanitized container log/);
  assert.match(readFileSync(join(runtime, 'snapshot-status.txt'), 'utf8'), /runtime-after-recreate-cgroup.txt=unavailable/);
  const manifest = JSON.parse(readFileSync(join(env.ORNIGAMI_EVIDENCE_DIR, 'manifest.json'), 'utf8'));
  assert.equal(manifest.runtime_outcome, 'failure'); assert.equal(manifest.runtime_exit_code, '23');
  assert.equal(manifest.capture_completeness_status, 'passed'); assert.equal(manifest.custody_status, 'not-assessed-by-capture');
  for (const f of manifest.files) assert.equal(createHash(readFileSync(join(env.ORNIGAMI_EVIDENCE_DIR, f.path))), f.sha256);
}));

test('successful runtime missing phase snapshots fails capture but retains its manifest', () => withSandbox(root => {
  const { env } = fakeEnvironment(root); const runtime = join(env.ORNIGAMI_EVIDENCE_DIR, 'runtime');
  mkdirSync(runtime, { recursive: true });
  writeFileSync(join(runtime, 'runtime-http.json'), '{"result":"passed"}');
  assert.equal(runShell(root, runBlock('evidence_capture'), env).status, 1);
  const manifest = JSON.parse(readFileSync(join(env.ORNIGAMI_EVIDENCE_DIR, 'manifest.json'), 'utf8'));
  assert.ok(manifest.runtime_snapshot_status.includes('runtime-after-restart-cgroup.txt=unavailable'));
}));

for (const missing of [false, true]) test(`skipped stages with ${missing ? 'missing' : 'empty'} persistent summary fail capture with nonempty diagnostic and manifest`, () => withSandbox(root => {
  const { env } = fakeEnvironment(root, { RUNTIME_OUTCOME: 'skipped', IMAGE_BUILD_OUTCOME: 'skipped' });
  if (missing) rmSync(env.ORNIGAMI_JOB_SUMMARY); else writeFileSync(env.ORNIGAMI_JOB_SUMMARY, '');
  const result = runShell(root, runBlock('evidence_capture'), env);
  assert.equal(result.status, 1, result.stderr);
  const manifest = JSON.parse(readFileSync(join(env.ORNIGAMI_EVIDENCE_DIR, 'manifest.json'), 'utf8'));
  assert.equal(manifest.summary_evidence_status, 'missing-or-empty'); assert.equal(manifest.runtime_evidence_status, 'not-run');
  assert.match(readFileSync(join(env.ORNIGAMI_EVIDENCE_DIR, 'step-summary.md'), 'utf8'), /Incomplete evidence capture/);
}));
test('resource gate runs after an available builder even when image build failed',()=>{
  const step=workflow.slice(workflow.indexOf('      - name: Reject build-time OOM'),workflow.indexOf('      - name: Enforce pinned base'));
  assert.match(step,/always\(\) && steps\.buildkit\.outcome == 'success'/);
  assert.doesNotMatch(step,/steps\.image_build\.outcome == 'success'/);
});

for (const scenario of ['truncated', 'wrong-type', 'wrong-source', 'missing-receipts']) test(`scan capture preserves manifest and fails on ${scenario}`, () => withSandbox(root => {
  const {env}=fakeEnvironment(root,{RUNTIME_OUTCOME:'skipped'});
  const dir=join(env.ORNIGAMI_EVIDENCE_DIR,'stage-scans');mkdirSync(dir,{recursive:true});
  const expected=['original-base','original-runtime-base','build-base','deps','builder','prod-deps','runner','buildkit','dockerfile-frontend'];
  const data={schema:1,sourceSha:scenario==='wrong-source'?'c'.repeat(40):env.SOURCE_SHA,expectedStages:expected,result:'failed',stages:expected.map(stage=>({stage,result:'failed',collectionComplete:scenario==='missing-receipts'}))};
  const original=scenario==='truncated'?'{"stages":[':scenario==='wrong-type'?'[]':JSON.stringify(data);
  writeFileSync(join(dir,'index.json'),original);
  const result=runShell(root,runBlock('evidence_capture'),env);assert.equal(result.status,1,result.stderr);
  assert.equal(readFileSync(join(dir,'invalid-index-preserved.txt'),'utf8'),original);
  const manifest=JSON.parse(readFileSync(join(env.ORNIGAMI_EVIDENCE_DIR,'manifest.json'),'utf8'));
  assert.equal(manifest.capture_completeness_status,'failed');assert.equal(manifest.custody_status,'not-assessed-by-capture');
  assert.equal(JSON.parse(readFileSync(join(dir,'index.json'),'utf8')).stages.length,9);
  for(const file of manifest.files)assert.equal(createHash(readFileSync(join(env.ORNIGAMI_EVIDENCE_DIR,file.path))),file.sha256);
}));
for(const scenario of [{name:'valid counters after build failure',after:counters({cpu:2}),status:0},{name:'OOM after build failure',after:counters({oom:1,cpu:2}),status:1},{name:'reset CPU counters',after:counters({cpu:0}),status:1},{name:'missing counter sections',after:'==memory.max==\n8589934592\n',status:1}]) {
  test(`resource assessment retains ${scenario.name}`,()=>withSandbox(root=>{
    const {env,runnerTemp}=fakeEnvironment(root,{IMAGE_BUILD_OUTCOME:'failure',IMAGE_BUILD_EXIT_CODE:'17'});
    mkdirSync(join(env.ORNIGAMI_EVIDENCE_DIR,'runner'),{recursive:true});writeFileSync(join(env.ORNIGAMI_EVIDENCE_DIR,'runner/full-build-observations.jsonl'),JSON.stringify({containerId:'a'.repeat(64),final:true,exit:0,metrics:counters()})+'\n');
    writeFileSync(join(runnerTemp,'builder-before-build.txt'),counters());
    writeFileSync(join(runnerTemp,'builder-after-build.txt'),scenario.after);
    const result=runShell(root,runBlock('build_resources'),env);
    assert.equal(result.status,scenario.status,result.stderr);
    assert.match(readFileSync(join(env.ORNIGAMI_EVIDENCE_DIR,'runner/resource-exit-code.txt'),'utf8'),new RegExp(`assessment_exit_code=${scenario.status}`));
  }));
}
test('missing after-build counters are an explicit resource failure',()=>withSandbox(root=>{
  const {env}=fakeEnvironment(root);
  const result=runShell(root,runBlock('build_resources'),env);
  assert.equal(result.status,1);
  assert.match(readFileSync(join(env.ORNIGAMI_EVIDENCE_DIR,'runner/resource-assessment.txt'),'utf8'),/missing-before-or-after/);
}));

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
