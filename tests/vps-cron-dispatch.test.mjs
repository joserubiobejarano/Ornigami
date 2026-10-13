import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { dispatchCron } from "../scripts/vps-cron-dispatch.mjs";

const secret = "private-cron-test-secret-with-at-least-32-chars";

test("cron dispatcher sends an authenticated loopback GET and accepts continuation", async () => {
  let request;
  const status = await dispatchCron("review-booster", {
    secret,
    fetchImpl: async (...args) => {
      request = args;
      return new Response("{\"ok\":true,\"continuation\":true}", { status: 202 });
    },
  });

  assert.equal(status, 202);
  assert.equal(request[0], "http://127.0.0.1:3000/api/cron/review-booster");
  assert.equal(request[1].method, "GET");
  assert.equal(request[1].headers.authorization, `Bearer ${secret}`);
  assert.equal(request[1].redirect, "error");
  assert.ok(request[1].signal instanceof AbortSignal);
});

test("cron dispatcher maps jobs and fails for HTTP 302, 409, 500, and 503 without exposing response bodies", async () => {
  for (const [job, path] of [
    ["review-replies", "/api/cron/review-replies"],
    ["privacy", "/api/cron/privacy"],
  ]) {
    let url;
    for (const status of [302, 409, 500, 503]) {
      await assert.rejects(dispatchCron(job, {
        secret,
        fetchImpl: async (target) => { url = target; return new Response(`private body ${secret} ${url}`, { status }); },
      }), (error) => {
        assert.equal(error.message, `Cron ${job} returned HTTP ${status}`);
        assert.equal(error.message.includes(secret), false);
        assert.equal(error.message.includes("private body"), false);
        return true;
      });
    }
    assert.equal(new URL(url).pathname, path);
  }
});

test("cron dispatcher validates job, secret, and loopback destination before sending", async () => {
  let requests = 0;
  const fetchImpl = async () => { requests += 1; return new Response(null, { status: 200 }); };
  await assert.rejects(dispatchCron("unknown", { secret, fetchImpl }), /Unknown cron job/);
  for (const prototypeName of ["toString", "constructor", "__proto__"]) {
    await assert.rejects(dispatchCron(prototypeName, { secret, fetchImpl }), /Unknown cron job/);
  }
  await assert.rejects(dispatchCron("privacy", { secret: "", fetchImpl }), /CRON_SECRET is missing or invalid/);
  await assert.rejects(dispatchCron("privacy", { secret: `${secret}\r\nX-Evil: true`, fetchImpl }), /CRON_SECRET is missing or invalid/);
  for (const origin of [
    "https://example.com",
    "http://user:password@127.0.0.1:3000",
    "http://127.0.0.1:3000/private",
    "http://127.0.0.1:3000/?token=secret",
    "http://localhost:3000",
  ]) {
    await assert.rejects(dispatchCron("privacy", { secret, origin, fetchImpl }), /loopback HTTP URL/);
  }
  assert.equal(requests, 0);
});

test("cron dispatcher accepts IPv6 loopback and hides network and timeout details", async () => {
  let url;
  const success = await dispatchCron("privacy", {
    secret,
    origin: "http://[::1]:3012",
    fetchImpl: async (target) => { url = target; return new Response(null, { status: 200 }); },
  });
  assert.equal(success, 200);
  assert.equal(url, "http://[::1]:3012/api/cron/privacy");

  const sensitiveDetail = `Bearer ${secret} http://127.0.0.1:3000 private response body`;
  for (const [error, expected] of [
    [new Error(sensitiveDetail), "Cron privacy request failed"],
    [Object.assign(new Error(sensitiveDetail), { name: "TimeoutError" }), "Cron privacy request timed out"],
  ]) {
    await assert.rejects(dispatchCron("privacy", {
      secret,
      fetchImpl: async () => { throw error; },
    }), (caught) => {
      assert.equal(caught.message, expected);
      assert.equal(caught.message.includes(secret), false);
      assert.equal(caught.message.includes("127.0.0.1"), false);
      assert.equal(caught.message.includes("private response body"), false);
      return true;
    });
  }
});

test("dispatcher CLI runs on Windows paths and reports invalid jobs as failures", () => {
  const script = new URL("../scripts/vps-cron-dispatch.mjs", import.meta.url);
  const result = spawnSync(process.execPath, [fileURLToPath(script), "unknown"], { encoding: "utf8" });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Unknown cron job/);
});

test("systemd cron units preserve UTC schedules and share a nonblocking singleton lock", async () => {
  const [service, booster, replies, privacy] = await Promise.all([
    readFile(new URL("../deploy/vps/ornigami-cron@.service", import.meta.url), "utf8"),
    readFile(new URL("../deploy/vps/ornigami-cron-review-booster.timer", import.meta.url), "utf8"),
    readFile(new URL("../deploy/vps/ornigami-cron-review-replies.timer", import.meta.url), "utf8"),
    readFile(new URL("../deploy/vps/ornigami-cron-privacy.timer", import.meta.url), "utf8"),
  ]);
  assert.match(service, /EnvironmentFile=\/etc\/ornigami\/runtime\.env/);
  assert.match(service, /flock --nonblock \/var\/lib\/ornigami-cron\/dispatch\.lock/);
  assert.match(service, /TimeoutStartSec=60s/);
  for (const timer of [booster, replies, privacy]) assert.match(timer, /Persistent=false/);
  assert.match(booster, /OnCalendar=\*-\*-\* \*:07:00 UTC/);
  assert.match(replies, /OnCalendar=\*-\*-\* 0\/4:11:00 UTC/);
  assert.match(privacy, /OnCalendar=\*-\*-\* 03:00:00 UTC/);
});
