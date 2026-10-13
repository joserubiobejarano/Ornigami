#!/usr/bin/env node

import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const JOB_PATHS = Object.freeze({
  "review-booster": "/api/cron/review-booster",
  "review-replies": "/api/cron/review-replies",
  privacy: "/api/cron/privacy",
});

const DEFAULT_ORIGIN = "http://127.0.0.1:3000";
const REQUEST_TIMEOUT_MS = 55_000;

function loopbackOrigin(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("Cron origin must be a valid loopback HTTP URL");
  }
  if (parsed.protocol !== "http:" || !["127.0.0.1", "[::1]"].includes(parsed.hostname)
    || parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== "/") {
    throw new Error("Cron origin must be a loopback HTTP URL");
  }
  return parsed.origin;
}

export async function dispatchCron(job, {
  secret = process.env.CRON_SECRET,
  origin = process.env.ORNIGAMI_CRON_ORIGIN ?? DEFAULT_ORIGIN,
  fetchImpl = globalThis.fetch,
} = {}) {
  if (typeof job !== "string" || !Object.hasOwn(JOB_PATHS, job)) throw new Error("Unknown cron job");
  const path = JOB_PATHS[job];
  if (typeof secret !== "string" || secret.length === 0 || /[\r\n]/.test(secret)) {
    throw new Error("CRON_SECRET is missing or invalid");
  }
  if (typeof fetchImpl !== "function") throw new Error("Fetch is unavailable");

  const url = `${loopbackOrigin(origin)}${path}`;
  let response;
  try {
    response = await fetchImpl(url, {
      method: "GET",
      headers: { authorization: `Bearer ${secret}`, accept: "application/json" },
      redirect: "error",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    if (error?.name === "TimeoutError" || error?.name === "AbortError") {
      throw new Error(`Cron ${job} request timed out`);
    }
    throw new Error(`Cron ${job} request failed`);
  }

  try {
    await response.body?.cancel();
  } catch {
    // The status determines success; response details are intentionally never logged.
  }
  if (response.status !== 200 && response.status !== 202) {
    throw new Error(`Cron ${job} returned HTTP ${response.status}`);
  }
  return response.status;
}

async function main() {
  const job = process.argv[2];
  try {
    const status = await dispatchCron(job);
    process.stdout.write(`Cron ${job} completed with HTTP ${status}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : "Cron dispatch failed"}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main();
}
