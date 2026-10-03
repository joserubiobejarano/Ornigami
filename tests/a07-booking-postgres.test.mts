import assert from "node:assert/strict";
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { execFileSync, spawn } from "node:child_process";
import { join, resolve, sep } from "node:path";
import test from "node:test";
import { availablePostgresTestPort } from "./postgres-test-port.mts";

const root = process.cwd();
const testRoot = resolve(root, ".next");
const pgBin = process.env.A07_PG_BIN ?? process.env.A06_PG_BIN ?? process.env.A08_PG_BIN ?? process.env.A04_PG_BIN ?? process.env.PG_BIN;
const pgExe = (name: string) => {
  const binary = process.platform === "win32" ? `${name}.exe` : name;
  if (pgBin) return join(pgBin, binary);
  return process.platform === "win32" ? join("C:/Program Files/PostgreSQL/17/bin", binary) : binary;
};
let port = 0;
const binariesAvailable = ["initdb", "pg_ctl", "psql"].every((name) => {
  try {
    execFileSync(pgExe(name), ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
});
const ids = {
  owner: "a0700000-0000-4000-8000-000000000001",
  activeBusiness: "a0700000-0000-4000-8000-000000000002",
  inactiveBusiness: "a0700000-0000-4000-8000-000000000003",
  credential: "a0700000-0000-4000-8000-000000000011",
  inactiveCredential: "a0700000-0000-4000-8000-000000000012",
};

function psql(statement: string): string {
  return execFileSync(pgExe("psql"), ["-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-h", "127.0.0.1", "-p", String(port), "-U", "postgres", "-d", "postgres", "-c", statement], { encoding: "utf8" }).trim();
}
function psqlFile(contents: string): void {
  execFileSync(pgExe("psql"), ["-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-h", "127.0.0.1", "-p", String(port), "-U", "postgres", "-d", "postgres", "-f", "-"], { input: contents, stdio: ["pipe", "ignore", "inherit"] });
}
function psqlAsync(statement: string): Promise<string> {
  return new Promise((resolveOutput, reject) => {
    const child = spawn(pgExe("psql"), ["-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-h", "127.0.0.1", "-p", String(port), "-U", "postgres", "-d", "postgres", "-c", statement], { stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    let error = "";
    child.stdout.setEncoding("utf8").on("data", (chunk: string) => { output += chunk; });
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => { error += chunk; });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolveOutput(output.trim()) : reject(new Error(error || `psql exited ${code}`)));
  });
}
function openPsqlSession() {
  const child = spawn(pgExe("psql"), ["-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-h", "127.0.0.1", "-p", String(port), "-U", "postgres", "-d", "postgres", "-f", "-"], { stdio: ["pipe", "pipe", "pipe"] });
  let output = "";
  let error = "";
  child.stdout.setEncoding("utf8").on("data", (chunk: string) => { output += chunk; });
  child.stderr.setEncoding("utf8").on("data", (chunk: string) => { error += chunk; });
  const done = new Promise<void>((resolveDone, reject) => {
    child.once("error", reject);
    child.once("close", (code) => code === 0 ? resolveDone() : reject(new Error(error || `psql exited ${code}`)));
  });
  void done.catch(() => undefined);
  return { write: (statement: string) => child.stdin.write(statement), end: () => { child.stdin.end(); return done; }, output: () => output };
}
function event(credential: string, externalId: string, source = "calendar", email: string | null = "test@example.com"): string {
  return `SELECT public.admit_booster_booking_event('${credential}','${source}','booking.completed','${externalId}','Test',${email == null ? "NULL" : `'${email}'`},${email == null ? "'+34 600 123 456'" : "NULL"},'Consultation',now()-interval '2 days')`;
}

test("booking SQL atomically deduplicates event and visit, fences entitlement/revocation/freeze", { timeout: 120_000, skip: !binariesAvailable }, async () => {
  mkdirSync(testRoot, { recursive: true });
  const dir = mkdtempSync(join(testRoot, "a07-booking-pg-"));
  assert.ok(resolve(dir).startsWith(`${testRoot}${sep}`), "disposable PostgreSQL data stays under workspace .next");
  const dataDir = join(dir, "data");
  let started = false;
  try {
    execFileSync(pgExe("initdb"), ["-D", dataDir, "-U", "postgres", "-A", "trust", "--no-locale", "--encoding=UTF8"], { stdio: "ignore" });
    appendFileSync(join(dataDir, "postgresql.conf"), "\nunix_socket_directories = ''\n");
    port = await availablePostgresTestPort();
    execFileSync(pgExe("pg_ctl"), ["-D", dataDir, "-l", join(dir, "postgres.log"), "-o", `-h 127.0.0.1 -p ${port} -F`, "-w", "start"], { stdio: "ignore" });
    started = true;
    psql("CREATE TABLE public.users(id uuid PRIMARY KEY, privacy_deletion_requested_at timestamptz);");
    psql(`INSERT INTO public.users(id) VALUES ('${ids.owner}');`);
    for (const migration of ["003_business_foundation.sql", "004_review_booster_tables.sql", "008_pricing_plans.sql", "009_review_booster_error_reason.sql", "010_review_booster_retries.sql", "023_booking_intake.sql"]) {
      psqlFile(readFileSync(join(root, "neon/migrations", migration), "utf8"));
    }
    psql(`INSERT INTO public.businesses(id,owner_user_id,name) VALUES
      ('${ids.activeBusiness}','${ids.owner}','Active'),('${ids.inactiveBusiness}','${ids.owner}','Inactive');
      INSERT INTO public.business_agents(business_id,agent_id,status,plan_id) VALUES
      ('${ids.activeBusiness}','review_booster','active','booster'),('${ids.inactiveBusiness}','review_booster','canceled','free');
      INSERT INTO public.booster_booking_credentials(id,business_id,label,encrypted_secret) VALUES
      ('${ids.credential}','${ids.activeBusiness}','Calendar','test-ciphertext'),
      ('${ids.inactiveCredential}','${ids.inactiveBusiness}','Inactive','test-ciphertext');`);
    const createdCredential = psql(`SELECT public.create_booster_booking_credential('${ids.activeBusiness}','${ids.owner}','Second calendar','encrypted-secret')`);
    assert.match(createdCredential, /^[0-9a-f-]{36}$/i);
    assert.equal(psql(`SELECT public.create_booster_booking_credential('${ids.activeBusiness}','${ids.inactiveBusiness}','Wrong owner','encrypted-secret') IS NULL`), "t");

    const outcomes = await Promise.all([psqlAsync(event(ids.credential, "evt-race")), psqlAsync(event(ids.credential, "evt-race"))]);
    assert.deepEqual(outcomes.sort(), ["created", "duplicate"]);
    assert.equal(psql(`SELECT count(*) FROM public.followup_integration_events WHERE business_id='${ids.activeBusiness}' AND external_id='evt-race'`), "1");
    assert.equal(psql(`SELECT count(*) FROM public.followup_visits WHERE business_id='${ids.activeBusiness}' AND external_id='evt-race'`), "1");

    assert.equal(psql(event(ids.credential, "evt-phone", "fresha", null)), "created");
    assert.equal(psql(`SELECT followup_status FROM public.followup_visits WHERE business_id='${ids.activeBusiness}' AND external_id='evt-phone'`), "non_sendable");
    psql(`UPDATE public.business_agents SET status='active',plan_id=NULL WHERE business_id='${ids.inactiveBusiness}' AND agent_id='review_booster';`);
    assert.equal(psql(event(ids.inactiveCredential, "evt-null-plan")), "inactive");
    assert.equal(psql(`SELECT count(*) FROM public.followup_integration_events WHERE external_id='evt-null-plan'`), "0");
    psql(`UPDATE public.business_agents SET status='canceled',plan_id='free' WHERE business_id='${ids.inactiveBusiness}' AND agent_id='review_booster';`);
    assert.equal(psql(event(ids.inactiveCredential, "evt-inactive")), "inactive");
    assert.equal(psql(`SELECT count(*) FROM public.followup_integration_events WHERE external_id='evt-inactive'`), "0");

    assert.equal(psql(event(ids.credential, "evt-unsupported").replace("booking.completed", "booking.cancelled")), "invalid");
    assert.equal(psql(event(ids.credential, "evt-unsupported")), "created", "unsupported events cannot consume the completion idempotency key");

    const revoke = openPsqlSession();
    let released = false;
    let blockedAdmission: Promise<string> | undefined;
    const releaseRevoke = async (commit: boolean) => {
      if (released) return;
      released = true;
      revoke.write(commit ? "COMMIT;\n" : "ROLLBACK;\n");
      await revoke.end();
    };
    try {
      revoke.write(`BEGIN; SELECT public.revoke_booster_booking_credential('${ids.activeBusiness}','${ids.owner}','${createdCredential}');\n\\echo A07_REVOKE_LOCKED\n`);
      const readinessDeadline = Date.now() + 15_000;
      while (Date.now() < readinessDeadline && !revoke.output().includes("A07_REVOKE_LOCKED")) {
        await new Promise((resolveWait) => setTimeout(resolveWait, 25));
      }
      assert.ok(revoke.output().includes("A07_REVOKE_LOCKED"), "revocation holds its credential lock until the writer is observed blocked");
      blockedAdmission = psqlAsync(`SET application_name='a07_booking_writer'; ${event(createdCredential, "evt-revoke-race", "calendar-race")}`);
      void blockedAdmission.catch(() => undefined);
      let writerBlocked = false;
      const writerDeadline = Date.now() + 15_000;
      while (Date.now() < writerDeadline) {
        if (psql("SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE application_name='a07_booking_writer' AND state='active' AND wait_event_type='Lock')") === "t") {
          writerBlocked = true;
          break;
        }
        await new Promise((resolveWait) => setTimeout(resolveWait, 25));
      }
      assert.equal(writerBlocked, true, "booking admission actually waits behind revocation before commit");
      await releaseRevoke(true);
      assert.equal(await blockedAdmission, "unauthorized", "admission observes committed revocation");
    } finally {
      await releaseRevoke(false);
      await blockedAdmission?.catch(() => undefined);
    }
    assert.equal(psql(`SELECT count(*) FROM public.followup_integration_events WHERE external_id='evt-revoke-race'`), "0");

    psql(`SELECT public.revoke_booster_booking_credential('${ids.activeBusiness}','${ids.owner}','${ids.credential}');`);
    assert.equal(psql(event(ids.credential, "evt-revoked")), "unauthorized");
    assert.equal(psql(`SELECT count(*) FROM public.followup_integration_events WHERE external_id='evt-revoked'`), "0");

    psql(`UPDATE public.booster_booking_credentials SET revoked_at=NULL WHERE id='${ids.credential}';
      UPDATE public.users SET privacy_deletion_requested_at=now() WHERE id='${ids.owner}';`);
    assert.equal(psql(event(ids.credential, "evt-frozen")), "unauthorized");
    assert.equal(psql(`SELECT count(*) FROM public.followup_integration_events WHERE external_id='evt-frozen'`), "0");

    psql(`UPDATE public.users SET privacy_deletion_requested_at=NULL WHERE id='${ids.owner}';
      UPDATE public.booster_booking_credentials SET revoked_at=NULL WHERE id='${ids.credential}';
      CREATE FUNCTION public.fail_test_visit_insert() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic visit failure'; END $$;
      CREATE TRIGGER fail_test_visit BEFORE INSERT ON public.followup_visits FOR EACH ROW EXECUTE FUNCTION public.fail_test_visit_insert();`);
    await assert.rejects(psqlAsync(event(ids.credential, "evt-rollback")), /synthetic visit failure/);
    assert.equal(psql(`SELECT count(*) FROM public.followup_integration_events WHERE external_id='evt-rollback'`), "0", "event insert rolls back with failed visit insert");
    psql("DROP TRIGGER fail_test_visit ON public.followup_visits; DROP FUNCTION public.fail_test_visit_insert();");
    assert.equal(psql(event(ids.credential, "evt-rollback")), "created", "retry after rolled-back admission creates the visit and event together");
    assert.equal(psql(`SELECT count(*) FROM public.followup_integration_events WHERE external_id='evt-rollback'`), "1");
    assert.equal(psql(`SELECT count(*) FROM public.followup_visits WHERE external_id='evt-rollback'`), "1");
  } finally {
    if (started) execFileSync(pgExe("pg_ctl"), ["-D", dataDir, "-m", "immediate", "-w", "stop"], { stdio: "ignore" });
    const resolvedRoot = resolve(testRoot);
    const resolvedDir = resolve(dir);
    assert.ok(resolvedDir.startsWith(`${resolvedRoot}${sep}`), "cleanup target remains inside .next");
    rmSync(resolvedDir, { recursive: true, force: true });
  }
});
