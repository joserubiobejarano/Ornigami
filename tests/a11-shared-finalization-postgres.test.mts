import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { createServer } from "node:net";
import test from "node:test";

const root = process.cwd();
const binDir = process.env.A11_PG_BIN ?? process.env.A04_PG_BIN ?? process.env.PG_BIN;
const pgExe = (name: string) => process.platform === "win32"
  ? join(binDir ?? "C:/Program Files/PostgreSQL/17/bin", `${name}.exe`)
  : binDir ? join(binDir, name) : name;

test("A11 canonical lifecycle migrations replay and finalization preserves survivor data while purging owned evidence", async () => {
  const server = createServer();
  const port = await new Promise<number>((resolvePort, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const value = (server.address() as { port: number }).port;
      server.close((error) => error ? reject(error) : resolvePort(value));
    });
  });
  const testRoot = resolve(root, ".next");
  mkdirSync(testRoot, { recursive: true });
  const dir = mkdtempSync(join(testRoot, "a11-shared-finalization-pg-"));
  assert.ok(resolve(dir).startsWith(`${testRoot}${sep}`));
  const dataDir = join(dir, "data");
  let started = false;
  const args = (sql: string) => ["-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-h", "127.0.0.1", "-p", String(port), "-U", "postgres", "-d", "postgres", "-c", sql];
  const psql = (sql: string) => execFileSync(pgExe("psql"), args(sql), { encoding: "utf8" }).trim();
  const psqlFile = (filename: string) => execFileSync(pgExe("psql"), ["-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-h", "127.0.0.1", "-p", String(port), "-U", "postgres", "-d", "postgres", "-f", filename], { encoding: "utf8" }).trim();
  try {
    execFileSync(pgExe("initdb"), ["-D", dataDir, "-U", "postgres", "-A", "trust", "--no-locale", "--encoding=UTF8"], { stdio: "ignore" });
    appendFileSync(join(dataDir, "postgresql.conf"), "\nunix_socket_directories = ''\n");
    const log = join(dir, "postgres.log");
    try { execFileSync(pgExe("pg_ctl"), ["-D", dataDir, "-l", log, "-o", `-h 127.0.0.1 -p ${port} -F`, "-w", "start"], { stdio: "ignore" }); }
    catch (error) { throw new Error(existsSync(log) ? readFileSync(log, "utf8") : "PostgreSQL failed to start", { cause: error }); }
    started = true;

    const migrations = join(root, "neon/migrations");
    for (const name of readdirSync(migrations).filter((entry) => /^\d{3}_.*\.sql$/.test(entry)).sort()) psqlFile(join(migrations, name));
    const lifecycleMigrations = readdirSync(migrations).filter((entry) => /^03[3-8]_.*\.sql$/.test(entry)).sort();
    for (const name of lifecycleMigrations) psqlFile(join(migrations, name));
    assert.equal(psql("SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='booster_followup_deliveries' AND column_name='actor_user_id'"), "1", "latest Booster proposal supplies actor attribution used by lifecycle drain");

    const owner = "10000000-0000-4000-8000-000000000001";
    const member = "10000000-0000-4000-8000-000000000002";
    const survivor = "10000000-0000-4000-8000-000000000003";
    const other = "10000000-0000-4000-8000-000000000004";
    const shared = "20000000-0000-4000-8000-000000000001";
    const owned = "20000000-0000-4000-8000-000000000002";
    const reviewA = "910001";
    const reviewB = "910002";
    const memberClaim = "40000000-0000-4000-8000-000000000001";
    const survivorClaim = "40000000-0000-4000-8000-000000000002";
    const visitMember = "50000000-0000-4000-8000-000000000001";
    const visitOwner = "50000000-0000-4000-8000-000000000002";
    const boosterMember = "60000000-0000-4000-8000-000000000001";
    const boosterOwner = "60000000-0000-4000-8000-000000000002";
    psql(`INSERT INTO users(id,email) VALUES ('${owner}','owner@test.invalid'),('${member}','member@test.invalid'),('${survivor}','survivor@test.invalid'),('${other}','other@test.invalid');
      INSERT INTO profiles(id,plan_type,plan_status) VALUES ('${owner}','free','free'),('${member}','free','free'),('${survivor}','free','free'),('${other}','free','free');
      INSERT INTO businesses(id,owner_user_id,name) VALUES ('${shared}','${owner}','Shared'),('${owned}','${owner}','Owned');
      INSERT INTO businesses(id,owner_user_id,name) VALUES ('20000000-0000-4000-8000-000000000003','${other}','Other');
      INSERT INTO business_members(business_id,user_id,role) VALUES ('${shared}','${member}','member'),('${shared}','${survivor}','member');
      INSERT INTO reviews(id,user_id,business_id,location_name,google_review_id) VALUES
        ('${reviewA}','${member}','${shared}','locations/shared','member-review'),('${reviewB}','${survivor}','${shared}','locations/shared','survivor-review');
      INSERT INTO team_invitations(business_id,invited_by,email,role,token_hash,expires_at) VALUES
        ('${shared}','${member}','member-invite@test.invalid','member','member-invite-hash',now()+interval '1 day');
      INSERT INTO followup_visits(id,business_id,visited_at,followup_status) VALUES
        ('${visitMember}','${shared}',now(),'pending'),('${visitOwner}','${owned}',now(),'pending');
      INSERT INTO booster_followup_deliveries(id,business_id,visit_id,state,idempotency_key,actor_user_id) VALUES
        ('${boosterMember}','${shared}','${visitMember}','unknown','member-unknown-send','${member}'),
        ('${boosterOwner}','${owned}','${visitOwner}','unknown','owner-unknown-send','${owner}');`);

    const genericActorToken = psql(`SELECT token FROM begin_account_lifecycle_operation('${owner}','${member}','${shared}','google_reply_post','${memberClaim}',30000);`);
    assert.equal(psql(`SELECT finish_account_lifecycle_operation('${genericActorToken}','done')`), "t");
    const genericSurvivorToken = psql(`SELECT token FROM begin_account_lifecycle_operation('${owner}','${survivor}','${shared}','google_reply_post','${survivorClaim}',30000);`);
    assert.equal(psql(`SELECT finish_account_lifecycle_operation('${genericSurvivorToken}','done')`), "t");
    const actorDrainToken = psql(`SELECT token FROM begin_account_lifecycle_operation('${owner}','${member}','${shared}','test_actor_drain','member-active-drain',30000);`);
    const ownerDrainToken = psql(`SELECT token FROM begin_account_lifecycle_operation('${owner}',NULL,'${owned}','test_owner_drain','owner-active-drain',30000);`);
    psql(`UPDATE account_lifecycle_operations SET encrypted_provider_evidence='cipher-member-operation' WHERE token='${genericActorToken}';
      UPDATE account_lifecycle_operations SET encrypted_provider_evidence='cipher-survivor-operation' WHERE token='${genericSurvivorToken}';
      INSERT INTO privacy_reply_post_outcomes(claim_token,business_id,review_id,outcome) VALUES
        ('${memberClaim}','${shared}','${reviewA}','accepted'),('${survivorClaim}','${shared}','${reviewB}','accepted');
      INSERT INTO privacy_google_revocation_evidence(operation_id,user_id,connection_version,encrypted_refresh_token,acknowledged_at)
        VALUES (gen_random_uuid(),'${member}',gen_random_uuid(),'cipher-google-member',now()),(gen_random_uuid(),'${survivor}',gen_random_uuid(),'cipher-google-survivor',now());`);
    // Restore encrypted evidence after terminal outcome: deletion must scrub all
    // owner- or actor-linked generic rows, including historical terminal rows.
    psql(`UPDATE account_lifecycle_operations SET encrypted_provider_evidence='cipher-member-operation' WHERE token='${genericActorToken}';
      UPDATE account_lifecycle_operations SET encrypted_provider_evidence='cipher-survivor-operation' WHERE token='${genericSurvivorToken}';`);

    const memberOp = psql(`SELECT operation_id FROM privacy_begin_account_deletion('${member}',false)`);
    const memberFence = psql(`SELECT fence FROM privacy_claim_account_deletion('${memberOp}',300000)`);
    psql(`SELECT privacy_record_account_deletion_step('${memberOp}','${memberFence}','billing'); SELECT privacy_record_account_deletion_step('${memberOp}','${memberFence}','google');`);
    assert.equal(psql(`SELECT privacy_finalize_account_deletion('${memberOp}',NULL)`), "stale_fence");
    assert.equal(psql(`SELECT privacy_finalize_account_deletion('${memberOp}',gen_random_uuid())`), "stale_fence");
    assert.equal(psql(`SELECT privacy_finalize_account_deletion('${memberOp}','${memberFence}')`), "account_lifecycle_operations_unresolved", "active generic operation attributed to the frozen actor blocks deletion");
    assert.equal(psql(`SELECT finish_account_lifecycle_operation('${actorDrainToken}','uncertain')`), "t");
    assert.equal(psql(`SELECT privacy_finalize_account_deletion('${memberOp}','${memberFence}')`), "account_lifecycle_operations_unresolved", "uncertain generic actor operation continues to block deletion");
    assert.equal(psql(`SELECT finish_account_lifecycle_operation('${actorDrainToken}','done')`), "t");
    assert.equal(psql(`SELECT privacy_finalize_account_deletion('${memberOp}','${memberFence}')`), "account_lifecycle_operations_unresolved", "native Booster unknown outcome attributed to actor blocks finalization");
    psql(`UPDATE booster_followup_deliveries SET state='accepted',provider_message_id='provider-accepted' WHERE id='${boosterMember}';`);
    assert.equal(psql(`SELECT privacy_finalize_account_deletion('${memberOp}','${memberFence}')`), "complete");
    assert.equal(psql(`SELECT count(*) FROM users WHERE id='${member}'`), "0");
    assert.equal(psql(`SELECT count(*) FROM businesses WHERE id='${shared}' AND owner_user_id='${owner}'`), "1");
    assert.equal(psql(`SELECT count(*) FROM business_members WHERE business_id='${shared}' AND user_id='${member}'`), "0");
    assert.equal(psql(`SELECT count(*) FROM business_members WHERE business_id='${shared}' AND user_id='${survivor}'`), "1");
    assert.equal(psql(`SELECT user_id FROM reviews WHERE id='${reviewA}'`), owner, "member-authored workspace attribution is retained under the owner");
    assert.equal(psql(`SELECT user_id FROM reviews WHERE id='${reviewB}'`), survivor, "survivor attribution remains unchanged");
    assert.equal(psql(`SELECT count(*) FROM team_invitations WHERE invited_by='${owner}' AND business_id='${shared}' AND status='revoked'`), "1", "team trigger cleanup runs under finalizer marker");
    assert.equal(psql(`SELECT current_setting('app.privacy_finalizer',true) IS NULL OR current_setting('app.privacy_finalizer',true)=''`), "t", "finalizer marker is restored after completion");
    assert.equal(psql(`SELECT count(*) FROM privacy_reply_post_outcomes WHERE claim_token='${memberClaim}'`), "0", "actor-matched native provider receipt is purged");
    assert.equal(psql(`SELECT count(*) FROM privacy_reply_post_outcomes WHERE claim_token='${survivorClaim}'`), "1", "unrelated survivor receipt in the same workspace is retained");
    assert.equal(psql(`SELECT encrypted_provider_evidence IS NULL FROM account_lifecycle_operations WHERE token='${genericActorToken}'`), "t", "member-linked generic encrypted evidence is scrubbed");
    assert.equal(psql(`SELECT encrypted_provider_evidence IS NULL FROM account_lifecycle_operations WHERE token='${genericSurvivorToken}'`), "f", "survivor generic encrypted evidence is retained");
    assert.equal(psql(`SELECT count(*) FROM privacy_google_revocation_evidence WHERE user_id='${member}'`), "0");
    assert.equal(psql(`SELECT count(*) FROM privacy_google_revocation_evidence WHERE user_id='${survivor}'`), "1");
    assert.equal(psql(`SELECT actor_user_id IS NULL FROM booster_followup_deliveries WHERE id='${boosterMember}'`), "t", "terminal native delivery removes deleted actor attribution while preserving durable outcome");

    const ownerOp = psql(`SELECT operation_id FROM privacy_begin_account_deletion('${owner}',true)`);
    const ownerFence = psql(`SELECT fence FROM privacy_claim_account_deletion('${ownerOp}',300000)`);
    psql(`SELECT privacy_record_account_deletion_step('${ownerOp}','${ownerFence}','billing'); SELECT privacy_record_account_deletion_step('${ownerOp}','${ownerFence}','google');`);
    assert.equal(psql(`SELECT count(*) FROM privacy_reply_post_outcomes WHERE business_id='${shared}'`), "1");
    assert.equal(psql(`SELECT privacy_finalize_account_deletion('${ownerOp}','${ownerFence}')`), "account_lifecycle_operations_unresolved", "active generic operation owned by the frozen account blocks deletion");
    assert.equal(psql(`SELECT finish_account_lifecycle_operation('${ownerDrainToken}','uncertain')`), "t");
    assert.equal(psql(`SELECT privacy_finalize_account_deletion('${ownerOp}','${ownerFence}')`), "account_lifecycle_operations_unresolved", "uncertain generic owner operation blocks deletion");
    assert.equal(psql(`SELECT finish_account_lifecycle_operation('${ownerDrainToken}','failed')`), "t");
    assert.equal(psql(`SELECT privacy_finalize_account_deletion('${ownerOp}','${ownerFence}')`), "account_lifecycle_operations_unresolved", "native Booster unknown outcome attributed to owner blocks finalization");
    psql(`UPDATE booster_followup_deliveries SET state='accepted',provider_message_id='provider-owner-accepted' WHERE id='${boosterOwner}';`);
    assert.equal(psql(`SELECT privacy_finalize_account_deletion('${ownerOp}','${ownerFence}')`), "complete");
    assert.equal(psql(`SELECT count(*) FROM businesses WHERE owner_user_id='${owner}'`), "0", "confirmed owner deletion cascades through team-protected workspace rows");
    assert.equal(psql(`SELECT count(*) FROM users WHERE id IN ('${survivor}','${other}')`), "2", "owner cascade preserves unrelated users");
    assert.equal(psql(`SELECT count(*) FROM privacy_reply_post_outcomes WHERE business_id='${shared}'`), "0", "owner deletion purges all receipts in owned workspace");
    assert.equal(psql(`SELECT current_setting('app.privacy_finalizer',true) IS NULL OR current_setting('app.privacy_finalizer',true)=''`), "t", "owner finalizer marker is restored too");
  } finally {
    if (started) execFileSync(pgExe("pg_ctl"), ["-D", dataDir, "-m", "immediate", "-w", "stop"], { stdio: "ignore" });
  }
});
