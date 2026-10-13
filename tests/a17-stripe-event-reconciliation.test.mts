import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { appendFileSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import test from "node:test";
import Stripe from "stripe";

import { loadTs } from "./a02-test-support.mts";
import { availablePostgresTestPort } from "./postgres-test-port.mts";

type ProviderSubscription = {
  id: string;
  customer: string;
  status: string;
  metadata: Record<string, string>;
  start_date: number;
  trial_start: number | null;
  trial_end: number | null;
  items: { data: Array<{ current_period_start: number; current_period_end: number; price: { id: string } }> };
};
type ProviderEvent = {
  id: string;
  type: string;
  created: number;
  api_version: string | null;
  livemode: boolean;
  data: { object: Record<string, unknown> };
};
type ProviderScenario = { id: string; status: string; subscriptionSnapshot: ProviderSubscription; events: ProviderEvent[] };

const fixture = JSON.parse(readFileSync(resolve("tests/fixtures/a17-stripe-subscription-snapshots.json"), "utf8")) as {
  schema: string;
  providerMode: string;
  scenarios: ProviderScenario[];
};
const secretKey = `sk_test_${"a".repeat(24)}`;
const webhookSecret = `whsec_${Buffer.from("ornigami-a17-synthetic-webhook-secret").toString("base64")}`;

function pgExe(name: string): string {
  const bin = process.env.A17_PG_BIN ?? process.env.A04_PG_BIN ?? process.env.PG_BIN;
  return process.platform === "win32" ? join(bin ?? "C:/Program Files/PostgreSQL/17/bin", `${name}.exe`) : bin ? join(bin, name) : name;
}

function sqlQuote(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("invalid SQL number");
    return String(value);
  }
  if (typeof value !== "string") throw new Error("unsupported SQL fixture value");
  return `'${value.replaceAll("'", "''")}'`;
}

test("Stripe test snapshots reconcile through the signed Next webhook route into isolated PostgreSQL", { timeout: 120_000 }, async () => {
  assert.equal(fixture.schema, "ornigami.a17.stripe-webhook-fixtures.v1");
  assert.equal(fixture.providerMode, "stripe-test");
  assert.deepEqual(fixture.scenarios.map(({ id }) => id), [
    "successful-trial-conversion", "payment-failure", "trial-without-payment-method-expires",
  ]);

  const tempRoot = resolve(tmpdir());
  const dir = mkdtempSync(join(tempRoot, "ornigami-a17-stripe-pg-"));
  assert.ok(resolve(dir).startsWith(`${tempRoot}${sep}`), "disposable database stays under the OS temporary directory");
  const dataDir = join(dir, "data");
  const logFile = join(dir, "postgres.log");
  const port = await availablePostgresTestPort();
  const psql = (statement: string) => execFileSync(pgExe("psql"), [
    "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-h", "127.0.0.1", "-p", String(port), "-U", "postgres", "-d", "postgres", "-f", "-",
  ], { encoding: "utf8", input: statement }).trim();
  let started = false;

  try {
    execFileSync(pgExe("initdb"), ["-D", dataDir, "-U", "postgres", "-A", "trust", "--no-locale", "--encoding=UTF8"], { stdio: "ignore" });
    appendFileSync(join(dataDir, "postgresql.conf"), "\nunix_socket_directories = ''\n");
    execFileSync(pgExe("pg_ctl"), ["-D", dataDir, "-l", logFile, "-o", `-h 127.0.0.1 -p ${port} -F`, "-w", "start"], { stdio: "ignore" });
    started = true;

    const migrationsDir = resolve("neon/migrations");
    const migrations = readdirSync(migrationsDir).filter((name) => /^\d{3}_.+\.sql$/.test(name))
      .sort((a, b) => Number(a.slice(0, 3)) - Number(b.slice(0, 3)));
    for (const migration of migrations) psql(readFileSync(join(migrationsDir, migration), "utf8"));

    let sqlCalls = 0;
    const sql = (strings: TemplateStringsArray, ...values: unknown[]) => {
      sqlCalls += 1;
      const query = strings.reduce((output, part, index) => output + part + (index < values.length ? sqlQuote(values[index]) : ""), "");
      const output = psql(`SELECT row_to_json(a17_billing_row)::text FROM (${query}) a17_billing_row;`);
      return Promise.resolve(output ? output.split(/\r?\n/).map((line) => JSON.parse(line) as Record<string, unknown>) : []);
    };
    const persistence = loadTs<Record<string, (...args: never[]) => unknown>>("src/lib/billing/persistence.ts", {
      "@/lib/db/neon": { getSql: () => sql },
    });
    const fixturePriceId = fixture.scenarios[0]!.subscriptionSnapshot.items.data[0]!.price.id;
    const plans = {
      agentsForPlan: () => ["review_booster"],
      planIdFromStripePrice: (id: string) => id === fixturePriceId ? "booster" : null,
      periodFromStripePrice: (id: string) => id === fixturePriceId ? "monthly" : null,
    };
    const reconciliation = loadTs<{ reconcileStripeEvent(event: Record<string, unknown>, retrieve: (id: string) => Promise<ProviderSubscription>): Promise<string> }>(
      "src/lib/billing/reconciliation.ts",
      {
        "@/lib/db/neon": { sql },
        "@/lib/billing/persistence": persistence,
        "@/lib/billing/plans": plans,
        "@/lib/billing/webhook-state": loadTs("src/lib/billing/webhook-state.ts", {}),
      },
    );

    const ownerByCustomer = new Map<string, { ownerId: string; businessId: string }>();
    const snapshotBySubscription = new Map<string, ProviderSubscription>();
    for (const scenario of fixture.scenarios) {
      const snapshot = scenario.subscriptionSnapshot;
      const ownerId = randomUUID();
      const businessId = randomUUID();
      ownerByCustomer.set(snapshot.customer, { ownerId, businessId });
      snapshotBySubscription.set(snapshot.id, snapshot);
      psql(`INSERT INTO public.users(id,email) VALUES('${ownerId}','${ownerId}@example.test');
        INSERT INTO public.profiles(id,plan_type,plan_status) VALUES('${ownerId}','free','free');
        INSERT INTO public.businesses(id,owner_user_id,name,stripe_customer_id) VALUES('${businessId}','${ownerId}','Synthetic ${scenario.id}','${snapshot.customer}');
        INSERT INTO public.user_billing(user_id,stripe_customer_id) VALUES('${ownerId}','${snapshot.customer}');
        INSERT INTO public.booster_quota_legacy_usage(business_id,month_start,accepted_count) VALUES('${businessId}','2026-10-01',7);`);
    }

    const sdk = new Stripe(secretKey, { maxNetworkRetries: 0 });
    let retrieveCalls = 0;
    const stripe = {
      webhooks: sdk.webhooks,
      subscriptions: {
        retrieve: async (id: string) => {
          retrieveCalls += 1;
          const snapshot = snapshotBySubscription.get(id);
          if (!snapshot) throw new Error("fixture has no current provider snapshot for subscription");
          return snapshot;
        },
      },
    };
    const route = loadTs<{ POST(request: Request): Promise<Response> }>("src/app/api/stripe/webhook/route.ts", {
      "@/lib/stripe": { stripe },
      "@/lib/env": { getRequiredEnv: () => webhookSecret },
      "@/lib/safe-logger": { safeLogger: { error: () => undefined } },
      "@/lib/billing/reconciliation": reconciliation,
    });

    const postEvent = async (event: ProviderEvent, tamper = false) => {
      const body = JSON.stringify(event);
      const signature = sdk.webhooks.generateTestHeaderString({ payload: body, secret: webhookSecret, timestamp: Math.floor(Date.now() / 1000) });
      const request = new Request("http://127.0.0.1/api/stripe/webhook", {
        method: "POST",
        headers: { "content-type": "application/json", "stripe-signature": tamper ? signature.replace(/v1=[^,]+/, "v1=invalid") : signature },
        body,
      });
      return route.POST(request);
    };
    const currentState = (businessId: string) => psql(`SELECT status||'|'||current_period_end::date::text FROM public.business_agents
      WHERE business_id='${businessId}' AND agent_id='review_booster'`);
    const quotaUsage = (businessId: string) => psql(`SELECT usage::text FROM public.booster_monthly_quota('${businessId}','2026-10-01'::date)`);
    const consumedHistory = (ownerId: string) => psql(`SELECT count(*) FROM public.billing_trial_owner_history WHERE owner_user_id='${ownerId}' AND state='consumed'`);
    const consumedBusinessHistory = (businessId: string) => psql(`SELECT count(*) FROM public.billing_trial_business_history WHERE business_id='${businessId}' AND state='consumed'`);

    const conversion = fixture.scenarios[0]!;
    const conversionMapping = ownerByCustomer.get(conversion.subscriptionSnapshot.customer)!;
    const conversionFinal = conversion.events.find((event) => event.type === "customer.subscription.updated" && event.data.object.status === "active")!;
    const conversionOld = conversion.events.find((event) => event.type === "customer.subscription.created")!;
    const callsBeforeInvalid = sqlCalls;
    const invalid = await postEvent(conversionFinal, true);
    assert.equal(invalid.status, 400, "invalid signed payload is rejected by Stripe's constructEvent verification");
    assert.equal(sqlCalls, callsBeforeInvalid, "invalid signatures do not reach billing persistence");
    assert.equal(retrieveCalls, 0);

    const conversionResponse = await postEvent(conversionFinal);
    assert.equal(conversionResponse.status, 200, await conversionResponse.clone().text());
    assert.equal(currentState(conversionMapping.businessId), `active|${new Date(conversion.subscriptionSnapshot.items.data[0]!.current_period_end * 1000).toISOString().slice(0, 10)}`);
    assert.equal(quotaUsage(conversionMapping.businessId), "7");
    assert.equal(consumedHistory(conversionMapping.ownerId), "1");
    assert.equal(consumedBusinessHistory(conversionMapping.businessId), "1");

    const staleConversion = await postEvent(conversionOld);
    assert.equal(staleConversion.status, 200, "late trialing creation event is reconciled against the retrieved active provider state");
    assert.equal(currentState(conversionMapping.businessId), `active|${new Date(conversion.subscriptionSnapshot.items.data[0]!.current_period_end * 1000).toISOString().slice(0, 10)}`);
    assert.equal(quotaUsage(conversionMapping.businessId), "7");
    const retrievedBeforeReplay = retrieveCalls;
    const replay = await postEvent(conversionOld);
    assert.equal(replay.status, 200);
    assert.deepEqual(await replay.json(), { received: true, duplicate: true });
    assert.equal(retrieveCalls, retrievedBeforeReplay, "completed event replay is acknowledged without another provider read");
    assert.equal(quotaUsage(conversionMapping.businessId), "7");

    for (const scenario of fixture.scenarios.slice(1)) {
      const mapping = ownerByCustomer.get(scenario.subscriptionSnapshot.customer)!;
      const finalEvent = scenario.events.find((event) => event.data.object.status === scenario.status &&
        ["customer.subscription.updated", "customer.subscription.deleted"].includes(event.type))!;
      const finalResponse = await postEvent(finalEvent);
      assert.equal(finalResponse.status, 200, `${scenario.id}: ${await finalResponse.clone().text()}`);
      assert.equal(currentState(mapping.businessId).split("|")[0], scenario.status);
      assert.equal(consumedHistory(mapping.ownerId), "1", `${scenario.id} preserves trial consumption after expiry/cancellation`);
      assert.equal(consumedBusinessHistory(mapping.businessId), "1", `${scenario.id} preserves business trial consumption`);
      assert.equal(quotaUsage(mapping.businessId), "7", `${scenario.id} preserves prior quota usage`);
      for (const olderEvent of scenario.events.filter((event) => event.id !== finalEvent.id && event.type.startsWith("customer.subscription."))) {
        const response = await postEvent(olderEvent);
        assert.equal(response.status, 200, `${scenario.id} out-of-order event was reconciled from current provider state`);
        assert.equal(currentState(mapping.businessId).split("|")[0], scenario.status);
        assert.equal(quotaUsage(mapping.businessId), "7");
      }
    }
  } finally {
    if (started) {
      try { execFileSync(pgExe("pg_ctl"), ["-D", dataDir, "-m", "immediate", "-w", "stop"], { stdio: "ignore" }); } catch { /* cleanup continues */ }
    }
    rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
});
