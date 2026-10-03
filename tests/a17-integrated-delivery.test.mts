import assert from "node:assert/strict";
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, resolve, sep } from "node:path";
import test from "node:test";
import { loadTs } from "./a17-workflow-harness.mts";
import { availablePostgresTestPort } from "./postgres-test-port.mts";
import { signWebhook, webhookSecret } from "./a10-webhook-test-support.mts";

const root = process.cwd();
const testRoot = resolve(root, ".next");
const pgBin = process.env.A17_PG_BIN ?? process.env.A04_PG_BIN ?? process.env.PG_BIN;
const pgExe = (name: string) => process.platform === "win32"
  ? join(pgBin ?? "C:/Program Files/PostgreSQL/17/bin", `${name}.exe`)
  : pgBin ? join(pgBin, name) : name;
const ids = {
  owner: "a1710000-0000-4000-8000-000000000001",
  member: "a1710000-0000-4000-8000-000000000002",
  business: "a1710000-0000-4000-8000-000000000003",
};

function quote(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("invalid SQL number");
    return String(value);
  }
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  return `'${String(value).replaceAll("'", "''")}'`;
}

test("member intake, owner-funded sends, signed Resend delivery events, replay, and bounce/complaint suppression share one ledger", { timeout: 180_000 }, async () => {
  mkdirSync(testRoot, { recursive: true });
  const dir = mkdtempSync(join(testRoot, "a17-integrated-delivery-pg-"));
  assert.ok(resolve(dir).startsWith(`${testRoot}${sep}`), "disposable PostgreSQL data stays under workspace .next");
  const dataDir = join(dir, "data");
  let started = false;
  const port = await availablePostgresTestPort();
  const psql = (statement: string) => execFileSync(pgExe("psql"), [
    "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-h", "127.0.0.1", "-p", String(port), "-U", "postgres", "-d", "postgres", "-f", "-",
  ], { encoding: "utf8", input: statement }).trim();

  try {
    execFileSync(pgExe("initdb"), ["-D", dataDir, "-U", "postgres", "-A", "trust", "--no-locale", "--encoding=UTF8"], { stdio: "ignore" });
    appendFileSync(join(dataDir, "postgresql.conf"), "\nunix_socket_directories = ''\n");
    execFileSync(pgExe("pg_ctl"), ["-D", dataDir, "-l", join(dir, "postgres.log"), "-o", `-h 127.0.0.1 -p ${port} -F`, "-w", "start"], { stdio: "ignore" });
    started = true;

    const migrationsDir = join(root, "neon/migrations");
    const migrations = readdirSync(migrationsDir)
      .filter((name) => /^\d{3}_.+\.sql$/.test(name))
      .sort((a, b) => Number(a.slice(0, 3)) - Number(b.slice(0, 3)));
    for (const migration of migrations) psql(readFileSync(join(migrationsDir, migration), "utf8"));
    psql(`INSERT INTO public.users(id,email,name,email_verified) VALUES
      ('${ids.owner}','a17-integrated-owner@example.test','Integrated Owner',now()),
      ('${ids.member}','a17-integrated-member@example.test','Integrated Member',now());
      INSERT INTO public.businesses(id,owner_user_id,name,google_review_url,language)
        VALUES ('${ids.business}','${ids.owner}','Integrated Studio','https://search.google.com/local/writereview?placeid=a17-integrated','en');
      INSERT INTO public.business_members(business_id,user_id,role) VALUES ('${ids.business}','${ids.member}','member');
      INSERT INTO public.business_agents(business_id,agent_id,plan_id,status,billing_period,current_period_start,current_period_end)
        VALUES ('${ids.business}','review_booster','complete','trialing','annual',now()-interval '90 days',now()+interval '275 days');`);

    const sql = async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const query = strings.reduce((output, part, index) => output + part + (index < values.length ? quote(values[index]) : ""), "");
      const output = psql(`SELECT row_to_json(a17_query)::text FROM (${query}) a17_query;`);
      return output ? output.split(/\r?\n/).map((row) => JSON.parse(row) as Record<string, unknown>) : [];
    };
    const intake = loadTs<{ POST(request: Request): Promise<Response> }>("src/app/api/review-booster/visits/route.ts", {
      "@/auth": { auth: async () => ({ user: { id: ids.member, email: "untrusted-session-email@example.test" } }) },
      "@/lib/db/neon": { sql },
    });
    const postVisit = async (email: string) => intake.POST(new Request("http://localhost/api/review-booster/visits", {
      method: "POST", headers: { "content-type": "application/json", origin: "http://localhost" },
      body: JSON.stringify({ customer_name: "A17 Guest", customer_email: email, service_name: "Consultation", visited_at: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString() }),
    }));

    for (const email of ["delivered@example.test", "bounce@example.test", "complaint@example.test", "unknown@example.test"]) {
      const response = await postVisit(email);
      assert.equal(response.status, 201, await response.clone().text());
      const visit = await response.json() as { business_id: string };
      assert.equal(visit.business_id, ids.business, "member intake stores the visit under the canonical owner workspace");
    }

    const atomicDb = loadTs<Record<string, (...args: never[]) => unknown>>("src/modules/review-booster/services/atomic-followup-db.service.ts", { "@/lib/db/neon": { sql } });
    const reviewDb = loadTs("src/modules/review-booster/services/review-booster-db.service.ts", {
      "@/lib/api-security": { HttpError: class extends Error { status: number; constructor(status: number, message: string) { super(message); this.status = status; } } },
      "@/lib/db/neon": { sql },
    });
    const providerCalls: Array<{ email: string; payload: Record<string, unknown>; key: string }> = [];
    const provider = loadTs<Record<string, (...args: never[]) => unknown>>("src/modules/review-booster/services/resend.provider.ts", {
      "@/lib/env": { getRequiredEnv: (key: string) => key === "EMAIL_FROM" ? "sender@example.test" : "synthetic-required-value", getOptionalEnv: () => "reply@example.test" },
      "@/modules/review-booster/services/unsubscribe-token.service": { buildUnsubscribeUrl: () => "https://app.example/api/review-booster/unsubscribe?token=synthetic" },
    });
    const providerWithMockedHttp = {
      ...provider,
      sendPreparedWithResend: async (payload: Record<string, unknown>, key: string) => {
        const email = String(payload.to);
        providerCalls.push({ email, payload: structuredClone(payload), key });
        if (email === "unknown@example.test") throw new Error("synthetic ambiguous provider timeout");
        return `provider-${email}`;
      },
      classifyResendFailure: () => "ambiguous",
    };
    const runner = loadTs<{
      createFollowupRunnerDependencies(businessId: string, actorId: string, overrides: Record<string, unknown>): Promise<Record<string, unknown>>;
      runEligibleFollowups(dependencies: Record<string, unknown>): Promise<{ sent: number; unknown: number; skipped: number }>;
    }>("src/modules/review-booster/services/followup-runner.service.ts", {
      "@/modules/review-booster/services/atomic-followup-db.service": atomicDb,
      "@/modules/review-booster/services/resend.provider": providerWithMockedHttp,
      "@/modules/review-booster/services/followup-email-generator.service": {
        buildSubject: (business: string) => `Thanks for visiting ${business}`,
        generateFollowupEmailBody: async (input: Record<string, unknown>) => `Thanks, ${input.customer_name}.`,
      },
      "@/lib/review-link-token": { buildReviewLinkUrl: ({ reviewUrl }: { reviewUrl: string }) => `https://tracked.example/?url=${encodeURIComponent(reviewUrl)}` },
      "@/lib/account-lifecycle": {
        beginAccountLifecycleOperation: async () => ({ result: "claimed", token: "a1710000-0000-4000-8000-000000000099" }),
        finishAccountLifecycleOperation: async () => true,
      },
      "@/lib/followup-run-policy": { MAX_FOLLOWUPS_PER_RUN: 50 },
      "@/modules/review-booster/services/settings-link-validation": loadTs("src/modules/review-booster/services/settings-link-validation.ts"),
      "@/modules/review-booster/services/review-booster-db.service": reviewDb,
    });
    const deps = await runner.createFollowupRunnerDependencies(ids.business, ids.member, {
      generateBody: async (candidate: { customerName: string | null }) => `Thanks, ${candidate.customerName}.`,
      sendPrepared: providerWithMockedHttp.sendPreparedWithResend,
    });
    const outcome = await runner.runEligibleFollowups(deps);
    assert.equal(outcome.sent, 3, "owner-funded annual-billed trial allowance accepts three provider sends");
    assert.equal(outcome.unknown, 1, "ambiguous provider timeout is held as unknown");
    assert.equal(providerCalls.length, 4);
    assert.equal(new Set(providerCalls.map((call) => call.key)).size, 4, "each accepted or uncertain send retains its own stable idempotency key");
    for (const call of providerCalls) {
      const deliveryTag = (call.payload.tags as Array<{ name: string; value: string }>).find((tag) => tag.name === "ornigami_delivery_id");
      assert.ok(deliveryTag, "the production payload builder adds the correlation tag");
      assert.equal(psql(`SELECT id FROM public.booster_followup_deliveries WHERE id='${deliveryTag.value}'`), deliveryTag.value, "provider payload tag correlates to the actual runner-created ledger row");
    }
    const deliveredId = psql("SELECT d.id FROM public.booster_followup_deliveries d JOIN public.followup_visits v ON v.id=d.visit_id WHERE v.customer_email='delivered@example.test'");
    const bounceId = psql("SELECT d.id FROM public.booster_followup_deliveries d JOIN public.followup_visits v ON v.id=d.visit_id WHERE v.customer_email='bounce@example.test'");
    const complaintId = psql("SELECT d.id FROM public.booster_followup_deliveries d JOIN public.followup_visits v ON v.id=d.visit_id WHERE v.customer_email='complaint@example.test'");
    const quotaBeforeEvents = await (atomicDb.getAtomicBoosterQuota as (input: { businessId: string }) => Promise<{ usage: number; allowance: number }>)( { businessId: ids.business });
    assert.equal(quotaBeforeEvents.usage, 4, "unknown result keeps its owner workspace reservation");
    assert.equal(quotaBeforeEvents.allowance, 1500);
    assert.equal(psql("SELECT state||'|'||delivery_status FROM public.booster_followup_deliveries d JOIN public.followup_visits v ON v.id=d.visit_id WHERE v.customer_email='unknown@example.test'"), "unknown|pending");
    const unknownFence = psql(`SELECT idempotency_key||'|'||send_attempt_count||'|'||provider_payload::text FROM public.booster_followup_deliveries WHERE id=(SELECT d.id FROM public.booster_followup_deliveries d JOIN public.followup_visits v ON v.id=d.visit_id WHERE v.customer_email='unknown@example.test')`);
    assert.match(unknownFence, /\|1\|/);

    // The exported route verifies the exact signed raw body and calls the real SQL adapter.
    const webhookEvents = loadTs("src/modules/review-booster/services/delivery-events.service.ts", { "@/modules/review-booster/services/delivery-events-db.service": {} });
    const webhookService = loadTs<{ createResendWebhookPost(options: Record<string, unknown>): (request: Request) => Promise<Response> }>(
      "src/modules/review-booster/services/resend-webhook.service.ts",
      { "@/modules/review-booster/services/delivery-events.service": webhookEvents },
    );
    const route = loadTs<{ POST(request: Request): Promise<Response> }>("src/app/api/webhooks/resend/route.ts", {
      "@/lib/db/neon": { sql },
      "@/modules/review-booster/services/resend-webhook.service": {
        createResendWebhookPost: (options: Record<string, unknown>) => webhookService.createResendWebhookPost({ ...options, getSecret: () => webhookSecret }),
      },
    });
    const eventCreatedAt = new Date().toISOString();
    const postEvent = async (eventId: string, type: string, deliveryId: string, email: string, providerId: string) => {
      const rawBody = JSON.stringify({ type, created_at: eventCreatedAt, data: { email_id: providerId, to: [email], tags: { ornigami_delivery_id: deliveryId } } });
      const signed = signWebhook(rawBody, { id: eventId, timestamp: Math.floor(Date.now() / 1000) });
      return route.POST(new Request("http://localhost/api/webhooks/resend", {
        method: "POST", headers: { "content-type": "application/json", "svix-id": signed.id, "svix-timestamp": signed.timestamp, "svix-signature": signed.signature }, body: rawBody,
      }));
    };
    const deliveredEvent = await postEvent("evt-a17-delivered", "email.delivered", deliveredId, "delivered@example.test", "provider-delivered@example.test");
    assert.equal(deliveredEvent.status, 200, await deliveredEvent.clone().text());
    assert.deepEqual(await deliveredEvent.json(), { ok: true, duplicate: false });
    assert.equal(psql(`SELECT state||'|'||delivery_status||'|'||provider_message_id FROM public.booster_followup_deliveries WHERE id='${deliveredId}'`), "accepted|delivered|provider-delivered@example.test");
    const replay = await postEvent("evt-a17-delivered", "email.delivered", deliveredId, "delivered@example.test", "provider-delivered@example.test");
    assert.equal(replay.status, 200);
    assert.deepEqual(await replay.json(), { ok: true, duplicate: true }, "same signed webhook event ID is acknowledged as a database-backed replay");
    assert.equal(psql(`SELECT count(*) FROM public.followup_messages WHERE visit_id=(SELECT visit_id FROM public.booster_followup_deliveries WHERE id='${deliveredId}') AND status='sent'`), "1", "accepted message history remains a single legacy sent record after webhook delivery and replay");
    assert.equal(psql(`SELECT state||'|'||delivery_status FROM public.booster_followup_deliveries WHERE id='${deliveredId}'`), "accepted|delivered");
    assert.equal(psql(`SELECT idempotency_key||'|'||send_attempt_count||'|'||provider_payload::text FROM public.booster_followup_deliveries WHERE id=(SELECT d.id FROM public.booster_followup_deliveries d JOIN public.followup_visits v ON v.id=d.visit_id WHERE v.customer_email='unknown@example.test')`), unknownFence,
      "signed events do not alter an unrelated unknown delivery's payload, idempotency key, attempt count, or reservation");

    for (const [kind, deliveryId, email, providerId] of [
      ["email.bounced", bounceId, "bounce@example.test", "provider-bounce@example.test"],
      ["email.complained", complaintId, "complaint@example.test", "provider-complaint@example.test"],
    ]) {
      const response = await postEvent(`evt-a17-${kind.replaceAll(".", "-")}`, kind, deliveryId, email, providerId);
      assert.equal(response.status, 200, await response.clone().text());
      assert.equal(psql(`SELECT delivery_status FROM public.booster_followup_deliveries WHERE id='${deliveryId}'`), kind === "email.bounced" ? "bounced" : "complained");
    }
    assert.equal(psql("SELECT string_agg(reason,',' ORDER BY reason) FROM public.booster_delivery_suppressions"), "bounce,complaint");

    for (const email of ["bounce@example.test", "complaint@example.test"]) {
      const later = await postVisit(email);
        assert.equal(later.status, 201, "intake may retain a visit even when a later provider send is suppressed");
    }
    const blocked = await runner.runEligibleFollowups(deps);
    assert.equal(blocked.sent, 0);
    assert.equal(providerCalls.length, 4, "bounce/complaint feedback prevents another provider HTTP request");
    assert.equal(psql("SELECT count(*) FROM public.booster_followup_deliveries d JOIN public.followup_visits v ON v.id=d.visit_id WHERE v.customer_email IN ('bounce@example.test','complaint@example.test') AND d.state='non_sendable'"), "2");
    const quotaAfterEvents = await (atomicDb.getAtomicBoosterQuota as (input: { businessId: string }) => Promise<{ usage: number; allowance: number }>)( { businessId: ids.business });
    assert.equal(quotaAfterEvents.usage, 4, "delivery feedback and denied sends preserve the accepted/unknown reservations");
    assert.equal(psql(`SELECT count(*) FROM public.followup_messages WHERE visit_id=(SELECT visit_id FROM public.booster_followup_deliveries WHERE id='${deliveredId}') AND status='sent'`), "1");
  } finally {
    let stopped = !started;
    if (started) {
      try {
        execFileSync(pgExe("pg_ctl"), ["-D", dataDir, "-m", "immediate", "-w", "stop"], { stdio: "ignore" });
        stopped = true;
      } catch (error) {
        throw new Error(`Could not stop disposable PostgreSQL; preserving its data at ${resolve(dir)}`, { cause: error });
      }
    }
    const resolvedDir = resolve(dir);
    assert.ok(resolvedDir.startsWith(`${testRoot}${sep}`), "cleanup target remains within workspace .next");
    if (stopped) rmSync(resolvedDir, { recursive: true, force: true });
  }
});
