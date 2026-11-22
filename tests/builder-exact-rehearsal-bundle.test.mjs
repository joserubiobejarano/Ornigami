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
  const install = workflow.indexOf("Install supported Node");
  const stage = workflow.indexOf("stage-approved-evidence.mjs");
  const enforce = workflow.indexOf("enforce-diagnostics-budget.mjs");
  assert.ok(emergency >= 0 && emergency < checkout, "emergency diagnostics must be created before checkout");
  assert.ok(preflight >= 0 && preflight < install, "ownership preflight must run before installation");
  assert.ok(stage >= 0 && enforce > stage, "diagnostics must be enforced after staging and appends");
  assert.match(workflow, /EMERGENCY_ROOT: \/tmp\/ornigami-exact-rehearsal-emergency-0d68551-/);
  assert.match(workflow, /SOURCE_SHA: 0d68551324ce3f441478f613d2f4eb48b9be4f3f/);
  assert.match(workflow, /ci\/builder-exact-rehearsal-0d68551-20261122/);
  assert.doesNotMatch(workflow, /EVIDENCE_ROOT\/diagnostics/);
  assert.doesNotMatch(workflow, /cp -a "\$EVIDENCE_ROOT\/logs/);
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
