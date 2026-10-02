import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import test from "node:test";
import { loadTs } from "./auth-test-harness.mts";

const root = process.cwd();
const binDir = process.env.A04_PG_BIN ?? process.env.PG_BIN;
const pgExe = (name: string) => process.platform === "win32"
  ? join(binDir ?? "C:/Program Files/PostgreSQL/17/bin", `${name}.exe`)
  : binDir ? join(binDir, name) : name;
const execFileP = promisify(execFile);
const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");
function literal(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") { if (!Number.isFinite(value)) throw new Error("invalid SQL number"); return String(value); }
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  return `'${String(value).replaceAll("'", "''")}'`;
}
function formatSql(strings: readonly string[], values: unknown[]) {
  return strings.reduce((query, part, index) => query + part + (index < values.length ? literal(values[index]) : ""), "");
}
function args(port: number, statement: string) {
  return ["-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-h", "127.0.0.1", "-p", String(port), "-U", "postgres", "-d", "postgres", "-c", statement];
}
function psql(port: number, statement: string): string {
  return execFileSync(pgExe("psql"), args(port, statement), { encoding: "utf8" }).trim();
}
async function psqlAsync(port: number, statement: string): Promise<string> {
  const result = await execFileP(pgExe("psql"), args(port, statement), { encoding: "utf8" });
  return result.stdout.trim();
}

test("production token SQL rotates tokens and atomically consumes one valid token", async () => {
  const port = 55404;
  const testRoot = resolve(root, ".next");
  mkdirSync(testRoot, { recursive: true });
  const dir = mkdtempSync(join(testRoot, "a04-tests-pg-"));
  const safePrefix = `${testRoot}${sep}`;
  const dataDir = join(dir, "data");
  assert.ok(resolve(dir).startsWith(safePrefix));
  let started = false;
  try {
    execFileSync(pgExe("initdb"), ["-D", dataDir, "-U", "postgres", "-A", "trust", "--no-locale", "--encoding=UTF8"], { stdio: "ignore" });
    // Packaged Linux builds can default sockets to a postgres-owned system
    // directory. This isolated cluster is reached exclusively over loopback TCP.
    appendFileSync(join(dataDir, "postgresql.conf"), "\nunix_socket_directories = ''\n");
    const logFile = join(dir, "postgres.log");
    try {
      execFileSync(pgExe("pg_ctl"), ["-D", dataDir, "-l", logFile, "-o", `-h 127.0.0.1 -p ${port} -F`, "-w", "start"], { stdio: "ignore" });
    } catch (error) {
      const diagnostic = existsSync(logFile) ? readFileSync(logFile, "utf8") : "No PostgreSQL startup log was created";
      throw new Error(`Disposable PostgreSQL startup failed:\n${diagnostic}`, { cause: error });
    }
    started = true;
    const migrationsDir = join(root, "neon/migrations");
    const migrations = readdirSync(migrationsDir)
      .filter((name) => /^(?:00[1-9]|01[0-7]|020)_.*\.sql$/.test(name))
      .sort((a, b) => Number(a.slice(0, 3)) - Number(b.slice(0, 3)));
    assert.equal(migrations.length, 18);
    for (const migration of migrations) psql(port, readFileSync(join(migrationsDir, migration), "utf8"));
    psql(port, readFileSync(join(migrationsDir, "020_account_recovery.sql"), "utf8"));
    psql(port, `INSERT INTO public.users(id,email,password_hash) VALUES ('00000000-0000-0000-0000-000000000001','reset@example.com','old-hash'), ('00000000-0000-0000-0000-000000000002','verify@example.com','old-hash');`);

    // Replay the actual user/profile insert concurrently: only one signup wins.
    const userStatements: string[] = [];
    const captureUserSql = async (strings: TemplateStringsArray, ...values: unknown[]) => {
      userStatements.push(formatSql(strings, values));
      return [];
    };
    const usersDb = loadTs<typeof import("../src/lib/db/users.js")>("src/lib/db/users.ts", {
      overrides: { "@/lib/db/neon": { sql: captureUserSql } },
    });
    await usersDb.createUserWithPassword({ email: "signup@example.com", passwordHash: "bcrypt-hash", fullName: "Signup" });
    const createSql = userStatements[0]!;
    const createRun = `BEGIN; SELECT pg_sleep(0.2); ${createSql}; COMMIT;`;
    const createResults = await Promise.all([psqlAsync(port, createRun), psqlAsync(port, createRun)]);
    assert.equal(createResults.filter(Boolean).length, 1);
    assert.equal(psql(port, "SELECT count(*) FROM public.users WHERE email='signup@example.com'"), "1");
    assert.equal(psql(port, "SELECT count(*) FROM public.profiles p JOIN public.users u ON u.id=p.id WHERE u.email='signup@example.com' AND p.full_name='Signup'"), "1");

    // Exercise the real signup limits with concurrent PostgreSQL counters.
    const executeRateSql = async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const query = formatSql(strings, values);
      return [{ hits: Number(await psqlAsync(port, query)) }];
    };
    const authInput = loadTs<typeof import("../src/lib/auth-recovery-input.js")>("src/lib/auth-recovery-input.ts", {
      overrides: { "@/lib/db/neon": { sql: executeRateSql } },
    });
    const firstFour = await Promise.all(Array.from({ length: 4 }, () => authInput.allowAuthWrite("register", "signup@example.com", "203.0.113.7")));
    const nextSix = await Promise.all(Array.from({ length: 6 }, () => authInput.allowAuthWrite("register", "signup@example.com", "203.0.113.7")));
    assert.ok(firstFour.every(Boolean));
    assert.equal(nextSix.filter(Boolean).length, 1);
    assert.equal(psql(port, "SELECT count(*) FROM public.api_rate_limits"), "2");
    assert.equal(psql(port, "SELECT bool_and(hits=10) FROM public.api_rate_limits"), "t");
    const statements: string[] = [];
    const emails: Array<{ text: string }> = [];
    let verificationReads = 0;
    const sql = async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const statement = formatSql(strings, values);
      statements.push(statement);
      if (!statement.trimStart().startsWith("SELECT")) return [];
      if (statement.includes("public.password_reset_tokens")) {
        const callbackUrl = psql(port, statement);
        return callbackUrl ? [{ callback_url: callbackUrl }] : [];
      }
      if (statement.includes("public.email_verification_tokens")) {
        verificationReads++;
        const output = psql(port, statement);
        if (!output) return [];
        const split = output.lastIndexOf("|");
        return [{ callback_url: output.slice(0, split) || null, active: output.slice(split + 1) === "t" }];
      }
      throw new Error(`Unexpected helper lookup: ${statement}`);
    };
    const helper = loadTs<typeof import("../src/lib/auth-verification.js")>("src/lib/auth-verification.ts", {
      overrides: {
        "@/lib/db/neon": { sql },
        "@/lib/env": {
          getOptionalEnv: (name: string) => ({ RESEND_API_KEY: "test-key", EMAIL_FROM: "no-reply@example.com", NEXT_PUBLIC_APP_URL: "https://app.example" } as Record<string, string>)[name],
          getServerAppUrl: () => "https://app.example",
        },
      },
      fetch: async (_input, init) => {
        emails.push(JSON.parse(String(init?.body)) as { text: string });
        return new Response("{}", { status: 200 });
      },
    });

    await helper.createPasswordReset("reset@example.com", "00000000-0000-0000-0000-000000000001", "/billing");
    const firstInsert = statements.at(-1)!;
    const firstToken = emails.at(-1)!.text.match(/token=([A-Za-z0-9_-]{43})/)?.[1];
    assert.ok(firstToken);
    await helper.createPasswordReset("reset@example.com", "00000000-0000-0000-0000-000000000001", "/billing");
    const secondInsert = statements.at(-1)!;
    const secondToken = emails.at(-1)!.text.match(/token=([A-Za-z0-9_-]{43})/)?.[1];
    assert.ok(secondToken);
    assert.notEqual(firstToken, secondToken);
    psql(port, firstInsert);
    psql(port, secondInsert);
    assert.equal(psql(port, "SELECT count(*) FROM public.password_reset_tokens"), "1");
    assert.equal(psql(port, "SELECT token_hash FROM public.password_reset_tokens"), tokenHash(secondToken));

    await helper.consumePasswordReset(firstToken, "must-not-apply");
    assert.equal(psql(port, statements.at(-1)!), "", "rotated-out token cannot reset the password");
    await helper.consumePasswordReset(secondToken, "new-bcrypt-hash");
    const resetSql = statements.at(-1)!;
    const resetRun = `BEGIN; SELECT pg_sleep(0.2); ${resetSql}; COMMIT;`;
    const resetResults = await Promise.all([psqlAsync(port, resetRun), psqlAsync(port, resetRun)]);
    assert.equal(resetResults.filter(Boolean).length, 1, "only one concurrent reset consumes the token");
    assert.equal(psql(port, "SELECT auth_version FROM public.users WHERE email='reset@example.com'"), "1");
    assert.equal(psql(port, "SELECT password_hash FROM public.users WHERE email='reset@example.com'"), "new-bcrypt-hash");
    assert.equal(psql(port, "SELECT count(*) FROM public.password_reset_tokens"), "0");

    const expiredReset = "expired-reset-token";
    psql(port, `INSERT INTO public.password_reset_tokens(user_id,token_hash,expires_at,callback_url) VALUES ('00000000-0000-0000-0000-000000000001','${tokenHash(expiredReset)}',now()-interval '1 second','/return-after-reset');`);
    const expiredResult = await helper.consumePasswordReset(expiredReset, "must-not-apply");
    assert.deepEqual(JSON.parse(JSON.stringify(expiredResult)), { ok: false, callbackUrl: "/return-after-reset" });
    assert.equal(psql(port, statements.at(-1)!), "");
    assert.equal(psql(port, "SELECT auth_version FROM public.users WHERE email='reset@example.com'"), "1");

    await helper.createEmailVerification("verify@example.com", "00000000-0000-0000-0000-000000000002", "/team");
    const verifyInsert = statements.at(-1)!;
    const verifyToken = emails.at(-1)!.text.match(/token=([A-Za-z0-9_-]{43})/)?.[1];
    assert.ok(verifyToken);
    psql(port, verifyInsert);
    await helper.verifyEmailToken(verifyToken);
    const verifySql = statements.at(-1)!;
    assert.equal(verificationReads, 1);
    const verifyRun = `BEGIN; SELECT pg_sleep(0.2); ${verifySql}; COMMIT;`;
    const verifyResults = await Promise.all([psqlAsync(port, verifyRun), psqlAsync(port, verifyRun)]);
    assert.equal(verifyResults.filter(Boolean).length, 1, "only one concurrent verification consumes the token");
    assert.equal(psql(port, "SELECT email_verified IS NOT NULL FROM public.users WHERE email='verify@example.com'"), "t");
    assert.equal(psql(port, "SELECT count(*) FROM public.email_verification_tokens"), "0");

    const expiredVerify = "expired-verify-token";
    psql(port, `INSERT INTO public.email_verification_tokens(user_id,token_hash,expires_at) VALUES ('00000000-0000-0000-0000-000000000002','${tokenHash(expiredVerify)}',now()-interval '1 second');`);
    const beforeExpiredLookup = statements.length;
    const expiredVerifyResult = await helper.verifyEmailToken(expiredVerify);
    assert.equal(expiredVerifyResult.ok, false);
    assert.equal(statements.length, beforeExpiredLookup + 1);
    assert.match(statements.at(-1)!, /^\s*SELECT/i);
    assert.equal(psql(port, "SELECT count(*) FROM public.email_verification_tokens"), "1");
  } finally {
    if (started) execFileSync(pgExe("pg_ctl"), ["-D", dataDir, "-m", "immediate", "-w", "stop"], { stdio: "ignore" });
    const resolvedDir = resolve(dir);
    if (resolvedDir.startsWith(safePrefix)) rmSync(resolvedDir, { recursive: true, force: true });
  }
});
