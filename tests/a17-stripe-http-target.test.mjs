import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import test from "node:test";
import { cancelOwnedProviderSequenceSubscription, updateOwnedProviderSequenceSubscription } from "../scripts/a17-stripe-http-target.mjs";

function ownedSequenceFixture() {
  const expected = {
    subscriptionId: "sub_owned", customerId: "cus_owned", ownerUserId: "owner-a",
    businessId: "business-a", runId: "run-a", priceId: "price_annual",
  };
  const subscription = {
    id: expected.subscriptionId, livemode: false, customer: expected.customerId, status: "trialing",
    metadata: { owner_user_id: expected.ownerUserId, business_id: expected.businessId, plan_id: "booster", billing_period: "annual" },
    items: { data: [{ quantity: 1, price: { id: expected.priceId } }] },
  };
  const price = {
    id: expected.priceId, livemode: false, active: true, recurring: { interval: "year", interval_count: 1 }, currency: "eur", unit_amount: 36000,
    metadata: { a17_acceptance_run: expected.runId, plan: "booster", period: "annual" },
  };
  const calls = [];
  const stripe = {
    subscriptions: {
      retrieve: async () => { calls.push("retrieve"); return subscription; },
      update: async (id) => { calls.push("update"); assert.equal(id, expected.subscriptionId); return subscription; },
      cancel: async (id) => { calls.push("cancel"); assert.equal(id, expected.subscriptionId); return { ...subscription, status: "canceled" }; },
    },
    customers: { retrieve: async () => ({ id: expected.customerId, livemode: false, metadata: { owner_user_id: expected.ownerUserId } }) },
    prices: { retrieve: async () => price },
  };
  return { stripe, expected, price, calls, subscription };
}

const script = resolve("scripts/a17-stripe-http-target.mjs");

test("provider sequence permits the owned trial and fetches ownership again before cancellation", async () => {
  const { stripe, expected, calls } = ownedSequenceFixture();
  await updateOwnedProviderSequenceSubscription({ stripe, expected, probe: "owned-probe" });
  await cancelOwnedProviderSequenceSubscription({ stripe, expected });
  assert.deepEqual(calls, ["retrieve", "update", "retrieve", "cancel"]);
});

test("provider sequence blocks another run's price before either mutation", async () => {
  const { stripe, expected, price, calls } = ownedSequenceFixture();
  price.metadata.a17_acceptance_run = "another-run";
  await assert.rejects(() => updateOwnedProviderSequenceSubscription({ stripe, expected, probe: "owned-probe" }), /not owned/);
  await assert.rejects(() => cancelOwnedProviderSequenceSubscription({ stripe, expected }), /not owned/);
  assert.deepEqual(calls, ["retrieve", "retrieve"]);
});

test("provider sequence blocks additional subscription items before cancellation", async () => {
  const { stripe, expected, subscription, calls } = ownedSequenceFixture();
  subscription.items.data.push({ quantity: 1, price: { id: "price_unrelated" } });
  await assert.rejects(() => cancelOwnedProviderSequenceSubscription({ stripe, expected }), /exactly one annual Booster item/);
  assert.deepEqual(calls, ["retrieve"]);
});

for (const scenario of [
  {
    name: "an inherited live key",
    key: "sk_live_AAAAAAAAAAAAAAAA",
    confirm: "I_AUTHORIZE_TEST_MODE_PROVIDER_OBJECTS",
    target: "isolated-test",
    expected: /inherited live Stripe key blocks this target/,
  },
  {
    name: "missing provider-object authorization",
    key: "sk_test_AAAAAAAAAAAAAAAA",
    confirm: "",
    target: "isolated-test",
    expected: /isolated-test marker and explicit test-resource authorization are required/,
  },
  {
    name: "missing isolated-target marker",
    key: "sk_test_AAAAAAAAAAAAAAAA",
    confirm: "I_AUTHORIZE_TEST_MODE_PROVIDER_OBJECTS",
    target: "",
    expected: /isolated-test marker and explicit test-resource authorization are required/,
  },
]) {
  test(`HTTP target launcher blocks ${scenario.name} before provider mutation`, () => {
    const child = spawnSync(process.execPath, [script], {
      encoding: "utf8",
      timeout: 5_000,
      windowsHide: true,
      env: {
        ...process.env,
        STRIPE_SECRET_KEY: scenario.key,
        A17_STRIPE_CONFIRM: scenario.confirm,
        A17_STRIPE_TARGET: scenario.target,
      },
    });

    assert.equal(child.error, undefined, child.error?.message);
    assert.equal(child.status, 1);
    assert.match(child.stderr, scenario.expected);
    assert.doesNotMatch(child.stderr, /sk_(?:test|live)_/);
    assert.equal(child.stdout, "");
  });
}

test("provider sequence refuses a stale customer mapping before subscription mutation", async () => {
  let mutationCalls = 0;
  const stripe = {
    subscriptions: {
      retrieve: async (id) => ({
        id, livemode: false, customer: "cus_other_test_owner", status: "trialing",
        metadata: { owner_user_id: "owner-a", business_id: "business-a", plan_id: "booster", billing_period: "annual" },
        items: { data: [{ price: { id: "price_annual" } }] },
      }),
      update: async () => { mutationCalls += 1; throw new Error("must not mutate stale mapping"); },
    },
    prices: { retrieve: async () => { throw new Error("customer validation should fail first"); } },
  };

  await assert.rejects(() => updateOwnedProviderSequenceSubscription({
    stripe,
    expected: {
      subscriptionId: "sub_a17", customerId: "cus_expected_owner", ownerUserId: "owner-a",
      businessId: "business-a", runId: "run-a", priceId: "price_annual",
    },
    probe: "run-a-probe",
  }), /did not match the isolated annual owner mapping/);
  assert.equal(mutationCalls, 0);
});

test("provider sequence revalidates its owner mapping before cancellation", async () => {
  let cancellationCalls = 0;
  const stripe = {
    subscriptions: {
      retrieve: async (id) => ({
        id, livemode: false, customer: "cus_other_test_owner", status: "trialing",
        metadata: { owner_user_id: "owner-a", business_id: "business-a", plan_id: "booster", billing_period: "annual" },
        items: { data: [{ price: { id: "price_annual" } }] },
      }),
      cancel: async () => { cancellationCalls += 1; throw new Error("must not cancel stale mapping"); },
    },
    prices: { retrieve: async () => { throw new Error("customer validation should fail first"); } },
  };

  await assert.rejects(() => cancelOwnedProviderSequenceSubscription({
    stripe,
    expected: {
      subscriptionId: "sub_a17", customerId: "cus_expected_owner", ownerUserId: "owner-a",
      businessId: "business-a", runId: "run-a", priceId: "price_annual",
    },
  }), /did not match the isolated annual owner mapping/);
  assert.equal(cancellationCalls, 0);
});
