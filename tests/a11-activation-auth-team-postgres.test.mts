import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { createServer } from "node:net";
import test from "node:test";
import { loadTs } from "./auth-test-harness.mts";

const root = process.cwd();
const binDir = process.env.A11_PG_BIN ?? process.env.A04_PG_BIN ?? process.env.PG_BIN;
const pgExe = (name: string) => process.platform === "win32" ? join(binDir ?? "C:/Program Files/PostgreSQL/17/bin", `${name}.exe`) : binDir ? join(binDir, name) : name;
let port = 0;
function psql(statement: string): string {
  return execFileSync(pgExe("psql"), ["-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-h", "127.0.0.1", "-p", String(port), "-U", "postgres", "-d", "postgres", "-c", statement], { encoding: "utf8" }).trim();
}
function psqlAsync(statement: string): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(pgExe("psql"), ["-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-h", "127.0.0.1", "-p", String(port), "-U", "postgres", "-d", "postgres", "-c", statement], { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = ""; let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk: string) => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => { stderr += chunk; });
    child.once("error", reject);
    child.once("close", (code) => code === 0 ? resolvePromise(stdout.trim()) : reject(new Error(stderr)));
  });
}
function psqlFile(filename: string): string {
  return execFileSync(pgExe("psql"), ["-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-h", "127.0.0.1", "-p", String(port), "-U", "postgres", "-d", "postgres", "-f", filename], { encoding: "utf8" }).trim();
}
function sqlString(value: unknown): string { return `'${String(value).replaceAll("'", "''")}'`; }
function dbAdapter() {
  return async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const query = strings.reduce((out, part, index) => out + part + (index < values.length ? sqlString(values[index]) : ""), "");
    if (/^\s*WITH\b/i.test(query)) {
      const output = psql(query);
      if (!output) return [];
      const [id, auth_version, privacy_deletion_requested_at] = output.split("|");
      return [{ id, auth_version: Number(auth_version), privacy_deletion_requested_at }];
    }
    const output = psql(`SELECT row_to_json(activation_query)::text FROM (${query}) activation_query`);
    return output ? output.split(/\r?\n/).map((line) => JSON.parse(line) as Record<string, unknown>) : [];
  };
}
async function waitForRaceTransaction(): Promise<void> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (psql("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE query LIKE '%race-token%' AND state='active' AND wait_event='PgSleep')") === "t") return;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 25));
  }
  throw new Error("Timed out waiting for the team write to hold its admission locks");
}

test("A11 auth token and team admission SQL guard freeze races in disposable PostgreSQL", async () => {
  const portServer = createServer();
  await new Promise<void>((resolvePort, rejectPort) => {
    portServer.once("error", rejectPort);
    portServer.listen(0, "127.0.0.1", () => { port = (portServer.address() as { port: number }).port; portServer.close((error) => error ? rejectPort(error) : resolvePort()); });
  });
  const testRoot = resolve(root, ".next"); mkdirSync(testRoot, { recursive: true });
  const dir = mkdtempSync(join(testRoot, "a11-auth-team-pg-"));
  assert.ok(resolve(dir).startsWith(`${testRoot}${sep}`));
  const dataDir = join(dir, "data"); let started = false;
  try {
    execFileSync(pgExe("initdb"), ["-D", dataDir, "-U", "postgres", "-A", "trust", "--no-locale", "--encoding=UTF8"], { stdio: "ignore" });
    appendFileSync(join(dataDir, "postgresql.conf"), "\nunix_socket_directories = ''\n");
    execFileSync(pgExe("pg_ctl"), ["-D", dataDir, "-l", join(dir, "postgres.log"), "-o", `-h 127.0.0.1 -p ${port} -F`, "-w", "start"], { stdio: "ignore" });
    started = true;
    const migrationsDir = join(root, "neon/migrations");
    for (const file of readdirSync(migrationsDir).filter((name) => /^(?:00[1-9]|01[0-7])_.*\.sql$/.test(name)).sort()) psql(readFileSync(join(migrationsDir, file), "utf8"));
    for (const file of ["019_billing_lifecycle.sql", "020_account_recovery.sql", "021_workspace_invitations.sql", "031_google_location_selection.sql", "032_workspace_bootstrap.sql", "026_privacy_account_lifecycle.sql"]) psqlFile(join(migrationsDir, file));
    psqlFile(join(root, "docs/tasks/A11_ACTIVATION_AUTH_TEAM.sql"));

    const owner = "00000000-0000-4000-8000-000000000101";
    const member = "00000000-0000-4000-8000-000000000102";
    const biz = "00000000-0000-4000-8000-000000000201";
    psql(`INSERT INTO users(id,email,password_hash) VALUES ('${owner}','owner@example.test','hash'),('${member}','member@example.test','hash');
      INSERT INTO businesses(id,owner_user_id,name) VALUES ('${biz}','${owner}','workspace');
      INSERT INTO business_members(business_id,user_id,role) VALUES ('${biz}','${member}','member');
      INSERT INTO email_verification_tokens(user_id,token_hash,expires_at,callback_url) VALUES ('${owner}','verify-hash',now()+interval '1 day','/dashboard');
      INSERT INTO password_reset_tokens(user_id,token_hash,expires_at,callback_url) VALUES ('${owner}','reset-hash',now()+interval '1 day','/reset-password');`);

    const slowInvitation = psqlAsync(`BEGIN;
      INSERT INTO team_invitations(business_id,invited_by,email,role,token_hash,expires_at)
        VALUES ('${biz}','${owner}','new@example.test','member','race-token',now()+interval '1 day');
      SELECT pg_sleep(1.2);
      COMMIT;
      SELECT 'committed';`);
    await waitForRaceTransaction();
    const freezeResult = psql(`SELECT result FROM privacy_begin_account_deletion('${owner}',false)`);
    assert.equal(await slowInvitation, "committed");
    assert.equal(freezeResult, "team_confirmation_required",
      "freeze observes the committed invitation before account freeze, with no lock cycle");
    assert.equal(psql(`SELECT privacy_deletion_requested_at IS NULL FROM users WHERE id='${owner}'`), "t");
    assert.equal(psql(`SELECT team_cleanup_invitation((SELECT id FROM team_invitations WHERE token_hash='race-token'),'race-token')`),"t",
      "email delivery failure cleanup succeeds while owner and inviter remain active");
    assert.equal(psql(`SELECT public.auth_create_email_verification_token('${owner}','new-verify','/x')`), "t");
    assert.equal(psql(`SELECT public.auth_create_password_reset_token('${owner}','new-reset','/x')`), "t");

    psql(`INSERT INTO team_invitations(business_id,invited_by,email,role,token_hash,expires_at)
      VALUES ('${biz}','${owner}','cleanup-frozen@example.test','member','cleanup-frozen-token',now()+interval '1 day');`);

    const begin = psql(`SELECT operation_id::text FROM privacy_begin_account_deletion('${owner}',true)`);
    assert.ok(begin);
    let cleanupError="";
    try { psql(`SELECT team_cleanup_invitation((SELECT id FROM team_invitations WHERE token_hash='cleanup-frozen-token'),'cleanup-frozen-token')`); }
    catch(error) { cleanupError=String(error); }
    assert.match(cleanupError,/privacy_account_frozen/,"cleanup cannot mutate a frozen owner's invitation outside the finalizer");
    assert.equal(psql(`SELECT count(*) FROM public.auth_consume_email_verification_token('new-verify')`), "0");
    assert.equal(psql(`SELECT count(*) FROM public.auth_consume_password_reset_token('new-reset','replacement-hash')`), "0");
    assert.equal(psql(`SELECT public.auth_create_email_verification_token('${owner}','blocked-verify','/x')`), "f");
    assert.equal(psql(`SELECT public.auth_create_password_reset_token('${owner}','blocked-reset','/x')`), "f");
    assert.equal(psql(`SELECT password_hash FROM users WHERE id='${owner}'`), "hash", "frozen reset token cannot change credentials");

    const oauthFrozen = "00000000-0000-4000-8000-000000000103";
    psql(`INSERT INTO users(id,email,name) VALUES('${oauthFrozen}','oauth-frozen@example.test','Original name');
      INSERT INTO profiles(id,full_name) VALUES('${oauthFrozen}','Original profile');
      UPDATE users SET privacy_deletion_requested_at=now() WHERE id='${oauthFrozen}';`);
    const userApi = loadTs<typeof import("../src/lib/db/users.js")>("src/lib/db/users.ts", { overrides: { "@/lib/db/neon": { sql: dbAdapter() } } });
    const oauthResult = await userApi.ensureUserFromOAuth({ email: "oauth-frozen@example.test", name: "Provider changed name", image: "provider-image" });
    assert.equal(oauthResult.id, oauthFrozen);
    assert.ok(oauthResult.privacy_deletion_requested_at, "OAuth reconnect identifies the restricted account");
    assert.equal(psql(`SELECT name FROM users WHERE id='${oauthFrozen}'`), "Original name", "OAuth reauthentication cannot update the frozen profile");
    assert.equal(psql(`SELECT full_name FROM profiles WHERE id='${oauthFrozen}'`), "Original profile");

    const contextApi = loadTs<typeof import("../src/lib/business-context.js")>("src/lib/business-context.ts", { overrides: { "@/lib/db/neon": { sql: dbAdapter() } } });
    assert.equal(await contextApi.resolveBusinessContext(member, biz), null, "selected business context hides a frozen owner from a surviving member");
    assert.equal(await contextApi.resolveBusinessContext(member), null, "default business context also hides a frozen owner");
    const businessApi = loadTs<typeof import("../src/lib/db/businesses.js")>("src/lib/db/businesses.ts", { overrides: { "@/lib/db/neon": { sql: dbAdapter() } } });
    assert.equal(await businessApi.getBusinessForUser(member), null, "direct business lookup denies frozen-owner workspaces");
    await assert.rejects(businessApi.getOrCreateBusinessForUser(member), /Could not resolve user/,
      "a member of a frozen workspace cannot be bootstrapped into a new workspace by an email or membership fallback");

    let insertionError = "";
    try { psql(`INSERT INTO team_invitations(business_id,invited_by,email,role,token_hash,expires_at) VALUES ('${biz}','${owner}','blocked@example.test','member','blocked-token',now()+interval '1 day')`); }
    catch (error) { insertionError = String(error); }
    assert.match(insertionError, /privacy_account_frozen/);

    const memberOperation = psql(`SELECT operation_id::text FROM privacy_begin_account_deletion('${member}',false)`);
    assert.ok(memberOperation);
    let memberError = "";
    try { psql(`INSERT INTO business_members(business_id,user_id,role) VALUES ('${biz}','${member}','member') ON CONFLICT DO NOTHING`); }
    catch (error) { memberError = String(error); }
    assert.match(memberError, /privacy_account_frozen/, "a deleting member cannot be re-admitted to an active owner workspace");
  } finally {
    if (started) execFileSync(pgExe("pg_ctl"), ["-D", dataDir, "-m", "immediate", "-w", "stop"], { stdio: "ignore" });
    rmSync(dir, { recursive: true, force: true });
  }
});
