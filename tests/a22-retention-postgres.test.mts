import assert from "node:assert/strict";
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { execFileSync, spawn } from "node:child_process";
import { join, resolve, sep } from "node:path";
import test from "node:test";
import { loadTs } from "./a17-workflow-harness.mts";
import { availablePostgresTestPort } from "./postgres-test-port.mts";

const root = process.cwd();
const testRoot = resolve(root, ".next");
const pgBin = process.env.A22_PG_BIN ?? process.env.PG_BIN;
const pgExe = (name: string) => process.platform === "win32" ? join(pgBin ?? "C:/Program Files/PostgreSQL/17/bin", `${name}.exe`) : pgBin ? join(pgBin, name) : name;
const businessId = "a2200000-0000-4000-8000-000000000001";
const visitRecentPermission = "a2200000-0000-4000-8000-000000000002";
const visitOldPermission = "a2200000-0000-4000-8000-000000000003";
const visitHeld = "a2200000-0000-4000-8000-000000000004";
const visitUnknown = "a2200000-0000-4000-8000-000000000005";
const deliveredId = "a2200000-0000-4000-8000-000000000006";
const visitBusinessHeld = "a2200000-0000-4000-8000-000000000007";
const businessHeldId = "a2200000-0000-4000-8000-000000000008";
const lateUnknownId = "a2200000-0000-4000-8000-000000000009";
const reconcileVisitId = "a2200000-0000-4000-8000-000000000011";

function quote(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (value && typeof value === "object" && typeof (value as Date).toISOString === "function") return `'${(value as Date).toISOString()}'::timestamptz`;
  return `'${String(value).replaceAll("'", "''")}'`;
}

test("A22 retention cleanup requires activation, honors holds and retention clocks, and preserves unresolved delivery history", { timeout: 180_000 }, async () => {
  mkdirSync(testRoot, { recursive: true });
  const dir = mkdtempSync(join(testRoot, "a22-retention-pg-"));
  assert.ok(resolve(dir).startsWith(`${testRoot}${sep}`));
  const dataDir = join(dir, "data");
  let started = false;
  let port = 0;
  let lastSqlFailure = "";
  let originalRetentionFlag: string | undefined;
  let lockProcess: ReturnType<typeof spawn> | undefined;
  const psql = (statement: string) => execFileSync(pgExe("psql"), ["-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-h", "127.0.0.1", "-p", String(port), "-U", "postgres", "-d", "postgres", "-f", "-"], { encoding: "utf8", input: statement }).trim();
  const psqlCsv = (statement: string) => execFileSync(pgExe("psql"), ["-X", "-q", "--csv", "-v", "ON_ERROR_STOP=1", "-h", "127.0.0.1", "-p", String(port), "-U", "postgres", "-d", "postgres", "-f", "-"], { encoding: "utf8", input: statement }).trim();
  const dbSql = async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const query = strings.reduce((out, part, index) => out + part + (index < values.length ? quote(values[index]) : ""), "");
    let output: string;
    try { output = psqlCsv(`${query};`); }
    catch (error) { lastSqlFailure = `${String(error)}\n${query}`; throw error; }
    if (!output) return [];
    const parseCsv = (line: string) => {
      const fields: string[] = [];
      let field = "";
      let quoted = false;
      for (let i = 0; i < line.length; i += 1) {
        const ch = line[i]!;
        if (ch === '"') {
          if (quoted && line[i + 1] === '"') { field += '"'; i += 1; }
          else quoted = !quoted;
        } else if (ch === "," && !quoted) { fields.push(field); field = ""; }
        else field += ch;
      }
      fields.push(field);
      return fields;
    };
    const [headers, ...dataRows] = output.split(/\r?\n/).map(parseCsv);
    return dataRows.map((values) => Object.fromEntries((headers ?? []).map((key, index) => {
      const raw = values[index] ?? "";
      if (key === "result") { try { return [key, JSON.parse(raw) as Record<string, unknown>]; } catch { return [key, raw]; } }
      return [key, /^-?\d+$/.test(raw) ? Number(raw) : raw];
    })));
  };
  try {
    execFileSync(pgExe("initdb"), ["-D", dataDir, "-U", "postgres", "-A", "trust", "--no-locale", "--encoding=UTF8"], { stdio: "ignore" });
    appendFileSync(join(dataDir, "postgresql.conf"), "\nunix_socket_directories = ''\n");
    port = await availablePostgresTestPort();
    execFileSync(pgExe("pg_ctl"), ["-D", dataDir, "-l", join(dir, "postgres.log"), "-o", `-h 127.0.0.1 -p ${port} -F`, "-w", "start"], { stdio: "ignore" });
    started = true;

    const migrationsDir = join(root, "neon/migrations");
    const migrations = readdirSync(migrationsDir).filter((name) => /^\d{3}_.+\.sql$/.test(name)).sort((a, b) => Number(a.slice(0, 3)) - Number(b.slice(0, 3)));
    for (const migration of migrations) psql(readFileSync(join(migrationsDir, migration), "utf8"));
    const legacyCallback = readFileSync(join(root, "tests/fixtures/contracts/A22_PRE_RETENTION_DELIVERY_EVENTS.sql"), "utf8");
    assert.match(legacyCallback, /CREATE OR REPLACE FUNCTION public\.apply_booster_delivery_event/);
    assert.doesNotMatch(legacyCallback, /RETENTION_DISPOSED_CALLBACK_/);
    psql(legacyCallback);
    psql(readFileSync(join(migrationsDir, "041_guarded_retention.sql"), "utf8"));
    psql(readFileSync(join(migrationsDir, "025_email_delivery_events.sql"), "utf8"));
    psql(readFileSync(join(migrationsDir, "041_guarded_retention.sql"), "utf8"));
    assert.equal(psql("SELECT position('RETENTION_DISPOSED_CALLBACK_UNMATCHED_GUARD' IN pg_get_functiondef('public.apply_booster_delivery_event(jsonb)'::regprocedure))>0 AND position('RETENTION_DISPOSED_CALLBACK_LOCKED_GUARD' IN pg_get_functiondef('public.apply_booster_delivery_event(jsonb)'::regprocedure))>0"), "t", "041 reinstalls both callback guards over the legacy 025 definition");
    psql(`INSERT INTO public.users(id,email,name,email_verified) VALUES ('a2200000-0000-4000-8000-000000000010','a22@example.test','A22 Owner',now());
      INSERT INTO public.businesses(id,owner_user_id,name,google_review_url,language) VALUES
        ('${businessId}','a2200000-0000-4000-8000-000000000010','A22 Studio','https://example.test/review','en'),
        ('${businessHeldId}','a2200000-0000-4000-8000-000000000010','A22 Held Studio','https://example.test/review','en');
      INSERT INTO public.business_agents(business_id,agent_id,status,plan_id,billing_period,current_period_start,current_period_end)
      VALUES ('${businessId}','review_booster','active','complete','annual',now()-interval '1 day',now()+interval '364 days');
      INSERT INTO public.billing_checkout_intents(id,business_id,owner_user_id,plan_id,billing_period,customer_id,request_hash,stripe_payload,idempotency_key,status)
      VALUES ('a2200000-0000-4000-8000-000000000030','${businessId}','a2200000-0000-4000-8000-000000000010','complete','annual','cus-a22','hash-a22','{"trial":true}'::jsonb,'a22-trial-intent','pending');
      INSERT INTO public.billing_trial_reservations(owner_user_id,business_id,intent_id)
      VALUES ('a2200000-0000-4000-8000-000000000010','${businessId}','a2200000-0000-4000-8000-000000000030');
      INSERT INTO public.booster_delivery_suppressions(email_normalized,reason,provider_message_id,event_id)
      VALUES ('blocked@example.test','complaint','historic-provider-id','historic-event-id');
      INSERT INTO public.booster_quota_legacy_usage(business_id,month_start,accepted_count)
      VALUES ('${businessId}',date_trunc('month',now() AT TIME ZONE 'UTC')::date,7);
      INSERT INTO public.followup_visits(id,business_id,customer_name,customer_email,service_name,visited_at,followup_status,followup_sent_at,permission_source,permission_notice_version,permission_at,permission_recipient_email,permission_scope)
      VALUES
        ('${visitRecentPermission}','${businessId}','Recent evidence','recent@example.test','Haircut',now()-interval '500 days','sent',now()-interval '120 days','paper','v1',now()-interval '120 days','recent@example.test','review_request'),
        ('${visitOldPermission}','${businessId}','Old evidence','old@example.test','Haircut',now()-interval '500 days','sent',now()-interval '400 days','paper','v1',now()-interval '400 days','old@example.test','review_request'),
        ('${visitHeld}','${businessId}','Held evidence','held@example.test','Haircut',now()-interval '500 days','sent',now()-interval '400 days','paper','v1',now()-interval '400 days','held@example.test','review_request'),
        ('${visitBusinessHeld}','${businessHeldId}','Business-held evidence','business-held@example.test','Haircut',now()-interval '500 days','sent',now()-interval '400 days','paper','v1',now()-interval '400 days','business-held@example.test','review_request'),
        ('${visitUnknown}','${businessId}','Unresolved','unknown@example.test','Haircut',now()-interval '500 days','pending',NULL,'paper','v1',now()-interval '400 days','unknown@example.test','review_request'),
        ('${deliveredId}','${businessId}','Delivered','delivered@example.test','Haircut',now()-interval '500 days','sent',now()-interval '400 days','paper','v1',now()-interval '400 days','delivered@example.test','review_request'),
        ('${lateUnknownId}','${businessId}','Late accepted','late-accepted@example.test','Haircut',now()-interval '500 days','pending',NULL,'paper','v1',now()-interval '400 days','late-accepted@example.test','review_request'),
        ('${reconcileVisitId}','${businessId}','Reconciliation','reconcile@example.test','Haircut',now()-interval '500 days','pending',NULL,'paper','v1',now()-interval '400 days','reconcile@example.test','review_request');
      INSERT INTO public.followup_messages(visit_id,business_id,provider_message_id,status,sent_at)
      VALUES ('${visitHeld}','${businessId}','held-message-id','sent',now()-interval '400 days');
      INSERT INTO public.privacy_retention_holds(data_class,record_id,business_id,reason,reviewed_at,next_review_at)
      VALUES ('booster_contact','${visitHeld}',NULL,'record-scoped documented hold',now(),now()+interval '30 days'),
             ('booster_contact',NULL,'${businessHeldId}','business-scoped documented hold',now(),now()+interval '30 days');
      INSERT INTO public.booster_followup_deliveries(id,business_id,visit_id,state,provider_payload,idempotency_key,first_attempt_at,send_attempt_count,reservation_month,provider_message_id,accepted_at)
      VALUES ('a2200000-0000-4000-8000-000000000020','${businessId}','${visitUnknown}','unknown','{"to":["unknown@example.test"],"html":"private"}'::jsonb,'a22-unknown',now()-interval '400 days',1,date_trunc('month',now())::date,'provider-unknown',NULL),
             ('a2200000-0000-4000-8000-000000000021','${businessId}','${deliveredId}','accepted','{"to":["delivered@example.test"],"html":"private"}'::jsonb,'a22-accepted',now()-interval '400 days',1,date_trunc('month',now())::date,'provider-accepted',now()-interval '400 days'),
             ('a2200000-0000-4000-8000-000000000022','${businessId}','${lateUnknownId}','unknown','{"to":["late-accepted@example.test"],"html":"private"}'::jsonb,'a22-late-accepted',now()-interval '400 days',1,date_trunc('month',now())::date,'provider-late-accepted',NULL),
             ('a2200000-0000-4000-8000-000000000023','${businessId}','${reconcileVisitId}','reconciliation_required','{"to":["reconcile@example.test"],"html":"private"}'::jsonb,'a22-reconcile',now()-interval '400 days',1,date_trunc('month',now())::date,'provider-reconcile',NULL);`);
    assert.equal(psql("SELECT recipient_sha256 IS NOT NULL FROM public.booster_followup_deliveries WHERE id='a2200000-0000-4000-8000-000000000020'"), "t", "fixture captures recipient fingerprint");
    assert.throws(() => psql("UPDATE public.booster_followup_deliveries SET evidence_disposed_at=now(),provider_payload=NULL,provider_message_id=NULL,recipient_sha256=NULL WHERE id='a2200000-0000-4000-8000-000000000020'"), /recipient|dispos|immutable/i, "the disposal exception cannot be used to clear an unresolved attempt");
    psql("UPDATE public.booster_followup_deliveries SET terminal_at=NULL WHERE id='a2200000-0000-4000-8000-000000000021'");
    assert.throws(() => psql("UPDATE public.booster_followup_deliveries SET evidence_disposed_at=now(),provider_payload=NULL,provider_message_id=NULL,recipient_sha256=NULL,terminal_at=now()-interval '400 days' WHERE id='a2200000-0000-4000-8000-000000000021'"), /recipient|dispos|immutable/i, "the disposal exception cannot forge an old terminal clock");
    psql("UPDATE public.booster_followup_deliveries SET terminal_at=accepted_at WHERE id='a2200000-0000-4000-8000-000000000021'");

    originalRetentionFlag = process.env.PRIVACY_RETENTION_ENABLED;
    delete process.env.PRIVACY_RETENTION_ENABLED;
    const cleanup = loadTs<{ runPrivacyRetentionCleanup(input: { batchSize?: number; maxOperations?: number; cursor?: unknown; now?: Date; apply?: boolean; dryRun?: boolean }): Promise<{ operations: Array<{ table: string; deleted: number; candidates: number; changed: number; failed: boolean }>; guardedDryRun: boolean }> }>("src/lib/privacy-retention-cleanup.ts", {
      "@/lib/db/neon": { sql: dbSql },
      "@/lib/safe-logger": { safeLogger: { error: () => undefined, info: () => undefined } },
    });
    const policy = loadTs<{ PRIVACY_CLEANUP_TABLES: readonly string[] }>("src/lib/privacy-retention.ts");
    const tableIndex = (table: string) => {
      const index = policy.PRIVACY_CLEANUP_TABLES.indexOf(table);
      assert.notEqual(index, -1, `cleanup includes ${table}`);
      return index;
    };
    const runOne = async (runner: typeof cleanup, table: string, input: { apply?: boolean; dryRun?: boolean }) => {
      const result = await runner.runPrivacyRetentionCleanup({ ...input, cursor: tableIndex(table), maxOperations: 1, now: new Date(), batchSize: 250 });
      assert.equal(result.operations[0]?.table, table);
      assert.equal(result.operations[0]?.failed, false, `${table} cleanup SQL succeeds. Last SQL failure: ${lastSqlFailure}`);
      return result;
    };
    const before = psql(`SELECT customer_email,permission_source,permission_notice_version FROM public.followup_visits WHERE id='${visitRecentPermission}'`);
    const unactivated = await runOne(cleanup, "followup_visits", { apply: true });
    assert.equal(unactivated.guardedDryRun, true, "activation flag remains closed by default");
    assert.equal(psql(`SELECT customer_email FROM public.followup_visits WHERE id='${visitRecentPermission}'`), before.split("|")[0], "apply without activation is read-only");
    const dryRun = await runOne(cleanup, "followup_visits", { apply: true, dryRun: true });
    assert.equal(dryRun.guardedDryRun, true, "explicit dry-run stays read-only");

    process.env.PRIVACY_RETENTION_ENABLED = "true";
    const activated = loadTs<typeof cleanup>("src/lib/privacy-retention-cleanup.ts", {
      "@/lib/db/neon": { sql: dbSql },
      "@/lib/safe-logger": { safeLogger: { error: () => undefined, info: () => undefined } },
    });
    const visitOp = async (table: string, input: { apply?: boolean; dryRun?: boolean }) => runOne(activated, table, input);
    const changed = await visitOp("followup_visits", { apply: true });
    assert.equal(changed.guardedDryRun, false);
    assert.equal(psql(`SELECT customer_name IS NULL AND customer_email IS NULL AND permission_source='paper' AND permission_notice_version='v1' FROM public.followup_visits WHERE id='${visitRecentPermission}'`), "t", "90-day content clears while 365-day permission evidence remains");
    assert.equal(psql(`SELECT customer_name IS NULL AND permission_source IS NULL AND permission_notice_version IS NULL FROM public.followup_visits WHERE id='${visitOldPermission}'`), "t", "permission evidence clears after 365 days");
    assert.equal(psql(`SELECT customer_email IS NOT NULL FROM public.followup_visits WHERE id='${visitHeld}'`), "t", "record-scoped hold protects old content");
    assert.equal(psql(`SELECT customer_email IS NOT NULL FROM public.followup_visits WHERE id='${visitBusinessHeld}'`), "t", "business-scoped hold protects old content");
    assert.equal(psql(`SELECT customer_email IS NOT NULL FROM public.followup_visits WHERE id='${visitUnknown}'`), "t", "unresolved delivery freezes contact cleanup");
    assert.equal(psql(`SELECT provider_payload IS NOT NULL AND provider_message_id='provider-unknown' FROM public.booster_followup_deliveries WHERE id='a2200000-0000-4000-8000-000000000020'`), "t", "unknown attempt payload and provider key stay available for reconciliation");
    assert.equal(psql(`SELECT provider_payload IS NOT NULL AND provider_message_id='provider-reconcile' FROM public.booster_followup_deliveries WHERE id='a2200000-0000-4000-8000-000000000023'`), "t", "reconciliation-required payload and provider key stay available");
    assert.equal(psql(`SELECT accepted_count FROM public.booster_quota_legacy_usage WHERE business_id='${businessId}'`), "7", "cleanup preserves legacy quota ledger");
    assert.equal(psql(`SELECT reason||'|'||provider_message_id||'|'||event_id FROM public.booster_delivery_suppressions WHERE email_normalized='blocked@example.test'`), "complaint|historic-provider-id|historic-event-id", "cleanup preserves suppression evidence");
    assert.equal(psql("SELECT count(*) FROM public.billing_trial_reservations WHERE owner_user_id='a2200000-0000-4000-8000-000000000010'"), "1", "retention cleanup preserves trial reservation history");
    const usageBeforeLateAcceptance = psql(`SELECT usage FROM public.booster_monthly_quota('${businessId}',date_trunc('month',now() AT TIME ZONE 'UTC')::date)`);

    await visitOp("followup_message_evidence", { apply: true });
    assert.equal(psql(`SELECT provider_message_id IS NOT NULL FROM public.followup_messages WHERE visit_id='${visitHeld}'`), "t", "delivery-evidence hold also protects provider message evidence");

    const holdBefore = psql(`SELECT reviewed_at::text,next_review_at::text FROM public.privacy_retention_holds WHERE record_id='${visitHeld}'`);
    psql(`UPDATE public.privacy_retention_holds SET reviewed_at=now(),next_review_at=now()+interval '30 days',reason='renewed review' WHERE record_id='${visitHeld}'`);
    assert.notEqual(psql(`SELECT reviewed_at::text,next_review_at::text FROM public.privacy_retention_holds WHERE record_id='${visitHeld}'`), holdBefore, "hold renewal advances review dates");

    const activeLockProcess = spawn(pgExe("psql"), ["-X", "-q", "-A", "-t", "-h", "127.0.0.1", "-p", String(port), "-U", "postgres", "-d", "postgres"], { stdio: ["pipe", "pipe", "pipe"] });
    lockProcess = activeLockProcess;
    let lockOutput = "";
    let lockError = "";
    activeLockProcess.stdout.setEncoding("utf8").on("data", (chunk: string) => { lockOutput += chunk; });
    activeLockProcess.stderr.setEncoding("utf8").on("data", (chunk: string) => { lockError += chunk; });
    activeLockProcess.stdin.write(`BEGIN; SELECT id FROM public.booster_followup_deliveries WHERE id='a2200000-0000-4000-8000-000000000021' FOR UPDATE; UPDATE public.booster_followup_deliveries SET state='unknown',accepted_at=NULL WHERE id='a2200000-0000-4000-8000-000000000021'; \\echo A22_ROW_LOCK_HELD\n`);
    await new Promise<void>((resolveReady, rejectReady) => {
      const timeout = setTimeout(() => rejectReady(new Error(`timed out waiting for row lock confirmation: ${lockError}`)), 10_000);
      const poll = () => {
        if (lockOutput.includes("A22_ROW_LOCK_HELD")) { clearTimeout(timeout); resolveReady(); }
        else if (activeLockProcess.exitCode !== null) { clearTimeout(timeout); rejectReady(new Error(`lock helper exited early: ${lockError}`)); }
        else setTimeout(poll, 20);
      };
      poll();
    });
    const raced = await visitOp("booster_delivery_provider_correlations", { apply: true });
    assert.equal(raced.operations[0]?.deleted, 0, "cleanup skips a locked delivery row");
    assert.equal(psql("SELECT count(*) FROM public.booster_disposed_provider_correlations WHERE provider_message_hash=encode(sha256(convert_to('provider-accepted','UTF8')),'hex')"), "0", "cleanup does not write a tombstone before a lock is available");
    activeLockProcess.stdin.write("COMMIT;\\q\n");
    await new Promise<void>((resolveExit, rejectExit) => {
      activeLockProcess.once("error", rejectExit);
      activeLockProcess.once("exit", (code) => code === 0 ? resolveExit() : rejectExit(new Error(`row lock helper exited ${code}: ${lockError}`)));
    });
    assert.equal(psql("SELECT state FROM public.booster_followup_deliveries WHERE id='a2200000-0000-4000-8000-000000000021'"), "unknown", "committed reconciliation state survives the racing cleanup");
    assert.equal(psql("SELECT provider_payload IS NOT NULL AND provider_message_id='provider-accepted' FROM public.booster_followup_deliveries WHERE id='a2200000-0000-4000-8000-000000000021'"), "t", "racing cleanup retains unresolved payload and key");
    psql("UPDATE public.booster_followup_deliveries SET state='accepted',accepted_at=now()-interval '400 days' WHERE id='a2200000-0000-4000-8000-000000000021'");
    await visitOp("booster_delivery_content", { apply: true });

    const acceptedCleanup = await visitOp("booster_delivery_provider_correlations", { apply: true });
    assert.equal(acceptedCleanup.guardedDryRun, false);
    assert.equal(psql("SELECT count(*) FROM public.booster_delivery_provider_correlations WHERE provider_message_id='provider-accepted'"), "0", "aged accepted provider correlation is disposed");
    assert.equal(psql("SELECT count(*) FROM public.booster_disposed_provider_correlations WHERE provider_message_hash=encode(sha256(convert_to('provider-accepted','UTF8')),'hex')"), "1", "disposal leaves a hash-only tombstone");
    assert.equal(psql("SELECT provider_payload IS NULL AND provider_message_id IS NULL AND recipient_sha256 IS NULL AND evidence_disposed_at IS NOT NULL FROM public.booster_followup_deliveries WHERE id='a2200000-0000-4000-8000-000000000021'"), "t", "delivery retains only minimal ledger row after disposal");

    psql(`UPDATE public.booster_followup_deliveries SET state='accepted',accepted_at=now() WHERE id='a2200000-0000-4000-8000-000000000022'`);
    const lateAcceptedClock = psql(`SELECT terminal_at > now()-interval '90 days' FROM public.booster_followup_deliveries WHERE id='a2200000-0000-4000-8000-000000000022'`);
    assert.equal(lateAcceptedClock, "t", "late acceptance starts a fresh 90-day content clock");
    await visitOp("booster_delivery_content", { apply: true });
    assert.equal(psql("SELECT provider_payload IS NOT NULL FROM public.booster_followup_deliveries WHERE id='a2200000-0000-4000-8000-000000000022'"), "t", "late-accepted payload remains during its fresh content window");
    assert.equal(psql(`SELECT usage FROM public.booster_monthly_quota('${businessId}',date_trunc('month',now() AT TIME ZONE 'UTC')::date)`), usageBeforeLateAcceptance, "unknown-to-accepted transition preserves the reserved quota count");

    const retainedCorrelationCount = psql("SELECT count(*) FROM public.booster_delivery_provider_correlations");
    const tagged = await dbSql`SELECT public.apply_booster_delivery_event(${JSON.stringify({ eventId: "a22-late-tagged", type: "email.bounced", createdAt: new Date().toISOString(), providerMessageId: "provider-accepted", deliveryId: "a2200000-0000-4000-8000-000000000021", recipients: ["delivered@example.test"], evidenceSource: "webhook" })}::jsonb) AS result`;
    assert.equal((tagged[0]?.result as { kind?: string })?.kind, "duplicate", "tagged callback to disposed delivery is a no-op");
    const untagged = await dbSql`SELECT public.apply_booster_delivery_event(${JSON.stringify({ eventId: "a22-late-untagged", type: "email.bounced", createdAt: new Date().toISOString(), providerMessageId: "provider-accepted", recipients: ["delivered@example.test"], evidenceSource: "webhook" })}::jsonb) AS result`;
    assert.equal((untagged[0]?.result as { kind?: string })?.kind, "duplicate", "untagged callback resolved by disposal tombstone is a no-op");
    assert.equal(psql("SELECT count(*) FROM public.booster_delivery_provider_correlations WHERE provider_message_id='provider-accepted'"), "0", "disposed provider correlation stays removed");
    const countsAfterCallbacks = psql("SELECT (SELECT count(*) FROM public.booster_delivery_events)||'|'||(SELECT count(*) FROM public.booster_delivery_provider_correlations)||'|'||(SELECT count(*) FROM public.booster_delivery_suppressions)");
    assert.equal(countsAfterCallbacks, `0|${retainedCorrelationCount}|1`, "late callback after disposal does not recreate events, correlations, or suppression state");
    const unmatched = await dbSql`SELECT public.apply_booster_delivery_event(${JSON.stringify({ eventId: "a22-unmatched", type: "email.bounced", createdAt: new Date().toISOString(), providerMessageId: "still-unmatched", recipients: ["retry@example.test"], evidenceSource: "webhook" })}::jsonb) AS result`;
    assert.equal((unmatched[0]?.result as { kind?: string })?.kind, "unmatched", "genuinely unmatched provider callbacks remain eligible for retry");
    assert.equal(psql(`SELECT usage FROM public.booster_monthly_quota('${businessId}',date_trunc('month',now() AT TIME ZONE 'UTC')::date)`), usageBeforeLateAcceptance, "callbacks do not alter quota accounting");
  } finally {
    if (lockProcess && lockProcess.exitCode === null) lockProcess.kill();
    if (originalRetentionFlag === undefined) delete process.env.PRIVACY_RETENTION_ENABLED;
    else process.env.PRIVACY_RETENTION_ENABLED = originalRetentionFlag;
    if (started) {
      try { execFileSync(pgExe("pg_ctl"), ["-D", dataDir, "-m", "immediate", "-w", "stop"], { stdio: "ignore" }); } catch { /* cleanup continues */ }
    }
    assert.ok(resolve(dir).startsWith(`${testRoot}${sep}`), "only the disposable PostgreSQL directory is removed");
    rmSync(dir, { recursive: true, force: true });
  }
});
