import assert from "node:assert/strict";
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createServer } from "node:net";
import { join, resolve, sep } from "node:path";
import test from "node:test";
import { loadTs } from "./a02-test-support.mts";
import { signWebhook, webhookSecret } from "./a10-webhook-test-support.mts";

const root = process.cwd();
const pgBin = process.env.A10_PG_BIN ?? process.env.A06_PG_BIN ?? process.env.A08_PG_BIN ?? process.env.A04_PG_BIN ?? process.env.PG_BIN;
const pgExe = (name: string) => process.platform === "win32"
  ? join(pgBin ?? "C:/Program Files/PostgreSQL/17/bin", name + ".exe")
  : pgBin ? join(pgBin, name) : name;
const ids = {
  ownerA: "aa100000-0000-4000-8000-000000000001",
  ownerB: "aa100000-0000-4000-8000-000000000002",
  businessA: "aa100000-0000-4000-8000-000000000011",
  businessB: "aa100000-0000-4000-8000-000000000012",
  visitPrefix: "aa100000-0000-4000-8000-0000000001",
  deliveryPrefix: "aa100000-0000-4000-8000-0000000002",
};
const fixturePrefix = "a10-controlled-webhook-pg-";

function uuid(prefix: string, suffix: number) {
  return `${prefix}${String(suffix).padStart(2, "0")}`;
}

test("actual Resend POST + database adapter persist signed outcomes and enforce cross-workspace suppression", { timeout: 180_000 }, async () => {
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
  const dir = mkdtempSync(join(testRoot, fixturePrefix));
  assert.ok(resolve(dir).startsWith(testRoot + sep));
  const dataDir = join(dir, "data");
  let started = false;
  const psqlArgs = ["-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-h", "127.0.0.1", "-p", String(port), "-U", "postgres", "-d", "postgres"];
  const psql = (statement: string) => execFileSync(pgExe("psql"), [...psqlArgs, "-c", statement], { encoding: "utf8" }).trim();
  const psqlFile = (file: string) => execFileSync(pgExe("psql"), [...psqlArgs, "-f", file], { encoding: "utf8" }).trim();

  try {
    execFileSync(pgExe("initdb"), ["-D", dataDir, "-U", "postgres", "-A", "trust", "--no-locale", "--encoding=UTF8"], { stdio: "ignore" });
    appendFileSync(join(dataDir, "postgresql.conf"), "\nunix_socket_directories = ''\n");
    const log = join(dir, "postgres.log");
    try {
      execFileSync(pgExe("pg_ctl"), ["-D", dataDir, "-l", log, "-o", `-h 127.0.0.1 -p ${port} -F`, "-w", "start"], { stdio: "ignore" });
    } catch (error) {
      throw new Error(existsSync(log) ? readFileSync(log, "utf8") : "PostgreSQL failed to start", { cause: error });
    }
    started = true;

    const migrations = join(root, "neon/migrations");
    for (const name of readdirSync(migrations).filter((entry) => /^\d+_.*\.sql$/.test(entry)).sort()) psqlFile(join(migrations, name));
    // Reapply 025 after 036 to verify the same migration state the existing A10 integration fixture exercises.
    psqlFile(join(migrations, "025_email_delivery_events.sql"));
    psql(`INSERT INTO public.users(id,email) VALUES
      ('${ids.ownerA}','a10-controlled-owner-a@example.test'),('${ids.ownerB}','a10-controlled-owner-b@example.test');
      INSERT INTO public.profiles(id) VALUES ('${ids.ownerA}'),('${ids.ownerB}');
      INSERT INTO public.businesses(id,owner_user_id,name,google_review_url) VALUES
       ('${ids.businessA}','${ids.ownerA}','Controlled A','https://example.test/review'),
       ('${ids.businessB}','${ids.ownerB}','Controlled B','https://example.test/review');
      INSERT INTO public.business_members(business_id,user_id,role) VALUES
       ('${ids.businessA}','${ids.ownerA}','owner'),('${ids.businessB}','${ids.ownerB}','owner');
      INSERT INTO public.business_agents(business_id,agent_id,status,plan_id,billing_period,current_period_start,current_period_end) VALUES
       ('${ids.businessA}','review_booster','active','booster','monthly',now()-interval '1 day',now()+interval '29 days'),
       ('${ids.businessB}','review_booster','active','booster','monthly',now()-interval '1 day',now()+interval '29 days');`);

    const cases = [
      { type: "email.sent", address: "sent@example.test", message: "provider-sent" },
      { type: "email.delivered", address: "delivered@example.test", message: "provider-delivered" },
      { type: "email.delivery_delayed", address: "delayed@example.test", message: "provider-delayed" },
      { type: "email.failed", address: "failed@example.test", message: "provider-failed" },
      { type: "email.bounced", address: "  Suppress.Me@Example.test  ", message: "provider-bounced" },
      { type: "email.complained", address: "complaint@example.test", message: "provider-complained" },
      { type: "email.suppressed", address: "provider-suppressed@example.test", message: "provider-suppressed" },
    ] as const;
    const targetDeliveryId = uuid(ids.deliveryPrefix, 1);
    const admissionDeliveryId = uuid(ids.deliveryPrefix, 20);
    for (let index = 0; index < cases.length; index++) {
      const item = cases[index];
      const deliveryId = uuid(ids.deliveryPrefix, index + 1);
      const visitId = uuid(ids.visitPrefix, index + 1);
      const businessId = ids.businessA;
      const state = index === 0 ? "unknown" : "sending";
      const payloadAddress = item.address.trim();
      const frozen = JSON.stringify({
        from: "Studio <sender@example.test>", to: payloadAddress, reply_to: "sender@example.test",
        subject: `A10 ${item.type}`, text: `Controlled ${item.type}`, tags: [{ name: "ornigami_delivery_id", value: deliveryId }],
      }).replaceAll("'", "''");
      psql(`INSERT INTO public.followup_visits(id,business_id,customer_email,visited_at,followup_status) VALUES
          ('${visitId}','${businessId}','${payloadAddress}',now()-interval '2 days','pending');
        INSERT INTO public.booster_followup_deliveries(id,business_id,visit_id,state,provider_payload,review_url_snapshot,idempotency_key,lease_token,lease_until,first_attempt_at,send_attempt_count,reservation_month)
        VALUES ('${deliveryId}','${businessId}','${visitId}','${state}','${frozen}'::jsonb,'https://example.test/review','a10-${deliveryId}',gen_random_uuid(),${state === "unknown" ? "now()-interval '1 second'" : "now()+interval '5 minutes'"},now(),1,date_trunc('month',now() AT TIME ZONE 'UTC')::date);`);
    }
    const admissionVisitId = uuid(ids.visitPrefix, 20);
    const admissionPayload = JSON.stringify({
      from: "Studio <sender@example.test>", to: "suppress.me@example.test", reply_to: "sender@example.test", subject: "A10 later send",
      text: "Should be blocked", tags: [{ name: "ornigami_delivery_id", value: admissionDeliveryId }],
    }).replaceAll("'", "''");
    psql(`INSERT INTO public.followup_visits(id,business_id,customer_email,visited_at,followup_status) VALUES
        ('${admissionVisitId}','${ids.businessB}','suppress.me@example.test',now()-interval '2 days','pending');
      INSERT INTO public.booster_followup_deliveries(id,business_id,visit_id,state,provider_payload,review_url_snapshot,idempotency_key,lease_token,lease_until,send_attempt_count)
        VALUES ('${admissionDeliveryId}','${ids.businessB}','${admissionVisitId}','prepared','${admissionPayload}'::jsonb,'https://example.test/review','a10-${admissionDeliveryId}',gen_random_uuid(),now()+interval '5 minutes',0);`);
    const initialUncertainSnapshot = psql(`SELECT provider_payload::text||'|'||idempotency_key||'|'||send_attempt_count FROM public.booster_followup_deliveries WHERE id='${targetDeliveryId}'`);

    let adapterSqlCalls = 0;
    const databaseAdapter = loadTs<{ applyBoosterDeliveryEvent: (event: Record<string, unknown>) => Promise<Record<string, unknown>> }>(
      "src/modules/review-booster/services/delivery-events-db.service.ts",
      {
        "@/lib/db/neon": {
          sql: async (parts: TemplateStringsArray, ...values: unknown[]) => {
            const query = parts.join("$1");
            assert.match(query, /public\.apply_booster_delivery_event\(\$1::jsonb\)/);
            adapterSqlCalls++;
            const json = String(values[0]).replaceAll("'", "''");
            return [{ result: JSON.parse(psql(`SELECT public.apply_booster_delivery_event('${json}'::jsonb)::text`)) }];
          },
        },
      },
    );
    const service = loadTs<{ createResendWebhookPost: (options: Record<string, unknown>) => (request: Request) => Promise<Response> }>(
      "src/modules/review-booster/services/resend-webhook.service.ts",
      { "@/modules/review-booster/services/delivery-events.service": loadTs("src/modules/review-booster/services/delivery-events.service.ts", { "@/modules/review-booster/services/delivery-events-db.service": {} }) },
    );
    const route = loadTs<{ POST: (request: Request) => Promise<Response> }>("src/app/api/webhooks/resend/route.ts", {
      "@/modules/review-booster/services/delivery-events-db.service": databaseAdapter,
      "@/modules/review-booster/services/resend-webhook.service": service,
    });

    const originalSecret = process.env.RESEND_WEBHOOK_SECRET;
    delete process.env.RESEND_WEBHOOK_SECRET;
    try {
      assert.equal((await route.POST(makeRequest(eventPayload("email.sent", targetDeliveryId, "sent@example.test", "provider-sent"), { id: "evt-missing-secret" }))).status, 503);
      assert.equal(adapterSqlCalls, 0);
      process.env.RESEND_WEBHOOK_SECRET = `whsec_${Buffer.from("different-but-valid-synthetic-secret").toString("base64")}`;
      assert.equal((await route.POST(makeRequest(eventPayload("email.sent", targetDeliveryId, "sent@example.test", "provider-sent"), { id: "evt-bad-secret" }))).status, 401);
      process.env.RESEND_WEBHOOK_SECRET = webhookSecret;
      assert.equal((await route.POST(makeRequest(eventPayload("email.sent", targetDeliveryId, "sent@example.test", "provider-sent"), { id: "evt-tampered-body", bodySuffix: " " }))).status, 401);
      assert.equal((await route.POST(makeRequest(eventPayload("email.sent", targetDeliveryId, "sent@example.test", "provider-sent"), { id: "evt-stale", timestamp: Math.floor(Date.now() / 1000) - 301 }))).status, 401);
      assert.equal((await route.POST(makeRequest(eventPayload("email.sent", targetDeliveryId, "sent@example.test", "provider-sent"), { id: "evt-missing-header", missingSignature: true }))).status, 401);
      assert.equal(adapterSqlCalls, 0, "missing and invalid secrets/signatures are rejected before the database adapter runs");
      assert.equal(psql("SELECT count(*) FROM public.booster_delivery_events"), "0", "invalid secret/signatures leave event storage untouched");
      process.env.RESEND_WEBHOOK_SECRET = webhookSecret;

      const usedBefore = psql(`SELECT usage FROM public.booster_monthly_quota('${ids.businessA}')`);
      const responses: number[] = [];
      for (let index = 0; index < cases.length; index++) {
        const item = cases[index];
        const deliveryId = uuid(ids.deliveryPrefix, index + 1);
        const response = await route.POST(makeRequest(eventPayload(item.type, deliveryId, item.address, item.message), { id: `evt-a10-${index + 1}` }));
        responses.push(response.status);
        assert.deepEqual(await response.json(), { ok: true, duplicate: false }, `${item.type} accepted by the actual exported route`);
      }
      assert.deepEqual(responses, [200, 200, 200, 200, 200, 200, 200]);

      const persisted = psql(`SELECT string_agg(delivery_status,',' ORDER BY delivery_status_event_id) FROM public.booster_followup_deliveries WHERE id IN (${cases.map((_, index) => `'${uuid(ids.deliveryPrefix, index + 1)}'`).join(",")})`);
      assert.equal(persisted, "sent,delivered,delayed,failed,bounced,complained,suppressed");
      assert.equal(psql(`SELECT count(*) FROM public.booster_delivery_events WHERE event_id LIKE 'evt-a10-%'`), "7");
      assert.equal(psql(`SELECT string_agg(reason,',' ORDER BY reason) FROM public.booster_delivery_suppressions`), "bounce,complaint,provider_suppressed");
      assert.equal(psql(`SELECT reason||'|'||provider_message_id FROM public.booster_delivery_suppressions WHERE email_normalized='suppress.me@example.test'`), "bounce|provider-bounced");

      const bouncedDeliveryId = uuid(ids.deliveryPrefix, 5);
      const duplicate = await route.POST(makeRequest(eventPayload("email.bounced", bouncedDeliveryId, cases[4].address, "provider-bounced"), { id: "evt-a10-5" }));
      assert.deepEqual(await duplicate.json(), { ok: true, duplicate: true }, "byte-identical signed event replay is idempotently acknowledged");
      const changedDuplicate = await route.POST(makeRequest(eventPayload("email.complained", bouncedDeliveryId, "suppress.me@example.test", "provider-bounced"), { id: "evt-a10-5" }));
      assert.equal(changedDuplicate.status, 503, "same event ID with changed signed content fails closed");
      assert.equal(psql(`SELECT count(*) FROM public.booster_delivery_events WHERE event_id='evt-a10-5'`), "1");

      const outOfOrder = await route.POST(makeRequest(eventPayload("email.delivery_delayed", uuid(ids.deliveryPrefix, 2), "delivered@example.test", "provider-delivered", "2026-10-02T12:00:00.000Z"), { id: "evt-a10-old-delayed" }));
      assert.equal(outOfOrder.status, 200);
      assert.equal(psql(`SELECT delivery_status FROM public.booster_followup_deliveries WHERE id='${uuid(ids.deliveryPrefix, 2)}'`), "delivered", "older delayed event cannot downgrade confirmed delivery");

      const mismatch = await route.POST(makeRequest(eventPayload("email.bounced", bouncedDeliveryId, "wrong@example.test", "provider-bounced"), { id: "evt-a10-recipient-mismatch" }));
      assert.equal(mismatch.status, 503, "tagged recipient mismatch is returned for provider retry");
      assert.equal(psql(`SELECT count(*) FROM public.booster_delivery_events WHERE event_id='evt-a10-recipient-mismatch'`), "0", "mismatched recipient evidence is not persisted");

      const admissionFence = psql(`SELECT lease_token::text FROM public.booster_followup_deliveries WHERE id='${admissionDeliveryId}'`);
      const blocked = JSON.parse(psql(`SELECT public.begin_booster_delivery_send('${admissionDeliveryId}','${admissionFence}',NULL)::text`)) as { kind: string };
      assert.equal(blocked.kind, "non_sendable", "suppression from owner A blocks a later send from owner B's workspace");
      assert.equal(psql(`SELECT state FROM public.booster_followup_deliveries WHERE id='${admissionDeliveryId}'`), "non_sendable");
      assert.equal(psql(`SELECT last_error FROM public.followup_visits WHERE id='${admissionVisitId}'`), "Recipient suppressed by provider delivery feedback.");
      assert.equal(psql(`SELECT usage FROM public.booster_monthly_quota('${ids.businessA}')`), usedBefore,
        "provider outcomes and replay preserve the original workspace quota reservation");
      assert.equal(psql(`SELECT state||'|'||provider_message_id||'|'||delivery_status FROM public.booster_followup_deliveries WHERE id='${targetDeliveryId}'`), "accepted|provider-sent|sent",
        "a signed event positively reconciles an expired uncertain send without a replacement attempt");
      assert.equal(psql(`SELECT provider_payload::text||'|'||idempotency_key||'|'||send_attempt_count FROM public.booster_followup_deliveries WHERE id='${targetDeliveryId}'`), initialUncertainSnapshot,
        "provider evidence preserves the frozen payload, original key, and original attempt count");
      assert.equal(psql(`SELECT count(*) FROM public.followup_messages WHERE visit_id='${uuid(ids.visitPrefix, 1)}' AND status='sent'`), "1");
      assert.equal(psql(`SELECT count(*) FROM public.followup_messages WHERE visit_id='${uuid(ids.visitPrefix, 2)}' AND status='sent'`), "1");
      assert.equal(adapterSqlCalls, 11, "seven applications, one duplicate, one changed replay, one out-of-order event, and one recipient mismatch reached the production adapter");
    } finally {
      if (originalSecret === undefined) delete process.env.RESEND_WEBHOOK_SECRET;
      else process.env.RESEND_WEBHOOK_SECRET = originalSecret;
    }
  } finally {
    if (started) {
      try { execFileSync(pgExe("pg_ctl"), ["-D", dataDir, "-m", "immediate", "-w", "stop"], { stdio: "ignore" }); } catch { /* cleanup continues */ }
    }
    if (resolve(dir).startsWith(testRoot + sep)) rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
});

function eventPayload(type: string, deliveryId: string, recipient: string, providerId: string, createdAt = "2026-10-03T12:00:00.000Z") {
  return {
    type,
    created_at: createdAt,
    data: {
      email_id: providerId,
      to: [recipient],
      tags: { ornigami_delivery_id: deliveryId },
    },
  };
}

function makeRequest(payload: unknown, options: { id: string; timestamp?: number; signingSecret?: string; missingSignature?: boolean; bodySuffix?: string }) {
  const rawBody = JSON.stringify(payload);
  const timestamp = options.timestamp ?? Math.floor(Date.now() / 1000);
  const signature = signWebhook(rawBody, {
    id: options.id,
    timestamp,
    key: options.signingSecret ? Buffer.from(options.signingSecret) : undefined,
  });
  const headers = new Headers({ "content-type": "application/json", "svix-id": signature.id, "svix-timestamp": String(timestamp), "svix-signature": signature.signature });
  if (options.missingSignature) headers.delete("svix-signature");
  return new Request("https://app.example/api/webhooks/resend", { method: "POST", headers, body: rawBody + (options.bodySuffix ?? "") });
}
