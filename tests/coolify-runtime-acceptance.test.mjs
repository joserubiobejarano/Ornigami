import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

const harnessPath = resolve("deploy/coolify/linux-runtime-acceptance.sh");
const harness = readFileSync(harnessPath, "utf8");
const pythonBlocks = [...harness.matchAll(/<<'PY'\n([\s\S]*?)\nPY/g)].map((match) => match[1]);
const receiptWriter = pythonBlocks.find((block) => block.includes('"runtime-http.json"'));
const failureWriter = pythonBlocks.find((block) => block.includes('"failure-evidence.txt"'));
const python = process.env.PYTHON3 ?? (process.platform === "win32" ? "python" : "python3");
const bash = process.env.BASH ?? (process.platform === "win32" ? "C:/Program Files/Git/bin/bash.exe" : "bash");

assert.ok(receiptWriter, "runtime receipt Python writer must be present");
assert.ok(failureWriter, "failure receipt Python writer must be present");

function runPython(block, args) {
  const result = spawnSync(python, ["-c", block, ...args], { encoding: "utf8" });
  if (result.error) throw result.error;
  return result;
}

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
