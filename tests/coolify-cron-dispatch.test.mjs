import assert from "node:assert/strict";
import { mkdtemp, mkdir, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { dispatchCoolifyCron } from "../scripts/coolify-cron-dispatch.mjs";

const enabledEnv = {
  ORNIGAMI_COOLIFY_CRON_ENABLED: "true",
  ORNIGAMI_COOLIFY_CRON_REVIEW_BOOSTER_ENABLED: "true",
  ORNIGAMI_COOLIFY_CRON_REVIEW_REPLIES_ENABLED: "true",
  ORNIGAMI_COOLIFY_CRON_PRIVACY_ENABLED: "true",
};

async function withLockPath(callback) {
  const root = await mkdtemp(join(tmpdir(), "ornigami-coolify-cron-"));
  try {
    await callback(join(root, "dispatch.lock"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("Coolify task gates remain disabled unless global, per-job, and Replies acceptance gates are true", async () => {
  let dispatched = 0;
  const options = { dispatchImpl: async () => { dispatched += 1; return 200; } };

  assert.deepEqual(await dispatchCoolifyCron("review-booster", { ...options, env: {} }), { status: "disabled" });
  assert.deepEqual(await dispatchCoolifyCron("privacy", {
    ...options,
    env: { ...enabledEnv, ORNIGAMI_COOLIFY_CRON_PRIVACY_ENABLED: "1" },
  }), { status: "disabled" });
  assert.deepEqual(await dispatchCoolifyCron("review-replies", { ...options, env: enabledEnv }), { status: "disabled" });
  assert.equal(dispatched, 0);
});

test("a secret alone does not enable a task or touch its lock", async () => {
  let dispatched = 0;
  let lockTouched = false;
  const result = await dispatchCoolifyCron("privacy", {
    env: { CRON_SECRET: "a-valid-looking-secret" },
    lockPath: "unused-test-lock",
    mkdirImpl: async () => { lockTouched = true; },
    dispatchImpl: async () => { dispatched += 1; return 200; },
  });
  assert.deepEqual(result, { status: "disabled" });
  assert.equal(lockTouched, false);
  assert.equal(dispatched, 0);
});

test("concurrent jobs contend on the same real lock and stale locks fail closed", async () => {
  await withLockPath(async (lockPath) => {
    let dispatchStarted;
    const started = new Promise((resolve) => { dispatchStarted = resolve; });
    let finishDispatch;
    const pendingDispatch = new Promise((resolve) => { finishDispatch = resolve; });
    let dispatched = 0;
    const first = dispatchCoolifyCron("review-booster", {
      env: enabledEnv,
      lockPath,
      dispatchImpl: async () => { dispatched += 1; dispatchStarted(); await pendingDispatch; return 202; },
    });
    await started;
    await assert.rejects(dispatchCoolifyCron("privacy", {
      env: enabledEnv,
      lockPath,
      dispatchImpl: async () => { dispatched += 1; return 200; },
    }), /Cron dispatch already running/);
    assert.equal(dispatched, 1);
    finishDispatch();
    assert.deepEqual(await first, { status: "dispatched", httpStatus: 202 });
    assert.deepEqual(await readdir(join(lockPath, "..")), []);

    await mkdir(lockPath);
    await assert.rejects(dispatchCoolifyCron("privacy", {
      env: enabledEnv,
      lockPath,
      dispatchImpl: async () => { dispatched += 1; return 200; },
    }), /Cron dispatch already running/);
    assert.equal(dispatched, 1);
    assert.deepEqual(await readdir(join(lockPath, "..")), ["dispatch.lock"]);
  });
});

test("dispatcher timeout and HTTP failures stay bounded, redacted, and unretried", async () => {
  await withLockPath(async (lockPath) => {
    const secret = "coolify-private-cron-secret";
    let requests = 0;
    const fetchImpl = async () => {
      requests += 1;
      throw Object.assign(new Error(`network failure ${secret}`), { name: "TimeoutError" });
    };
    await assert.rejects(dispatchCoolifyCron("privacy", {
      env: { ...enabledEnv, CRON_SECRET: secret },
      lockPath,
      dispatchImpl: (job, options) => import("../scripts/vps-cron-dispatch.mjs").then(({ dispatchCron }) => dispatchCron(job, { ...options, fetchImpl })),
    }), (error) => {
      assert.equal(error.message, "Cron privacy request timed out");
      assert.equal(error.message.includes(secret), false);
      return true;
    });
    assert.equal(requests, 1);
    assert.deepEqual(await readdir(join(lockPath, "..")), []);

    await assert.rejects(dispatchCoolifyCron("review-booster", {
      env: enabledEnv,
      lockPath,
      dispatchImpl: async () => { throw new Error("Cron review-booster returned HTTP 409"); },
    }), /Cron review-booster returned HTTP 409/);
    assert.deepEqual(await readdir(join(lockPath, "..")), []);
  });
});

test("task inventory keeps all UTC jobs disabled with the reviewed cadences", async () => {
  const { readFile } = await import("node:fs/promises");
  const inventory = JSON.parse(await readFile(new URL("../deploy/coolify/scheduled-tasks.json", import.meta.url), "utf8"));
  assert.equal(inventory.timezone, "UTC");
  assert.deepEqual(inventory.tasks.map(({ schedule, enabled }) => [schedule, enabled]), [
    ["7 * * * *", false],
    ["11 */4 * * *", false],
    ["0 3 * * *", false],
  ]);
  assert.deepEqual(inventory.tasks.map(({ timeoutSeconds }) => timeoutSeconds), [70, 70, 70]);
  assert.equal(inventory.tasks[1].requiresExplicitAcceptance, "ORNIGAMI_COOLIFY_REPLIES_ACCEPTED=true");
});
