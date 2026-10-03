import assert from "node:assert/strict";
import { execFile, execFileSync } from "node:child_process";
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { createServer } from "node:net";
import test from "node:test";
import { promisify } from "node:util";
import { loadTs } from "./auth-test-harness.mts";

const root = process.cwd();
const binDir = process.env.A12_PG_BIN ?? process.env.A04_PG_BIN ?? process.env.PG_BIN;
const pgExe = (name: string) => process.platform === "win32"
  ? join(binDir ?? "C:/Program Files/PostgreSQL/17/bin", `${name}.exe`)
  : binDir ? join(binDir, name) : name;
const execFileAsync = promisify(execFile);
let port = 0;

async function availablePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolvePromise);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No loopback port available");
  const selected = address.port;
  await new Promise<void>((resolvePromise, reject) => server.close((error) => error ? reject(error) : resolvePromise()));
  return selected;
}

function psql(statement: string): string {
  return execFileSync(pgExe("psql"), ["-X", "-q", "-A", "-t", "-F", "\t", "-v", "ON_ERROR_STOP=1", "-h", "127.0.0.1", "-p", String(port), "-U", "postgres", "-d", "postgres", "-f", "-"], {
    encoding: "utf8", input: statement,
  }).trim();
}

async function psqlAsync(statement: string): Promise<string> {
  const { stdout } = await execFileAsync(pgExe("psql"), ["-X", "-q", "-A", "-t", "-F", "\t", "-v", "ON_ERROR_STOP=1", "-h", "127.0.0.1", "-p", String(port), "-U", "postgres", "-d", "postgres", "-c", statement], {
    encoding: "utf8", maxBuffer: 2_000_000,
  });
  return String(stdout).trim();
}

function quote(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  const raw = typeof value === "object" ? JSON.stringify(value) : String(value);
  return `'${raw.replaceAll("'", "''")}'`;
}

test("A12 lease, checkpoint, fence, status constraints, and privacy-safe health writes execute in PostgreSQL", async () => {
  const nextDir = resolve(root, ".next");
  mkdirSync(nextDir, { recursive: true });
  port = await availablePort();
  const dir = mkdtempSync(join(nextDir, "a12-cron-pg-"));
  assert.ok(resolve(dir).startsWith(`${nextDir}${sep}`));
  const dataDir = join(dir, "data");
  let started = false;
  try {
    execFileSync(pgExe("initdb"), ["-D", dataDir, "-U", "postgres", "-A", "trust", "--no-locale", "--encoding=UTF8"], { stdio: "ignore" });
    appendFileSync(join(dataDir, "postgresql.conf"), "\nunix_socket_directories = ''\n");
    execFileSync(pgExe("pg_ctl"), ["-D", dataDir, "-l", join(dir, "postgres.log"), "-o", `-h 127.0.0.1 -p ${port} -F`, "-w", "start"], { stdio: "ignore" });
    started = true;
    psql(`CREATE TABLE public.cron_runs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), job_name TEXT NOT NULL, started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      finished_at TIMESTAMPTZ, status TEXT NOT NULL DEFAULT 'running' CHECK(status IN ('running','succeeded','failed')),
      processed_count INT NOT NULL DEFAULT 0, failed_count INT NOT NULL DEFAULT 0, error_message TEXT
    ); CREATE TABLE public.businesses (id UUID PRIMARY KEY); INSERT INTO public.businesses(id) VALUES ('20000000-0000-4000-8000-000000000001');`);
    psql(`SET client_min_messages=warning;\n${readFileSync(join(root, "docs/tasks/A12_CRON_SCHEMA.sql"), "utf8")}`);

    const health = loadTs<typeof import("../src/lib/cron-health.js")>("src/lib/cron-health.ts", { overrides: {
      "@/lib/db/neon": { sql: async (strings: TemplateStringsArray, ...values: unknown[]) => {
        const query = strings.reduce((output, part, index) => output + part + (index < values.length ? quote(values[index]) : ""), "");
        const output = await psqlAsync(`${query};`);
        if (!output) return [];
        return output.split(/\r?\n/).map((line) => {
          const columns = line.split("\t");
          if (/SELECT run\.id, claim\.fence, claim\.cursor/.test(query)) return { id: columns[0], fence: Number(columns[1]), cursor: columns[2] ? JSON.parse(columns[2]) : null, deadline_at: columns[3] };
          if (/RETURNING r\.id/.test(query)) return { id: columns[0] };
          if (/SELECT finish\.job_name, finish\.status FROM finish/.test(query)) return { job_name: columns[0], status: columns[1] };
          return { value: columns[0] };
        });
      } },
      "@/lib/safe-logger": { safeLogger: { error: () => {}, warn: () => {}, info: () => {} } },
      "@/lib/cron-alerts": { evaluateCronAlerts: async () => {} },
    } });

    const first = await health.acquireCronJobRun("review_booster", { budgetMs: 30_000, leaseMs: 50_000, batchLimit: 7 });
    assert.equal(first.batchLimit, 7);
    assert.equal(first.budgetMs, 30_000);
    assert.ok(first.fence > 0);
    await assert.rejects(() => health.acquireCronJobRun("review_booster"), (error: unknown) => error instanceof health.CronLeaseBusyError);

    await health.checkpointCronJobRun({ runId: first.runId, fence: first.fence, cursor: { businessId: "internal-id", visitId: "opaque-cursor" }, processedCount: 2,
      unitCursor: { businessId: "20000000-0000-4000-8000-000000000001", cursor: { locationName: "accounts/opaque/locations/opaque", stage: "drafts", lastReviewId: "17" } } });
    assert.equal(psql("SELECT cursor->>'visitId' FROM public.cron_job_state WHERE job_name='review_booster'"), "opaque-cursor");
    assert.equal(psql("SELECT cursor->>'lastReviewId' FROM public.cron_unit_state WHERE job_name='review_booster'"), "17");
    await health.finishCronJobRun({ runId: first.runId, fence: first.fence, status: "partial", processedCount: 2, failedCount: 0, errorCode: "budget_exhausted" });
    assert.equal(psql("SELECT status || ':' || error_message FROM public.cron_runs WHERE id='" + first.runId + "'"), "partial:budget_exhausted");
    assert.equal(psql("SELECT cursor->>'visitId' FROM public.cron_job_state WHERE job_name='review_booster'"), "opaque-cursor");

    const second = await health.acquireCronJobRun("review_booster", { budgetMs: 30_000, leaseMs: 50_000 });
    assert.ok(second.fence > first.fence);
    await assert.rejects(() => health.finishCronJobRun({ runId: first.runId, fence: first.fence, status: "succeeded", processedCount: 9, failedCount: 0 }), (error: unknown) => error instanceof health.CronFenceLostError);
    assert.equal(psql("SELECT lease_owner_run_id::text FROM public.cron_job_state WHERE job_name='review_booster'"), second.runId);
    await health.finishCronJobRun({ runId: second.runId, fence: second.fence, status: "no_work", processedCount: 0, failedCount: 0 });
    assert.equal(psql("SELECT cursor IS NULL FROM public.cron_job_state WHERE job_name='review_booster'"), "t");
    assert.equal(psql("SELECT count(*) FROM public.cron_unit_state WHERE job_name='review_booster'"), "0", "terminal success clears durable unit cursors");

    const expiring = await health.acquireCronJobRun("review_booster", { budgetMs: 30_000, leaseMs: 50_000 });
    psql(`UPDATE public.cron_job_state SET lease_until=clock_timestamp()-interval '1 second' WHERE job_name='review_booster';`);
    const takeover = await health.acquireCronJobRun("review_booster", { budgetMs: 30_000, leaseMs: 50_000 });
    assert.ok(takeover.fence > expiring.fence);
    assert.equal(psql("SELECT status || ':' || error_message FROM public.cron_runs WHERE id='" + expiring.runId + "'"), "failed:job_failed");
    await assert.rejects(() => health.finishCronJobRun({ runId: expiring.runId, fence: expiring.fence, status: "succeeded", processedCount: 0, failedCount: 0 }), (error: unknown) => error instanceof health.CronFenceLostError);
    assert.equal(psql("SELECT lease_owner_run_id::text FROM public.cron_job_state WHERE job_name='review_booster'"), takeover.runId);
    assert.equal(psql("SELECT alert_key FROM public.claim_cron_alerts() WHERE alert_key='review_booster:failed'"), "review_booster:failed", "expired running work becomes an actionable failure on takeover");
    await health.finishCronJobRun({ runId: takeover.runId, fence: takeover.fence, status: "no_work", processedCount: 0, failedCount: 0 });
    psql("SELECT count(*) FROM public.claim_cron_alerts()");
    assert.equal(psql("SELECT count(*) FROM public.cron_alert_state WHERE alert_key='review_booster:failed' AND active"), "0", "successful takeover recovery resolves stale failure");

    const contenders = await Promise.allSettled([
      health.acquireCronJobRun("review_booster", { budgetMs: 30_000, leaseMs: 50_000 }),
      health.acquireCronJobRun("review_booster", { budgetMs: 30_000, leaseMs: 50_000 }),
    ]);
    const winner = contenders.filter((result): result is PromiseFulfilledResult<Awaited<ReturnType<typeof health.acquireCronJobRun>>> => result.status === "fulfilled");
    const losers = contenders.filter((result) => result.status === "rejected");
    assert.equal(winner.length, 1, "concurrent callers cannot both own the same job");
    assert.equal(losers.length, 1);
    assert.ok(losers[0]?.status === "rejected" && losers[0].reason instanceof health.CronLeaseBusyError);
    await health.finishCronJobRun({ runId: winner[0]!.value.runId, fence: winner[0]!.value.fence, status: "no_work", processedCount: 0, failedCount: 0 });

    const privacy = await health.acquireCronJobRun("privacy_retention", { budgetMs: 30_000 });
    await health.finishCronJobRun({ runId: privacy.runId, fence: privacy.fence, status: "partial", processedCount: 4, failedCount: 1, errorCode: "partial_failures", outcomes: {
      leads: { deleted: 4, failed: false, complete: true }, feedback: { deleted: 0, failed: true, complete: false },
    } });
    assert.equal(psql("SELECT outcomes->'feedback'->>'failed' FROM public.cron_runs WHERE id='" + privacy.runId + "'"), "true");
    assert.equal(psql("SELECT count(*) FROM public.cron_runs WHERE error_message LIKE '%internal-id%' OR outcomes::text LIKE '%internal-id%'"), "0");

    psql("UPDATE public.cron_alert_state SET last_sent_at=clock_timestamp()-interval '31 minutes' WHERE active");
    const initialAlerts = psql("SELECT job_name || ':' || reason FROM public.claim_cron_alerts() ORDER BY job_name, reason");
    assert.deepEqual(initialAlerts.split(/\r?\n/).sort(), ["privacy_retention:partial", "review_replies:never_run"]);
    psql("UPDATE public.cron_alert_state SET last_sent_at=clock_timestamp()-interval '31 minutes' WHERE active");
    const concurrentAlerts = await Promise.all([
      psqlAsync("SELECT alert_key FROM public.claim_cron_alerts()"),
      psqlAsync("SELECT alert_key FROM public.claim_cron_alerts()"),
    ]);
    const concurrentlyClaimed = concurrentAlerts.flatMap((text) => text ? text.split(/\r?\n/) : []);
    assert.equal(concurrentlyClaimed.length, 2, "simultaneous evaluators claim each active candidate once");
    assert.equal(new Set(concurrentlyClaimed).size, 2);
    assert.equal(psql("SELECT count(*) FROM public.claim_cron_alerts()"), "0", "active alerts are durably deduplicated");
    psql(`INSERT INTO public.cron_runs(job_name,status,error_message,started_at) VALUES
      ('review_booster','partial','budget_exhausted',clock_timestamp()+interval '5 seconds');`);
    assert.equal(psql("SELECT count(*) FROM public.claim_cron_alerts()"), "0", "expected budget continuation does not alert");
    psql(`INSERT INTO public.cron_runs(job_name,status,started_at) VALUES
      ('privacy_retention','succeeded',clock_timestamp()+interval '10 seconds'),
      ('review_replies','no_work',clock_timestamp()+interval '10 seconds');`);
    assert.equal(psql("SELECT count(*) FROM public.claim_cron_alerts()"), "0", "recovery resolves partial and never-run alerts");
    assert.equal(psql("SELECT count(*) FROM public.cron_alert_state WHERE active"), "0");
    psql(`INSERT INTO public.cron_runs(job_name,status,error_message,started_at) VALUES
      ('review_booster','failed','job_failed',clock_timestamp()+interval '20 seconds');`);
    assert.equal(psql("SELECT job_name || ':' || reason FROM public.claim_cron_alerts()"), "review_booster:failed");
    assert.equal(psql("SELECT count(*) FROM public.claim_cron_alerts()"), "0", "repeated evaluator does not resend within throttle window");
    psql("INSERT INTO public.cron_runs(job_name,status,started_at) VALUES ('review_booster','succeeded',clock_timestamp()+interval '40 seconds')");
    psql("SELECT count(*) FROM public.claim_cron_alerts()");
    psql("INSERT INTO public.cron_runs(job_name,status,error_message,started_at) VALUES ('review_booster','failed','job_failed',clock_timestamp()+interval '50 seconds')");
    assert.equal(psql("SELECT alert_key FROM public.claim_cron_alerts()"), "review_booster:failed", "resolved recurrence is immediate inside its previous throttle window");

    psql("UPDATE public.cron_runs SET started_at=clock_timestamp()-interval '9 hours' WHERE job_name='review_replies' AND status='no_work'");
    assert.equal(psql("SELECT alert_key FROM public.claim_cron_alerts()"), "review_replies:missed_schedule", "two-cadence grace catches a missed schedule");
    psql("UPDATE public.cron_runs SET started_at=clock_timestamp()+interval '30 seconds' WHERE job_name='review_replies' AND status='no_work'");
    assert.equal(psql("SELECT count(*) FROM public.claim_cron_alerts()"), "0", "a later scheduled run resolves missed schedule");

    // Replay verifies fixed health codes and active dedup rows survive integration reruns.
    psql(`SET client_min_messages=warning;\n${readFileSync(join(root, "docs/tasks/A12_CRON_SCHEMA.sql"), "utf8")}`);
    assert.equal(psql("SELECT error_message FROM public.cron_runs WHERE id='" + privacy.runId + "'"), "partial_failures");
    assert.equal(psql("SELECT count(*) FROM public.cron_alert_state WHERE active"), "1");
    psql("INSERT INTO public.cron_unit_state(job_name,business_id,cursor) VALUES ('review_replies','20000000-0000-4000-8000-000000000001','{}')");
    psql("DELETE FROM public.businesses WHERE id='20000000-0000-4000-8000-000000000001'");
    assert.equal(psql("SELECT count(*) FROM public.cron_unit_state WHERE business_id='20000000-0000-4000-8000-000000000001'"), "0", "unit cursors cascade with workspace deletion");
    psql(`DO $$ BEGIN
      INSERT INTO public.cron_runs(job_name,status) VALUES ('review_booster','nope');
      RAISE EXCEPTION 'status constraint did not reject invalid value';
    EXCEPTION WHEN check_violation THEN NULL; END $$;`);
  } finally {
    if (started) {
      try { execFileSync(pgExe("pg_ctl"), ["-D", dataDir, "-m", "immediate", "-w", "stop"], { stdio: "ignore" }); } catch { /* teardown */ }
    }
    rmSync(dir, { recursive: true, force: true });
  }
});
