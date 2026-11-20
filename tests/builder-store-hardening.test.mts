import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { hostname } from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import test from "node:test";

import {
  BUILDER_IDENTITY_LOCK_FILE,
  BUILDER_STORE_PROCESS_SCOPE,
  BUILDER_STORE_SCOPE_TOKEN,
  BuilderStoreUnavailable,
  deriveBuilderStoreProcessScope,
  issueBuilderInvite,
  readBuilderIdentityStore,
  withBuilderIdentityStore,
} from "../builder-runtime/lib/identity-store.ts";
import { reserveBuilderUsage } from "../builder-runtime/lib/usage-ledger.ts";

const root = process.cwd();
const tempRoot = path.join(root, ".local", "test-store-hardening");
const operatorScript = path.join(root, "scripts", "builder-invite-operator.mjs");
rmSync(tempRoot, { recursive: true, force: true });
mkdirSync(tempRoot, { recursive: true });

function storeDir(name: string): string {
  return mkdtempSync(path.join(tempRoot, `${name}-`));
}

function lockPath(directory: string): string {
  return path.join(directory, BUILDER_IDENTITY_LOCK_FILE);
}

function lockMetadata(
  token: string,
  pid: number,
  overrides: Record<string, unknown> = {},
) {
  return {
    version: 1,
    token,
    pid,
    hostname: hostname(),
    scope: BUILDER_STORE_PROCESS_SCOPE,
    acquiredAt: new Date().toISOString(),
    ...overrides,
  };
}

function deadPid(): number {
  // Out of range for Windows allocation (odd) and Linux max_pid, so this is
  // deterministically absent without racing a freshly spawned child.
  return 2_147_483_647;
}

test("Linux missing PID namespace or boot identity is an unproven scope", () => {
  const missingPid = deriveBuilderStoreProcessScope({
    platform: "linux",
    hostId: "store-host",
    pidNamespace: null,
    bootId: "boot-1",
  });
  assert.equal(missingPid.proven, false);
  assert.equal(missingPid.scope, null);
  assert.equal(missingPid.token, null);
  assert.equal(missingPid.reason, "linux_missing_pid_namespace");

  const missingBoot = deriveBuilderStoreProcessScope({
    platform: "linux",
    hostId: "store-host",
    pidNamespace: "pid:[1]",
    bootId: null,
  });
  assert.equal(missingBoot.proven, false);
  assert.equal(missingBoot.scope, null);
  assert.equal(missingBoot.token, null);
  assert.equal(missingBoot.reason, "linux_missing_boot_id");

  const linux = deriveBuilderStoreProcessScope({
    platform: "linux",
    hostId: "store-host",
    pidNamespace: "pid:[1]",
    bootId: "boot-1",
  });
  assert.equal(linux.proven, true);
  assert.equal(linux.scope, "store-host|pid:[1]|boot-1");
  assert.match(linux.token ?? "", /^[a-f0-9]{16}$/);

  const windows = deriveBuilderStoreProcessScope({
    platform: "win32",
    hostId: "store-host",
    pidNamespace: null,
    bootId: null,
  });
  assert.equal(windows.proven, true);
  assert.equal(windows.scope, "store-host|host|unknown-boot");
  assert.match(windows.token ?? "", /^[a-f0-9]{16}$/);
});

test("an unproven Linux scope disables reaping and orphan-temp cleanup", () => {
  const childScript = path.join(tempRoot, "unproven-scope-child.mts");
  writeFileSync(
    childScript,
    `import assert from "node:assert/strict";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

Object.defineProperty(process, "platform", { value: "linux" });
process.env.BUILDER_RUNTIME_STORE_HOST_ID = "unproven-linux-host";
const modulePath = process.argv[2];
const workRoot = process.argv[3];
const store = await import(pathToFileURL(modulePath).href);
assert.equal(store.BUILDER_STORE_PROCESS_SCOPE_PROVEN, false);
assert.equal(store.BUILDER_STORE_PROCESS_SCOPE, null);
assert.equal(store.BUILDER_STORE_SCOPE_TOKEN, null);
const dead = 2147483647;
const dir = mkdtempSync(path.join(workRoot, "unproven-"));
const temp = path.join(dir, \`.identity-store.json.\${dead}.abcdef1234567890.abcdef123456.tmp\`);
writeFileSync(temp, "{partial");
const issued = await store.issueBuilderInvite({
  storeDir: dir,
  label: "Unproven",
  inviteTtlSeconds: 60,
});
assert.ok(issued.invite.id);
assert.equal(existsSync(temp), true, "orphan temp cleanup must be disabled");
writeFileSync(
  path.join(dir, "identity-store.lock"),
  \`\${JSON.stringify({
    version: 1,
    token: "unproven-stale",
    pid: dead,
    hostname: "unproven-linux-host",
    scope: "anything",
    acquiredAt: new Date().toISOString(),
  })}\\n\`,
);
const inspection = await store.inspectBuilderStore(dir);
assert.equal(inspection.lock.owner, "unproven_scope");
assert.equal(inspection.hostId, "unproven-linux-host");
let rejected = false;
try {
  await store.withBuilderIdentityStore(dir, () => "must-not-run", { lockWaitMs: 150 });
} catch (error) {
  rejected = error instanceof store.BuilderStoreUnavailable;
}
assert.equal(rejected, true, "automatic reaping must be disabled");
assert.equal(existsSync(path.join(dir, "identity-store.lock")), true);
console.log(JSON.stringify({ ok: true, reason: store.BUILDER_STORE_PROCESS_SCOPE_REASON }));
`,
  );
  const result = spawnSync(
    process.execPath,
    [
      "--experimental-strip-types",
      childScript,
      path.join(root, "builder-runtime", "lib", "identity-store.ts"),
      tempRoot,
    ],
    { cwd: root, encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const lastLine = result.stdout.trim().split(/\r?\n/).at(-1) ?? "";
  assert.equal(
    JSON.parse(lastLine).reason,
    "linux_missing_pid_namespace",
  );
});

function runOperator(args: string[]): Promise<{ code: number | null; output: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ["--experimental-strip-types", operatorScript, ...args],
      { cwd: root, stdio: ["ignore", "pipe", "pipe"] },
    );
    let output = "";
    child.stdout.on("data", (chunk) => {
      output += chunk;
    });
    child.stderr.on("data", (chunk) => {
      output += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, output }));
  });
}

test("an old lock owned by a live process is never displaced by age", async () => {
  const dir = storeDir("live-lock");
  const file = lockPath(dir);
  writeFileSync(file, `${JSON.stringify(lockMetadata("live-owner", process.pid))}\n`);
  const old = new Date("2020-01-01T00:00:00.000Z");
  utimesSync(file, old, old);

  await assert.rejects(
    withBuilderIdentityStore(dir, () => "must-not-run", { lockWaitMs: 150 }),
    (error) => error instanceof BuilderStoreUnavailable,
  );
  assert.equal(existsSync(file), true);
  assert.equal(JSON.parse(readFileSync(file, "utf8")).token, "live-owner");
  rmSync(file, { force: true });
});

test("a lock owned by a provably dead process is reclaimed", async () => {
  const dir = storeDir("dead-lock");
  const file = lockPath(dir);
  writeFileSync(file, `${JSON.stringify(lockMetadata("dead-owner", deadPid()))}\n`);

  const result = await withBuilderIdentityStore(
    dir,
    (store) => {
      store.subjects.push({
        id: "sub_reclaimed",
        label: "Reclaimed",
        createdAt: new Date().toISOString(),
      });
      return store.subjects.length;
    },
    { lockWaitMs: 2_000 },
  );
  assert.equal(result, 1);
  assert.equal(existsSync(file), false);
  const store = await readBuilderIdentityStore(dir);
  assert.equal(store.subjects[0]?.id, "sub_reclaimed");
});

test("a same-host lock from another PID namespace is not auto-reclaimed", async () => {
  const dir = storeDir("foreign-scope");
  const file = lockPath(dir);
  writeFileSync(
    file,
    `${JSON.stringify(
      lockMetadata("foreign-scope-owner", deadPid(), {
        scope: "another-container-pid-namespace",
      }),
    )}\n`,
  );

  await assert.rejects(
    withBuilderIdentityStore(dir, () => "must-not-run", { lockWaitMs: 150 }),
    (error) => error instanceof BuilderStoreUnavailable,
  );
  assert.equal(existsSync(file), true);
  rmSync(file, { force: true });
});

test("a same-host lock without a process scope is not auto-reclaimed", async () => {
  const dir = storeDir("missing-scope");
  const file = lockPath(dir);
  writeFileSync(
    file,
    `${JSON.stringify(lockMetadata("missing-scope-owner", deadPid(), { scope: undefined }))}\n`,
  );

  await assert.rejects(
    withBuilderIdentityStore(dir, () => "must-not-run", { lockWaitMs: 150 }),
    (error) => error instanceof BuilderStoreUnavailable,
  );
  assert.equal(existsSync(file), true);
  rmSync(file, { force: true });
});

test("a same-host lock acquired before this boot is not auto-reclaimed", async () => {
  const dir = storeDir("pre-boot");
  const file = lockPath(dir);
  writeFileSync(
    file,
    `${JSON.stringify(
      lockMetadata("pre-boot-owner", deadPid(), {
        acquiredAt: "2020-01-01T00:00:00.000Z",
      }),
    )}\n`,
  );

  await assert.rejects(
    withBuilderIdentityStore(dir, () => "must-not-run", { lockWaitMs: 150 }),
    (error) => error instanceof BuilderStoreUnavailable,
  );
  assert.equal(existsSync(file), true);
  rmSync(file, { force: true });
});

test("a resumed old owner cannot remove its successor's lock", async () => {
  const dir = storeDir("successor-lock");
  const file = lockPath(dir);
  const successor = lockMetadata("successor-owner", process.pid);

  await withBuilderIdentityStore(
    dir,
    () => {
      const held = `${file}.held`;
      renameSync(file, held);
      writeFileSync(file, `${JSON.stringify(successor)}\n`);
      rmSync(held, { force: true });
    },
    { lockWaitMs: 1_000 },
  );

  assert.equal(existsSync(file), true);
  assert.equal(JSON.parse(readFileSync(file, "utf8")).token, "successor-owner");
  rmSync(file, { force: true });
});

test("an interrupted write leaves the old store readable and dead-owner temp files are removed", async () => {
  const dir = storeDir("interrupted");
  await withBuilderIdentityStore(dir, (store) => {
    store.subjects.push({
      id: "sub_existing",
      label: "Existing",
      createdAt: "2026-11-20T09:00:00.000Z",
    });
    store.usage.push({
      id: "use_existing",
      subjectId: "sub_existing",
      sessionId: "ses_existing",
      generationId: "gen_existing",
      recordedAt: "2026-11-20T09:01:00.000Z",
      state: "succeeded",
      costMicros: 25_000,
      reservedCostMicros: 50_000,
      requestKey: "existing-request",
    });
  });
  const before = await readBuilderIdentityStore(dir);

  const dead = deadPid();
  const scope = BUILDER_STORE_SCOPE_TOKEN;
  const storeTemp = path.join(
    dir,
    `.identity-store.json.${dead}.${scope}.abcdef123456.tmp`,
  );
  const lockTemp = path.join(
    dir,
    `identity-store.lock.${dead}.${scope}.abcdef123456.tmp`,
  );
  const liveTemp = path.join(
    dir,
    `.identity-store.json.${process.pid}.${scope}.abcdef123456.tmp`,
  );
  const foreignTemp = path.join(
    dir,
    `.identity-store.json.${dead}.${"0".repeat(16)}.abcdef123456.tmp`,
  );
  const legacyTemp = path.join(
    dir,
    `.identity-store.json.${dead}.abcdef123456.tmp`,
  );
  for (const file of [storeTemp, lockTemp, liveTemp, foreignTemp, legacyTemp]) {
    writeFileSync(file, "{ partial");
  }

  const result = await issueBuilderInvite({
    storeDir: dir,
    label: "After interruption",
    inviteTtlSeconds: 60,
  });
  assert.ok(result.invite.id);
  assert.equal(existsSync(storeTemp), false);
  assert.equal(existsSync(lockTemp), false);
  assert.equal(existsSync(liveTemp), true, "a live owner's temp file is preserved");
  assert.equal(
    existsSync(foreignTemp),
    true,
    "a temp file from another PID namespace is preserved",
  );
  assert.equal(
    existsSync(legacyTemp),
    true,
    "a temp file without a proven scope is preserved",
  );

  const after = await readBuilderIdentityStore(dir);
  assert.deepEqual(after.subjects[0], before.subjects[0]);
  assert.deepEqual(after.usage[0], before.usage[0]);
  assert.equal(after.invites.length, 1);
  for (const file of [liveTemp, foreignTemp, legacyTemp]) {
    rmSync(file, { force: true });
  }
});

test("concurrent operator CLI and runtime writes preserve identity and usage records", async () => {
  const dir = storeDir("operator-concurrency");
  await withBuilderIdentityStore(dir, (store) => {
    store.subjects.push({
      id: "sub_existing",
      label: "Existing",
      createdAt: "2026-11-20T09:00:00.000Z",
    });
    store.sessions.push({
      id: "ses_existing",
      subjectId: "sub_existing",
      tokenHash: "synthetic-token-hash",
      createdAt: "2026-11-20T09:00:00.000Z",
      expiresAt: "2030-01-01T00:00:00.000Z",
    });
    store.usage.push({
      id: "use_existing",
      subjectId: "sub_existing",
      sessionId: "ses_existing",
      generationId: "gen_existing",
      recordedAt: "2026-11-20T09:01:00.000Z",
      state: "unknown",
      costMicros: 50_000,
      reservedCostMicros: 50_000,
    });
  });

  const limits = {
    windowSeconds: 3600,
    reservationLeaseSeconds: 60,
    requestReserveMicros: 50_000,
    subjectRequests: 100,
    globalRequests: 100,
    subjectConcurrency: 10,
    globalConcurrency: 10,
    subjectSpendMicros: 1_000_000,
    globalSpendMicros: 2_000_000,
  };

  const [results, reservations] = await Promise.all([
    Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        runOperator([
          "issue",
          "--store",
          dir,
          "--label",
          `Concurrent ${index}`,
          "--ttl-seconds",
          "60",
          "--json",
        ]),
      ),
    ),
    Promise.all(
      Array.from({ length: 4 }, (_, index) =>
        reserveBuilderUsage({
          storeDir: dir,
          subjectId: "sub_existing",
          sessionId: "ses_existing",
          requestKey: `runtime-concurrent-${index}`,
          limits,
        }),
      ),
    ),
  ]);
  for (const result of results) {
    assert.equal(result.code, 0, result.output);
  }
  for (const reservation of reservations) {
    assert.equal(reservation.ok, true);
  }

  const store = await readBuilderIdentityStore(dir);
  assert.equal(store.invites.length, 8);
  assert.equal(
    store.subjects.filter((subject) => subject.id.startsWith("sub_")).length,
    9,
  );
  assert.equal(store.usage.length, 5);
  assert.deepEqual(store.usage[0], {
    id: "use_existing",
    subjectId: "sub_existing",
    sessionId: "ses_existing",
    generationId: "gen_existing",
    recordedAt: "2026-11-20T09:01:00.000Z",
    state: "unknown",
    costMicros: 50_000,
    reservedCostMicros: 50_000,
  });
  assert.deepEqual(
    store.usage.slice(1).map((record) => record.requestKey).sort(),
    [
      "runtime-concurrent-0",
      "runtime-concurrent-1",
      "runtime-concurrent-2",
      "runtime-concurrent-3",
    ],
  );
});

test("a lock from a different store host is not auto-reclaimed", async () => {
  const dir = storeDir("foreign-host");
  const file = lockPath(dir);
  writeFileSync(
    file,
    `${JSON.stringify({
      ...lockMetadata("foreign-owner", deadPid()),
      hostname: "another-builder-host",
    })}\n`,
  );

  await assert.rejects(
    withBuilderIdentityStore(dir, () => "must-not-run", { lockWaitMs: 120 }),
    (error) => error instanceof BuilderStoreUnavailable,
  );
  assert.equal(existsSync(file), true);
  rmSync(file, { force: true });
});

test("a corrupt store fails closed without rewriting the original bytes", async () => {
  const dir = storeDir("corrupt-store");
  const file = path.join(dir, "identity-store.json");
  const bytes = "{not valid json\n";
  writeFileSync(file, bytes);

  await assert.rejects(
    issueBuilderInvite({
      storeDir: dir,
      label: "Must fail",
      inviteTtlSeconds: 60,
    }),
    (error) => error instanceof BuilderStoreUnavailable,
  );
  assert.equal(readFileSync(file, "utf8"), bytes);
});

test("a lock file with an unprovable owner is not auto-removed", async () => {
  const dir = storeDir("unknown-lock");
  const file = lockPath(dir);
  writeFileSync(file, "partial metadata");

  await assert.rejects(
    withBuilderIdentityStore(dir, () => "must-not-run", { lockWaitMs: 100 }),
    (error) => error instanceof BuilderStoreUnavailable,
  );
  assert.equal(readFileSync(file, "utf8"), "partial metadata");
  rmSync(file, { force: true });
});

test.after(() => {
  rmSync(tempRoot, { recursive: true, force: true });
});
