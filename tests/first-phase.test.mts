import assert from "node:assert/strict";
import test from "node:test";

import { parseGoogleStarRating } from "../src/lib/google-review-rating.ts";
import { parseCsv } from "../src/modules/review-booster/services/csv-parsing.service.ts";
import { buildCoreUnsubscribeToken, verifyCoreUnsubscribeToken } from "../src/modules/review-booster/services/unsubscribe-token.core.ts";
import { buildReviewLinkToken, verifyReviewLinkToken } from "../src/lib/review-link-token.ts";
import { hasReachedMonthlyAllowance } from "../src/modules/review-booster/services/fair-use.ts";
import { PLANS, annualDiscountPercent, annualSavings, effectiveMonthlyFromAnnual, periodFromStripePrice } from "../src/lib/billing/plans.ts";
import { paymentFailureStatus, toBusinessAgentStatus } from "../src/lib/billing/webhook-state.ts";
import { FREE_AUDIT_GLOBAL_KEY, PUBLIC_AUDIT_GLOBAL_LIMIT, PUBLIC_AUDIT_PER_EMAIL_LIMIT, PUBLIC_AUDIT_PER_IP_LIMIT } from "../src/lib/audit-policy.ts";
import { MAX_REVIEW_REPLY_BATCH, REVIEW_REPLY_SAFETY_LIMIT, safeProcessingError } from "../src/lib/review-reply-policy.ts";
import { MAX_FOLLOWUP_ATTEMPTS } from "../src/lib/followup-retry-policy.ts";
import { DEFAULT_GOOGLE_REVIEWS_MAX_PAGES } from "../src/lib/review-sync-policy.ts";
import { normalizePlanIdValue } from "../src/lib/plan-policy.ts";
import { isWithinPastDueGracePeriod, PAST_DUE_GRACE_DAYS } from "../src/lib/business-access-policy.ts";
import { TRIAL_CHECKOUT_POLICY } from "../src/lib/billing/checkout-policy.ts";
import { MAX_FOLLOWUPS_PER_RUN } from "../src/lib/followup-run-policy.ts";


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

test("Stripe subscription statuses map to safe application states", () => {
  assert.equal(toBusinessAgentStatus("active"), "active");
  assert.equal(toBusinessAgentStatus("unpaid"), "unpaid");
  assert.equal(toBusinessAgentStatus("unknown"), "inactive");
  assert.equal(paymentFailureStatus("unpaid"), "unpaid");
  assert.equal(paymentFailureStatus("canceled"), "canceled");
  assert.equal(paymentFailureStatus("past_due"), "past_due");
});

test("Review Replies policy keeps bounded batches and safe client errors", () => {
  assert.equal(REVIEW_REPLY_SAFETY_LIMIT, 2_000);
  assert.equal(MAX_REVIEW_REPLY_BATCH, 40);
  assert.equal(safeProcessingError("post"), "Could not post the reply to Google; it was kept as a draft.");
  assert.equal(safeProcessingError("draft"), "Could not save the generated reply as a draft.");
  assert.equal(safeProcessingError("generate"), "Could not generate a reply for this review.");
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

test("pagination and public audit quotas use bounded policies", () => {
  assert.equal(DEFAULT_GOOGLE_REVIEWS_MAX_PAGES, 20);
  assert.equal(FREE_AUDIT_GLOBAL_KEY, "free_profile_audit");
  assert.equal(PUBLIC_AUDIT_GLOBAL_LIMIT, 50);
  assert.equal(PUBLIC_AUDIT_PER_EMAIL_LIMIT, 3);
  assert.equal(PUBLIC_AUDIT_PER_IP_LIMIT, 3);
});
test("billing grace and retry policies are bounded", () => {
  const now = Date.parse("2026-08-14T12:00:00.000Z");
  assert.equal(PAST_DUE_GRACE_DAYS, 7);
  assert.equal(isWithinPastDueGracePeriod("2026-08-10T12:00:00.000Z", now), true);
  assert.equal(isWithinPastDueGracePeriod("2026-08-01T12:00:00.000Z", now), false);
  assert.equal(isWithinPastDueGracePeriod("not-a-date", now), false);
  assert.equal(MAX_FOLLOWUP_ATTEMPTS, 3);
});
test("free trial checkout does not collect a card and cancels without one", () => {
  assert.deepEqual(TRIAL_CHECKOUT_POLICY, {
    paymentMethodCollection: "if_required",
    missingPaymentMethod: "cancel",
  });
});
test("Review Booster fair-use ceiling remains enforced", () => {
  assert.equal(hasReachedMonthlyAllowance(500, 0, 500), true);
  assert.equal(hasReachedMonthlyAllowance(499, 0, 500), false);
  assert.equal(hasReachedMonthlyAllowance(499, 1, 500), true);
});
test("legacy plan taxonomy is removed and unknown stored plans are safe", () => {
  assert.equal(normalizePlanIdValue("complete"), "complete");
  assert.equal(normalizePlanIdValue("starter"), "free");
  assert.equal(normalizePlanIdValue("unknown-plan"), "free");
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
  assert.equal(MAX_FOLLOWUPS_PER_RUN, 50);
});
