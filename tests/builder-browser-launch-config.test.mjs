import assert from "node:assert/strict";
import test from "node:test";
import {
  browserLaunchOptions,
  browserMode,
  browserSandboxEnabled,
  parseBrowserSandbox,
} from "../deploy/builder/browser-launch-config.mjs";
import { buildBrowserSmokeReport } from "../deploy/builder/browser-smoke-report.mjs";

test("browser sandbox is opt-in and the default is the synthetic CI exception", () => {
  assert.equal(parseBrowserSandbox(undefined), false);
  assert.equal(parseBrowserSandbox(""), false);
  assert.equal(parseBrowserSandbox("0"), false);
  assert.equal(parseBrowserSandbox("1"), true);
  assert.equal(browserSandboxEnabled({}), false);
  assert.equal(browserSandboxEnabled({ BROWSER_CHROMIUM_SANDBOX: "0" }), false);
  assert.equal(browserSandboxEnabled({ BROWSER_CHROMIUM_SANDBOX: "1" }), true);
  assert.equal(browserMode({}), "no-sandbox");
  assert.equal(browserMode({ BROWSER_CHROMIUM_SANDBOX: "1" }), "sandbox");
  assert.deepEqual(browserLaunchOptions({}), { headless: true, chromiumSandbox: false });
  assert.deepEqual(browserLaunchOptions({ BROWSER_CHROMIUM_SANDBOX: "1" }), {
    headless: true,
    chromiumSandbox: true,
  });
});

test("unsupported browser sandbox values are rejected instead of silently disabled", () => {
  for (const value of ["true", "false", "yes", "sandbox", "no-sandbox", " 1 ", "01"]) {
    assert.throws(
      () => browserSandboxEnabled({ BROWSER_CHROMIUM_SANDBOX: value }),
      /BROWSER_CHROMIUM_SANDBOX must be "0" or "1"/,
      value,
    );
    assert.throws(
      () => browserLaunchOptions({ BROWSER_CHROMIUM_SANDBOX: value }),
      /BROWSER_CHROMIUM_SANDBOX must be "0" or "1"/,
      value,
    );
  }
});

test("browser smoke report records identity, paths, mode and bounded failure text", () => {
  const report = buildBrowserSmokeReport({
    ok: false,
    error: new Error("launch failed"),
    stderr: "x".repeat(100_000),
    startedAt: "2026-01-01T00:00:00.000Z",
    finishedAt: "2026-01-01T00:00:01.000Z",
    env: {
      HOME: "/home/builder",
      XDG_CONFIG_HOME: "/home/builder/.config",
      XDG_CACHE_HOME: "/home/builder/.cache",
    },
    uid: 1000,
    gid: 1000,
    timezone: "UTC",
    tmpdir: "/tmp",
    writable: { home: true, tmpdir: true, evidence: true },
    launchOptions: { headless: true, chromiumSandbox: false },
  });
  assert.equal(report.status, "failed");
  assert.equal(report.ok, false);
  assert.equal(report.effectiveUid, 1000);
  assert.equal(report.effectiveGid, 1000);
  assert.equal(report.home, "/home/builder");
  assert.equal(report.xdgConfigHome, "/home/builder/.config");
  assert.equal(report.xdgCacheHome, "/home/builder/.cache");
  assert.equal(report.browserMode, "no-sandbox");
  assert.equal(report.sandbox, "no-sandbox");
  assert.equal(report.error.message, "launch failed");
  assert.equal(report.stderr.length, 64 * 1024);
  assert.deepEqual(report.writable, { home: true, tmpdir: true, evidence: true });
});
