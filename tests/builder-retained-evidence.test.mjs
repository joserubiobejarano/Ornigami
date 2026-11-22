import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const library = path.resolve("deploy/builder/private-staging/retained-evidence.sh");

function findBash() {
  if (process.env.BASH) return process.env.BASH;
  if (process.platform === "win32") {
    for (const candidate of [
      "C:\\Program Files\\Git\\bin\\bash.exe",
      "C:\\Program Files\\Git\\usr\\bin\\bash.exe",
    ]) {
      if (existsSync(candidate)) return candidate;
    }
  }
  return "bash";
}

function bashPath(value) {
  return path.resolve(value).replaceAll("\\", "/");
}

function quote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

function run(script, env = {}) {
  return spawnSync(findBash(), ["-c", script], {
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
}

function fixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), "ornigami-evidence-"));
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

test("prepare_retained_evidence_root creates every write destination", () => {
  const { root, cleanup } = fixture();
  try {
    const evidence = path.join(root, "evidence");
    const result = run(`
      set -Eeuo pipefail
      source ${quote(bashPath(library))}
      prepare_retained_evidence_root ${quote(bashPath(evidence))}
      for directory in logs custody edge secrets; do
        test -d ${quote(bashPath(evidence))}/"$directory"
      done
      if [[ "$CHECK_MODE" == "1" ]]; then
        test "$(stat -c '%a' ${quote(bashPath(evidence))}/secrets)" = "700"
      fi
    `,
      { CHECK_MODE: process.platform === "win32" ? "0" : "1" },
    );
    assert.equal(result.status, 0, result.stderr);
    for (const name of ["logs", "custody", "edge", "secrets"]) {
      assert.ok(existsSync(path.join(evidence, name)), name);
    }
  } finally {
    cleanup();
  }
});

test("export_retained_evidence copies the complete approved set", () => {
  const { root, cleanup } = fixture();
  try {
    const evidence = path.join(root, "evidence");
    const stage = path.join(root, "stage");
    for (const name of ["logs", "custody", "edge"]) {
      mkdirSync(path.join(evidence, name), { recursive: true });
    }
    mkdirSync(stage, { recursive: true });
    writeFileSync(path.join(evidence, "logs", "run.log"), "log\n");
    writeFileSync(path.join(evidence, "custody", "custody.json"), "{}\n");
    writeFileSync(path.join(evidence, "edge", "root.crt"), "cert\n");
    for (const name of [
      "host.txt",
      "cleanup-receipt.txt",
      "access-closed.txt",
      "image-inspect.json",
      "image-identity-verification.json",
      "archive-producer-identity.txt",
    ]) {
      writeFileSync(path.join(evidence, name), `${name}\n`);
    }
    const archive = path.join(root, "builder.tar");
    const receipt = path.join(root, "archive-receipt.json");
    writeFileSync(archive, "archive\n");
    writeFileSync(receipt, "{}\n");

    const result = run(
      `
      set -Eeuo pipefail
      source ${quote(bashPath(library))}
      export_retained_evidence ${quote(bashPath(evidence))} ${quote(bashPath(stage))}
      `,
      {
        ARCHIVE_PATH: bashPath(archive),
        ARCHIVE_RECEIPT_PATH: bashPath(receipt),
        REHEARSAL_DIR: bashPath(path.join(evidence, "existing-image")),
      },
    );
    assert.equal(result.status, 0, result.stderr);
    for (const name of [
      "host.txt",
      "cleanup-receipt.txt",
      "access-closed.txt",
      "image-inspect.json",
      "image-identity-verification.json",
      "archive-producer-identity.txt",
      "custody/archive-receipt.json",
      "logs/run.log",
      "custody/custody.json",
      "edge/root.crt",
    ]) {
      assert.ok(existsSync(path.join(stage, name)), name);
    }
    assert.equal(readFileSync(path.join(stage, "custody", "builder.tar"), "utf8"), "archive\n");
    if (process.platform !== "win32") {
      assert.equal(readFileSync(path.join(stage, "host.txt"), "utf8"), "host.txt\n");
      const mode = (file) => Number.parseInt(requireMode(file), 8);
      assert.equal(mode(path.join(stage, "host.txt")), 0o640);
      assert.equal(mode(path.join(stage, "logs")), 0o750);
    }
  } finally {
    cleanup();
  }
});

function requireMode(file) {
  const result = spawnSync("stat", ["-c", "%a", file], { encoding: "utf8" });
  if (result.status !== 0) {
    // Windows Git Bash supports stat through the bash used by the caller.
    const bash = spawnSync(findBash(), ["-c", `stat -c '%a' ${quote(bashPath(file))}`], {
      encoding: "utf8",
    });
    return bash.stdout.trim();
  }
  return result.stdout.trim();
}

test("missing or unwritable staging fails without erasing the original failure", () => {
  const { root, cleanup } = fixture();
  try {
    const evidence = path.join(root, "evidence");
    mkdirSync(evidence, { recursive: true });
    writeFileSync(path.join(evidence, "final-status.txt"), "final_status=1\n");
    const blockingParent = path.join(root, "blocking");
    writeFileSync(blockingParent, "not a directory\n");
    const result = run(`
      set -Eeuo pipefail
      source ${quote(bashPath(library))}
      if export_retained_evidence ${quote(bashPath(evidence))} ${quote(bashPath(path.join(blockingParent, "stage")))}; then
        exit 99
      fi
    `);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stderr, /not a directory/i);
    assert.equal(readFileSync(path.join(evidence, "final-status.txt"), "utf8"), "final_status=1\n");
  } finally {
    cleanup();
  }
});

test("a file where a staging directory is required is rejected before copying", () => {
  const { root, cleanup } = fixture();
  try {
    const evidence = path.join(root, "evidence");
    const stage = path.join(root, "stage");
    mkdirSync(evidence, { recursive: true });
    mkdirSync(stage, { recursive: true });
    writeFileSync(path.join(stage, "logs"), "not a directory\n");
    const result = run(`
      set -Eeuo pipefail
      source ${quote(bashPath(library))}
      if export_retained_evidence ${quote(bashPath(evidence))} ${quote(bashPath(stage))}; then
        exit 99
      fi
    `);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stderr, /logs is not a directory/i);
    assert.equal(readFileSync(path.join(stage, "logs"), "utf8"), "not a directory\n");
  } finally {
    cleanup();
  }
});

test("host identity records the actual daemon ID and both harness identities", () => {
  const { root, cleanup } = fixture();
  try {
    const bin = path.join(root, "bin");
    const evidence = path.join(root, "evidence");
    mkdirSync(bin, { recursive: true });
    mkdirSync(evidence, { recursive: true });
    const docker = path.join(bin, "docker");
    writeFileSync(
      docker,
      `#!/usr/bin/env bash
if [[ "$1" == "info" ]]; then printf 'daemon-test-123\\n'; exit 0; fi
if [[ "$1" == "--version" ]]; then printf 'Docker version test\\n'; exit 0; fi
exit 1
`,
    );
    chmodSync(docker, 0o755);
    const result = run(
      `
      set -Eeuo pipefail
      source ${quote(bashPath(library))}
      record_retained_host_identity \
        ${quote(bashPath(evidence))} \
        156259d0c4330b185a0844711b7004b0b4467887 \
        156259d0c4330b185a0844711b7004b0b4467887 \
        6ef785961d3f5c6084650ee9a119b78943a598e6 \
        e3d8a1d1844cd647d1d63f7e6185c185e33b9911 \
        https://builder-rehearsal.invalid \
        sha256:d50ef3d2c02cf002433dfc48e03efdcae895f9ae3d1f6042b17bc9cfe8836b57 \
        a44a81f843033f50479dad8d5dd196acc8587b9e5c31090b7794df51a680d7df \
        1000632832
      `,
      { PATH: `${bashPath(bin)}:${process.env.PATH}` },
    );
    assert.equal(result.status, 0, result.stderr);
    const host = readFileSync(path.join(evidence, "host.txt"), "utf8");
    assert.match(host, /host_daemon_id=daemon-test-123/);
    assert.match(host, /docker_client=Docker version test/);
    assert.match(host, /producer_harness_sha=156259d0c4330b185a0844711b7004b0b4467887/);
    assert.match(host, /consumer_harness_sha=6ef785961d3f5c6084650ee9a119b78943a598e6/);
  } finally {
    cleanup();
  }
});

test("host identity failure leaves no partial host.txt", () => {
  const { root, cleanup } = fixture();
  try {
    const bin = path.join(root, "bin");
    const evidence = path.join(root, "evidence");
    mkdirSync(bin, { recursive: true });
    mkdirSync(evidence, { recursive: true });
    const docker = path.join(bin, "docker");
    writeFileSync(docker, "#!/usr/bin/env bash\nexit 7\n");
    chmodSync(docker, 0o755);
    const result = run(
      `
      set -Eeuo pipefail
      source ${quote(bashPath(library))}
      if record_retained_host_identity \
        ${quote(bashPath(evidence))} \
        aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa \
        aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa \
        bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb \
        cccccccccccccccccccccccccccccccccccccccc \
        https://builder-rehearsal.invalid \
        sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd \
        eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee \
        1; then
        exit 99
      fi
    `,
      { PATH: `${bashPath(bin)}:${process.env.PATH}` },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.equal(existsSync(path.join(evidence, "host.txt")), false);
  } finally {
    cleanup();
  }
});
