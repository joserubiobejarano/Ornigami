import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { createServer } from "node:net";
import test from "node:test";

import { loadTs } from "./auth-test-harness.mts";

const root = process.cwd();
const binDir = process.env.A11_PG_BIN ?? process.env.A04_PG_BIN ?? process.env.PG_BIN;
const pgExe = (name: string) => process.platform === "win32"
  ? join(binDir ?? "C:/Program Files/PostgreSQL/17/bin", `${name}.exe`)
  : binDir ? join(binDir, name) : name;
let port = 0;

async function availablePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolvePromise());
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No loopback port available");
  const selectedPort = address.port;
  await new Promise<void>((resolvePromise, reject) => server.close((error) => error ? reject(error) : resolvePromise()));
  return selectedPort;
}

function psql(statement: string): string {
  return execFileSync(pgExe("psql"), ["-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-h", "127.0.0.1", "-p", String(port), "-U", "postgres", "-d", "postgres", "-f", "-"], {
    encoding: "utf8", input: statement,
  }).trim();
}

function quote(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") return String(value);
  if (value && typeof value === "object" && "toISOString" in value && typeof value.toISOString === "function") {
    return `'${value.toISOString()}'`;
  }
  return `'${String(value).replaceAll("'", "''")}'`;
}

const ownerId = "10000000-0000-4000-8000-000000000001";
const memberId = "10000000-0000-4000-8000-000000000002";
const strangerId = "10000000-0000-4000-8000-000000000003";
const businessA = "20000000-0000-4000-8000-000000000001";
const businessB = "20000000-0000-4000-8000-000000000002";
const businessOther = "20000000-0000-4000-8000-000000000003";

type PersonalExport = {
  scope: string;
  user: { password_hash?: unknown };
  googleConnection: { scope: string; access_token?: unknown } | null;
  projects: Array<{ title: string }>;
  invitations: Array<{ status: string; email?: string }>;
  memberships: Array<{ business_name: string }>;
  billing: {
    customerProvisioning: { status: string } | null;
    webhookEvents: Array<{ event_type: string }>;
  };
};

type WorkspaceExport = {
  businesses: Array<{
    business: { id: string };
    reviews: Array<{ comment: string }>;
    replies: Array<{ draft_markdown: string }>;
    replyDraftState: Array<{ review_id: number; reply_id: number | null; state: string; version: number }>;
    replyUsageReservations: Array<{ review_id: number | null; state: string; usage_period_start: string }>;
    messages: Array<{ body: string }>;
    boosterDeliveries: Array<{ visit_id: string; state: string; send_attempt_count: number; reservation_month: string | null }>;
    boosterQuotaLegacyUsage: Array<{ month_start_utc: string; accepted_count: number }>;
    clicks: Array<{ user_agent: string }>;
    unsubscribeSuppressions: Array<{ customer_email: string }>;
    bookingCredentials: Array<{ id: string; label: string; created_at: string; last_used_at: string | null; revoked_at: string | null; encrypted_secret?: unknown }>;
    replyPostOutcomes: Array<{ business_id: string; review_id: number; outcome: string; recorded_at: string; claim_token?: unknown; actor_user_id?: unknown }>;
    settings: { googleConnection: { access_token?: unknown } | null };
    invitations: Array<{ revoked_at: string | null }>;
  }>;
};

function routeFor(userId: string) {
  const route = loadTs<typeof import("../src/app/api/privacy/export/route.js")>("src/app/api/privacy/export/route.ts", { overrides: {
    "next/server": { NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) } },
    "@/auth": { auth: async () => ({ user: { id: userId } }) },
    "@/lib/db/neon": { sql: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const query = strings.reduce((output, part, index) => output + part + (index < values.length ? quote(values[index]) : ""), "");
      const output = psql(`SELECT row_to_json(export_query)::text FROM (${query}) export_query;`);
      return output ? output.split(/\r?\n/).map((line) => JSON.parse(line) as Record<string, unknown>) : [];
    } },
    "@/lib/safe-logger": { safeLogger: { error: () => {} } },
  } });
  return route;
}

test("A11 export SQL executes against PostgreSQL and enforces personal/workspace boundaries", async () => {
  const nextDir = resolve(root, ".next");
  mkdirSync(nextDir, { recursive: true });
  port = await availablePort();
  const dir = mkdtempSync(join(nextDir, "a11-export-pg-"));
  const safePrefix = `${nextDir}${sep}`;
  assert.ok(resolve(dir).startsWith(safePrefix));
  const dataDir = join(dir, "data");
  let started = false;
  try {
    execFileSync(pgExe("initdb"), ["-D", dataDir, "-U", "postgres", "-A", "trust", "--no-locale", "--encoding=UTF8"], { stdio: "ignore" });
    appendFileSync(join(dataDir, "postgresql.conf"), "\nunix_socket_directories = ''\n");
    const logFile = join(dir, "postgres.log");
    try {
      execFileSync(pgExe("pg_ctl"), ["-D", dataDir, "-l", logFile, "-o", `-h 127.0.0.1 -p ${port} -F`, "-w", "start"], { stdio: "ignore" });
    } catch (error) {
      throw new Error(`Disposable PostgreSQL startup failed:\n${existsSync(logFile) ? readFileSync(logFile, "utf8") : "No log"}`, { cause: error });
    }
    started = true;

    const migrationsDir = join(root, "neon/migrations");
    const migrations = readdirSync(migrationsDir)
      .filter((name) => /^\d{3}_.+\.sql$/.test(name))
      .sort((a, b) => Number(a.slice(0, 3)) - Number(b.slice(0, 3)));
    for (const migration of migrations) psql(readFileSync(join(migrationsDir, migration), "utf8"));

    psql(`INSERT INTO public.users(id,email,name,image,password_hash,email_verified) VALUES
      ('${ownerId}','owner@example.test','Owner','https://img.example/owner','hash-owner',now()),
      ('${memberId}','member@example.test','Teammate','https://img.example/member','hash-member',now()),
      ('${strangerId}','stranger@example.test','Stranger','https://img.example/stranger','hash-stranger',now());`);
    psql(`INSERT INTO public.profiles(id,full_name,business_name,reply_tone) VALUES ('${ownerId}','Owner','A11 owner','warm');
      INSERT INTO public.projects(user_id,title,type,input,output_md) VALUES ('${ownerId}','owner project','audit','{"owner":true}','owner result'),('${memberId}','member project','audit','{}','member result');
      INSERT INTO public.feedback(user_id,message,category) VALUES ('${ownerId}','owner feedback','support'),('${memberId}','member feedback','support');`);
    psql(`INSERT INTO public.businesses(id,owner_user_id,name,website,stripe_customer_id) VALUES
      ('${businessA}','${ownerId}','Owner A','https://a.example','cus_owner'),
      ('${businessB}','${ownerId}','Owner B','https://b.example','cus_owner'),
      ('${businessOther}','${strangerId}','Stranger business','https://other.example','cus_other');
      INSERT INTO public.business_members(business_id,user_id,role) VALUES ('${businessA}','${memberId}','member');
      INSERT INTO public.team_invitations(id,business_id,invited_by,email,role,token_hash,expires_at,status,revoked_at)
        VALUES ('40000000-0000-4000-8000-000000000001','${businessA}','${ownerId}','coworker@example.test','member','invite-secret',now(),'revoked',now());
      INSERT INTO public.business_agents(business_id,agent_id,status,plan_id,billing_period,stripe_subscription_id,stripe_price_id)
        VALUES ('${businessA}','review_booster','active','booster','monthly','sub_owner','price_owner');
      INSERT INTO public.billing_checkout_intents(business_id,owner_user_id,plan_id,billing_period,customer_id,request_hash,stripe_payload,idempotency_key,status)
        VALUES ('${businessA}','${ownerId}','booster','monthly','cus_owner','hash','{"secret":"checkout-secret"}','idempotency-secret','completed');
      INSERT INTO public.billing_trial_business_history(business_id,state,source) VALUES ('${businessA}','consumed','stripe_authoritative_trial');
      INSERT INTO public.billing_trial_owner_history(owner_user_id,state,source) VALUES ('${ownerId}','consumed','stripe_authoritative_trial');
      INSERT INTO public.billing_customer_provisioning(owner_user_id,owner_email,idempotency_key,status)
        VALUES ('${ownerId}','owner@example.test','customer-key-secret','pending');
      INSERT INTO public.billing_webhook_events(event_id,event_type,status,owner_user_id)
        VALUES ('evt_owner','customer.subscription.updated','completed','${ownerId}');`);
    psql(`INSERT INTO public.reviews(user_id,business_id,location_name,google_review_id,reviewer_name,comment)
        VALUES ('${ownerId}','${businessA}','accounts/1/locations/1','review-a','Customer Name','Customer review body');
      INSERT INTO public.review_replies(user_id,business_id,review_id,draft_markdown,posted)
        SELECT '${ownerId}','${businessA}',id,'Owner reply','true' FROM public.reviews WHERE google_review_id='review-a';
      INSERT INTO public.followup_visits(id,business_id,customer_name,customer_email,visited_at)
        VALUES ('50000000-0000-4000-8000-000000000001','${businessA}','Customer','customer@example.test',now());
      INSERT INTO public.followup_messages(business_id,visit_id,subject,body,status,provider_message_id)
        VALUES ('${businessA}','50000000-0000-4000-8000-000000000001','Subject','Message body','sent','provider-message');
      INSERT INTO public.booster_quota_legacy_usage(business_id,month_start,accepted_count)
        VALUES ('${businessA}','2026-09-01',4);
      INSERT INTO public.booster_followup_deliveries(
        business_id,visit_id,state,provider_payload,review_url_snapshot,idempotency_key,lease_token,
        first_attempt_at,send_attempt_count,reservation_month,provider_message_id,error_message,accepted_at
      ) VALUES (
        '${businessA}','50000000-0000-4000-8000-000000000001','accepted','{"payload_secret":"delivery-payload-secret"}',
        'https://reviews.example/snapshot-secret','delivery-idempotency-secret',
        '60000000-0000-4000-8000-000000000001',now() - interval '1 day',2,'2026-10-01',
        'provider-message-secret','provider-error-secret',now()
      );
      INSERT INTO public.review_reply_draft_state(review_id,business_id,reply_id,state,version,posting_token,posting_lease_until)
        SELECT r.id,'${businessA}',rr.id,'approved',3,'70000000-0000-4000-8000-000000000001',now() + interval '1 minute'
        FROM public.reviews r JOIN public.review_replies rr ON rr.review_id=r.id
        WHERE r.google_review_id='review-a';
      INSERT INTO public.review_reply_usage_reservations(
        request_id,actor_user_id,owner_user_id,business_id,review_id,usage_period_start,state
      ) SELECT '80000000-0000-4000-8000-000000000001','${memberId}','${ownerId}','${businessA}',r.id,
        '2026-10-01','reserved' FROM public.reviews r WHERE r.google_review_id='review-a';
      INSERT INTO public.review_link_clicks(business_id,visit_id,user_agent)
        VALUES ('${businessA}','50000000-0000-4000-8000-000000000001','Customer browser');
      INSERT INTO public.followup_unsubscribes(business_id,customer_email,reason)
        VALUES ('${businessA}','suppressed@example.test','requested');
      INSERT INTO public.followup_integration_events(business_id,source,event_type,raw_payload)
        VALUES ('${businessA}','csv','imported','{"api_key":"raw-secret"}');
      INSERT INTO public.booster_booking_credentials(id,business_id,label,encrypted_secret,last_used_at,revoked_at)
        VALUES ('90000000-0000-4000-8000-000000000001','${businessA}','Calendar','encrypted-booking-secret',now(),'2026-10-01');
      INSERT INTO public.privacy_reply_post_outcomes(claim_token,business_id,review_id,outcome,recorded_at)
        SELECT '91000000-0000-4000-8000-000000000001','${businessA}',id,'accepted','2026-10-02' FROM public.reviews WHERE google_review_id='review-a';`);
    psql(`INSERT INTO public.gbp_connections(user_id,provider,access_token,refresh_token,expires_at,scope)
        VALUES ('${ownerId}','google','access-secret','refresh-secret',now() + interval '1 hour','business.manage');
      INSERT INTO public.gbp_locations(user_id,location_name,title,raw,connection_version)
        SELECT '${ownerId}','accounts/1/locations/1','Owner location','{"token":"location-raw-secret"}',connection_version
        FROM public.gbp_connections WHERE user_id='${ownerId}';
      INSERT INTO public.business_google_locations(business_id,location_id)
        SELECT '${businessA}',id FROM public.gbp_locations WHERE user_id='${ownerId}';
      INSERT INTO public.automation_prefs(location_id,autosend_min_rating)
        SELECT id,4 FROM public.gbp_locations WHERE user_id='${ownerId}';`);

    psql(`INSERT INTO public.leads(email,business_query,audit_text,created_at) VALUES
        ('old-one@example.test','Old one','audit',now() - interval '120 days'),
        ('old-two@example.test','Old two','audit',now() - interval '120 days');
      INSERT INTO public.feedback(message,created_at) VALUES ('old feedback',now() - interval '400 days');
      INSERT INTO public.public_demo_events(event_date,key_type,key_hash) VALUES (CURRENT_DATE - 100,'ip','old-demo');
      INSERT INTO public.public_demo_email_challenges(token_hash,recipient_email,payload,expires_at)
        VALUES ('old-challenge','challenge@example.test','{}',now() - interval '3 days');
      INSERT INTO public.api_rate_limits(key_hash,updated_at) VALUES ('old-rate',now() - interval '3 days');
      INSERT INTO public.auth_login_attempts(key_hash,updated_at) VALUES ('old-login',now() - interval '3 days');
      INSERT INTO public.email_verification_tokens(user_id,token_hash,expires_at)
        VALUES ('${strangerId}','old-verification',now() - interval '1 hour');
      INSERT INTO public.password_reset_tokens(user_id,token_hash,expires_at)
        VALUES ('${strangerId}','old-reset',now() - interval '1 hour');
      INSERT INTO public.review_link_clicks(business_id,visit_id,clicked_at)
        VALUES ('${businessA}','50000000-0000-4000-8000-000000000001',now() - interval '400 days');
      INSERT INTO public.followup_integration_events(business_id,source,event_type,created_at)
        VALUES ('${businessA}','old','old',now() - interval '400 days');
      INSERT INTO public.cron_runs(job_name,started_at,finished_at,status) VALUES ('old-run',now() - interval '35 days',now() - interval '34 days','succeeded');
      INSERT INTO public.cron_runs(job_name,started_at) VALUES ('active-old-run',now() - interval '35 days');`);

    const ownerRoute = routeFor(ownerId);
    const personalResponse = await ownerRoute.GET(new Request("https://app.example/api/privacy/export"));
    assert.equal(personalResponse.status, 200);
    const personal = await personalResponse.json() as PersonalExport;
    assert.equal(personal.scope, "personal");
    assert.equal(personal.user.password_hash, undefined);
    assert.ok(personal.googleConnection);
    assert.equal(personal.googleConnection.scope, "business.manage");
    assert.equal(personal.googleConnection.access_token, undefined);
    assert.equal(personal.projects.length, 1);
    assert.equal(personal.projects[0].title, "owner project");
    assert.equal(personal.invitations[0].status, "revoked");
    assert.equal(personal.invitations[0].email, undefined);
    assert.ok(personal.billing.customerProvisioning);
    assert.equal(personal.billing.customerProvisioning.status, "pending");
    assert.equal(personal.billing.webhookEvents[0].event_type, "customer.subscription.updated");
    const personalText = JSON.stringify(personal);
    for (const secret of ["access-secret", "refresh-secret", "invite-secret", "checkout-secret", "idempotency-secret", "customer-key-secret", "raw-secret", "provider-message"]) {
      assert.equal(personalText.includes(secret), false, `personal export leaked ${secret}`);
    }

    const allWorkspacesResponse = await ownerRoute.GET(new Request("https://app.example/api/privacy/export?scope=workspace"));
    assert.equal(allWorkspacesResponse.status, 200);
    const allWorkspaces = await allWorkspacesResponse.json() as WorkspaceExport;
    assert.equal(allWorkspaces.businesses.length, 2);
    const ownerWorkspace = allWorkspaces.businesses.find((workspace) => workspace.business.id === businessA);
    assert.ok(ownerWorkspace);
    assert.equal(ownerWorkspace.reviews[0].comment, "Customer review body");
    assert.equal(ownerWorkspace.replies[0].draft_markdown, "Owner reply");
    assert.equal(ownerWorkspace.replyDraftState[0].state, "approved");
    assert.equal(ownerWorkspace.replyDraftState[0].version, 3);
    assert.deepEqual(ownerWorkspace.replyUsageReservations.map((item) => item.state), ["reserved"]);
    assert.equal(ownerWorkspace.messages[0].body, "Message body");
    assert.equal(ownerWorkspace.boosterDeliveries[0].state, "accepted");
    assert.equal(ownerWorkspace.boosterDeliveries[0].send_attempt_count, 2);
    assert.deepEqual(ownerWorkspace.boosterQuotaLegacyUsage, [{ month_start_utc: "2026-09-01", accepted_count: 4 }]);
    assert.equal(ownerWorkspace.clicks[0].user_agent, "Customer browser");
    assert.equal(ownerWorkspace.unsubscribeSuppressions[0].customer_email, "suppressed@example.test");
    assert.equal(ownerWorkspace.bookingCredentials[0]?.label, "Calendar");
    assert.ok(ownerWorkspace.bookingCredentials[0]?.created_at);
    assert.ok(ownerWorkspace.bookingCredentials[0]?.last_used_at);
    assert.equal(ownerWorkspace.bookingCredentials[0]?.encrypted_secret, undefined);
    assert.equal(ownerWorkspace.replyPostOutcomes[0]?.business_id, businessA);
    assert.equal(ownerWorkspace.replyPostOutcomes[0]?.outcome, "accepted");
    assert.equal(ownerWorkspace.replyPostOutcomes[0]?.claim_token, undefined);
    assert.equal(ownerWorkspace.replyPostOutcomes[0]?.actor_user_id, undefined);
    assert.ok(ownerWorkspace.settings.googleConnection);
    assert.equal(ownerWorkspace.settings.googleConnection.access_token, undefined);
    assert.equal(ownerWorkspace.invitations[0].revoked_at !== null, true);
    const workspaceText = JSON.stringify(allWorkspaces);
    for (const secret of ["access-secret", "refresh-secret", "invite-secret", "checkout-secret", "idempotency-secret", "customer-key-secret", "raw-secret", "provider-message", "member@example.test", "Teammate", "delivery-payload-secret", "reviews.example/snapshot-secret", "delivery-idempotency-secret", "60000000-0000-4000-8000-000000000001", "provider-message-secret", "provider-error-secret", "70000000-0000-4000-8000-000000000001", "80000000-0000-4000-8000-000000000001", "encrypted-booking-secret", memberId]) {
      assert.equal(workspaceText.includes(secret), false, `workspace export leaked ${secret}`);
    }

    const selectedResponse = await ownerRoute.GET(new Request(`https://app.example/api/privacy/export?scope=workspace&businessId=${businessA}`));
    assert.equal(selectedResponse.status, 200);
    assert.equal((await selectedResponse.json() as WorkspaceExport).businesses.length, 1);
    assert.equal((await ownerRoute.GET(new Request(`https://app.example/api/privacy/export?scope=workspace&businessId=${businessOther}`))).status, 403);
    assert.equal((await ownerRoute.GET(new Request(`https://app.example/api/privacy/export?scope=workspace&businessId=${"40000000-0000-4000-8000-000000000099"}`))).status, 403);

    const memberRoute = routeFor(memberId);
    const memberPersonal = await memberRoute.GET(new Request("https://app.example/api/privacy/export"));
    assert.equal(memberPersonal.status, 200);
    const memberData = await memberPersonal.json() as PersonalExport;
    assert.equal(memberData.memberships[0].business_name, "Owner A");
    assert.equal(JSON.stringify(memberData).includes("Customer review body"), false);
    assert.equal(JSON.stringify(memberData).includes("customer@example.test"), false);
    assert.equal((await memberRoute.GET(new Request(`https://app.example/api/privacy/export?scope=workspace&businessId=${businessA}`))).status, 403);

    psql(`UPDATE public.users SET privacy_deletion_requested_at=now() WHERE id='${ownerId}';`);
    assert.equal((await ownerRoute.GET(new Request("https://app.example/api/privacy/export"))).status, 401);
    assert.equal((await ownerRoute.GET(new Request(`https://app.example/api/privacy/export?scope=workspace&businessId=${businessA}`))).status, 403);
    psql(`UPDATE public.users SET privacy_deletion_requested_at=NULL WHERE id='${ownerId}';`);

    const cleanupService = loadTs<typeof import("../src/lib/privacy-retention-cleanup.js")>("src/lib/privacy-retention-cleanup.ts", { overrides: {
      "@/lib/db/neon": { sql: async (strings: TemplateStringsArray, ...values: unknown[]) => {
        const query = strings.reduce((output, part, index) => output + part + (index < values.length ? quote(values[index]) : ""), "");
        const output = psql(`${query};`);
        return [{ deleted: Number(output || 0) }];
      } },
      "@/lib/safe-logger": { safeLogger: { error: () => {}, info: () => {} } },
    } });
    const cleanupNow = new Date();
    const firstCleanup = await cleanupService.runPrivacyRetentionCleanup({ batchSize: 1, now: cleanupNow });
    assert.equal(firstCleanup.failed, 0);
    assert.equal(firstCleanup.batchSize, 1);
    assert.equal(firstCleanup.operations.find((operation) => operation.table === "leads")?.deleted, 1);
    assert.equal(psql("SELECT count(*) FROM public.leads WHERE created_at < now() - interval '90 days'"), "1");
    const resumedCleanup = await cleanupService.runPrivacyRetentionCleanup({ batchSize: 100, now: cleanupNow });
    assert.equal(resumedCleanup.failed, 0);
    for (const [table, predicate] of [
      ["leads", "created_at < now() - interval '90 days'"],
      ["feedback", "created_at < now() - interval '365 days'"],
      ["public_demo_events", "event_date < CURRENT_DATE - 90"],
      ["public_demo_email_challenges", "expires_at < now() - interval '1 day'"],
      ["api_rate_limits", "updated_at < now() - interval '2 days'"],
      ["auth_login_attempts", "updated_at < now() - interval '2 days'"],
      ["email_verification_tokens", "expires_at < now()"],
      ["password_reset_tokens", "expires_at < now()"],
      ["review_link_clicks", "clicked_at < now() - interval '365 days'"],
      ["followup_integration_events", "created_at < now() - interval '365 days'"],
      ["cron_runs", "status <> 'running' AND finished_at IS NOT NULL AND started_at < now() - interval '30 days'"],
    ] as const) assert.equal(psql(`SELECT count(*) FROM public.${table} WHERE ${predicate}`), "0", `${table} expired rows remain`);
    assert.equal(psql("SELECT count(*) FROM public.cron_runs WHERE job_name='active-old-run' AND status='running'"), "1", "active cron runs remain available for health diagnosis");
    assert.equal(psql("SELECT count(*) FROM public.followup_visits"), "1");
    assert.equal(psql("SELECT count(*) FROM public.followup_messages"), "1");
    assert.equal(psql("SELECT count(*) FROM public.reviews"), "1");
    assert.equal(psql("SELECT count(*) FROM public.review_replies"), "1");
    assert.equal(psql("SELECT count(*) FROM public.followup_unsubscribes"), "1");
    assert.equal(psql("SELECT count(*) FROM public.billing_trial_business_history WHERE state='consumed'"), "1");
  } finally {
    if (started) {
      try { execFileSync(pgExe("pg_ctl"), ["-D", dataDir, "-m", "immediate", "-w", "stop"], { stdio: "ignore" }); } catch {}
    }
    rmSync(dir, { recursive: true, force: true });
  }
});
