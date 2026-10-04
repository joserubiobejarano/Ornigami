import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SpawnSyncOptionsWithStringEncoding, SpawnSyncReturns } from "node:child_process";
import { buildObservationSql, observeConfiguredDatabase, runReadOnlyQueryForTest } from "../scripts/a17-privacy-checkpoint-read.mjs";

test("checkpoint snapshot is explicitly read-only and never invokes a route or evaluator", () => {
  const sql = buildObservationSql();
  assert.match(sql, /^BEGIN READ ONLY;/);
  assert.match(sql, /SET LOCAL statement_timeout = '15s'/);
  assert.match(sql, /ROLLBACK;$/);
  assert.doesNotMatch(sql, /\b(?:INSERT|UPDATE|DELETE|CALL|DO)\b/i);
  assert.match(sql, /public\.cron_job_state/);
  assert.match(sql, /public\.cron_runs/);
  assert.match(sql, /public\.cron_alert_state/);
});

test("snapshot includes resolved and active privacy alerts with transport state", () => {
  const sql = buildObservationSql();
  assert.match(sql, /FROM public\.cron_alert_state WHERE job_name = 'privacy_retention'/);
  assert.match(sql, /'active', active/);
  assert.match(sql, /'resolvedAt', resolved_at/);
  assert.match(sql, /'transportFailures', transport_failures/);
  assert.match(sql, /'lastTransportError', last_transport_error/);
  assert.doesNotMatch(sql, /WHERE active IS TRUE/);
});

test("run output projects only fixed outcomes and omits identifiers and raw errors", () => {
  const sql = buildObservationSql();
  assert.match(sql, /'outcomeTables'/);
  assert.match(sql, /'completedOutcomeTables'/);
  assert.match(sql, /'failedOutcomeTables'/);
  assert.doesNotMatch(sql, /\brun_id\b|\bcursor\s*,|error_message|alert_key|customer_email/i);
});

test("mismatched database identity fails before invoking PostgreSQL", () => {
  const dir = mkdtempSync(join(tmpdir(), "a17-privacy-"));
  const source = join(dir, "production.env");
  writeFileSync(source, "DATABASE_URL=postgres://observer:private@wrong.invalid/wrong\n");
  let spawnCalls = 0;
  const shouldNotConnect = (_exe: string, _args: string[], _options: SpawnSyncOptionsWithStringEncoding): SpawnSyncReturns<string> => {
    spawnCalls += 1;
    void _exe;
    void _args;
    void _options;
    return { pid: 1, output: [null, "", ""], stdout: "", stderr: "", status: 0, signal: null };
  };
  try {
    assert.throws(() => observeConfiguredDatabase(source, { spawn: shouldNotConnect }), /production_database_identity_mismatch/);
    assert.equal(spawnCalls, 0);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("PostgreSQL invocation clears inherited PG target overrides and has bounded wait", () => {
  const observation = JSON.stringify({ transactionReadOnly: true, observedAt: "2026-10-04T03:01:00.000Z" });
  const database = { host: "db.invalid", port: "5432", database: "app", username: "observer", password: "credential" };
  const mockSpawn = (_exe: string, _args: string[], options: SpawnSyncOptionsWithStringEncoding): SpawnSyncReturns<string> => {
    assert.equal(options.timeout, 30_000);
    assert.ok(options.env);
    assert.equal(options.env.PGHOSTADDR, undefined);
    assert.equal(options.env.PGSERVICE, undefined);
    assert.equal(options.env.PGOPTIONS, undefined);
    assert.equal(options.env.PGHOST, "db.invalid");
    assert.equal(options.env.PATH, "safe-path");
    return { pid: 1, output: [null, observation, ""], stdout: observation, stderr: "", status: 0, signal: null };
  };
  runReadOnlyQueryForTest(database, {
    inheritedEnv: { NODE_ENV: "test", PATH: "safe-path", PGHOSTADDR: "attacker", PGSERVICE: "wrong-target", PGOPTIONS: "-c default_transaction_read_only=off" },
    spawn: mockSpawn,
  });
});

test("observer refuses unconfirmed read-only mode and hides CLI error detail", () => {
  const database = { host: "db.invalid", port: "5432", database: "app", username: "observer", password: "credential" };
  const makeResult = (status: number, stdout: string, stderr: string): SpawnSyncReturns<string> => ({
    pid: 1, output: [null, stdout, stderr], stdout, stderr, status, signal: null,
  });
  const invoke = (result: SpawnSyncReturns<string>) => runReadOnlyQueryForTest(database, { spawn: () => result });
  assert.throws(() => invoke(makeResult(0, JSON.stringify({ transactionReadOnly: false }), "")), /read_only_transaction_not_confirmed/);
  assert.throws(() => invoke(makeResult(1, "", "private password and SQL detail")), (error) => {
    assert.ok(error instanceof Error);
    assert.equal(error.message, "read_only_database_observation_failed");
    assert.doesNotMatch(error.message, /password|SQL detail/);
    return true;
  });
});
