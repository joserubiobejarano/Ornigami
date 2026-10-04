import assert from "node:assert/strict";
import test from "node:test";
import { A20_BRIDGE_INTERNALS } from "../scripts/a20-neon-bridge.mjs";

test("A20 bridge accepts only loopback PostgreSQL targets with a20_ database names", () => {
  const target = A20_BRIDGE_INTERNALS.safePgUrl("postgresql://postgres@127.0.0.1:55432/a20_browser_fixture");
  assert.equal(target.host, "127.0.0.1");
  assert.equal(target.port, 55432);
  assert.equal(target.database, "a20_browser_fixture");
  assert.throws(() => A20_BRIDGE_INTERNALS.safePgUrl("postgresql://u:p@db.example.com/a20_fixture"), /loopback a20_/);
  assert.throws(() => A20_BRIDGE_INTERNALS.safePgUrl("postgresql://u:p@127.0.0.1/app"), /loopback a20_/);
  assert.throws(() => A20_BRIDGE_INTERNALS.safePgUrl("postgresql://u:p@127.0.0.1/a20_fixture?host=db.example.com"), /loopback a20_/);
});

test("A20 bridge rejects remote Neon fallback and endpoint substitutions", () => {
  const endpoint = A20_BRIDGE_INTERNALS.validateVirtualUrl("https://api.neon.tech/sql");
  assert.ok(endpoint);
  assert.equal(endpoint.hostname, "api.neon.tech");
  for (const endpoint of [
    "http://api.neon.tech/sql",
    "https://ep-real.neon.tech/sql",
    "https://api.neon.tech/other",
    "https://api.neon.tech:444/sql",
    "https://api.neon.tech/sql?fallback=remote",
  ]) assert.throws(() => A20_BRIDGE_INTERNALS.validateVirtualUrl(endpoint), /remote fallback is disabled/);
});

test("A20 bridge error responses never expose PostgreSQL detail text", () => {
  const result = A20_BRIDGE_INTERNALS.safeError(Object.assign(new Error("duplicate key: customer@example.com secret=hash"), { code: "23505" }));
  assert.deepEqual(result, { message: "A database constraint was violated.", code: "23505" });
  assert.doesNotMatch(JSON.stringify(result), /customer|hash|secret/);
});
