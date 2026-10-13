import assert from "node:assert/strict";
import { appendFileSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { availablePostgresTestPort } from "./postgres-test-port.mts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pgBin = process.env.VPS_SCHEMA_PG_BIN ?? process.env.A04_PG_BIN ?? process.env.PG_BIN;
const pgExe = (name) => process.platform === "win32"
  ? path.join(pgBin ?? "C:/Program Files/PostgreSQL/17/bin", `${name}.exe`)
  : pgBin ? path.join(pgBin, name) : name;

test("read-only catalog readiness query passes on schema after migrations 039–042", { timeout: 180_000 }, async (t) => {
  const tempRoot = tmpdir();
  const dir = mkdtempSync(path.join(tempRoot, "vps-schema-catalog-"));
  assert.ok(path.resolve(dir).startsWith(`${path.resolve(tempRoot)}${path.sep}`), "temporary cluster path must stay inside the OS temp directory");
  t.after(() => {
    const resolved = path.resolve(dir);
    if (!resolved.startsWith(`${path.resolve(tempRoot)}${path.sep}`)) throw new Error("refusing to remove temp path outside OS temp directory");
    rmSync(resolved, { recursive: true, force: true });
  });
  const dataDir = path.join(dir, "data");
  const port = await availablePostgresTestPort();
  let started = false;
  const psql = (sql) => execFileSync(pgExe("psql"), ["-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-h", "127.0.0.1", "-p", String(port), "-U", "postgres", "-d", "postgres", "-f", "-"], { encoding: "utf8", input: sql }).trim();
  try {
    execFileSync(pgExe("initdb"), ["-D", dataDir, "-U", "postgres", "-A", "trust", "--no-locale", "--encoding=UTF8"], { stdio: "ignore" });
    appendFileSync(path.join(dataDir, "postgresql.conf"), "\nunix_socket_directories = ''\n");
    execFileSync(pgExe("pg_ctl"), ["-D", dataDir, "-l", path.join(dir, "postgres.log"), "-o", `-h 127.0.0.1 -p ${port} -F`, "-w", "start"], { stdio: "ignore" });
    started = true;
    const migrationDir = path.join(root, "neon/migrations");
    const migrations = readdirSync(migrationDir)
      .filter((name) => /^\d{3}_.+\.sql$/.test(name))
      .sort((a, b) => Number(a.slice(0, 3)) - Number(b.slice(0, 3)));
    for (const migration of migrations) psql(`SET client_min_messages=warning;\n${readFileSync(path.join(migrationDir, migration), "utf8")}`);
    const readinessQuery = readFileSync(path.join(root, "deploy/vps/schema-readiness.sql"), "utf8");
    const checks = psql(readinessQuery).split(/\r?\n/).map((line) => line.split("|"));
    assert.ok(checks.length > 0, "catalog query should return check rows");
    for (const [name, ready] of checks) assert.equal(ready, "t", `${name} catalog contract failed`);

    psql(`DO $test$
      DECLARE definition TEXT; patched TEXT;
      BEGIN
        definition := pg_get_functiondef('public.claim_cron_alerts(text[])'::regprocedure);
        patched := replace(definition,
          'FROM expected e LEFT JOIN latest l USING (job_name)',
          'FROM (VALUES (''review_booster''::text), (''review_replies''::text), (''privacy_retention''::text)) e(job_name) LEFT JOIN latest l USING (job_name)');
        IF patched = definition THEN RAISE EXCEPTION 'could not create never_run expectation drift'; END IF;
        EXECUTE patched;
      END
    $test$;`);
    const driftedChecks = psql(readinessQuery).split(/\r?\n/).map((line) => line.split("|"));
    const cronReadiness = driftedChecks.find(([name]) => name === "042 expected cron jobs and missed-cadence alerting");
    assert.equal(cronReadiness?.[1], "f", "readiness must reject never_run checks that ignore configured expected jobs");
  } finally {
    if (started) {
      try { execFileSync(pgExe("pg_ctl"), ["-D", dataDir, "-m", "fast", "-w", "stop"], { stdio: "ignore" }); } catch {}
    }
  }
});
