import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { promisify } from "node:util";
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { createServer } from "node:net";
import test from "node:test";

const root = process.cwd();
const binDir = process.env.A11_PG_BIN ?? process.env.A04_PG_BIN ?? process.env.PG_BIN;
const pgExe = (name: string) => process.platform === "win32"
  ? join(binDir ?? "C:/Program Files/PostgreSQL/17/bin", `${name}.exe`)
  : binDir ? join(binDir, name) : name;
const execFileP = promisify((await import("node:child_process")).execFile);
let port = 0;
function psqlArgs(statement: string) {
  return ["-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-h", "127.0.0.1", "-p", String(port), "-U", "postgres", "-d", "postgres", "-c", statement];
}
function psqlFile(filename: string): string {
  return execFileSync(pgExe("psql"), ["-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-h", "127.0.0.1", "-p", String(port), "-U", "postgres", "-d", "postgres", "-f", filename], { encoding: "utf8" }).trim();
}
function psql(statement: string): string {
  return execFileSync(pgExe("psql"), psqlArgs(statement), { encoding: "utf8" }).trim();
}
async function psqlAsync(statement: string): Promise<string> {
  const result = await execFileP(pgExe("psql"), psqlArgs(statement), { encoding: "utf8" });
  return result.stdout.trim();
}
async function waitForDatabaseCondition(query: string, label: string): Promise<void> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (psql(query) === "t") return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Timed out waiting for PostgreSQL concurrency condition: ${label}`);
}

test("A11 migration freezes, fences, resumes and atomically finalizes account deletion", async () => {
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
  const dir = mkdtempSync(join(testRoot, "a11-tests-pg-"));
  const safePrefix = `${testRoot}${sep}`;
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
      throw new Error(`Disposable PostgreSQL startup failed:\n${existsSync(logFile) ? readFileSync(logFile, "utf8") : "No PostgreSQL log"}`, { cause: error });
    }
    started = true;
    const migrationsDir = join(root, "neon/migrations");
    const files = readdirSync(migrationsDir).filter((name) => /^(?:00[1-9]|01[0-7])_.*\.sql$/.test(name)).sort();
    for (const file of files) psql(readFileSync(join(migrationsDir, file), "utf8"));
    for (const file of ["019_billing_lifecycle.sql", "020_account_recovery.sql", "021_workspace_invitations.sql", "031_google_location_selection.sql", "032_workspace_bootstrap.sql", "026_privacy_account_lifecycle.sql"]) {
      psqlFile(join(migrationsDir, file));
    }
    const migration = join(migrationsDir, "026_privacy_account_lifecycle.sql");
    psqlFile(migration);
    psqlFile(join(root, "docs/tasks/A11_ACTIVATION_BILLING.sql"));

    const owner = "00000000-0000-4000-8000-000000000011";
    const member = "00000000-0000-4000-8000-000000000012";
    const other = "00000000-0000-4000-8000-000000000013";
    const business = "00000000-0000-4000-8000-000000000021";
    const unrelatedBusiness = "00000000-0000-4000-8000-000000000022";
    psql(`INSERT INTO users(id,email) VALUES
      ('${owner}','owner@example.test'),('${member}','member@example.test'),('${other}','other@example.test');
      INSERT INTO profiles(id,plan_type,plan_status) VALUES
      ('${owner}','free','free'),('${member}','free','free'),('${other}','free','free');
      INSERT INTO businesses(id,owner_user_id,name) VALUES
      ('${business}','${owner}','Shared workspace'),('${unrelatedBusiness}','${other}','Unrelated');
      INSERT INTO business_members(business_id,user_id,role) VALUES('${business}','${member}','member');
      INSERT INTO reviews(user_id,business_id,location_name,google_review_id) VALUES
      ('${member}','${business}','locations/shared','review-member');
      INSERT INTO review_replies(user_id,business_id,review_id,draft_markdown) VALUES
      ('${member}','${business}',(SELECT id FROM reviews WHERE google_review_id='review-member'),'Member authored draft');
      INSERT INTO feedback(user_id,message) VALUES('${member}','erase my private feedback');
      INSERT INTO gbp_connections(user_id,access_token,refresh_token,expires_at,connection_version)
        VALUES('${member}','encrypted-access','encrypted-refresh',now()+interval '1 hour',gen_random_uuid());
      INSERT INTO billing_trial_owner_history(owner_user_id,state,source)
        VALUES('${member}','consumed','privacy-retention-test');`);

    assert.equal(psql(`SELECT result FROM privacy_begin_account_deletion('${owner}',false)`), "team_confirmation_required",
      "owner confirmation is required before freezing a shared workspace");
    assert.equal(psql(`SELECT privacy_deletion_requested_at IS NULL FROM users WHERE id='${owner}'`), "t");

    const beginMember = psql(`SELECT result||'|'||operation_id::text||'|'||account_role FROM privacy_begin_account_deletion('${member}',false)`);
    const [memberResult, memberOperation, memberRole] = beginMember.split("|");
    assert.equal(memberResult, "frozen");
    assert.equal(memberRole, "member");
    const memberClaim = psql(`SELECT result||'|'||fence::text FROM privacy_claim_account_deletion('${memberOperation}',300000)`);
    const [claimResult, memberFence] = memberClaim.split("|");
    assert.equal(claimResult, "claimed");
    assert.equal(psql(`SELECT privacy_finalize_account_deletion('${memberOperation}','${memberFence}')`), "providers_incomplete");
    assert.equal(psql(`SELECT privacy_record_account_deletion_step('${memberOperation}','${memberFence}','billing')`), "t");
    assert.equal(psql(`SELECT privacy_record_account_deletion_step('${memberOperation}','${memberFence}','google')`), "t");
    assert.equal(psql(`SELECT privacy_finalize_account_deletion('${memberOperation}','${memberFence}')`), "complete");
    assert.equal(psql(`SELECT count(*) FROM users WHERE id='${member}'`), "0");
    assert.equal(psql(`SELECT count(*) FROM businesses WHERE id='${business}' AND owner_user_id='${owner}'`), "1",
      "member deletion preserves the shared workspace");
    assert.equal(psql(`SELECT count(*) FROM business_members WHERE business_id='${business}' AND user_id='${member}'`), "0");
    assert.equal(psql(`SELECT user_id FROM reviews WHERE google_review_id='review-member'`), owner,
      "authored review remains in the shared workspace with surviving owner attribution");
    assert.equal(psql(`SELECT user_id FROM review_replies WHERE review_id=(SELECT id FROM reviews WHERE google_review_id='review-member')`), owner,
      "authored reply remains available to the workspace owner");
    assert.equal(psql(`SELECT count(*) FROM feedback WHERE message='erase my private feedback'`), "0");
    assert.equal(psql(`SELECT count(*) FROM gbp_connections WHERE user_id='${member}'`), "0");
    assert.equal(psql(`SELECT count(*) FROM billing_trial_owner_history WHERE owner_user_id='${member}'`), "1",
      "trial history survives account deletion as a UUID-only retention record");
    assert.equal(psql(`SELECT status FROM privacy_account_deletion_operations WHERE id='${memberOperation}'`), "complete");

    const beginOwner = psql(`SELECT result||'|'||operation_id::text||'|'||account_role FROM privacy_begin_account_deletion('${owner}',true)`);
    const [ownerResult, ownerOperation, ownerRole] = beginOwner.split("|");
    assert.equal(ownerResult, "frozen");
    assert.equal(ownerRole, "owner");
    const ownerClaim = psql(`SELECT result||'|'||fence::text FROM privacy_claim_account_deletion('${ownerOperation}',300000)`);
    const [ownerClaimResult, ownerFence] = ownerClaim.split("|");
    assert.equal(ownerClaimResult, "claimed");
    assert.equal(psql(`SELECT privacy_record_account_deletion_step('${ownerOperation}','${ownerFence}','billing')`), "t");
    assert.equal(psql(`SELECT privacy_record_account_deletion_step('${ownerOperation}','${ownerFence}','google')`), "t");
    assert.equal(psql(`SELECT privacy_finalize_account_deletion('${ownerOperation}','${ownerFence}')`), "complete");
    assert.equal(psql(`SELECT count(*) FROM users WHERE id='${owner}'`), "0");
    assert.equal(psql(`SELECT count(*) FROM users WHERE id='${other}'`), "1",
      "owner deletion preserves teammate and unrelated user accounts");
    assert.equal(psql(`SELECT count(*) FROM businesses WHERE id='${business}'`), "0",
      "explicit owner confirmation permits the owned workspace cascade");
    assert.equal(psql(`SELECT count(*) FROM businesses WHERE id='${unrelatedBusiness}'`), "1");
    assert.equal(psql(`SELECT status FROM privacy_account_deletion_operations WHERE id='${ownerOperation}'`), "complete");

    const pendingOwner = "00000000-0000-4000-8000-000000000016";
    const invitedUser = "00000000-0000-4000-8000-000000000017";
    const pendingBusiness = "00000000-0000-4000-8000-000000000026";
    psql(`INSERT INTO users(id,email) VALUES('${pendingOwner}','pending-owner@example.test'),('${invitedUser}','invited@example.test');
      INSERT INTO businesses(id,owner_user_id,name) VALUES('${pendingBusiness}','${pendingOwner}','Pending invitation workspace');
      INSERT INTO team_invitations(business_id,invited_by,email,role,token_hash,expires_at)
        VALUES('${pendingBusiness}','${pendingOwner}','invitee@example.test','member','pending-token',now()+interval '1 day');`);
    assert.equal(psql(`SELECT result FROM privacy_begin_account_deletion('${pendingOwner}',false)`), "team_confirmation_required",
      "a live pending invitation also requires explicit shared workspace confirmation");
    assert.equal(psql(`SELECT privacy_deletion_requested_at IS NULL FROM users WHERE id='${pendingOwner}'`), "t");

    const admissionOwner = "00000000-0000-4000-8000-000000000027";
    const admissionMember = "00000000-0000-4000-8000-000000000028";
    const admissionBusiness = "00000000-0000-4000-8000-000000000029";
    psql(`INSERT INTO users(id,email) VALUES('${admissionOwner}','admission-owner@example.test'),('${admissionMember}','admission-member@example.test');
      INSERT INTO businesses(id,owner_user_id,name) VALUES('${admissionBusiness}','${admissionOwner}','Admission race workspace');`);
    const admissionOperation = psql(`SELECT operation_id FROM privacy_begin_account_deletion('${admissionOwner}',false)`);
    const admissionFence = psql(`SELECT fence FROM privacy_claim_account_deletion('${admissionOperation}',300000)`);
    psql(`SELECT privacy_record_account_deletion_step('${admissionOperation}','${admissionFence}','billing');
      SELECT privacy_record_account_deletion_step('${admissionOperation}','${admissionFence}','google');`);
    psql(`CREATE TABLE a11_test_barrier(id INTEGER PRIMARY KEY,released BOOLEAN NOT NULL);
      INSERT INTO a11_test_barrier(id,released) VALUES(1,false);`);
    const admissionSql = `SET application_name='a11_admission_writer';
      BEGIN;
      SELECT id FROM businesses WHERE id='${admissionBusiness}' FOR UPDATE;
      DO $a11$ BEGIN
        LOOP
          EXIT WHEN (SELECT released FROM a11_test_barrier WHERE id=1);
          PERFORM pg_sleep(0.02);
        END LOOP;
      END $a11$;
      INSERT INTO business_members(business_id,user_id,role) VALUES('${admissionBusiness}','${admissionMember}','member');
      COMMIT;`;
    const admissionPromise = psqlAsync(admissionSql);
    await waitForDatabaseCondition(`SELECT count(*)=1 FROM pg_stat_activity
      WHERE application_name='a11_admission_writer' AND state='active' AND wait_event='PgSleep'
        AND query LIKE '%pg_sleep(0.02)%'`,
    "admission writer holds business lock");
    const racedFinalize = psqlAsync(`SET application_name='a11_deletion_finalizer';
      SELECT privacy_finalize_account_deletion('${admissionOperation}','${admissionFence}')`);
    await waitForDatabaseCondition(`SELECT count(*)=1 FROM pg_stat_activity
      WHERE application_name='a11_deletion_finalizer' AND wait_event_type='Lock'
        AND query LIKE '%privacy_finalize_account_deletion%'`,
    "finalizer is blocked on the admission's business row");
    psql(`UPDATE a11_test_barrier SET released=true WHERE id=1;`);
    await admissionPromise;
    assert.equal(await racedFinalize, "team_confirmation_required",
      "finalization waits for an in-flight A05 business admission and rechecks team data after the business lock");
    assert.equal(psql(`SELECT result||'|'||operation_id::text FROM privacy_begin_account_deletion('${admissionOwner}',true)`), `frozen|${admissionOperation}`,
      "explicit consent upgrades the existing frozen operation without creating another one");
    assert.equal(psql(`SELECT privacy_finalize_account_deletion('${admissionOperation}','${admissionFence}')`), "complete",
      "the same frozen operation resumes after owner consent for the newly admitted member");
    psql(`DROP TABLE a11_test_barrier;`);

    const raceUser = "00000000-0000-4000-8000-000000000014";
    psql(`INSERT INTO users(id,email) VALUES('${raceUser}','race@example.test')`);
    const beginSql = `SELECT result||'|'||operation_id::text FROM privacy_begin_account_deletion('${raceUser}',false)`;
    const begins = await Promise.all([psqlAsync(beginSql), psqlAsync(beginSql)]);
    assert.equal(begins[0], begins[1], "concurrent starts resume one durable operation");
    const raceOperation = begins[0]!.split("|")[1]!;
    const claimSql = `SELECT result||'|'||COALESCE(fence::text,'') FROM privacy_claim_account_deletion('${raceOperation}',300000)`;
    const claims = await Promise.all([psqlAsync(claimSql), psqlAsync(claimSql)]);
    assert.deepEqual(claims.map((value) => value.split("|")[0]).sort(), ["busy", "claimed"],
      "concurrent workers cannot claim one operation at the same time");

    const checkoutOwner = "00000000-0000-4000-8000-000000000015";
    const checkoutBusiness = "00000000-0000-4000-8000-000000000025";
    psql(`INSERT INTO users(id,email) VALUES('${checkoutOwner}','checkout@example.test');
      INSERT INTO businesses(id,owner_user_id,name) VALUES('${checkoutBusiness}','${checkoutOwner}','Checkout');
      INSERT INTO business_agents(business_id,agent_id,status) VALUES('${checkoutBusiness}','review_replies','inactive'),('${checkoutBusiness}','review_booster','inactive');`);
    const intentRow = psql(`SELECT intent_id::text||'|'||fence::text FROM claim_billing_checkout_intent(
      '${checkoutBusiness}','${checkoutOwner}','complete','monthly','cus_checkout','requesthash',
      '{"mode":"subscription","metadata":{"billing_intent_token":"a11-token"}}'::jsonb,false)`);
    const [intentId, intentFence] = intentRow.split("|");
    assert.equal(psql(`SELECT begin_billing_checkout_provider_call('${intentId}','${intentFence}')`), "t",
      "the pre-freeze billing provider call can reserve its short lease");
    const frozen = psql(`SELECT operation_id FROM privacy_begin_account_deletion('${checkoutOwner}',false)`);
    assert.equal(psql(`SELECT begin_billing_checkout_provider_call('${intentId}','${intentFence}')`), "f",
      "no new checkout provider call starts after freeze commits");
    assert.equal(psql(`SELECT provider_create_lease_until>now() FROM billing_checkout_intents WHERE id='${intentId}'`), "t",
      "the deletion worker can detect and wait for the already active provider request");
    assert.equal(psql(`SELECT finish_billing_checkout_provider_call('${intentId}','${intentFence}','done')`), "t");
    const currentIntentFence = intentFence;
    assert.equal(psql(`SELECT finish_billing_checkout_intent('${intentId}','${currentIntentFence}','cs_a11','https://example.test','expired')`), "t");
    const frozenId = frozen;
    const claimFrozen = psql(`SELECT result||'|'||fence::text FROM privacy_claim_account_deletion('${frozenId}',300000)`);
    const [, frozenFence] = claimFrozen.split("|");
    assert.equal(psql(`SELECT privacy_record_account_deletion_step('${frozenId}','${frozenFence}','billing')`), "t");
    assert.equal(psql(`SELECT privacy_record_account_deletion_step('${frozenId}','${frozenFence}','google')`), "t");
    assert.equal(psql(`SELECT privacy_finalize_account_deletion('${frozenId}','${frozenFence}')`), "complete",
      "finalization succeeds only after the fenced provider call and durable intent are reconciled");

    const customerOwner = "00000000-0000-4000-8000-000000000018";
    psql(`INSERT INTO users(id,email) VALUES('${customerOwner}','customer-provision@example.test');
      INSERT INTO billing_customer_provisioning(owner_user_id,owner_email,idempotency_key)
        VALUES('${customerOwner}','customer-provision@example.test','customer-provision-key');`);
    const customerFence = psql(`SELECT fence FROM billing_customer_provisioning WHERE owner_user_id='${customerOwner}'`);
    assert.equal(psql(`SELECT begin_billing_customer_provider_call('${customerOwner}','${customerFence}')`), "t");
    const customerOperation = psql(`SELECT operation_id FROM privacy_begin_account_deletion('${customerOwner}',false)`);
    assert.equal(psql(`SELECT begin_billing_customer_provider_call('${customerOwner}','${customerFence}')`), "f",
      "no new Stripe customer call starts after account freeze");
    assert.equal(psql(`SELECT finish_billing_customer_provider_call('${customerOwner}','${customerFence}','done')`), "t",
      "a call already in flight can durably record its outcome after freeze");
    assert.equal(psql(`SELECT begin_billing_customer_provider_call('${customerOwner}','${customerFence}')`), "f",
      "a completed provider call cannot be reacquired");
    const customerClaim = psql(`SELECT fence FROM privacy_claim_account_deletion('${customerOperation}',300000)`);
    assert.equal(psql(`SELECT privacy_record_account_deletion_step('${customerOperation}','${customerClaim}','billing')`), "t");
    assert.equal(psql(`SELECT privacy_record_account_deletion_step('${customerOperation}','${customerClaim}','google')`), "t");
    assert.equal(psql(`SELECT privacy_finalize_account_deletion('${customerOperation}','${customerClaim}')`), "customer_provisioning_unresolved",
      "finalization rechecks and preserves an uncommitted Stripe customer mapping");
    psql(`INSERT INTO billing_owner_customers(owner_user_id,stripe_customer_id) VALUES('${customerOwner}','cus_reconciled');
      INSERT INTO user_billing(user_id,stripe_customer_id) VALUES('${customerOwner}','cus_reconciled');
      DELETE FROM billing_customer_provisioning WHERE owner_user_id='${customerOwner}';`);
    assert.equal(psql(`SELECT privacy_finalize_account_deletion('${customerOperation}','${customerClaim}')`), "complete",
      "the same durable operation resumes after customer provisioning is reconciled");

    const customerClaimRaceOwner = "00000000-0000-4000-8000-000000000022";
    psql(`INSERT INTO users(id,email) VALUES('${customerClaimRaceOwner}','customer-claim-race@example.test');`);
    const customerClaimRace = await Promise.all([
      psqlAsync(`SELECT kind||'|'||COALESCE(idempotency_key,'') FROM claim_billing_customer_provisioning('${customerClaimRaceOwner}')`),
      psqlAsync(`SELECT result||'|'||operation_id::text FROM privacy_begin_account_deletion('${customerClaimRaceOwner}',false)`),
    ]);
    assert.match(customerClaimRace[0]!, /^(claimed|missing_owner)\|/,
      "customer claim either commits before freeze with its durable row or observes the freeze marker");
    assert.match(customerClaimRace[1]!, /^frozen\|/);
    assert.equal(psql(`SELECT kind FROM claim_billing_customer_provisioning('${customerClaimRaceOwner}')`), "missing_owner",
      "customer provisioning cannot be newly claimed after freeze commits");

    const checkoutClaimRaceOwner = "00000000-0000-4000-8000-000000000023";
    const checkoutClaimRaceBusiness = "00000000-0000-4000-8000-000000000033";
    psql(`INSERT INTO users(id,email) VALUES('${checkoutClaimRaceOwner}','checkout-claim-race@example.test');
      INSERT INTO businesses(id,owner_user_id,name) VALUES('${checkoutClaimRaceBusiness}','${checkoutClaimRaceOwner}','Checkout claim race');
      INSERT INTO business_agents(business_id,agent_id,status) VALUES('${checkoutClaimRaceBusiness}','review_replies','inactive'),('${checkoutClaimRaceBusiness}','review_booster','inactive');`);
    const checkoutClaimRace = await Promise.all([
      psqlAsync(`SELECT kind||'|'||COALESCE(intent_id::text,'') FROM claim_billing_checkout_intent(
        '${checkoutClaimRaceBusiness}','${checkoutClaimRaceOwner}','complete','monthly','cus-race','race-hash',
        '{"mode":"subscription","metadata":{"billing_intent_token":"race-token"}}'::jsonb,false)`),
      psqlAsync(`SELECT result||'|'||operation_id::text FROM privacy_begin_account_deletion('${checkoutClaimRaceOwner}',false)`),
    ]);
    assert.match(checkoutClaimRace[0]!, /^(claimed|blocked)\|/,
      "checkout claim either commits before freeze with a durable intent or observes the freeze marker");
    assert.match(checkoutClaimRace[1]!, /^frozen\|/);
    assert.equal(psql(`SELECT kind FROM claim_billing_checkout_intent(
      '${checkoutClaimRaceBusiness}','${checkoutClaimRaceOwner}','complete','monthly','cus-race','later-hash',
      '{"mode":"subscription","metadata":{"billing_intent_token":"later-token"}}'::jsonb,false)`), "blocked",
      "checkout intent claims cannot start after freeze commits");

    const lateCustomerOwner = "00000000-0000-4000-8000-000000000024";
    psql(`INSERT INTO users(id,email) VALUES('${lateCustomerOwner}','late-customer-result@example.test');
      INSERT INTO billing_customer_provisioning(owner_user_id,owner_email,idempotency_key)
        VALUES('${lateCustomerOwner}','late-customer-result@example.test','late-customer-key');`);
    const lateCustomerFence = psql(`SELECT fence FROM billing_customer_provisioning WHERE owner_user_id='${lateCustomerOwner}'`);
    assert.equal(psql(`SELECT begin_billing_customer_provider_call('${lateCustomerOwner}','${lateCustomerFence}')`), "t");
    psql(`SELECT privacy_begin_account_deletion('${lateCustomerOwner}',false)`);
    assert.equal(psql(`SELECT record_billing_customer_provider_result('${lateCustomerOwner}','${lateCustomerFence}','cus-late-result')`), "t",
      "a known response from the admitted provider call remains durable after freeze");
    assert.equal(psql(`SELECT finish_billing_customer_provider_call('${lateCustomerOwner}','${lateCustomerFence}','done')`), "t");
    assert.equal(psql(`SELECT provider_customer_id||'|'||provider_create_state||'|'||(provider_create_lease_until IS NULL)::text
      FROM billing_customer_provisioning WHERE owner_user_id='${lateCustomerOwner}'`), "cus-late-result|done|true",
      "deletion recovery can read the exact customer ID after the provider lease drains");

    const frozenWebhookOwner = "00000000-0000-4000-8000-000000000021";
    const frozenWebhookBusiness = "00000000-0000-4000-8000-000000000031";
    psql(`INSERT INTO users(id,email) VALUES('${frozenWebhookOwner}','late-webhook@example.test');
      INSERT INTO businesses(id,owner_user_id,name) VALUES('${frozenWebhookBusiness}','${frozenWebhookOwner}','Late webhook');`);
    const nullFenceOwner = "00000000-0000-4000-8000-000000000090";
    const nullFenceBusiness = "00000000-0000-4000-8000-000000000091";
    psql(`INSERT INTO users(id,email) VALUES('${nullFenceOwner}','null-fence@example.test');
      INSERT INTO businesses(id,owner_user_id,name) VALUES('${nullFenceBusiness}','${nullFenceOwner}','Null fence');
      SELECT kind FROM claim_billing_reconciliation_lease('${nullFenceOwner}','evt-null-fence','customer.subscription.updated',60000);`);
    assert.throws(() => psql(`SELECT apply_stripe_webhook_snapshot('evt-null-fence','customer.subscription.updated','${nullFenceOwner}',
      '${nullFenceBusiness}','cus-a11','{"id":"sub-null-fence","status":"active","priceId":"price-test"}'::jsonb,
      'replies','monthly',NULL,NULL::uuid)`), /stale billing reconciliation fence/,
      "NULL cannot satisfy the webhook lease fence");
    assert.equal(psql(`SELECT count(*) FROM subscriptions WHERE id='sub-null-fence'`), "0");
    const webhookFence = psql(`SELECT fence FROM claim_billing_reconciliation_lease('${frozenWebhookOwner}','evt-frozen','customer.subscription.updated',60000)`);
    psql(`SELECT privacy_begin_account_deletion('${frozenWebhookOwner}',false)`);
    psql(`SELECT apply_stripe_webhook_snapshot('evt-frozen','customer.subscription.updated','${frozenWebhookOwner}',
      '${frozenWebhookBusiness}','cus-late','{}'::jsonb,'replies','monthly',NULL,'${webhookFence}')`);
    assert.equal(psql(`SELECT status FROM billing_webhook_events WHERE event_id='evt-frozen'`), "ignored",
      "late subscription events are acknowledged without restoring frozen account billing state");
    assert.equal(psql(`SELECT count(*) FROM billing_owner_customers WHERE owner_user_id='${frozenWebhookOwner}'`), "0");
    assert.equal(psql(`SELECT count(*) FROM business_agents WHERE business_id='${frozenWebhookBusiness}' AND status<>'inactive'`), "0");

    const raceOwner = "00000000-0000-4000-8000-000000000019";
    psql(`INSERT INTO users(id,email) VALUES('${raceOwner}','customer-race@example.test');
      INSERT INTO billing_customer_provisioning(owner_user_id,owner_email,idempotency_key)
        VALUES('${raceOwner}','customer-race@example.test','customer-race-key');`);
    const raceFence = psql(`SELECT fence FROM billing_customer_provisioning WHERE owner_user_id='${raceOwner}'`);
    const customerRaceOperation = psql(`SELECT operation_id FROM privacy_begin_account_deletion('${raceOwner}',false)`);
    const customerRaceClaim = psql(`SELECT fence FROM privacy_claim_account_deletion('${customerRaceOperation}',300000)`);
    psql(`SELECT privacy_record_account_deletion_step('${customerRaceOperation}','${customerRaceClaim}','billing');
      SELECT privacy_record_account_deletion_step('${customerRaceOperation}','${customerRaceClaim}','google');`);
    const raceResults = await Promise.all([
      psqlAsync(`SELECT begin_billing_customer_provider_call('${raceOwner}','${raceFence}')`),
      psqlAsync(`SELECT privacy_finalize_account_deletion('${customerRaceOperation}','${customerRaceClaim}')`),
    ]);
    assert.deepEqual(raceResults.sort(), ["customer_provisioning_unresolved", "f"],
      "customer admission and finalization serialize on the same owner fence; neither loses an in-flight mapping");

    const inconsistentOwner = "00000000-0000-4000-8000-000000000020";
    psql(`INSERT INTO users(id,email) VALUES('${inconsistentOwner}','customer-state@example.test');
      INSERT INTO billing_customer_provisioning(owner_user_id,owner_email,idempotency_key,provider_create_state)
        VALUES('${inconsistentOwner}','customer-state@example.test','customer-state-key','done');`);
    const inconsistentFence = psql(`SELECT fence FROM billing_customer_provisioning WHERE owner_user_id='${inconsistentOwner}'`);
    assert.equal(psql(`SELECT begin_billing_customer_provider_call('${inconsistentOwner}','${inconsistentFence}')`), "f",
      "done provisioning records cannot start another create call");
    psql(`UPDATE billing_customer_provisioning SET provider_create_state='uncertain',provider_create_finished_at=NULL
      WHERE owner_user_id='${inconsistentOwner}';`);
    assert.equal(psql(`SELECT begin_billing_customer_provider_call('${inconsistentOwner}','${inconsistentFence}')`), "f",
      "an uncertain record without a finished timestamp is inconsistent and cannot be retried");
  } finally {
    if (started) execFileSync(pgExe("pg_ctl"), ["-D", dataDir, "-m", "immediate", "-w", "stop"], { stdio: "ignore" });
    assert.ok(resolve(dir).startsWith(safePrefix));
    rmSync(dir, { recursive: true, force: true });
  }
});
