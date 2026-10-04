import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import test from "node:test";
import { startA10LiveTunnel, waitForA10QuickTunnel } from "../scripts/a10-live-tunnel.mjs";

test("tunnel helper rejects non-loopback or malformed proxy URLs before any binary or process action", async () => {
  let processLaunches = 0;
  const spawnProcess = (_command: string, _args: readonly string[], _options: import("node:child_process").SpawnOptions) => {
    void _command;
    void _args;
    void _options;
    processLaunches += 1;
    throw new Error("must not launch");
  };
  for (const url of [
    "http://localhost:4000",
    "https://127.0.0.1:4000",
    "http://127.0.0.1:4000/path",
    "http://user:password@127.0.0.1:4000",
  ]) {
    await assert.rejects(startA10LiveTunnel({
      webhookProxy: { url, close: async () => {} },
      spawnProcess,
    }), /loopback webhook proxy/);
  }
  assert.equal(processLaunches, 0);
});

test("readiness requires a Quick Tunnel hostname and a registered connection; close terminates only its child", async () => {
  const child = spawn(process.execPath, [
    "-e",
    'process.stdout.write("Quick tunnel: https://sample-acceptance.trycloudflare.com\\n"); process.stderr.write("Registered tunnel connection connIndex=0\\n"); setInterval(() => {}, 1000);',
  ], { windowsHide: true, shell: false, stdio: ["ignore", "pipe", "pipe"] });
  const tunnel = await waitForA10QuickTunnel(child, { startupTimeoutMs: 2_000, shutdownTimeoutMs: 2_000 });
  assert.equal(tunnel.publicBaseUrl, "https://sample-acceptance.trycloudflare.com");
  assert.equal(child.stdout.listenerCount("data"), 1);
  assert.equal(child.stderr.listenerCount("data"), 1);
  await tunnel.close();
  await tunnel.close();
  assert.equal(child.stdout.listenerCount("data"), 0);
  assert.equal(child.stderr.listenerCount("data"), 0);
  assert.ok(child.exitCode !== null || child.signalCode !== null);
});

test("startup timeout cleans up the exact spawned child", async () => {
  const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
    windowsHide: true, shell: false, stdio: ["ignore", "pipe", "pipe"],
  });
  await assert.rejects(waitForA10QuickTunnel(child, { startupTimeoutMs: 50, shutdownTimeoutMs: 1_000 }), /readiness timed out/);
  assert.ok(child.exitCode !== null || child.signalCode !== null);
});
