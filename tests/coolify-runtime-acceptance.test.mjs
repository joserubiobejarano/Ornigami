import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

const harnessPath = resolve("deploy/coolify/linux-runtime-acceptance.sh");
const deadlinePath = resolve("deploy/coolify/runtime-deadline.sh");
const harness = readFileSync(harnessPath, "utf8");
const pythonBlocks = [...harness.matchAll(/<<'PY'\n([\s\S]*?)\nPY/g)].map((match) => match[1]);
const receiptWriter = pythonBlocks.find((block) => block.includes('"runtime-http.json"'));
const failureWriter = pythonBlocks.find((block) => block.includes('"failure-evidence.txt"'));
const cleanupFailureWriter = harness.match(/python3 - "\$report" "\$status" "\$report_dir" <<'PY'(?:[ \t]+\|\|[^\r\n]*)?\r?\n([\s\S]*?)\r?\nPY/)?.[1];
const python = process.env.PYTHON3 ?? (process.platform === "win32" ? "python" : "python3");
const bash = process.env.BASH ?? (process.platform === "win32" ? "C:/Program Files/Git/bin/bash.exe" : "bash");

assert.ok(receiptWriter, "runtime receipt Python writer must be present");
assert.ok(failureWriter, "failure receipt Python writer must be present");
assert.ok(cleanupFailureWriter, "late cleanup failure receipt writer must be present");

// R1/R2 regression extractors: the harness must drive the Distroless runtime through the
// shipped Node probes (`runtime-probes.mjs`), never through shell utilities, and must
// gate acceptance on complete native image-format evidence.
const captureCgroupSlice = harness.slice(harness.indexOf("capture_cgroup() {"), harness.indexOf("\nassert_cgroup_metrics() {"));
const identitySlice = harness.slice(harness.indexOf('runtime_uid=$(docker exec "$name"'), harness.indexOf("readonly_result="));
const diskProbeInvocation = harness.match(/docker exec "\$name" node \/app\/deploy\/coolify\/runtime-probes\.mjs disk >"\$report_dir\/runtime-disk\.txt" 2>&1/)?.[0] ?? "";
const nativeBlockStart = harness.indexOf("native_validation_status=");
const nativeDiagnosticRm = 'rm -f -- "$report_dir/native-image-formats.stderr" "$report_dir/native-format-validation.err"';
const nativeBlock = nativeBlockStart >= 0
  ? harness.slice(nativeBlockStart, harness.indexOf(nativeDiagnosticRm, nativeBlockStart) + nativeDiagnosticRm.length)
  : "";
const sanitizeFileSlice = harness.slice(harness.indexOf("sanitize_file() {"), harness.indexOf("\ncapture_cgroup() {"));
const finalGateSlice = harness.slice(harness.indexOf("if [[ $cold_http_failed == true ||"), harness.indexOf("finished_epoch=$(date +%s)"));
const runtimePython = (() => {
  const result = spawnSync(python, ["-c", "import sys; print(sys.executable)"], { encoding: "utf8" });
  const executable = (result.stdout ?? "").trim().split(/\r|\n/)[0]?.trim() ?? "";
  return executable || python;
})();

assert.ok(captureCgroupSlice.startsWith("capture_cgroup() {") && captureCgroupSlice.includes('docker exec "$target" node /app/deploy/coolify/runtime-probes.mjs cgroup'), "cgroup capture must invoke the runtime cgroup probe");
assert.ok(identitySlice.startsWith('runtime_uid=$(docker exec "$name"') && identitySlice.includes('docker exec "$name" node /app/deploy/coolify/runtime-probes.mjs uid') && identitySlice.trim().endsWith("exit 1; }"), "identity slice must run the UID probe and gate on 1000:1000");
assert.ok(diskProbeInvocation.length > 0, "disk evidence must be captured by the runtime disk probe");
assert.ok(nativeBlock.startsWith("native_validation_status=") && nativeBlock.includes('docker exec "$name" node /app/deploy/coolify/runtime-probes.mjs image-formats') && nativeBlock.endsWith(nativeDiagnosticRm) && nativeBlock.includes("native_formats_failed=true"), "native image format evidence block must be extractable");
assert.ok(sanitizeFileSlice.startsWith("sanitize_file() {"), "sanitize_file must be extractable for evidence tests");
assert.ok(finalGateSlice.includes("$native_formats_failed == true") && finalGateSlice.includes("native_formats_failed=%s"), "final acceptance gate must consult native format failure");

test("owned resource cleanup requires removal and authoritative absence readback", (t) => {
  if (!existsSync(bash)) return t.skip("Bash is unavailable for the extracted cleanup test");
  const start = harness.indexOf("cleanup_owned_resources() {");
  const end = harness.indexOf("\ncleanup() {", start);
  assert.ok(start >= 0 && end > start);
  const cleanupResources = harness.slice(start, end);
  for (const scenario of ["noop", "inventory", "remove", "drift", "success"]) {
    const root = mkdtempSync(join(tmpdir(), `ornigami-cleanup-${scenario}-`));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const shell = [
      "set -u",
      `report_dir='${root.replaceAll("'", "'\\''")}'`,
      `report='${join(root, "report.txt").replaceAll("'", "'\\''")}'`,
      "name=runtime-test",
      "cache_volume=runtime-cache",
      "container_created=true",
      "volume_created=true",
      "owned_container_id=owned-id",
      "run_id=run-test",
      "ORNIGAMI_DEADLINE_TIMED_OUT=false",
      "ORNIGAMI_COMMAND_TIMED_OUT=false",
      "ORNIGAMI_DOCKER_TIMED_OUT=false",
      "ORNIGAMI_SUPERVISOR_TERMINATED=false",
      "ornigami_deadline_sync_state() { return 0; }",
      `scenario=${scenario}`,
      "docker() { case \"$1\" in inspect) [[ $scenario == drift ]] && printf foreign-id || printf owned-id;; rm) printf 'cleanup_test_docker_rm=%s\\n' \"$*\" >>\"$report\"; [[ $scenario == remove ]] && return 1; return 0;; ps) [[ $scenario == inventory ]] && return 1; if [[ $scenario == noop || $scenario == remove ]]; then printf owned-id; elif [[ $scenario == drift ]]; then printf foreign-id; fi; return 0;; volume) case \"$2\" in inspect) printf run-test;; rm) [[ $scenario == remove ]] && return 1; return 0;; ls) [[ $scenario == inventory ]] && return 1; [[ $scenario == noop || $scenario == remove ]] && printf runtime-cache; return 0;; esac;; esac; }",
      cleanupResources,
      "cleanup_owned_resources",
      "result=$?",
      "printf 'status=%s\\n' \"$result\"",
    ].join("\n");
    const script = join(root, "cleanup-resources.sh");
    writeFileSync(script, shell);
    const result = spawnSync(bash, [script], { encoding: "utf8" });
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(result.stdout, new RegExp(`status=${scenario === "success" ? 0 : 1}`), `scenario=${scenario}`);
    const receipt = readFileSync(join(root, "report.txt"), "utf8");
    if (scenario === "drift") {
      assert.match(receipt, /cleanup_container=identity_drift_preserved/);
      assert.equal(receipt.includes("cleanup_test_docker_rm="), false);
    }
    if (scenario === "inventory") assert.match(receipt, /inventory_unavailable/);
    if (scenario === "noop") assert.match(receipt, /cleanup_container=present_after_cleanup/);
    if (scenario === "remove") assert.match(receipt, /cleanup_container=present_after_cleanup/);
    if (scenario === "remove") assert.match(receipt, /cleanup_container_remove_error=true/);
    if (scenario === "success") {
      assert.match(receipt, /cleanup_container_absence_verified=true/);
      assert.match(receipt, /cleanup_cache_volume_absence_verified=true/);
    }
    if (scenario !== "drift") {
      const rmCall = receipt.match(/^cleanup_test_docker_rm=(.*)$/m)?.[1] ?? "";
      assert.match(rmCall, /owned-id/);
      assert.equal(rmCall.includes("runtime-test"), false);
    }
  }
});

test("interrupted container creation is removed only after run-label and image identity recovery", (t) => {
  if (!existsSync(bash)) return t.skip("Bash is unavailable for interrupted cleanup checks");
  const start = harness.indexOf("cleanup_owned_resources() {");
  const end = harness.indexOf("\ncleanup() {", start);
  const cleanupResources = harness.slice(start, end);
  for (const scenario of ["matching", "mismatch"]) {
    const root = mkdtempSync(join(tmpdir(), `ornigami-interrupted-container-${scenario}-`));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const script = [
      "set -u",
      `report_dir='${root.replaceAll("'", "'\\''")}'`,
      `report='${join(root, "report.txt").replaceAll("'", "'\\''")}'`,
      "name=runtime-test",
      "cache_volume=runtime-cache",
      "container_created=true",
      "volume_created=false",
      "owned_container_id=",
      "run_id=run-test",
      "image_id=image-test",
      "ORNIGAMI_DEADLINE_TIMED_OUT=false",
      "ORNIGAMI_COMMAND_TIMED_OUT=false",
      "ORNIGAMI_DOCKER_TIMED_OUT=false",
      "ORNIGAMI_SUPERVISOR_TERMINATED=false",
      "ornigami_deadline_sync_state() { return 0; }",
      "container_cleanup_log=",
      `scenario=${scenario}`,
      "docker() { case \"$1\" in inspect) if [[ \"$*\" == *org.ornigami.acceptance.run* ]]; then if [[ $scenario == matching ]]; then printf 'owned-id|run-test|image-test'; else printf 'foreign-id|other-run|image-test'; fi; else printf owned-id; fi;; rm) container_cleanup_log=\"$*\"; return 0;; ps) return 0;; esac; }",
      cleanupResources,
      "if cleanup_owned_resources; then result=0; else result=1; fi",
      "printf 'status=%s\\nremove=%s\\n' \"$result\" \"$container_cleanup_log\"",
    ].join("\n");
    const path = join(root, "cleanup.sh");
    writeFileSync(path, script);
    const result = spawnSync(bash, [path], { encoding: "utf8" });
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    if (scenario === "matching") {
      assert.match(result.stdout, /status=0/);
      assert.match(result.stdout, /remove=rm -f owned-id/);
      assert.match(readFileSync(join(root, "report.txt"), "utf8"), /cleanup_container_absence_verified=true/);
    } else {
      assert.match(result.stdout, /status=1/);
      assert.match(result.stdout, /remove=$/m);
      assert.match(readFileSync(join(root, "report.txt"), "utf8"), /cleanup_container=identity_mismatch_preserved/);
    }
  }
});

test("runtime deadline helper accepts normal work and rejects missing, invalid, or exhausted budgets", (t) => {
  if (!existsSync(bash)) return t.skip("Bash is unavailable for runtime deadline checks");
  const quote = (value) => `'${value.replaceAll("'", "'\\''")}'`;
  const source = `source ${quote(deadlinePath)}; ornigami_deadline_init`;
  for (const [name, value] of [["missing", undefined], ["invalid", "tomorrow"], ["exhausted", "1"], ["below-floor", String(Math.floor(Date.now() / 1000) + 149)]]) {
    const env = { ...process.env };
    if (value === undefined) delete env.ORNIGAMI_WORK_DEADLINE_EPOCH;
    else env.ORNIGAMI_WORK_DEADLINE_EPOCH = value;
    const result = spawnSync(bash, ["-c", source], { encoding: "utf8", env, timeout: 5000 });
    assert.notEqual(result.status, 0, `${name} deadline must be rejected`);
  }
  const env = { ...process.env, ORNIGAMI_WORK_DEADLINE_EPOCH: String(Math.floor(Date.now() / 1000) + 300) };
  const normal = spawnSync(bash, ["-c", `${source}; ornigami_deadline_run bash -c 'printf normal-completion'`], { encoding: "utf8", env, timeout: 5000 });
  assert.equal(normal.status, 0, normal.stderr);
  assert.match(normal.stdout, /normal-completion/);
  const expiredCheck = spawnSync(bash, ["-c", `${source}; ORNIGAMI_RUNTIME_DEADLINE_EPOCH=$(( $(date +%s) - 1 )); if ornigami_deadline_check_runtime; then exit 9; else rc=$?; fi; printf 'check_exit=%s deadline=%s command=%s\\n' "$rc" "$ORNIGAMI_DEADLINE_TIMED_OUT" "$ORNIGAMI_COMMAND_TIMED_OUT"`], { encoding: "utf8", env, timeout: 5000 });
  assert.equal(expiredCheck.status, 0, expiredCheck.stderr);
  assert.match(expiredCheck.stdout, /check_exit=124 deadline=true command=true/);
});

test("runtime supervisor bounds stuck acceptance and cleanup children", (t) => {
  if (!existsSync(bash)) return t.skip("Bash is unavailable for runtime supervisor checks");
  const capabilities = spawnSync(bash, ["-c", "command -v timeout >/dev/null"], { encoding: "utf8" });
  if (capabilities.status !== 0) return t.skip("GNU timeout is unavailable");
  const root = mkdtempSync(join(tmpdir(), "ornigami-runtime-supervisor-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const quote = (value) => `'${value.replaceAll("'", "'\\''")}'`;
  const worker = join(root, "worker.sh");
  writeFileSync(worker, `#!/usr/bin/env bash
set +e
mode=$1; pid_file=$2; completion=$3; progress=$4
cleanup() {
  if [[ $mode == cleanup ]]; then
    bash -c 'echo "$$" > "$1"; trap "" TERM; while :; do printf . >>"$2"; sleep 0.2; done' bash "$pid_file" "$progress" &
    cleanup_pid=$!
    printf started >"$completion.started"
    wait "$cleanup_pid"
    printf verified >"$completion"
  fi
}
trap cleanup EXIT
if [[ $mode == acceptance ]]; then
  bash -c 'echo "$$" > "$1"; trap "" TERM; while :; do printf . >>"$2"; sleep 0.2; done' bash "$pid_file" "$progress" &
  child_pid=$!
  wait "$child_pid"
else
  trap 'exit 0' TERM
  sleep 30
fi
`);
  for (const mode of ["acceptance", "cleanup"]) {
    const pidFile = join(root, `${mode}.pid`);
    const completion = join(root, `${mode}.complete`);
    const progress = join(root, `${mode}.progress`);
    const source = [
      `source ${quote(deadlinePath)}`,
      "ornigami_deadline_init",
      "ORNIGAMI_RUNTIME_CLEANUP_RESERVE_SECONDS=2",
      "export ORNIGAMI_RUNTIME_CLEANUP_RESERVE_SECONDS",
      `ornigami_deadline_supervise 2 bash ${quote(worker)} ${mode} ${quote(pidFile)} ${quote(completion)} ${quote(progress)}`,
      "rc=$?",
      "ornigami_deadline_sync_state",
      `child_pid=$(cat ${quote(pidFile)})`,
      `before=$(cat ${quote(progress)} 2>/dev/null || true)`,
      "sleep 0.5",
      `after=$(cat ${quote(progress)} 2>/dev/null || true)`,
      "if [[ $before == \"$after\" ]]; then alive=false; else alive=true; fi",
      "printf 'rc=%s deadline=%s alive=%s pid=%s\\n' \"$rc\" \"$ORNIGAMI_DEADLINE_TIMED_OUT\" \"$alive\" \"$child_pid\"",
    ].join("; ");
    const env = { ...process.env, ORNIGAMI_WORK_DEADLINE_EPOCH: String(Math.floor(Date.now() / 1000) + 300) };
    const result = spawnSync(bash, ["-c", source], { encoding: "utf8", env, timeout: 8000 });
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(result.stdout, /rc=124 deadline=true alive=false/);
    if (mode === "cleanup") {
      assert.equal(existsSync(`${completion}.started`), true);
      assert.equal(existsSync(completion), false, "forced cleanup termination leaves absence proof unavailable");
    }
  }
});

test("command substitutions preserve stdout and parent timeout accounting distinguishes ordinary errors", (t) => {
  if (!existsSync(bash)) return t.skip("Bash is unavailable for substitution accounting checks");
  const root = mkdtempSync(join(tmpdir(), "ornigami-runtime-substitution-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const quote = (value) => `'${value.replaceAll("'", "'\\''")}'`;
  const jsonCommand = `printf '%s' '${JSON.stringify({ id: "fixture" })}'`;
  const script = [
    `source ${quote(deadlinePath)}`,
    "ornigami_deadline_init",
    `ORNIGAMI_DEADLINE_STATE_FILE=${quote(join(root, "deadline.state"))}`,
    ": >\"$ORNIGAMI_DEADLINE_STATE_FILE\"",
    "ORNIGAMI_COMMAND_TIMEOUT_CAP_SECONDS=1",
    `success=$(ornigami_deadline_run bash -c ${quote(jsonCommand)})`,
    "ornigami_deadline_sync_state",
    "printf 'success=%s flags=%s,%s\\n' \"$success\" \"$ORNIGAMI_COMMAND_TIMED_OUT\" \"$ORNIGAMI_DEADLINE_TIMED_OUT\"",
    "if ordinary=$(ornigami_deadline_run bash -c 'exit 7'); then ordinary_rc=0; else ordinary_rc=$?; fi",
    "ornigami_deadline_sync_state",
    "printf 'ordinary_rc=%s flags=%s,%s\\n' \"$ordinary_rc\" \"$ORNIGAMI_COMMAND_TIMED_OUT\" \"$ORNIGAMI_DEADLINE_TIMED_OUT\"",
    "if code124=$(ornigami_deadline_run bash -c 'exit 124'); then ordinary124_rc=0; else ordinary124_rc=$?; fi",
    "ornigami_deadline_sync_state",
    "printf 'ordinary124_rc=%s flags=%s,%s\\n' \"$ordinary124_rc\" \"$ORNIGAMI_COMMAND_TIMED_OUT\" \"$ORNIGAMI_DEADLINE_TIMED_OUT\"",
    "if timed=$(ornigami_deadline_run bash -c 'sleep 20; printf late'); then timed_rc=0; else timed_rc=$?; fi",
    "ornigami_deadline_sync_state",
    "printf 'timed_rc=%s flags=%s,%s\\n' \"$timed_rc\" \"$ORNIGAMI_COMMAND_TIMED_OUT\" \"$ORNIGAMI_DEADLINE_TIMED_OUT\"",
  ].join("; ");
  const env = { ...process.env, ORNIGAMI_WORK_DEADLINE_EPOCH: String(Math.floor(Date.now() / 1000) + 400) };
  const result = spawnSync(bash, ["-c", script], { encoding: "utf8", env, timeout: 10000 });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /success=\{"id":"fixture"\} flags=false,false/);
  assert.match(result.stdout, /ordinary_rc=7 flags=false,false/);
  assert.match(result.stdout, /ordinary124_rc=124 flags=false,false/);
  assert.match(result.stdout, /timed_rc=(124|137) flags=true,false/);
});

test("timed-out command substitution produces truthful cleanup receipt and unproved absence", (t) => {
  if (!existsSync(bash)) return t.skip("Bash is unavailable for cleanup receipt checks");
  const start = harness.indexOf("cleanup_owned_resources() {");
  const end = harness.indexOf("\ncleanup() {", start);
  const cleanupResources = harness.slice(start, end);
  const root = mkdtempSync(join(tmpdir(), "ornigami-runtime-timeout-receipt-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const quote = (value) => `'${value.replaceAll("'", "'\\''")}'`;
  const script = [
    "set +e",
    `source ${quote(deadlinePath)}`,
    "ornigami_deadline_init",
    `ORNIGAMI_DEADLINE_STATE_FILE=${quote(join(root, "deadline.state"))}`,
    ": >\"$ORNIGAMI_DEADLINE_STATE_FILE\"",
    "ORNIGAMI_COMMAND_TIMEOUT_CAP_SECONDS=1",
    `report_dir=${quote(root)}`,
    `report=${quote(join(root, "report.txt"))}`,
    "name=runtime-test; cache_volume=runtime-cache; container_created=true; volume_created=false",
    "owned_container_id=owned-id; run_id=run-test; image_id=image-test",
    "docker() { case \"$1\" in inspect) printf owned-id;; rm) return 0;; ps) ORNIGAMI_DEADLINE_OPERATION=docker ornigami_deadline_run bash -c 'sleep 20';; esac; }",
    cleanupResources,
    "if cleanup_owned_resources; then cleanup_rc=0; else cleanup_rc=$?; fi",
    "printf 'cleanup_rc=%s\\n' \"$cleanup_rc\"",
  ].join("\n");
  const scriptPath = join(root, "receipt-test.sh");
  writeFileSync(scriptPath, script);
  const result = spawnSync(bash, [scriptPath], { encoding: "utf8", timeout: 8000 });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /cleanup_rc=1/);
  const receipt = JSON.parse(readFileSync(join(root, "cleanup.json"), "utf8"));
  assert.equal(receipt.boundedCommandTimedOut, true);
  assert.equal(receipt.dockerOperationTimedOut, true);
  assert.equal(receipt.container.absenceVerified, false);
  assert.equal(receipt.container.outcome, "daemon_operation_unproved");
});

test("runtime deadline terminates a TERM-resistant child process", (t) => {
  const capabilities = spawnSync(bash, ["-c", "command -v timeout >/dev/null"], { encoding: "utf8" });
  if (capabilities.status !== 0) return t.skip("GNU timeout is unavailable");
  const root = mkdtempSync(join(tmpdir(), "ornigami-runtime-deadline-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const pidFile = join(root, "child.pid");
  const quote = (value) => `'${value.replaceAll("'", "'\\''")}'`;
  const script = [
    `source ${quote(deadlinePath)}`,
    "ornigami_deadline_init",
    "ORNIGAMI_RUNTIME_DEADLINE_EPOCH=$(( $(date +%s) + 4 ))",
    `if ornigami_deadline_run bash -c 'echo \\"$$\\" > \\"$1\\"; trap \\"\\" TERM; while :; do sleep 1; done' bash ${quote(pidFile)}; then exit 9; else rc=$?; fi`,
    `child_pid=$(cat ${quote(pidFile)}); if kill -0 "$child_pid" 2>/dev/null; then kill -KILL "$child_pid" 2>/dev/null || true; echo child_still_alive=true; else echo child_terminated=true; fi`,
    "printf 'child_exit=%s timed_out=%s\\n' \"$rc\" \"$ORNIGAMI_COMMAND_TIMED_OUT\"",
  ].join("; ");
  const env = { ...process.env, ORNIGAMI_WORK_DEADLINE_EPOCH: String(Math.floor(Date.now() / 1000) + 300) };
  const result = spawnSync(bash, ["-c", script], { encoding: "utf8", env, timeout: 10_000 });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /child_exit=(124|137) timed_out=true/);
  assert.match(result.stdout, /child_terminated=true/);
  assert.doesNotMatch(result.stdout, /child_still_alive=true/);
});

function runPython(block, args) {
  const result = spawnSync(python, ["-c", block, ...args], { encoding: "utf8" });
  if (result.error) throw result.error;
  return result;
}

test("late cleanup failure writes failure evidence and preserves original diagnostics", (t) => {
  const root = mkdtempSync(join(tmpdir(), "ornigami-late-cleanup-receipt-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(join(root, "report.txt"), "result=passed\n");
  writeFileSync(join(root, "runtime-http.json"), JSON.stringify({ result: "passed", exitStatus: 0 }));
  const result = runPython(cleanupFailureWriter, [join(root, "report.txt"), "1", root]);
  assert.equal(result.status, 0, result.stderr);
  const report = readFileSync(join(root, "report.txt"), "utf8");
  assert.match(report, /^result=failed\r?\n/m);
  assert.equal(report.includes("result=passed"), false);
  const failure = JSON.parse(readFileSync(join(root, "failure.json"), "utf8"));
  assert.equal(failure.status, 1);
  assert.equal(failure.phase, "cleanup");
  assert.equal(failure.cleanupReceipt, "cleanup.json");
  assert.match(readFileSync(join(root, "failure-evidence.txt"), "utf8"), /failure_phase=cleanup/);
  const runtimeHttp = JSON.parse(readFileSync(join(root, "runtime-http.json"), "utf8"));
  assert.equal(runtimeHttp.result, "failed");
  assert.equal(runtimeHttp.exitStatus, 1);

  const originalFailure = JSON.stringify({ status: 23, command: "original phase failure" });
  const originalEvidence = "original failure evidence\n";
  writeFileSync(join(root, "failure.json"), originalFailure);
  writeFileSync(join(root, "failure-evidence.txt"), originalEvidence);
  writeFileSync(join(root, "report.txt"), "result=failed\nexit_status=23\n");
  const preserved = runPython(cleanupFailureWriter, [join(root, "report.txt"), "23", root]);
  assert.equal(preserved.status, 0, preserved.stderr);
  assert.equal(readFileSync(join(root, "failure.json"), "utf8"), originalFailure);
  assert.equal(readFileSync(join(root, "failure-evidence.txt"), "utf8"), originalEvidence);
  assert.match(readFileSync(join(root, "report.txt"), "utf8"), /exit_status=23/);
});

test("runtime receipts retain phase failures and redact HTTP/log secret fields", (t) => {
  const root = mkdtempSync(join(tmpdir(), "ornigami-runtime-receipt-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));

  writeFileSync(join(root, "report.txt"), [
    "cold_http_exit_status=23",
    "restart_http=true",
    "recreate_http=false",
    "next_image_cache_restart=true",
    "next_image_cache_recreate=false",
  ].join("\n"));
  const observation = `http_observation=${JSON.stringify({
    method: "GET",
    path: "/",
    status: 200,
    headers: { cookie: "sid=COOKIE_A; secondary=COOKIE_B" },
    body: "Authorization: Bearer AUTH_A\nhttps://user:HTTP_PASS@host.invalid\npostgres://db:PG_PASS@db.invalid/name\nuser@example.invalid",
  })}`;
  const warm = `http_observation=${JSON.stringify({ method: "GET", path: "/", status: 200, headers: { "content-security-policy": "script-src nonce-test" }, body: "warm" })}`;
  writeFileSync(join(root, "http-cold.txt"), `${observation}\nsri_script_tag={"path":"/_next/static/chunks/problem.js","integrity":null,"noncePresent":true}\nacceptance_manifest={"builtHashesMatch":true}\nAssertionError: expected safe value, got unsafe value\n`);
  writeFileSync(join(root, "warm-restart.txt"), `${warm}\n`);
  writeFileSync(join(root, "warm-recreate.txt"), `${warm}\n`);
  writeFileSync(join(root, "image-cache-prime.json"), JSON.stringify({ status: 200, bodySha256: "a".repeat(64) }));
  writeFileSync(join(root, "image-cache-restart.json"), JSON.stringify({ status: 200, bodySha256: "a".repeat(64) }));
  writeFileSync(join(root, "image-cache-recreate.json"), JSON.stringify({ status: 200, bodySha256: "a".repeat(64) }));
  writeFileSync(join(root, "container-logs.txt"), "Cookie: sid=COOKIE_A; secondary=COOKIE_B\n  folded=FOLDED_COOKIE\n");
  writeFileSync(join(root, "stderr.raw"), "Authorization: AUTH_A\nhttps://user:HTTP_PASS@host.invalid\n");

  const receiptResult = runPython(receiptWriter, [root, "failed", "1"]);
  assert.equal(receiptResult.status, 0, receiptResult.stderr);
  const receipt = JSON.parse(readFileSync(join(root, "runtime-http.json"), "utf8"));
  assert.equal(receipt.exitStatus, 1);
  assert.equal(receipt.phaseStatuses.cold_http_exit_status, "23");
  assert.equal(receipt.phaseStatuses.recreate_http, "false");
  assert.equal(receipt.httpObservations.length, 3);
  assert.equal(receipt.httpObservations[0].status, 200);
  assert.deepEqual(receipt.sriScriptTags[0], { path: "/_next/static/chunks/problem.js", integrity: null, noncePresent: true });
  assert.equal(receipt.imageCacheObservations.length, 3);
  assert.match(receipt.assertions.join("\n"), /expected safe value, got unsafe value/);

  const failureResult = runPython(failureWriter, [root, "1", "23", "88", "cold HTTP acceptance block"]);
  assert.equal(failureResult.status, 0, failureResult.stderr);
  const failure = JSON.parse(readFileSync(join(root, "failure.json"), "utf8"));
  assert.equal(failure.status, 1);
  assert.equal(failure.failingCommandStatus, 23);
  assert.equal(failure.line, "88");
  assert.equal(failure.httpObservations.length, 3);
  assert.equal(failure.imageCacheObservations[0].bodySha256, "a".repeat(64));
  assert.match(failure.assertions.join("\n"), /expected safe value, got unsafe value/);

  const publicReceipts = ["runtime-http.json", "failure.json", "failure-evidence.txt"]
    .map((name) => readFileSync(join(root, name), "utf8"))
    .join("\n");
  for (const value of ["COOKIE_A", "COOKIE_B", "FOLDED_COOKIE", "AUTH_A", "HTTP_PASS", "PG_PASS", "user@example.invalid"]) {
    assert.equal(publicReceipts.includes(value), false, `sensitive fixture value leaked: ${value}`);
  }
});

test("receipt writer failures fail closed and retain raw diagnostics", (t) => {
  if (!existsSync(bash)) return t.skip("Bash is unavailable for the extracted cleanup test");
  const root = mkdtempSync(join(tmpdir(), "ornigami-runtime-cleanup-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const start = harness.indexOf("cleanup() {");
  const end = harness.indexOf("\ntrap cleanup EXIT", start);
  assert.ok(start >= 0 && end > start);
  const cleanup = harness.slice(start, end);
  const shell = [
    "set -u",
    "exec 3>&2",
    `report_dir='${root.replaceAll("'", "'\\''")}'`,
    `report='${join(root, "report.txt").replaceAll("'", "'\\''")}'`,
    "name=runtime-test",
    "final_result=failed",
    "container_created=false",
    "volume_created=false",
    "cache_volume=unused-volume",
    "failure_line=",
    "failure_command=",
    "failure_status=",
    "stderr_raw=\"$report_dir/stderr.raw\"",
    "printf 'PRIVATE_RAW_CANARY\\n' >\"$stderr_raw\"",
    "printf 'http_observation=PRIVATE_HTTP_CANARY\\n' >\"$report_dir/http-cold.txt\"",
    "capture_runtime_state() { return 0; }",
    "docker() { return 1; }",
    "python3() { return 86; }",
    "sanitize_file() { return 1; }",
    cleanup,
    "false",
    "cleanup",
  ].join("\n");
  const shellPath = join(root, "cleanup-test.sh");
  writeFileSync(shellPath, shell);
  const result = spawnSync(bash, [shellPath], { encoding: "utf8" });
  assert.notEqual(result.status, 0);
  assert.equal(readFileSync(join(root, "stderr.raw"), "utf8").includes("PRIVATE_RAW_CANARY"), true);
  assert.equal(readFileSync(join(root, "http-cold.txt"), "utf8").includes("PRIVATE_HTTP_CANARY"), true);
  assert.equal(`${result.stdout}\n${result.stderr}`.includes("PRIVATE_RAW_CANARY"), false);
  assert.match(`${result.stdout}\n${result.stderr}`, /private raw capture files were retained locally/);
});

test("cold HTTP failure still runs restart and recreate checks and exits nonzero", (t) => {
  if (!existsSync(bash)) return t.skip("Bash is unavailable for the extracted phase test");
  const root = mkdtempSync(join(tmpdir(), "ornigami-runtime-phases-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const start = harness.indexOf('docker restart --time 45 "$name" >/dev/null');
  const end = harness.indexOf("finished_epoch=$(date +%s)", start);
  assert.ok(start >= 0 && end > start);
  const phaseTail = harness.slice(start, end);
  const shell = [
    "set -Eeuo pipefail",
    "record_error_context() { :; }",
    `report_dir='${root.replaceAll("'", "'\\''")}'`,
    `report='${join(root, "report.txt").replaceAll("'", "'\\''")}'`,
    `report_root='${root.replaceAll("'", "'\\''")}'`,
    "name=runtime-test",
    "started_epoch=0",
    "cache_volume=runtime-cache",
    "image_id=sha256:test-image",
    "container_id_before_restart=container-old",
    "container_created=true",
    "runtime_args=(test-image)",
    "cold_image_hash=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "cache_before='[[\"image\",1,\"digest\"]]'",
    "cold_http_failed=true",
    "cache_check_failed=false",
    "native_formats_failed=false",
    "restart_http_passed=false",
    "recreate_http_passed=false",
    "restart_cache_passed=false",
    "recreate_cache_passed=false",
    "phase=restarted",
    "calls=\"$report_dir/phase-calls.txt\"",
    "printf 'oom_kill 0\\n' >\"$report_dir/runtime-first-cgroup.txt\"",
    "docker() { case \"$1\" in restart|stop|run) return 0;; rm) phase=recreated; return 0;; inspect) case \"$3\" in '{{.Id}}') [[ $phase == recreated ]] && printf container-new || printf container-old;; '{{.Image}}') printf '%s' \"$image_id\";; *Mounts*) printf '%s' \"$cache_volume\";; *) return 1;; esac;; exec) return 0;; *) return 1;; esac; }",
    "cache_listing() { printf '%s' '[[\"image\",1,\"digest\"]]'; }",
    "verify_runtime_config() { return 0; }",
    "wait_for_health() { return 0; }",
    "verify_warm_http() { printf '%s\\n' \"$1\" >>\"$calls\"; printf 'http_observation={\\\"method\\\":\\\"GET\\\",\\\"path\\\":\\\"/\\\",\\\"status\\\":200,\\\"headers\\\":{\\\"content-security-policy\\\":\\\"present\\\"}}\\n' >\"$report_dir/warm-$1.txt\"; if [[ $1 == restart ]]; then printf 'AssertionError: warm failure\\n' >>\"$report_dir/warm-$1.txt\"; return 1; fi; return 0; }",
    "verify_image_cache_hit() { printf '{\\\"status\\\":200,\\\"bodySha256\\\":\\\"%s\\\"}' \"$cold_image_hash\" >\"$report_dir/image-cache-$1.json\"; return 0; }",
    "capture_cgroup() { printf 'oom_kill 0\\n' >\"$report_dir/$2-cgroup.txt\"; return 0; }",
    "assert_cgroup_metrics() { return 0; }",
    "df() { return 0; }",
    phaseTail,
  ].join("\n");
  const shellPath = join(root, "phase-test.sh");
  writeFileSync(shellPath, shell);
  const result = spawnSync(bash, [shellPath], { encoding: "utf8" });
  assert.equal(result.status, 1, `${result.stdout}\n${result.stderr}`);
  assert.deepEqual(readFileSync(join(root, "phase-calls.txt"), "utf8").trim().split("\n"), ["restart", "recreate"], `${result.stdout}\n${result.stderr}`);
  const report = readFileSync(join(root, "report.txt"), "utf8");
  assert.match(report, /restart_http=false/);
  assert.match(report, /recreate_http=true/);
  assert.match(report, /next_image_cache_restart=true/);
  assert.match(report, /next_image_cache_recreate=true/);
  assert.match(report, /cold_http_failed=true/, `${result.stdout}\n${result.stderr}`);
  assert.equal(report.includes("restart_http=200_with_csp"), false);
});

test("runtime command contract drives the Distroless runtime through Node probes only", () => {
  assert.match(harness, /docker exec "\$target" node \/app\/deploy\/coolify\/runtime-probes\.mjs cgroup >"/);
  assert.match(harness, /docker exec "\$name" node \/app\/deploy\/coolify\/runtime-probes\.mjs uid\)/);
  assert.match(harness, /docker exec "\$name" node \/app\/deploy\/coolify\/runtime-probes\.mjs disk >"/);
  assert.match(harness, /docker exec "\$name" node \/app\/deploy\/coolify\/runtime-probes\.mjs image-formats >"/);
  assert.doesNotMatch(harness, /docker exec "(?:\$name|\$target)" sh\b/);
  assert.doesNotMatch(harness, /docker exec "\$name" id -u\b/);
  assert.doesNotMatch(harness, /docker exec "\$name" df\b/);
});

test("cgroup capture invokes the runtime cgroup probe and requires every metric", (t) => {
  if (!existsSync(bash)) return t.skip("Bash is unavailable for the extracted cgroup test");
  const fullFixture = [
    "==memory.max==\n805306368\n",
    "==memory.swap.max==\n0\n",
    "==memory.current==\n123456789\n",
    "==memory.peak==\n234567890\n",
    "==memory.events==\nlow 0\nhigh 0\nmax 0\noom 0\noom_kill 0\n",
    "==memory.stat==\nanon 0\nfile 0\n",
    "==memory.pressure==\navg10=0.00 avg60=0.00 avg300=0.00\n",
    "==cpu.max==\n75000 100000\n",
    "==cpu.stat==\nusage_usec 1234567\nuser_usec 1234567\nsystem_usec 0\n",
    "==pids.max==\n128\n",
  ].join("");
  const scenarios = [
    ["complete-counters", fullFixture, 0, false, "runtime-first-cgroup.txt"],
    ["missing-required-metric", fullFixture.replace("==cpu.max==\n75000 100000\n", ""), 0, true, "runtime-first-cgroup.txt"],
    ["probe-failure", "", 1, true, "runtime-first-cgroup.txt"],
  ];
  for (const [scenario, fixture, exitCode, shouldFail, reportFile] of scenarios) {
    const root = mkdtempSync(join(tmpdir(), `ornigami-runtime-cgroup-${scenario}-`));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    writeFileSync(join(root, "probe-stdout.txt"), fixture);
    const shell = [
      "set -Eeuo pipefail",
      `report_dir='${root.replaceAll("'", "'\\''")}'`,
      "name=runtime-test",
      `exit_code=${exitCode}`,
      "docker() { printf '%s\\n' \"$*\" >>\"$report_dir/exec-calls.txt\"; if [[ $1 == exec ]]; then if [[ $exit_code -ne 0 ]]; then printf '%s\\n' 'probe could not read cgroup metrics' >&2; return $exit_code; fi; cat \"$report_dir/probe-stdout.txt\"; return 0; fi; return 1; }",
      captureCgroupSlice,
      'capture_cgroup "$name" runtime-first',
      'printf \'capture_survived=true\\n\'',
    ].join("\n");
    const shellPath = join(root, "cgroup-capture-test.sh");
    writeFileSync(shellPath, shell);
    const result = spawnSync(bash, [shellPath], { encoding: "utf8" });
    if (shouldFail) {
      assert.notEqual(result.status, 0, `${result.stdout}\n${result.stderr}`);
    } else {
      assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
      assert.equal(readFileSync(join(root, reportFile), "utf8"), fixture);
      assert.match(readFileSync(join(root, "exec-calls.txt"), "utf8"), /exec runtime-test node \/app\/deploy\/coolify\/runtime-probes\.mjs cgroup/);
    }
    if (scenario === "missing-required-metric") assert.match(result.stderr, /Cgroup metric cpu\.max is missing/);
    if (scenario === "probe-failure") assert.match(result.stderr, /Cgroup capture failed/);
  }
});

test("runtime identity uses the UID/GID probe contract and rejects other users", (t) => {
  if (!existsSync(bash)) return t.skip("Bash is unavailable for the extracted identity test");
  for (const [scenario, fakeUid, shouldFail] of [["runtime-node-user", "1000", false], ["foreign-user", "1001", true]]) {
    const root = mkdtempSync(join(tmpdir(), `ornigami-runtime-identity-${scenario}-`));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const shell = [
      "set -Eeuo pipefail",
      `report_dir='${root.replaceAll("'", "'\\''")}'`,
      "name=runtime-test",
      `fake_uid=${fakeUid}`,
      "docker() { printf '%s\\n' \"$*\" >>\"$report_dir/exec-calls.txt\"; if [[ $1 == exec ]]; then printf '%s\\n' \"$fake_uid\"; return 0; fi; return 1; }",
      identitySlice,
      'printf \'identity_survived=true\\n\'',
    ].join("\n");
    const shellPath = join(root, "identity-test.sh");
    writeFileSync(shellPath, shell);
    const result = spawnSync(bash, [shellPath], { encoding: "utf8" });
    assert.match(readFileSync(join(root, "exec-calls.txt"), "utf8"), /exec runtime-test node \/app\/deploy\/coolify\/runtime-probes\.mjs uid/);
    if (shouldFail) {
      assert.notEqual(result.status, 0, `${result.stdout}\n${result.stderr}`);
      assert.match(result.stderr, /Runtime UID is not 1000/);
    } else {
      assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
      assert.match(result.stdout, /identity_survived=true/);
    }
  }
});

test("runtime disk evidence uses the statfs probe and fails closed", (t) => {
  if (!existsSync(bash)) return t.skip("Bash is unavailable for the extracted disk test");
  const diskFixture = JSON.stringify([
    { path: "/", blockSize: "4096", totalBytes: "80530636800", freeBytes: "40265318400", availableBytes: "40265318400" },
    { path: "/tmp", blockSize: "4096", totalBytes: "68719476736", freeBytes: "51539607552", availableBytes: "51539607552" },
    { path: "/app/.next/cache", blockSize: "4096", totalBytes: "21474836480", freeBytes: "10737418240", availableBytes: "10737418240" },
  ]);
  for (const [scenario, exitCode, shouldFail] of [["statfs-probe", 0, false], ["probe-failure", 1, true]]) {
    const root = mkdtempSync(join(tmpdir(), `ornigami-runtime-disk-${scenario}-`));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    writeFileSync(join(root, "probe-stdout.txt"), diskFixture);
    const shell = [
      "set -Eeuo pipefail",
      `report_dir='${root.replaceAll("'", "'\\''")}'`,
      "name=runtime-test",
      `exit_code=${exitCode}`,
      "docker() { printf '%s\\n' \"$*\" >>\"$report_dir/exec-calls.txt\"; if [[ $1 == exec ]]; then if [[ $exit_code -ne 0 ]]; then printf '%s\\n' 'statfs unavailable in runtime' >&2; return $exit_code; fi; cat \"$report_dir/probe-stdout.txt\"; return 0; fi; return 1; }",
      diskProbeInvocation,
      'printf \'disk_survived=true\\n\'',
    ].join("\n");
    const shellPath = join(root, "disk-test.sh");
    writeFileSync(shellPath, shell);
    const result = spawnSync(bash, [shellPath], { encoding: "utf8" });
    const calls = readFileSync(join(root, "exec-calls.txt"), "utf8");
    assert.match(calls, /exec runtime-test node \/app\/deploy\/coolify\/runtime-probes\.mjs disk/);
    assert.equal(calls.includes("df -Pk"), false, `in-container df must not reappear: ${calls}`);
    if (shouldFail) {
      assert.notEqual(result.status, 0, `${result.stdout}\n${result.stderr}`);
    } else {
      assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
      assert.equal(readFileSync(join(root, "runtime-disk.txt"), "utf8"), diskFixture);
    }
  }
});

test("native image evidence executes the passing receipt and gates every failure mode", (t) => {
  if (!existsSync(bash)) return t.skip("Bash is unavailable for the extracted native evidence test");
  assert.ok(runtimePython, "a Python executable is required for python3 shimmed evidence validation");
  const nativePassing = JSON.stringify({
    result: "passed",
    versions: { sharp: "0.35.5", vips: "8.18.0" },
    checks: [
      { format: "png", inputBytes: 100, outputBytes: 80, width: 4, height: 4, result: "passed" },
      { format: "jpeg", inputBytes: 100, outputBytes: 80, width: 4, height: 4, result: "passed" },
      { format: "webp", inputBytes: 100, outputBytes: 80, width: 4, height: 4, result: "passed" },
      { format: "avif", inputBytes: 100, outputBytes: 80, width: 4, height: 4, result: "passed" },
      { format: "gif", inputBytes: 100, outputBytes: 80, width: 4, height: 4, result: "passed" },
      { format: "tiff", inputBytes: 100, outputBytes: 80, width: 4, height: 4, result: "passed" },
      { format: "svg-input", inputBytes: 96, outputBytes: 60, result: "passed" },
    ],
    runtime: { platform: "linux/amd64", node: "v22.23.3", openssl: "3.5.8", glibc: "2.41", sse4_2: true },
    loadedNativeObjects: ["/nodejs/bin/node", "/app/node_modules/sharp/build/Release/sharp-linux-x64.node"],
  });
  const nativeObject = JSON.parse(nativePassing);
  // [scenario, probe stdout, probe exit code, probe stderr, sanitized diagnostic reason]
  const validatorRejections = [
    ["empty-output", "", /Expecting value/],
    ["non-json-output", "not-json", /Expecting value/],
    ["missing-formats", JSON.stringify({ ...nativeObject, checks: nativeObject.checks.slice(0, 6) }), /seven native image format checks are required/],
    ["failed-format", JSON.stringify({ ...nativeObject, checks: nativeObject.checks.map((check, index) => (index === 3 ? { ...check, result: "failed" } : check)) }), /a native image format check failed/],
    ["foreign-platform", JSON.stringify({ ...nativeObject, runtime: { ...nativeObject.runtime, platform: "linux/arm64" } }), /native runtime platform evidence missing/],
  ];
  for (const [scenario, payload, exitCode, probeStderr, diagnosticReason] of [
    ["evidence-passed", nativePassing, 0, "", null],
    ...validatorRejections.map(([name, rejectionPayload, reason]) => [name, rejectionPayload, 0, "", reason]),
    ["probe-failure", "", 3, "Required native image format unavailable: avif", /Required native image format unavailable: avif/],
    ["silent-probe-failure", "", 7, "", /Native image format probe failed with exit status 7 and wrote no diagnostic output/],
  ]) {
    const root = mkdtempSync(join(tmpdir(), `ornigami-runtime-native-${scenario}-`));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    writeFileSync(join(root, "probe-stdout.txt"), payload);
    const shell = [
      "set -Eeuo pipefail",
      `PYBIN='${runtimePython.replaceAll("'", "'\\''")}'`,
      'python3() { "$PYBIN" "$@"; }',
      "record_error_context() { :; }",
      sanitizeFileSlice,
      `report_dir='${root.replaceAll("'", "'\\''")}'`,
      'report="$report_dir/report.txt"',
      ': >"$report"',
      "name=runtime-test",
      `probe_exit=${exitCode}`,
      `probe_stderr='${probeStderr.replaceAll("'", "'\\''")}'`,
      "docker() { if [[ $1 == exec ]]; then if [[ $probe_exit -ne 0 ]]; then if [[ -n $probe_stderr ]]; then printf '%s\\n' \"$probe_stderr\" >&2; fi; return $probe_exit; fi; cat \"$report_dir/probe-stdout.txt\"; return 0; fi; return 1; }",
      "native_formats_failed=false",
      nativeBlock,
      'printf \'native_formats_failed=%s\\n\' "$native_formats_failed"',
      'printf \'native_block_continued=true\\n\'',
    ].join("\n");
    const shellPath = join(root, "native-evidence-test.sh");
    writeFileSync(shellPath, shell);
    const result = spawnSync(bash, [shellPath], { encoding: "utf8" });
    assert.equal(result.status, 0, `${scenario}: ${result.stdout}\n${result.stderr}`);
    assert.equal(existsSync(join(root, "native-image-formats.stderr")), false, `raw probe stderr retained: ${scenario}`);
    assert.equal(existsSync(join(root, "native-format-validation.err")), false, `raw validator stderr retained: ${scenario}`);
    assert.match(result.stdout, /^native_block_continued=true$/m);
    const report = readFileSync(join(root, "report.txt"), "utf8");
    const diagnosticPath = join(root, "native-image-formats-error.txt");
    if (diagnosticReason === null) {
      assert.equal(readFileSync(join(root, "native-image-formats.json"), "utf8"), nativePassing);
      assert.deepEqual(JSON.parse(readFileSync(join(root, "native-image-formats.json"), "utf8")), nativeObject);
      assert.match(report, /^native_image_formats=passed$/m);
      assert.match(result.stdout, /^native_formats_failed=false$/m);
      assert.equal(existsSync(diagnosticPath), false, "error evidence fabricated on the passing path");
    } else {
      const expectedExit = exitCode === 0 ? 1 : exitCode;
      assert.deepEqual(JSON.parse(readFileSync(join(root, "native-image-formats.json"), "utf8")), { result: "failed", exitStatus: expectedExit, diagnostic: "native-image-formats-error.txt" });
      assert.match(report, /^native_image_formats=failed$/m);
      assert.match(result.stdout, /^native_formats_failed=true$/m);
      assert.equal(existsSync(diagnosticPath), true, `failed receipt must reference a real diagnostic: ${scenario}`);
      const diagnostic = readFileSync(diagnosticPath, "utf8");
      assert.ok(diagnostic.length > 0 && diagnostic.length <= 200000, `diagnostic must be real and bounded: ${scenario}`);
      assert.match(diagnostic, diagnosticReason);
    }
  }
});

test("final acceptance gate rejects native format failure and completes a fully checked pass", (t) => {
  if (!existsSync(bash)) return t.skip("Bash is unavailable for the extracted gate test");
  for (const [scenario, cold, cache, native, expectExit] of [
    ["all-foundations-passed", "false", "false", "false", 0],
    ["native-formats-failed", "false", "false", "true", 1],
    ["cold-http-failed", "true", "false", "false", 1],
  ]) {
    const root = mkdtempSync(join(tmpdir(), `ornigami-runtime-gate-${scenario}-`));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const shell = [
      "set -Eeuo pipefail",
      `report_dir='${root.replaceAll("'", "'\\''")}'`,
      'report="$report_dir/report.txt"',
      ': >"$report"',
      `cold_http_failed=${cold}`,
      `cache_check_failed=${cache}`,
      `native_formats_failed=${native}`,
      "ORNIGAMI_COMMAND_TIMED_OUT=false",
      "ORNIGAMI_DEADLINE_TIMED_OUT=false",
      "ORNIGAMI_SUPERVISOR_TERMINATED=false",
      "ornigami_deadline_check_runtime() { return 0; }",
      "ornigami_deadline_sync_state() { return 0; }",
      finalGateSlice,
      'printf \'gate_survived=true\\n\'',
    ].join("\n");
    const shellPath = join(root, "gate-test.sh");
    writeFileSync(shellPath, shell);
    const result = spawnSync(bash, [shellPath], { encoding: "utf8" });
    assert.equal(result.status, expectExit, `${result.stdout}\n${result.stderr}`);
    const report = readFileSync(join(root, "report.txt"), "utf8");
    if (expectExit === 0) {
      assert.equal(report, "");
      assert.match(result.stdout, /gate_survived=true/);
    } else {
      assert.match(report, /^native_formats_failed=/m);
      assert.match(result.stderr, /Runtime acceptance failed: cold HTTP, image-cache persistence, or native image-format checks failed/);
    }
  }
});
