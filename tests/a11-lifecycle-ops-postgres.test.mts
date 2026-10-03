import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { createServer } from "node:net";
import test from "node:test";

const root = process.cwd();
const binDir = process.env.A11_PG_BIN ?? process.env.A04_PG_BIN ?? process.env.PG_BIN;
const pgExe = (name: string) => process.platform === "win32"
  ? join(binDir ?? "C:/Program Files/PostgreSQL/17/bin", `${name}.exe`)
  : binDir ? join(binDir, name) : name;

test("A11 lifecycle lease drains before deletion and numbered migrations replay safely", async () => {
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
  const dir = mkdtempSync(join(testRoot, "a11-lifecycle-pg-"));
  assert.ok(resolve(dir).startsWith(`${testRoot}${sep}`));
  const dataDir = join(dir, "data");
  let started = false;
  const args = (sql: string) => ["-X","-q","-A","-t","-v","ON_ERROR_STOP=1","-h","127.0.0.1","-p",String(port),"-U","postgres","-d","postgres","-c",sql];
  const psql = (sql: string) => execFileSync(pgExe("psql"), args(sql), { encoding: "utf8" }).trim();
  const psqlFile = (filename: string) => execFileSync(pgExe("psql"), ["-X","-q","-A","-t","-v","ON_ERROR_STOP=1","-h","127.0.0.1","-p",String(port),"-U","postgres","-d","postgres","-f",filename], { encoding: "utf8" }).trim();
  try {
    execFileSync(pgExe("initdb"), ["-D",dataDir,"-U","postgres","-A","trust","--no-locale","--encoding=UTF8"], { stdio: "ignore" });
    appendFileSync(join(dataDir,"postgresql.conf"),"\nunix_socket_directories = ''\n");
    const log = join(dir,"postgres.log");
    try { execFileSync(pgExe("pg_ctl"),["-D",dataDir,"-l",log,"-o",`-h 127.0.0.1 -p ${port} -F`,"-w","start"],{stdio:"ignore"}); }
    catch (error) { throw new Error(existsSync(log) ? readFileSync(log,"utf8") : "PostgreSQL failed to start",{cause:error}); }
    started = true;
    const migrations = join(root,"neon/migrations");
    for (const name of readdirSync(migrations).filter((entry) => /^\d+_.*\.sql$/.test(entry)).sort()) {
      psqlFile(join(migrations,name));
    }
    const owner = "00000000-0000-4000-8000-000000000011";
    const other = "00000000-0000-4000-8000-000000000012";
    const business = "00000000-0000-4000-8000-000000000021";
    const otherBusiness = "00000000-0000-4000-8000-000000000022";
    psql(`INSERT INTO users(id,email) VALUES ('${owner}','owner@example.test'),('${other}','other@example.test'),('00000000-0000-4000-8000-000000000013','member@example.test'); INSERT INTO businesses(id,owner_user_id,name) VALUES ('${business}','${owner}','Owner business'),('${otherBusiness}','${other}','Other business'); INSERT INTO business_members(business_id,user_id,role) VALUES ('${otherBusiness}','00000000-0000-4000-8000-000000000013','member');`);
    psql(`INSERT INTO reviews(user_id,business_id,location_name,google_review_id,comment,status) VALUES ('${owner}','${business}','accounts/A/locations/L','review-post-drain','review','new'); INSERT INTO review_reply_draft_state(review_id,business_id,posting_token,posting_lease_until) SELECT id,'${business}',gen_random_uuid(),now()+interval '30 seconds' FROM reviews WHERE google_review_id='review-post-drain';`);
    const uncertainToken = psql(`SELECT token::text FROM begin_account_lifecycle_operation('${other}',NULL,'${otherBusiness}','test_external','uncertain-1',1000)`);
    assert.ok(uncertainToken);
    psql("SELECT pg_sleep(1.1)");
    assert.equal(psql(`SELECT privacy_account_lifecycle_drained('${other}')`),"f");
    assert.equal(psql(`SELECT result FROM begin_account_lifecycle_operation('${other}',NULL,'${otherBusiness}','test_external','uncertain-2',30000)`),"uncertain");
    assert.equal(psql(`SELECT status FROM account_lifecycle_operations WHERE token='${uncertainToken}'`),"uncertain");
    const lease = psql(`SELECT result||'|'||token::text FROM begin_account_lifecycle_operation('${owner}',NULL,'${business}','test_external','operation-1',30000)`);
    const [leaseResult, token] = lease.split("|");
    assert.equal(leaseResult,"claimed");
    psql(`UPDATE account_lifecycle_operations SET encrypted_provider_evidence='encrypted-compensation-token' WHERE token='${token}';`);
    const failedClaim = psql(`SELECT result||'|'||token::text FROM begin_account_lifecycle_operation('${owner}',NULL,'${business}','test_failed','known-failure-key',30000)`);
    const [failedStart, failedToken] = failedClaim.split("|");
    assert.equal(failedStart,"claimed");
    assert.ok(failedToken);
    assert.equal(psql(`SELECT finish_account_lifecycle_operation('${failedToken}','failed')`),"t");
    assert.equal(psql(`SELECT result||'|'||token::text FROM begin_account_lifecycle_operation('${owner}',NULL,'${business}','test_failed','known-failure-key',30000)`),`failed|${failedToken}`,
      "a known failed key stays explicitly failed and is not reported as success or retried");
    const freshAttempt = psql(`SELECT result||'|'||token::text FROM begin_account_lifecycle_operation('${owner}',NULL,'${business}','test_failed','new-explicit-attempt',30000)`);
    assert.match(freshAttempt,/^claimed\|[0-9a-f-]{36}$/,
      "a retry requires an explicit new operation key");
    const freshToken = freshAttempt.split("|")[1]!;
    assert.equal(psql(`SELECT finish_account_lifecycle_operation('${freshToken}','failed')`),"t");
    const begin = psql(`SELECT result||'|'||operation_id::text FROM privacy_begin_account_deletion('${owner}',true)`);
    const [beginResult, operation] = begin.split("|");
    assert.equal(beginResult,"frozen");
    assert.equal(psql(`SELECT result FROM begin_account_lifecycle_operation('${owner}',NULL,'${business}','test_external','operation-2',30000)`),"frozen");
    const claim = psql(`SELECT result||'|'||fence::text FROM privacy_claim_account_deletion('${operation}',300000)`);
    const [, fence] = claim.split("|");
    assert.equal(psql(`SELECT privacy_finalize_account_deletion('${operation}',NULL)`),"stale_fence");
    assert.equal(psql(`SELECT privacy_finalize_account_deletion('${operation}',gen_random_uuid())`),"stale_fence");
    psql(`SELECT privacy_record_account_deletion_step('${operation}','${fence}','billing'); SELECT privacy_record_account_deletion_step('${operation}','${fence}','google');`);
    assert.equal(psql(`SELECT privacy_finalize_account_deletion('${operation}','${fence}')`),"account_lifecycle_operations_unresolved");
    assert.equal(psql(`SELECT finish_account_lifecycle_operation('${token}','done')`),"t");
    assert.equal(psql(`SELECT encrypted_provider_evidence IS NULL FROM account_lifecycle_operations WHERE token='${token}'`),"t");
    psql(`INSERT INTO privacy_google_revocation_evidence(operation_id,user_id,connection_version,encrypted_refresh_token,acknowledged_at) VALUES ('${operation}','${owner}',gen_random_uuid(),'encrypted-evidence',now());`);
    assert.equal(psql(`SELECT privacy_account_lifecycle_drained('${owner}')`),"f");
    assert.equal(psql(`SELECT privacy_finalize_account_deletion('${operation}','${fence}')`),"account_lifecycle_operations_unresolved");
    psql(`INSERT INTO privacy_reply_post_outcomes(claim_token,business_id,review_id,outcome) SELECT posting_token,'${business}',review_id,'accepted' FROM review_reply_draft_state WHERE business_id='${business}' AND posting_token IS NOT NULL; UPDATE review_reply_draft_state SET posting_token=NULL,posting_lease_until=NULL WHERE business_id='${business}';`);
    assert.equal(psql(`SELECT privacy_finalize_account_deletion('${operation}','${fence}')`),"complete");
    assert.equal(psql(`SELECT count(*) FROM privacy_google_revocation_evidence WHERE operation_id='${operation}'`),"0");
    assert.equal(psql(`SELECT encrypted_provider_evidence FROM account_lifecycle_operations WHERE token='${token}'`),"");
    assert.equal(psql(`SELECT count(*) FROM privacy_reply_post_outcomes WHERE business_id='${business}'`),"0");
    const member = "00000000-0000-4000-8000-000000000013";
    psql(`INSERT INTO team_invitations(business_id,invited_by,email,token_hash,expires_at) VALUES ('${otherBusiness}','${member}','invite@example.test','member-invite-token',now()+interval '1 day');`);
    const memberStart = psql(`SELECT result||'|'||operation_id::text FROM privacy_begin_account_deletion('${member}',false)`);
    const [memberStartResult,memberOperation] = memberStart.split("|");
    assert.equal(memberStartResult,"frozen");
    const memberClaim = psql(`SELECT result||'|'||fence::text FROM privacy_claim_account_deletion('${memberOperation}',300000)`);
    const [,memberFence] = memberClaim.split("|");
    psql(`SELECT privacy_record_account_deletion_step('${memberOperation}','${memberFence}','billing'); SELECT privacy_record_account_deletion_step('${memberOperation}','${memberFence}','google');`);
    assert.equal(psql(`SELECT privacy_finalize_account_deletion('${memberOperation}','${memberFence}')`),"complete");
    assert.equal(psql(`SELECT count(*) FROM users WHERE id='${member}'`),"0");
    assert.equal(psql(`SELECT count(*) FROM users WHERE id='${other}'`),"1");
    assert.equal(psql(`SELECT invited_by||'|'||status FROM team_invitations WHERE token_hash='member-invite-token'`),`${other}|revoked`);
  } finally {
    if (started) execFileSync(pgExe("pg_ctl"),["-D",dataDir,"-m","immediate","-w","stop"],{stdio:"ignore"});
    rmSync(dir,{recursive:true,force:true});
  }
});
