import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import net from "node:net";
import { fileURLToPath } from "node:url";
import test from "node:test";

const proxy = fileURLToPath(new URL("../deploy/builder/qualify-proxy.mjs", import.meta.url));

async function freePort(): Promise<number> {
  const server = net.createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const port = address.port;
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  return port;
}

async function waitForProxy(port: number, child: ReturnType<typeof spawn>): Promise<void> {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`proxy exited ${child.exitCode}`);
    const connected = await new Promise<boolean>((resolve) => {
      const socket = net.connect({ host: "127.0.0.1", port });
      socket.once("connect", () => { socket.destroy(); resolve(true); });
      socket.once("error", () => resolve(false));
    });
    if (connected) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("proxy did not become ready");
}

test("loopback proxy forwards TCP to the private target", async () => {
  const echo = net.createServer((socket) => {
    socket.end("proxy-proof");
  });
  await new Promise<void>((resolve) => echo.listen(0, "127.0.0.1", resolve));
  const echoAddress = echo.address();
  assert.ok(echoAddress && typeof echoAddress === "object");
  const listenPort = await freePort();
  const child = spawn(
    process.execPath,
    [proxy, "--listen", `127.0.0.1:${listenPort}`, "--target", `127.0.0.1:${echoAddress.port}`],
    { windowsHide: true },
  );
  try {
    await waitForProxy(listenPort, child);
    const received = await new Promise<string>((resolve, reject) => {
      const socket = net.connect({ host: "127.0.0.1", port: listenPort });
      let data = "";
      socket.setEncoding("utf8");
      socket.on("data", (chunk) => (data += chunk));
      socket.on("end", () => resolve(data));
      socket.on("error", reject);
      socket.setTimeout(3000, () => reject(new Error("proxy read timed out")));
    });
    assert.equal(received, "proxy-proof");
  } finally {
    child.kill("SIGTERM");
    await new Promise<void>((resolve) => echo.close(() => resolve()));
  }
});

test("proxy refuses a non-loopback listener", async () => {
  const port = await freePort();
  const result = await new Promise<{ code: number | null; stderr: string }>((resolve) => {
    const child = spawn(
      process.execPath,
      [proxy, "--listen", `0.0.0.0:${port}`, "--target", "127.0.0.1:9"],
      { windowsHide: true },
    );
    let stderr = "";
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("close", (code) => resolve({ code, stderr }));
  });
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /proxy listener must be 127\.0\.0\.1/);
});
