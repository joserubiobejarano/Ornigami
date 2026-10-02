import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { promisify } from "node:util";
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { createServer } from "node:net";
import test from "node:test";

const root = process.cwd();
const binDir = process.env.A03_PG_BIN ?? process.env.A04_PG_BIN ?? process.env.PG_BIN;
const pgExe = (name: string) => process.platform === "win32"
  ? join(binDir ?? "C:/Program Files/PostgreSQL/17/bin", `${name}.exe`)
  : binDir ? join(binDir, name) : name;
const execFileP = promisify((await import("node:child_process")).execFile);
let port = 0;
function args(statement: string) {
  return ["-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-h", "127.0.0.1", "-p", String(port), "-U", "postgres", "-d", "postgres", "-c", statement];
}
function psqlFile(filename: string): string {
  const result = execFileSync(pgExe("psql"), ["-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-h", "127.0.0.1", "-p", String(port), "-U", "postgres", "-d", "postgres", "-f", filename], { encoding: "utf8" });
  return result.trim();
}
function psql(statement: string): string {
  return execFileSync(pgExe("psql"), args(statement), { encoding: "utf8" }).trim();
}
async function psqlAsync(statement: string): Promise<string> {
  const result = await execFileP(pgExe("psql"), args(statement), { encoding: "utf8" });
  return result.stdout.trim();
}
test("A03 billing persistence is fenced, atomic, durable and migration-idempotent on PostgreSQL", async () => {
  const portServer = createServer();
  await new Promise<void>((resolvePort, rejectPort) => {
    portServer.once("error", rejectPort);
    portServer.listen(0, "127.0.0.1", () => {
      port = (portServer.address() as { port: number }).port;
      portServer.close((error) => error ? rejectPort(error) : resolvePort());
    });
  });
  const testRoot = resolve(root, ".next");
  mkdirSync(testRoot, { recursive: true });
  const dir = mkdtempSync(join(testRoot, "a03-tests-pg-"));
  const safePrefix = `${testRoot}${sep}`;
  const dataDir = join(dir, "data");
  assert.ok(resolve(dir).startsWith(safePrefix));
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
    const files = readdirSync(migrationsDir).filter((name) => /^(?:00[1-9]|01[0-7])_.*\.sql$/.test(name)).sort();
    for (const file of files) psql(readFileSync(join(migrationsDir, file), "utf8"));
    const legacyOwner = "00000000-0000-0000-0000-000000000030";
    const legacyBusiness = "00000000-0000-0000-0000-000000000040";
    const legacyNoBusinessOwner = "00000000-0000-0000-0000-000000000029";
    psql(`INSERT INTO users(id,email) VALUES('${legacyOwner}','legacy@example.test'),('${legacyNoBusinessOwner}','legacy-nobusiness@example.test');
      INSERT INTO profiles(id,plan_type,plan_status) VALUES('${legacyOwner}','free','free');
      INSERT INTO businesses(id,owner_user_id,name,stripe_customer_id) VALUES('${legacyBusiness}','${legacyOwner}','Legacy','cus_legacy');
      INSERT INTO user_billing(user_id,stripe_customer_id) VALUES('${legacyNoBusinessOwner}','cus_legacy_without_business');`);
    const migrationPath = join(migrationsDir, "019_billing_lifecycle.sql");
    psqlFile(migrationPath);
    assert.equal(psql(`SELECT public.get_billing_trial_eligibility('${legacyBusiness}','${legacyOwner}')`), "legacy_unknown",
      "pre-019 customer mappings require trial-history reconciliation");
    assert.equal(psql(`SELECT stripe_customer_id FROM public.billing_owner_customers WHERE owner_user_id='${legacyOwner}'`), "cus_legacy",
      "unambiguous legacy business customer mapping is copied to canonical owner mapping");
    const legacyLateBusiness = "00000000-0000-0000-0000-000000000039";
    psql(`INSERT INTO profiles(id,plan_type,plan_status) VALUES('${legacyNoBusinessOwner}','free','free');
      INSERT INTO businesses(id,owner_user_id,name) VALUES('${legacyLateBusiness}','${legacyNoBusinessOwner}','Created after legacy billing');`);
    assert.equal(psql(`SELECT public.get_billing_trial_eligibility('${legacyLateBusiness}','${legacyNoBusinessOwner}')`), "legacy_unknown",
      "legacy customer history is retained even when no business existed at migration time");
    psqlFile(migrationPath);

    const owner = "00000000-0000-0000-0000-000000000031";
    const business = "00000000-0000-0000-0000-000000000041";
    const otherBusiness = "00000000-0000-0000-0000-000000000042";
    psql(`INSERT INTO users(id,email) VALUES('${owner}','a03@example.test');
      INSERT INTO profiles(id,plan_type,plan_status) VALUES('${owner}','free','free');
      INSERT INTO businesses(id,owner_user_id,name) VALUES('${business}','${owner}','A03'),('${otherBusiness}','${owner}','A03 second');
      INSERT INTO business_agents(business_id,agent_id,status) VALUES
        ('${business}','review_replies','inactive'),('${business}','review_booster','inactive'),
      ('${otherBusiness}','review_replies','inactive'),('${otherBusiness}','review_booster','inactive');`);
    const lateOwner = "00000000-0000-0000-0000-000000000032";
    const lateBusiness = "00000000-0000-0000-0000-000000000043";
    psql(`INSERT INTO users(id,email) VALUES('${lateOwner}','late@example.test');
      INSERT INTO profiles(id,plan_type,plan_status) VALUES('${lateOwner}','free','free');
      INSERT INTO businesses(id,owner_user_id,name,stripe_customer_id) VALUES('${lateBusiness}','${lateOwner}','Late mapping','cus_created_after_019');`);
    psqlFile(migrationPath);
    assert.equal(psql(`SELECT public.get_billing_trial_eligibility('${lateBusiness}','${lateOwner}')`), "eligible",
      "replaying migration 019 does not reinterpret a newly provisioned customer as legacy unknown history");

    const customerOwner = "00000000-0000-0000-0000-000000000035";
    const customerBusinessOne = "00000000-0000-0000-0000-000000000047";
    const customerBusinessTwo = "00000000-0000-0000-0000-000000000048";
    const stale = "00000000-0000-0000-0000-000000000099";
    psql(`INSERT INTO users(id,email) VALUES('${customerOwner}','frozen@example.test');
      INSERT INTO profiles(id,plan_type,plan_status) VALUES('${customerOwner}','free','free');
      INSERT INTO businesses(id,owner_user_id,name) VALUES('${customerBusinessOne}','${customerOwner}','Customer one'),('${customerBusinessTwo}','${customerOwner}','Customer two');`);
    const customerClaim = psql(`SELECT kind||'|'||email||'|'||idempotency_key||'|'||fence::text||'|'||created_at::text FROM public.claim_billing_customer_provisioning('${customerOwner}')`);
    const [customerClaimKind, frozenEmail, customerKey, customerFence, customerCreatedAt] = customerClaim.split("|");
    assert.equal(customerClaimKind, "claimed");
    psql(`UPDATE users SET email='changed-after-claim@example.test' WHERE id='${customerOwner}'`);
    const replayedCustomerClaim = psql(`SELECT kind||'|'||email||'|'||idempotency_key||'|'||fence::text||'|'||created_at::text FROM public.claim_billing_customer_provisioning('${customerOwner}')`);
    assert.equal(replayedCustomerClaim, `existing|${frozenEmail}|${customerKey}|${customerFence}|${customerCreatedAt}`,
      "owner customer retries retain the original email, idempotency key, fence and claim time");
    assert.equal(psql(`SELECT public.finalize_billing_customer_provisioning('${customerOwner}','${customerFence}','cus_canonical')`), "t");
    assert.equal(psql(`SELECT stripe_customer_id FROM billing_owner_customers WHERE owner_user_id='${customerOwner}'`), "cus_canonical");
    assert.equal(psql(`SELECT stripe_customer_id FROM user_billing WHERE user_id='${customerOwner}'`), "cus_canonical");
    assert.equal(psql(`SELECT count(*) FROM businesses WHERE owner_user_id='${customerOwner}' AND stripe_customer_id='cus_canonical'`), "2",
      "canonical customer provisioning fills all unmapped businesses atomically");
    assert.equal(psql(`SELECT public.get_billing_trial_eligibility('${customerBusinessOne}','${customerOwner}')`), "eligible",
      "new owner customer provisioning does not consume or obscure trial eligibility");
    assert.equal(psql(`SELECT public.finalize_billing_customer_provisioning('${customerOwner}','${stale}','cus_wrong')`), "f",
      "a stale customer provisioning fence cannot remap its owner");
    assert.equal(psql(`SELECT stripe_customer_id FROM billing_owner_customers WHERE owner_user_id='${customerOwner}'`), "cus_canonical");

    const conflictOwner = "00000000-0000-0000-0000-000000000036";
    psql(`INSERT INTO users(id,email) VALUES('${conflictOwner}','conflict@example.test');
      INSERT INTO profiles(id,plan_type,plan_status) VALUES('${conflictOwner}','free','free');
      INSERT INTO businesses(id,owner_user_id,name,stripe_customer_id) VALUES
        ('00000000-0000-0000-0000-000000000049','${conflictOwner}','Conflict one','cus-one'),
        ('00000000-0000-0000-0000-000000000050','${conflictOwner}','Conflict two','cus-two');`);
    assert.equal(psql(`SELECT kind FROM public.claim_billing_customer_provisioning('${conflictOwner}')`), "mapping_conflict",
      "conflicting legacy customer mappings fail closed instead of choosing one");

    const payload = `'{"metadata":{"billing_intent_token":"intent-token-1"},"mode":"subscription"}'::jsonb`;
    const claimSql = `SELECT kind||'|'||intent_id::text||'|'||idempotency_key||'|'||fence::text FROM public.claim_billing_checkout_intent(
      '${business}','${owner}','complete','annual','cus_a03','hash-one',${payload},true)`;
    const claims = await Promise.all([psqlAsync(claimSql), psqlAsync(claimSql)]);
    assert.deepEqual(claims.map((claim) => claim.split("|").slice(1)), [claims[0]?.split("|").slice(1), claims[0]?.split("|").slice(1)],
      "overlapping identical checkout claims share the durable intent and key");
    assert.deepEqual(claims.map((claim) => claim.split("|")[0]).sort(), ["claimed", "existing"]);
    const intentId = claims[0]!.split("|")[1]!;
    const fence = claims[0]!.split("|")[3]!;
    assert.throws(() => psql(`UPDATE public.billing_checkout_intents SET stripe_payload='{}'::jsonb WHERE id='${intentId}'`),
      "the database rejects mutation of an unresolved Stripe request payload");
    assert.equal(psql(`SELECT public.finish_billing_checkout_intent('${intentId}','${fence}','cs-a03','https://checkout.example.test','pending')`), "t");
    assert.equal(psql(`SELECT public.finish_billing_checkout_intent('${intentId}','${stale}','cs-stale',NULL,'uncertain')`), "f",
      "a stale checkout fence cannot overwrite the durable intent");
    const changed = psql(`SELECT kind FROM public.claim_billing_checkout_intent('${business}','${owner}','replies','monthly','cus_a03','different',${payload},false)`);
    assert.equal(changed, "conflict");
    const otherTrial = psql(`SELECT kind FROM public.claim_billing_checkout_intent('${otherBusiness}','${owner}','complete','annual','cus_a03','hash-other',${payload},true)`);
    assert.equal(otherTrial, "trial_reserved", "an owner cannot hold two pending trial checkouts across businesses");

    const firstLease = psql(`SELECT kind||'|'||fence::text FROM public.claim_billing_reconciliation_lease('${owner}','evt-old','customer.subscription.updated',60000)`);
    assert.equal(firstLease.split("|")[0], "claimed");
    const duplicateLease = psql(`SELECT kind FROM public.claim_billing_reconciliation_lease('${owner}','evt-old','customer.subscription.updated',60000)`);
    assert.equal(duplicateLease, "busy", "duplicate workers cannot share a live owner fence");
    psql(`UPDATE public.billing_reconciliation_leases SET lease_until=clock_timestamp()-interval '1 second' WHERE owner_user_id='${owner}'`);
    const replacementLease = psql(`SELECT kind||'|'||fence::text FROM public.claim_billing_reconciliation_lease('${owner}','evt-new','customer.subscription.updated',60000)`);
    assert.equal(replacementLease.split("|")[0], "claimed");
    assert.notEqual(replacementLease.split("|")[1], firstLease.split("|")[1], "expired lease acquisition gets a new fence");

    const invalidAgents = `'{"id":"sub-a03","status":"trialing","priceId":"price-a03","currentPeriodStart":"2026-10-02T00:00:00Z","currentPeriodEnd":"2026-10-16T00:00:00Z","billingIntentToken":"intent-token-1"}'::jsonb`;
    const replacementFence = replacementLease.split("|")[1]!;
    const staleApply = `SELECT public.apply_stripe_webhook_snapshot('evt-old','customer.subscription.updated','${owner}','${business}','cus_a03',
      '{"id":"sub-stale","status":"active","priceId":"price-old"}'::jsonb,'complete','annual',NULL,'${firstLease.split("|")[1]}',
      '[{"agentId":"review_replies","status":"active"},{"agentId":"review_booster","status":"active"}]'::jsonb,NULL)`;
    assert.throws(() => psql(staleApply), "an expired writer cannot commit after a successor acquires the owner lease");
    assert.equal(psql("SELECT count(*) FROM public.subscriptions WHERE id='sub-stale'"), "0");
    const badApply = `SELECT public.apply_stripe_webhook_snapshot('evt-new','customer.subscription.updated','${owner}','${business}','cus_a03',${invalidAgents},'complete','annual','2026-10-02T00:00:00Z','${replacementFence}',
      '[{"agentId":"speed_to_lead","status":"active"},{"agentId":"review_replies","status":"active"}]'::jsonb,NULL)`;
    assert.throws(() => psql(badApply));
    assert.equal(psql("SELECT status FROM public.billing_webhook_events WHERE event_id='evt-new'"), "processing",
      "a failed apply does not complete the webhook marker");
    assert.equal(psql("SELECT count(*) FROM public.subscriptions WHERE id='sub-a03'"), "0", "failed apply rolls back subscription writes");

    const goodApply = `SELECT public.apply_stripe_webhook_snapshot('evt-new','customer.subscription.updated','${owner}','${business}','cus_a03',${invalidAgents},'complete','annual','2026-10-02T00:00:00Z','${replacementFence}',
      '[{"agentId":"review_replies","status":"trialing","activatedAt":"2026-10-02T00:00:00Z"},{"agentId":"review_booster","status":"trialing","activatedAt":"2026-10-02T00:00:00Z"}]'::jsonb,NULL)`;
    // A persisted customer must not let snapshots bypass team admission's mutex.
    psql(`UPDATE businesses SET stripe_customer_id='cus_a03' WHERE id='${business}'`);
    // NO KEY UPDATE permits downstream FK KEY SHARE checks, so only an
    // explicit workspace mutation lock can explain the snapshot timeout.
    const businessLock = psqlAsync(`BEGIN; SET application_name='a00-billing-business-lock';
      SELECT id FROM businesses WHERE id='${business}' FOR NO KEY UPDATE; SELECT pg_sleep(2); COMMIT;`);
    let lockReady = false;
    for (let attempt = 0; attempt < 30; attempt++) {
      if (psql("SELECT count(*) FROM pg_stat_activity WHERE application_name='a00-billing-business-lock' AND wait_event='PgSleep'") === "1") {
        lockReady = true; break;
      }
      await new Promise(resolveWait => setTimeout(resolveWait, 25));
    }
    assert.ok(lockReady, "business mutex fixture acquired its lock");
    assert.throws(() => psql(`SET statement_timeout='150ms'; ${goodApply}`), "billing snapshots wait for team admission even with an existing customer mapping");
    assert.equal(psql("SELECT count(*) FROM subscriptions WHERE id='sub-a03'"), "0", "timed-out snapshot rolls back completely");
    await businessLock;
    psql(goodApply);
    assert.equal(psql("SELECT status FROM public.billing_webhook_events WHERE event_id='evt-new'"), "completed");
    assert.equal(psql(`SELECT count(*) FROM public.billing_trial_business_history WHERE business_id='${business}' AND state='consumed'`), "1");
    assert.equal(psql(`SELECT count(*) FROM public.billing_trial_owner_history WHERE owner_user_id='${owner}' AND state='consumed'`), "1");
    assert.equal(psql(`SELECT count(*) FROM public.business_agents WHERE business_id='${business}' AND plan_id='complete' AND billing_period='annual' AND status='trialing'`), "2");
    assert.equal(psql(`SELECT plan_type||'|'||plan_status FROM profiles WHERE id='${owner}'`), "complete|trialing");
    assert.equal(psql(`SELECT count(*) FROM billing_checkout_intents WHERE id='${intentId}' AND status='completed' AND stripe_subscription_id='sub-a03'`), "1");
    assert.equal(psql(`SELECT public.get_billing_trial_eligibility('${otherBusiness}','${owner}')`), "used", "owner history prevents trial on a second business after consumption");
    assert.equal(psql(`SELECT public.release_billing_reconciliation_lease('${owner}','evt-new','${stale}')`), "f");
    assert.equal(psql(`SELECT public.release_billing_reconciliation_lease('${owner}','evt-new','${replacementFence}')`), "t");

    const unprovenFence = psql(`SELECT fence FROM public.claim_billing_reconciliation_lease('${owner}','evt-unproven-replacement','customer.subscription.created',60000)`);
    const unprovenReplacement = `SELECT public.apply_stripe_webhook_snapshot('evt-unproven-replacement','customer.subscription.created','${owner}','${business}','cus_a03',
      '{"id":"sub-unproven","status":"active","priceId":"price-a03"}'::jsonb,'complete','annual',NULL,'${unprovenFence}',
      '[{"agentId":"review_replies","status":"active"},{"agentId":"review_booster","status":"active"}]'::jsonb,'sub-a03',NULL)`;
    assert.throws(() => psql(unprovenReplacement), "a subscription replacement cannot commit without authoritative predecessor status");
    assert.equal(psql("SELECT count(*) FROM subscriptions WHERE id='sub-unproven'"), "0");
    assert.equal(psql(`SELECT public.release_billing_reconciliation_lease('${owner}','evt-unproven-replacement','${unprovenFence}')`), "t");

    const cancelLease = psql(`SELECT fence FROM public.claim_billing_reconciliation_lease('${owner}','evt-cancel','customer.subscription.deleted',60000)`);
    const cancel = `SELECT public.apply_stripe_webhook_snapshot('evt-cancel','customer.subscription.deleted','${owner}','${business}','cus_a03',
      '{"id":"sub-a03","status":"canceled","priceId":"price-a03","billingIntentToken":"intent-token-1"}'::jsonb,'complete','annual',NULL,'${cancelLease}',
      '[{"agentId":"review_replies","status":"canceled"},{"agentId":"review_booster","status":"canceled"}]'::jsonb,'sub-a03')`;
    psql(cancel);
    assert.equal(psql(`SELECT public.release_billing_reconciliation_lease('${owner}','evt-cancel','${cancelLease}')`), "t");
    assert.equal(psql(`SELECT status FROM public.billing_checkout_intents WHERE id='${intentId}'`), "retired",
      "authoritative cancellation retires the completed checkout intent");
    assert.equal(psql(`SELECT count(*) FROM public.billing_trial_owner_history WHERE owner_user_id='${owner}' AND state='consumed'`), "1",
      "cancellation never restores trial eligibility");
    assert.equal(psql(`SELECT plan_type||'|'||plan_status||'|'||COALESCE(plan_current_period_end::text,'null') FROM profiles WHERE id='${owner}'`), "free|canceled|null",
      "cancellation resets the legacy profile mirror when no other business remains paid");
    const paidRetry = psql(`SELECT kind||'|'||intent_id::text FROM public.claim_billing_checkout_intent('${business}','${owner}','complete','annual','cus_a03','hash-paid',${payload},false)`);
    assert.equal(paidRetry.split("|")[0], "claimed", "a paid recheckout is allowed after cancellation is reconciled");
    const paidIntentId = paidRetry.split("|")[1]!;
    const replacementEventFence = psql(`SELECT fence FROM public.claim_billing_reconciliation_lease('${owner}','evt-replacement','customer.subscription.created',60000)`);
    psql(`SELECT public.apply_stripe_webhook_snapshot('evt-replacement','customer.subscription.created','${owner}','${business}','cus_a03',
      '{"id":"sub-replacement","status":"active","priceId":"price-a03","billingIntentToken":"intent-token-1"}'::jsonb,'complete','annual',NULL,'${replacementEventFence}',
      '[{"agentId":"review_replies","status":"active"},{"agentId":"review_booster","status":"active"}]'::jsonb,'sub-a03','canceled')`);
    assert.equal(psql("SELECT status FROM subscriptions WHERE id='sub-a03'"), "canceled", "a proven terminal predecessor mirror is updated atomically");
    assert.equal(psql("SELECT status FROM subscriptions WHERE id='sub-replacement'"), "active");
    assert.equal(psql(`SELECT status FROM billing_checkout_intents WHERE id='${paidIntentId}'`), "completed");

    const newOwner = "00000000-0000-0000-0000-000000000034";
    const ownerRenewedBusiness = "00000000-0000-0000-0000-000000000045";
    psql(`INSERT INTO users(id,email) VALUES('${newOwner}','transfer@example.test');
      INSERT INTO profiles(id,plan_type,plan_status) VALUES('${newOwner}','free','free');
      INSERT INTO businesses(id,owner_user_id,name) VALUES('${ownerRenewedBusiness}','${newOwner}','Owner B business');
      UPDATE public.businesses SET owner_user_id='${newOwner}' WHERE id='${business}';`);
    assert.equal(psql(`SELECT public.get_billing_trial_eligibility('${business}','${newOwner}')`), "used",
      "business trial history survives ownership transfer");
    assert.equal(psql(`SELECT public.get_billing_trial_eligibility('${ownerRenewedBusiness}','${owner}')`), "used",
      "owner trial history follows the original owner to another business");
    const deleteBusiness = "00000000-0000-0000-0000-000000000046";
    psql(`INSERT INTO public.businesses(id,owner_user_id,name) VALUES('${deleteBusiness}','${newOwner}','Business to delete');`);
    const ownerBLease = psql(`SELECT fence FROM public.claim_billing_reconciliation_lease('${newOwner}','evt-owner-b-trial','customer.subscription.updated',60000)`);
    psql(`SELECT public.apply_stripe_webhook_snapshot('evt-owner-b-trial','customer.subscription.updated','${newOwner}','${deleteBusiness}','cus_owner_b',
      '{"id":"sub-owner-b","status":"trialing","priceId":"price-booster-monthly"}'::jsonb,'booster','monthly','2026-10-02T00:00:00Z','${ownerBLease}',
      '[{"agentId":"review_replies","status":"inactive"},{"agentId":"review_booster","status":"trialing"}]'::jsonb,NULL)`);
    assert.equal(psql(`SELECT public.release_billing_reconciliation_lease('${newOwner}','evt-owner-b-trial','${ownerBLease}')`), "t");
    psql(`DELETE FROM public.businesses WHERE id='${deleteBusiness}'`);
    assert.equal(psql(`SELECT public.get_billing_trial_eligibility('${ownerRenewedBusiness}','${newOwner}')`), "used",
      "owner trial history survives deletion of the business where the trial started");
    psql(`DELETE FROM public.users WHERE id='${owner}'`);
    assert.equal(psql(`SELECT public.get_billing_trial_eligibility('${ownerRenewedBusiness}','${newOwner}')`), "used",
      "new owner's independent trial history remains after its original business is deleted");
    assert.equal(psql(`SELECT count(*) FROM public.billing_trial_owner_history WHERE owner_user_id='${owner}'`), "0",
      "personal trial history is deleted with its owner account");
    assert.equal(psql(`SELECT count(*) FROM public.billing_trial_business_history WHERE business_id='${business}' AND state='consumed'`), "1",
      "business history remains after original owner deletion");

    const rollbackOwner = "00000000-0000-0000-0000-000000000033";
    const rollbackBusiness = "00000000-0000-0000-0000-000000000044";
    psql(`INSERT INTO users(id,email) VALUES('${rollbackOwner}','rollback@example.test');
      INSERT INTO profiles(id,plan_type,plan_status) VALUES('${rollbackOwner}','free','free');
      INSERT INTO businesses(id,owner_user_id,name) VALUES('${rollbackBusiness}','${rollbackOwner}','Rollback');
      INSERT INTO business_agents(business_id,agent_id,status) VALUES('${rollbackBusiness}','review_replies','inactive'),('${rollbackBusiness}','review_booster','inactive');
      DELETE FROM profiles WHERE id='${rollbackOwner}';`);
    const rollbackLease = psql(`SELECT fence FROM public.claim_billing_reconciliation_lease('${rollbackOwner}','evt-rollback','customer.subscription.updated',60000)`);
    const rollbackApply = `SELECT public.apply_stripe_webhook_snapshot('evt-rollback','customer.subscription.updated','${rollbackOwner}','${rollbackBusiness}','cus_rollback',
      '{"id":"sub-rollback","status":"active","priceId":"price-a03"}'::jsonb,'replies','monthly',NULL,'${rollbackLease}',
      '[{"agentId":"review_replies","status":"active"},{"agentId":"review_booster","status":"inactive"}]'::jsonb,NULL)`;
    assert.throws(() => psql(rollbackApply), "failure after subscription upsert must roll back all local writes");
    assert.equal(psql("SELECT count(*) FROM public.subscriptions WHERE id='sub-rollback'"), "0");
    assert.equal(psql("SELECT status FROM public.billing_webhook_events WHERE event_id='evt-rollback'"), "processing");
  } finally {
    if (started) execFileSync(pgExe("pg_ctl"), ["-D", dataDir, "-m", "immediate", "-w", "stop"], { stdio: "ignore" });
    const resolvedDir = resolve(dir);
    if (resolvedDir.startsWith(safePrefix)) rmSync(resolvedDir, { recursive: true, force: true });
  }
});
