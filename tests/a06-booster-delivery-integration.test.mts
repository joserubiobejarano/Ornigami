import assert from "node:assert/strict";
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, resolve, sep } from "node:path";
import test from "node:test";
import { loadTs } from "./a02-test-support.mts";

const root = process.cwd();
const testRoot = resolve(root, ".next");
const pgBin = process.env.A06_PG_BIN ?? process.env.A08_PG_BIN ?? process.env.A04_PG_BIN ?? process.env.PG_BIN ?? "C:/Program Files/PostgreSQL/17/bin";
const pgExe = (name: string) => process.platform === "win32" ? join(pgBin, `${name}.exe`) : join(pgBin, name);
const port = 55416;
const ids = {
  owner: "10000000-0000-4000-8000-000000000001",
  businessQuota: "10000000-0000-4000-8000-000000000002",
  businessReplay: "10000000-0000-4000-8000-000000000003",
  businessClaim: "10000000-0000-4000-8000-000000000004",
  visitOne: "20000000-0000-4000-8000-000000000001",
  visitTwo: "20000000-0000-4000-8000-000000000002",
  visitReplay: "20000000-0000-4000-8000-000000000003",
  visitClaim: "20000000-0000-4000-8000-000000000004",
};

function psql(statement: string): string {
  const args = ["-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-h", "127.0.0.1", "-p", String(port), "-U", "postgres", "-d", "postgres", "-c", statement];
  return execFileSync(pgExe("psql"), args, { encoding: "utf8" }).trim();
}
function sqlLiteral(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") { if (!Number.isFinite(value)) throw new Error("invalid SQL number"); return String(value); }
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  return `'${String(value).replaceAll("'", "''")}'`;
}
function renderSql(strings: readonly string[], values: unknown[]) {
  return strings.reduce((query, part, index) => query + part + (index < values.length ? sqlLiteral(values[index]) : ""), "");
}
function sqlRows(query: string): Array<Record<string, unknown>> {
  const output = psql(`SELECT row_to_json(a)::text FROM (${query}) AS a`);
  return output ? output.split(/\r?\n/).map((row) => JSON.parse(row) as Record<string, unknown>) : [];
}

test("atomic runner serializes real PostgreSQL quota claims and safely recovers sends", { timeout: 120_000 }, async () => {
  mkdirSync(testRoot, { recursive: true });
  const dir = mkdtempSync(join(testRoot, "a06-booster-pg-"));
  assert.ok(resolve(dir).startsWith(`${testRoot}${sep}`), "disposable PostgreSQL data stays under workspace .next");
  const dataDir = join(dir, "data");
  let started = false;
  try {
    execFileSync(pgExe("initdb"), ["-D", dataDir, "-U", "postgres", "-A", "trust", "--no-locale", "--encoding=UTF8"], { stdio: "ignore" });
    appendFileSync(join(dataDir, "postgresql.conf"), "\nunix_socket_directories = ''\n");
    const logFile = join(dir, "postgres.log");
    execFileSync(pgExe("pg_ctl"), ["-D", dataDir, "-l", logFile, "-o", `-h 127.0.0.1 -p ${port} -F`, "-w", "start"], { stdio: "ignore" });
    started = true;

    psql(`CREATE TABLE public.users(id uuid PRIMARY KEY);
      INSERT INTO public.users VALUES ('${ids.owner}');
      ALTER TABLE public.users ADD COLUMN privacy_deletion_requested_at timestamptz;
      CREATE TABLE public.profiles(id uuid PRIMARY KEY);
      INSERT INTO public.profiles VALUES ('${ids.owner}');`);
    for (const migration of ["003_business_foundation.sql", "004_review_booster_tables.sql", "007_review_booster_unsubscribes.sql", "008_pricing_plans.sql", "009_review_booster_error_reason.sql", "010_review_booster_retries.sql", "015_stripe_usage_periods.sql"]) {
      psql(readFileSync(join(root, "neon/migrations", migration), "utf8"));
    }
    psql(`ALTER TABLE public.business_agents ADD COLUMN IF NOT EXISTS current_period_end timestamptz;
      INSERT INTO public.businesses(id,owner_user_id,name,google_review_url,language) VALUES
        ('${ids.businessQuota}','${ids.owner}','Quota Studio','https://search.google.com/local/writereview?placeid=quota-fixture','en'),
        ('${ids.businessReplay}','${ids.owner}','Replay Studio','https://search.google.com/local/writereview?placeid=replay-fixture','es'),
        ('${ids.businessClaim}','${ids.owner}','Claim Studio','https://search.google.com/local/writereview?placeid=claim-fixture','fr');
      INSERT INTO public.business_members(business_id,user_id,role) VALUES
        ('${ids.businessQuota}','${ids.owner}','owner'),('${ids.businessReplay}','${ids.owner}','owner'),('${ids.businessClaim}','${ids.owner}','owner');
      INSERT INTO public.business_agents(business_id,agent_id,status,plan_id,billing_period,current_period_start,current_period_end)
        SELECT id,'review_booster','active','booster','annual',now()-interval '100 days',now()+interval '265 days'
        FROM public.businesses WHERE id IN ('${ids.businessQuota}','${ids.businessReplay}','${ids.businessClaim}');
      INSERT INTO public.followup_visits(id,business_id,customer_name,customer_email,service_name,visited_at,followup_status)
        VALUES ('${ids.visitOne}','${ids.businessQuota}','Alex','alex1@example.com','service',now()-interval '2 days','pending'),
          ('${ids.visitTwo}','${ids.businessQuota}','Blair','blair@example.com','service',now()-interval '2 days','pending'),
          ('${ids.visitReplay}','${ids.businessReplay}','Casey','casey@example.com','service',now()-interval '2 days','pending'),
          ('${ids.visitClaim}','${ids.businessClaim}','Drew','drew@example.com','service',now()-interval '2 days','pending');
      INSERT INTO public.followup_visits(business_id,customer_email,visited_at,followup_status,followup_sent_at)
        SELECT '${ids.businessQuota}', 'historic-'||n||'@example.com', now()-interval '20 days', 'sent', now()-interval '1 day'
        FROM generate_series(1,499) AS n;
      INSERT INTO public.followup_messages(visit_id,business_id,channel,subject,body,status,sent_at)
        SELECT id,business_id,'email','old','sent','sent',followup_sent_at FROM public.followup_visits
        WHERE business_id='${ids.businessQuota}' AND followup_sent_at IS NOT NULL;`);
    psql(readFileSync(join(root, "neon/migrations/022_booster_delivery_quotas.sql"), "utf8"));
    psql(readFileSync(join(root, "tests/fixtures/contracts/A11_ACTIVATION_BOOSTER.sql"), "utf8"));

    const sql = async (strings: TemplateStringsArray, ...values: unknown[]) => sqlRows(renderSql(strings, values));
    const db = loadTs<Record<string, (...args: never[]) => unknown>>("src/modules/review-booster/services/atomic-followup-db.service.ts", {
      "@/lib/db/neon": { sql },
    });
    const sentByKey = new Map<string, { serialized: string; id: string }>();
    let physicalSends = 0;
    const provider = {
      prepareResendPayload: async (input: Record<string, unknown>) => Object.freeze({
        from: `${input.email_from_name || input.business_name} <sender@example.com>`,
        to: input.customer_email,
        reply_to: "reply@example.com",
        subject: input.subject,
        text: `${input.body}\n\nLeave your review: ${input.review_link_url || input.google_review_url}`,
        html: `<p>${String(input.body).replaceAll("<", "&lt;")}</p><a href="${input.review_link_url || input.google_review_url}">Leave your review</a>`,
        headers: { "List-Unsubscribe": "<https://app.example/unsubscribe>" },
        tags: [{ name: "ornigami_delivery_id", value: input.delivery_id }],
      }),
      sendPreparedWithResend: async (payload: Record<string, unknown>, key: string) => {
        const serialized = JSON.stringify(payload);
        const prior = sentByKey.get(key);
        if (prior) {
          if (prior.serialized !== serialized) throw Object.assign(new Error("idempotent payload mismatch"), { name: "ResendDeliveryError", kind: "ambiguous" });
          return prior.id;
        }
        physicalSends += 1;
        const accepted = { serialized, id: `resend-${physicalSends}` };
        sentByKey.set(key, accepted);
        return accepted.id;
      },
      classifyResendFailure: (error: unknown) => error && typeof error === "object" && "kind" in error ? String(error.kind) : "ambiguous",
    };
    const runner = loadTs<{
      createFollowupRunnerDependencies: (businessId: string, actor?: string) => Promise<Record<string, unknown>>;
      runEligibleFollowups: (deps: Record<string, unknown>) => Promise<Record<string, number>>;
    }>("src/modules/review-booster/services/followup-runner.service.ts", {
      "@/modules/review-booster/services/atomic-followup-db.service": db,
      "@/modules/review-booster/services/resend.provider": provider,
      "@/modules/review-booster/services/followup-email-generator.service": {
        buildSubject: (business: string) => `Thank you for visiting ${business}`,
        generateFollowupEmailBody: async (input: Record<string, unknown>) => `Thanks for visiting ${input.business_name} on ${input.visited_at}.`,
      },
      "@/lib/review-link-token": { buildReviewLinkUrl: ({ reviewUrl }: { reviewUrl: string }) => `https://tracked.example/go?url=${encodeURIComponent(reviewUrl)}` },
      "@/lib/account-lifecycle": {
        beginAccountLifecycleOperation: async () => ({ result: "claimed", token: "generation-token" }),
        finishAccountLifecycleOperation: async () => true,
      },
      "@/lib/followup-run-policy": { MAX_FOLLOWUPS_PER_RUN: 50 },
      "@/modules/review-booster/services/settings-link-validation": loadTs("src/modules/review-booster/services/settings-link-validation.ts", {}),
      "@/modules/review-booster/services/review-booster-db.service": { assertBusinessMember: async () => undefined },
    });
    const makeDeps = (businessId: string) => runner.createFollowupRunnerDependencies(businessId, ids.owner);

    // Both runners see two visits while one legacy send remains below the 500 cap.
    const [quotaDepsA, quotaDepsB] = await Promise.all([makeDeps(ids.businessQuota), makeDeps(ids.businessQuota)]);
    const [runA, runB] = await Promise.all([runner.runEligibleFollowups(quotaDepsA), runner.runEligibleFollowups(quotaDepsB)]);
    assert.equal(runA.sent + runB.sent, 1, "workspace row locking allows only the final quota slot to be claimed once");
    assert.equal(physicalSends, 1, "concurrent runner passes produce one provider acceptance");
    const quota = await (db.getAtomicBoosterQuota as (input: { businessId: string }) => Promise<{ usage: number; allowance: number }>)({ businessId: ids.businessQuota });
    assert.deepEqual(quota, { usage: 500, allowance: 500 });

    // Provider accepted; DB finalization fails. After lease expiry, runner resends
    // the frozen request and stable key; the provider idempotency cache prevents a
    // second physical delivery, then finalization records one sent message.
    const replayDeps = await makeDeps(ids.businessReplay);
    const finalize = db.finalizeAtomicFollowupAccepted as (input: Record<string, unknown>) => Promise<boolean>;
    let failFinalizeOnce = true;
    db.finalizeAtomicFollowupAccepted = (async (input: Record<string, unknown>) => {
      if (failFinalizeOnce) { failFinalizeOnce = false; throw new Error("simulated accepted-then-persistence failure"); }
      return finalize(input);
    }) as typeof finalize;
    await assert.rejects(runner.runEligibleFollowups(replayDeps), /simulated accepted-then-persistence failure/);
    assert.equal(physicalSends, 2, "first replay-business send was accepted exactly once");
    psql(`UPDATE public.booster_followup_deliveries SET lease_until=now()-interval '1 second' WHERE business_id='${ids.businessReplay}'`);
    await runner.runEligibleFollowups(replayDeps);
    db.finalizeAtomicFollowupAccepted = finalize;
    assert.equal(physicalSends, 2, "same frozen payload/key replay returns cached acceptance without another physical send");
    assert.equal(psql(`SELECT count(*) FROM public.followup_messages WHERE visit_id='${ids.visitReplay}' AND status='sent'`), "1");
    assert.equal(psql(`SELECT provider_payload->'tags'->0->>'value' FROM public.booster_followup_deliveries WHERE visit_id='${ids.visitReplay}'`),
      psql(`SELECT id::text FROM public.booster_followup_deliveries WHERE visit_id='${ids.visitReplay}'`), "frozen provider tag correlates to its durable delivery row");
    const replayQuota = await (db.getAtomicBoosterQuota as (input: { businessId: string }) => Promise<{ usage: number; allowance: number }>)({ businessId: ids.businessReplay });
    assert.equal(replayQuota.usage, 1, "unknown reservation becomes one accepted usage count");

    // Process loss after claim but before payload preparation safely regenerates
    // content because no provider attempt occurred and no payload exists yet.
    const claim = await (db.claimAtomicFollowupDelivery as (input: { businessId: string; visitId: string }) => Promise<{ kind: string; deliveryId: string }>)({ businessId: ids.businessClaim, visitId: ids.visitClaim });
    assert.equal(claim.kind, "claimed");
    psql(`UPDATE public.booster_followup_deliveries SET lease_until=now()-interval '1 second' WHERE id='${claim.deliveryId}'`);
    const claimDeps = await makeDeps(ids.businessClaim);
    const recovered = await runner.runEligibleFollowups(claimDeps);
    assert.equal(recovered.sent, 1);
    assert.equal(physicalSends, 3);
    assert.equal(psql(`SELECT count(*) FROM public.followup_messages WHERE visit_id='${ids.visitClaim}' AND status='sent'`), "1");
  } finally {
    if (started) {
      try { execFileSync(pgExe("pg_ctl"), ["-D", dataDir, "-m", "immediate", "-w", "stop"], { stdio: "ignore" }); } catch { /* cleanup continues */ }
    }
    const safePrefix = `${testRoot}${sep}`;
    if (resolve(dir).startsWith(safePrefix)) rmSync(dir, { recursive: true, force: true });
  }
});
