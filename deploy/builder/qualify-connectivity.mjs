#!/usr/bin/env node
/**
 * Diagnostic for the loopback host path into the isolated builder runtime.
 * Records host TCP, host HTTP, the in-container result and engine evidence
 * paths without capturing credentials or request bodies.
 */
import { existsSync, writeFileSync } from "node:fs";
import net from "node:net";

function option(name, fallback = null) {
  const index = process.argv.indexOf(name);
  return index < 0 ? fallback : process.argv[index + 1];
}

const label = option("--label", "unlabelled");
const origin = option("--origin");
const proxyTarget = option("--proxy-target", "");
const inContainerOk = option("--in-container-ok") === "0";
const engineEvidence = option("--engine-evidence", "");
const output = option("--output");
const waitMs = Number.parseInt(option("--wait-ms", "10000"), 10);
if (!origin || !output) {
  console.error("usage: qualify-connectivity.mjs --origin <url> --output <file>");
  process.exit(2);
}

const url = new URL(origin);
if (url.protocol !== "http:" || url.hostname !== "127.0.0.1" || !url.port) {
  console.error("origin must be http://127.0.0.1:<port>");
  process.exit(2);
}
const port = Number(url.port);

function probeTcp() {
  return new Promise((resolve) => {
    const socket = net.connect({ host: "127.0.0.1", port });
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };
    socket.once("connect", () =>
      finish({ ok: true, localAddress: socket.localAddress, remoteAddress: socket.remoteAddress }),
    );
    socket.once("error", (error) =>
      finish({ ok: false, code: error.code ?? null, message: error.message }),
    );
    socket.setTimeout(3000, () =>
      finish({ ok: false, code: "ETIMEDOUT", message: "host TCP connect timed out" }),
    );
  });
}

async function probeHttp() {
  const deadline = Date.now() + (Number.isFinite(waitMs) ? waitMs : 10000);
  let last = { ok: false, code: "NOT_ATTEMPTED", message: "no HTTP attempt" };
  while (Date.now() < deadline) {
    try {
      const response = await fetch(origin, {
        redirect: "manual",
        signal: AbortSignal.timeout(2000),
      });
      await response.body?.cancel();
      if (response.status === 200) {
        return { ok: true, status: response.status, origin };
      }
      last = { ok: false, status: response.status, origin, code: `HTTP_${response.status}` };
    } catch (error) {
      const cause = error.cause ?? {};
      last = {
        ok: false,
        origin,
        name: error.name ?? null,
        message: error.message ?? String(error),
        code: error.code ?? cause.code ?? null,
        causeCode: cause.code ?? null,
        causeMessage: cause.message ?? null,
        syscall: cause.syscall ?? null,
        address: cause.address ?? null,
        port: cause.port ?? null,
      };
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return last;
}

const hostTcp = await probeTcp();
const hostHttp = await probeHttp();
const result = {
  label,
  origin,
  proxyTarget,
  inContainer: { ok: inContainerOk },
  hostTcp,
  hostHttp,
  engineEvidence: engineEvidence && existsSync(engineEvidence) ? engineEvidence : null,
  ok: inContainerOk && hostTcp.ok && hostHttp.ok,
};
writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));
process.exit(result.ok ? 0 : 1);
