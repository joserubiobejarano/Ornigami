#!/usr/bin/env node

import { mkdir, rmdir } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { dispatchCron } from "./vps-cron-dispatch.mjs";

const JOBS = Object.freeze({
  "review-booster": "ORNIGAMI_COOLIFY_CRON_REVIEW_BOOSTER_ENABLED",
  "review-replies": "ORNIGAMI_COOLIFY_CRON_REVIEW_REPLIES_ENABLED",
  privacy: "ORNIGAMI_COOLIFY_CRON_PRIVACY_ENABLED",
});

const LOCK_PATH = "/tmp/ornigami-cron-dispatch.lock";

function enabled(value) {
  return value === "true";
}

export async function dispatchCoolifyCron(job, {
  env = process.env,
  lockPath = LOCK_PATH,
  mkdirImpl = mkdir,
  rmdirImpl = rmdir,
  dispatchImpl = dispatchCron,
} = {}) {
  if (typeof job !== "string" || !Object.hasOwn(JOBS, job)) throw new Error("Unknown cron job");
  if (!enabled(env.ORNIGAMI_COOLIFY_CRON_ENABLED) || !enabled(env[JOBS[job]])) {
    return { status: "disabled" };
  }
  if (job === "review-replies" && !enabled(env.ORNIGAMI_COOLIFY_REPLIES_ACCEPTED)) {
    return { status: "disabled" };
  }

  try {
    // mkdir is an atomic, nonblocking lock shared by task processes in the web container.
    // A killed process leaves a fail-closed lock until operator cleanup or container restart.
    await mkdirImpl(lockPath, { mode: 0o700 });
  } catch (error) {
    if (error?.code === "EEXIST") throw new Error("Cron dispatch already running");
    throw new Error("Cron dispatch lock unavailable");
  }

  try {
    const status = await dispatchImpl(job, {
      secret: env.CRON_SECRET,
      origin: env.ORNIGAMI_CRON_ORIGIN,
    });
    return { status: "dispatched", httpStatus: status };
  } finally {
    try {
      await rmdirImpl(lockPath);
    } catch {
      // Fail-closed lock cleanup is handled by container restart or operator action.
      // Do not replace a useful dispatch result/error with filesystem details.
    }
  }
}

async function main() {
  const job = process.argv[2];
  try {
    const result = await dispatchCoolifyCron(job);
    if (result.status === "disabled") {
      process.stdout.write(`Cron ${job} is disabled\n`);
      return;
    }
    process.stdout.write(`Cron ${job} completed with HTTP ${result.httpStatus}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : "Cron dispatch failed"}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main();
}
