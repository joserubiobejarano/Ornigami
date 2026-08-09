import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { parseGoogleStarRating } from "../src/lib/google-review-rating.ts";
import { parseCsv } from "../src/modules/review-booster/services/csv-parsing.service.ts";
import { buildCoreUnsubscribeToken, verifyCoreUnsubscribeToken } from "../src/modules/review-booster/services/unsubscribe-token.core.ts";
import { buildReviewLinkToken, verifyReviewLinkToken } from "../src/lib/review-link-token.ts";
import { hasReachedMonthlyAllowance } from "../src/modules/review-booster/services/fair-use.ts";
import { PLANS, annualDiscountPercent, annualSavings, effectiveMonthlyFromAnnual } from "../src/lib/billing/plans.ts";


test("Google star ratings map enums and reject unknown values", () => {
  assert.equal(parseGoogleStarRating("ONE"), 1);
  assert.equal(parseGoogleStarRating("FIVE"), 5);
  assert.equal(parseGoogleStarRating("SIX"), null);
  assert.equal(parseGoogleStarRating(null), null);
});

test("billing catalog uses the approved EUR prices and annual discounts", () => {
  assert.deepEqual(
    Object.fromEntries(Object.entries(PLANS).map(([id, plan]) => [id, plan.amounts])),
    {
      replies: { monthly: 39, annual: 360 },
      booster: { monthly: 39, annual: 360 },
      complete: { monthly: 59, annual: 560 },
    }
  );
  assert.equal(annualSavings("replies"), 108);
  assert.equal(annualSavings("booster"), 108);
  assert.equal(annualSavings("complete"), 148);
  assert.equal(annualDiscountPercent("replies"), 23);
  assert.equal(annualDiscountPercent("booster"), 23);
  assert.equal(annualDiscountPercent("complete"), 21);
  assert.equal(effectiveMonthlyFromAnnual("replies"), "30 €");
  assert.equal(effectiveMonthlyFromAnnual("complete"), "47 €");
});

test("CSV parser strips BOM and preserves multiline quoted fields", () => {
  const rows = parseCsv("\uFEFFcustomer_name,customer_email,service_name,visited_at\n\"Jane Doe\",jane@example.com,\"Deep clean\nwith notes\",2026-08-01");
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.customer_name, "Jane Doe");
  assert.equal(rows[0]?.service_name, "Deep clean\nwith notes");
});

test("unsubscribe tokens normalize email and reject tampering", () => {
  const token = buildCoreUnsubscribeToken({ businessId: "biz-1", customerEmail: " Customer@Example.com " }, "test-secret");
  assert.deepEqual(verifyCoreUnsubscribeToken(token, "test-secret"), { businessId: "biz-1", customerEmail: "customer@example.com" });
  assert.equal(verifyCoreUnsubscribeToken(`${token}x`, "test-secret"), null);
  assert.equal(verifyCoreUnsubscribeToken(token, "wrong-secret"), null);
});


test("review link tokens preserve destination and reject tampering", () => {
  const previous = process.env.REVIEW_BOOSTER_UNSUBSCRIBE_SECRET;
  process.env.REVIEW_BOOSTER_UNSUBSCRIBE_SECRET = "test-secret";
  const payload = { businessId: "biz-1", visitId: "visit-1", reviewUrl: "https://google.example/review" };
  const token = buildReviewLinkToken(payload);
  assert.deepEqual(verifyReviewLinkToken(token), payload);
  assert.equal(verifyReviewLinkToken(`${token}x`), null);
  if (previous === undefined) delete process.env.REVIEW_BOOSTER_UNSUBSCRIBE_SECRET;
  else process.env.REVIEW_BOOSTER_UNSUBSCRIBE_SECRET = previous;
});

test("pagination and public audit quota safeguards remain wired", async () => {
  const pagination = await readFile(new URL("../src/lib/google-review-sync.ts", import.meta.url), "utf8");
  const freeAudit = await readFile(new URL("../src/app/api/audit/free-profile/route.ts", import.meta.url), "utf8");
  const profileAudit = await readFile(new URL("../src/app/api/audit/profile/route.ts", import.meta.url), "utf8");
  assert.match(pagination, /nextPageToken/);
  assert.match(pagination, /maxPages = 20/);
  assert.match(freeAudit, /free_profile_audit/);
  assert.match(freeAudit, /maxPerDay: 3/);
  assert.match(profileAudit, /profile_audit_quick/);
  assert.match(profileAudit, /maxPerDay: 3/);
});
test("cron and retry safety invariants are present", async () => {
  const webhook = await readFile(new URL("../src/app/api/stripe/webhook/route.ts", import.meta.url), "utf8");
  const runner = await readFile(new URL("../src/modules/review-booster/services/review-booster-db.service.ts", import.meta.url), "utf8");
  assert.match(webhook, /stripe_events/);
  assert.match(webhook, /current_period_end/);
  assert.match(webhook, /subscription_details/);
  assert.match(runner, /attempt_count/);
  assert.match(runner, /next_attempt_at/);
  assert.match(runner, /< 3/);
});
test("cron health and client-safe Google errors remain wired", async () => {
  const health = await readFile(new URL("../src/app/api/cron/health/route.ts", import.meta.url), "utf8");
  const processing = await readFile(new URL("../src/app/api/google/reviews/process-pending/route.ts", import.meta.url), "utf8");
  assert.match(health, /isAuthorizedCronRequest/);
  assert.match(health, /cron_runs/);
  assert.match(processing, /safeProcessingError/);
  assert.doesNotMatch(processing, /errors\.push\(`\$\{row\.google_review_id\}: \$\{res\.error\}`\)/);
});
test("Review Booster fair-use ceiling remains enforced", async () => {
  const runner = await readFile(new URL("../src/modules/review-booster/services/followup-runner.service.ts", import.meta.url), "utf8");
  const db = await readFile(new URL("../src/modules/review-booster/services/review-booster-db.service.ts", import.meta.url), "utf8");
  const cron = await readFile(new URL("../src/app/api/cron/review-booster/route.ts", import.meta.url), "utf8");
  assert.match(runner, /fairUseLimitReached/);
  assert.match(runner, /fair_use_limit/);
  assert.match(db, /date_trunc\('month', now\(\)\)/);
  assert.match(cron, /cron\.review_booster\.fair_use_limit/);
});
test("Review Booster allowance decision blocks sending at the cap", () => {
  assert.equal(hasReachedMonthlyAllowance(500, 0, 500), true);
  assert.equal(hasReachedMonthlyAllowance(499, 0, 500), false);
  assert.equal(hasReachedMonthlyAllowance(499, 1, 500), true);
});
test("Review Booster runner applies a bounded per-run batch", async () => {
  const runner = await readFile(new URL("../src/modules/review-booster/services/followup-runner.service.ts", import.meta.url), "utf8");
  assert.match(runner, /MAX_FOLLOWUPS_PER_RUN = 50/);
  assert.match(runner, /eligibleVisits\.slice\(0, MAX_FOLLOWUPS_PER_RUN\)/);
});
