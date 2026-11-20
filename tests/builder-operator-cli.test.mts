import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import test from "node:test";

const root = process.cwd();
const tempRoot = path.join(root, ".local", "test-operator-cli");
const operatorScript = path.join(root, "scripts", "builder-invite-operator.mjs");
const hostId = "qualify-operator-test-host";
rmSync(tempRoot, { recursive: true, force: true });
mkdirSync(tempRoot, { recursive: true });

function storeDir(name: string): string {
  return mkdtempSync(path.join(tempRoot, `${name}-`));
}

function runOperator(
  args: string[],
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ["--experimental-strip-types", operatorScript, ...args],
      {
        cwd: root,
        env: { ...process.env, BUILDER_RUNTIME_STORE_HOST_ID: hostId },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

async function operatorJson(args: string[]) {
  const result = await runOperator([...args, "--json"]);
  assert.equal(result.code, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout.trim());
}

function hashStore(dir: string): string {
  return createHash("sha256")
    .update(readFileSync(path.join(dir, "identity-store.json")))
    .digest("hex");
}

function lockBytes(token: string, hostname = hostId, pid = 2_147_483_647) {
  return `${JSON.stringify({
    version: 1,
    token,
    pid,
    hostname,
    acquiredAt: "2020-01-01T00:00:00.000Z",
  })}\n`;
}

test("the supported operator path reports the store host and lock state", async () => {
  const dir = storeDir("status");
  const issued = await operatorJson([
    "issue",
    "--store",
    dir,
    "--label",
    "Operator status",
    "--ttl-seconds",
    "600",
  ]);
  assert.equal(issued.subjectLabel, "Operator status");

  const status = await operatorJson(["lock-status", "--store", dir]);
  assert.equal(status.hostId, hostId);
  assert.equal(status.storePresent, true);
  assert.equal(status.storeVersion, 1);
  assert.match(status.storeHash, /^[0-9a-f]{64}$/);
  assert.equal(status.lock.owner, "missing");
  assert.equal(status.reapLock.owner, "missing");

  writeFileSync(
    path.join(dir, "identity-store.lock"),
    lockBytes("foreign-token", "replaced-builder-container"),
  );
  const foreign = await operatorJson(["lock-status", "--store", dir]);
  assert.equal(foreign.lock.owner, "foreign_host");
  assert.equal(foreign.lock.metadata.token, "foreign-token");
  assert.equal(foreign.lock.metadata.pid, 2_147_483_647);
});

test("recover-lock refuses without confirmation or the observed token", async () => {
  const dir = storeDir("recover-guard");
  await operatorJson([
    "issue",
    "--store",
    dir,
    "--label",
    "Guard",
    "--ttl-seconds",
    "600",
  ]);
  const lockFile = path.join(dir, "identity-store.lock");
  writeFileSync(lockFile, lockBytes("observed-token", "replaced-builder-container"));
  const before = hashStore(dir);

  const noConfirmation = await runOperator([
    "recover-lock",
    "--store",
    dir,
    "--token",
    "observed-token",
  ]);
  assert.notEqual(noConfirmation.code, 0);
  assert.equal(existsSync(lockFile), true);

  const wrongToken = await runOperator([
    "recover-lock",
    "--store",
    dir,
    "--token",
    "different-token",
    "--confirm-no-writers",
  ]);
  assert.notEqual(wrongToken.code, 0);
  assert.equal(existsSync(lockFile), true);
  assert.equal(hashStore(dir), before);
});

test("confirmed recovery quarantines only the observed lock and preserves the store", async () => {
  const dir = storeDir("recover");
  await operatorJson([
    "issue",
    "--store",
    dir,
    "--label",
    "Recovery",
    "--ttl-seconds",
    "600",
  ]);
  const lockFile = path.join(dir, "identity-store.lock");
  const reapFile = path.join(dir, "identity-store.reap.lock");
  writeFileSync(lockFile, lockBytes("runtime-token", "replaced-builder-container"));
  writeFileSync(reapFile, lockBytes("reap-token", hostId));
  const before = hashStore(dir);

  const missingReapToken = await runOperator([
    "recover-lock",
    "--store",
    dir,
    "--token",
    "runtime-token",
    "--confirm-no-writers",
  ]);
  assert.notEqual(missingReapToken.code, 0);
  assert.equal(existsSync(lockFile), true);
  assert.equal(existsSync(reapFile), true);
  assert.equal(hashStore(dir), before);

  const recovered = await operatorJson([
    "recover-lock",
    "--store",
    dir,
    "--token",
    "runtime-token",
    "--reap-token",
    "reap-token",
    "--confirm-no-writers",
  ]);
  assert.deepEqual([...recovered.recovered].sort(), [
    "identity-store.lock",
    "identity-store.reap.lock",
  ]);
  assert.equal(recovered.storeUnchanged, true);
  assert.equal(recovered.storeHash, before);
  assert.equal(existsSync(lockFile), false);
  assert.equal(existsSync(reapFile), false);
  assert.equal(hashStore(dir), before);

  const quarantined = readdirSync(dir).filter((name) =>
    name.includes(".recovered."),
  );
  assert.equal(quarantined.length, 2);
  for (const name of quarantined) {
    assert.match(name, /^identity-store\.(?:reap\.)?lock\.recovered\./);
  }

  // The recovered store must still accept the supported operator commands.
  const issued = await operatorJson([
    "issue",
    "--store",
    dir,
    "--label",
    "After recovery",
    "--ttl-seconds",
    "600",
  ]);
  assert.match(issued.inviteId, /^inv_/);
});

test("recovery refuses a corrupt store before touching a lock", async () => {
  const dir = storeDir("corrupt");
  writeFileSync(path.join(dir, "identity-store.json"), "{corrupt\n");
  const lockFile = path.join(dir, "identity-store.lock");
  writeFileSync(lockFile, lockBytes("corrupt-token"));

  const result = await runOperator([
    "recover-lock",
    "--store",
    dir,
    "--token",
    "corrupt-token",
    "--confirm-no-writers",
  ]);
  assert.notEqual(result.code, 0);
  assert.equal(readFileSync(lockFile, "utf8"), lockBytes("corrupt-token"));
  assert.equal(
    readFileSync(path.join(dir, "identity-store.json"), "utf8"),
    "{corrupt\n",
  );
});

test.after(() => {
  rmSync(tempRoot, { recursive: true, force: true });
});
