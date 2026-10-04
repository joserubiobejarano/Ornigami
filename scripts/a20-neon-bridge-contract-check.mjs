import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, unlink } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { neon } from "@neondatabase/serverless";
import { A20_BRIDGE_INTERNALS } from "./a20-neon-bridge.mjs";
import { assertA20NoBlockedOutbound } from "./a20-preload.mjs";

const databaseUrl = process.env.DATABASE_URL;
const localUrl = process.env.A20_DATABASE_URL;
assert.ok(databaseUrl, "DATABASE_URL must be the marked A20 Neon-shaped endpoint");
assert.ok(localUrl, "A20_DATABASE_URL must point to the loopback disposable PostgreSQL database");
await A20_BRIDGE_INTERNALS.validateFixture();
assertA20NoBlockedOutbound();

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const probeLedgerPath = path.join(repoRoot, ".a20-fixture", `transport-probe-${process.pid}-${randomUUID()}.jsonl`);
const portServer = createServer();
await new Promise((resolve, reject) => { portServer.once("error", reject); portServer.listen(0, "127.0.0.1", resolve); });
const probePort = portServer.address().port;
await new Promise((resolve, reject) => portServer.close((error) => error ? reject(error) : resolve()));
const probe = spawnSync(process.execPath, ["--import", "./scripts/a20-preload.mjs", "./scripts/a20-preload-transport-probe.mjs"], {
  cwd: repoRoot,
  env: { ...process.env, A20_BLOCKED_NETWORK_LEDGER: probeLedgerPath, PORT: String(probePort) },
  encoding: "utf8",
  windowsHide: true,
  maxBuffer: 1024 * 1024,
});
assert.equal(probe.status, 0, "isolated outbound guard transport probes failed");
const probeEntries = (await readFile(probeLedgerPath, "utf8")).trim().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
assert.ok(probeEntries.length >= 7, "transport probes must record fetch, HTTP, HTTPS, TCP, TLS, and redirect attempts");
assert.ok(probeEntries.some((entry) => entry.kind === "fetch"));
assert.ok(probeEntries.some((entry) => entry.kind === "http"));
assert.ok(probeEntries.some((entry) => entry.kind === "https"));
assert.ok(probeEntries.some((entry) => entry.kind === "net.connect"));
assert.ok(probeEntries.some((entry) => entry.kind === "tls.connect"));
assert.ok(probeEntries.some((entry) => entry.host === "provider-redirect-probe.invalid"));
assert.ok(probeEntries.every((entry) => ["provider-guard-probe.invalid", "provider-redirect-probe.invalid"].includes(entry.host)));
assert.doesNotMatch(probeEntries.map(JSON.stringify).join("\n"), /private|receipt|send/);
await unlink(probeLedgerPath);

const sql = neon(databaseUrl);
const id = randomUUID().replaceAll("-", "");
const table = `a20_bridge_${id}`;
let safeToClean = false;

try {
  await assert.rejects(A20_BRIDGE_INTERNALS.handleNeonRequest("https://provider-guard-probe.invalid/sql", { method: "POST" }), /unexpected Neon endpoint/);
  await assert.rejects(A20_BRIDGE_INTERNALS.handleNeonRequest("https://api.neon.tech/sql", {
    method: "POST", headers: { "Neon-Connection-String": "postgresql://wrong@remote.invalid/a20_fixture" }, body: JSON.stringify({ query: "SELECT 1", params: [] }),
  }), /connection identity header does not match fixture/);

  const values = await sql.query(
    "SELECT $1::text AS quoted, $2::integer AS int_value, $3::boolean AS bool_value, $4::timestamptz AS time_value, $5::text AS null_value, $6::text AS empty_value, $7::jsonb AS json_value, $8::text[] AS array_value",
    ["quote ' slash \\ newline\nemoji 🐣", 47, false, new Date("2026-10-04T09:23:45.678Z"), null, "", { ok: true, count: 3 }, ["x", "a,b"]],
  );
  assert.equal(values[0].quoted, "quote ' slash \\ newline\nemoji 🐣");
  assert.equal(values[0].int_value, 47);
  assert.equal(values[0].bool_value, false);
  assert.ok(values[0].time_value instanceof Date);
  assert.equal(values[0].time_value.toISOString(), "2026-10-04T09:23:45.678Z");
  assert.equal(values[0].null_value, null);
  assert.equal(values[0].empty_value, "");
  assert.deepEqual(values[0].json_value, { ok: true, count: 3 });
  assert.deepEqual(values[0].array_value, ["x", "a,b"]);
  safeToClean = true;

  const full = await sql.query("SELECT 1::integer AS n WHERE false", [], { fullResults: true });
  assert.equal(full.command, "SELECT");
  assert.equal(full.rowCount, 0);
  assert.equal(full.fields[0].dataTypeID, 23);
  assert.equal(full.fields[0].format, 0);
  assert.deepEqual(full.rows, []);

  await assert.rejects(sql.transaction([
    sql`CREATE TABLE ${sql.unsafe(table)} (value text NOT NULL)`,
    sql`INSERT INTO ${sql.unsafe(table)} (value) VALUES (${"must roll back"})`,
    sql`SELECT 1 / 0`,
  ]));
  const rolledBack = await sql.query("SELECT to_regclass($1) AS table_name", [table]);
  assert.equal(rolledBack[0].table_name, null, "failed Neon batch must roll back all earlier statements");

  await sql.query(`CREATE TABLE ${table} (value text NOT NULL)`);
  const dml = await sql.query(`INSERT INTO ${table} (value) VALUES ($1), ($2)`, ["one", "two"], { fullResults: true });
  assert.equal(dml.command, "INSERT");
  assert.equal(dml.rowCount, 2, "CommandComplete row count must be preserved for DML without RETURNING");
  const rows = await sql.query(`SELECT value FROM ${table} ORDER BY value`);
  assert.deepEqual(rows, [{ value: "one" }, { value: "two" }]);

  await sql.query(`TRUNCATE TABLE ${table}`);
  await assert.rejects(sql.transaction([
    sql`INSERT INTO ${sql.unsafe(table)} (value) VALUES (${"must abort"})`,
    sql`SELECT set_config('statement_timeout', '30ms', true)`,
    sql`SELECT pg_sleep(0.25)`,
  ]), (error) => error.code === "57014");
  assert.equal((await sql.query(`SELECT count(*)::integer AS count FROM ${table}`))[0].count, 0, "statement-timeout batch must not commit an earlier write");
  const afterStatementTimeout = await sql`SELECT 8::integer AS alive`;
  assert.equal(afterStatementTimeout[0].alive, 8, "timed-out statement must not poison a later request");

  const controller = new AbortController();
  const abortedRequest = sql.transaction([
    sql`INSERT INTO ${sql.unsafe(table)} (value) VALUES (${"must abort"})`,
    sql`SELECT pg_sleep(1)`,
  ], { fetchOptions: { signal: controller.signal } });
  setTimeout(() => controller.abort(), 30).unref();
  await assert.rejects(abortedRequest);
  assert.equal((await sql.query(`SELECT count(*)::integer AS count FROM ${table}`))[0].count, 0, "aborted request must not commit an earlier write");
  assert.equal((await sql`SELECT 9::integer AS alive`)[0].alive, 9, "aborted request must close/roll back its server transaction");

  console.log("A20 Neon bridge contract passed: installed driver batch/results, real PostgreSQL binding/OIDs, rollback, DML counts, statement timeout, request abort.");
} finally {
  if (safeToClean) await sql.query(`DROP TABLE IF EXISTS ${table}`);
}

assertA20NoBlockedOutbound();
