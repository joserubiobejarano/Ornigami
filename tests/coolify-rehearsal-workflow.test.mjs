import assert from "node:assert/strict";
import { createHash as createHashImpl } from "node:crypto";
import { spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {cleanupOwnedImages,workflowCleanupDocker} from '../scripts/framework-prototype/cleanup-owned-images.mjs';
import {recordOfficialPublication,databaseRepository} from '../scripts/framework-prototype/official-db-publication.mjs';

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

// These low-level shell fixtures use explicit local image identities so the
// builder ownership checks do not fake the separate toolchain identity gate.
function runBuildkitFixtureBlock() {
  const script = runBlock("buildkit")
    .replace('tool_image=$(node "$RUNNER_TEMP/source/scripts/framework-prototype/toolchain-runtime.mjs" image)', 'tool_image="ornigami-tool-buildkit:fixture"')
    .replace('tool_image_id=$(node "$RUNNER_TEMP/source/scripts/framework-prototype/toolchain-runtime.mjs" image-id)', 'tool_image_id="sha256:fixture-tool-image"');
  assert.doesNotMatch(script, /toolchain-runtime\.mjs/);
  return script;
}

// Keep the build failure/evidence harness focused on workflow shell behavior;
// toolchain-runtime's real identity gate is exercised separately.
function runImageBuildFixtureBlock() {
  const script = runBlock('image_build').replace(
    'node "$RUNNER_TEMP/source/scripts/framework-prototype/toolchain-runtime.mjs" verify',
    `printf '%s\\0%s\\0' '--build-context' 'ornigami-frontend=oci-layout://fixture@sha256:${'a'.repeat(64)}' > "$RUNNER_TEMP/ornigami-frontend-args.nul"`,
  );
  assert.doesNotMatch(script, /toolchain-runtime\.mjs/);
  return script;
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

test("private build request is bound to this candidate branch and matching private runtime profile", () => {
  const validation = runBlock("validate_inputs");
  const build = runBlock("image_build");
  const runtime = readFileSync(resolve("deploy/coolify/linux-runtime-acceptance.sh"), "utf8");
  const dockerfile = readFileSync(resolve("Dockerfile"), "utf8");
  const branch = "codex/ornigami-staging-readiness-20261018";
  const profile = JSON.parse(readFileSync(resolve("deploy/coolify/build-profile.json"), "utf8"));
  const origin = spawnSync(process.execPath, [resolve("scripts/framework-prototype/build-profile.mjs"), "origin"], { encoding: "utf8" });
  assert.equal(origin.status, 0, origin.stderr);
  assert.equal(origin.stdout.trim(), profile.origin);
  assert.equal(profile.origin, "https://staging.ornigami.com");
  assert.match(workflow, new RegExp(`branches:\\s+- ${branch}`));
  assert.match(workflow, new RegExp(`refs/heads/${branch}`));
  assert.doesNotMatch(workflow, /codex\/ornigami-sri-local-prototype-f-20261016/);
  assert.match(validation, /changed_paths\[0\].*build-requests\/ornigami\.json/);
  assert.match(validation, /source_lock_sha/);
  assert.match(validation, /candidate_workflow_blob.*request_workflow_blob/);
  assert.match(validation, /RUN_WORKFLOW_SHA.*GITHUB_SHA/);
  assert.match(build, /approved_origin=\$\(node .*build-profile\.mjs.* origin\)/);
  assert.match(build, /--build-arg "NEXT_PUBLIC_APP_URL=\$\{approved_origin\}"/);
  assert.match(build, /--build-arg ORNIGAMI_PRIVATE_STAGING_MODE=true/);
  assert.match(build, /--build-arg ORNIGAMI_PRIVATE_STAGING_PLATFORM=coolify/);
  assert.match(dockerfile, /ARG ORNIGAMI_PRIVATE_STAGING_MODE=false/);
  assert.match(dockerfile, /ARG ORNIGAMI_PRIVATE_STAGING_PLATFORM=ordinary/);
  assert.match(runtime, /--env ORNIGAMI_PRIVATE_STAGING_MODE=true/);
  assert.match(runtime, /--env ORNIGAMI_PRIVATE_STAGING_PLATFORM=coolify/);
});

test("admitted runtime workflow rejects missing, invalid, and exhausted work deadlines", () => withSandbox(root => {
  const cases = [
    ["missing", undefined],
    ["invalid", "not-an-epoch"],
    ["exhausted", "1"],
    ["below-floor", String(Math.floor(Date.now() / 1000) + 149)],
  ];
  for (const [name, deadline] of cases) {
    const env = { ...process.env };
    if (deadline === undefined) delete env.ORNIGAMI_WORK_DEADLINE_EPOCH;
    else env.ORNIGAMI_WORK_DEADLINE_EPOCH = deadline;
    const result = runShell(root, runBlock("runtime_acceptance"), env);
    assert.notEqual(result.status, 0, name);
    assert.match(result.stderr, /Runtime acceptance (requires|work budget)/, name);
  }
}));

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

function initializeTailEnvironment(root, env) {
  env.GITHUB_ENV ??= join(root, "github-env.txt");
  const windowsInstall = process.platform === "win32"
    ? `install() { [[ "$1" == -d && "$2" == -m && "$3" == 700 ]] || return 97; shift 3; mkdir -p -- "$@"; }\n`
    : "";
  const initialized = runShell(root, windowsInstall + runBlock("evidence_initialize"), env);
  assert.equal(initialized.status, 0, initialized.stderr || "tail deadline helper initialization failed");
  for (const line of readFileSync(env.GITHUB_ENV, "utf8").split(/\r?\n/)) {
    const separator = line.indexOf("=");
    if (separator > 0) env[line.slice(0, separator)] = line.slice(separator + 1);
  }
  return initialized;
}

function applyGithubEnv(env) {
  for (const line of readFileSync(env.GITHUB_ENV, "utf8").split(/\r?\n/)) {
    const separator = line.indexOf("=");
    if (separator > 0) env[line.slice(0, separator)] = line.slice(separator + 1);
  }
}

function runEvidenceCapture(root, env, { script = runBlock("evidence_capture"), afterInitialize = () => {} } = {}) {
  initializeTailEnvironment(root, env);
  writeFileSync(env.ORNIGAMI_JOB_SUMMARY, "fake workflow summary\n");
  afterInitialize();
  return runShell(root, script, env);
}

function prepareCombinedTail(root,{captureFailure=false}={}) {
  const overrides={
    FAKE_INSPECTED_BUILDER_ID:"owned-builder-id",
    FAKE_INSPECTED_IMAGE_ID:"owned-image-id",
    GITHUB_REPOSITORY:"owner/Ornigami",
    GITHUB_REPOSITORY_OWNER:"owner",
  };
  if(captureFailure)Object.assign(overrides,{RUNTIME_OUTCOME:"failure",RUNTIME_EXIT_CODE:"23"});
  const {env,runnerTemp,dockerLog}=fakeEnvironment(root,overrides);
  const workDeadline=Math.floor(Date.now()/1000)-120;
  const evidence=env.ORNIGAMI_EVIDENCE_DIR;
  if(!captureFailure){
    mkdirSync(join(evidence,"runtime"),{recursive:true});
    writeFileSync(join(runnerTemp,"base-trivy.json"),"base scan fixture\n");
    writeFileSync(join(runnerTemp,"trivy.json"),"final scan fixture\n");
    writeFileSync(join(runnerTemp,"ornigami-image.tar"),"archive excluded from evidence\n");
    writeFileSync(join(runnerTemp,"runtime-acceptance.log"),"runtime accepted by local fixture\n");
    writeFileSync(join(evidence,"runtime/runtime-http.json"),JSON.stringify({schemaVersion:1,result:"passed",exitStatus:0,httpObservations:[]}));
    for(const file of ["runtime-first-cgroup.txt","runtime-after-restart-cgroup.txt","runtime-after-recreate-cgroup.txt"])writeFileSync(join(evidence,`runtime/${file}`),counters());
    writeFileSync(join(evidence,"runtime/native-image-formats.json"),JSON.stringify({result:"passed"}));
  }
  const captureStarted=Math.floor(Date.now()/1000);
  const captureResult=runEvidenceCapture(root,env,{afterInitialize:()=>{
    env.ORNIGAMI_WORK_DEADLINE_EPOCH=String(workDeadline);
    writeFileSync(env.GITHUB_ENV,`ORNIGAMI_WORK_DEADLINE_EPOCH=${workDeadline}\n`,{flag:"a"});
    const reset=runShell(root,`source "$ORNIGAMI_TAIL_HELPER"; ornigami_tail_init; printf 'ORNIGAMI_TAIL_CAPTURE_DEADLINE_EPOCH=%s\\nORNIGAMI_TAIL_UPLOAD_DEADLINE_EPOCH=%s\\nORNIGAMI_TAIL_CUSTODY_DEADLINE_EPOCH=%s\\nORNIGAMI_TAIL_CLEANUP_DEADLINE_EPOCH=%s\\nORNIGAMI_TAIL_RESERVED_END_EPOCH=%s\\n' "$ORNIGAMI_TAIL_CAPTURE_DEADLINE_EPOCH" "$ORNIGAMI_TAIL_UPLOAD_DEADLINE_EPOCH" "$ORNIGAMI_TAIL_CUSTODY_DEADLINE_EPOCH" "$ORNIGAMI_TAIL_CLEANUP_DEADLINE_EPOCH" "$ORNIGAMI_TAIL_RESERVED_END_EPOCH" >> "$GITHUB_ENV"`,env);
    assert.equal(reset.status,0,reset.stderr);
    applyGithubEnv(env);
  }});
  applyGithubEnv(env);
  const manifest=existsSync(join(evidence,"manifest.json"))?JSON.parse(readFileSync(join(evidence,"manifest.json"),"utf8")):null;
  return {env,runnerTemp,dockerLog,evidence,workDeadline,captureStarted,captureResult,manifest};
}

function setCombinedClock(root,env,epoch) {
  const located=env.REAL_DATE_BIN?null:runShell(root,"type -P date",env);
  if(located)assert.equal(located.status,0,located.stderr);
  const clockFile=join(root,"combined-fake-clock.sh");
  env.REAL_DATE_BIN??=located.stdout.trim();
  env.FAKE_CLOCK_EPOCH=String(epoch);
  writeFileSync(clockFile,'date() { if [[ "$#" == 1 && "$1" == +%s && -n "${FAKE_CLOCK_EPOCH:-}" ]]; then printf "%s\\n" "$FAKE_CLOCK_EPOCH"; else "$REAL_DATE_BIN" "$@"; fi; }\n');
  env.BASH_ENV=clockFile;
  const observed=runShell(root,"date +%s",env);
  assert.equal(observed.status,0,observed.stderr);
  assert.equal(observed.stdout.trim(),String(epoch),"the shell phase uses the controlled local clock");
}

function runCombinedUpload(root,env,{mode="success",clockEpoch}={}) {
  if(clockEpoch!==undefined)setCombinedClock(root,env,clockEpoch);
  env.GITHUB_OUTPUT=join(root,"combined-upload-admission.txt");
  const admission=runShell(root,runBlock("evidence_upload_admission"),env);
  const admitted=readFileSync(env.GITHUB_OUTPUT,"utf8").includes("admitted=true");
  let action=null,outcome="skipped";
  const artifactStore=join(root,"combined-artifact-store"),output=join(root,"combined-upload-output.txt");
  env.FAKE_ARTIFACT_STORE=artifactStore;env.UPLOAD_SOURCE=env.ORNIGAMI_EVIDENCE_DIR;env.FAKE_UPLOAD_OUTPUT=output;env.FAKE_UPLOAD_MODE=mode;
  if(admitted){
    const script=join(root,"combined-fake-upload.sh");
    writeExecutable(script,`#!/usr/bin/env bash\nset -Eeuo pipefail\nmkdir -p "$FAKE_ARTIFACT_STORE"\ncp -R "$UPLOAD_SOURCE/." "$FAKE_ARTIFACT_STORE/"\ncase "$FAKE_UPLOAD_MODE" in\n  success) printf 'artifact-id=123\\nartifact-digest=%s\\n' '${"d".repeat(64)}' > "$FAKE_UPLOAD_OUTPUT" ;;\n  missing-identity) : ;;\n  fail) exit 17 ;;\n  *) exit 90 ;;\nesac\n`);
    action=runShell(root,'"$FAKE_UPLOAD_SCRIPT"',{...env,FAKE_UPLOAD_SCRIPT:script});
    outcome=action.status===0?"success":"failure";
  }
  const outputs=existsSync(output)?readFileSync(output,"utf8"):"";
  env.UPLOAD_OUTCOME=outcome;
  env.ARTIFACT_ID=outputs.match(/^artifact-id=(\d+)$/m)?.[1]??"";
  env.ARTIFACT_DIGEST=outputs.match(/^artifact-digest=([0-9a-f]{64})$/m)?.[1]??"";
  env.EVIDENCE_URL=outcome==="success"&&env.ARTIFACT_ID&&env.ARTIFACT_DIGEST?"https://example.invalid/fake-artifact":"";
  return {admission,admitted,action,outcome,artifactStore,outputs};
}

function configureCombinedOwnerApi(root,env,mode) {
  const ghBin=join(root,"combined-fake-gh-bin");mkdirSync(ghBin,{recursive:true});
  const jqScript=join(root,"combined-fake-jq.mjs");
  writeFileSync(jqScript,`const args=process.argv.slice(2),named={};for(let i=0;i<args.length;i++)if(args[i]==="--arg")named[args[++i]]=args[++i];let input="";process.stdin.setEncoding("utf8");process.stdin.on("data",chunk=>input+=chunk);process.stdin.on("end",()=>{try{const rows=JSON.parse(input);process.exitCode=rows.some(row=>row.context===named.context&&row.description===named.description&&row.state==="success"&&row.creator?.login===named.owner)?0:1}catch{process.exitCode=4}});\n`);
  env.FAKE_COMBINED_JQ=jqScript;env.FAKE_COMBINED_GH_MODE=mode;env.FAKE_COMBINED_GH_LOG=join(root,"combined-gh.log");
  writeExecutable(join(ghBin,"jq"),'#!/usr/bin/env bash\nexec "$TEST_REAL_NODE" "$FAKE_COMBINED_JQ" "$@"\n');
  const context=`ornigami/evidence-local/${env.GITHUB_RUN_ID}/${env.GITHUB_RUN_ATTEMPT}`;
  const description=`artifact=${env.ARTIFACT_ID};sha256=${env.ARTIFACT_DIGEST}`;
  const response=mode==="success"?`[{"context":"${context}","description":"${description}","state":"success","creator":{"login":"owner"}}]`
    :mode==="mismatch"?'[{"context":"wrong","description":"wrong","state":"success","creator":{"login":"other"}}]':'[]';
  writeExecutable(join(ghBin,"gh"),`#!/usr/bin/env bash\nprintf '%s\\n' "$*" >> "$FAKE_COMBINED_GH_LOG"\ncase "$FAKE_COMBINED_GH_MODE" in\n  hang) trap '' TERM; while :; do sleep 1; done ;;\n  *) printf '%s\\n' '${response}' ;;\nesac\n`);
  env.PATH=`${ghBin}${delimiter}${env.PATH}`;
}

function runCombinedReport(root,env) {
  const result=runTailShell(root,runBlock("evidence_report"),env);
  applyGithubEnv(env);
  return result;
}

function runCombinedCustody(root,env,mode="success") {
  if(env.UPLOAD_OUTCOME!=="success"){
    env.CUSTODY_STEP_OUTCOME="skipped";
    return {status:null,skipped:true};
  }
  configureCombinedOwnerApi(root,env,mode);
  const script=mode==="success"?runBlock("evidence_custody"):shortCustody(runBlock("evidence_custody"));
  const result=runTailShell(root,script,env);
  env.CUSTODY_STEP_OUTCOME=result.status===0?"success":"failure";
  return result;
}

function runCombinedCleanup(root,env,{script=runBlock("cleanup"),initialize=false}={}) {
  return runCleanup(root,env,script,{initialize});
}

function assertCombinedReceiptsLocal(env,artifactStore) {
  const names=["upload-report.txt","custody-outcome.txt","workflow-cleanup.txt","workflow-cleanup-final.txt"];
  for(const name of names){
    assert.equal(existsSync(join(env.ORNIGAMI_EVIDENCE_DIR,name)),false,`${name} stays outside capture evidence`);
    if(existsSync(artifactStore))assert.equal(existsSync(join(artifactStore,name)),false,`${name} stays outside uploaded snapshot`);
  }
}

function runCleanup(root, env, script = runBlock("cleanup"), { initialize = true } = {}) {
  if (initialize) initializeTailEnvironment(root, env);
  const windowsInstall = process.platform === "win32"
    ? `install() { [[ "$1" == -d && "$2" == -m && "$3" == 700 ]] || return 97; shift 3; mkdir -p -- "$@"; }\n`
    : "";
  return runShell(root, windowsInstall + script, env);
}

function shortCleanupBudget(script, cap = 8, reserve = 2) {
  return script
    .replace("ornigami_tail_resolve_phase cleanup 120 720 30", `ornigami_tail_resolve_phase cleanup ${cap} 720 ${reserve}`)
    .replace('ornigami_tail_supervise cleanup "$cleanup_deadline" 30', `ornigami_tail_supervise cleanup "$cleanup_deadline" ${reserve}`);
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
  info)
    if [[ \${FAKE_DAEMON_INFO_FAIL:-0} == 1 ]]; then exit 18; fi
    printf '%s\\n' "\${FAKE_DAEMON_INFO:-fixture-daemon}"
    ;;
  inspect)
    target=\${1:-}; shift || true
    if [[ \${FAKE_DOCKER_HANG_INSPECT:-0} == 1 ]]; then
      printf '%s\\n' "$$" > "$FAKE_DOCKER_HANG_PID"
      trap '' TERM
      while :; do printf x >> "$FAKE_DOCKER_HANG_PROGRESS"; sleep 0.1; done
    fi
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
    if [[ \${FAKE_DOCKER_INVENTORY_FAIL:-0} == 1 ]]; then exit 19; fi
    if [[ \${FAKE_REMOVAL_NOOP:-0} == 1 ]]; then printf '%s\\n' "$FAKE_BUILDER_ID"; fi
    if [[ -n \${FAKE_PS_CONTAINER_ID:-} ]]; then printf '%s\\n' "$FAKE_PS_CONTAINER_ID"; fi
    ;;
  volume)
    subcommand=\${1:-}; shift || true
    if [[ "$subcommand" == inspect ]]; then printf '%s\\n' "$FAKE_STATE_VOLUME"; fi
    if [[ "$subcommand" == ls && ( \${FAKE_EXISTING_VOLUME:-0} == 1 || \${FAKE_REMOVAL_NOOP:-0} == 1 ) ]]; then printf '%s\\n' "$FAKE_STATE_VOLUME"; fi
    ;;
  rm)
    if [[ \${FAKE_REMOVAL_FAIL:-0} == 1 ]]; then exit 20; fi
    ;;
  image)
    subcommand=\${1:-}; shift || true
    if [[ "$subcommand" == inspect ]]; then printf '%s\\n' "$FAKE_INSPECTED_IMAGE_ID"; fi
    if [[ "$subcommand" == ls && \${FAKE_REMOVAL_NOOP:-0} == 1 ]]; then printf '%s\\n' "$FAKE_INSPECTED_IMAGE_ID"; fi
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
  const sourceDir=join(runnerTemp,"source/scripts/framework-prototype");mkdirSync(sourceDir,{recursive:true});for(const name of ["serial-scan-driver.mjs","cleanup-owned-images.mjs","scan-image-stages.mjs","validate-build-observation.mjs","frozen-db-admission.mjs","toolchain-runtime.mjs","toolchain-contract.mjs","tool-image.mjs","toolchain-build.mjs","build-profile.mjs"])copyFileSync(join(repositoryRoot,"scripts/framework-prototype",name),join(sourceDir,name));
  const profileDir=join(runnerTemp,'source/deploy/coolify');mkdirSync(profileDir,{recursive:true});
  copyFileSync(join(repositoryRoot,'deploy/coolify/build-profile.json'),join(profileDir,'build-profile.json'));
  copyFileSync(join(repositoryRoot,'scripts/framework-prototype/stage-index.mjs'),join(sourceDir,'stage-index.mjs'));
  const cleanupNode=join(runnerTemp,'node-v22.23.3-linux-x64/bin');mkdirSync(cleanupNode,{recursive:true});
  writeExecutable(join(cleanupNode,'node'),'#!/usr/bin/env bash\nexec "$TEST_REAL_NODE" "$@"\n');
  writeFileSync(join(runnerTemp,'ornigami-daemon-before.txt'),'fixture-daemon\n');
  const env = {
    ...process.env,
    TEST_REAL_NODE: process.execPath.replaceAll('\\','/'),
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
    TOOLING_BUILD_OUTCOME: "skipped",
    TOOLING_PREREQUISITES_OUTCOME: "skipped",
    TOOLING_PROBE_OUTCOME: "skipped",
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

for(const mode of ['success','download-failure','manifest-drift'])test(`full DB download block ${mode}: real publication CLI, recorded scope arguments, no scanner/network`,()=>withSandbox(root=>{
 const {env}=fakeEnvironment(root,{FAKE_DB_EXIT:mode==='download-failure'?'37':'0',REAL_TEST_NODE:process.execPath.replaceAll('\\','/'),FAKE_DB_SCOPE_ARGUMENTS:join(root,'db-scope-args.txt')});
 const source=join(env.RUNNER_TEMP,'source/scripts/framework-prototype');
 for(const name of ['official-db-publication.mjs','official-db-manifest.json'])copyFileSync(join(repositoryRoot,'scripts/framework-prototype',name),join(source,name));
 if(mode==='manifest-drift')writeFileSync(join(source,'official-db-manifest.json'),'{}');
 const nodeBin=join(env.RUNNER_TEMP,'node-v22.23.3-linux-x64/bin');mkdirSync(nodeBin,{recursive:true});
 writeExecutable(join(nodeBin,'node'),'#!/usr/bin/env bash\nexec "$REAL_TEST_NODE" "$@"\n');
 writeExecutable(join(root,'fake-bin/sudo'),'#!/usr/bin/env bash\nset -euo pipefail\n[[ -s "$ORNIGAMI_EVIDENCE_DIR/stage-scans/db-publication.json" ]]\nprintf "%s\\n" "$@" > "$FAKE_DB_SCOPE_ARGUMENTS"\nexit "$FAKE_DB_EXIT"\n');
 const result=runShell(root,runBlock('database_download'),env);
 assert.equal(result.status,mode==='success'?0:mode==='download-failure'?37:1,result.stderr);
 if(mode==='manifest-drift'){assert.equal(existsSync(env.FAKE_DB_SCOPE_ARGUMENTS),false);return;}
 const args=readFileSync(env.FAKE_DB_SCOPE_ARGUMENTS,'utf8').trim().split(/\r?\n/);
 assert.equal(args.filter(x=>x==='--db-repository').length,1);
 assert.equal(args[args.indexOf('--db-repository')+1],databaseRepository);
 assert.ok(args.includes('MemoryMax=2147483648'));assert.ok(args.includes('MemorySwapMax=0'));assert.ok(args.includes('CPUQuota=100%'));
 assert.equal(readFileSync(join(env.ORNIGAMI_EVIDENCE_DIR,'stage-scans/database-download-exit.txt'),'utf8').trim(),env.FAKE_DB_EXIT);
}));

test('official database publication receipt records approved immutable evidence with unverified attribution',()=>withSandbox(root=>{
 const receipt=recordOfficialPublication('a'.repeat(40),join(root,'db-publication.json'));
 assert.equal(receipt.repository,'ghcr.io/aquasecurity/trivy-db@sha256:2bfa4ccf12f3243cd7cef40b98465bd2dfd6926816d0210c785ea36c4e94959c');
 assert.equal(receipt.manifestDigest,'sha256:2bfa4ccf12f3243cd7cef40b98465bd2dfd6926816d0210c785ea36c4e94959c');
 assert.equal(receipt.manifest.layers.length,1);
 assert.equal(receipt.manifest.layers[0].digest,'sha256:2661508583e666152f8e84eeafa946d126cb66e285794c6e91e70967ed934852');
 assert.equal(receipt.manifest.layers[0].size,135366518);
 assert.equal(receipt.publisherRun,null);assert.equal(receipt.publisherSource,null);assert.equal(receipt.publisherAttribution,'unverified');
 assert.match(receipt.evidenceBasis,/Owner-approved limited basis/);
 assert.match(receipt.provenance,/unverified/);assert.match(receipt.provenance,/close timestamps do not establish attribution/);
 assert.match(receipt.coverage,/HOLD/);assert.doesNotMatch(receipt.coverage,/CVE-2026-111142|zziplib/);
 assert.match(receipt.freshness,/strict internal metadata admission against actual clock/);
}));

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
  assert.equal(manifest.capture_supervision, "bounded process-group supervisor");
  assert.ok(Number.isSafeInteger(Number(manifest.capture_deadline_epoch)));
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
  const initialized = Object.fromEntries(readFileSync(env.GITHUB_ENV, 'utf8').trim().split(/\r?\n/).map(line => { const i=line.indexOf('='); return [line.slice(0,i),line.slice(i+1)]; }));
  assert.ok(existsSync(initialized.ORNIGAMI_TAIL_HELPER));
  const workDeadline = Number(initialized.ORNIGAMI_WORK_DEADLINE_EPOCH);
  assert.equal(Number(initialized.ORNIGAMI_TAIL_CAPTURE_DEADLINE_EPOCH), workDeadline + 180);
  assert.equal(Number(initialized.ORNIGAMI_TAIL_UPLOAD_DEADLINE_EPOCH), workDeadline + 300);
  assert.equal(Number(initialized.ORNIGAMI_TAIL_CUSTODY_DEADLINE_EPOCH), workDeadline + 600);
  assert.equal(Number(initialized.ORNIGAMI_TAIL_CLEANUP_DEADLINE_EPOCH), workDeadline + 720);
  assert.equal(Number(initialized.ORNIGAMI_TAIL_RESERVED_END_EPOCH), workDeadline + 960);
  assert.equal(readFileSync(env.GITHUB_STEP_SUMMARY, 'utf8'), '');
}));

test("tail deadline helper validates budgets and selects the earlier local or absolute deadline", () => withSandbox(root => {
  const { env } = fakeEnvironment(root);
  initializeTailEnvironment(root, env);
  const script = `source "$ORNIGAMI_TAIL_HELPER"
if ornigami_tail_validate; then valid_rc=0; else valid_rc=$?; fi
now=$(date +%s)
ORNIGAMI_WORK_DEADLINE_EPOCH=$((now + 100))
ornigami_tail_resolve_phase capture 6 180 3
early_work=$ORNIGAMI_TAIL_PHASE_WORK_SECONDS
now=$(date +%s)
ORNIGAMI_WORK_DEADLINE_EPOCH=$((now - 10))
ornigami_tail_resolve_phase capture 6 180 3
late_work=$ORNIGAMI_TAIL_PHASE_WORK_SECONDS
now=$(date +%s)
ORNIGAMI_WORK_DEADLINE_EPOCH=$((now - 175))
ornigami_tail_resolve_phase capture 180 180 2
absolute=$((ORNIGAMI_TAIL_PHASE_DEADLINE_EPOCH - now))
printf 'valid=%s early_work=%s late_work=%s absolute=%s\\n' "$valid_rc" "$early_work" "$late_work" "$absolute"
`;
  const valid = runShell(root, script, env);
  assert.equal(valid.status, 0, valid.stderr);
  assert.match(valid.stdout, /valid=0 early_work=3 late_work=3 absolute=[45]/);
  for (const [label, deadline, expected] of [
    ["missing", undefined, 2],
    ["malformed", "not-an-epoch", 2],
    ["exhausted", String(Math.floor(Date.now() / 1000) - 961), 124],
  ]) {
    const invalidEnv = { ...env };
    if (deadline === undefined) delete invalidEnv.ORNIGAMI_WORK_DEADLINE_EPOCH;
    else invalidEnv.ORNIGAMI_WORK_DEADLINE_EPOCH = deadline;
    const result = runShell(root, `source "$ORNIGAMI_TAIL_HELPER"; ornigami_tail_resolve_phase capture 180 180 20`, invalidEnv);
    assert.equal(result.status, expected, `${label}: ${result.stderr}`);
  }
}));

function shortUploadAdmission(script) {
  return script.replace("ornigami_tail_resolve_phase upload 120 300 15", "ornigami_tail_resolve_phase upload 8 300 2");
}

function shortCustody(script) {
  return script
    .replace("ornigami_tail_resolve_phase custody 300 600 40", "ornigami_tail_resolve_phase custody 8 600 2")
    .replace("ORNIGAMI_TAIL_PHASE_DEADLINE_EPOCH - now <= 40", "ORNIGAMI_TAIL_PHASE_DEADLINE_EPOCH - now <= 2")
    .replace('ornigami_tail_supervise custody "$ORNIGAMI_TAIL_PHASE_DEADLINE_EPOCH" 40', 'ornigami_tail_supervise custody "$ORNIGAMI_TAIL_PHASE_DEADLINE_EPOCH" 2')
    .replace("phase_deadline - now - 40 - 2", "phase_deadline - now - 2 - 1")
    .replace("phase_deadline - now - 40", "phase_deadline - now - 2")
    .replace("api_seconds=15", "api_seconds=2")
    .replace("sleep_seconds=10", "sleep_seconds=1")
    .replace("--kill-after=2s", "--kill-after=1s");
}

function runTailShell(root, script, env) {
  const windowsInstall = process.platform === "win32"
    ? `install() { [[ "$1" == -d && "$2" == -m && "$3" == 700 ]] || return 97; shift 3; mkdir -p -- "$@"; }\n`
    : "";
  return runShell(root, windowsInstall + script, env);
}

test("bounded upload admission uses the existing absolute deadline and skips unsafe whole-minute windows", () => withSandbox(root => {
  const { env } = fakeEnvironment(root);
  initializeTailEnvironment(root, env);
  env.GITHUB_OUTPUT = join(root, "upload-output.txt");
  env.ORNIGAMI_WORK_DEADLINE_EPOCH = String(Math.floor(Date.now() / 1000) + 150);
  let result = runShell(root, runBlock("evidence_upload_admission"), env);
  assert.equal(result.status, 0, result.stderr);
  assert.match(readFileSync(env.GITHUB_OUTPUT, "utf8"), /admitted=true\ntimeout_minutes=1/);
  assert.match(readFileSync(join(env.RUNNER_TEMP, "ornigami-upload-admission.local.txt"), "utf8"), /upload_admission=passed/);

  env.GITHUB_OUTPUT = join(root, "upload-short-output.txt");
  env.ORNIGAMI_WORK_DEADLINE_EPOCH = String(Math.floor(Date.now() / 1000) - 235);
  result = runShell(root, shortUploadAdmission(runBlock("evidence_upload_admission")), env);
  assert.notEqual(result.status, 0, "less than 60 work seconds plus the 15-second reserve is rejected");
  assert.match(readFileSync(env.GITHUB_OUTPUT, "utf8"), /admitted=false/);
  assert.match(readFileSync(join(env.RUNNER_TEMP, "ornigami-upload-admission.local.txt"), "utf8"), /less_than_one_safe_actions_minute/);

  env.GITHUB_OUTPUT = join(root, "upload-exhausted-output.txt");
  env.ORNIGAMI_WORK_DEADLINE_EPOCH = String(Math.floor(Date.now() / 1000) - 961);
  result = runShell(root, runBlock("evidence_upload_admission"), env);
  assert.notEqual(result.status, 0);
  assert.match(readFileSync(env.GITHUB_OUTPUT, "utf8"), /admitted=false/);
}));

test("upload and custody workflow retains the artifact identity gate, stable source and shared report deadline", () => {
  const admission = workflow.indexOf("id: evidence_upload_admission");
  const upload = workflow.indexOf("id: evidence_upload", admission + "id: evidence_upload_admission".length);
  const report = workflow.indexOf("id: evidence_report", upload);
  const custody = workflow.indexOf("id: evidence_custody", report);
  const cleanup = workflow.indexOf("id: cleanup", custody);
  assert.ok(admission >= 0 && admission < upload && upload < report && report < custody && custody < cleanup);
  assert.match(workflow.slice(admission, upload), /ornigami_tail_resolve_phase upload 120 300 15/);
  assert.match(workflow.slice(upload, report), /timeout-minutes: 1/);
  assert.match(workflow.slice(upload, report), /steps\.evidence_upload_admission\.outputs\.admitted == 'true'/);
  assert.match(workflow.slice(upload, report), /path: \$\{\{ runner\.temp \}\}\/ornigami-evidence\//);
  assert.match(workflow.slice(report, custody), /ORNIGAMI_TAIL_REPORT_CUSTODY_DEADLINE_EPOCH/);
  assert.match(workflow.slice(custody, cleanup), /steps\.evidence_upload\.outcome == 'success'/);
  assert.match(workflow.slice(custody, cleanup), /\.context == \$context and \.description == \$description and \.state == "success" and \.creator\.login == \$owner/);
  assert.match(workflow.slice(custody, cleanup), /timeout --signal=TERM --kill-after=2s/);
  const cleanupStep=workflow.slice(cleanup);
  assert.match(cleanupStep,/timeout-minutes: 2/);
  assert.match(cleanupStep,/ornigami_tail_resolve_phase cleanup 120 720 30/);
  assert.match(cleanupStep,/ornigami_tail_supervise cleanup "\$cleanup_deadline" 30/);
  assert.match(cleanupStep,/call_seconds=10/);
  assert.match(cleanupStep,/CUSTODY_STEP_OUTCOME: \$\{\{ steps\.evidence_custody\.outcome \}\}/);
  assert.doesNotMatch(cleanupStep,/docker (?:system )?prune|gh api .*packages|delete-package-version/);
});

test("upload action outcomes require both success and identity outputs; later receipts stay outside the uploaded snapshot", () => withSandbox(root => {
  const { env } = fakeEnvironment(root);
  initializeTailEnvironment(root, env);
  const evidence = env.ORNIGAMI_EVIDENCE_DIR;
  mkdirSync(evidence, { recursive: true });
  writeFileSync(join(evidence, "manifest.json"), '{"diagnostic":true}\n');
  env.UPLOAD_SOURCE = evidence;
  env.FAKE_ARTIFACT_STORE = join(root, "fake-artifact");
  env.FAKE_UPLOAD_MODE = "success";
  env.FAKE_UPLOAD_TIMEOUT = "2s";
  const fakeAction = join(root, "fake-upload-action.sh");
  writeExecutable(fakeAction, `#!/usr/bin/env bash
set -Eeuo pipefail
mkdir -p "$FAKE_ARTIFACT_STORE"
cp -R "$UPLOAD_SOURCE/." "$FAKE_ARTIFACT_STORE/"
case "$FAKE_UPLOAD_MODE" in
  success) printf 'artifact-id=123\nartifact-digest=%s\n' "${"e".repeat(64)}" > "$FAKE_ACTION_OUTPUT" ;;
  missing-outputs) : ;;
  fail) exit 17 ;;
  hang) trap '' TERM; while :; do sleep 1; done ;;
esac
`);
  env.FAKE_ACTION_OUTPUT = join(root, "fake-action-output.txt");
  env.FAKE_UPLOAD_SCRIPT = fakeAction;
  const sourceBefore = createHashImpl("sha256").update(readFileSync(join(evidence, "manifest.json"))).digest("hex");
  let action = runShell(root, 'timeout --signal=TERM --kill-after=1s "$FAKE_UPLOAD_TIMEOUT" "$FAKE_UPLOAD_SCRIPT"', env);
  assert.equal(action.status, 0, action.stderr);
  const outputs = readFileSync(env.FAKE_ACTION_OUTPUT, "utf8");
  assert.match(outputs, /artifact-id=123/);
  assert.equal(createHashImpl("sha256").update(readFileSync(join(env.FAKE_ARTIFACT_STORE, "manifest.json"))).digest("hex"), sourceBefore);

  env.FAKE_UPLOAD_MODE = "missing-outputs";
  rmSync(env.FAKE_ACTION_OUTPUT, { force: true });
  action = runShell(root, '"$FAKE_UPLOAD_SCRIPT"', env);
  assert.equal(action.status, 0);
  assert.equal(existsSync(env.FAKE_ACTION_OUTPUT), false, "missing action outputs cannot mint an artifact identity");
  env.FAKE_UPLOAD_MODE = "fail";
  writeFileSync(env.FAKE_ACTION_OUTPUT, outputs);
  action = runShell(root, '"$FAKE_UPLOAD_SCRIPT"', env);
  assert.equal(action.status, 17);
  env.FAKE_UPLOAD_MODE = "hang";
  env.FAKE_UPLOAD_TIMEOUT = "0.2s";
  action = runShell(root, 'timeout --signal=TERM --kill-after=1s "$FAKE_UPLOAD_TIMEOUT" "$FAKE_UPLOAD_SCRIPT"', env);
  assert.ok([124, 137].includes(action.status), "hung upload action is not a successful upload");

  env.EVIDENCE_URL = "";
  env.ORNIGAMI_WORK_DEADLINE_EPOCH = String(Math.floor(Date.now() / 1000) + 1440);
  for (const outcome of ["failure", "skipped"]) {
    env.UPLOAD_OUTCOME = outcome;
    const report = runTailShell(root, runBlock("evidence_report"), env);
    assert.equal(report.status, 0, report.stderr);
    assert.match(readFileSync(join(env.RUNNER_TEMP, "ornigami-tail-outcomes.local", "upload-report.txt"), "utf8"), new RegExp(`upload_outcome=${outcome}`));
    assert.match(readFileSync(join(env.RUNNER_TEMP, "ornigami-tail-outcomes.local", "upload-report.txt"), "utf8"), /custody_status=unavailable/);
  }
  assert.equal(existsSync(join(evidence, "upload-report.txt")), false, "post-upload receipt is outside the uploaded snapshot");
  const reportDeadline = Number(readFileSync(env.GITHUB_ENV, "utf8").match(/ORNIGAMI_TAIL_REPORT_CUSTODY_DEADLINE_EPOCH=(\d+)/)?.[1]);
  assert.ok(reportDeadline > Math.floor(Date.now() / 1000));
  assert.ok(reportDeadline <= Math.floor(Date.now() / 1000) + 300);
}));

test("report supervisor stops a hung child inside its one-minute guard and preserves shared custody deadline", () => withSandbox(root => {
  const { env } = fakeEnvironment(root);
  initializeTailEnvironment(root, env);
  env.UPLOAD_OUTCOME = "success";
  env.EVIDENCE_URL = "https://example.invalid/artifact";
  env.REPORT_HANG_PROGRESS = join(root, "report-hang.progress");
  env.REPORT_SHARED_DEADLINE_BEFORE = join(root, "report-shared-deadline.before");
  const original = runBlock("evidence_report");
  const shortened = original
    .replace("report_deadline=$((report_now + 45))", "report_deadline=$((report_now + 6))")
    .replace("report_deadline - report_now <= 15", "report_deadline - report_now <= 2")
    .replace('ornigami_tail_supervise upload-report "$report_deadline" 15', 'ornigami_tail_supervise upload-report "$report_deadline" 2')
    .replace("report_worker() {", `report_worker() {\n  bash -c 'trap "" TERM; while :; do printf x >> "$REPORT_HANG_PROGRESS"; sleep 0.1; done'`)
    .replace(
      'if ! ornigami_tail_supervise upload-report "$report_deadline" 2 bash -c report_worker; then',
      'printf "%s\\n" "$shared_deadline" > "$REPORT_SHARED_DEADLINE_BEFORE"\nif ! ornigami_tail_supervise upload-report "$report_deadline" 2 bash -c report_worker; then',
    );
  assert.notEqual(shortened, original, "short test budget and hung child must be injected into the actual report step");
  const result = runTailShell(root, shortened, env);
  assert.equal(result.status, 1, `${result.stdout}\n${result.stderr}`);
  const receiptPath = join(env.RUNNER_TEMP, "ornigami-tail-outcomes.local", "upload-report.txt");
  const receipt = readFileSync(receiptPath, "utf8");
  assert.match(receipt, /report_status=failed/);
  assert.match(receipt, /reason=supervisor_timeout/);
  assert.match(receipt, /custody_status=pending/);
  const sharedBefore = readFileSync(env.REPORT_SHARED_DEADLINE_BEFORE, "utf8").trim();
  const sharedAfter = readFileSync(env.GITHUB_ENV, "utf8").split(/\r?\n/).filter(line => line.startsWith("ORNIGAMI_TAIL_REPORT_CUSTODY_DEADLINE_EPOCH=")).at(-1).split("=")[1];
  assert.equal(sharedAfter, sharedBefore, "the report-local deadline must not move the shared report/custody deadline");
  assert.doesNotMatch(readFileSync(env.GITHUB_ENV, "utf8"), /ORNIGAMI_TAIL_REPORT_PHASE_DEADLINE/);
  const before = readFileSync(env.REPORT_HANG_PROGRESS, "utf8").length;
  spawnSync(bash, ["-c", "sleep 0.3"]);
  assert.equal(readFileSync(env.REPORT_HANG_PROGRESS, "utf8").length, before, "hung report child cannot continue after supervision");
}));

test("bounded custody requires the exact successful owner tuple and records only local outcomes", () => withSandbox(root => {
  const { env } = fakeEnvironment(root);
  initializeTailEnvironment(root, env);
  const ghBin = join(root, "fake-gh-bin");
  mkdirSync(ghBin, { recursive: true });
  const jqScript = join(root, "fake-jq.mjs");
  writeFileSync(jqScript, `const args=process.argv.slice(2); const named={}; for(let i=0;i<args.length;i++) if(args[i]==='--arg') named[args[++i]]=args[++i]; let input=''; process.stdin.setEncoding('utf8'); process.stdin.on('data',chunk=>input+=chunk); process.stdin.on('end',()=>{ try { const rows=JSON.parse(input); const match=rows.some(row=>row.context===named.context && row.description===named.description && row.state==='success' && row.creator?.login===named.owner); process.exitCode=match?0:1; } catch { process.exitCode=4; } });\n`);
  env.FAKE_JQ_SCRIPT = jqScript;
  writeExecutable(join(ghBin, "jq"), '#!/usr/bin/env bash\nexec "$TEST_REAL_NODE" "$FAKE_JQ_SCRIPT" "$@"\n');
  const gh = join(ghBin, "gh");
  const success = `[{
  "context":"ornigami/evidence-local/77/1",
  "description":"artifact=123;sha256=${"d".repeat(64)}",
  "state":"success",
  "creator":{"login":"owner"}
}]`;
  writeExecutable(gh, `#!/usr/bin/env bash
case "$FAKE_GH_MODE" in
  success) printf '%s\\n' '${success}' ;;
  mismatch) printf '%s\\n' '[{"context":"wrong","description":"wrong","state":"failure","creator":{"login":"other"}}]' ;;
  empty) printf '%s\\n' '[]' ;;
  hang) trap '' TERM; (sleep 0.2; printf x >> "$FAKE_GH_PROGRESS") & while :; do sleep 1; done ;;
esac
`);
  env.PATH = `${ghBin}${delimiter}${env.PATH}`;
  env.FAKE_GH_PROGRESS = join(root, "fake-gh-progress.txt");
  env.GITHUB_RUN_ID = "77";
  env.GITHUB_RUN_ATTEMPT = "1";
  env.GITHUB_SHA = "a".repeat(40);
  env.GITHUB_REPOSITORY = "owner/Ornigami";
  env.GITHUB_REPOSITORY_OWNER = "owner";
  env.ARTIFACT_ID = "123";
  env.ARTIFACT_DIGEST = "d".repeat(64);
  env.FAKE_GH_MODE = "success";
  const runCustody = () => {
    env.ORNIGAMI_TAIL_REPORT_CUSTODY_DEADLINE_EPOCH = String(Math.floor(Date.now() / 1000) + 8);
    return runTailShell(root, shortCustody(runBlock("evidence_custody")), env);
  };
  let result = runCustody();
  const receipt = join(env.RUNNER_TEMP, "ornigami-tail-outcomes.local", "custody-outcome.txt");
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}\n${readFileSync(receipt, "utf8")}`);
  assert.match(readFileSync(receipt, "utf8"), /custody_status=verified/);
  assert.match(readFileSync(receipt, "utf8"), /run_id=77\nrun_attempt=1\nrequest_sha=a{40}\nartifact_id=123/);
  assert.match(readFileSync(receipt, "utf8"), /artifact_digest=d{64}/);
  assert.match(readFileSync(receipt, "utf8"), /owner=owner/);

  env.FAKE_GH_MODE = "mismatch";
  result = runCustody();
  assert.notEqual(result.status, 0, "mismatched owner receipt cannot acknowledge custody");
  assert.match(readFileSync(receipt, "utf8"), /custody_status=unproved/);

  env.ARTIFACT_ID = "";
  result = runCustody();
  assert.notEqual(result.status, 0);
  assert.match(readFileSync(receipt, "utf8"), /missing_or_invalid_upload_identity/);
  env.ARTIFACT_ID = "123";
  env.FAKE_GH_MODE = "hang";
  result = runCustody();
  assert.notEqual(result.status, 0, "hung API cannot establish custody");
  assert.match(readFileSync(receipt, "utf8"), /custody_status=unproved/);
  const before = existsSync(env.FAKE_GH_PROGRESS) ? readFileSync(env.FAKE_GH_PROGRESS, "utf8").length : 0;
  spawnSync(bash, ["-c", "sleep 0.3"]);
  const after = existsSync(env.FAKE_GH_PROGRESS) ? readFileSync(env.FAKE_GH_PROGRESS, "utf8").length : 0;
  assert.equal(after, before, "timed-out API descendants cannot continue after the custody attempt");
}));

test("combined local tail preserves one deadline through capture, upload, custody and exact cleanup", () => withSandbox(root => {
  const {env,runnerTemp,dockerLog,workDeadline,captureStarted,captureResult,manifest}=prepareCombinedTail(root);
  let result=captureResult;
  const evidence=env.ORNIGAMI_EVIDENCE_DIR;
  assert.equal(result.status,0,`${result.stdout}\n${result.stderr}`);
  assert.equal(manifest.capture_completeness_status,"passed");
  assert.equal(Number(manifest.capture_deadline_epoch),workDeadline+180);
  assert.ok(Number(manifest.capture_deadline_epoch)<=captureStarted+180);
  verifyManifest(evidence);

  const cutoffs={
    capture:Number(env.ORNIGAMI_TAIL_CAPTURE_DEADLINE_EPOCH),
    upload:Number(env.ORNIGAMI_TAIL_UPLOAD_DEADLINE_EPOCH),
    custody:Number(env.ORNIGAMI_TAIL_CUSTODY_DEADLINE_EPOCH),
    cleanup:Number(env.ORNIGAMI_TAIL_CLEANUP_DEADLINE_EPOCH),
    reserved:Number(env.ORNIGAMI_TAIL_RESERVED_END_EPOCH),
  };
  assert.deepEqual(cutoffs,{capture:workDeadline+180,upload:workDeadline+300,custody:workDeadline+600,cleanup:workDeadline+720,reserved:workDeadline+960});

  // Actual admission and the fake action result drive every later gate.
  const uploadStarted=Math.floor(Date.now()/1000);
  const upload=runCombinedUpload(root,env);
  result=upload.admission;
  assert.equal(result.status,0,`${result.stdout}\n${result.stderr}`);
  assert.equal(upload.admitted,true);
  assert.match(readFileSync(env.GITHUB_OUTPUT,"utf8"),/admitted=true\ntimeout_minutes=1/);
  const admissionReceipt=readFileSync(join(env.RUNNER_TEMP,"ornigami-upload-admission.local.txt"),"utf8");
  const uploadPhaseDeadline=Number(admissionReceipt.match(/phase_deadline_epoch=(\d+)/)?.[1]);
  const uploadWorkSeconds=Number(admissionReceipt.match(/work_seconds=(\d+)/)?.[1]);
  assert.ok(uploadPhaseDeadline<=Math.min(workDeadline+300,uploadStarted+125),"the measured cap allows only local process-start granularity");
  assert.ok(uploadWorkSeconds>0&&uploadWorkSeconds<=105,"the 15-second reserve is inside the two-minute upload cap");
  assert.equal(cutoffs.upload,workDeadline+300,"admission uses the original absolute work cutoff");
  assert.equal(upload.action.status,0,upload.action.stderr);
  assert.equal(env.UPLOAD_OUTCOME,upload.outcome);
  assert.equal(upload.outcome,"success");
  const artifactStore=upload.artifactStore;
  const artifactId=env.ARTIFACT_ID,artifactDigest=env.ARTIFACT_DIGEST;
  assert.equal(artifactId,"123");
  assert.equal(artifactDigest,"d".repeat(64));
  const uploadedManifest=JSON.parse(readFileSync(join(artifactStore,"manifest.json"),"utf8"));
  assert.deepEqual(uploadedManifest,manifest);
  for(const entry of manifest.files){
    const uploaded=readFileSync(join(artifactStore,entry.path));
    assert.equal(createHashImpl("sha256").update(uploaded).digest("hex"),entry.sha256,entry.path);
  }
  assert.equal(existsSync(join(artifactStore,"upload-report.txt")),false);
  assert.equal(existsSync(join(artifactStore,"custody-outcome.txt")),false);

  const reportStarted=Math.floor(Date.now()/1000);
  result=runCombinedReport(root,env);
  assert.equal(result.status,0,`${result.stdout}\n${result.stderr}`);
  const sharedDeadline=Number(env.ORNIGAMI_TAIL_REPORT_CUSTODY_DEADLINE_EPOCH);
  const earliestReportCutoff=Math.min(reportStarted+300,cutoffs.custody);
  assert.ok(sharedDeadline>=earliestReportCutoff&&sharedDeadline<=Math.min(reportStarted+302,cutoffs.custody),"the shared report/custody deadline is the earlier local cap or original absolute cutoff, allowing process-start second granularity");
  assert.match(readFileSync(join(env.RUNNER_TEMP,"ornigami-tail-outcomes.local/upload-report.txt"),"utf8"),/report_status=passed\nupload_outcome=success\n.*custody_status=pending/s);

  result=runCombinedCustody(root,env);
  assert.equal(result.status,0,`${result.stdout}\n${result.stderr}`);
  const custodyReceipt=readFileSync(join(env.RUNNER_TEMP,"ornigami-tail-outcomes.local/custody-outcome.txt"),"utf8");
  assert.equal(env.CUSTODY_STEP_OUTCOME,"success");
  assert.match(custodyReceipt,/custody_status=verified/);
  assert.match(readFileSync(env.FAKE_COMBINED_GH_LOG,"utf8"),new RegExp(`api --hostname github\\.com repos/${env.GITHUB_REPOSITORY}/commits/${env.GITHUB_SHA}/statuses\\?per_page=100`));
  assert.match(custodyReceipt,new RegExp(`run_id=${env.GITHUB_RUN_ID}\\nrun_attempt=${env.GITHUB_RUN_ATTEMPT}\\nrequest_sha=${env.GITHUB_SHA}\\nartifact_id=${artifactId}\\nartifact_digest=${artifactDigest}\\nowner=owner`));
  assert.equal(Number(env.ORNIGAMI_TAIL_REPORT_CUSTODY_DEADLINE_EPOCH),sharedDeadline,"custody consumes the report's shared absolute deadline");
  assert.equal(existsSync(join(artifactStore,"custody-outcome.txt")),false);

  result=runCombinedCleanup(root,env,{script:runBlock("cleanup"),initialize:false});
  assert.equal(result.status,0,`${result.stdout}\n${result.stderr}`);
  applyGithubEnv(env);
  assert.deepEqual({
    capture:Number(env.ORNIGAMI_TAIL_CAPTURE_DEADLINE_EPOCH),
    upload:Number(env.ORNIGAMI_TAIL_UPLOAD_DEADLINE_EPOCH),
    custody:Number(env.ORNIGAMI_TAIL_CUSTODY_DEADLINE_EPOCH),
    cleanup:Number(env.ORNIGAMI_TAIL_CLEANUP_DEADLINE_EPOCH),
    reserved:Number(env.ORNIGAMI_TAIL_RESERVED_END_EPOCH),
  },cutoffs,"cleanup reuses the original work deadline and does not reset any phase cutoff");
  const finalCleanup=readFileSync(join(env.RUNNER_TEMP,"ornigami-tail-outcomes.local/workflow-cleanup-final.txt"),"utf8");
  assert.match(finalCleanup,/cleanup_status=passed/);
  assert.match(readFileSync(join(env.RUNNER_TEMP,"ornigami-tail-outcomes.local/workflow-cleanup.txt"),"utf8"),/cleanup_readback=container absence verified: owned-builder-id/);
  assert.match(readFileSync(join(env.RUNNER_TEMP,"ornigami-tail-outcomes.local/workflow-cleanup.txt"),"utf8"),/cleanup_readback=image absence verified: owned-image-id/);
  assert.match(readFileSync(dockerLog,"utf8"),/<rm><-f><owned-builder-id>/);
  assert.match(readFileSync(dockerLog,"utf8"),/<image><rm><owned-image-id>/);
  assert.equal(existsSync(join(artifactStore,"workflow-cleanup-final.txt")),false);
  assert.equal(existsSync(join(evidence,"upload-report.txt")),false);
  assert.equal(existsSync(join(evidence,"custody-outcome.txt")),false);
  assert.equal(existsSync(join(evidence,"workflow-cleanup-final.txt")),false);
}));

for(const scenario of [
  {name:"failed capture remains failed despite diagnostic custody",captureFailure:true,upload:"success",custody:"success"},
  {name:"failed upload reports failure and skips custody",upload:"fail",custody:"skipped"},
  {name:"upload admission exhaustion skips upload",upload:"skipped",custody:"skipped"},
  {name:"missing artifact identity fails custody",upload:"missing-identity",custody:"missing"},
  {name:"missing owner acknowledgment fails custody",upload:"success",custody:"missing"},
  {name:"mismatched owner acknowledgment fails custody",upload:"success",custody:"mismatch"},
  {name:"timed-out owner lookup fails custody",upload:"success",custody:"hang"},
  {name:"downstream budget exhaustion stops before report custody and cleanup work",upload:"success",custody:"failure",exhausted:true},
  {name:"cleanup child timeout leaves owned-resource absence unproved",upload:"success",custody:"success",cleanupTimeout:true},
])test(`combined failure sequence: ${scenario.name}`,()=>withSandbox(root=>{
  const fixture=prepareCombinedTail(root,{captureFailure:scenario.captureFailure});
  const {env,evidence,workDeadline,captureResult,manifest}=fixture;
  assert.ok(manifest,"capture must leave a manifest, including failure cases");
  if(scenario.captureFailure){
    assert.notEqual(captureResult.status,0);
    assert.equal(manifest.capture_completeness_status,"failed");
    assert.equal(manifest.security_acceptance,false);
  }else{
    assert.equal(captureResult.status,0);
    assert.equal(manifest.capture_completeness_status,"passed");
  }

  const upload=runCombinedUpload(root,env,{mode:scenario.upload,clockEpoch:scenario.upload==="skipped"?workDeadline+300:undefined});
  if(scenario.upload==="skipped"){
    assert.notEqual(upload.admission.status,0);
    assert.equal(upload.admitted,false);
    assert.equal(upload.action,null,"the fake action must not start without admission");
  }else if(scenario.upload==="fail"){
    assert.equal(upload.admission.status,0);
    assert.equal(upload.action.status,17);
    assert.equal(upload.outcome,"failure");
  }else{
    assert.equal(upload.admission.status,0);
    assert.equal(upload.action.status,0);
    assert.equal(upload.outcome,"success");
  }
  if(scenario.upload==="missing-identity")assert.equal(env.ARTIFACT_ID,"");

  let report;
  if(scenario.exhausted){
    // Upload already happened under the same work cutoff; move only the fake
    // wall clock to the shared report/custody boundary to test late admission.
    setCombinedClock(root,env,workDeadline+600);
    report=runCombinedReport(root,env);
    assert.notEqual(report.status,0);
    const reportReceipt=readFileSync(join(env.RUNNER_TEMP,"ornigami-tail-outcomes.local/upload-report.txt"),"utf8");
    assert.match(reportReceipt,/report_status=failed\nreason=insufficient_or_invalid_budget/);
    assert.equal(/ORNIGAMI_TAIL_REPORT_CUSTODY_DEADLINE_EPOCH=/.test(readFileSync(env.GITHUB_ENV,"utf8")),false,"late reporting cannot mint a fresh shared deadline");
  }else{
    report=runCombinedReport(root,env);
    assert.equal(report.status,0,`${report.stdout}\n${report.stderr}`);
    const reportReceipt=readFileSync(join(env.RUNNER_TEMP,"ornigami-tail-outcomes.local/upload-report.txt"),"utf8");
    assert.match(reportReceipt,new RegExp(`upload_outcome=${upload.outcome}`));
    if(upload.outcome!=="success")assert.match(reportReceipt,/custody_status=unavailable/);
  }

  let custody;
  if(scenario.exhausted){
    custody=runCombinedCustody(root,env,"success");
    assert.notEqual(custody.status,0,"custody after an exhausted shared cutoff must not start a lookup");
    assert.match(readFileSync(join(env.RUNNER_TEMP,"ornigami-tail-outcomes.local/custody-outcome.txt"),"utf8"),/custody_status=unproved\nreason=insufficient_or_invalid_budget/);
  }else{
    custody=runCombinedCustody(root,env,scenario.custody);
    if(scenario.custody==="skipped")assert.equal(custody.skipped,true);
    else if(scenario.custody==="success")assert.equal(custody.status,0);
    else assert.notEqual(custody.status,0);
  }
  const custodyReceipt=join(env.RUNNER_TEMP,"ornigami-tail-outcomes.local/custody-outcome.txt");
  if(scenario.custody==="success")assert.match(readFileSync(custodyReceipt,"utf8"),/custody_status=verified/);
  if(["missing","mismatch","hang"].includes(scenario.custody))assert.match(readFileSync(custodyReceipt,"utf8"),/custody_status=unproved/);

  const sharedBeforeCleanup=env.ORNIGAMI_TAIL_REPORT_CUSTODY_DEADLINE_EPOCH??"";
  const apiCallsBeforeCleanup=env.FAKE_COMBINED_GH_LOG&&existsSync(env.FAKE_COMBINED_GH_LOG)?readFileSync(env.FAKE_COMBINED_GH_LOG,"utf8").split(/\r?\n/).filter(Boolean).length:0;
  if(scenario.exhausted)setCombinedClock(root,env,workDeadline+719);
  const dockerLogBeforeCleanup=existsSync(fixture.dockerLog)?readFileSync(fixture.dockerLog,"utf8"):"";
  let cleanupScript=runBlock("cleanup");
  if(scenario.cleanupTimeout){
    env.FAKE_DOCKER_HANG_INSPECT="1";
    env.FAKE_DOCKER_HANG_PID=join(root,"combined-cleanup-hang.pid");
    env.FAKE_DOCKER_HANG_PROGRESS=join(root,"combined-cleanup-hang.progress");
    // Retain the production Docker-call and 30-second finalization reserve;
    // the 50-second fixture cap lets one 10-second command time out cleanly.
    cleanupScript=shortCleanupBudget(cleanupScript,50,30);
  }
  const cleanup=runCombinedCleanup(root,env,{script:cleanupScript});
  if(scenario.exhausted||scenario.cleanupTimeout)assert.notEqual(cleanup.status,0,`${cleanup.stdout}\n${cleanup.stderr}`);
  else assert.equal(cleanup.status,0,`${cleanup.stdout}\n${cleanup.stderr}`);
  const finalCleanup=readFileSync(join(env.RUNNER_TEMP,"ornigami-tail-outcomes.local/workflow-cleanup-final.txt"),"utf8");
  if(scenario.exhausted){
    assert.match(finalCleanup,/cleanup_status=failed/);
    assert.match(finalCleanup,/resource_absence=unproved_after_interruption/);
    assert.equal(existsSync(fixture.dockerLog)?readFileSync(fixture.dockerLog,"utf8"):"",dockerLogBeforeCleanup,"no cleanup Docker operation starts after its cutoff");
  }else if(scenario.cleanupTimeout){
    assert.match(finalCleanup,/cleanup_status=failed/);
    assert.match(finalCleanup,/docker_unproved=.*client_timeout_or_interruption/);
    assert.match(readFileSync(join(env.RUNNER_TEMP,"ornigami-tail-outcomes.local/workflow-cleanup.txt"),"utf8"),/later resource absence and daemon completion are not claimed/);
    const before=readFileSync(env.FAKE_DOCKER_HANG_PROGRESS,"utf8").length;
    spawnSync(bash,["-c","sleep 0.25"]);
    assert.equal(readFileSync(env.FAKE_DOCKER_HANG_PROGRESS,"utf8").length,before,"timed-out Docker child cannot continue after cleanup returns");
  }else assert.match(finalCleanup,/cleanup_status=passed/);
  assert.equal(env.CUSTODY_STEP_OUTCOME,scenario.custody==="skipped"?"skipped":scenario.custody==="success"?"success":"failure");
  assert.equal(env.ORNIGAMI_WORK_DEADLINE_EPOCH,String(workDeadline));
  assert.equal(env.ORNIGAMI_TAIL_REPORT_CUSTODY_DEADLINE_EPOCH??"",sharedBeforeCleanup,"cleanup must not reset the report/custody allowance");
  const apiCallsAfterCleanup=env.FAKE_COMBINED_GH_LOG&&existsSync(env.FAKE_COMBINED_GH_LOG)?readFileSync(env.FAKE_COMBINED_GH_LOG,"utf8").split(/\r?\n/).filter(Boolean).length:0;
  assert.equal(apiCallsAfterCleanup,apiCallsBeforeCleanup,"cleanup performs no second custody wait");
  assertCombinedReceiptsLocal(env,upload.artifactStore);
  if(scenario.captureFailure){
    assert.equal(manifest.capture_completeness_status,"failed","later diagnostic custody and cleanup cannot change the earlier capture gate");
    assert.equal(JSON.parse(readFileSync(join(upload.artifactStore,"manifest.json"),"utf8")).capture_completeness_status,"failed");
    assert.match(readFileSync(env.GITHUB_STEP_SUMMARY,"utf8"),/Diagnostic evidence only; this artifact does not establish application acceptance/);
    const applicationAccepted=captureResult.status===0&&manifest.capture_completeness_status==="passed"&&upload.action?.status===0&&custody.status===0;
    assert.equal(applicationAccepted,false,"diagnostic custody is not application acceptance");
  }
  if(scenario.upload==="fail")assert.match(finalCleanup,/custody_step_outcome=skipped/);
  if(scenario.upload==="skipped")assert.match(readFileSync(join(env.RUNNER_TEMP,"ornigami-tail-outcomes.local/upload-report.txt"),"utf8"),/upload_outcome=skipped[\s\S]*custody_status=unavailable/);
}));

test("tail supervisor enforces the absolute deadline and terminates a TERM-resistant real child", () => withSandbox(root => {
  const { env } = fakeEnvironment(root);
  initializeTailEnvironment(root, env);
  env.TAIL_CHILD_PROGRESS = join(root, "tail-child.progress");
  const script = `source "$ORNIGAMI_TAIL_HELPER"
now=$(date +%s)
ORNIGAMI_WORK_DEADLINE_EPOCH=$((now - 168))
ornigami_tail_resolve_phase capture 180 180 4
deadline=$ORNIGAMI_TAIL_PHASE_DEADLINE_EPOCH
if ornigami_tail_supervise capture "$deadline" 4 bash -c 'trap "" TERM; while :; do printf x >> "$TAIL_CHILD_PROGRESS"; sleep 0.1; done'; then rc=0; else rc=$?; fi
printf 'rc=%s outcome=%s event=%s\\n' "$rc" "$ORNIGAMI_TAIL_LAST_OUTCOME" "$(tail -n 1 "$ORNIGAMI_TAIL_EVENT_FILE")"
`;
  const result = runShell(root, script, env);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /rc=124 outcome=timed_out event=capture\|timeout\|/);
  const before = readFileSync(env.TAIL_CHILD_PROGRESS, "utf8").length;
  spawnSync(bash, ["-c", "sleep 0.25"]);
  assert.equal(readFileSync(env.TAIL_CHILD_PROGRESS, "utf8").length, before);
}));

test("tail supervisor classifies late starts and worker exit 124 without stale timeout events", () => withSandbox(root => {
  const { env } = fakeEnvironment(root);
  initializeTailEnvironment(root, env);
  env.TAIL_CHILD_STARTED = join(root, "late-child.started");
  const script = `source "$ORNIGAMI_TAIL_HELPER"
now=$(date +%s)
if ornigami_tail_supervise capture "$((now + 20))" 4 bash -c 'exit 124'; then normal_rc=0; else normal_rc=$?; fi
normal_outcome=$ORNIGAMI_TAIL_LAST_OUTCOME
normal_event=$(tail -n 1 "$ORNIGAMI_TAIL_EVENT_FILE")
now=$(date +%s)
if ornigami_tail_supervise capture "$((now + 1))" 2 bash -c 'touch "$TAIL_CHILD_STARTED"'; then late_rc=0; else late_rc=$?; fi
printf 'normal_rc=%s normal_outcome=%s normal_event=%s late_rc=%s late_outcome=%s late_event=%s child_started=%s\\n' \\
  "$normal_rc" "$normal_outcome" "$normal_event" "$late_rc" "$ORNIGAMI_TAIL_LAST_OUTCOME" "$(tail -n 1 "$ORNIGAMI_TAIL_EVENT_FILE")" \\
  "$(test -e "$TAIL_CHILD_STARTED" && printf yes || printf no)"
`;
  const result = runShell(root, script, env);
  assert.equal(result.status, 0, `${result.stdout}\\n${result.stderr}`);
  assert.match(result.stdout, /normal_rc=124 normal_outcome=worker_exit normal_event=capture\|worker-exit\|124\|/);
  assert.match(result.stdout, /late_rc=124 late_outcome=deadline_exhausted_before_start late_event=capture\|timeout\|[^ ]+\|before_start child_started=no/);
}));

test("markerless supervisor timeout becomes a failed capture manifest", () => withSandbox(root => {
  const { env } = fakeEnvironment(root);
  const realTimeout = spawnSync(bash, ["-c", "command -v timeout"], { encoding: "utf8", env });
  assert.equal(realTimeout.status, 0, realTimeout.stderr);
  env.FAKE_REAL_TIMEOUT = realTimeout.stdout.trim();
  const script = `timeout() { for arg in "$@"; do [[ "$arg" == tail-worker ]] && return 124; done; "$FAKE_REAL_TIMEOUT" "$@"; }
export -f timeout
${runBlock("evidence_capture")}`;
  const result = runEvidenceCapture(root, env, { script });
  assert.equal(result.status, 124, `${result.stdout}\\n${result.stderr}\\nevents=${existsSync(env.ORNIGAMI_TAIL_EVENT_FILE) ? readFileSync(env.ORNIGAMI_TAIL_EVENT_FILE, "utf8") : "missing"}`);
  const evidence = env.ORNIGAMI_EVIDENCE_DIR;
  assert.match(readFileSync(join(evidence, "capture-supervision-status.txt"), "utf8"), /status=failed\nreason=supervisor_timeout/);
  const manifest = JSON.parse(readFileSync(join(evidence, "manifest.json"), "utf8"));
  assert.equal(manifest.capture_completeness_status, "failed");
  assert.equal(manifest.capture_supervisor_status, "supervisor_timeout");
  assert.match(readFileSync(env.ORNIGAMI_TAIL_EVENT_FILE, "utf8"), /capture\|timeout\|[^|]+\|marker_missing/);
}));

test("evidence capture bounds a hung host-side Docker child and retains an explicit partial-failure receipt", () => withSandbox(root => {
  const { env } = fakeEnvironment(root, { FAKE_DOCKER_HANG_INSPECT: "1" });
  env.FAKE_DOCKER_HANG_PID = join(root, "hung-docker.pid");
  env.FAKE_DOCKER_HANG_PROGRESS = join(root, "hung-docker.progress");
  const shortened = runBlock("evidence_capture")
    .replace("ornigami_tail_resolve_phase capture 180 180 20", "ornigami_tail_resolve_phase capture 6 180 3")
    .replace('ornigami_tail_supervise capture "$capture_deadline" 20', 'ornigami_tail_supervise capture "$capture_deadline" 3')
    .replace("--kill-after=1s 5s bash -c", "--kill-after=1s 1s bash -c");
  assert.notEqual(shortened, runBlock("evidence_capture"));
  const result = runEvidenceCapture(root, env, { script: shortened });
  assert.equal(result.status, 124, `${result.stdout}\n${result.stderr}`);
  const evidence = env.ORNIGAMI_EVIDENCE_DIR;
  assert.match(readFileSync(join(evidence, "capture-supervision-status.txt"), "utf8"), /status=failed\nreason=supervisor_timeout/);
  const manifest = JSON.parse(readFileSync(join(evidence, "manifest.json"), "utf8"));
  assert.equal(manifest.capture_completeness_status, "failed");
  assert.equal(manifest.capture_supervisor_status, "supervisor_timeout");
  assert.ok(existsSync(join(evidence, "runner/owned-resources.txt")), "available partial evidence is retained");
  const before = readFileSync(env.FAKE_DOCKER_HANG_PROGRESS, "utf8").length;
  spawnSync(bash, ["-c", "sleep 0.25"]);
  assert.equal(readFileSync(env.FAKE_DOCKER_HANG_PROGRESS, "utf8").length, before);
}));

test("evidence capture rejects malformed and exhausted tail inputs before capture", () => withSandbox(root => {
  for (const [label, workDeadline, expected, reason] of [
    ["malformed", "invalid", 2, "invalid_budget"],
    ["exhausted", String(Math.floor(Date.now() / 1000) - 961), 124, "deadline_exhausted"],
  ]) {
    const caseRoot = join(root, label);
    mkdirSync(caseRoot, { recursive: true });
    const { env } = fakeEnvironment(caseRoot);
    const result = runEvidenceCapture(caseRoot, env, { afterInitialize: () => { env.ORNIGAMI_WORK_DEADLINE_EPOCH = workDeadline; } });
    assert.equal(result.status, expected, `${label}: ${result.stderr}`);
    const evidence = env.ORNIGAMI_EVIDENCE_DIR;
    assert.equal(existsSync(join(evidence, "manifest.json")), false, `${label} must stop before claiming a captured manifest`);
    assert.equal(existsSync(join(evidence, "capture-supervision-status.txt")), false);
    assert.match(result.stderr, new RegExp(`stopped before worker start: ${reason}`));
  }
}));

test('failed initialization with neither exported path still retains a failed capture manifest', () => withSandbox(root => {
  const { env } = fakeEnvironment(root, { RUNTIME_OUTCOME:'skipped', IMAGE_BUILD_OUTCOME:'skipped', ADMISSION_OUTCOME:'skipped' });
  delete env.ORNIGAMI_EVIDENCE_DIR; delete env.ORNIGAMI_JOB_SUMMARY;
  const result = runEvidenceCapture(root, env, { afterInitialize: () => rmSync(join(env.RUNNER_TEMP, "ornigami-job-summary.md"), { force: true }) });
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
    const result = runEvidenceCapture(root, env);
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
    const result = runEvidenceCapture(root, env);
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
    const result=runEvidenceCapture(root,env);
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
    const result=runEvidenceCapture(root,env);
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
    const result=runShell(root,runImageBuildFixtureBlock(),env);
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
  const captured = runEvidenceCapture(root, env);
  assert.equal(captured.status, 0, captured.stderr);
  verifyManifest(env.ORNIGAMI_EVIDENCE_DIR);
}));

test('failed runtime preserves available snapshots, exact assertion/status/body/log/exit before manifest', () => withSandbox(root => {
  const { env } = fakeEnvironment(root, { RUNTIME_OUTCOME: 'failure', RUNTIME_EXIT_CODE: '23' });
  fixtureRuntime(root, env, { failure: true });
  const runtimeResult = runShell(root, runBlock('runtime_acceptance'), env);
  assert.equal(runtimeResult.status, 23, runtimeResult.stderr);
  const captured = runEvidenceCapture(root, env);
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
  assert.equal(runEvidenceCapture(root, env).status, 1);
  const manifest = JSON.parse(readFileSync(join(env.ORNIGAMI_EVIDENCE_DIR, 'manifest.json'), 'utf8'));
  assert.ok(manifest.runtime_snapshot_status.includes('runtime-after-restart-cgroup.txt=unavailable'));
}));

for (const missing of [false, true]) test(`skipped stages with ${missing ? 'missing' : 'empty'} persistent summary fail capture with nonempty diagnostic and manifest`, () => withSandbox(root => {
  const { env } = fakeEnvironment(root, { RUNTIME_OUTCOME: 'skipped', IMAGE_BUILD_OUTCOME: 'skipped' });
  const result = runEvidenceCapture(root, env, { afterInitialize: () => {
    if (missing) rmSync(env.ORNIGAMI_JOB_SUMMARY); else writeFileSync(env.ORNIGAMI_JOB_SUMMARY, '');
  } });
  assert.equal(result.status, 1, result.stderr);
  const manifest = JSON.parse(readFileSync(join(env.ORNIGAMI_EVIDENCE_DIR, 'manifest.json'), 'utf8'));
  assert.equal(manifest.summary_evidence_status, 'missing-or-empty'); assert.equal(manifest.runtime_evidence_status, 'not-run');
  assert.match(readFileSync(join(env.ORNIGAMI_EVIDENCE_DIR, 'step-summary.md'), 'utf8'), /Incomplete evidence capture/);
}));
test('resource gate runs after an available builder even when image build failed',()=>{
  const step=workflow.slice(workflow.indexOf('      - name: Reject build-time OOM'),workflow.indexOf('      - name: Enforce pinned base'));
  assert.match(step,/always\(\) && (?:env\.ORNIGAMI_TRIAL_SCOPE == 'full' && )?steps\.buildkit\.outcome == 'success'/);
  assert.doesNotMatch(step,/steps\.image_build\.outcome == 'success'/);
});

for(const outcome of ['success','failure','skipped','missing-diagnostics','tampered-original','missing-publication','mutable-download','publication-source-drift'])test(`shared DB ${outcome} capture keeps manifest and custody separate`,()=>withSandbox(root=>{
 const bad=['missing-diagnostics','tampered-original','missing-publication','mutable-download','publication-source-drift'].includes(outcome);
 const {env}=fakeEnvironment(root,{RUNTIME_OUTCOME:'skipped',DATABASE_ADMISSION_OUTCOME:bad?'failure':outcome});
 const dir=join(env.ORNIGAMI_EVIDENCE_DIR,'stage-scans/database-admission');
 if(outcome!=='skipped'&&outcome!=='missing-diagnostics'){
  mkdirSync(dir,{recursive:true});const raw='{"Version":2}';writeFileSync(join(dir,'metadata.original.bin'),raw);
  const publicationPath=join(dir,'../db-publication.json');
  recordOfficialPublication(outcome==='publication-source-drift'?'d'.repeat(40):env.SOURCE_SHA,publicationPath);
  if(outcome==='missing-publication')rmSync(publicationPath);
  writeFileSync(join(dir,'../database-resources.json'),JSON.stringify({arguments:['image','--download-db-only','--db-repository',outcome==='mutable-download'?'ghcr.io/aquasecurity/trivy-db:2':databaseRepository]}));
  for(const name of ['clock.json','validation-clock.json','metadata-identity.json','databaseIdentity.json','scannerIdentity.json'])writeFileSync(join(dir,name),JSON.stringify({fixture:true}));
  writeFileSync(join(dir,'index.json'),JSON.stringify({phase:'complete',sourceSha:env.SOURCE_SHA,result:outcome==='success'?'passed':'failed',metadataIdentity:{sha256:createHash(raw),bytes:Buffer.byteLength(raw),retainedBytes:Buffer.byteLength(raw),retainedSha256:createHash(raw),truncated:false}}));
  if(outcome==='tampered-original')writeFileSync(join(dir,'metadata.original.bin'),raw+'tampered');
 }
 const result=runEvidenceCapture(root,env);assert.equal(result.status,bad?1:0,result.stderr);
 const manifest=JSON.parse(readFileSync(join(env.ORNIGAMI_EVIDENCE_DIR,'manifest.json'),'utf8'));assert.equal(manifest.custody_status,'not-assessed-by-capture');
 assert.equal(manifest.capture_completeness_status,bad?'failed':'passed');assert.match(manifest.database_diagnostics_status,outcome==='skipped'?/not-run/:bad?/failed:/:/collected/);
 for(const file of manifest.files)assert.equal(createHash(readFileSync(join(env.ORNIGAMI_EVIDENCE_DIR,file.path))),file.sha256);
}));

for (const scenario of ['truncated', 'wrong-type', 'wrong-source', 'missing-receipts']) test(`scan capture preserves manifest and fails on ${scenario}`, () => withSandbox(root => {
  const {env}=fakeEnvironment(root,{RUNTIME_OUTCOME:'skipped'});
  const dir=join(env.ORNIGAMI_EVIDENCE_DIR,'stage-scans');mkdirSync(dir,{recursive:true});
  const expected=['original-base','original-runtime-base','build-base','deps','builder','prod-deps','runner','buildkit','dockerfile-frontend'];
  const data={schema:1,sourceSha:scenario==='wrong-source'?'c'.repeat(40):env.SOURCE_SHA,expectedStages:expected,result:'failed',stages:expected.map(stage=>({stage,result:'failed',collectionComplete:scenario==='missing-receipts'}))};
  const original=scenario==='truncated'?'{"stages":[':scenario==='wrong-type'?'[]':JSON.stringify(data);
  writeFileSync(join(dir,'index.json'),original);
  const result=runEvidenceCapture(root,env);assert.equal(result.status,1,result.stderr);
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
    const result = runShell(root, runBuildkitFixtureBlock(), env);
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
    const result = runShell(root, runBuildkitFixtureBlock(), env);
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
  const script = runBuildkitFixtureBlock();
  assert.match(script, /grep -Fxq "\$builder_state_volume"/);
  assert.match(script, /--filter "name=\^\/buildx_buildkit_\$\{builder\}0\$"/);
  assert.match(script, /\[\[ "\$container_name" == "\/buildx_buildkit_\$\{builder\}0" \]\]/);
  assert.match(script, /\[\[ "\$state_volume" == "\$builder_state_volume"/);
});

test("cleanup preserves foreign builder, state volume, and image IDs", () => {
  withSandbox((root) => {
    const { env, dockerLog, runnerTemp } = fakeEnvironment(root);
    writeFileSync(join(runnerTemp, "ornigami-image.tar"), "local-only archive");
    const result = runCleanup(root, env);
    assert.equal(result.status, 1, result.stderr);
    const log = readFileSync(dockerLog, "utf8");
    assert.doesNotMatch(log, /<rm><-f><owned-builder-id>/);
    assert.doesNotMatch(log, /<volume><rm><buildx_buildkit_ornigami-external-rehearsal0_state>/);
    assert.doesNotMatch(log, /<image><rm>/);
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
    const result = runCleanup(root, env);
    assert.equal(result.status, 0, result.stderr);
    const log = readFileSync(dockerLog, "utf8");
    assert.match(log, /<rm><-f><owned-builder-id>/);
    assert.match(log, /<volume><rm><buildx_buildkit_ornigami-external-rehearsal0_state>/);
    assert.match(log, /<image><rm><owned-image-id>/);
    assert.doesNotMatch(log, /<buildx><rm>/);
    assert.match(readFileSync(join(runnerTemp,"ornigami-tail-outcomes.local","workflow-cleanup-final.txt"),"utf8"),/cleanup_status=passed/);
    assert.match(readFileSync(join(runnerTemp,"ornigami-tail-outcomes.local","workflow-cleanup.txt"),"utf8"),/daemon identity\/configuration unchanged/);
  });
});

for (const [name, overrides, expected] of [
  ['successful no-op deletion', {FAKE_REMOVAL_NOOP:'1'}, /still present/],
  ['removal error', {FAKE_REMOVAL_FAIL:'1'}, /builder removal failed/],
  ['unavailable resource inventory', {FAKE_DOCKER_INVENTORY_FAIL:'1'}, /inventory unavailable/],
  ['daemon configuration drift', {FAKE_DAEMON_INFO:'different-daemon'}, /daemon identity\/configuration drifted/],
  ['unavailable daemon read-back', {FAKE_DAEMON_INFO_FAIL:'1'}, /daemon identity\/configuration read-back unavailable: Docker info failed/],
]) test(`actual cleanup workflow fails on ${name}`, () => withSandbox(root => {
  const {env}=fakeEnvironment(root, {FAKE_INSPECTED_BUILDER_ID:'owned-builder-id',FAKE_INSPECTED_IMAGE_ID:'owned-image-id',...overrides});
  const result=runCleanup(root,env);
  assert.equal(result.status,1,result.stderr);
  assert.match(result.stdout,expected);
  assert.match(result.stdout,/cleanup_readback=result=1/);
  assert.doesNotMatch(readFileSync(env.FAKE_DOCKER_LOG,'utf8'), /<prune>|<buildx><rm>/);
}));

test("cleanup reports unavailable daemon read-back when its initial snapshot is missing", () => withSandbox(root => {
  const {env,runnerTemp}=fakeEnvironment(root,{FAKE_INSPECTED_BUILDER_ID:'owned-builder-id',FAKE_INSPECTED_IMAGE_ID:'owned-image-id'});
  rmSync(join(runnerTemp,"ornigami-daemon-before.txt"));
  const result=runCleanup(root,env);
  assert.equal(result.status,1,result.stderr);
  assert.match(result.stdout,/daemon identity\/configuration read-back unavailable: initial snapshot missing/);
  assert.doesNotMatch(readFileSync(env.FAKE_DOCKER_LOG,"utf8"),/<info>/,"read-back must not start without its before snapshot");
  assert.match(readFileSync(join(runnerTemp,"ornigami-tail-outcomes.local","workflow-cleanup-final.txt"),"utf8"),/cleanup_status=failed/);
}));

test("cleanup stops a TERM-resistant Docker client and leaves absence unproved", () => withSandbox(root => {
  const {env}=fakeEnvironment(root,{FAKE_INSPECTED_BUILDER_ID:'owned-builder-id',FAKE_INSPECTED_IMAGE_ID:'owned-image-id',FAKE_DOCKER_HANG_INSPECT:'1'});
  env.FAKE_DOCKER_HANG_PID=join(root,'cleanup-docker.pid');
  env.FAKE_DOCKER_HANG_PROGRESS=join(root,'cleanup-docker.progress');
  const script=runBlock('cleanup').replace('call_seconds=10','call_seconds=1');
  assert.notEqual(script,runBlock('cleanup'));
  const result=runCleanup(root,env,script);
  assert.equal(result.status,1,result.stderr);
  assert.match(readFileSync(env.RUNNER_TEMP+'/ornigami-cleanup-docker-unproved.txt','utf8'),/docker_unproved=client_timeout_or_interruption/);
  assert.match(readFileSync(env.RUNNER_TEMP+'/ornigami-tail-outcomes.local/workflow-cleanup-final.txt','utf8'),/cleanup_status=failed/);
  const cleanupReceipt=readFileSync(join(env.RUNNER_TEMP,'ornigami-tail-outcomes.local/workflow-cleanup.txt'),'utf8');
  assert.match(cleanupReceipt,/daemon identity\/configuration read-back skipped after prior Docker uncertainty; daemon state unproved/);
  assert.match(cleanupReceipt,/absence unproved after Docker timeout/);
  assert.doesNotMatch(readFileSync(env.FAKE_DOCKER_LOG,'utf8'),/<info>/,"prior uncertainty fences daemon read-back instead of making another Docker call");
  const before=readFileSync(env.FAKE_DOCKER_HANG_PROGRESS,'utf8').length;
  spawnSync(bash,['-c','sleep 0.25']);
  assert.equal(readFileSync(env.FAKE_DOCKER_HANG_PROGRESS,'utf8').length,before);
}));

test("cleanup supervisor terminates hung host-side work and records interrupted finalization", () => withSandbox(root => {
  const {env}=fakeEnvironment(root);
  env.CLEANUP_HOST_PROGRESS=join(root,'cleanup-host.progress');
  const script=shortCleanupBudget(runBlock('cleanup'))
    .replace('cleanup_record() {', `cleanup_record() { bash -c 'trap "" TERM; while :; do printf x >> "$CLEANUP_HOST_PROGRESS"; sleep 0.1; done'`);
  assert.notEqual(script,runBlock('cleanup'));
  const result=runCleanup(root,env,script);
  assert.equal(result.status,1,result.stderr);
  const receipt=readFileSync(env.RUNNER_TEMP+'/ornigami-tail-outcomes.local/workflow-cleanup-final.txt','utf8');
  assert.match(receipt,/cleanup_status=failed/);
  assert.match(receipt,/reason=supervisor_timeout/);
  assert.match(receipt,/resource_absence=unproved_after_interruption/);
  const before=readFileSync(env.CLEANUP_HOST_PROGRESS,'utf8').length;
  spawnSync(bash,['-c','sleep 0.25']);
  assert.equal(readFileSync(env.CLEANUP_HOST_PROGRESS,'utf8').length,before);
}));

test("descendant cleanup Docker calls stay within ten seconds and the finalization reserve", () => withSandbox(root => {
  const marker=join(root,'docker-unproved.txt');writeFileSync(marker,'');
  const previousDeadline=process.env.ORNIGAMI_CLEANUP_DEADLINE_EPOCH;
  const previousMarker=process.env.ORNIGAMI_CLEANUP_UNPROVED_FILE;
  try {
    const deadline=Math.ceil(Date.now()/1000)+60;
    process.env.ORNIGAMI_CLEANUP_DEADLINE_EPOCH=String(deadline);
    process.env.ORNIGAMI_CLEANUP_UNPROVED_FILE=marker;
    let command,args,options;
    const completed=workflowCleanupDocker(['image','ls'],{now:()=>deadline*1000-39000,invoke:(bin,argv,opts)=>{command=bin;args=argv;options=opts;return {status:0,signal:null,error:null,stdout:'',stderr:''};}});
    assert.equal(completed.status,0);
    assert.equal(options.timeout,9000);
    assert.equal(options.killSignal,'SIGKILL');
    assert.equal(command,'timeout');
    assert.deepEqual(args.slice(0,4),['--signal=TERM','--kill-after=2s','6s','docker']);
    const stopped=workflowCleanupDocker(['image','rm','sha256:'+ 'a'.repeat(64)],{now:()=>deadline*1000-29000,invoke:()=>assert.fail('operation must not start inside the finalization reserve')});
    assert.notEqual(stopped.status,0);
    assert.match(readFileSync(marker,'utf8'),/docker_unproved=insufficient-time-before-finalization-reserve/);
  } finally {
    if(previousDeadline===undefined)delete process.env.ORNIGAMI_CLEANUP_DEADLINE_EPOCH;else process.env.ORNIGAMI_CLEANUP_DEADLINE_EPOCH=previousDeadline;
    if(previousMarker===undefined)delete process.env.ORNIGAMI_CLEANUP_UNPROVED_FILE;else process.env.ORNIGAMI_CLEANUP_UNPROVED_FILE=previousMarker;
  }
}));

test("descendant cleanup records GNU timeout statuses and preserves ordinary outcomes", () => withSandbox(root => {
  const previousDeadline=process.env.ORNIGAMI_CLEANUP_DEADLINE_EPOCH;
  const previousMarker=process.env.ORNIGAMI_CLEANUP_UNPROVED_FILE;
  try {
    const deadline=Math.ceil(Date.now()/1000)+60;
    process.env.ORNIGAMI_CLEANUP_DEADLINE_EPOCH=String(deadline);
    for(const status of [124,137]){
      const marker=join(root,`docker-unproved-${status}.txt`);writeFileSync(marker,'');
      process.env.ORNIGAMI_CLEANUP_UNPROVED_FILE=marker;
      let invoked=0;
      const timedOut=workflowCleanupDocker(['image','rm','sha256:'+ 'a'.repeat(64)],{invoke:()=>{invoked++;return {status,signal:null,error:null,stdout:'',stderr:''};}});
      assert.equal(timedOut.status,status);
      assert.equal(readFileSync(marker,'utf8'),'docker_unproved=docker-client-timeout-or-interruption\n');
      const fenced=workflowCleanupDocker(['image','ls'],{invoke:()=>{invoked++;assert.fail('marked uncertainty must fence later Docker work');}});
      assert.notEqual(fenced.status,0);
      assert.equal(invoked,1);
    }

    const successMarker=join(root,'docker-success.txt');writeFileSync(successMarker,'');
    process.env.ORNIGAMI_CLEANUP_UNPROVED_FILE=successMarker;
    const success=workflowCleanupDocker(['image','ls'],{invoke:()=>({status:0,signal:null,error:null,stdout:'',stderr:''})});
    assert.equal(success.status,0);
    assert.equal(readFileSync(successMarker,'utf8'),'');

    const errorMarker=join(root,'docker-ordinary-error.txt');writeFileSync(errorMarker,'');
    process.env.ORNIGAMI_CLEANUP_UNPROVED_FILE=errorMarker;
    const ordinaryError=workflowCleanupDocker(['image','ls'],{invoke:()=>({status:1,signal:null,error:null,stdout:'',stderr:'ordinary Docker failure'})});
    assert.equal(ordinaryError.status,1);
    assert.equal(readFileSync(errorMarker,'utf8'),'');

    // Without a work deadline the helper invokes Docker directly; a numeric
    // command failure remains a caller-visible failure and is not GNU-timeout custody.
    delete process.env.ORNIGAMI_CLEANUP_DEADLINE_EPOCH;
    const standalone=workflowCleanupDocker(['image','ls'],{invoke:(bin)=>{assert.equal(bin,'docker');return {status:124,signal:null,error:null,stdout:'',stderr:''};}});
    assert.equal(standalone.status,124);
    assert.equal(readFileSync(errorMarker,'utf8'),'');
  } finally {
    if(previousDeadline===undefined)delete process.env.ORNIGAMI_CLEANUP_DEADLINE_EPOCH;else process.env.ORNIGAMI_CLEANUP_DEADLINE_EPOCH=previousDeadline;
    if(previousMarker===undefined)delete process.env.ORNIGAMI_CLEANUP_UNPROVED_FILE;else process.env.ORNIGAMI_CLEANUP_UNPROVED_FILE=previousMarker;
  }
}));

test("owned-image cleanup stops after a GNU timeout without claiming absence", () => withSandbox(root => {
  const previousDeadline=process.env.ORNIGAMI_CLEANUP_DEADLINE_EPOCH;
  const previousMarker=process.env.ORNIGAMI_CLEANUP_UNPROVED_FILE;
  const marker=join(root,'docker-unproved.txt');writeFileSync(marker,'');
  const first='sha256:'+ 'a'.repeat(64),second='sha256:'+ 'b'.repeat(64);
  const calls=[];
  try {
    process.env.ORNIGAMI_CLEANUP_DEADLINE_EPOCH=String(Math.ceil(Date.now()/1000)+60);
    process.env.ORNIGAMI_CLEANUP_UNPROVED_FILE=marker;
    const fakeDocker=(bin,args)=>{
      assert.equal(bin,'timeout');
      const operation=['docker',...args.slice(4)].join(' ');calls.push(operation);
      if(operation==='docker image ls --all --quiet --no-trunc')return {status:0,signal:null,error:null,stdout:`${first}\n${second}\n`,stderr:''};
      if(operation===`docker image inspect ornigami:first --format {{.Id}}`)return {status:0,signal:null,error:null,stdout:`${first}\n`,stderr:''};
      if(operation===`docker image rm ${first}`)return {status:124,signal:null,error:null,stdout:'',stderr:''};
      assert.fail(`unexpected Docker invocation after uncertainty: ${operation}`);
    };
    const invoke=args=>workflowCleanupDocker(args,{invoke:fakeDocker});
    const results=cleanupOwnedImages([
      {stage:'first',ownedImage:true,imageId:first,reference:'ornigami:first'},
      {stage:'second',ownedImage:true,imageId:second,reference:'ornigami:second'},
    ],invoke);
    assert.match(readFileSync(marker,'utf8'),/^docker_unproved=docker-client-timeout-or-interruption\ndocker_unproved=prior-timeout-or-invalid-deadline\n$/);
    assert.deepEqual(calls,[
      'docker image ls --all --quiet --no-trunc',
      'docker image inspect ornigami:first --format {{.Id}}',
      `docker image rm ${first}`,
    ]);
    assert.equal(results[0].result,'failed');
    assert.equal(results[0].removalExit,124);
    assert.equal(results[0].absenceVerified,false);
    assert.match(results[0].error,/uncertain; absence unproved/);
    assert.equal(results[1].result,'failed');
    assert.equal(results[1].absenceVerified,undefined);
    assert.match(results[1].error,/Image inventory unavailable/);
  } finally {
    if(previousDeadline===undefined)delete process.env.ORNIGAMI_CLEANUP_DEADLINE_EPOCH;else process.env.ORNIGAMI_CLEANUP_DEADLINE_EPOCH=previousDeadline;
    if(previousMarker===undefined)delete process.env.ORNIGAMI_CLEANUP_UNPROVED_FILE;else process.env.ORNIGAMI_CLEANUP_UNPROVED_FILE=previousMarker;
  }
}));

test("cleanup supervisor bounds an interrupted tooling child without treating partial receipts as success", () => withSandbox(root => {
  const {env,runnerTemp}=fakeEnvironment(root);
  env.FAKE_HANG_TOOL_CLEANUP='1';
  env.FAKE_TOOL_PROGRESS=join(root,'cleanup-tool.progress');
  const nodeShim=join(runnerTemp,'node-v22.23.3-linux-x64','bin','node');
  writeExecutable(nodeShim,`#!/usr/bin/env bash
for arg in "$@"; do
  if [[ "$arg" == *toolchain-build.mjs && \${FAKE_HANG_TOOL_CLEANUP:-0} == 1 ]]; then
    trap '' TERM
    while :; do printf x >> "$FAKE_TOOL_PROGRESS"; sleep 0.1; done
  fi
done
exec "$TEST_REAL_NODE" "$@"
`);
  const result=runCleanup(root,env,shortCleanupBudget(runBlock('cleanup')));
  assert.equal(result.status,1,result.stderr);
  assert.match(readFileSync(env.RUNNER_TEMP+'/ornigami-tail-outcomes.local/workflow-cleanup-final.txt','utf8'),/reason=supervisor_timeout/,`${result.stdout}\n${readFileSync(env.GITHUB_STEP_SUMMARY,'utf8')}`);
  assert.doesNotMatch(readFileSync(env.RUNNER_TEMP+'/ornigami-tail-outcomes.local/workflow-cleanup-final.txt','utf8'),/cleanup_status=passed/);
  const before=readFileSync(env.FAKE_TOOL_PROGRESS,'utf8').length;
  spawnSync(bash,['-c','sleep 0.25']);
  assert.equal(readFileSync(env.FAKE_TOOL_PROGRESS,'utf8').length,before);
}));

test("cleanup fails closed when its absolute phase deadline is exhausted", () => withSandbox(root => {
  const {env,dockerLog}=fakeEnvironment(root);
  initializeTailEnvironment(root,env);
  env.ORNIGAMI_WORK_DEADLINE_EPOCH=String(Math.floor(Date.now()/1000)-721);
  const result=runCleanup(root,env,runBlock('cleanup'),{initialize:false});
  assert.equal(result.status,1,result.stderr);
  assert.match(readFileSync(env.RUNNER_TEMP+'/ornigami-tail-outcomes.local/workflow-cleanup-final.txt','utf8'),/reason=insufficient_or_invalid_budget/);
  assert.equal(existsSync(dockerLog),false,'no Docker operation starts after the absolute cleanup deadline');
}));

test("cleanup treats a worker interrupted during receipt finalization as unproved", () => withSandbox(root => {
  const {env}=fakeEnvironment(root,{FAKE_INSPECTED_BUILDER_ID:'owned-builder-id',FAKE_INSPECTED_IMAGE_ID:'owned-image-id'});
  const script=runBlock('cleanup').replace(
    'mv -f -- "$cleanup_final.tmp" "$cleanup_final"\nexit "$cleanup_failed"',
    'kill -KILL "$BASHPID"\n          exit "$cleanup_failed"',
  );
  assert.notEqual(script,runBlock('cleanup'));
  const result=runCleanup(root,env,script);
  assert.equal(result.status,1,result.stderr);
  const receipt=readFileSync(env.RUNNER_TEMP+'/ornigami-tail-outcomes.local/workflow-cleanup-final.txt','utf8');
  assert.match(receipt,/cleanup_status=failed/);
  assert.match(receipt,/resource_absence=unproved_after_interruption/);
}));
