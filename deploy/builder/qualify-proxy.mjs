#!/usr/bin/env node
/**
 * Loopback-only TCP ingress for the isolated builder runtime.
 *
 * Docker silently does not honor published ports on an --internal network. The
 * qualification therefore starts the runtime without a publication and runs
 * this host-side proxy on 127.0.0.1:<port>, forwarding to the runtime's private
 * container IP. The runtime keeps its default-deny egress network.
 */
import net from "node:net";

function option(name) {
  const index = process.argv.indexOf(name);
  return index < 0 ? null : process.argv[index + 1];
}

const listen = option("--listen");
const target = option("--target");
if (!listen || !target) {
  console.error("usage: qualify-proxy.mjs --listen 127.0.0.1:<port> --target <ip>:<port>");
  process.exit(2);
}

const listenUrl = new URL(`tcp://${listen}`);
const targetUrl = new URL(`tcp://${target}`);
if (listenUrl.hostname !== "127.0.0.1") {
  console.error("proxy listener must be 127.0.0.1");
  process.exit(2);
}
const listenPort = Number(listenUrl.port);
const targetPort = Number(targetUrl.port);
if (!Number.isInteger(listenPort) || listenPort < 1 || listenPort > 65535) {
  console.error("invalid listen port");
  process.exit(2);
}
if (!Number.isInteger(targetPort) || targetPort < 1 || targetPort > 65535) {
  console.error("invalid target port");
  process.exit(2);
}

const server = net.createServer((client) => {
  const upstream = net.connect({
    host: targetUrl.hostname,
    port: targetPort,
  });
  const close = () => {
    client.destroy();
    upstream.destroy();
  };
  client.on("error", close);
  upstream.on("error", close);
  client.pipe(upstream);
  upstream.pipe(client);
});

server.on("error", (error) => {
  console.error(JSON.stringify({ event: "proxy_error", code: error.code, message: error.message }));
  process.exit(1);
});
server.listen(listenPort, "127.0.0.1", () => {
  console.log(JSON.stringify({
    event: "proxy_ready",
    listen: `127.0.0.1:${listenPort}`,
    target: `${targetUrl.hostname}:${targetPort}`,
  }));
});

function shutdown() {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1000).unref();
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
