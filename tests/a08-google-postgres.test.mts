import assert from "node:assert/strict";
import { execFile, execFileSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import test from "node:test";
import { createRequire } from "node:module";
import { promisify } from "node:util";
import { loadTs } from "./a02-test-support.mts";

const { NextRequest } = createRequire(import.meta.url)("next/server") as typeof import("next/server");
type TestNextRequest = import("next/server").NextRequest;
const googleRating = loadTs<typeof import("../src/lib/google-review-rating.js")>("src/lib/google-review-rating.ts", {});

const root = process.cwd();
const binDir = process.env.A08_PG_BIN ?? process.env.A04_PG_BIN ?? process.env.PG_BIN;
const pgExe = (name: string) => process.platform === "win32"
  ? join(binDir ?? "C:/Program Files/PostgreSQL/17/bin", `${name}.exe`)
  : binDir ? join(binDir, name) : name;
const port = 55408;
function psql(statement: string): string {
  const args = ["-X", "-q", "-A", "-t", "-F", "|", "-v", "ON_ERROR_STOP=1", "-h", "127.0.0.1", "-p", String(port), "-U", "postgres", "-d", "postgres", "-c", statement];
  return execFileSync(pgExe("psql"), args, { encoding: "utf8" }).trim();
}
const execFileAsync = promisify(execFile);
async function psqlAsync(statement: string): Promise<string> {
  const args = ["-X", "-q", "-A", "-t", "-F", "|", "-v", "ON_ERROR_STOP=1", "-h", "127.0.0.1", "-p", String(port), "-U", "postgres", "-d", "postgres", "-c", statement];
  const result = await execFileAsync(pgExe("psql"), args, { encoding: "utf8" });
  return result.stdout.trim();
}
function psqlError(statement: string): string {
  const args = ["-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-h", "127.0.0.1", "-p", String(port), "-U", "postgres", "-d", "postgres", "-c", statement];
  try {
    execFileSync(pgExe("psql"), args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (error) {
    return String((error as NodeJS.ErrnoException & { stderr?: string }).stderr ?? "");
  }
  throw new Error("Expected PostgreSQL statement to fail");
}
function sqlLiteral(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") { if (!Number.isFinite(value)) throw new Error("invalid SQL number"); return String(value); }
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  return `'${String(value).replaceAll("'", "''")}'`;
}
function renderSql(strings: readonly string[], values: unknown[]) {
  return strings.reduce((query, part, index) => query + part + (index < values.length ? sqlLiteral(values[index]) : ""), "");
}

test("production Google review upsert SQL runs against disposable PostgreSQL", async () => {
  const testRoot = resolve(root, ".next");
  mkdirSync(testRoot, { recursive: true });
  const dir = mkdtempSync(join(testRoot, "a08-reviews-pg-"));
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
      const diagnostic = existsSync(logFile) ? readFileSync(logFile, "utf8") : "No PostgreSQL startup log was created";
      throw new Error(`Disposable PostgreSQL startup failed:\n${diagnostic}`, { cause: error });
    }
    started = true;
    psql(`CREATE TABLE public.businesses (id uuid PRIMARY KEY, owner_user_id uuid NOT NULL);
    CREATE TABLE public.gbp_connections (
      user_id uuid PRIMARY KEY, access_token text, refresh_token text, expires_at timestamptz, scope text,
      connection_version uuid NOT NULL DEFAULT gen_random_uuid(), updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE public.gbp_locations (
      id uuid PRIMARY KEY, user_id uuid NOT NULL, location_name text NOT NULL,
      title text, connected boolean NOT NULL DEFAULT true, connection_version uuid
    );
    INSERT INTO public.businesses(id,owner_user_id) VALUES
      ('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001'),
      ('00000000-0000-4000-8000-000000000007','00000000-0000-4000-8000-000000000001'),
      ('00000000-0000-4000-8000-000000000009','00000000-0000-4000-8000-000000000001');
    INSERT INTO public.gbp_connections(user_id,connection_version) VALUES
      ('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000010');
    INSERT INTO public.gbp_locations(id,user_id,location_name,connected,connection_version) VALUES
      ('00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000001','accounts/100/locations/200',true,'00000000-0000-4000-8000-000000000010'),
      ('00000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000001','accounts/101/locations/200',true,'00000000-0000-4000-8000-000000000010'),
      ('00000000-0000-4000-8000-000000000005','00000000-0000-4000-8000-000000000009','accounts/100/locations/999',true,NULL),
      ('00000000-0000-4000-8000-000000000006','00000000-0000-4000-8000-000000000001','accounts/100/locations/201',true,'00000000-0000-4000-8000-000000000010');
    CREATE TABLE public.reviews (
      id bigserial PRIMARY KEY, user_id uuid NOT NULL, business_id uuid NOT NULL,
      location_name text NOT NULL, google_review_id text NOT NULL, reviewer_name text,
      star_rating integer, comment text, review_update_time timestamptz, language_code text,
      reply_comment text, reply_update_time timestamptz, status text, updated_at timestamptz,
      UNIQUE (business_id, google_review_id)
    );
    INSERT INTO public.reviews(user_id,business_id,location_name,google_review_id,reviewer_name,star_rating,comment,status,reply_comment)
      VALUES ('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','accounts/100/locations/200','local_replied','Reviewer',5,'old comment','replied','human posted reply'),
      ('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002','accounts/100/locations/999','foreign_location','Foreign',4,'foreign','new',NULL),
      ('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','locations/200','legacy_ambiguous','Old',5,'ambiguous legacy row','new',NULL),
      ('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000007','locations/201','legacy_unique','Old',4,'unique legacy row','new',NULL),
      ('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000009','locations/201','legacy_unselected','Old',4,'no business selection','new',NULL);`);
    psql(readFileSync(join(root, "docs/tasks/A08-selected-location-schema.sql"), "utf8"));
    psql(`INSERT INTO public.business_google_locations(business_id,location_id) VALUES
      ('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000003'),
      ('00000000-0000-4000-8000-000000000007','00000000-0000-4000-8000-000000000006');`);
    const backfillProposal = readFileSync(join(root, "docs/tasks/A08-canonical-resource-backfill.sql"), "utf8");
    assert.match(backfillProposal.trimEnd(), /ROLLBACK;$/);
    const applyDisposableBackfill = backfillProposal.replace(/ROLLBACK;\s*$/, "COMMIT;");
    const candidates = psql(applyDisposableBackfill);
    assert.match(candidates, /legacy_ambiguous/);
    assert.match(candidates, /legacy_unique/);
    assert.equal(psql("SELECT location_name FROM public.reviews WHERE google_review_id='legacy_unique'"), "accounts/100/locations/201");
    assert.equal(psql("SELECT location_name FROM public.reviews WHERE google_review_id='legacy_ambiguous'"), "locations/200");
    assert.equal(psql("SELECT location_name FROM public.reviews WHERE google_review_id='legacy_unselected'"), "locations/201");
    psql(applyDisposableBackfill);
    assert.equal(psql("SELECT location_name FROM public.reviews WHERE google_review_id='legacy_unique'"), "accounts/100/locations/201", "running the backfill again is idempotent");

    const statements: string[] = [];
    let lastReturned: Array<Record<string, unknown>> = [];
    const sql = async (strings: TemplateStringsArray, ...values: unknown[]) => {
      statements.push(renderSql(strings, values));
      const statement = statements.at(-1)!;
      const result = psql(statement);
      if (!result) return [];
      if (statement.includes("SELECT google_review_id, location_name")) {
        return result.split("\n").map((line) => {
          const [google_review_id, location_name] = line.trimEnd().split("|");
          return { google_review_id, location_name };
        });
      }
      lastReturned = result.split("\n").map((line) => {
        const [google_review_id, reviewer_name, star_rating, comment, was_inserted] = line.trimEnd().split("|");
        return { google_review_id, reviewer_name: reviewer_name || null, star_rating: star_rating ? Number(star_rating) : null,
          comment: comment || null, was_inserted: was_inserted === "t" };
      });
      return lastReturned;
    };
    const persistence = loadTs<typeof import("../src/lib/google-review-persistence.js")>("src/lib/google-review-persistence.ts", {
      "@/lib/db/neon": { sql },
      "@/lib/google-review-rating": googleRating,
    });
    const idPrefix = "00000000-0000-4000-8000-00000000000";
    const imported = await persistence.persistGoogleReviews(`${idPrefix}1`, `${idPrefix}2`, "accounts/100/locations/200", [
      { reviewId: "new_review", reviewer: { displayName: "New" }, starRating: "FIVE", comment: "fresh" },
      { reviewId: "local_replied", reviewer: { displayName: "Reviewer updated" }, starRating: "FIVE", comment: "updated from provider" },
    ]);
    assert.deepEqual(imported, { synced: 2, newReviews: [{ reviewerName: "New", starRating: 5, comment: "fresh" }] });
    assert.match(lastReturned.map((row) => `${row.google_review_id}|${row.was_inserted}`).join("\n"), /new_review\|true/);
    assert.match(lastReturned.map((row) => `${row.google_review_id}|${row.was_inserted}`).join("\n"), /local_replied\|false/);
    assert.equal(psql("SELECT count(*) FROM public.reviews WHERE business_id='00000000-0000-4000-8000-000000000002' AND location_name='accounts/100/locations/200'"), "2");
    assert.equal(psql("SELECT status || '|' || reply_comment FROM public.reviews WHERE google_review_id='local_replied'"), "replied|human posted reply");
    assert.equal(psql("SELECT comment FROM public.reviews WHERE google_review_id='local_replied'"), "updated from provider");
    const resynced = await persistence.persistGoogleReviews(`${idPrefix}1`, `${idPrefix}2`, "accounts/100/locations/200", [
      { reviewId: "new_review", reviewer: { displayName: "New" }, starRating: "FIVE", comment: "fresh" },
      { reviewId: "local_replied", reviewer: { displayName: "Reviewer updated" }, starRating: "FIVE", comment: "updated from provider" },
    ]);
    assert.deepEqual(resynced, { synced: 2, newReviews: [] }, "re-syncing existing provider rows must not create duplicate alerts");

    let foreignInsertRejected = false;
    const statementCountBeforeForeignReview = statements.length;
    try {
      await persistence.persistGoogleReviews(`${idPrefix}1`, `${idPrefix}2`, "accounts/100/locations/200", [
        { reviewId: "foreign_location", starRating: "FOUR", comment: "must not move" },
      ]);
    } catch (error) {
      foreignInsertRejected = error instanceof Error && /different stored location/i.test(error.message);
    }
    assert.equal(foreignInsertRejected, true);
    assert.equal(statements.length, statementCountBeforeForeignReview + 1, "location mismatch is rejected by the preflight batch query");
    assert.equal(psql("SELECT location_name || '|' || comment FROM public.reviews WHERE google_review_id='foreign_location'"), "accounts/100/locations/999|foreign");

    const ownerContext = { businessId: "00000000-0000-4000-8000-000000000009", integrationOwnerUserId: "00000000-0000-4000-8000-000000000001", role: "owner", actorUserId: "00000000-0000-4000-8000-000000000001", ownerUserId: "00000000-0000-4000-8000-000000000001" };
    const helper = loadTs<Record<string, unknown>>("src/lib/google-business.ts", {
      "@/lib/db/neon": { sql: async () => [] },
      "@/lib/business-context": { BusinessAccessError: class extends Error { status = 403; }, requireBusinessContext: async () => ownerContext },
      "@/lib/google-discovery": { discoverGoogleLocations: async () => [] },
      "@/lib/plan-server": { getBusinessPlanInfo: async () => ({ plan: "complete", agents: ["review_replies"] }) },
    });
    const inserts: string[] = [];
    let selectionReadCount = 0;
    let pendingLocationId: unknown = null;
    const routeSql = async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const statement = renderSql(strings, values);
      if (statement.includes("INSERT INTO public.business_google_locations")) {
        inserts.push(statement);
        pendingLocationId = values[3];
        return [];
      }
      if (statement.includes("SELECT connection_version FROM public.gbp_connections")) {
        const output = psql(statement);
        return output ? [{ connection_version: output }] : [];
      }
      if (statement.includes("SELECT 1 FROM public.gbp_connections c")) {
        return psql(statement) ? [{ ok: true }] : [];
      }
      if (statement.includes("FROM public.gbp_locations l")) {
        selectionReadCount = 0;
        const output = psql(statement);
        if (!output) return [];
        return output.split(/\r?\n/).map((line) => {
          const [id, location_name, title, connection_version] = line.trimEnd().split("|");
          return { id, location_name, title: title || null, connection_version };
        });
      }
      if (statement.includes("FROM public.business_google_locations")) {
        selectionReadCount += 1;
        if (selectionReadCount === 1) {
          const output = psql(statement);
          return output ? output.split(/\r?\n/).map((line) => ({ location_id: line.trim() })) : [];
        }
        return [{ location_id: pendingLocationId }];
      }
      throw new Error(`Unexpected selection SQL: ${statement}`);
    };
    const ownershipHelper = { ...helper, assertGoogleBusinessOwner: () => undefined,
      requireGoogleBusinessContext: async () => ownerContext, requireGoogleWorkflowEntitlement: async () => undefined };
    const selectionRoute = loadTs<{ POST(req: TestNextRequest): Promise<Response> }>("src/app/api/google/locations/selection/route.ts", {
      "next/server": { NextResponse: { json: (value: unknown, init?: ResponseInit) => Response.json(value, init) } },
      "@/lib/user-from-req": { resolveUser: async () => ({ id: ownerContext.actorUserId }) },
      "@/lib/db/neon": { sql: routeSql },
      "@/lib/google-discovery": { discoverGoogleLocations: async () => [{ locationName: "accounts/100/locations/200" }, { locationName: "accounts/101/locations/200" }] },
      "@/lib/safe-logger": { safeLogger: { error: () => undefined } },
      "@/lib/google-business": ownershipHelper,
    });
    for (const locationId of ["00000000-0000-4000-8000-000000000003", "00000000-0000-4000-8000-000000000004"]) {
      const response = await selectionRoute.POST(new NextRequest("http://localhost/api/google/locations/selection", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ locationId }),
      }));
      assert.equal(response.status, 200);
    }
    assert.equal(inserts.length, 2);
    await Promise.all(inserts.map((statement) => psqlAsync(`BEGIN; SELECT pg_sleep(0.15); ${statement}; COMMIT;`)));
    assert.equal(psql("SELECT count(*) FROM public.business_google_locations WHERE business_id='00000000-0000-4000-8000-000000000009'"), "1");
    const chosenLocation = psql("SELECT location_id FROM public.business_google_locations WHERE business_id='00000000-0000-4000-8000-000000000009'");
    assert.ok(["00000000-0000-4000-8000-000000000003", "00000000-0000-4000-8000-000000000004"].includes(chosenLocation), chosenLocation);
    assert.match(psqlError(`INSERT INTO public.business_google_locations (business_id, location_id) VALUES ('00000000-0000-4000-8000-000000000009','00000000-0000-4000-8000-000000000005') ON CONFLICT (business_id) DO NOTHING;`), /Selected Google location must belong to the business owner/);

    const versionBeforeOauth = psql("SELECT connection_version FROM public.gbp_connections WHERE user_id='00000000-0000-4000-8000-000000000001'");
    const tokenSql = async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const output = psql(renderSql(strings, values));
      return output ? output.split(/\r?\n/).map((line) => ({ user_id: line.trim() })) : [];
    };
    const gbpDb = loadTs<typeof import("../src/lib/db/gbp.js")>("src/lib/db/gbp.ts", {
      "@/lib/db/neon": { sql: tokenSql },
      "@/lib/encrypted-token": { encryptToken: (token: string) => `encrypted:${token}` },
    });
    await gbpDb.upsertGbpConnection({
      userId: "00000000-0000-4000-8000-000000000001", accessToken: "access-two", refreshToken: "refresh-two",
      expiresAt: "2030-01-01T00:00:00.000Z", scope: "business.manage",
    });
    const versionAfterOauth = psql("SELECT connection_version FROM public.gbp_connections WHERE user_id='00000000-0000-4000-8000-000000000001'");
    assert.notEqual(versionAfterOauth, versionBeforeOauth, "OAuth replacement rotates the credential generation");
    await gbpDb.updateGbpTokens({
      userId: "00000000-0000-4000-8000-000000000001", accessToken: "refreshed-access", refreshToken: "refresh-two",
      expiresAt: "2030-01-01T00:01:00.000Z", scope: "business.manage",
    });
    assert.equal(psql("SELECT connection_version FROM public.gbp_connections WHERE user_id='00000000-0000-4000-8000-000000000001'"), versionAfterOauth,
      "ordinary access-token refresh preserves its credential generation");
    assert.equal(psql(`SELECT count(*) FROM public.business_google_locations selection
      INNER JOIN public.businesses b ON b.id=selection.business_id
      INNER JOIN public.gbp_locations l ON l.id=selection.location_id AND l.user_id=b.owner_user_id AND l.connected IS TRUE
      INNER JOIN public.gbp_connections c ON c.user_id=b.owner_user_id AND l.connection_version=c.connection_version`), "0",
      "old location cache and selection fail closed after OAuth replacement until discovery refreshes the cache");

    const staleSnapshot = { version: versionAfterOauth, access: "encrypted:access-two", refresh: "encrypted:refresh-two" };
    const userId = "00000000-0000-4000-8000-000000000001";
    const staleSameGeneration = await gbpDb.updateGbpTokensIfCurrent({
      userId, accessToken: "stale-access", refreshToken: "stale-refresh", expiresAt: "2030-01-01T00:02:00.000Z",
      scope: "business.manage", expectedConnectionVersion: staleSnapshot.version,
      expectedEncryptedAccessToken: staleSnapshot.access, expectedEncryptedRefreshToken: staleSnapshot.refresh,
    });
    assert.equal(staleSameGeneration, false, "a rotated same-generation refresh snapshot cannot overwrite current tokens");
    assert.equal(psql("SELECT access_token || '|' || refresh_token FROM public.gbp_connections WHERE user_id='00000000-0000-4000-8000-000000000001'"),
      "encrypted:refreshed-access|encrypted:refresh-two");
    const currentVersion = psql("SELECT connection_version FROM public.gbp_connections WHERE user_id='00000000-0000-4000-8000-000000000001'");
    const casWon = await gbpDb.updateGbpTokensIfCurrent({
      userId, accessToken: "cas-access", refreshToken: "cas-refresh", expiresAt: "2030-01-01T00:03:00.000Z",
      scope: "business.manage", expectedConnectionVersion: currentVersion,
      expectedEncryptedAccessToken: "encrypted:refreshed-access", expectedEncryptedRefreshToken: "encrypted:refresh-two",
    });
    assert.equal(casWon, true, "a current credential snapshot may persist its provider refresh");
    const refreshedSnapshot = {
      version: currentVersion,
      access: "encrypted:cas-access",
      refresh: "encrypted:cas-refresh",
    };
    await gbpDb.upsertGbpConnection({
      userId, accessToken: "reconnected-access", refreshToken: "reconnected-refresh",
      expiresAt: "2030-01-02T00:00:00.000Z", scope: "business.manage",
    });
    const replacementVersion = psql("SELECT connection_version FROM public.gbp_connections WHERE user_id='00000000-0000-4000-8000-000000000001'");
    assert.notEqual(replacementVersion, refreshedSnapshot.version);
    const staleGeneration = await gbpDb.updateGbpTokensIfCurrent({
      userId, accessToken: "old-generation-access", refreshToken: "old-generation-refresh",
      expiresAt: "2030-01-03T00:00:00.000Z", scope: "business.manage",
      expectedConnectionVersion: refreshedSnapshot.version,
      expectedEncryptedAccessToken: refreshedSnapshot.access,
      expectedEncryptedRefreshToken: refreshedSnapshot.refresh,
    });
    assert.equal(staleGeneration, false, "a refresh from an older OAuth generation cannot overwrite a reconnect");
    assert.equal(psql("SELECT access_token || '|' || refresh_token FROM public.gbp_connections WHERE user_id='00000000-0000-4000-8000-000000000001'"),
      "encrypted:reconnected-access|encrypted:reconnected-refresh");
  } finally {
    if (started) execFileSync(pgExe("pg_ctl"), ["-D", dataDir, "-m", "immediate", "-w", "stop"], { stdio: "ignore" });
    const resolvedDir = resolve(dir);
    if (resolvedDir.startsWith(safePrefix)) rmSync(resolvedDir, { recursive: true, force: true });
  }
});
