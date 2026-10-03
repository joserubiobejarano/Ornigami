import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import test from "node:test";
import { loadTs } from "./auth-test-harness.mts";

const root = process.cwd();
const port = 55406;
const binDir = process.env.A06_PG_BIN ?? process.env.A08_PG_BIN ?? process.env.A04_PG_BIN ?? process.env.PG_BIN;
const pgExe = (name: string) => process.platform === "win32"
  ? join(binDir ?? "C:/Program Files/PostgreSQL/17/bin", `${name}.exe`)
  : binDir ? join(binDir, name) : name;
const quote = (value: unknown) => value == null ? "NULL" : `'${String(value).replaceAll("'", "''")}'`;

function psql(statement: string): string {
  return execFileSync(pgExe("psql"), ["-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-h", "127.0.0.1", "-p", String(port), "-U", "postgres", "-d", "postgres", "-f", "-"], {
    encoding: "utf8", input: statement,
  }).trim();
}

function psqlAsync(statement: string): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(pgExe("psql"), ["-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-h", "127.0.0.1", "-p", String(port), "-U", "postgres", "-d", "postgres", "-f", "-"], { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk: string) => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => { stderr += chunk; });
    child.once("error", reject);
    child.stdin.end(statement);
    child.once("close", (code) => code === 0 ? resolvePromise(stdout.trim()) : reject(new Error(`psql exited ${code}: ${stderr}`)));
  });
}

function sqlExecutor() {
  return async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const query = strings.reduce((output, part, index) => output + part + (index < values.length ? quote(values[index]) : ""), "");
    const output = await psqlAsync(`SELECT row_to_json(a06_query)::text FROM (${query}) a06_query;`);
    return output ? output.split(/\r?\n/).map((line) => JSON.parse(line) as Record<string, unknown>) : [];
  };
}

function id(n: number) { return `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`; }
test("A06 delivery and quota SQL fences claims, month usage, recovery and suppression on PostgreSQL 17", async () => {
  const nextDir = resolve(root, ".next");
  mkdirSync(nextDir, { recursive: true });
  const dir = mkdtempSync(join(nextDir, "a06-booster-pg-"));
  assert.ok(resolve(dir).startsWith(`${nextDir}${sep}`));
  const dataDir = join(dir, "data");
  let started = false;
  try {
    execFileSync(pgExe("initdb"), ["-D", dataDir, "-U", "postgres", "-A", "trust", "--no-locale", "--encoding=UTF8"], { stdio: "ignore" });
    appendFileSync(join(dataDir, "postgresql.conf"), "\nunix_socket_directories = ''\n");
    const logFile = join(dir, "postgres.log");
    try {
      execFileSync(pgExe("pg_ctl"), ["-D", dataDir, "-l", logFile, "-o", `-h 127.0.0.1 -p ${port} -F`, "-w", "start"], { stdio: "ignore" });
    } catch (error) {
      throw new Error(`Disposable PostgreSQL startup failed:\n${existsSync(logFile) ? readFileSync(logFile, "utf8") : "No PostgreSQL log"}`, { cause: error });
    }
    started = true;
    const migrationsDir = join(root, "neon/migrations");
    const migrations = readdirSync(migrationsDir).filter((name) => /^\d{3}_.+\.sql$/.test(name)).sort((a, b) => Number(a.slice(0, 3)) - Number(b.slice(0, 3)));
    for (const migration of migrations.filter((name) => Number(name.slice(0, 3)) < 22)) psql(readFileSync(join(migrationsDir, migration), "utf8"));

    const legacyOwner = id(899);
    const legacyBusiness = id(898);
    const legacyVisit = id(897);
    psql(`INSERT INTO public.users(id,email) VALUES('${legacyOwner}','a06-legacy@example.test');
      INSERT INTO public.businesses(id,owner_user_id,name,google_review_url) VALUES('${legacyBusiness}','${legacyOwner}','Legacy A06','https://example.test/reviews');
      INSERT INTO public.business_agents(business_id,agent_id,plan_id,status) VALUES('${legacyBusiness}','review_booster','booster','active');
      INSERT INTO public.followup_visits(id,business_id,customer_email,visited_at,followup_status,followup_sent_at)
        VALUES('${legacyVisit}','${legacyBusiness}','legacy@example.test',now()-interval '1 day','pending',NULL);
      INSERT INTO public.followup_messages(visit_id,business_id,status,sent_at)
        VALUES('${legacyVisit}','${legacyBusiness}','sent',now());`);
    psql(readFileSync(join(migrationsDir, "022_booster_delivery_quotas.sql"), "utf8"));
    for (const migration of migrations.filter((name) => Number(name.slice(0, 3)) > 22)) psql(readFileSync(join(migrationsDir, migration), "utf8"));
    psql(readFileSync(join(root, "docs/tasks/A11_ACTIVATION_LIFECYCLE.sql"), "utf8"));
    psql(readFileSync(join(root, "docs/tasks/A11_ACTIVATION_BOOSTER.sql"), "utf8"));

    const owner = id(900);
    const biz = id(901);
    const visits = [id(910), id(911), id(912), id(913), id(914), id(915), id(916), id(917), id(918), id(919)];
    psql(`INSERT INTO public.users(id,email) VALUES('${owner}','a06@example.test');
      INSERT INTO public.businesses(id,owner_user_id,name,google_review_url) VALUES('${biz}','${owner}','A06 Fixture','https://example.test/reviews');
      INSERT INTO public.business_agents(business_id,agent_id,plan_id,status,billing_period)
        VALUES('${biz}','review_booster','booster','active','annual');
      INSERT INTO public.followup_visits(id,business_id,customer_name,customer_email,visited_at,followup_status)
        VALUES ${visits.slice(0, 2).map((visitId, index) => `('${visitId}','${biz}','Customer ${index}','person${index}@example.test',now()-interval '1 day','pending')`).join(",")};`);

    const sql = sqlExecutor();
    const db = loadTs<typeof import("../src/modules/review-booster/services/atomic-followup-db.service.js")>(
      "src/modules/review-booster/services/atomic-followup-db.service.ts", { overrides: { "@/lib/db/neon": { sql } } });
    const reviewDb = loadTs<typeof import("../src/modules/review-booster/services/review-booster-db.service.js")>(
      "src/modules/review-booster/services/review-booster-db.service.ts", {
        overrides: {
          "@/lib/api-security": { HttpError: class extends Error { status: number; constructor(status: number, message: string) { super(message); this.status = status; } } },
          "@/lib/db/neon": { sql },
          "@/lib/billing/plans": { PLANS: { booster: { monthlyRequestAllowance: 500 }, complete: { monthlyRequestAllowance: 1500 } }, isPlanId: (value: unknown) => value === "booster" || value === "complete" },
          "@/lib/followup-retry-policy": { MAX_FOLLOWUP_ATTEMPTS: 3 },
        },
      });
    const month = psql("SELECT date_trunc('month',now() AT TIME ZONE 'UTC')::date::text");

    const oldAccepted = await db.claimAtomicFollowupDelivery({ businessId: legacyBusiness, visitId: legacyVisit });
    assert.equal(oldAccepted.kind, "existing");
    assert.equal(psql(`SELECT followup_status FROM public.followup_visits WHERE id='${legacyVisit}'`), "sent");
    assert.equal((await db.getAtomicBoosterQuota({ businessId: legacyBusiness })).usage, 1);

    // Exact remaining-slot contention: only one of two simultaneous claims may
    // reserve the final slot, and the annual billing interval does not matter.
    psql(`INSERT INTO public.booster_quota_legacy_usage(business_id,month_start,accepted_count) VALUES('${biz}','${month}',499);`);
    const [claimA, claimB] = await Promise.all([
      db.claimAtomicFollowupDelivery({ businessId: biz, visitId: visits[0]! }),
      db.claimAtomicFollowupDelivery({ businessId: biz, visitId: visits[1]! }),
    ]);
    assert.deepEqual([claimA.kind, claimB.kind].sort(), ["claimed", "quota_exhausted"].sort());
    assert.equal((await db.getAtomicBoosterQuota({ businessId: biz })).usage, 500);
    assert.equal((await db.getAtomicBoosterQuota({ businessId: biz })).allowance, 500);

    // Start a second workspace for payload, replay, rejection, suppression and
    // entitlement transitions without touching the full-quota fixture.
    const recoveryBiz = id(902);
    psql(`INSERT INTO public.businesses(id,owner_user_id,name,google_review_url) VALUES('${recoveryBiz}','${owner}','Recovery Fixture','https://example.test/reviews');
      INSERT INTO public.business_agents(business_id,agent_id,plan_id,status,billing_period)
        VALUES('${recoveryBiz}','review_booster','complete','trialing','monthly');
      INSERT INTO public.followup_visits(id,business_id,customer_email,visited_at,followup_status)
        VALUES ${visits.slice(2).map((visitId, index) => `('${visitId}','${recoveryBiz}','recovery${index}@example.test',now()-interval '1 day','pending')`).join(",")};`);
    const actor = id(920);
    psql(`INSERT INTO public.users(id,email) VALUES('${actor}','a06-member@example.test');
      INSERT INTO public.business_members(business_id,user_id,role) VALUES('${recoveryBiz}','${actor}','member');`);
    const payload = (to: string) => ({ from: "A06 <hello@example.test>", to, reply_to: "reply@example.test", subject: "Thanks", text: "Please review https://example.test/reviews", html: "<p>Review</p>", headers: { "List-Unsubscribe": "<https://example.test/unsub>" } });

    const first = await db.claimAtomicFollowupDelivery({ businessId: recoveryBiz, visitId: visits[2]! });
    assert.equal(first.kind, "claimed");
    assert.ok(first.deliveryId && first.fence && first.idempotencyKey);
    const frozen = payload("recovery0@example.test");
    assert.equal(await db.persistAtomicFollowupPayload({ deliveryId: first.deliveryId!, fence: first.fence!, payload: frozen, reviewUrl: "https://example.test/reviews" }), true);
    const begin = await db.beginAtomicFollowupSend({ deliveryId: first.deliveryId!, fence: first.fence! });
    assert.equal(begin.kind, "send");
    if (begin.kind !== "send") throw new Error("expected send authorization");
    assert.deepEqual(begin.payload, frozen);
    assert.equal(await db.markAtomicFollowupUnknown({ deliveryId: first.deliveryId!, fence: first.fence!, error: "provider response lost" }), true);
    const recentAfterUnknown = await reviewDb.getRecentVisits(recoveryBiz, 50);
    const unknownVisit = recentAfterUnknown.find((visit) => visit.id === visits[2]);
    assert.equal(unknownVisit?.followup_status, "unknown");
    assert.equal(unknownVisit?.error_reason, "provider response lost");
    psql(`UPDATE public.booster_followup_deliveries SET lease_until=now()-interval '1 second' WHERE id='${first.deliveryId}';`);
    const replay = await db.claimAtomicFollowupDelivery({ businessId: recoveryBiz, visitId: visits[2]! });
    assert.equal(replay.kind, "recovery");
    assert.deepEqual(replay.payload, frozen);
    assert.equal(replay.idempotencyKey, first.idempotencyKey);
    assert.equal(replay.firstAttemptAt, begin.firstAttemptAt);
    assert.equal((await db.beginAtomicFollowupSend({ deliveryId: first.deliveryId!, fence: first.fence! })).kind, "stale");
    assert.equal(await db.markAtomicFollowupUnknown({ deliveryId: first.deliveryId!, fence: first.fence!, error: "stale worker" }), false);
    assert.equal(await db.releaseAtomicFollowupDelivery({ deliveryId: first.deliveryId!, fence: first.fence!, outcome: "rejected", error: "stale worker" }), false);
    assert.equal(await db.finalizeAtomicFollowupAccepted({ deliveryId: first.deliveryId!, fence: replay.fence!, providerMessageId: "resend-a06-1", subject: frozen.subject, body: frozen.text }), true);
    assert.equal(psql(`SELECT count(*) FROM public.followup_messages WHERE visit_id='${visits[2]}' AND lower(status)='sent'`), "1");
    const usageCompatibility = await reviewDb.getReviewBoosterBillingPeriodUsage(recoveryBiz);
    assert.equal(usageCompatibility.sent, 1);
    assert.equal(usageCompatibility.used, 1);
    assert.equal(usageCompatibility.reserved, 0);
    assert.equal(usageCompatibility.allowance, 1500);

    // Accepted database finalization is idempotent; legacy accepted messages
    // are reconciled as sent before a new claim can be made.
    assert.equal(await db.finalizeAtomicFollowupAccepted({ deliveryId: first.deliveryId!, fence: replay.fence!, providerMessageId: "resend-a06-1", subject: frozen.subject, body: frozen.text }), false);
    const legacy = await db.claimAtomicFollowupDelivery({ businessId: legacyBusiness, visitId: legacyVisit });
    assert.equal(legacy.kind, "existing");
    assert.equal(psql(`SELECT followup_status FROM public.followup_visits WHERE id='${legacyVisit}'`), "sent");
    const crossBusiness = await db.claimAtomicFollowupDelivery({ businessId: biz, visitId: visits[3]! });
    assert.equal(crossBusiness.kind, "ineligible");
    assert.equal(psql(`SELECT followup_status FROM public.followup_visits WHERE id='${visits[3]}' AND business_id='${recoveryBiz}'`), "pending");

    // Explicit first-attempt rejection releases quota and can reclaim the same
    // stable delivery key after backoff. A later replay rejection cannot release.
    const rejected = await db.claimAtomicFollowupDelivery({ businessId: recoveryBiz, visitId: visits[4]! });
    assert.equal(rejected.kind, "claimed");
    const rejectionPayload = payload("recovery2@example.test");
    assert.equal(await db.persistAtomicFollowupPayload({ deliveryId: rejected.deliveryId!, fence: rejected.fence!, payload: rejectionPayload, reviewUrl: "https://example.test/reviews" }), true);
    const rejectionBegin = await db.beginAtomicFollowupSend({ deliveryId: rejected.deliveryId!, fence: rejected.fence! });
    assert.equal(rejectionBegin.kind, "send");
    assert.equal(await db.releaseAtomicFollowupDelivery({ deliveryId: rejected.deliveryId!, fence: rejected.fence!, outcome: "rejected", error: "HTTP 400" }), true);
    assert.equal((await db.getAtomicBoosterQuota({ businessId: recoveryBiz })).usage, 1);
    psql(`UPDATE public.followup_visits SET next_attempt_at=now()-interval '1 second' WHERE id='${visits[4]}'; UPDATE public.booster_followup_deliveries SET lease_until=now()-interval '1 second' WHERE id='${rejected.deliveryId}';`);
    const rejectionRetry = await db.claimAtomicFollowupDelivery({ businessId: recoveryBiz, visitId: visits[4]! });
    assert.equal(rejectionRetry.kind, "recovery");
    assert.equal(rejectionRetry.idempotencyKey, rejected.idempotencyKey);
    assert.equal(await db.beginAtomicFollowupSend({ deliveryId: rejected.deliveryId!, fence: rejectionRetry.fence! }).then((result) => result.kind), "send");
    assert.equal(await db.markAtomicFollowupUnknown({ deliveryId: rejected.deliveryId!, fence: rejectionRetry.fence! }), true);
    assert.equal(await db.releaseAtomicFollowupDelivery({ deliveryId: rejected.deliveryId!, fence: rejectionRetry.fence!, outcome: "rejected", error: "replay 400" }), false);

    // Unknown results past Resend's retention horizon become reconciliation and
    // keep the slot. Suppression or setting changes before send are rechecked.
    psql(`UPDATE public.booster_followup_deliveries SET first_attempt_at=now()-interval '24 hours',lease_until=now()-interval '1 second' WHERE id='${rejected.deliveryId}';`);
    const agedUnknown = await db.claimAtomicFollowupDelivery({ businessId: recoveryBiz, visitId: visits[4]! });
    assert.equal(agedUnknown.kind, "reconciliation_required");
    const held = await db.getAtomicBoosterQuota({ businessId: recoveryBiz });
    assert.ok(held.usage >= 2);

    const actorClaim = await db.claimAtomicFollowupDelivery({ businessId: recoveryBiz, visitId: visits[5]! });
    assert.equal(actorClaim.kind, "claimed");
    const actorPayload = payload("recovery3@example.test");
    assert.equal(await db.persistAtomicFollowupPayload({ deliveryId: actorClaim.deliveryId!, fence: actorClaim.fence!, payload: actorPayload, reviewUrl: "https://example.test/reviews" }), true);
    psql(`DELETE FROM public.business_members WHERE business_id='${recoveryBiz}' AND user_id='${actor}';`);
    assert.equal((await db.beginAtomicFollowupSend({ deliveryId: actorClaim.deliveryId!, fence: actorClaim.fence!, actorUserId: actor })).kind, "actor_denied");
    assert.equal(psql(`SELECT state FROM public.booster_followup_deliveries WHERE id='${actorClaim.deliveryId}'`), "prepared");
    assert.equal((await db.beginAtomicFollowupSend({ deliveryId: actorClaim.deliveryId!, fence: actorClaim.fence! })).kind, "send");
    assert.equal(await db.markAtomicFollowupUnknown({ deliveryId: actorClaim.deliveryId!, fence: actorClaim.fence!, error: "test unresolved" }), true);

    const generatorCrash = await db.claimAtomicFollowupDelivery({ businessId: recoveryBiz, visitId: visits[7]! });
    assert.equal(generatorCrash.kind, "claimed");
    psql(`UPDATE public.booster_followup_deliveries SET lease_until=now()-interval '1 second' WHERE id='${generatorCrash.deliveryId}';`);
    const generatorRecovery = await db.claimAtomicFollowupDelivery({ businessId: recoveryBiz, visitId: visits[7]! });
    assert.equal(generatorRecovery.kind, "claimed");
    assert.equal(generatorRecovery.idempotencyKey, generatorCrash.idempotencyKey);
    assert.equal(generatorRecovery.payload, null);
    assert.equal(await db.releaseAtomicFollowupDelivery({ deliveryId: generatorRecovery.deliveryId!, fence: generatorRecovery.fence!, outcome: "generation_failed", error: "generator unavailable" }), true);
    psql(`UPDATE public.followup_visits SET attempt_count=3,next_attempt_at=now()-interval '1 second' WHERE id='${visits[7]}';
      UPDATE public.booster_followup_deliveries SET lease_until=now()-interval '1 second' WHERE id='${generatorRecovery.deliveryId}';`);
    assert.equal((await db.claimAtomicFollowupDelivery({ businessId: recoveryBiz, visitId: visits[7]! })).kind, "expired");

    const rollover = await db.claimAtomicFollowupDelivery({ businessId: recoveryBiz, visitId: visits[8]! });
    assert.equal(rollover.kind, "claimed");
    assert.equal(await db.persistAtomicFollowupPayload({ deliveryId: rollover.deliveryId!, fence: rollover.fence!, payload: payload("recovery6@example.test"), reviewUrl: "https://example.test/reviews" }), true);
    const priorMonth = psql("SELECT (date_trunc('month',now() AT TIME ZONE 'UTC') - interval '1 month')::date::text");
    psql(`UPDATE public.booster_followup_deliveries SET reservation_month='${priorMonth}' WHERE id='${rollover.deliveryId}';`);
    assert.equal((await db.beginAtomicFollowupSend({ deliveryId: rollover.deliveryId!, fence: rollover.fence! })).kind, "send");
    assert.equal(psql(`SELECT reservation_month::text FROM public.booster_followup_deliveries WHERE id='${rollover.deliveryId}'`), month);
    assert.equal(await db.releaseAtomicFollowupDelivery({ deliveryId: rollover.deliveryId!, fence: rollover.fence!, outcome: "rejected", error: "test boundary cleanup" }), true);

    const suppressed = await db.claimAtomicFollowupDelivery({ businessId: recoveryBiz, visitId: visits[6]! });
    assert.equal(suppressed.kind, "claimed");
    const suppressedPayload = payload("recovery4@example.test");
    assert.equal(await db.persistAtomicFollowupPayload({ deliveryId: suppressed.deliveryId!, fence: suppressed.fence!, payload: suppressedPayload, reviewUrl: "https://example.test/reviews" }), true);
    psql(`INSERT INTO public.followup_unsubscribes(business_id,customer_email,reason) VALUES('${recoveryBiz}','recovery4@example.test','test');`);
    assert.equal((await db.beginAtomicFollowupSend({ deliveryId: suppressed.deliveryId!, fence: suppressed.fence! })).kind, "non_sendable");
    assert.equal(psql(`SELECT count(*) FROM public.booster_followup_deliveries WHERE id='${suppressed.deliveryId}' AND state='non_sendable'`), "1");

    // Entitlement changes preserve used counts and fail closed; UTC month
    // accounting is independent from Stripe's monthly/annual billing period.
    psql(`UPDATE public.business_agents SET plan_id='complete',billing_period='annual' WHERE business_id='${recoveryBiz}' AND agent_id='review_booster';`);
    assert.equal((await db.getAtomicBoosterQuota({ businessId: recoveryBiz })).allowance, 1500);
    psql(`UPDATE public.business_agents SET plan_id='booster' WHERE business_id='${recoveryBiz}' AND agent_id='review_booster';`);
    assert.equal((await db.getAtomicBoosterQuota({ businessId: recoveryBiz })).allowance, 500);
    psql(`UPDATE public.business_agents SET plan_id=NULL WHERE business_id='${recoveryBiz}' AND agent_id='review_booster';`);
    assert.equal((await db.getAtomicBoosterQuota({ businessId: recoveryBiz })).allowance, 0);
    const usedBeforeNullPlan = (await db.getAtomicBoosterQuota({ businessId: recoveryBiz })).usage;
    const noEntitlement = await db.claimAtomicFollowupDelivery({ businessId: recoveryBiz, visitId: visits[9]! });
    assert.equal(noEntitlement.kind, "ineligible");
    assert.equal((await db.getAtomicBoosterQuota({ businessId: recoveryBiz })).usage, usedBeforeNullPlan);

    const prevMonth = psql("SELECT (date_trunc('month',now() AT TIME ZONE 'UTC') - interval '1 month')::date::text");
    psql(`INSERT INTO public.booster_quota_legacy_usage(business_id,month_start,accepted_count) VALUES('${recoveryBiz}','${prevMonth}',400) ON CONFLICT(business_id,month_start) DO UPDATE SET accepted_count=400;`);
    assert.equal((await db.getAtomicBoosterQuota({ businessId: recoveryBiz, monthStart: prevMonth })).usage, 400);
    assert.equal((await db.getAtomicBoosterQuota({ businessId: recoveryBiz })).usage, usedBeforeNullPlan);

    // Replaying migration 022 after the first A06 send must not copy its sent
    // message mirror into the legacy baseline and charge it twice.
    const beforeReplay = Number(psql(`SELECT usage FROM public.booster_monthly_quota('${recoveryBiz}')`));
    psql(readFileSync(join(migrationsDir, "022_booster_delivery_quotas.sql"), "utf8"));
    psql(readFileSync(join(root, "docs/tasks/A11_ACTIVATION_BOOSTER.sql"), "utf8"));
    assert.equal(Number(psql(`SELECT usage FROM public.booster_monthly_quota('${recoveryBiz}')`)), beforeReplay);

    const lifecycle = loadTs<typeof import("../src/lib/account-lifecycle.js")>("src/lib/account-lifecycle.ts", { overrides: { "@/lib/db/neon": { sql } } });
    const generationLease = await lifecycle.beginAccountLifecycleOperation({ userId: owner, businessId: biz, kind: "booster_generation", idempotencyKey: "delivery-lease:attempt-1", leaseMs: 45_000 });
    assert.equal(generationLease.result, "claimed", "active owner receives a fenced generation lease");
    assert.ok(generationLease.token);
    assert.equal(await lifecycle.finishAccountLifecycleOperation(generationLease.token!, "done"), true);

    // A11 freezes candidate PII reads, delivery claims and provider admission.
    const freezeBiz = id(951);
    const frozenVisit = id(950);
    psql(`INSERT INTO public.businesses(id,owner_user_id,name,google_review_url) VALUES('${freezeBiz}','${owner}','Freeze Test','https://example.test/reviews');
      INSERT INTO public.business_agents(business_id,agent_id,plan_id,status) VALUES('${freezeBiz}','review_booster','booster','active');
      INSERT INTO public.followup_visits(id,business_id,customer_email,visited_at,followup_status)
        VALUES('${frozenVisit}','${freezeBiz}','frozen@example.test',now()-interval '1 day','pending');`);
    const lateOwner = id(960), lateBiz = id(961), lateVisit = id(962), lateActor = id(963);
    psql(`INSERT INTO public.users(id,email) VALUES('${lateOwner}','late-freeze@example.test'),('${lateActor}','late-actor@example.test');
      INSERT INTO public.businesses(id,owner_user_id,name,google_review_url) VALUES('${lateBiz}','${lateOwner}','Late Freeze','https://example.test/reviews');
      INSERT INTO public.business_agents(business_id,agent_id,plan_id,status) VALUES('${lateBiz}','review_booster','booster','active');
      INSERT INTO public.business_members(business_id,user_id,role) VALUES('${lateBiz}','${lateActor}','member');
      INSERT INTO public.followup_visits(id,business_id,customer_email,visited_at,followup_status)
        VALUES('${lateVisit}','${lateBiz}','late@example.test',now()-interval '1 day','pending');`);
    const lateClaim = await db.claimAtomicFollowupDelivery({ businessId: lateBiz, visitId: lateVisit });
    assert.equal(lateClaim.kind, "claimed");
    assert.ok(await db.persistAtomicFollowupPayload({
      deliveryId: lateClaim.deliveryId!, fence: lateClaim.fence!,
      payload: { from: "Studio <sender@example.test>", to: "late@example.test", reply_to: "sender@example.test", subject: "sensitive subject", text: "sensitive body", html: "<p>sensitive body</p>" },
      reviewUrl: "https://example.test/reviews",
    }));
    const lateSend = await db.beginAtomicFollowupSend({ deliveryId: lateClaim.deliveryId!, fence: lateClaim.fence!, actorUserId: lateActor });
    assert.equal(lateSend.kind, "send");
    psql(`UPDATE public.users SET privacy_deletion_requested_at=now() WHERE id='${lateActor}';`);
    assert.equal(psql(`SELECT count(*) FROM public.booster_followup_deliveries d JOIN public.businesses b ON b.id=d.business_id
      WHERE (b.owner_user_id='${lateActor}' OR d.actor_user_id='${lateActor}') AND d.state IN ('sending','unknown','reconciliation_required')`), "1",
      "member deletion sees the admitted native send through durable actor attribution");
    assert.equal(await db.finalizeAtomicFollowupAccepted({ deliveryId: lateClaim.deliveryId!, fence: null as unknown as string, providerMessageId: "wrong-fence", subject: "sensitive subject", body: "sensitive body" }), false, "NULL cannot finalize a fenced accepted send");
    assert.equal(await db.markAtomicFollowupUnknown({ deliveryId: lateClaim.deliveryId!, fence: null as unknown as string, error: "must not close" }), false, "NULL cannot mark an admitted send unknown");
    assert.ok(await db.finalizeAtomicFollowupAccepted({ deliveryId: lateClaim.deliveryId!, fence: lateClaim.fence!, providerMessageId: "resend-known", subject: "sensitive subject", body: "sensitive body" }));
    assert.equal(psql(`SELECT count(*) FROM public.followup_messages WHERE visit_id='${lateVisit}'`), "0", "post-freeze acceptance does not create PII message history");
    assert.equal(psql(`SELECT state||'|'||(provider_payload IS NULL)::text||'|'||provider_message_id FROM public.booster_followup_deliveries WHERE id='${lateClaim.deliveryId}'`), "accepted|true|resend-known");

    const preFreezeClaim = await db.claimAtomicFollowupDelivery({ businessId: freezeBiz, visitId: frozenVisit });
    assert.equal(preFreezeClaim.kind, "claimed");
    assert.ok(await db.persistAtomicFollowupPayload({
      deliveryId: preFreezeClaim.deliveryId!, fence: preFreezeClaim.fence!,
      payload: { from: "Studio <sender@example.test>", to: "frozen@example.test", reply_to: "sender@example.test", subject: "s", text: "t", html: "h" },
      reviewUrl: "https://example.test/reviews",
    }));
    psql(`UPDATE public.users SET privacy_deletion_requested_at=now() WHERE id='${owner}';`);
    assert.equal((await db.listAtomicFollowupCandidates({ businessId: freezeBiz })).length, 0, "candidate PII is not returned after owner freeze");
    assert.equal((await db.claimAtomicFollowupDelivery({ businessId: freezeBiz, visitId: frozenVisit })).kind, "ineligible", "no quota reservation is admitted after freeze");
    assert.equal(await db.releaseAtomicFollowupDelivery({ deliveryId: preFreezeClaim.deliveryId!, fence: null as unknown as string, outcome: "generation_failed" }), false, "NULL cannot release a frozen delivery fence");
    assert.equal((await db.beginAtomicFollowupSend({ deliveryId: preFreezeClaim.deliveryId!, fence: preFreezeClaim.fence! })).kind, "actor_denied", "Resend admission is denied after owner freeze");
    assert.equal(psql(`SELECT count(*) FROM public.booster_followup_deliveries WHERE visit_id='${frozenVisit}' AND state='prepared'`), "1", "denied send leaves the frozen durable payload for privacy cleanup");
    assert.equal((await lifecycle.beginAccountLifecycleOperation({ userId: owner, businessId: freezeBiz, kind: "booster_generation:test", idempotencyKey: "frozen", leaseMs: 45_000 })).result, "frozen");
  } finally {
    if (started) {
      try { execFileSync(pgExe("pg_ctl"), ["-D", dataDir, "-m", "fast", "-w", "stop"], { stdio: "ignore" }); } catch { /* isolated test server is already stopped */ }
    }
    const resolved = resolve(dir);
    assert.ok(resolved.startsWith(`${nextDir}${sep}`), "test cleanup remains inside the isolated .next directory");
    rmSync(resolved, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
});
