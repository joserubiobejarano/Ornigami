import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import test from "node:test";
import { availablePostgresTestPort } from "./postgres-test-port.mts";
import { loadTs as loadSameRealmTs } from "./a02-test-support.mts";

const root = process.cwd();
const binDir = process.env.A13_PG_BIN ?? process.env.A04_PG_BIN ?? process.env.PG_BIN;
const pgExe = (name: string) => process.platform === "win32"
  ? join(binDir ?? "C:/Program Files/PostgreSQL/17/bin", `${name}.exe`)
  : binDir ? join(binDir, name) : name;
let port = 0;
const { NextRequest } = createRequire(import.meta.url)("next/server") as typeof import("next/server");
const dashboardPagination = loadSameRealmTs<typeof import("../src/lib/dashboard-pagination.js")>("src/lib/dashboard-pagination.ts", {});

function psql(statement: string): string {
  return execFileSync(pgExe("psql"), ["-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-h", "127.0.0.1", "-p", String(port), "-U", "postgres", "-d", "postgres", "-c", statement], { encoding: "utf8" }).trim();
}

const quote = (value: unknown) => value == null ? "NULL" : typeof value === "number" ? String(value) : `'${String(value).replaceAll("'", "''")}'`;

function sqlExecutor() {
  return async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const query = strings.reduce((output, part, index) => output + part + (index < values.length ? quote(values[index]) : ""), "");
    const output = psql(`WITH a13_query AS (${query}) SELECT row_to_json(a13_query)::text FROM a13_query`);
    return output ? output.split(/\r?\n/).map((line) => JSON.parse(line) as Record<string, unknown>) : [];
  };
}

test("A13 pagination indexes seek into large business/location datasets and independent aggregates avoid fanout", async () => {
  const testRoot = resolve(root, ".next");
  mkdirSync(testRoot, { recursive: true });
  const dir = mkdtempSync(join(testRoot, "a13-pagination-pg-"));
  const dataDir = join(dir, "data");
  assert.ok(resolve(dir).startsWith(`${testRoot}${sep}`));
  let started = false;
  try {
    execFileSync(pgExe("initdb"), ["-D", dataDir, "-U", "postgres", "-A", "trust", "--no-locale", "--encoding=UTF8"], { stdio: "ignore" });
    appendFileSync(join(dataDir, "postgresql.conf"), "\nunix_socket_directories = ''\n");
    const logFile = join(dir, "postgres.log");
    port = await availablePostgresTestPort();
    try {
      execFileSync(pgExe("pg_ctl"), ["-D", dataDir, "-l", logFile, "-o", `-h 127.0.0.1 -p ${port} -F`, "-w", "start"], { stdio: "ignore" });
    } catch (error) {
      throw new Error(`Disposable PostgreSQL startup failed:\n${existsSync(logFile) ? readFileSync(logFile, "utf8") : "No PostgreSQL log"}`, { cause: error });
    }
    started = true;
    psql(`
      CREATE TABLE public.reviews(id bigint NOT NULL, business_id uuid NOT NULL, location_name text NOT NULL, review_update_time timestamptz,
        google_review_id text, reviewer_name text, star_rating int, comment text, status text, reply_comment text);
      CREATE TABLE public.followup_visits(id uuid NOT NULL, business_id uuid NOT NULL, visited_at timestamptz NOT NULL,
        customer_name text, customer_email text, customer_phone text, service_name text, source text, followup_status text,
        followup_sent_at timestamptz, attempt_count int, next_attempt_at timestamptz, last_error text);
      CREATE TABLE public.businesses(id uuid NOT NULL, name text, business_type text, city text, google_review_url text,
        rebooking_url text, tone text, language text, email_from_name text);
      CREATE TABLE public.booster_followup_deliveries(business_id uuid NOT NULL, visit_id uuid NOT NULL, state text, error_message text);
      CREATE TABLE public.followup_messages(visit_id uuid NOT NULL, error_message text, created_at timestamptz);
      CREATE TABLE public.review_replies(id bigint NOT NULL, business_id uuid NOT NULL, review_id bigint NOT NULL, posted boolean NOT NULL, draft_markdown text);
      CREATE TABLE public.review_reply_draft_state(review_id bigint NOT NULL, business_id uuid NOT NULL, reply_id bigint,
        state text, version int, updated_at timestamptz, posting_token uuid, posting_lease_until timestamptz);
      CREATE TABLE public.review_link_clicks(id uuid NOT NULL, business_id uuid NOT NULL, clicked_at timestamptz NOT NULL);
      INSERT INTO public.reviews
        SELECT n, CASE WHEN n % 5 = 0 THEN '00000000-0000-4000-8000-000000000002'::uuid ELSE '00000000-0000-4000-8000-000000000001'::uuid END,
          CASE WHEN n % 4 = 0 THEN 'locations/other' ELSE 'locations/target' END,
          CASE WHEN n % 29 = 0 THEN NULL ELSE timestamptz '2020-01-01 00:00:00+00' + n * interval '1 second' END
        FROM generate_series(1,120000) AS n;
      INSERT INTO public.followup_visits(id,business_id,visited_at,followup_status,followup_sent_at)
        SELECT ('10000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,
          CASE WHEN n % 5 = 0 THEN '00000000-0000-4000-8000-000000000002'::uuid ELSE '00000000-0000-4000-8000-000000000001'::uuid END,
          timestamptz '2020-01-01 00:00:00+00' + n * interval '1 second',
          CASE WHEN n % 2 = 0 THEN 'sent' ELSE 'pending' END,
          CASE WHEN n % 2 = 0 THEN timestamptz '2020-01-02 00:00:00+00' ELSE NULL END
        FROM generate_series(1,120000) AS n;
      INSERT INTO public.review_replies SELECT n, '00000000-0000-4000-8000-000000000001'::uuid, n, n % 2 = 0 FROM generate_series(1,24000) n;
      INSERT INTO public.review_link_clicks
        SELECT ('20000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid, '00000000-0000-4000-8000-000000000001'::uuid, now()
        FROM generate_series(1,60000) n;
      ANALYZE;
    `);
    psql(readFileSync(join(root, "neon/migrations/028_dashboard_pagination.sql"), "utf8"));
    psql("ANALYZE");

    const reviewPlan = JSON.parse(psql(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
      SELECT id, review_update_time FROM public.reviews
      WHERE business_id='00000000-0000-4000-8000-000000000001' AND location_name='locations/target'
        AND (COALESCE(review_update_time,'-infinity'::timestamptz),id)<(timestamptz '2020-01-02 00:00:00+00',90000)
      ORDER BY COALESCE(review_update_time,'-infinity'::timestamptz) DESC,id DESC LIMIT 51`)) as Array<{ Plan: Record<string, unknown>; "Execution Time": number }>;
    assert.ok(JSON.stringify(reviewPlan).includes("reviews_business_location_page_idx"), "review continuation page should use the covering order index");
    const reviewActualRows = Number(reviewPlan[0]!.Plan["Actual Rows"]);
    assert.ok(reviewActualRows > 0 && reviewActualRows <= 51, "review page query should return at most the requested 51 rows");

    const visitPlan = JSON.parse(psql(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
      SELECT id, visited_at FROM public.followup_visits
      WHERE business_id='00000000-0000-4000-8000-000000000001'
        AND (visited_at,id)<(timestamptz '2020-01-02 00:00:00+00','10000000-0000-4000-8000-000000090000'::uuid)
      ORDER BY visited_at DESC,id DESC LIMIT 51`)) as Array<{ Plan: Record<string, unknown>; "Execution Time": number }>;
    assert.ok(JSON.stringify(visitPlan).includes("followup_visits_business_page_idx"), "visit continuation page should use the business keyset index");
    const visitActualRows = Number(visitPlan[0]!.Plan["Actual Rows"]);
    assert.ok(visitActualRows > 0 && visitActualRows <= 51, "visit page query should return at most the requested 51 rows");

    const businessA = "00000000-0000-4000-8000-000000000003";
    const businessB = "00000000-0000-4000-8000-000000000004";
    const reviewLocation = "locations/pagination-fixture";
    psql(`
      INSERT INTO public.businesses(id,name) VALUES('${businessA}','A13 fixture'),('${businessB}','Other business');
      INSERT INTO public.reviews(id,business_id,location_name,google_review_id,reviewer_name,status,review_update_time,reply_comment)
      VALUES (900001,'${businessA}','${reviewLocation}','review-1','One','new','2026-01-03 04:05:06.123456+00',NULL),
        (900002,'${businessA}','${reviewLocation}','review-2','Two','new','2026-01-03 04:05:06.123456+00',NULL),
        (900003,'${businessA}','${reviewLocation}','review-3','Three','new','2026-01-02 04:05:06.000001+00',NULL),
        (900004,'${businessA}','${reviewLocation}','review-4','Four','new',NULL,NULL),
        (900005,'${businessA}','${reviewLocation}','review-5','Five','new',NULL,NULL),
        (900006,'${businessB}','${reviewLocation}','other-1','Other','new','2026-01-04 00:00:00+00',NULL);
      INSERT INTO public.review_reply_draft_state(review_id,business_id,reply_id,state,version,updated_at,posting_token,posting_lease_until)
      VALUES (900001,'${businessA}',NULL,'approved',1,now(),gen_random_uuid(),now()+interval '1 minute'),
        (900002,'${businessA}',NULL,'approved',1,now(),gen_random_uuid(),now()-interval '1 minute');
      INSERT INTO public.followup_visits(id,business_id,visited_at,customer_name,followup_status)
      VALUES ('30000000-0000-4000-8000-000000000001','${businessA}','2026-01-03 04:05:06.123456+00','Visit one','pending'),
        ('30000000-0000-4000-8000-000000000002','${businessA}','2026-01-03 04:05:06.123456+00','Visit two','sent'),
        ('30000000-0000-4000-8000-000000000003','${businessA}','2026-01-02 04:05:06.000001+00','Visit three','sent'),
        ('30000000-0000-4000-8000-000000000004','${businessB}','2026-01-04 00:00:00+00','Other visit','sent');
    `);
    const sql = sqlExecutor();
    const reviewDb = loadSameRealmTs<typeof import("../src/app/api/reviews/route.js")>("src/app/api/reviews/route.ts", {
      "next/server": { NextResponse: { json: Response.json } },
      "@/lib/user-from-req": { resolveUser: async () => ({ id: "10000000-0000-4000-8000-000000000001", email: "a13@example.test" }) },
      "@/lib/api-security": {
        requireActiveAgentBusinessContext: async () => ({ businessId: businessA }),
        safeApiErrorResponse: () => Response.json({ error: "failed" }, { status: 500 }),
      },
      "@/lib/google-business": {
        BusinessGoogleError: class extends Error { status = 403; },
        getSelectedGoogleLocation: async (_context: unknown, locationName: string) => ({ location_name: locationName }),
        resolveRequestedBusinessId: (businessId: string | null) => ({ valid: true, businessId }),
      },
      "@/lib/db/neon": { sql },
      "@/lib/dashboard-pagination": dashboardPagination,
    });
    const request = (query: string) => new NextRequest(`http://app.test/api/reviews?${query}`);
    const firstReviews = await reviewDb.GET(request(`loc=${encodeURIComponent(reviewLocation)}&limit=2`));
    const firstReviewBody = await firstReviews.json() as { items: Array<Record<string, unknown>>; page: { nextCursor: string | null; hasMore: boolean } };
    assert.equal(firstReviews.status, 200);
    assert.deepEqual(firstReviewBody.items.map((item) => item.google_review_id), ["review-2", "review-1"]);
    assert.equal(firstReviewBody.items[0]?.postRecoveryStatus, "reconciliation_required");
    assert.equal(firstReviewBody.items[1]?.postRecoveryStatus, "posting");
    assert.equal("review_id" in firstReviewBody.items[0]!, false);
    assert.equal(Object.keys(firstReviewBody.items[0]!).some((key) => /token|lease/i.test(key)), false);
    assert.equal(firstReviewBody.page.hasMore, true);
    const lastReviewCursor = dashboardPagination.decodeDashboardCursor(firstReviewBody.page.nextCursor, JSON.stringify([businessA, reviewLocation]), { idType: "bigint" });
    assert.equal(lastReviewCursor?.scope, JSON.stringify([businessA, reviewLocation]));
    assert.equal(lastReviewCursor?.id, "900001");
    assert.match(lastReviewCursor?.timestamp ?? "", /\.123456[+-]\d{2}(?::?\d{2})?$/);
    const secondReviews = await reviewDb.GET(request(`loc=${encodeURIComponent(reviewLocation)}&limit=2&cursor=${encodeURIComponent(firstReviewBody.page.nextCursor!)}`));
    const secondReviewBody = await secondReviews.json() as { items: Array<Record<string, unknown>>; page: { nextCursor: string | null; hasMore: boolean } };
    assert.equal(secondReviews.status, 200);
    assert.deepEqual(secondReviewBody.items.map((item) => item.google_review_id), ["review-3", "review-5"]);
    assert.equal(secondReviewBody.page.hasMore, true);
    const finalReviews = await reviewDb.GET(request(`loc=${encodeURIComponent(reviewLocation)}&limit=2&cursor=${encodeURIComponent(secondReviewBody.page.nextCursor!)}`));
    const finalReviewBody = await finalReviews.json() as { items: Array<Record<string, unknown>>; page: { nextCursor: string | null; hasMore: boolean } };
    assert.deepEqual(finalReviewBody.items.map((item) => item.google_review_id), ["review-4"]);
    assert.equal(finalReviewBody.page.hasMore, false);
    const wrongScope = await reviewDb.GET(request(`loc=locations/other&limit=2&cursor=${encodeURIComponent(firstReviewBody.page.nextCursor!)}`));
    assert.equal(wrongScope.status, 400);
    const wrongIdTypeCursor = Buffer.from(JSON.stringify({ scope: JSON.stringify([businessA, reviewLocation]), timestamp: "2026-01-03 04:05:06.123456+00", id: "30000000-0000-4000-8000-000000000001" })).toString("base64url");
    assert.equal((await reviewDb.GET(request(`loc=${encodeURIComponent(reviewLocation)}&cursor=${wrongIdTypeCursor}`))).status, 400);

    const boosterDb = loadSameRealmTs<typeof import("../src/modules/review-booster/services/review-booster-db.service.js")>(
      "src/modules/review-booster/services/review-booster-db.service.ts", {
        "@/lib/db/neon": { sql },
        "@/lib/api-security": { HttpError: class extends Error { status: number; constructor(status: number, message: string) { super(message); this.status = status; } } },
        "@/lib/billing/plans": { PLANS: {}, isPlanId: () => false },
        "@/lib/followup-retry-policy": { MAX_FOLLOWUP_ATTEMPTS: 3 },
        "@/lib/dashboard-pagination": dashboardPagination,
      });
    const firstVisits = await boosterDb.getRecentVisitsPage(businessA, { limit: 2 });
    assert.deepEqual(firstVisits.items.map((visit) => visit.id), ["30000000-0000-4000-8000-000000000002", "30000000-0000-4000-8000-000000000001"]);
    assert.equal(firstVisits.page.hasMore, true);
    const secondVisits = await boosterDb.getRecentVisitsPage(businessA, { limit: 2, cursor: firstVisits.page.nextCursor });
    assert.deepEqual(secondVisits.items.map((visit) => visit.id), ["30000000-0000-4000-8000-000000000003"]);
    assert.equal(secondVisits.page.hasMore, false);
    await assert.rejects(boosterDb.getRecentVisitsPage(businessA, { cursor: firstReviewBody.page.nextCursor }), /Invalid pagination cursor/);

    const outcomeStats = await boosterDb.getReviewOutcomeStats(businessA);
    assert.deepEqual(outcomeStats, { requestsSent: 2, reviewsSynced: 5, repliesPosted: 0, linkClicks: 0 });

    // Each metric is aggregated against its own relation; multiple large child
    // sets must not multiply one another before counting.
    const outcomeCounts = psql(`SELECT
      (SELECT count(*) FROM public.followup_visits WHERE business_id='00000000-0000-4000-8000-000000000001' AND lower(followup_status)='sent'),
      (SELECT count(*) FROM public.reviews WHERE business_id='00000000-0000-4000-8000-000000000001'),
      (SELECT count(*) FROM public.review_replies WHERE business_id='00000000-0000-4000-8000-000000000001' AND posted),
      (SELECT count(*) FROM public.review_link_clicks WHERE business_id='00000000-0000-4000-8000-000000000001')`);
    assert.equal(outcomeCounts, "48000|96000|12000|60000");
    console.log(`A13 PostgreSQL 17 synthetic baseline: 120,000 reviews and 120,000 visits; page=51 rows; review EXPLAIN ${reviewPlan[0]!["Execution Time"]} ms via reviews_business_location_page_idx; visit EXPLAIN ${visitPlan[0]!["Execution Time"]} ms via followup_visits_business_page_idx; independent counts ${outcomeCounts}.`);
  } finally {
    if (started) {
      try { execFileSync(pgExe("pg_ctl"), ["-D", dataDir, "-m", "immediate", "-w", "stop"], { stdio: "ignore" }); } catch { /* preserve the primary test failure */ }
    }
    rmSync(dir, { recursive: true, force: true });
  }
});
