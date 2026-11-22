import assert from "node:assert/strict";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import test from "node:test";

const root = process.cwd();

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
const head = spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).stdout.trim();
function relative(target) {
  return path.relative(root, target).split(path.sep).join("/");
}

function runNode(script, env = {}) {
  return spawnSync(process.execPath, [script], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
}

function runBash(script, args = [], env = {}) {
  return spawnSync(bash, [script, ...args], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
}

function writeRequest(file, source = "a".repeat(40), harness = source) {
  writeFileSync(file, JSON.stringify({
    schemaVersion: 1,
    applicationSourceSha: source,
    harnessSha: harness,
    budget: { dispatches: 1, attempts: 1 },
    customerAdmission: "closed",
  }));
}

test("initial branch creation triggers once and ineligible events do not", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "ornigami-event-gate-"));
  try {
    const request = path.join(dir, "request.json");
    const source = "a".repeat(40);
    writeRequest(request, source, source);
    const base = {
      EXPECTED_REF: "refs/heads/ci/builder-exact-rehearsal-43e2691-20261121",
      REQUEST_PATH: request,
      EXPECTED_SOURCE_SHA: source,
      EXPECTED_HARNESS_SHA: source,
      WORKFLOW_SHA: "b".repeat(40),
      EVENT_CREATED: "true",
      EVENT_BEFORE: "0".repeat(40),
      GITHUB_REF: "refs/heads/ci/builder-exact-rehearsal-43e2691-20261121",
      GITHUB_RUN_ATTEMPT: "1",
    };
    const pass = runNode("deploy/builder/private-staging/rehearsal-event-gate.mjs", base);
    assert.equal(pass.status, 0, `${pass.stdout}\n${pass.stderr}`);
    assert.match(pass.stdout, /initial-branch-creation/);

    for (const [name, override] of [
      ["non-creation", { EVENT_CREATED: "false" }],
      ["non-zero before", { EVENT_BEFORE: "c".repeat(40) }],
      ["wrong ref", { GITHUB_REF: "refs/heads/other" }],
      ["second attempt", { GITHUB_RUN_ATTEMPT: "2" }],
      ["wrong source", { EXPECTED_SOURCE_SHA: "d".repeat(40) }],
    ]) {
      const result = runNode("deploy/builder/private-staging/rehearsal-event-gate.mjs", {
        ...base,
        ...override,
      });
      assert.notEqual(result.status, 0, name);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test(
  "checkpoint creates an absent REHEARSAL_DIR instead of requiring runner pre-creation",
  { skip: !bashAvailable && "bash is required" },
  () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "ornigami-fresh-checkpoint-"));
    try {
      const bin = path.join(dir, "bin");
      mkdirSync(bin, { recursive: true });
      const engine = path.join(bin, "docker");
      copyFileSync(path.join(root, "deploy", "builder", "tests", "stub-rehearsal-engine.sh"), engine);
      chmodSync(engine, 0o755);
      const rehearsalDir = path.join(dir, "rehearsal");
      const state = path.join(dir, "state");
      const origin = "https://builder-rehearsal.invalid";
      const imageId = `sha256:${"c".repeat(64)}`;
      assert.equal(existsSync(rehearsalDir), false);
      const result = runBash("deploy/builder/private-staging/rehearse-exact-candidate.sh", [], {
        ACTION: "checkpoint",
        SOURCE_SHA: head,
        HARNESS_SHA: head,
        APP_URL: origin,
        REHEARSAL_DIR: relative(rehearsalDir),
        BUILD_ENGINE: relative(engine),
        VERIFY_ENGINE: relative(engine),
        PHASE_ENGINE: relative(engine),
        BUILD_CONTEXT: "build",
        VERIFY_CONTEXT: "verify",
        PHASE_CONTEXT: "verify",
        STUB_STATE: relative(state),
        STUB_IMAGE_ID: imageId,
        STUB_SOURCE_SHA: head,
        STUB_ORIGIN: origin,
        ENGINE_SHELL: bash,
        ALLOW_DIRTY: "1",
      });
      assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
      assert.equal(existsSync(rehearsalDir), true);
      assert.equal(existsSync(path.join(rehearsalDir, "checkpoint.json")), true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
);

test(
  "control-plane verification rejects a moved branch and a mismatched source",
  { skip: !bashAvailable && "bash is required" },
  () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "ornigami-identity-"));
    try {
      const repo = path.join(dir, "repo");
      mkdirSync(repo);
      const git = (...args) => {
        const result = spawnSync("git", args, { cwd: repo, encoding: "utf8" });
        assert.equal(result.status, 0, `${args.join(" ")}\n${result.stdout}\n${result.stderr}`);
        return result.stdout.trim();
      };
      git("init", "--quiet");
      git("config", "user.email", "synthetic@example.invalid");
      git("config", "user.name", "Synthetic");
      writeFileSync(path.join(repo, "state.txt"), "one\n");
      git("add", "state.txt");
      git("commit", "--quiet", "-m", "one");
      const first = git("rev-parse", "HEAD");
      writeFileSync(path.join(repo, "state.txt"), "two\n");
      git("commit", "--quiet", "-am", "two");
      const second = git("rev-parse", "HEAD");
      git("checkout", "--quiet", "--detach", first);
      const script = "deploy/builder/private-staging/verify-exact-identities.sh";
      const base = {
        CONTROL_ROOT: repo,
        SOURCE_ROOT: repo,
        WORKFLOW_SHA: first,
        SOURCE_SHA: first,
        HARNESS_SHA: first,
        REQUIRE_TIPS: "0",
      };
      const pass = runBash(script, [], base);
      assert.equal(pass.status, 0, `${pass.stdout}\n${pass.stderr}`);
      const moved = runBash(script, [], { ...base, WORKFLOW_SHA: second });
      assert.notEqual(moved.status, 0, "moved triggering branch must not satisfy the expected SHA");
      const sourceMismatch = runBash(script, [], { ...base, SOURCE_SHA: second, HARNESS_SHA: second });
      assert.notEqual(sourceMismatch.status, 0, "source HEAD mismatch must fail");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
);

function fakeDocker(tempDir) {
  const state = path.join(tempDir, "docker-state");
  mkdirSync(path.join(state, "containers"), { recursive: true });
  mkdirSync(path.join(state, "networks"), { recursive: true });
  mkdirSync(path.join(state, "volumes"), { recursive: true });
  const script = path.join(tempDir, "docker");
  writeFileSync(script, `#!/usr/bin/env bash
set -euo pipefail
state="\${STUB_DOCKER_STATE:?}"
last() { local v=""; for a in "$@"; do v="$a"; done; printf '%s' "$v"; }
fail_remove="\${STUB_DOCKER_FAIL_REMOVE:-0}"
case "$1" in
  ps) find "$state/containers" -mindepth 1 -maxdepth 1 -printf '%f\\n' | sort ;;
  rm)
    id="$(last "$@")"
    [[ "$fail_remove" == "1" ]] && exit 1
    rm -rf "$state/containers/$id" ;;
  inspect)
    id="$(last "$@")"
    [[ -d "$state/containers/$id" ]] ;;
  network)
    sub="$2"; name="$(last "$@")"
    case "$sub" in
      ls) find "$state/networks" -mindepth 1 -maxdepth 1 -printf '%f\\n' | sort ;;
      rm) [[ "$fail_remove" == "1" ]] && exit 1; rm -rf "$state/networks/$name" ;;
      inspect) [[ -d "$state/networks/$name" ]] ;;
      *) exit 1 ;;
    esac ;;
  volume)
    sub="$2"; name="$(last "$@")"
    case "$sub" in
      ls) find "$state/volumes" -mindepth 1 -maxdepth 1 -printf '%f\\n' | sort ;;
      rm) [[ "$fail_remove" == "1" ]] && exit 1; rm -rf "$state/volumes/$name" ;;
      inspect) [[ -d "$state/volumes/$name" ]] ;;
      *) exit 1 ;;
    esac ;;
  *) exit 1 ;;
esac
`, { mode: 0o755 });
  chmodSync(script, 0o755);
  mkdirSync(path.join(state, "containers", "c1"));
  mkdirSync(path.join(state, "networks", "n1"));
  mkdirSync(path.join(state, "volumes", "v1"));
  return { script, state };
}

test(
  "cleanup reports success only after exact owned resources are gone and fails when removal remains",
  { skip: !bashAvailable && "bash is required" },
  () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "ornigami-cleanup-"));
    try {
      const fake = fakeDocker(dir);
      const evidence = path.join(dir, "evidence");
      const base = {
        DOCKER_BIN: fake.script,
        STUB_DOCKER_STATE: fake.state,
        PROJECT: "synthetic-project",
        EVIDENCE_DIR: evidence,
      };
      const pass = runBash("deploy/builder/private-staging/cleanup-owned-resources.sh", [], base);
      assert.equal(pass.status, 0, `${pass.stdout}\n${pass.stderr}`);
      assert.match(readFileSync(path.join(evidence, "cleanup-receipt.txt"), "utf8"), /cleanup_failures=0/);

      mkdirSync(path.join(fake.state, "containers", "c1"));
      mkdirSync(path.join(fake.state, "networks", "n1"));
      mkdirSync(path.join(fake.state, "volumes", "v1"));
      const fail = runBash("deploy/builder/private-staging/cleanup-owned-resources.sh", [], {
        ...base,
        STUB_DOCKER_FAIL_REMOVE: "1",
      });
      assert.notEqual(fail.status, 0);
      const receipt = readFileSync(path.join(evidence, "cleanup-receipt.txt"), "utf8");
      assert.match(receipt, /cleanup_failures=[1-9]/);
      assert.match(receipt, /remaining_containers=1/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
);

test(
  "closed-mode HTTP assertions reject unexpected statuses",
  { skip: !bashAvailable && "bash is required" },
  () => {
    const script = "deploy/builder/private-staging/assert-closed-smoke.sh";
    assert.equal(runBash(script, ["200", "404", "401"]).status, 0);
    assert.notEqual(runBash(script, ["200", "404", "200"]).status, 0);
    assert.notEqual(runBash(script, ["500", "404", "401"]).status, 0);
  },
);

test("upload budget counts duplicate archives and the complete artifact set", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "ornigami-upload-budget-"));
  try {
    const script = "deploy/builder/private-staging/check-upload-budget.mjs";
    const rootA = path.join(dir, "pass");
    mkdirSync(rootA);
    writeFileSync(path.join(rootA, "archive.tar"), Buffer.alloc(100));
    const pass = runNode(script, {
      UPLOAD_ROOT: rootA,
      MAX_ARCHIVE_BYTES: "100",
      MAX_ARTIFACT_BYTES: "200",
      RECEIPT_RESERVE_BYTES: "0",
    });
    assert.equal(pass.status, 0, `${pass.stdout}\n${pass.stderr}`);

    const rootB = path.join(dir, "archive-overflow");
    mkdirSync(rootB);
    writeFileSync(path.join(rootB, "archive.tar"), Buffer.alloc(101));
    const archiveOverflow = runNode(script, {
      UPLOAD_ROOT: rootB,
      MAX_ARCHIVE_BYTES: "100",
      MAX_ARTIFACT_BYTES: "1000",
      RECEIPT_RESERVE_BYTES: "0",
      DIAGNOSTICS_DIR: path.join(rootB, "diagnostics"),
      MAX_DIAGNOSTIC_BYTES: "1024",
      RECEIPT_PATH: path.join(rootB, "receipt.json"),
    });
    assert.equal(archiveOverflow.status, 2);
    const receiptB = JSON.parse(readFileSync(path.join(rootB, "receipt.json"), "utf8"));
    assert.equal(receiptB.ok, false);
    assert.ok(receiptB.overflowReasons.includes("archive_limit"));
    assert.equal(existsSync(path.join(rootB, "diagnostics", "archive.tar")), false);

    const rootC = path.join(dir, "duplicate-archive");
    mkdirSync(rootC);
    writeFileSync(path.join(rootC, "archive-a.tar"), Buffer.alloc(60));
    writeFileSync(path.join(rootC, "archive-b.tar"), Buffer.alloc(60));
    const duplicate = runNode(script, {
      UPLOAD_ROOT: rootC,
      MAX_ARCHIVE_BYTES: "100",
      MAX_ARTIFACT_BYTES: "1000",
      RECEIPT_RESERVE_BYTES: "0",
    });
    assert.equal(duplicate.status, 2);
    assert.equal(JSON.parse(duplicate.stdout).archiveCopies, 2);

    const rootD = path.join(dir, "artifact-overflow");
    mkdirSync(rootD);
    writeFileSync(path.join(rootD, "archive.tar"), Buffer.alloc(50));
    writeFileSync(path.join(rootD, "log.txt"), Buffer.alloc(200));
    const artifactOverflow = runNode(script, {
      UPLOAD_ROOT: rootD,
      MAX_ARCHIVE_BYTES: "100",
      MAX_ARTIFACT_BYTES: "200",
      RECEIPT_RESERVE_BYTES: "0",
    });
    assert.equal(artifactOverflow.status, 2);
    assert.ok(JSON.parse(artifactOverflow.stdout).overflowReasons.includes("artifact_limit"));

    const rootE = path.join(dir, "diagnostic-overflow");
    mkdirSync(rootE);
    writeFileSync(path.join(rootE, "archive.tar"), Buffer.alloc(10));
    writeFileSync(path.join(rootE, "console.log"), Buffer.alloc(500));
    const diagnosticOverflow = runNode(script, {
      UPLOAD_ROOT: rootE,
      MAX_ARCHIVE_BYTES: "100",
      MAX_ARTIFACT_BYTES: "1000",
      MAX_DIAGNOSTIC_BYTES: "100",
      RECEIPT_RESERVE_BYTES: "0",
    });
    assert.equal(diagnosticOverflow.status, 2);
    const diagnosticReceipt = JSON.parse(diagnosticOverflow.stdout);
    assert.ok(diagnosticReceipt.overflowReasons.includes("diagnostic_limit"));
    assert.equal(diagnosticReceipt.diagnosticBytes, 500);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("staging copies archives first and bounds diagnostics during the copy", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "ornigami-stage-"));
  try {
    const exportRoot = path.join(dir, "staging");
    const runnerRoot = path.join(dir, "logs");
    const uploadRoot = path.join(dir, "upload");
    mkdirSync(path.join(exportRoot, "custody"), { recursive: true });
    mkdirSync(runnerRoot, { recursive: true });
    writeFileSync(path.join(exportRoot, "custody", "archive.tar"), Buffer.alloc(300));
    writeFileSync(path.join(exportRoot, "custody", "custody-receipt.json"), Buffer.alloc(20));
    writeFileSync(path.join(runnerRoot, "small.log"), Buffer.alloc(40));
    writeFileSync(path.join(runnerRoot, "oversized.log"), Buffer.alloc(5000));
    writeFileSync(path.join(runnerRoot, "another.log"), Buffer.alloc(30));

    const result = runNode("deploy/builder/private-staging/stage-approved-evidence.mjs", {
      SOURCE_ROOTS: `${exportRoot}|${runnerRoot}`,
      UPLOAD_ROOT: uploadRoot,
      MAX_ARCHIVE_BYTES: "1000",
      MAX_ARTIFACT_BYTES: "1000",
      MAX_DIAGNOSTIC_BYTES: "100",
      RECEIPT_RESERVE_BYTES: "0",
      RECEIPT_PATH: path.join(dir, "staging-receipt.json"),
    });
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    const receipt = JSON.parse(readFileSync(path.join(dir, "staging-receipt.json"), "utf8"));
    assert.equal(receipt.archiveBytes, 300);
    assert.equal(receipt.diagnosticBytes, 90);
    assert.equal(receipt.diagnosticsTruncated, true);
    assert.equal(existsSync(path.join(uploadRoot, "staging", "custody", "archive.tar")), true);
    assert.equal(existsSync(path.join(uploadRoot, "logs", "oversized.log")), false);
    const diagnosticTotal = [
      path.join(uploadRoot, "staging", "custody", "custody-receipt.json"),
      path.join(uploadRoot, "logs", "small.log"),
      path.join(uploadRoot, "logs", "another.log"),
    ].reduce((total, file) => total + statSync(file).size, 0);
    assert.equal(diagnosticTotal, 90);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("final diagnostics enforcement stays bounded after every append", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "ornigami-diagnostics-"));
  try {
    const diagnostics = path.join(dir, "diagnostics");
    mkdirSync(diagnostics, { recursive: true });
    writeFileSync(path.join(diagnostics, "EMERGENCY.txt"), Buffer.alloc(40));
    writeFileSync(path.join(diagnostics, "oversized.log"), Buffer.alloc(4000));
    writeFileSync(path.join(diagnostics, "upload-budget.json"), Buffer.alloc(300));

    const enforce = (max) => runNode("deploy/builder/private-staging/enforce-diagnostics-budget.mjs", {
      DIAGNOSTICS_DIR: diagnostics,
      MAX_DIAGNOSTIC_BYTES: String(max),
      RECEIPT_PATH: path.join(dir, "diagnostics-budget.json"),
    });

    const pass = enforce(1000);
    assert.equal(pass.status, 0, `${pass.stdout}\n${pass.stderr}`);
    const total = readdirSync(diagnostics)
      .map((name) => statSync(path.join(diagnostics, name)).size)
      .reduce((sum, bytes) => sum + bytes, 0);
    assert.ok(total <= 1000, `diagnostics total ${total} exceeds limit`);
    assert.equal(existsSync(path.join(diagnostics, "EMERGENCY.txt")), true);

    // A new append after the first enforcement must be bounded again.
    writeFileSync(path.join(diagnostics, "late.log"), Buffer.alloc(4096));
    const second = enforce(1000);
    assert.equal(second.status, 0, `${second.stdout}\n${second.stderr}`);
    const afterAppend = readdirSync(diagnostics)
      .map((name) => statSync(path.join(diagnostics, name)).size)
      .reduce((sum, bytes) => sum + bytes, 0);
    assert.ok(afterAppend <= 1000, `diagnostics total ${afterAppend} exceeds limit after append`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("staging retains a bounded tail of a priority console log", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "ornigami-stage-priority-"));
  try {
    const runnerRoot = path.join(dir, "logs");
    const uploadRoot = path.join(dir, "upload");
    mkdirSync(runnerRoot, { recursive: true });
    writeFileSync(path.join(runnerRoot, "final-status.txt"), "final_status=1\n");
    writeFileSync(path.join(runnerRoot, "rehearsal-console.log"), Buffer.alloc(10000, 65));
    writeFileSync(path.join(runnerRoot, "unimportant.log"), Buffer.alloc(10000, 66));
    const result = runNode("deploy/builder/private-staging/stage-approved-evidence.mjs", {
      SOURCE_ROOTS: runnerRoot,
      UPLOAD_ROOT: uploadRoot,
      MAX_ARCHIVE_BYTES: "0",
      MAX_ARTIFACT_BYTES: "2000",
      MAX_DIAGNOSTIC_BYTES: "1200",
      RECEIPT_RESERVE_BYTES: "0",
      RECEIPT_PATH: path.join(dir, "staging-receipt.json"),
    });
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    const priority = path.join(uploadRoot, "logs", "rehearsal-console.log");
    assert.equal(existsSync(priority), true, "priority console log must be retained");
    assert.ok(statSync(priority).size <= 1200);
    const receipt = JSON.parse(readFileSync(path.join(dir, "staging-receipt.json"), "utf8"));
    assert.equal(receipt.diagnosticsTruncated, true);
    assert.ok(receipt.skipped.some((entry) => entry.reason === "diagnostic_truncated"));
    assert.equal(existsSync(path.join(uploadRoot, "logs", "unimportant.log")), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("proxy binding profiles reject mixed, extra and changed bindings through the CLI", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "ornigami-proxy-"));
  try {
    const loopback = {
      "80/tcp": [{ HostIp: "127.0.0.1", HostPort: "80" }],
      "443/tcp": [{ HostIp: "127.0.0.1", HostPort: "443" }],
      "443/udp": [{ HostIp: "127.0.0.1", HostPort: "443" }],
    };
    const wildcard = {
      "80/tcp": [{ HostIp: "", HostPort: "80" }],
      "443/tcp": [{ HostIp: "0.0.0.0", HostPort: "443" }],
      "443/udp": [{ HostIp: "::", HostPort: "443" }],
    };
    const cli = (bindings, profile) => spawnSync(process.execPath, [
      "deploy/builder/private-staging/proxy-bindings.mjs",
      "--bindings-json", JSON.stringify(bindings),
      "--profile", profile,
    ], { cwd: root, encoding: "utf8" });

    assert.equal(cli(loopback, "loopback").status, 0);
    assert.equal(cli(wildcard, "wildcard").status, 0);
    assert.equal(cli(loopback, "wildcard").status, 1);
    assert.equal(cli(wildcard, "loopback").status, 1);
    assert.equal(cli({ ...loopback, "8080/tcp": [{ HostIp: "127.0.0.1", HostPort: "8080" }] }, "loopback").status, 1);
    assert.equal(cli({ ...loopback, "443/tcp": [{ HostIp: "0.0.0.0", HostPort: "443" }] }, "loopback").status, 1);
    assert.equal(cli({ ...loopback, "443/tcp": [{ HostIp: "127.0.0.1", HostPort: "8443" }] }, "loopback").status, 1);
    assert.equal(cli(loopback, "unknown").status, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("bundle workflow keeps the emergency root, staging and preflight order", () => {
  const workflow = readFileSync(".github/workflows/builder-exact-rehearsal-0d68551.yml", "utf8");
  const emergency = workflow.indexOf("Create runner-owned emergency diagnostics");
  const checkout = workflow.indexOf("Check out bundle control plane");
  const preflight = workflow.indexOf("verify-linux-ownership.sh");
  const regression = workflow.indexOf("builder-linux-ownership-preflight.test.mjs");
  const install = workflow.indexOf("Install supported Node");
  const stage = workflow.indexOf("stage-approved-evidence.mjs");
  const enforce = workflow.indexOf("enforce-diagnostics-budget.mjs");
  assert.ok(emergency >= 0 && emergency < checkout, "emergency diagnostics must be created before checkout");
  assert.ok(preflight >= 0 && preflight < install, "ownership preflight must run before installation");
  assert.ok(regression > preflight && regression < install, "Linux ownership regression must run before installation");
  assert.ok(stage >= 0 && enforce > stage, "diagnostics must be enforced after staging and appends");
  assert.match(workflow, /EMERGENCY_ROOT: \/tmp\/ornigami-exact-rehearsal-emergency-0d68551-/);
  assert.match(workflow, /SOURCE_SHA: 0d68551324ce3f441478f613d2f4eb48b9be4f3f/);
  assert.match(workflow, /ci\/builder-exact-rehearsal-0d68551-preflight-20261122/);
  assert.match(workflow, /CONTROL_ROOT="\$GITHUB_WORKSPACE"/);
  assert.match(workflow, /DOCKER_BUILD_ENDPOINT="tcp:\/\/127\.0\.0\.1:2375"/);
  assert.match(workflow, /usermod -aG docker/);
  assert.match(workflow, /ownership-preflight-failure\.txt/);
  assert.match(workflow, /verify-linux-ownership\.sh\s*\\\s*\n\s*2>&1 \| tee/);
  assert.doesNotMatch(workflow, /EVIDENCE_ROOT\/diagnostics/);
  assert.doesNotMatch(workflow, /cp -a "\$EVIDENCE_ROOT\/logs/);
  assert.equal(existsSync("tests/builder-linux-ownership-preflight.test.mjs"), true);
  const preflightScript = readFileSync("deploy/builder/private-staging/verify-linux-ownership.sh", "utf8");
  assert.match(preflightScript, /builder_stat\(\)/);
  assert.match(preflightScript, /require_builder_denied\(\)/);
  assert.match(preflightScript, /failure_assertion/);
  assert.match(preflightScript, /effective_user=/);
  assert.doesNotMatch(preflightScript, /chmod 0700 "\$UPLOAD_STAGING"/);
  const runScript = readFileSync("deploy/builder/private-staging/run-exact-rehearsal-linux.sh", "utf8");
  assert.match(runScript, /--profile loopback/);
  assert.match(runScript, /PROXY_BINDING_PROFILE=loopback/);
  assert.match(runScript, /proxy_binding_profile=loopback/);
});

test(
  "all bundle shell helpers are syntactically valid",
  { skip: !bashAvailable && "bash is required" },
  () => {
    const directory = path.join(root, "deploy", "builder", "private-staging");
    for (const name of readdirSync(directory).filter((entry) => entry.endsWith(".sh"))) {
      const result = spawnSync(bash, ["-n", path.join(directory, name)], { encoding: "utf8" });
      assert.equal(result.status, 0, `${name}\n${result.stderr}`);
    }
  },
);

test(
  "final status preserves an earlier failure while cleanup failures prevent success",
  { skip: !bashAvailable && "bash is required" },
  () => {
    const script = "deploy/builder/private-staging/finalize-rehearsal-status.sh";
    assert.equal(runBash(script, ["0", "0"]).status, 0);
    assert.equal(runBash(script, ["0", "1"]).status, 1);
    assert.equal(runBash(script, ["7", "1"]).status, 7);
  },
);

const readinessCandidate = "863a8a77d7a6b71b72a4140f6fd9b2ff8ef11816";
const stagedCandidate = "156259d0c4330b185a0844711b7004b0b4467887";
const readinessWorkflow = ".github/workflows/builder-exact-rehearsal-0d68551-readiness.yml";
const stagedWorkflow = ".github/workflows/builder-exact-rehearsal-0d68551-staged.yml";

test("readiness workflow gates installation on bounded probes and ownership fixtures in order", () => {
  const workflow = readFileSync(readinessWorkflow, "utf8");
  const probeStep = workflow.indexOf("Probe published build daemon readiness");
  const preflightStep = workflow.indexOf("Linux ownership and profile preflight");
  const regressionStep = workflow.indexOf("Linux ownership preflight regression");
  const gateStep = workflow.indexOf("Gate Linux readiness and ownership");
  const installStep = workflow.indexOf("Install supported Node");
  const buildStep = workflow.indexOf("Execute checkpoint, private edge");
  assert.ok(probeStep >= 0 && probeStep < preflightStep, "readiness probe must precede ownership preflight");
  assert.ok(preflightStep < regressionStep, "ownership preflight must precede its regression");
  assert.ok(regressionStep < gateStep, "regression must precede the installation gate");
  assert.ok(gateStep < installStep && gateStep < buildStep, "gate must precede installation and execution");
  assert.match(workflow, /probe-docker-endpoint\.sh/);
  assert.match(workflow, /build_probe_ok/);
  assert.match(workflow, /preflight_ok/);
  assert.match(workflow, /regression_ok/);
  assert.match(workflow, /SOURCE_SHA: 863a8a77d7a6b71b72a4140f6fd9b2ff8ef11816/);
  assert.match(workflow, /HARNESS_SHA: 863a8a77d7a6b71b72a4140f6fd9b2ff8ef11816/);
  assert.match(workflow, /ci\/builder-exact-rehearsal-0d68551-readiness-20261122/);
  assert.match(workflow, /ref: 863a8a77d7a6b71b72a4140f6fd9b2ff8ef11816/);
  assert.match(workflow, /builder-exact-rehearsal-0d68551-readiness-retrieval-/);
  assert.match(workflow, /build-daemon-readiness-failure\.txt/);
  assert.match(workflow, /actions\/upload-artifact@bbbca2ddaa5d8feaa63e36b76fdaad77386f024f/);
  const gate = workflow.slice(gateStep, installStep);
  assert.match(gate, /build-daemon-readiness-build\.log/);
  assert.match(gate, /ownership-preflight-failure\.txt/);
  assert.doesNotMatch(workflow, /0d68551324ce3f441478f613d2f4eb48b9be4f3f/);
});

test("debug workflow is path-triggered or manual, bounded and does not install or build", () => {
  const workflow = readFileSync(".github/workflows/builder-rehearsal-preflight-debug.yml", "utf8");
  assert.match(workflow, /\.github\/debug-requests\/builder-rehearsal-preflight\.json/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /timeout-minutes: 10/);
  assert.match(workflow, /probe-docker-endpoint\.sh/);
  assert.match(workflow, /OVERALL_TIMEOUT_SECONDS/);
  assert.match(workflow, /PROBE_TIMEOUT_SECONDS/);
  assert.match(workflow, /negative-closed-port/);
  assert.match(workflow, /tcp:\/\/0\.0\.0\.0:2375/);
  assert.match(workflow, /builder-linux-ownership-preflight\.test\.mjs/);
  assert.match(workflow, /enforce-diagnostics-budget\.mjs/);
  assert.doesNotMatch(workflow, /npm ci/);
  assert.doesNotMatch(workflow, /docker build|rehearse-exact-candidate\.sh/);
});

test("directly invoked private-staging helpers are executable in the frozen candidate and bundle", () => {
  const candidatePaths = [
    "deploy/builder/private-staging/build-and-retain.sh",
    "deploy/builder/private-staging/qualify-existing-image.sh",
    "deploy/builder/private-staging/accept-browser.sh",
    "deploy/builder/private-staging/accept-runtime.sh",
    "deploy/builder/private-staging/accept-runtime-rollback.sh",
    "deploy/builder/private-staging/rehearse-exact-candidate.sh",
    "deploy/builder/qualify-linux.sh",
  ];
  for (const candidate of [readinessCandidate, stagedCandidate]) {
    const available = spawnSync("git", ["cat-file", "-e", `${candidate}^{commit}`], {
      cwd: root,
      encoding: "utf8",
    }).status === 0;
    // Incidentals such as the repository Quality job use a shallow checkout
    // that may not contain older candidate commits. The rehearsal checkout and
    // verify-exact-identities.sh always fetch the exact candidate.
    if (!available) continue;
    for (const path of candidatePaths) {
      const result = spawnSync("git", ["ls-tree", candidate, path], { cwd: root, encoding: "utf8" });
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /^100755 /, `candidate helper is not executable: ${path}`);
    }
  }
  const bundlePaths = [
    "deploy/builder/private-staging/run-exact-rehearsal-linux.sh",
    "deploy/builder/private-staging/run-candidate-gates.sh",
    "deploy/builder/private-staging/cleanup-owned-resources.sh",
    "deploy/builder/private-staging/finalize-rehearsal-status.sh",
    "deploy/builder/private-staging/assert-closed-smoke.sh",
    "deploy/builder/private-staging/probe-docker-endpoint.sh",
  ];
  for (const path of bundlePaths) {
    const result = spawnSync("git", ["ls-files", "-s", "--", path], { cwd: root, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /^100755 /, `bundle helper is not executable: ${path}`);
  }
});

test("endpoint probe bounds every attempt and retains classification and diagnostics", () => {
  const script = readFileSync("deploy/builder/private-staging/probe-docker-endpoint.sh", "utf8");
  assert.match(script, /OVERALL_TIMEOUT_SECONDS/);
  assert.match(script, /PROBE_TIMEOUT_SECONDS/);
  assert.match(script, /--signal=TERM --kill-after=3/);
  assert.match(script, /transient_startup/);
  assert.match(script, /access_or_config/);
  assert.match(script, /empty_response/);
  assert.match(script, /daemonId/);
  assert.match(script, /diagnostics/);
  assert.match(script, /loopback-only/);
  assert.match(script, /\[::1\]/);
  assert.doesNotMatch(script, /for _ in \$\(seq 1 [0-9]+\)/);
});

test("serialized gate discovery is identical to scripts/test.mjs discovery", () => {
  const expected = readdirSync("tests")
    .filter((name) => /\.test\.(?:mts|mjs)$/.test(name))
    .sort()
    .map((name) => path.join("tests", name).split(path.sep).join("/"));
  const result = spawnSync(
    bash,
    ["-c", "find tests -maxdepth 1 -type f \\( -name '*.test.mjs' -o -name '*.test.mts' \\) | sort"],
    { cwd: root, encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  const actual = result.stdout.trim().split(/\r?\n/).filter(Boolean);
  assert.deepEqual(actual, expected);
  assert.ok(actual.length > 0);
});

test("request file records the candidate correction and readiness workflow", () => {
  const request = JSON.parse(readFileSync(
    ".github/build-requests/builder-exact-rehearsal-0d68551-readiness.json",
    "utf8",
  ));
  assert.equal(request.applicationSourceSha, readinessCandidate);
  assert.equal(request.harnessSha, readinessCandidate);
  assert.equal(request.candidateCorrection.parent, "0d68551324ce3f441478f613d2f4eb48b9be4f3f");
  assert.equal(request.workflowFile, readinessWorkflow);
  assert.equal(request.trigger.branch, "ci/builder-exact-rehearsal-0d68551-readiness-20261122");
  assert.equal(request.customerAdmission, "closed");
  assert.equal(request.budget.lightweightDebugRuns, 4);
});

test("staged workflow runs a clean no-DinD gate before the build job", () => {
  const workflow = readFileSync(stagedWorkflow, "utf8");
  const gateStart = workflow.indexOf("Clean candidate gate (no DinD)");
  const executeStart = workflow.indexOf("Execute exact candidate on synthetic Linux edge");
  assert.ok(gateStart > 0 && gateStart < executeStart);
  const gateBlock = workflow.slice(gateStart, executeStart);
  assert.doesNotMatch(gateBlock, /^    services:/m);
  assert.match(gateBlock, /run-candidate-gates\.sh/);
  assert.match(gateBlock, /write-gate-receipt\.mjs/);
  assert.match(gateBlock, /Install PostgreSQL 17/);
  assert.match(gateBlock, /builder-gate-receipt-/);
  assert.match(gateBlock, /WORKFLOW_SHA: \$\{\{ github\.sha \}\}/);
  assert.match(workflow, /needs: gate/);
  assert.match(workflow, /verify-candidate-gate-receipt\.mjs/);
  assert.match(workflow, /SKIP_CANDIDATE_GATES=1/);
  assert.match(workflow, /CANDIDATE_GATE_RECEIPT/);
  assert.match(workflow, /156259d0c4330b185a0844711b7004b0b4467887/);
  assert.match(workflow, /ci\/builder-exact-rehearsal-0d68551-staged/);
  assert.match(workflow, /builder-exact-rehearsal-0d68551-staged-retrieval-/);
});

test("staged request records the new candidate and clean-gate handoff", () => {
  const request = JSON.parse(readFileSync(
    ".github/build-requests/builder-exact-rehearsal-0d68551-staged.json",
    "utf8",
  ));
  assert.equal(request.applicationSourceSha, stagedCandidate);
  assert.equal(request.harnessSha, stagedCandidate);
  assert.equal(request.workflowFile, stagedWorkflow);
  assert.match(request.trigger.branch, /^ci\/builder-exact-rehearsal-0d68551-staged/);
  assert.equal(request.customerAdmission, "closed");
  assert.equal(request.budget.stagedWorkflow, 1);
});

test("gate receipt binds identities and selects the complete global suite result", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "ornigami-gate-receipt-"));
  try {
    const log = path.join(dir, "candidate-gate.log");
    const lockfile = path.join(dir, "package-lock.json");
    const receipt = path.join(dir, "gate-receipt.json");
    const nested = [
      "# tests 7",
      "# pass 7",
      "# fail 0",
      "# skipped 0",
      "# todo 0",
    ].join("\n");
    const global = [
      "# tests 1461",
      "# pass 1459",
      "# fail 0",
      "# skipped 2",
      "# todo 0",
    ].join("\n");
    writeFileSync(log, `synthetic gate log\n${nested}\nmore output\n${global}\n`);
    writeFileSync(lockfile, "synthetic lockfile\n");
    const source = "a".repeat(40);
    const harness = "b".repeat(40);
    const control = "c".repeat(40);
    const created = runNode("deploy/builder/private-staging/write-gate-receipt.mjs", {
      GATE_LOG_PATH: log,
      RECEIPT_PATH: receipt,
      APPLICATION_SOURCE_SHA: source,
      HARNESS_SHA: harness,
      CONTROL_PLANE_SHA: control,
      CANDIDATE_HEAD: source,
      LOCKFILE_PATH: lockfile,
      BUILDER_USER: "builder",
      NODE_VERSION: "v22.23.3",
      NPM_VERSION: "11.21.1",
      PG_VERSION: "pg_config (PostgreSQL) 17.0",
      SUITE_COUNT: "217",
    });
    assert.equal(created.status, 0, `${created.stdout}\n${created.stderr}`);
    const parsed = JSON.parse(readFileSync(receipt, "utf8"));
    assert.equal(parsed.status, "passed");
    assert.equal(parsed.tests, 1461);
    assert.equal(parsed.pass, 1459);
    assert.equal(parsed.fail, 0);
    assert.equal(parsed.skipped, 2);
    assert.equal(parsed.suiteCount, 217);
    assert.equal(parsed.controlPlaneSha, control);
    assert.equal(
      parsed.gateLogSha256,
      createHash("sha256").update(readFileSync(log)).digest("hex"),
    );

    const verified = runNode("deploy/builder/private-staging/verify-candidate-gate-receipt.mjs", {
      RECEIPT_PATH: receipt,
      GATE_LOG_PATH: log,
      EXPECTED_SOURCE_SHA: source,
      EXPECTED_HARNESS_SHA: harness,
      EXPECTED_CONTROL_PLANE_SHA: control,
      EXPECTED_LOCKFILE_SHA256: createHash("sha256").update(readFileSync(lockfile)).digest("hex"),
    });
    assert.equal(verified.status, 0, `${verified.stdout}\n${verified.stderr}`);
    assert.match(verified.stdout, /"ok": true/);

    const tampered = runNode("deploy/builder/private-staging/verify-candidate-gate-receipt.mjs", {
      RECEIPT_PATH: receipt,
      GATE_LOG_PATH: log,
      EXPECTED_SOURCE_SHA: source,
      EXPECTED_HARNESS_SHA: harness,
      EXPECTED_CONTROL_PLANE_SHA: "d".repeat(40),
      EXPECTED_LOCKFILE_SHA256: createHash("sha256").update(readFileSync(lockfile)).digest("hex"),
    });
    assert.notEqual(tampered.status, 0);
    assert.match(`${tampered.stdout}\n${tampered.stderr}`, /controlPlaneSha mismatch/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

