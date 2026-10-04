import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { chmod } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import test from "node:test";
import { availablePostgresTestPort } from "./postgres-test-port.mts";
import { writePrivateInboxArtifact } from "../scripts/support-inbox.mjs";
import { parseSupportTarget, verifySupportAccess } from "../scripts/a12-support-access-verify.mjs";
import { buildRoleAuditSql, provisionSupportAccess } from "../scripts/a12-support-access-provision.mjs";

const repo = process.cwd();
const binDir = process.env.A12_PG_BIN ?? process.env.PG_BIN;
const pgExe = (name: string) => process.platform === "win32"
  ? join(binDir ?? "C:/Program Files/PostgreSQL/17/bin", `${name}.exe`)
  : binDir ? join(binDir, name) : name;

test("support access verifier rejects ambiguous connection settings and wrong targets before database access", () => {
  assert.equal(parseSupportTarget("postgresql://ornigami_support_reader:synthetic@db.example.test/ornigami").sslmode, "require");
  assert.throws(() => parseSupportTarget("postgresql://ornigami_support_reader:synthetic@db.example.test/ornigami?host=other.test"), /support_connection_invalid/);
  assert.throws(() => parseSupportTarget("postgresql://ornigami_support_reader:synthetic@db.example.test/ornigami?sslmode=disable"), /support_connection_invalid/);
  assert.throws(() => parseSupportTarget("postgresql://ornigami_support_reader:synthetic@db.example.test/ornigami?sslmode=require&sslmode=verify-full"), /support_connection_invalid/);
});

test("provision wrapper checks target/private destination, audits NOLOGIN, and handles activation outcomes", async () => {
  const fixtureRoot = resolve(repo, ".next", "a12-support-access-fixtures");
  mkdirSync(fixtureRoot, { recursive: true });
  const dir = mkdtempSync(join(fixtureRoot, "provision-wrapper-"));
  const privateEnv = join(dir, "admin.env");
  writeFileSync(privateEnv, "DATABASE_URL=postgresql://fixture_admin:synthetic-secret@branch.example.neon.tech/neondb?sslmode=require\n", { mode: 0o600 });
  const prefix = ["--admin-env", privateEnv, "--expected-host", "branch.example.neon.tech", "--expected-database", "neondb"];
  const roleProof = { roleExists: true, login: false, superuser: false, createRole: false, createDatabase: false, replication: false, bypassRls: false, inherit: false, memberships: 0, publicSchemaUsage: true, feedbackSelect: true, feedbackSelectGrantable: false, feedbackMutation: false, feedbackColumnMutation: false, feedbackRls: false, otherTableAccess: false, otherSequenceAccess: false, databaseCreate: false, databaseConnect: true, schemaCreate: false, securityDefinerExecute: false };
  const artifact = await writePrivateInboxArtifact({
    page: { records: [], hasMore: false, nextCursor: null }, target: { host: "127.0.0.1", database: "postgres" },
    env: process.env, platform: process.platform,
  });
  const privateOutput = join(resolve(artifact, ".."), "support.env");
  const artifactDir = resolve(artifact, "..");
  let invoked = false;
  try {
    const unexpectedPsql = () => { invoked = true; throw new Error("SQL must not run before these guards pass"); };
    const dryRun = await provisionSupportAccess({ args: prefix, psql: unexpectedPsql });
    assert.equal(dryRun.status, "dry_run");
    assert.equal(invoked, false);
    await assert.rejects(() => provisionSupportAccess({
      args: ["--admin-env", privateEnv, "--expected-host", "wrong.example.neon.tech", "--expected-database", "neondb", "--support-env", join(dir, "support.env"), "--apply"],
      psql: unexpectedPsql,
    }), /admin_target_identity_mismatch/);
    assert.equal(invoked, false);
    await assert.rejects(() => provisionSupportAccess({
      args: [...prefix, "--support-env", join(repo, ".next", "unsafe-support.env"), "--activate"],
      psql: unexpectedPsql,
    }), /support_credential_destination_invalid/);
    assert.equal(invoked, false, "an in-checkout destination is rejected before any SQL is sent");
    const alias = join(artifactDir, "worktree-alias");
    symlinkSync(repo, alias, process.platform === "win32" ? "junction" : "dir");
    try {
      await assert.rejects(() => provisionSupportAccess({
        args: [...prefix, "--support-env", join(alias, "unsafe-support.env"), "--activate"],
        psql: unexpectedPsql,
      }), /support_credential_destination_invalid/);
      assert.equal(invoked, false, "a canonical path redirected into the checkout is rejected before SQL");
    } finally { rmSync(alias, { recursive: true, force: true }); }

    const rejectedOutput = join(artifactDir, "rejected.env");
    let rejectedCalls = 0;
    await assert.rejects(() => provisionSupportAccess({
      args: [...prefix, "--support-env", rejectedOutput, "--activate"],
      psql: () => { rejectedCalls += 1; return JSON.stringify({ ...roleProof, otherTableAccess: true }); },
    }), /support_role_not_safe_to_activate/);
    assert.equal(rejectedCalls, 1, "an out-of-scope permission stops before password activation");
    assert.equal(existsSync(rejectedOutput), false, "no candidate credential is written for an unsafe role");

    const seenSql: string[] = [];
    const activation = await provisionSupportAccess({
      args: [...prefix, "--support-env", privateOutput, "--activate"],
      psql: (_command: string, argv: string[], options: { env: NodeJS.ProcessEnv; input: string }) => {
        invoked = true;
        assert.equal(argv.includes("synthetic-secret"), false);
        assert.equal(options.env.PGPASSWORD, "synthetic-secret");
        seenSql.push(options.input);
        if (options.input.includes("roleExists")) return JSON.stringify(roleProof);
        if (options.input.includes("PASSWORD '") && options.input.includes("LOGIN")) {
          assert.match(options.input, /PASSWORD '[A-Za-z0-9_-]{43}'/);
          return "";
        }
        throw new Error("unexpected SQL operation");
      },
    });
    assert.equal(activation.status, "support_login_activated");
    assert.equal(activation.credentialAccess, process.platform === "win32" ? "current_user_only" : "owner_only");
    assert.equal(seenSql.length, 2);
    assert.equal(seenSql.some((sql) => sql.includes("synthetic-secret")), false);
    assert.match(readFileSync(privateOutput, "utf8"), /^SUPPORT_DATABASE_URL=postgresql:\/\/ornigami_support_reader:/);
    assert.equal(readFileSync(privateOutput, "utf8").includes("\n"), true);

    const failedOutput = join(artifactDir, "failed.env");
    let failStep = 0;
    await assert.rejects(() => provisionSupportAccess({
      args: [...prefix, "--support-env", failedOutput, "--activate"],
      psql: (_command: string, _argv: string[], options: { input: string }) => {
        if (options.input.includes("roleExists")) return JSON.stringify(roleProof);
        if (options.input.includes("PASSWORD '")) throw new Error("secret in suppressed diagnostic");
        if (options.input.includes("SELECT json_build_object('login'")) {
          failStep += 1;
          return JSON.stringify({ login: false });
        }
        throw new Error("unexpected SQL operation");
      },
    }), /support_activation_failed/);
    assert.equal(failStep, 2, "a failed activation is followed by a second NOLOGIN confirmation");
    assert.equal(existsSync(failedOutput), false, "a confirmed NOLOGIN failure removes its candidate credential");

    const unknownOutput = join(resolve(artifact, ".."), "uncertain.env");
    await assert.rejects(() => provisionSupportAccess({
      args: [...prefix, "--support-env", unknownOutput, "--activate"],
      psql: (_command: string, _argv: string[], options: { input: string }) => {
        if (options.input.includes("roleExists")) return JSON.stringify(roleProof);
        throw new Error("secret and provider diagnostic must be hidden");
      },
    }), /support_activation_unknown/);
    assert.equal(existsSync(unknownOutput), true, "an ambiguous outcome retains its private candidate credential");
    rmSync(unknownOutput, { force: true });
    assert.equal(invoked, true);
  } finally {
    rmSync(artifactDir, { recursive: true, force: true });
    rmSync(dir, { recursive: true, force: true });
  }
});

test("support SQL grants only feedback SELECT, verifier proves identity and private artifact, and negative ACL cases fail closed", async () => {
  const port = await availablePostgresTestPort();
  const fixtureRoot = resolve(repo, ".next", "a12-support-access-fixtures");
  mkdirSync(fixtureRoot, { recursive: true });
  const dir = mkdtempSync(join(fixtureRoot, "local-pg-"));
  const safeRoot = `${resolve(fixtureRoot)}${sep}`;
  assert.ok(resolve(dir).startsWith(safeRoot), "PostgreSQL fixture remains under .next task directory");
  const dataDir = join(dir, "data");
  let started = false;
  const psql = (sql: string, db = "postgres", user = "postgres", portValue = port) => execFileSync(pgExe("psql"), [
    "--no-psqlrc", "--quiet", "--no-align", "--tuples-only", "--set", "ON_ERROR_STOP=1",
    "--host", "127.0.0.1", "--port", String(portValue), "--username", user, "--dbname", db,
  ], { encoding: "utf8", input: sql, stdio: ["pipe", "pipe", "pipe"], windowsHide: true }).trim();
  try {
    execFileSync(pgExe("initdb"), ["-D", dataDir, "-U", "postgres", "-A", "trust", "--no-locale", "--encoding=UTF8"], { stdio: "ignore" });
    appendFileSync(join(dataDir, "postgresql.conf"), "\nunix_socket_directories = ''\n");
    const log = join(dir, "postgres.log");
    execFileSync(pgExe("pg_ctl"), ["-D", dataDir, "-l", log, "-o", `-h 127.0.0.1 -p ${port} -F`, "-w", "start"], { stdio: "ignore" });
    started = true;
    psql("CREATE TABLE public.feedback(id integer PRIMARY KEY, message text NOT NULL); INSERT INTO public.feedback VALUES (1, 'synthetic support message'); CREATE TABLE public.private_table(secret text); CREATE SEQUENCE public.private_sequence;");
    const provisioningFile = readFileSync(join(repo, "docs", "tasks", "A12_SUPPORT_ACCESS.sql"), "utf8");
    const transactionSql = provisioningFile.split(/\r?\n\\password\b/)[0];
    assert.match(transactionSql, /CREATE ROLE ornigami_support_reader\s+NOLOGIN NOINHERIT/);
    assert.ok(!transactionSql.includes("PASSWORD"), "committed SQL has no credential material");
    psql(transactionSql);
    const noLoginAudit = JSON.parse(psql(buildRoleAuditSql()));
    assert.equal(noLoginAudit.roleExists, true);
    assert.equal(noLoginAudit.login, false);
    assert.equal(noLoginAudit.feedbackSelect, true);
    psql("ALTER ROLE ornigami_support_reader PASSWORD 'SyntheticLocalOnlyPassword_71'; ALTER ROLE ornigami_support_reader LOGIN");

    const artifactBase = mkdtempSync(join(dir, "private-artifact-root-"));
    const artifact = await writePrivateInboxArtifact({
      page: { records: [], hasMore: false, nextCursor: null },
      target: { host: "127.0.0.1", database: "postgres" },
      env: { ...process.env, NODE_ENV: "test", LOCALAPPDATA: artifactBase, XDG_STATE_HOME: artifactBase },
      platform: process.platform,
    });
    const supportUrl = `postgresql://ornigami_support_reader:synthetic@127.0.0.1:${port}/postgres?sslmode=disable`;
    const env = { NODE_ENV: "test" as const, SUPPORT_DATABASE_URL: supportUrl, PGHOST: "wrong.host", PGUSER: "postgres", PGPASSWORD: "must-not-be-used" };
    const verified = await verifySupportAccess({
      args: ["--expected-host", "127.0.0.1", "--expected-database", "postgres", "--artifact", artifact], env,
    });
    assert.equal(verified.status, "support_access_verified");
    assert.equal(verified.database.role, "ornigami_support_reader");
    assert.equal(verified.database.selectFeedback, true);
    assert.equal(verified.database.otherTableAccess, false);
    assert.equal(verified.artifact.status, "private_artifact_verified");
    assert.equal(verified.database.temporaryObjectPrivilege, true, "PostgreSQL's default PUBLIC TEMP is separate from persistent application-table privileges");
    await assert.rejects(() => verifySupportAccess({
      args: ["--expected-host", "elsewhere.example", "--expected-database", "postgres", "--artifact", artifact], env,
    }), /support_target_identity_mismatch/);
    assert.throws(() => psql("UPDATE public.feedback SET message='should fail' WHERE id=1", "postgres", "ornigami_support_reader"), /permission denied/);
    assert.equal(psql("SELECT message FROM public.feedback", "postgres", "ornigami_support_reader"), "synthetic support message");

    psql("REVOKE USAGE ON SCHEMA public FROM PUBLIC, ornigami_support_reader");
    await assert.rejects(() => verifySupportAccess({
      args: ["--expected-host", "127.0.0.1", "--expected-database", "postgres", "--artifact", artifact], env,
    }), /support_(?:database_probe_failed|permissions_out_of_scope)/);
    psql("GRANT USAGE ON SCHEMA public TO PUBLIC, ornigami_support_reader");
    assert.equal((await verifySupportAccess({
      args: ["--expected-host", "127.0.0.1", "--expected-database", "postgres", "--artifact", artifact], env,
    })).status, "support_access_verified");

    psql("GRANT SELECT ON public.private_table TO ornigami_support_reader");
    await assert.rejects(() => verifySupportAccess({
      args: ["--expected-host", "127.0.0.1", "--expected-database", "postgres", "--artifact", artifact], env,
    }), /support_permissions_out_of_scope/);
    psql("REVOKE SELECT ON public.private_table FROM ornigami_support_reader; GRANT UPDATE(message) ON public.feedback TO ornigami_support_reader");
    await assert.rejects(() => verifySupportAccess({
      args: ["--expected-host", "127.0.0.1", "--expected-database", "postgres", "--artifact", artifact], env,
    }), /support_permissions_out_of_scope/);
    psql("REVOKE UPDATE(message) ON public.feedback FROM ornigami_support_reader; GRANT SELECT(secret) ON public.private_table TO ornigami_support_reader");
    await assert.rejects(() => verifySupportAccess({
      args: ["--expected-host", "127.0.0.1", "--expected-database", "postgres", "--artifact", artifact], env,
    }), /support_permissions_out_of_scope/);
    psql("REVOKE SELECT(secret) ON public.private_table FROM ornigami_support_reader; GRANT USAGE ON SEQUENCE public.private_sequence TO ornigami_support_reader");
    await assert.rejects(() => verifySupportAccess({
      args: ["--expected-host", "127.0.0.1", "--expected-database", "postgres", "--artifact", artifact], env,
    }), /support_permissions_out_of_scope/);
    psql("REVOKE USAGE ON SEQUENCE public.private_sequence FROM ornigami_support_reader; GRANT MAINTAIN ON TABLE public.feedback TO ornigami_support_reader");
    await assert.rejects(() => verifySupportAccess({
      args: ["--expected-host", "127.0.0.1", "--expected-database", "postgres", "--artifact", artifact], env,
    }), /support_permissions_out_of_scope/);
    psql("REVOKE MAINTAIN ON TABLE public.feedback FROM ornigami_support_reader; GRANT SELECT ON TABLE public.feedback TO ornigami_support_reader WITH GRANT OPTION");
    await assert.rejects(() => verifySupportAccess({
      args: ["--expected-host", "127.0.0.1", "--expected-database", "postgres", "--artifact", artifact], env,
    }), /support_permissions_out_of_scope/);
    psql("REVOKE ALL PRIVILEGES ON public.feedback FROM ornigami_support_reader; GRANT SELECT ON public.feedback TO ornigami_support_reader");
    assert.equal((await verifySupportAccess({
      args: ["--expected-host", "127.0.0.1", "--expected-database", "postgres", "--artifact", artifact], env,
    })).status, "support_access_verified", "each negative permission case begins with a valid role");
    psql("CREATE ROLE synthetic_support_admin NOLOGIN; GRANT synthetic_support_admin TO ornigami_support_reader");
    await assert.rejects(() => verifySupportAccess({
      args: ["--expected-host", "127.0.0.1", "--expected-database", "postgres", "--artifact", artifact], env,
    }), /support_permissions_out_of_scope/);
    psql("REVOKE synthetic_support_admin FROM ornigami_support_reader; DROP ROLE synthetic_support_admin");
    const artifactDir = resolve(artifact, "..");
    if (process.platform === "win32") {
      execFileSync("icacls.exe", [artifactDir, "/grant", "Everyone:(F)"], { stdio: "ignore", windowsHide: true });
      await assert.rejects(() => verifySupportAccess({
        args: ["--expected-host", "127.0.0.1", "--expected-database", "postgres", "--artifact", artifact], env,
      }), /artifact_access_not_private/);
      execFileSync("icacls.exe", [artifactDir, "/remove:g", "Everyone"], { stdio: "ignore", windowsHide: true });
    } else {
      await chmod(artifactDir, 0o755);
      await assert.rejects(() => verifySupportAccess({
        args: ["--expected-host", "127.0.0.1", "--expected-database", "postgres", "--artifact", artifact], env,
      }), /artifact_access_not_private/);
      await chmod(artifactDir, 0o700);
    }
    psql("REVOKE CONNECT ON DATABASE postgres FROM ornigami_support_reader; REVOKE USAGE ON SCHEMA public FROM ornigami_support_reader; REVOKE SELECT ON public.feedback FROM ornigami_support_reader; DROP ROLE ornigami_support_reader; GRANT SELECT ON public.private_table TO PUBLIC");
    assert.throws(() => psql(transactionSql), /another persistent table/);
    assert.equal(psql("SELECT count(*) FROM pg_catalog.pg_roles WHERE rolname='ornigami_support_reader'"), "0", "PUBLIC access conflict rolled back role creation");
    psql("REVOKE SELECT ON public.private_table FROM PUBLIC");
  } catch (error) {
    if (existsSync(join(dir, "postgres.log"))) {
      const log = readFileSync(join(dir, "postgres.log"), "utf8");
      if (error && typeof error === "object") Object.defineProperty(error, "message", { value: `${String(error)}\nDisposable PostgreSQL log:\n${log}` });
    }
    throw error;
  } finally {
    if (started) execFileSync(pgExe("pg_ctl"), ["-D", dataDir, "-m", "immediate", "-w", "stop"], { stdio: "ignore" });
    if (resolve(dir).startsWith(safeRoot)) rmSync(resolve(dir), { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
});
