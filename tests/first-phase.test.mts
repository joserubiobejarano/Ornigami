import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { parseGoogleStarRating } from "../src/lib/google-review-rating.ts";
import { parseCsv } from "../src/modules/review-booster/services/csv-parsing.service.ts";
import { buildCoreUnsubscribeToken, verifyCoreUnsubscribeToken } from "../src/modules/review-booster/services/unsubscribe-token.core.ts";
import { buildReviewLinkToken, verifyReviewLinkToken } from "../src/lib/review-link-token.ts";
import { hasReachedMonthlyAllowance } from "../src/modules/review-booster/services/fair-use.ts";
import { PLANS, annualDiscountPercent, annualSavings, effectiveMonthlyFromAnnual, periodFromStripePrice } from "../src/lib/billing/plans.ts";


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

test("Stripe price ids determine the stored billing period", () => {
  const previousMonthly = process.env.STRIPE_PRICE_REPLIES_MONTHLY;
  const previousAnnual = process.env.STRIPE_PRICE_REPLIES_ANNUAL;
  process.env.STRIPE_PRICE_REPLIES_MONTHLY = "price_replies_monthly_test";
  process.env.STRIPE_PRICE_REPLIES_ANNUAL = "price_replies_annual_test";
  assert.equal(periodFromStripePrice("price_replies_monthly_test"), "monthly");
  assert.equal(periodFromStripePrice("price_replies_annual_test"), "annual");
  assert.equal(periodFromStripePrice("price_unknown"), null);
  if (previousMonthly === undefined) delete process.env.STRIPE_PRICE_REPLIES_MONTHLY;
  else process.env.STRIPE_PRICE_REPLIES_MONTHLY = previousMonthly;
  if (previousAnnual === undefined) delete process.env.STRIPE_PRICE_REPLIES_ANNUAL;
  else process.env.STRIPE_PRICE_REPLIES_ANNUAL = previousAnnual;
});

test("Review Replies uses a high internal safety ceiling", async () => {
  const usage = await readFile(new URL("../src/lib/usage.ts", import.meta.url), "utf8");
  const cron = await readFile(new URL("../src/app/api/cron/review-replies/route.ts", import.meta.url), "utf8");
  const batch = await readFile(new URL("../src/app/api/google/reviews/process-pending/route.ts", import.meta.url), "utf8");
  assert.match(usage, /REVIEW_REPLY_SAFETY_LIMIT = 2_000/);
  assert.match(cron, /checkReviewReplyUsage/);
  assert.match(cron, /incrementReviewReplyUsage/);
  assert.match(batch, /checkReviewReplyUsage/);
  assert.match(batch, /incrementReviewReplyUsage/);
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
  const businesses = await readFile(new URL("../src/lib/db/businesses.ts", import.meta.url), "utf8");
  const upgradeBanner = await readFile(new URL("../src/components/UpgradeBanner.tsx", import.meta.url), "utf8");
  const planServer = await readFile(new URL("../src/lib/plan-server.ts", import.meta.url), "utf8");
  const topNav = await readFile(new URL("../src/components/dashboard/top-nav.tsx", import.meta.url), "utf8");
  const runner = await readFile(new URL("../src/modules/review-booster/services/review-booster-db.service.ts", import.meta.url), "utf8");
  assert.match(webhook, /stripe_events/);
  assert.match(webhook, /current_period_end/);
  assert.match(webhook, /if \(stripeStatus === "unpaid"\) return "unpaid"/);
  assert.match(webhook, /paymentFailureStatus/);
  assert.match(webhook, /persistSubscription\(\{ subscription, userId: mapping\.user_id \}\)/);
  assert.match(businesses, /PAST_DUE_GRACE_DAYS = 7/);
  assert.match(businesses, /statusRow\.status === "past_due"/);
  assert.match(upgradeBanner, /Your latest payment failed/);
  assert.match(upgradeBanner, /title="Payment needs attention"/);
  assert.match(planServer, /storedPlanStatus === "past_due"/);
  assert.doesNotMatch(topNav, /label: "(Content|Audit)"/);
  assert.match(webhook, /subscription_details/);
  assert.match(runner, /attempt_count/);
  assert.match(runner, /next_attempt_at/);
  assert.match(runner, /< 3/);
});
test("free trial checkout does not collect a card and cancels without one", async () => {
  const checkout = await readFile(new URL("../src/app/api/stripe/checkout/route.ts", import.meta.url), "utf8");
  assert.match(checkout, /payment_method_collection: "if_required"/);
  assert.match(checkout, /missing_payment_method: "cancel"/);
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
  assert.match(runner, /hasReachedMonthlyAllowance\(monthlyUsage\.sent, sent, monthlyUsage\.allowance\)/);
  assert.match(runner, /fair_use_limit/);
  assert.match(db, /current_period_start/);
  assert.match(db, /current_period_end/);
  assert.match(cron, /cron\.review_booster\.fair_use_limit/);
});
test("usage resets follow Stripe subscription periods", async () => {
  const usage = await readFile(new URL("../src/lib/usage.ts", import.meta.url), "utf8");
  const migration = await readFile(new URL("../neon/migrations/015_stripe_usage_periods.sql", import.meta.url), "utf8");
  assert.match(usage, /review_replies_usage_period_start/);
  assert.doesNotMatch(usage, /await checkUsageLimit\(userId, "ai_posts"\)/);
  assert.match(migration, /current_period_start/);
});
test("legacy plan taxonomy is removed and unknown stored plans are safe", async () => {
  const plan = await readFile(new URL("../src/lib/plan.ts", import.meta.url), "utf8");
  const usage = await readFile(new URL("../src/lib/usage.ts", import.meta.url), "utf8");
  const planServer = await readFile(new URL("../src/lib/plan-server.ts", import.meta.url), "utf8");
  const migration = await readFile(new URL("../neon/migrations/016_remove_legacy_plan_taxonomy.sql", import.meta.url), "utf8");
  assert.match(plan, /"free" \| BillingPlanId/);
  assert.doesNotMatch(plan, /starter|pro|agency/);
  assert.doesNotMatch(usage, /STARTER_LIMITS|plan_type === "starter"|checkUsageLimit\([^)]*,/);
  assert.match(planServer, /normalizePlanId/);
  assert.match(migration, /profiles_plan_current_values_check/);
  assert.match(migration, /profiles_plan_type_current_values_check/);
});
test("dashboard does not show the unfinished profile score metric", async () => {
  const dashboard = await readFile(new URL("../src/app/(dashboard)/dashboard/page.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(dashboard, /Profile score/);
  assert.match(dashboard, /lg:grid-cols-3/);
});
test("dashboard offers a first-run activation guide before any agent is active", async () => {
  const dashboard = await readFile(new URL("../src/app/(dashboard)/dashboard/page.tsx", import.meta.url), "utf8");
  assert.match(dashboard, /hasActiveAgent/);
  assert.match(dashboard, /Choose the quiet work you want Ornigami to handle/);
  assert.match(dashboard, /Start free trial/);
  assert.match(dashboard, /demo-review-replies/);
  assert.match(dashboard, /demo-review-booster/);
  assert.match(dashboard, /past_due/);
});
test("Complete plan team access has bounded invitations and shared workspace access", async () => {
  const migration = await readFile(new URL("../neon/migrations/017_team_invitations.sql", import.meta.url), "utf8");
  const teamApi = await readFile(new URL("../src/app/api/team/route.ts", import.meta.url), "utf8");
  const acceptApi = await readFile(new URL("../src/app/api/team/invitations/[token]/route.ts", import.meta.url), "utf8");
  const teamCard = await readFile(new URL("../src/components/dashboard/team-members-card.tsx", import.meta.url), "utf8");
  assert.match(migration, /team_invitations/);
  assert.match(migration, /idx_team_invitations_pending_email/);
  assert.match(teamApi, /PLANS\.complete\.seats/);
  assert.match(teamApi, /Only the workspace owner can invite teammates/);
  assert.match(teamApi, /already belongs to another workspace/);
  assert.match(acceptApi, /INSERT INTO public\.business_members/);
  assert.match(acceptApi, /already belongs to another workspace/);
  assert.match(acceptApi, /invitation\.email\.toLowerCase\(\) !== session\.user\.email\.toLowerCase\(\)/);
  assert.match(teamCard, /Invite teammate/);
});
test("Complete plan does not market the unfinished monthly report", () => {
  assert.doesNotMatch(PLANS.complete.features.join(" | "), /monthly report/i);
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
