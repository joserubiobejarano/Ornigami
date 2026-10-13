import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import test from "node:test";
import { addUtcCalendarMonths, cleanupStripeAnnualResources } from "../scripts/a17-stripe-annual-acceptance.mjs";

const script = resolve("scripts/a17-stripe-annual-acceptance.mjs");
const timestamp = (iso) => Math.floor(Date.parse(iso) / 1000);
const iso = (seconds) => new Date(seconds * 1000).toISOString();

test("annual boundaries preserve UTC time and clamp month ends", () => {
  assert.equal(iso(addUtcCalendarMonths(timestamp("2024-02-29T12:34:56Z"), 12)), "2025-02-28T12:34:56.000Z");
  assert.equal(iso(addUtcCalendarMonths(timestamp("2026-01-31T00:00:00Z"), 1)), "2026-02-28T00:00:00.000Z");
  assert.equal(iso(addUtcCalendarMonths(timestamp("2024-08-31T23:00:00Z"), 6)), "2025-02-28T23:00:00.000Z");
});

for (const scenario of [
  { name: "inherited live key", key: "sk_live_AAAAAAAAAAAAAAAA", confirm: "I_AUTHORIZE_TEST_MODE_PROVIDER_OBJECTS", target: "isolated-test" },
  { name: "missing explicit authorization", key: "sk_test_AAAAAAAAAAAAAAAA", confirm: "", target: "isolated-test" },
]) {
  test(`execution guard blocks ${scenario.name} before Stripe API use`, () => {
    const child = spawnSync(process.execPath, [script, "--execute"], {
      encoding: "utf8",
      timeout: 3000,
      env: {
        ...process.env,
        STRIPE_SECRET_KEY: scenario.key,
        A17_STRIPE_CONFIRM: scenario.confirm,
        A17_STRIPE_TARGET: scenario.target,
      },
    });
    assert.equal(child.error, undefined, child.error?.message);
    assert.equal(child.status, 1);
    assert.match(child.stderr, /failed closed/);
    assert.doesNotMatch(child.stderr, /sk_(?:test|live)_/);
  });
}

test("cleanup reports an owned resource deactivation failure", async () => {
  const resources = { productId: "prod_a17_test", priceId: null, clockId: null, customerId: null, paymentMethodId: null, subscriptionId: null };
  const result = await cleanupStripeAnnualResources({
    stripe: { products: { update: async () => { throw new Error("simulated provider failure"); } } },
    resources,
    product: { id: resources.productId },
    price: null,
  });
  assert.deepEqual(result, { cleanupIncomplete: true });
});
