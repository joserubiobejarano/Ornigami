import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import test from "node:test";
import { loadTs } from "./auth-test-harness.mts";
import { availablePostgresTestPort } from "./postgres-test-port.mts";

const root = process.cwd();
const binDir = process.env.A05_PG_BIN ?? process.env.A04_PG_BIN ?? process.env.PG_BIN;
const pgExe = (name: string) => process.platform === "win32"
  ? join(binDir ?? "C:/Program Files/PostgreSQL/17/bin", `${name}.exe`)
  : binDir ? join(binDir, name) : name;

function psql(port: number, statement: string): string {
  return execFileSync(pgExe("psql"), [
    "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-h", "127.0.0.1", "-p", String(port),
    "-U", "postgres", "-d", "postgres", "-f", "-",
  ], { encoding: "utf8", input: statement }).trim();
}

function psqlAsync(port: number, statement: string): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(pgExe("psql"), [
      "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-h", "127.0.0.1", "-p", String(port),
      "-U", "postgres", "-d", "postgres", "-f", "-",
    ], { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk: string) => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => { stderr += chunk; });
    child.once("error", reject);
    child.stdin.end(statement);
    child.once("close", (code) => code === 0
      ? resolvePromise(stdout.trim())
      : reject(new Error(`psql exited ${code}: ${stderr}`)));
  });
}

function openPsqlSession(port: number) {
  const child = spawn(pgExe("psql"), [
    "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-h", "127.0.0.1", "-p", String(port),
    "-U", "postgres", "-d", "postgres", "-f", "-",
  ], { stdio: ["pipe", "pipe", "pipe"] });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8").on("data", (chunk: string) => { stdout += chunk; });
  child.stderr.setEncoding("utf8").on("data", (chunk: string) => { stderr += chunk; });
  const done = new Promise<void>((resolvePromise, reject) => {
    child.once("error", reject);
    child.once("close", (code) => code === 0 ? resolvePromise() : reject(new Error(stderr || `psql exited ${code}`)));
  });
  void done.catch(() => undefined);
  return {
    write: (statement: string) => child.stdin.write(statement),
    end: () => { child.stdin.end(); return done; },
    output: () => stdout,
  };
}

function json(port: number, query: string): Record<string, unknown> {
  return JSON.parse(psql(port, query)) as Record<string, unknown>;
}

function id(n: number): string {
  return `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
}

function quote(value: string): string { return `'${value.replaceAll("'", "''")}'`; }
const delay = (ms: number) => new Promise((resolvePromise) => setTimeout(resolvePromise, ms));

function getTeamRouteAgainstPostgres(port: number, ownerId: string, businessId: string) {
  const executeSql = async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const query = strings.reduce((output, part, index) =>
      output + part + (index < values.length ? quote(String(values[index])) : ""), "");
    const output = psql(port, `SELECT row_to_json(team_query)::text FROM (${query}) team_query;`);
    return output ? output.split(/\r?\n/).map((row) => JSON.parse(row) as Record<string, unknown>) : [];
  };
  return loadTs<typeof import("../src/app/api/team/route.js")>("src/app/api/team/route.ts", { overrides: {
    "next/server": { NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) } },
    "@/auth": { auth: async () => ({ user: { id: ownerId, email: "stale-session@example.test" } }) },
    "@/lib/business-context": {
      resolveBusinessContext: async () => ({
        businessId,
        ownerUserId: ownerId,
        business: { name: "A05 test workspace" },
        role: "owner",
      }),
    },
    "@/lib/db/neon": { sql: executeSql },
    "@/lib/billing/plans": { PLANS: { complete: { seats: 3 } } },
    "@/lib/team-lifecycle": {
      hasCompleteTeamAccess: async () => true,
      isSameOriginMutation: () => true,
      reserveTeamInvitation: async () => ({ status: "reserved", invitationId: id(999) }),
      cleanupFailedTeamInvitation: async () => {},
      teamFailureResponse: () => Response.json({ error: "unexpected" }, { status: 500 }),
      teamMutationError: () => ({ message: "unexpected", httpStatus: 500 }),
    },
    "@/lib/team": {
      createTeamInvitationToken: () => "new-token",
      hashTeamInvitationToken: (token: string) => token,
      sendTeamInvitationEmail: async () => ({ sent: false }),
      teamInvitationUrl: (token: string) => `https://app.example/team/invite/${token}`,
      TEAM_INVITATION_DAYS: 7,
    },
    "@/lib/safe-logger": { safeLogger: { error: () => {} } },
  } });
}

test("A05 migration and team lifecycle serialize seats, expiry, removal, and cross-workspace acceptance", async () => {
  const nextDir = resolve(root, ".next");
  mkdirSync(nextDir, { recursive: true });
  const dir = mkdtempSync(join(nextDir, "a05-team-pg-"));
  const safePrefix = `${nextDir}${sep}`;
  assert.ok(resolve(dir).startsWith(safePrefix));
  const dataDir = join(dir, "data");
  let started = false;
  try {
    execFileSync(pgExe("initdb"), ["-D", dataDir, "-U", "postgres", "-A", "trust", "--no-locale", "--encoding=UTF8"], { stdio: "ignore" });
    const port = await availablePostgresTestPort();
    appendFileSync(join(dataDir, "postgresql.conf"), "\nunix_socket_directories = ''\n");
    const logFile = join(dir, "postgres.log");
    try {
      execFileSync(pgExe("pg_ctl"), ["-D", dataDir, "-l", logFile, "-o", `-h 127.0.0.1 -p ${port} -F`, "-w", "start"], { stdio: "ignore" });
    } catch (error) {
      throw new Error(`Disposable PostgreSQL startup failed:\n${existsSync(logFile) ? readFileSync(logFile, "utf8") : "No log"}`, { cause: error });
    }
    started = true;

    const migrationsDir = join(root, "neon/migrations");
    const migrations = readdirSync(migrationsDir)
      .filter((name) => /^\d{3}_.+\.sql$/.test(name))
      .sort((a, b) => Number(a.slice(0, 3)) - Number(b.slice(0, 3)));
    for (const migration of migrations) psql(port, readFileSync(join(migrationsDir, migration), "utf8"));

    const owners = Array.from({ length: 5 }, (_, i) => id(1 + i));
    const invitees = Array.from({ length: 12 }, (_, i) => id(20 + i));
    const usersSql = [...owners, ...invitees].map((userId, i) =>
      `('${userId}',${quote(`person${i}@example.test`)},'hash',now())`).join(",");
    const ownerF = id(6);
    const bootstrapUser = id(900);
    psql(port, `INSERT INTO public.users(id,email,password_hash,email_verified) VALUES ${usersSql},('${ownerF}','owner-f@example.test','hash',now()),('${bootstrapUser}','bootstrap@example.test','hash',now());`);

    async function workspace(businessId: string, ownerId: string) {
      psql(port, `INSERT INTO public.businesses(id,owner_user_id,name) VALUES ('${businessId}','${ownerId}','A05 test');`);
      psql(port, `INSERT INTO public.business_agents(business_id,agent_id,plan_id,status,current_period_end)
        VALUES ('${businessId}','complete','complete','active',NULL),
               ('${businessId}','review_replies','complete','active',NULL),
               ('${businessId}','review_booster','complete','active',NULL);`);
    }
    async function reserve(businessId: string, ownerId: string, email: string, token: string) {
      return json(port, `SELECT public.team_reserve_invitation('${ownerId}',
        '${businessId}',${quote(email)},${quote(token)},7)::text`);
    }
    async function accept(userId: string, token: string) {
      return json(port, `SELECT public.team_accept_invitation('${userId}',${quote(token)})::text`);
    }

    const [ownerA, ownerB, ownerC, ownerD, ownerE] = owners;
    const [userA, userB, userC, userD, userE, userF, userG] = invitees;
    const [bizA, bizB, bizC, bizD, bizE, bizF] = [101, 102, 103, 104, 105, 106].map(id);
    await workspace(bizA, ownerA);
    await workspace(bizB, ownerB);
    await workspace(bizC, ownerC);
    await workspace(bizD, ownerD);
    await workspace(bizE, ownerE);
    await workspace(bizF, ownerF);

    // The user-row mutex makes parallel first-workspace requests converge.
    const bootstrapRace = await Promise.all([
      psqlAsync(port, `SELECT row_to_json(b)::text FROM public.ensure_workspace_for_user('${bootstrapUser}','First name') b;`),
      psqlAsync(port, `SELECT row_to_json(b)::text FROM public.ensure_workspace_for_user('${bootstrapUser}','Second name') b;`),
    ]);
    const bootstrapped = bootstrapRace.map(result => JSON.parse(result) as { id: string; owner_user_id: string });
    assert.equal(bootstrapped[0]?.id, bootstrapped[1]?.id);
    assert.equal(bootstrapped[0]?.owner_user_id, bootstrapUser);
    assert.equal(psql(port, `SELECT count(*) FROM public.businesses WHERE owner_user_id='${bootstrapUser}'`), "1");

    // Invitation acceptance and first-workspace provisioning share the user
    // mutex. Either wins, but the user must never acquire a second workspace.
    const raceUser = id(901);
    const raceToken = "z".repeat(64);
    psql(port, `INSERT INTO public.users(id,email,password_hash,email_verified) VALUES ('${raceUser}','race@example.test','hash',now());`);
    await reserve(bizF, ownerF, "race@example.test", raceToken);
    const acceptanceBootstrapRace = await Promise.all([
      psqlAsync(port, `SELECT public.team_accept_invitation('${raceUser}','${raceToken}')::text`),
      psqlAsync(port, `SELECT row_to_json(b)::text FROM public.ensure_workspace_for_user('${raceUser}','Race name') b;`),
    ]);
    const acceptanceRaceResult = JSON.parse(acceptanceBootstrapRace[0]!) as { status: string };
    const bootstrapRaceResult = JSON.parse(acceptanceBootstrapRace[1]!) as { id: string; owner_user_id: string };
    assert.ok(["accepted", "another_workspace"].includes(acceptanceRaceResult.status));
    const raceWorkspaceCount = psql(port, `SELECT (count(DISTINCT business_id) + count(DISTINCT owned_id))::text FROM (
      SELECT business_id, NULL::uuid AS owned_id FROM public.business_members WHERE user_id='${raceUser}'
      UNION ALL SELECT NULL::uuid, id FROM public.businesses WHERE owner_user_id='${raceUser}'
    ) workspaces`);
    assert.equal(raceWorkspaceCount, "1");
    if (acceptanceRaceResult.status === "accepted") {
      assert.equal(bootstrapRaceResult.id, bizF);
      assert.equal(bootstrapRaceResult.owner_user_id, ownerF);
    } else {
      assert.equal(bootstrapRaceResult.owner_user_id, raceUser);
    }

    const teamRoute = getTeamRouteAgainstPostgres(port, ownerA, bizA);
    const teamResponse = await teamRoute.GET();
    assert.equal(teamResponse.status, 200);
    const teamBody = await teamResponse.json() as { members: Array<{ role: string; user_id: string }> };
    assert.deepEqual(teamBody.members.map((row) => row.role), ["owner"]);
    assert.equal(teamBody.members[0]?.user_id, ownerA, "production GET includes canonical owner without a membership row");

    // Expired rows reuse their identity and rotate the only valid token.
    const expiredEmail = "expired@example.test";
    const first = await reserve(bizA, ownerA, expiredEmail, "a".repeat(64));
    assert.equal(first.status, "reserved");
    const firstId = String(first.invitationId);
    psql(port, `UPDATE public.team_invitations SET expires_at=clock_timestamp()-interval '1 second' WHERE id='${firstId}';`);
    const rotated = await reserve(bizA, ownerA, expiredEmail, "b".repeat(64));
    assert.equal(rotated.status, "reserved");
    assert.equal(rotated.invitationId, firstId);
    assert.equal((await accept(userA, "a".repeat(64))).status, "invalid");
    assert.equal(psql(port, `SELECT public.team_cleanup_invitation('${firstId}','${"a".repeat(64)}')`), "f");
    assert.equal(psql(port, `SELECT token_hash FROM public.team_invitations WHERE id='${firstId}'`), "b".repeat(64));

    // Rerunning the migration keeps revocation authoritative and never resurrects old tokens.
    assert.equal((await json(port, `SELECT public.team_revoke_invitation('${ownerA}','${firstId}')::text`)).status, "revoked");
    psql(port, readFileSync(join(migrationsDir, "021_workspace_invitations.sql"), "utf8"));
    assert.equal(psql(port, `SELECT status FROM public.team_invitations WHERE id='${firstId}'`), "revoked");
    assert.equal((await accept(userA, "b".repeat(64))).status, "invalid");
    assert.equal((await json(port, `SELECT public.team_revoke_invitation('${ownerB}','${firstId}')::text`)).status, "forbidden");
    const emailCheckToken = "0".repeat(64);
    await reserve(bizA, ownerA, "person6@example.test", emailCheckToken);
    assert.equal((await accept(userA, emailCheckToken)).status, "email_mismatch", "acceptance compares persisted verified email");

    // Concurrent reservations at two remaining seats admit exactly one request.
    psql(port, `INSERT INTO public.business_members(business_id,user_id,role) VALUES ('${bizB}','${userB}','member');`);
    const reserveRace = await Promise.all([
      psqlAsync(port, `SELECT public.team_reserve_invitation('${ownerB}','${bizB}','seat-a@example.test','${"c".repeat(64)}',7)::text`),
      psqlAsync(port, `SELECT public.team_reserve_invitation('${ownerB}','${bizB}','seat-b@example.test','${"d".repeat(64)}',7)::text`),
    ]);
    const reserveStatuses = reserveRace.map((result) => (JSON.parse(result) as { status: string }).status).sort();
    assert.deepEqual(reserveStatuses, ["reserved", "seats_full"]);
    assert.equal(psql(port, `SELECT count(*) FROM public.team_invitations WHERE business_id='${bizB}' AND status='pending' AND expires_at>clock_timestamp()`), "1");

    psql(port, `UPDATE public.business_agents SET status='past_due',current_period_end=clock_timestamp()-interval '6 days' WHERE business_id='${bizB}';`);
    assert.equal(psql(port, `SELECT public.team_has_complete_access('${bizB}')::text`), "true", "current seven-day grace remains in force");
    psql(port, `UPDATE public.business_agents SET current_period_end=clock_timestamp()-interval '8 days' WHERE business_id='${bizB}';`);
    assert.equal(psql(port, `SELECT public.team_has_complete_access('${bizB}')::text`), "false", "Complete access ends after existing grace");

    // Two accepted invitations fit exactly beside the canonical owner, with no owner membership row.
    const acceptTokenA = "e".repeat(64);
    const acceptTokenB = "f".repeat(64);
    await reserve(bizC, ownerC, "person9@example.test", acceptTokenA);
    await reserve(bizC, ownerC, "person10@example.test", acceptTokenB);
    const acceptRace = await Promise.all([psqlAsync(port, `SELECT public.team_accept_invitation('${userE}','${acceptTokenA}')::text`),
      psqlAsync(port, `SELECT public.team_accept_invitation('${userF}','${acceptTokenB}')::text`)]);
    assert.deepEqual(acceptRace.map((result) => (JSON.parse(result) as { status: string }).status).sort(), ["accepted", "accepted"]);
    assert.equal(psql(port, `SELECT 1+count(*) FROM public.business_members WHERE business_id='${bizC}'`), "3");
    const acceptedId = psql(port, `SELECT id FROM public.team_invitations WHERE business_id='${bizC}' AND token_hash='${acceptTokenA}'`);
    assert.equal(psql(port, `SELECT public.team_cleanup_invitation('${acceptedId}','${acceptTokenA}')`), "f");

    // Start acceptance in a transaction before expiry, prove it is blocked behind
    // the business lock, then release only after the stored deadline has passed.
    const expiringToken = "7".repeat(64);
    await reserve(bizE, ownerE, "person11@example.test", expiringToken);
    const heldBusiness = openPsqlSession(port);
    let holderReleased = false;
    let duringExpiry: Promise<string> | undefined;
    const releaseHolder = async (commit: boolean) => {
      if (holderReleased) return;
      holderReleased = true;
      heldBusiness.write(commit ? "COMMIT;\n" : "ROLLBACK;\n");
      await heldBusiness.end();
    };
    try {
      heldBusiness.write(`BEGIN; SELECT id FROM public.businesses WHERE id='${bizE}' FOR UPDATE;
        \\echo A05_EXPIRY_LOCK_HELD\n`);
      const readinessDeadline = Date.now() + 15_000;
      while (Date.now() < readinessDeadline && !heldBusiness.output().includes("A05_EXPIRY_LOCK_HELD")) await delay(25);
      assert.ok(heldBusiness.output().includes("A05_EXPIRY_LOCK_HELD"), "business mutex is held before acceptance begins");

      duringExpiry = psqlAsync(port, `SET application_name='a05_expiring_accept'; BEGIN;
        SELECT (now()<expires_at)::text FROM public.team_invitations WHERE token_hash='${expiringToken}';
        SELECT public.team_accept_invitation('${userG}','${expiringToken}')::text; COMMIT;`);
      void duringExpiry.catch(() => undefined);
      const acceptanceDeadline = Date.now() + 15_000;
      let acceptWaitFound = false;
      while (Date.now() < acceptanceDeadline) {
        const waiting = psql(port, `SELECT count(*) FROM pg_stat_activity a
          JOIN public.team_invitations i ON i.token_hash='${expiringToken}'
          WHERE a.application_name='a05_expiring_accept' AND a.state='active'
            AND a.wait_event_type='Lock' AND a.xact_start<i.expires_at`);
        if (waiting === "1") { acceptWaitFound = true; break; }
        await delay(25);
      }
      assert.equal(acceptWaitFound, true, "acceptance transaction began before expiry and waits behind the business lock");
      const acceptanceStart = new Date(psql(port, `SELECT xact_start::text FROM pg_stat_activity
        WHERE application_name='a05_expiring_accept' AND state='active' AND wait_event_type='Lock'`)).getTime();
      assert.ok(Number.isFinite(acceptanceStart), "blocked acceptance exposes its transaction start");
      heldBusiness.write(`UPDATE public.team_invitations SET expires_at=(
          SELECT xact_start + (clock_timestamp()-xact_start)/2 FROM pg_stat_activity
          WHERE application_name='a05_expiring_accept' AND state='active' AND wait_event_type='Lock'
        ) WHERE token_hash='${expiringToken}' RETURNING expires_at::text;
        SELECT ((i.expires_at>a.xact_start AND i.expires_at<clock_timestamp())::text)||'|'||i.expires_at::text
          FROM public.team_invitations i CROSS JOIN pg_stat_activity a
          WHERE i.token_hash='${expiringToken}' AND a.application_name='a05_expiring_accept';
        \\echo A05_DEADLINE_SET\n`);
      const deadlineSet = Date.now() + 15_000;
      while (Date.now() < deadlineSet && !heldBusiness.output().includes("A05_DEADLINE_SET")) await delay(25);
      assert.ok(heldBusiness.output().includes("A05_DEADLINE_SET"), "holder set the deadline after acceptance began");
      assert.ok(heldBusiness.output().includes("true|"), "stored deadline is after PostgreSQL transaction start and before clock_timestamp()");
      await releaseHolder(true);
      assert.equal(psql(port, `SELECT (expires_at<clock_timestamp())::text FROM public.team_invitations WHERE token_hash='${expiringToken}'`), "true",
        "committed deadline is already expired at lock release");
      const acceptedOutput = (await duringExpiry).split(/\r?\n/);
      assert.equal(acceptedOutput[0], "true", "transaction-start now() was still before expiry");
      assert.equal((JSON.parse(acceptedOutput[1]) as { status: string }).status, "invalid", "post-lock clock_timestamp() rejects the expired invitation");
    } finally {
      await releaseHolder(false);
      await duringExpiry?.catch(() => undefined);
    }

    // Old overbooked data cannot turn a pending invitation into an extra member.
    const legacy = [userA, userB, userC, userD];
    psql(port, `INSERT INTO public.team_invitations(business_id,invited_by,email,role,token_hash,expires_at)
      VALUES ${legacy.map((_, i) => `('${bizD}','${ownerD}','${i === 0 ? "person5@example.test" : `legacy${i}@example.test`}','member','${String(i + 1).repeat(64)}',clock_timestamp()+interval '1 day')`).join(",")};`);
    assert.equal((await accept(userA, "1".repeat(64))).status, "seats_full");

    // Same user accepted concurrently into separate businesses joins only one; the user row lock is shared.
    await reserve(bizA, ownerA, "person13@example.test", "9".repeat(64));
    await reserve(bizE, ownerE, "person13@example.test", "8".repeat(64));
    const crossRace = await Promise.all([psqlAsync(port, `SELECT public.team_accept_invitation('${invitees[8]}','${"9".repeat(64)}')::text`),
      psqlAsync(port, `SELECT public.team_accept_invitation('${invitees[8]}','${"8".repeat(64)}')::text`)]);
    assert.deepEqual(crossRace.map((result) => (JSON.parse(result) as { status: string }).status).sort(), ["accepted", "another_workspace"]);
    assert.equal(psql(port, `SELECT count(*) FROM public.business_members WHERE user_id='${invitees[8]}'`), "1");

    // Member removal is available independent of plan state and releases any pending reservation for that address.
    psql(port, `UPDATE public.business_agents SET status='canceled' WHERE business_id='${bizC}';`);
    assert.equal((await reserve(bizC, ownerC, "downgraded@example.test", "6".repeat(64))).status, "no_entitlement");
    assert.equal((await json(port, `SELECT public.team_remove_member('${ownerC}','${bizC}','${ownerC}')::text`)).status, "owner_protected");
    psql(port, `INSERT INTO public.team_invitations(business_id,invited_by,email,role,token_hash,expires_at)
      VALUES ('${bizC}','${ownerC}','person9@example.test','member','${"5".repeat(64)}',clock_timestamp()+interval '1 day');`);
    const removed = json(port, `SELECT public.team_remove_member('${ownerC}','${bizC}','${userE}')::text`);
    assert.equal(removed.status, "removed");
    assert.equal(psql(port, `SELECT count(*) FROM public.business_members WHERE business_id='${bizC}' AND user_id='${userE}'`), "0");
    assert.equal(psql(port, `SELECT status FROM public.team_invitations WHERE business_id='${bizC}' AND token_hash='${"5".repeat(64)}'`), "revoked");
  } finally {
    if (started) execFileSync(pgExe("pg_ctl"), ["-D", dataDir, "-m", "immediate", "-w", "stop"], { stdio: "ignore" });
    const resolvedDir = resolve(dir);
    if (resolvedDir.startsWith(safePrefix)) rmSync(resolvedDir, { recursive: true, force: true });
  }
});
