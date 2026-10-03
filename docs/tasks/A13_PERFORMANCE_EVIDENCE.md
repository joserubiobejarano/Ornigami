# A13 dashboard pagination and performance evidence

This handoff implements the I04 backend scope: review inbox and Review Booster visits use business-scoped keyset pagination; outcome counts aggregate each table independently; review-post recovery state is a read-only projection of the durable draft posting fence; eligible follow-up reads have a SQL row bound. Schema additions are in reserved migration `028_dashboard_pagination.sql` and have only been applied to disposable local PostgreSQL fixtures.

## Local synthetic baseline

The A13 performance test starts a disposable PostgreSQL 17 instance and loads 120,000 synthetic reviews and 120,000 synthetic visits across two businesses and several review locations. It runs `ANALYZE`, applies migration 028, and runs `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` for a 51-row continuation page (the API requests 50 plus one look-ahead row).

Observed run on 2026-10-03 in the isolated Windows worktree:

| Query | Index | Rows returned | EXPLAIN execution time |
| --- | --- | ---: | ---: |
| Review page, scoped by business and location, continued after timestamp and review ID | `reviews_business_location_page_idx` | 51 | 0.103 ms |
| Visit page, scoped by business, continued after visit timestamp and UUID | `followup_visits_business_page_idx` | 51 | 0.155 ms |

The separate aggregate counts on the synthetic business were 48,000 sent visits, 96,000 reviews, 12,000 posted replies, and 60,000 link clicks. Those cardinalities intentionally differ; an all-table join would multiply the intermediate rows. The production service is also exercised against PostgreSQL by this test: deterministic review pages cover duplicate timestamps and NULL timestamps, visit pages cover duplicate timestamps, an unrelated business is excluded, microsecond cursor text is preserved, and the public review projection exposes only `posting` or `reconciliation_required` without token or lease values.

These timings describe a local synthetic PostgreSQL fixture with warm cache, not production traffic or hosted Neon latency. They establish that the intended indexes support bounded keyset access for the fixture. They are query timings, not a CWV or Lighthouse score: the fixture has no browser rendering, network, authentication, hosted database latency, or real user traffic.

## Migration rollout and rollback

Migration 028 is additive and contains these indexes:

- `reviews_business_location_page_idx`
- `followup_visits_business_page_idx`
- `followup_visits_business_eligible_page_idx`
- `review_replies_business_posted_idx`
- `followup_visits_business_status_idx`

The A13 tests apply it only to disposable local PostgreSQL. Integration must apply the reviewed migration to each target database before or alongside application rollout. The current `CREATE INDEX` statements take ordinary index-build locks on the existing tables and can block writes while they build; coordinate a migration window against expected table size/write volume. If the target migration runner supports concurrent index creation, integration may convert these statements to a non-transactional concurrent migration after verifying its runner behavior. Do not run concurrent-index statements inside a transaction.

Because indexes do not define application behavior, rollback may remove them after reviewing the query load. When supported by the migration runner, drop them concurrently and outside a transaction:

```sql
DROP INDEX CONCURRENTLY IF EXISTS public.reviews_business_location_page_idx;
DROP INDEX CONCURRENTLY IF EXISTS public.followup_visits_business_page_idx;
DROP INDEX CONCURRENTLY IF EXISTS public.followup_visits_business_eligible_page_idx;
DROP INDEX CONCURRENTLY IF EXISTS public.review_replies_business_posted_idx;
DROP INDEX CONCURRENTLY IF EXISTS public.followup_visits_business_status_idx;
```

Keep the migration and consumers at the same reviewed integration revision; do not edit the shared roadmap from this worktree.

## Target CWV and Lighthouse follow-up

Production CWV and Lighthouse results remain pending traffic and target access. After the dashboard changes reach the authorized target, record Lighthouse mobile runs and real-user Core Web Vitals for `/dashboard`, `/dashboard/agents/review-booster`, and `/reviews`, with date, release commit, device/throttle settings, authentication state, and sample counts. Compare repeated runs and real-user distributions; local development or the synthetic SQL fixture cannot stand in for a production score.

For the optional A17 follow-up, first build the reviewed revision and inspect its route bundles:

```powershell
npm run build
npm run analyze
```

For an authenticated Lighthouse profile, use the Lighthouse CLI in the authorized performance environment, log in with a dedicated Chrome profile, then run three mobile captures (replace the host and profile path; do not put credentials in command arguments):

```powershell
$profile = 'C:\perf\chrome-profile'
$hostName = 'https://<authorized-dashboard-host>'
npx lighthouse "$hostName/dashboard" --preset=perf --form-factor=mobile --screenEmulation.mobile --chrome-flags="--headless=new --user-data-dir=$profile" --output=json --output-path=A17-dashboard-mobile.json
npx lighthouse "$hostName/dashboard/agents/review-booster" --preset=perf --form-factor=mobile --screenEmulation.mobile --chrome-flags="--headless=new --user-data-dir=$profile" --output=json --output-path=A17-booster-mobile.json
npx lighthouse "$hostName/reviews" --preset=perf --form-factor=mobile --screenEmulation.mobile --chrome-flags="--headless=new --user-data-dir=$profile" --output=json --output-path=A17-reviews-mobile.json
```

Repeat each capture at least three times under the same device/network profile and retain the JSON reports with the release commit and run date. If the target's authentication flow cannot be used with the dedicated profile, capture in an approved authenticated browser workflow and document that limitation. Do not run these commands against an unauthorized environment. Bundle analysis and Lighthouse profiling are follow-up evidence only; neither was run from this isolated implementation worktree.

## Validation

Run the isolated A13 checks with:

```powershell
node --experimental-strip-types --test tests/a13-pagination.test.mts tests/a13-performance.test.mts
```

The performance suite uses local PostgreSQL binaries (`A13_PG_BIN`, `A04_PG_BIN`, `PG_BIN`, or `C:/Program Files/PostgreSQL/17/bin` on Windows) and creates/removes only a temporary cluster beneath the worktree `.next` directory. It does not read application environment secrets or contact live databases/providers.
