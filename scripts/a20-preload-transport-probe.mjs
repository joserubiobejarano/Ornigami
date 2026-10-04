import assert from "node:assert/strict";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import tls from "node:tls";

const host = "provider-guard-probe.invalid";
const blocked = (error) => error?.code === "A20_OUTBOUND_BLOCKED" || Boolean(error?.cause && blocked(error.cause));

const localDataResponse = await fetch("data:text/plain,a20-local-data-probe");
assert.equal(await localDataResponse.text(), "a20-local-data-probe", "data: fetches are local payloads and must not be logged as outbound");
await assert.rejects(Promise.resolve().then(() => fetch(`https://${host}/send?private=receipt`)), blocked);
assert.throws(() => http.request(`http://${host}/send`), blocked);
assert.throws(() => https.get(`https://${host}/send`), blocked);
assert.throws(() => net.connect(443, host), blocked);
assert.throws(() => new net.Socket().connect(443, host), blocked);
assert.throws(() => tls.connect({ host, port: 443 }), blocked);

const port = Number(process.env.PORT);
assert.ok(Number.isInteger(port) && port > 0, "PORT must be assigned for redirect guard probe");
const server = http.createServer((request, response) => {
  response.writeHead(302, { Location: "https://provider-redirect-probe.invalid/private" });
  response.end();
});
await new Promise((resolve, reject) => { server.once("error", reject); server.listen(port, "127.0.0.1", resolve); });
try {
  await assert.rejects(fetch(`http://127.0.0.1:${port}/redirect`), blocked);
} finally {
  await new Promise((resolve) => server.close(resolve));
}

console.log("A20 outbound transport guard probes passed.");
