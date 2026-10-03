import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { execFile, execFileSync } from "node:child_process";
import { join, resolve, sep } from "node:path";
import { createServer } from "node:net";
import { promisify } from "node:util";
import test from "node:test";
import { fakeSql, loadTs } from "./a02-test-support.mts";

const root = process.cwd();
const pgBin = process.env.A10_PG_BIN ?? process.env.A06_PG_BIN ?? process.env.A08_PG_BIN ?? process.env.A04_PG_BIN ?? process.env.PG_BIN;
const pgExe = (name: string) => process.platform === "win32"
  ? join(pgBin ?? "C:/Program Files/PostgreSQL/17/bin", name + ".exe")
  : pgBin ? join(pgBin, name) : name;
const id = {
  owner: "a1000000-0000-4000-8000-000000000001",
  b1: "a1000000-0000-4000-8000-000000000011",
  b2: "a1000000-0000-4000-8000-000000000012",
  v1: "a1000000-0000-4000-8000-000000000021",
  v2: "a1000000-0000-4000-8000-000000000022",
  v3: "a1000000-0000-4000-8000-000000000023",
  v4: "a1000000-0000-4000-8000-000000000024",
  v5: "a1000000-0000-4000-8000-000000000025",
  d1: "a1000000-0000-4000-8000-000000000031",
  d2: "a1000000-0000-4000-8000-000000000032",
  d3: "a1000000-0000-4000-8000-000000000033",
  d4: "a1000000-0000-4000-8000-000000000034",
  d5: "a1000000-0000-4000-8000-000000000035",
};
const email = "customer@example.test";
const recipientFingerprint = "sha256:" + createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
const execFileAsync = promisify(execFile);

test("accepted finalizer treats matching event settlement as success only", async () => {
  const fake = fakeSql((query, values) => query.includes("finish_booster_delivery_accepted")
    ? [{ changed: false }]
    : [{ state: "accepted", provider_message_id: values[0], confirmed_by_event: values[0] === "provider-1" }]);
  const db = loadTs<{ finalizeAtomicFollowupAccepted: (input: {
    deliveryId: string; fence: string; providerMessageId: string; subject: string; body: string;
  }) => Promise<boolean> }>("src/modules/review-booster/services/atomic-followup-db.service.ts", {
    "@/lib/db/neon": { sql: fake.sql },
  });
  const base = { deliveryId: "a1000000-0000-4000-8000-000000000031", fence: "a1000000-0000-4000-8000-000000000099", subject: "s", body: "b" };
  assert.equal(await db.finalizeAtomicFollowupAccepted({ ...base, providerMessageId: "provider-1" }), true);
  assert.equal(await db.finalizeAtomicFollowupAccepted({ ...base, providerMessageId: "provider-2" }), false);
  assert.equal(fake.calls.length, 4);
});

test("A10 delivery event database contract uses disposable PostgreSQL", { timeout: 180_000 }, async () => {
  const probe = createServer();
  const port = await new Promise<number>((resolvePort, reject) => {
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const selected = (probe.address() as { port: number }).port;
      probe.close((error) => error ? reject(error) : resolvePort(selected));
    });
  });
  const testRoot = resolve(root, ".next");
  mkdirSync(testRoot, { recursive: true });
  const dir = mkdtempSync(join(testRoot, "a10-delivery-pg-"));
  assert.ok(resolve(dir).startsWith(testRoot + sep));
  const dataDir = join(dir, "data");
  let started = false;
  const psql = (statement: string) => execFileSync(pgExe("psql"), [
    "-X","-q","-A","-t","-v","ON_ERROR_STOP=1","-h","127.0.0.1","-p",String(port),
    "-U","postgres","-d","postgres","-c",statement,
  ], { encoding: "utf8" }).trim();
  const psqlAsync = async (statement: string) => {
    const { stdout } = await execFileAsync(pgExe("psql"), [
      "-X","-q","-A","-t","-v","ON_ERROR_STOP=1","-h","127.0.0.1","-p",String(port),
      "-U","postgres","-d","postgres","-c",statement,
    ], { encoding: "utf8" });
    return String(stdout).trim();
  };
  const psqlFile = (file: string) => execFileSync(pgExe("psql"), [
    "-X","-q","-A","-t","-v","ON_ERROR_STOP=1","-h","127.0.0.1","-p",String(port),
    "-U","postgres","-d","postgres","-f",file,
  ], { encoding: "utf8" }).trim();
  const event = (eventId: string, type: string, messageId: string, deliveryId: string, recipient = email, createdAt = "2026-10-03T10:00:00Z") => ({
    eventId, type, createdAt, providerMessageId: messageId, deliveryId,
    recipients: [recipient], evidenceSource: "webhook",
  });
  const apply = (value: Record<string, unknown>) => JSON.parse(psql(
    "SELECT public.apply_booster_delivery_event('" + JSON.stringify(value).replaceAll("'", "''") + "'::jsonb)::text",
  )) as Record<string, string>;
  const applyAsync = async (value: Record<string, unknown>) => JSON.parse(await psqlAsync(
    "SELECT public.apply_booster_delivery_event('" + JSON.stringify(value).replaceAll("'", "''") + "'::jsonb)::text",
  )) as Record<string, string>;
  try {
    execFileSync(pgExe("initdb"), ["-D",dataDir,"-U","postgres","-A","trust","--no-locale","--encoding=UTF8"], { stdio: "ignore" });
    appendFileSync(join(dataDir,"postgresql.conf"),"\nunix_socket_directories = ''\n");
    const log = join(dir,"postgres.log");
    try {
      execFileSync(pgExe("pg_ctl"),["-D",dataDir,"-l",log,"-o","-h 127.0.0.1 -p " + port + " -F","-w","start"],{stdio:"ignore"});
    } catch (error) {
      throw new Error(existsSync(log) ? readFileSync(log,"utf8") : "PostgreSQL failed to start",{cause:error});
    }
    started = true;
    const migrations = join(root,"neon/migrations");
    for (const name of readdirSync(migrations).filter((entry) => /^\d+_.*\.sql$/.test(entry)).sort()) psqlFile(join(migrations,name));
    psql("INSERT INTO public.users(id,email) VALUES ('" + id.owner + "','a10-owner@example.test'); INSERT INTO public.profiles(id) VALUES ('" + id.owner + "');");
    // Applying 025 after 036 must update only the A06 base under the A11 wrapper.
    psqlFile(join(migrations,"025_email_delivery_events.sql"));
    assert.equal(psql("SELECT to_regprocedure('public.begin_booster_delivery_send(uuid,uuid,uuid)') IS NOT NULL"),"t");
    assert.equal(psql("SELECT to_regprocedure('public.begin_booster_delivery_send_a06(uuid,uuid,uuid)') IS NOT NULL"),"t");
    assert.equal(psql("SELECT pg_get_functiondef('public.begin_booster_delivery_send(uuid,uuid,uuid)'::regprocedure) LIKE '%begin_booster_delivery_send_a06%'"),"t",
      "the existing account-lifecycle send wrapper survives migration reapplication");
    psql("INSERT INTO public.businesses(id,owner_user_id,name,google_review_url) VALUES " +
      "('" + id.b1 + "','" + id.owner + "','A10 One','https://example.test/review')," +
      "('" + id.b2 + "','" + id.owner + "','A10 Two','https://example.test/review');" +
      "INSERT INTO public.business_members(business_id,user_id,role) VALUES ('" + id.b1 + "','" + id.owner + "','owner'),('" + id.b2 + "','" + id.owner + "','owner');" +
      "INSERT INTO public.business_agents(business_id,agent_id,status,plan_id,billing_period,current_period_start,current_period_end) VALUES " +
      "('" + id.b1 + "','review_booster','active','booster','monthly',now()-interval '1 day',now()+interval '29 days')," +
      "('" + id.b2 + "','review_booster','active','booster','monthly',now()-interval '1 day',now()+interval '29 days');" +
      "INSERT INTO public.followup_visits(id,business_id,customer_email,visited_at,followup_status) VALUES " +
      "('" + id.v1 + "','" + id.b1 + "','" + email + "',now()-interval '2 days','pending')," +
      "('" + id.v2 + "','" + id.b2 + "','" + email + "',now()-interval '2 days','pending')," +
      "('" + id.v3 + "','" + id.b1 + "','late@example.test',now()-interval '2 days','pending')," +
      "('" + id.v4 + "','" + id.b2 + "','freeze@example.test',now()-interval '2 days','pending')," +
      "('" + id.v5 + "','" + id.b1 + "','frozen-first@example.test',now()-interval '2 days','pending');");
    const insertDelivery = (deliveryId: string, visitId: string, businessId: string, to: string, state: "sending" | "prepared") => {
      const frozen = JSON.stringify({ from:"Studio <sender@example.test>",to,reply_to:"sender@example.test",subject:"A10",text:"A10 body",html:"<p>A10 body</p>",tags:[{name:"ornigami_delivery_id",value:deliveryId}] }).replaceAll("'","''");
      psql("INSERT INTO public.booster_followup_deliveries(id,business_id,visit_id,state,provider_payload,review_url_snapshot,idempotency_key,lease_token,lease_until,first_attempt_at,send_attempt_count,reservation_month) VALUES " +
        "('" + deliveryId + "','" + businessId + "','" + visitId + "','" + state + "','" + frozen + "'::jsonb,'https://example.test/review','a10-" + deliveryId + "',gen_random_uuid(),now()+interval '5 minutes'," +
        (state === "sending" ? "now(),1," : "NULL,0,") + "date_trunc('month',now() AT TIME ZONE 'UTC')::date)");
    };
    insertDelivery(id.d1,id.v1,id.b1,email,"sending");
    insertDelivery(id.d2,id.v2,id.b2,email,"prepared");
    insertDelivery(id.d3,id.v3,id.b1,"late@example.test","sending");
    insertDelivery(id.d4,id.v4,id.b2,"freeze@example.test","sending");
    insertDelivery(id.d5,id.v5,id.b1,"frozen-first@example.test","sending");
    psql("UPDATE public.booster_followup_deliveries SET state='unknown',lease_until=now()-interval '1 second' WHERE id='" + id.d4 + "'");
    const fence = psql("SELECT lease_token::text FROM public.booster_followup_deliveries WHERE id='" + id.d2 + "'");

    const first = apply(event("evt-bounce","email.bounced","resend-1",id.d1));
    assert.equal(first.kind,"applied");
    assert.equal(first.state,"accepted");
    assert.equal(first.deliveryStatus,"bounced");
    assert.equal(psql("SELECT (recipients->>0)||'|'||((event_data->'recipients')->>0)||'|'||(position('" + email + "' in recipients::text||event_data::text)>0)::text FROM public.booster_delivery_events WHERE event_id='evt-bounce'"),
      recipientFingerprint + "|" + recipientFingerprint + "|false","live event ledger stores only a normalized recipient fingerprint");
    assert.equal(apply(event("evt-bounce","email.bounced","resend-1",id.d1)).kind,"duplicate");
    assert.equal(apply(event("evt-bounce","email.complained","resend-1",id.d1)).kind,"conflict");
    assert.equal(apply(event("evt-old-delivered","email.delivered","resend-1",id.d1,email,"2026-10-02T10:00:00Z")).deliveryStatus,"bounced");
    const complaint = apply(event("evt-complaint","email.complained","resend-1",id.d1));
    assert.equal(complaint.deliveryStatus,"complained","complaint is the highest terminal status");
    assert.equal(psql("SELECT usage::text FROM public.booster_monthly_quota('" + id.b1 + "')"),"3");
    assert.equal(psql("SELECT reason||'|'||event_id FROM public.booster_delivery_suppressions WHERE email_normalized='" + email + "'"),"complaint|evt-complaint",
      "higher-priority complaint evidence replaces bounce provenance");
    assert.equal(JSON.parse(psql("SELECT public.begin_booster_delivery_send('" + id.d2 + "','" + fence + "',NULL)::text")).kind,"non_sendable");

    const concurrent = await Promise.all([
      applyAsync(event("evt-delivered","email.delivered","resend-3",id.d3,"late@example.test")),
      applyAsync(event("evt-delivered","email.delivered","resend-3",id.d3,"late@example.test")),
    ]);
    assert.deepEqual(concurrent.map((value) => value.kind).sort(),["applied","duplicate"],
      "concurrent delivery of the same provider event commits once");
    assert.equal(psql("SELECT count(*) FROM public.followup_messages WHERE visit_id='" + id.v3 + "' AND status='sent'"),"1");
    assert.equal(apply(event("evt-delayed","email.delivery_delayed","resend-3",id.d3,"late@example.test")).deliveryStatus,"delivered",
      "a delayed event cannot downgrade confirmed delivery");
    assert.equal(apply(event("evt-suppressed","email.suppressed","resend-3",id.d3,"late@example.test")).deliveryStatus,"suppressed");
    assert.equal(psql("SELECT reason FROM public.booster_delivery_suppressions WHERE email_normalized='late@example.test'"),"provider_suppressed");
    assert.equal(psql("SELECT public.finish_booster_delivery_accepted('" + id.d3 + "',(SELECT lease_token FROM public.booster_followup_deliveries WHERE id='" + id.d3 + "'),'different-id','s','b')"),"f");
    psql("DELETE FROM public.booster_followup_deliveries WHERE id='" + id.d3 + "'");
    assert.equal(apply(event("evt-late-complaint","email.complained","resend-3",id.d3,"late@example.test")).kind,"applied");
    const lateFingerprint = "sha256:" + createHash("sha256").update("late@example.test").digest("hex");
    assert.equal(psql("SELECT (recipients->>0)||'|'||((event_data->'recipients')->>0)||'|'||(position('late@example.test' in recipients::text||event_data::text)>0)::text FROM public.booster_delivery_events WHERE event_id='evt-late-complaint'"),
      lateFingerprint + "|" + lateFingerprint + "|false","late event ledger also avoids persisting raw recipient PII");
    assert.equal(psql("SELECT reason FROM public.booster_delivery_suppressions WHERE email_normalized='late@example.test'"),"complaint");
    assert.equal(apply(event("evt-late-complaint","email.complained","resend-3",id.d3,"late@example.test")).kind,"duplicate");
    assert.equal(apply(event("evt-forged","email.bounced","resend-3",id.d3,"other@example.test")).kind,"conflict");
    assert.equal(psql("SELECT count(*) FROM public.booster_delivery_suppressions WHERE email_normalized='other@example.test'"),"0");
    assert.equal(apply({ ...event("lookup-active","email.bounced","resend-1",id.d1), evidenceSource:"provider_lookup" }).kind,"conflict");
    assert.equal(apply(event("evt-provider-conflict","email.delivered","resend-1",id.d3,"late@example.test")).kind,"conflict",
      "a provider message ID cannot bind to a second delivery");

    const lookup = { ...event("lookup-reconciled","email.sent","lookup-id",id.d4,"freeze@example.test"), evidenceSource:"provider_lookup" };
    assert.equal(apply(lookup).kind,"applied","expired unknown sends accept positive provider lookup evidence");
    assert.equal(psql("SELECT state||'|'||provider_message_id FROM public.booster_followup_deliveries WHERE id='" + id.d4 + "'"),"accepted|lookup-id");
    assert.equal(psql("SELECT usage::text FROM public.booster_monthly_quota('" + id.b2 + "')"),"1",
      "reconciliation preserves the original accepted reservation");

    psql("UPDATE public.users SET privacy_deletion_requested_at=now() WHERE id='" + id.owner + "'");
    assert.equal(apply(event("evt-frozen-complaint","email.complained","lookup-id",id.d4,"freeze@example.test")).kind,"applied");
    assert.equal(psql("SELECT (provider_payload IS NULL)::text||'|'||(recipient_sha256 IS NOT NULL)::text FROM public.booster_followup_deliveries WHERE id='" + id.d4 + "'"),"true|true",
      "frozen event handling clears content and retains only minimal correlation proof");
    assert.equal(psql("SELECT count(*) FROM public.followup_messages WHERE visit_id='" + id.v4 + "' AND status='sent'"),"1",
      "the pre-freeze accepted message remains the single ordinary history row");
    assert.equal(apply(event("evt-frozen-first","email.delivered","frozen-id",id.d5,"frozen-first@example.test")).kind,"applied");
    assert.equal(psql("SELECT (provider_payload IS NULL)::text||'|'||(recipient_sha256 IS NOT NULL)::text FROM public.booster_followup_deliveries WHERE id='" + id.d5 + "'"),"true|true");
    assert.equal(psql("SELECT count(*) FROM public.followup_messages WHERE visit_id='" + id.v5 + "' AND status='sent'"),"0",
      "a frozen first observation does not recreate subject/body history");
    assert.equal(psql("SELECT followup_status FROM public.followup_visits WHERE id='" + id.v4 + "'"),"sent",
      "the frozen path retains only the minimal sent lifecycle mirror");
    const freezeFence = psql("SELECT lease_token::text FROM public.booster_followup_deliveries WHERE id='" + id.d4 + "'");
    assert.equal(JSON.parse(psql("SELECT public.begin_booster_delivery_send('" + id.d4 + "','" + freezeFence + "',NULL)::text")).kind,"actor_denied",
      "the lifecycle wrapper still fences owner freeze after applying 025");
  } finally {
    if (started) {
      try { execFileSync(pgExe("pg_ctl"),["-D",dataDir,"-m","immediate","-w","stop"],{stdio:"ignore"}); } catch { /* cleanup continues */ }
    }
    if (resolve(dir).startsWith(testRoot + sep)) rmSync(dir,{recursive:true,force:true,maxRetries:10,retryDelay:100});
  }
});
