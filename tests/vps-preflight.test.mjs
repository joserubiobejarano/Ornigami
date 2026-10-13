import assert from "node:assert/strict";
import test from "node:test";
import { collectVpsPreflight } from "../scripts/vps-preflight-checks.mjs";

function fixture({ envMode = 0o100600, nodeVersion = "v22.14.0", cacheExists = true, cacheWritable = true, cronTemplateExists = true } = {}) {
  const paths = {
    appRoot: "/app/current",
    envFile: "/etc/ornigami/runtime.env",
    envDirectory: "/etc/ornigami",
    serviceFile: "/etc/systemd/system/ornigami.service",
    cronServiceFile: "/etc/systemd/system/ornigami-cron@.service",
    cronTimerFiles: [
      "/etc/systemd/system/ornigami-cron-review-booster.timer",
      "/etc/systemd/system/ornigami-cron-review-replies.timer",
      "/etc/systemd/system/ornigami-cron-privacy.timer",
    ],
    caddyFile: "/etc/caddy/Caddyfile",
    cacheDirectory: "/app/current/.next/cache",
    flockBinary: "/usr/bin/flock",
  };
  const existing = new Set([
    "/app/current/.next/BUILD_ID",
    "/app/current/node_modules/next/dist/bin/next",
    paths.serviceFile,
    paths.cronServiceFile,
    ...paths.cronTimerFiles,
    paths.caddyFile,
    paths.flockBinary,
  ]);
  if (cacheExists) existing.add(paths.cacheDirectory);
  if (!cronTemplateExists) existing.delete(paths.cronServiceFile);
  const calls = [];
  const result = collectVpsPreflight({
    platform: "linux",
    paths,
    existsSync: (file) => existing.has(file),
    statSync: (file) => {
      if (file === paths.envFile) return { isFile: () => true, uid: 0, mode: envMode };
      if (file === paths.envDirectory) return { isDirectory: () => true, uid: 0, mode: 0o40750 };
      throw new Error("unexpected stat path");
    },
    spawnSync: (command, args) => {
      calls.push([command, args]);
      if (command === "/usr/bin/node") return { status: 0, stdout: nodeVersion };
      if (command === "runuser") return { status: cacheWritable ? 0 : 1 };
      if (command === "systemd-analyze" && args[0] === "verify") return { status: 0 };
      if (command === "caddy" && args[0] === "validate") return { status: 0 };
      return { status: 0 };
    },
  });
  return { result, calls, paths };
}

test("VPS preflight passes with injected host metadata and never requests env file contents", () => {
  const { result, calls, paths } = fixture();
  assert.deepEqual(result.problems, []);
  assert.ok(calls.some(([command, args]) => command === "runuser" && args.includes("/app/current/.next/cache")));
  const systemdVerify = calls.find(([command, args]) => command === "systemd-analyze" && args[0] === "verify");
  assert.ok(systemdVerify);
  assert.ok(systemdVerify[1].includes(paths.cronServiceFile));
  assert.ok(paths.cronTimerFiles.every((timer) => systemdVerify[1].includes(timer)));
  assert.ok(calls.some(([command, args]) => command === "caddy" && args[0] === "validate"));
});

test("VPS preflight rejects loose runtime env permissions and wrong Node major", () => {
  const { result } = fixture({ envMode: 0o100644, nodeVersion: "v23.0.1" });
  assert.ok(result.problems.some((problem) => problem.includes("mode 0600")));
  assert.ok(result.problems.some((problem) => problem.includes("Node.js 22.x")));
});

test("VPS preflight rejects missing or unwritable cache and missing cron templates", () => {
  const { result } = fixture({ cacheExists: false, cacheWritable: false, cronTemplateExists: false });
  assert.ok(result.problems.some((problem) => problem.includes("cache directory missing")));
  assert.ok(result.problems.some((problem) => problem.includes("cannot write")));
  assert.ok(result.problems.some((problem) => problem.includes("install the cron service")));
});
