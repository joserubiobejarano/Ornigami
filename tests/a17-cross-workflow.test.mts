import assert from "node:assert/strict";
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, resolve, sep } from "node:path";
import test from "node:test";
import { loadTs } from "./a17-workflow-harness.mts";
import { availablePostgresTestPort } from "./postgres-test-port.mts";

const root = process.cwd();
const testRoot = resolve(root, ".next");
const pgBin = process.env.A17_PG_BIN ?? process.env.A04_PG_BIN ?? process.env.PG_BIN;
const pgExe = (name: string) => {
  if (process.platform === "win32") return join(pgBin ?? "C:/Program Files/PostgreSQL/17/bin", `${name}.exe`);
  return pgBin ? join(pgBin, name) : name;
};
const ids = {
  owner: "a1700000-0000-4000-8000-000000000001",
  member: "a1700000-0000-4000-8000-000000000002",
  business: "a1700000-0000-4000-8000-000000000003",
  outsider: "a1700000-0000-4000-8000-000000000004",
};

function quote(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("invalid SQL number");
    return String(value);
  }
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  return `'${String(value).replaceAll("'", "''")}'`;
}

test("member intake reaches the owner-funded Booster send path and respects downgrade and owner freeze", { timeout: 120_000 }, async () => {
  mkdirSync(testRoot, { recursive: true });
  const dir = mkdtempSync(join(testRoot, "a17-cross-workflow-pg-"));
  assert.ok(resolve(dir).startsWith(`${testRoot}${sep}`), "disposable PostgreSQL data stays under workspace .next");
  const dataDir = join(dir, "data");
  let started = false;
  let port = 0;
  const psql = (statement: string) => execFileSync(pgExe("psql"), [
    "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-h", "127.0.0.1", "-p", String(port), "-U", "postgres", "-d", "postgres", "-f", "-",
  ], { encoding: "utf8", input: statement }).trim();

  try {
    execFileSync(pgExe("initdb"), ["-D", dataDir, "-U", "postgres", "-A", "trust", "--no-locale", "--encoding=UTF8"], { stdio: "ignore" });
    appendFileSync(join(dataDir, "postgresql.conf"), "\nunix_socket_directories = ''\n");
    port = await availablePostgresTestPort();
    execFileSync(pgExe("pg_ctl"), ["-D", dataDir, "-l", join(dir, "postgres.log"), "-o", `-h 127.0.0.1 -p ${port} -F`, "-w", "start"], { stdio: "ignore" });
    started = true;

    const migrationsDir = join(root, "neon/migrations");
    const migrations = readdirSync(migrationsDir)
      .filter((name) => /^\d{3}_.+\.sql$/.test(name))
      .sort((a, b) => Number(a.slice(0, 3)) - Number(b.slice(0, 3)));
    for (const migration of migrations) psql(readFileSync(join(migrationsDir, migration), "utf8"));
    psql(`INSERT INTO public.users(id,email,name,email_verified) VALUES
      ('${ids.owner}','a17-owner@example.test','Canonical Owner',now()),
      ('${ids.member}','a17-member@example.test','Invited Member',now()),
      ('${ids.outsider}','a17-outsider@example.test','Unrelated User',now());
      INSERT INTO public.businesses(id,owner_user_id,name,google_review_url,language)
        VALUES ('${ids.business}','${ids.owner}','Owner Studio','https://search.google.com/local/writereview?placeid=a17-fixture','en');
      INSERT INTO public.business_members(business_id,user_id,role) VALUES ('${ids.business}','${ids.member}','member');
      INSERT INTO public.business_agents(business_id,agent_id,plan_id,status,billing_period,current_period_start,current_period_end)
        VALUES ('${ids.business}','review_booster','complete','trialing','annual',now()-interval '90 days',now()+interval '275 days');`);

    const sql = async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const query = strings.reduce((output, part, index) => output + part + (index < values.length ? quote(values[index]) : ""), "");
      const output = psql(`SELECT row_to_json(a17_query)::text FROM (${query}) a17_query;`);
      return output ? output.split(/\r?\n/).map((row) => JSON.parse(row) as Record<string, unknown>) : [];
    };
    const api = loadTs<{
      requireActiveAgentAccess(actorId: string, email: string | null, agent: "review_booster" | "review_replies", businessId?: string): Promise<unknown>;
    }>("src/lib/api-security.ts", {
      "@/auth": { auth: async () => null },
      "@/lib/db/neon": { sql },
      "@/lib/safe-logger": { safeLogger: { error: () => undefined } },
    });
    const businessCountBeforeOutsiderCheck = psql(`SELECT count(*) FROM public.businesses WHERE owner_user_id='${ids.outsider}'`);
    await assert.rejects(api.requireActiveAgentAccess(ids.outsider, "spoofed@example.test", "review_booster", ids.business), (error: unknown) =>
      Boolean(error && typeof error === "object" && "status" in error && error.status === 403));
    assert.equal(psql(`SELECT count(*) FROM public.businesses WHERE owner_user_id='${ids.outsider}'`), businessCountBeforeOutsiderCheck,
      "an explicit cross-workspace denial does not bootstrap the outsider's workspace");

    const route = loadTs<{ POST(request: Request): Promise<Response> }>("src/app/api/review-booster/visits/route.ts", {
      "@/auth": { auth: async () => ({ user: { id: ids.member, email: "untrusted-session-email@example.test" } }) },
      "@/lib/db/neon": { sql },
    });
    const request = (email: string) => new Request("http://localhost/api/review-booster/visits", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost" },
      body: JSON.stringify({ customer_name: "A17 Guest", customer_email: email, service_name: "Consultation", visited_at: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString() }),
    });

    const intake = await route.POST(request("guest@example.test"));
    assert.equal(intake.status, 201, await intake.clone().text());
    const visit = await intake.json() as { id: string; business_id: string; customer_email: string };
    assert.equal(visit.business_id, ids.business, "member intake is stored against the canonical shared workspace");
    assert.equal(visit.customer_email, "guest@example.test");

    const atomicDb = loadTs<Record<string, (...args: never[]) => unknown>>("src/modules/review-booster/services/atomic-followup-db.service.ts", {
      "@/lib/db/neon": { sql },
    });
    const reviewDb = loadTs("src/modules/review-booster/services/review-booster-db.service.ts", {
      "@/lib/api-security": { HttpError: class extends Error { status: number; constructor(status: number, message: string) { super(message); this.status = status; } } },
      "@/lib/db/neon": { sql },
    });
    const requests: Array<{ payload: Record<string, unknown>; key: string }> = [];
    const provider = {
      prepareResendPayload: async (input: Record<string, unknown>) => ({
        from: "Owner Studio <sender@example.test>", to: input.customer_email, subject: input.subject,
        text: `${input.body}\n\n${input.google_review_url}`, html: `<p>${input.body}</p>`,
        headers: { "List-Unsubscribe": "<https://example.test/unsubscribe>" },
      }),
      sendPreparedWithResend: async (payload: Record<string, unknown>, key: string) => {
        requests.push({ payload: structuredClone(payload), key });
        return `provider-${requests.length}`;
      },
      classifyResendFailure: () => "ambiguous",
    };
    const runner = loadTs<{
      createFollowupRunnerDependencies(businessId: string, actorId: string, overrides: Record<string, unknown>): Promise<Record<string, unknown>>;
      runEligibleFollowups(dependencies: Record<string, unknown>): Promise<{ sent: number; skipped: number; deferred: number }>;
    }>("src/modules/review-booster/services/followup-runner.service.ts", {
        "@/modules/review-booster/services/atomic-followup-db.service": atomicDb,
        "@/modules/review-booster/services/resend.provider": provider,
        "@/modules/review-booster/services/followup-email-generator.service": {
          buildSubject: (business: string) => `Thanks for visiting ${business}`,
          generateFollowupEmailBody: async (input: Record<string, unknown>) => `Thanks, ${input.customer_name}.`,
        },
        "@/lib/review-link-token": { buildReviewLinkUrl: ({ reviewUrl }: { reviewUrl: string }) => `https://tracked.example/?url=${encodeURIComponent(reviewUrl)}` },
        "@/lib/account-lifecycle": {
          beginAccountLifecycleOperation: async () => ({ result: "claimed", token: "a1700000-0000-4000-8000-000000000099" }),
          finishAccountLifecycleOperation: async () => true,
        },
        "@/lib/followup-run-policy": { MAX_FOLLOWUPS_PER_RUN: 50 },
        "@/modules/review-booster/services/settings-link-validation": loadTs("src/modules/review-booster/services/settings-link-validation.ts"),
        "@/modules/review-booster/services/review-booster-db.service": reviewDb,
    });
    const deps = await runner.createFollowupRunnerDependencies(ids.business, ids.member, {
      generateBody: async (candidate: { customerName: string | null }) => `Thanks, ${candidate.customerName}.`,
      preparePayload: async (candidate: { customerEmail: string; businessName: string; googleReviewUrl: string }, subject: string, body: string) => ({
        from: `${candidate.businessName} <sender@example.test>`, to: candidate.customerEmail, subject, text: `${body}\n${candidate.googleReviewUrl}`,
      }),
      sendPrepared: provider.sendPreparedWithResend,
    });
    const delivered = await runner.runEligibleFollowups(deps);
    assert.equal(delivered.sent, 1, "an annual-billed trial workspace may use its current monthly Booster allowance");
    assert.equal(requests.length, 1);
    assert.equal(requests[0]?.payload.to, "guest@example.test");
    assert.match(String(requests[0]?.payload.text), /search\.google\.com\/local\/writereview/);
    assert.ok(requests[0]?.key);
    assert.equal(psql(`SELECT followup_status FROM public.followup_visits WHERE id='${visit.id}'`), "sent");
    assert.equal(psql(`SELECT count(*) FROM public.followup_messages WHERE visit_id='${visit.id}' AND status='sent'`), "1");
    const quota = await (atomicDb.getAtomicBoosterQuota as (input: { businessId: string }) => Promise<{ usage: number; allowance: number }>)({ businessId: ids.business });
    assert.equal(quota.usage, 1);
    assert.equal(quota.allowance, 1500);

    // A pending member visit cannot cross the provider boundary after downgrade.
    const pendingBeforeDowngrade = await route.POST(request("downgrade@example.test"));
    assert.equal(pendingBeforeDowngrade.status, 201);
    psql(`UPDATE public.business_agents SET status='canceled',plan_id='free' WHERE business_id='${ids.business}' AND agent_id='review_booster';`);
    const downgradedRun = await runner.runEligibleFollowups(deps);
    assert.equal(downgradedRun.sent, 0);
    assert.equal(requests.length, 1, "no provider request starts after downgrade");
    assert.equal(psql(`SELECT followup_status FROM public.followup_visits WHERE customer_email='downgrade@example.test'`), "pending");
    const downgradedIntake = await route.POST(request("after-downgrade@example.test"));
    assert.equal(downgradedIntake.status, 403);
    assert.equal(psql(`SELECT count(*) FROM public.followup_visits WHERE customer_email='after-downgrade@example.test'`), "0");

    // Restoring a trial entitlement admits another visit; freezing the canonical
    // owner then blocks delivery even though the actor is still a member.
    psql(`UPDATE public.business_agents SET status='trialing',plan_id='complete' WHERE business_id='${ids.business}' AND agent_id='review_booster';`);
    const frozenVisitResponse = await route.POST(request("frozen@example.test"));
    assert.equal(frozenVisitResponse.status, 201, await frozenVisitResponse.clone().text());
    psql(`UPDATE public.users SET privacy_deletion_requested_at=now() WHERE id='${ids.owner}';`);
    const frozenRun = await runner.runEligibleFollowups(deps);
    assert.equal(frozenRun.sent, 0);
    assert.equal(requests.length, 1, "no provider request starts after the canonical owner is frozen");
    assert.equal(psql(`SELECT followup_status FROM public.followup_visits WHERE customer_email='frozen@example.test'`), "pending");
  } finally {
    let stopped = !started;
    if (started) {
      try {
        execFileSync(pgExe("pg_ctl"), ["-D", dataDir, "-m", "immediate", "-w", "stop"], { stdio: "ignore" });
        stopped = true;
      } catch (error) {
        const resolvedDir = resolve(dir);
        assert.ok(resolvedDir.startsWith(`${testRoot}${sep}`), "preserved database directory remains inside workspace .next");
        throw new Error(`Could not stop disposable PostgreSQL; preserving its data at ${resolvedDir}`, { cause: error });
      }
    }
    const safePrefix = `${testRoot}${sep}`;
    const resolvedDir = resolve(dir);
    assert.ok(resolvedDir.startsWith(safePrefix), "cleanup target remains within workspace .next");
    if (stopped) rmSync(resolvedDir, { recursive: true, force: true });
  }
});
