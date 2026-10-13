import { join, resolve } from "node:path";
import { homedir } from "node:os";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const STRIPE_ACCEPTANCE_SCENARIOS = Object.freeze([
  { id: "trial-start", evidence: ["14-day trialing subscription"] },
  { id: "trial-without-payment-method-expires", evidence: ["subscription ended after trial without payment method"] },
  { id: "successful-trial-conversion", evidence: ["active subscription", "paid invoice"] },
  { id: "payment-failure", evidence: ["subscription enters past-due or unpaid state"] },
  { id: "cancellation", evidence: ["subscription cancellation completed"] },
  { id: "hosted-checkout-payload", evidence: ["Stripe accepted subscription checkout session with 14-day trial"] },
]);

/** Reports only presence and key mode. Never returns or logs a credential value. */
/** @param {Record<string, string | undefined>} [env=process.env] */
export function getStripeAcceptancePrerequisites(env = process.env) {
  const key = env.STRIPE_SECRET_KEY || "";
  const checks = { testSecretKey: /^sk_test_[A-Za-z0-9_]{12,}$/.test(key) ? "ready" : "blocked" };
  return {
    checks,
    status: checks.testSecretKey,
    keyMode: key.startsWith("sk_test_") ? "test-prefix" : key.startsWith("sk_live_") ? "live-prefix-blocked" : key ? "unknown-prefix-blocked" : "missing",
    scenarioIds: STRIPE_ACCEPTANCE_SCENARIOS.map(({ id }) => id),
  };
}

/** Reads only the CLI's named test key; the file and any live key are never emitted. */
export function readStripeCliTestKey(path = resolve(homedir(), ".config/stripe/config.toml")) {
  let source;
  try { source = readFileSync(path, "utf8"); } catch { return null; }
  const matches = [...source.matchAll(/^\s*test_mode_api_key\s*=\s*["']([^"']+)["']\s*(?:#.*)?$/gm)];
  if (matches.length !== 1 || !/^sk_test_[A-Za-z0-9_]{12,}$/.test(matches[0][1])) return null;
  return matches[0][1];
}

const delay = (ms) => new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
function assertTestObject(value, name) {
  if (!value || value.livemode !== false) throw new Error(`${name} was not confirmed as a Stripe test-mode object`);
  return value;
}

async function subscriptionEvents(stripe, subscriptionId, since) {
  const types = ["customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted",
    "invoice.created", "invoice.finalized", "invoice.paid", "invoice.payment_succeeded", "invoice.payment_failed"];
  const page = await stripe.events.list({ created: { gte: since }, types, limit: 100 });
  return page.data.filter((event) => {
    const object = event.data?.object;
    return object?.id === subscriptionId || object?.subscription === subscriptionId ||
      object?.parent?.subscription_details?.subscription === subscriptionId;
  }).map((event) => {
    if (event.livemode !== false) throw new Error("Stripe returned a live-mode event for a test subscription");
    const object = event.data.object;
    return {
      id: event.id, object: "event", api_version: event.api_version, created: event.created,
      livemode: false, type: event.type,
      data: { object: {
        id: object.id, object: object.object,
        ...(object.customer ? { customer: typeof object.customer === "string" ? object.customer : object.customer.id } : {}),
        ...(object.metadata ? { metadata: object.metadata } : {}),
        ...(object.mode ? { mode: object.mode } : {}),
        ...(object.status ? { status: object.status } : {}),
        ...(object.subscription ? { subscription: typeof object.subscription === "string" ? object.subscription : object.subscription.id } : {}),
        ...(object.parent?.subscription_details ? { parent: { subscription_details: {
          subscription: typeof object.parent.subscription_details.subscription === "string"
            ? object.parent.subscription_details.subscription : object.parent.subscription_details.subscription?.id ?? null,
          metadata: object.parent.subscription_details.metadata ?? {},
        } } } : {}),
      } },
    };
  }).sort((a, b) => a.created - b.created || a.id.localeCompare(b.id));
}

async function waitForClock(stripe, clockId) {
  for (let attempt = 0; attempt < 90; attempt += 1) {
    const clock = assertTestObject(await stripe.testHelpers.testClocks.retrieve(clockId), "test clock");
    if (clock.status === "ready") return clock;
    if (clock.status !== "advancing") throw new Error("test clock entered an unexpected state");
    await delay(1000);
  }
  throw new Error("test clock did not finish advancing within 90 seconds");
}

async function makeClockScenario(stripe, { runId, label, priceId, paymentSource, cancelAfterCreate = false, expireTrial = false, onClockCreated, onClockDeleted }) {
  const now = Math.floor(Date.now() / 1000);
  const clock = assertTestObject(await stripe.testHelpers.testClocks.create({ frozen_time: now, name: `a17-${runId}-${label}` }), "test clock");
  let customer;
  let subscription;
  try {
    onClockCreated?.(clock.id);
    customer = await stripe.customers.create({
      test_clock: clock.id,
      email: `a17-${runId}-${label}@example.test`,
      name: `A17 synthetic ${label}`,
      ...(paymentSource ? { source: paymentSource } : {}),
      metadata: { a17_acceptance_run: runId, a17_scenario: label },
    });
    assertTestObject(customer, "customer");
    subscription = await stripe.subscriptions.create({
      customer: customer.id,
      items: [{ price: priceId }],
      trial_period_days: 14,
      ...(expireTrial ? { trial_settings: { end_behavior: { missing_payment_method: "cancel" } } } : {}),
      metadata: { a17_acceptance_run: runId, a17_scenario: label },
      expand: ["latest_invoice"],
    });
    assertTestObject(subscription, "subscription");
    if (subscription.status !== "trialing" || subscription.trial_end - subscription.trial_start !== 14 * 24 * 60 * 60) throw new Error("subscription did not start with the configured 14-day trial");
    if (cancelAfterCreate) {
      await stripe.subscriptions.cancel(subscription.id);
      subscription = assertTestObject(await stripe.subscriptions.retrieve(subscription.id), "subscription");
      if (subscription.status !== "canceled") throw new Error("subscription cancellation did not complete");
    } else if (expireTrial || paymentSource) {
      await stripe.testHelpers.testClocks.advance(clock.id, { frozen_time: now + 16 * 24 * 60 * 60 });
      await waitForClock(stripe, clock.id);
      subscription = assertTestObject(await stripe.subscriptions.retrieve(subscription.id, { expand: ["latest_invoice"] }), "subscription");
    }
    const events = await subscriptionEvents(stripe, subscription.id, now);
    const item = subscription.items.data[0];
    const subscriptionSnapshot = {
      id: subscription.id, object: "subscription", customer: customer.id, status: subscription.status,
      metadata: subscription.metadata, livemode: false, start_date: subscription.start_date,
      trial_start: subscription.trial_start, trial_end: subscription.trial_end,
      items: { data: [{ price: { id: item.price.id }, current_period_start: item.current_period_start, current_period_end: item.current_period_end }] },
    };
    return { status: subscription.status, trialStart: subscription.trial_start, trialEnd: subscription.trial_end, subscriptionId: subscription.id,
      customerId: customer.id, invoiceStatus: typeof subscription.latest_invoice === "object" ? subscription.latest_invoice?.status : null,
      events, subscriptionSnapshot };
  } finally {
    try {
      const deletion = await stripe.testHelpers.testClocks.del(clock.id);
      if (!deletion.deleted) throw new Error("A17_CLOCK_CLEANUP_FAILED");
      onClockDeleted?.(clock.id);
    } catch { throw new Error("A17_CLOCK_CLEANUP_FAILED"); }
  }
}

/** Provider-only acceptance. It creates synthetic Stripe test objects and always attempts clock cleanup. */
export async function runStripeProviderAcceptance({ stripe, runId }) {
  if (!stripe || !UUID.test(runId || "")) throw new Error("provider acceptance requires a Stripe client and run UUID");
  const results = [];
  const resources = { productId: null, priceId: null, checkoutSessionId: null, clocks: [] };
  let product;
  let syntheticPrice = null;
  let cleanupFailed = false;
  let scenarioFailure = null;
  let checkoutSession = null;
  let phase = "create synthetic product";
  const evidenceDir = resolve(".local/a17-stripe-evidence");
  mkdirSync(evidenceDir, { recursive: true });
  const evidencePath = join(evidenceDir, `provider-${runId}.json`);
  const persist = (status) => writeFileSync(evidencePath, `${JSON.stringify({ runId, status, providerMode: "stripe-test", productId: resources.productId, priceId: resources.priceId, checkoutSessionId: resources.checkoutSessionId, pendingClockIds: resources.clocks, scenarios: results }, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  const clockCallbacks = {
    onClockCreated: (id) => { resources.clocks.push(id); persist("running"); },
    onClockDeleted: (id) => { resources.clocks = resources.clocks.filter((clockId) => clockId !== id); persist("running"); },
  };
  try {
    const createdProduct = await stripe.products.create({ name: `A17 synthetic acceptance ${runId}`, metadata: { a17_acceptance_run: runId } });
    assertTestObject(createdProduct, "product");
    product = createdProduct;
    resources.productId = product.id;
    phase = "create synthetic EUR 39 monthly price";
    const createdPrice = await stripe.prices.create({ product: product.id, currency: "eur", unit_amount: 3900, recurring: { interval: "month" }, metadata: { a17_acceptance_run: runId } });
    assertTestObject(createdPrice, "price");
    syntheticPrice = createdPrice;
    resources.priceId = syntheticPrice.id;
    persist("running");
    phase = "trial start";
    const trial = await makeClockScenario(stripe, { runId, label: "trial-start", priceId: syntheticPrice.id, ...clockCallbacks });
    if (trial.status !== "trialing") throw new Error("trial start assertion failed");
    results.push({ id: "trial-start", status: "passed", subscriptionStatus: trial.status, trialDays: 14, events: trial.events, subscriptionSnapshot: trial.subscriptionSnapshot });
    persist("running");

    phase = "no-method trial expiry";
    const expired = await makeClockScenario(stripe, { runId, label: "no-method-expiry", priceId: syntheticPrice.id, expireTrial: true, ...clockCallbacks });
    if (expired.status !== "canceled") throw new Error("missing-payment-method trial did not cancel");
    results.push({ id: "trial-without-payment-method-expires", status: "passed", subscriptionStatus: expired.status, events: expired.events, subscriptionSnapshot: expired.subscriptionSnapshot });
    persist("running");

    phase = "successful trial conversion";
    const converted = await makeClockScenario(stripe, { runId, label: "conversion", priceId: syntheticPrice.id, paymentSource: "tok_visa", ...clockCallbacks });
    if (converted.status !== "active" || converted.invoiceStatus !== "paid") throw new Error("successful trial conversion did not produce a paid active subscription");
    results.push({ id: "successful-trial-conversion", status: "passed", subscriptionStatus: converted.status, invoiceStatus: converted.invoiceStatus, events: converted.events, subscriptionSnapshot: converted.subscriptionSnapshot });
    persist("running");

    phase = "declined trial conversion";
    const failed = await makeClockScenario(stripe, { runId, label: "payment-failure", priceId: syntheticPrice.id, paymentSource: "tok_chargeCustomerFail", ...clockCallbacks });
    if (!["past_due", "unpaid"].includes(failed.status)) throw new Error("declined trial conversion did not enter a failed-payment state");
    results.push({ id: "payment-failure", status: "passed", subscriptionStatus: failed.status, events: failed.events, subscriptionSnapshot: failed.subscriptionSnapshot });
    persist("running");

    phase = "cancellation";
    const canceled = await makeClockScenario(stripe, { runId, label: "cancellation", priceId: syntheticPrice.id, cancelAfterCreate: true, ...clockCallbacks });
    if (canceled.status !== "canceled") throw new Error("cancellation did not complete");
    results.push({ id: "cancellation", status: "passed", subscriptionStatus: canceled.status, events: canceled.events, subscriptionSnapshot: canceled.subscriptionSnapshot });
    persist("running");
    phase = "hosted checkout payload";
    const createdCheckout = await stripe.checkout.sessions.create({
      mode: "subscription", payment_method_collection: "if_required", line_items: [{ price: syntheticPrice.id, quantity: 1 }],
      subscription_data: { trial_period_days: 14, trial_settings: { end_behavior: { missing_payment_method: "cancel" } }, metadata: { a17_acceptance_run: runId } },
      custom_text: { submit: { message: "Your one-time 14-day trial starts when checkout completes. No card is required to start. Add a valid payment method in Billing before it ends to continue on this paid plan; without one, your trial subscription cancels at expiry. Cancelling or changing plans does not create another trial." } },
      customer_email: `a17-${runId}-checkout@example.test`,
      success_url: "http://127.0.0.1:3200/acceptance/success?session_id={CHECKOUT_SESSION_ID}",
      cancel_url: "http://127.0.0.1:3200/acceptance/cancel",
      metadata: { a17_acceptance_run: runId },
    });
    assertTestObject(createdCheckout, "checkout session");
    checkoutSession = createdCheckout;
    resources.checkoutSessionId = checkoutSession.id;
    if (checkoutSession.mode !== "subscription" || checkoutSession.status !== "open") throw new Error("Stripe did not accept the hosted checkout trial payload");
    const expiredCheckout = await stripe.checkout.sessions.expire(checkoutSession.id);
    assertTestObject(expiredCheckout, "expired checkout session");
    if (expiredCheckout.status !== "expired") throw new Error("synthetic checkout session cleanup was not confirmed");
    checkoutSession = expiredCheckout;
    results.push({ id: "hosted-checkout-payload", status: "passed", checkoutSessionId: checkoutSession.id, checkoutSessionExpired: true, trialDays: 14 });
    persist("running");
  } catch (error) {
    if (error instanceof Error && error.message === "A17_CLOCK_CLEANUP_FAILED") cleanupFailed = true;
    scenarioFailure = `scenario failed during ${phase}`;
  } finally {
    if (checkoutSession?.status === "open") {
      try {
        const expiredCheckout = await stripe.checkout.sessions.expire(checkoutSession.id);
        if (expiredCheckout.status !== "expired") cleanupFailed = true;
      } catch { cleanupFailed = true; }
    }
    if (syntheticPrice) {
      try {
        const inactivePrice = await stripe.prices.update(syntheticPrice.id, { active: false });
        assertTestObject(inactivePrice, "archived price");
        if (inactivePrice.active !== false) cleanupFailed = true;
      } catch { cleanupFailed = true; }
    }
    if (product) {
      try {
        const inactiveProduct = await stripe.products.update(product.id, { active: false });
        assertTestObject(inactiveProduct, "archived product");
        if (inactiveProduct.active !== false) cleanupFailed = true;
      } catch { cleanupFailed = true; }
    }
    for (const clockId of [...resources.clocks]) {
      try {
        const clock = assertTestObject(await stripe.testHelpers.testClocks.retrieve(clockId), "pending test clock");
        if (clock.status === "ready") {
          const deleted = await stripe.testHelpers.testClocks.del(clockId);
          if (!deleted.deleted) cleanupFailed = true;
          else resources.clocks = resources.clocks.filter((id) => id !== clockId);
        } else cleanupFailed = true;
      } catch { cleanupFailed = true; }
    }
  }
  const finalStatus = cleanupFailed ? (scenarioFailure ? "scenario-failed-and-cleanup-incomplete" : "cleanup-incomplete")
    : scenarioFailure ? "scenario-failed" : "provider-scenarios-passed";
  persist(finalStatus);
  if (scenarioFailure || cleanupFailed) throw new Error(`Stripe provider ${scenarioFailure || "scenario passed"}${cleanupFailed ? "; cleanup incomplete" : ""}`);
  return {
    schema: "ornigami.a17.stripe-test-acceptance.v1",
    status: "provider-scenarios-passed",
    providerMode: "stripe-test",
    target: "synthetic-test-clock-resources",
    runId,
    scenarios: results.map((scenario) => ({
      id: scenario.id,
      status: scenario.status,
      ...(scenario.subscriptionStatus ? { subscriptionStatus: scenario.subscriptionStatus } : {}),
      ...(scenario.trialDays ? { trialDays: scenario.trialDays } : {}),
      ...(scenario.invoiceStatus ? { invoiceStatus: scenario.invoiceStatus } : {}),
      ...(scenario.checkoutSessionExpired ? { checkoutSessionExpired: true } : {}),
      eventCount: scenario.events?.length ?? 0,
    })),
    webhookReplayAndOrdering: "not-tested-no-isolated-app-endpoint",
    applicationQuotaPreservation: "not-tested-no-isolated-database",
    cleanup: "test clocks deleted; synthetic product and price deactivated",
    evidenceFile: evidencePath,
  };
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const key = process.env.STRIPE_SECRET_KEY || readStripeCliTestKey();
  const prerequisites = getStripeAcceptancePrerequisites({ ...process.env, STRIPE_SECRET_KEY: key || "" });
  if (args.has("--execute")) {
    if (process.env.A17_STRIPE_CONFIRM !== "I_AUTHORIZE_TEST_MODE_PROVIDER_OBJECTS" ||
        process.env.A17_STRIPE_TARGET !== "isolated-test" || !/^sk_test_[A-Za-z0-9_]{12,}$/.test(key || "")) {
      throw new Error("execution requires explicit test-mode authorization, isolated-test marker, and an sk_test key");
    }
    const { default: Stripe } = await import("stripe");
    const stripe = new Stripe(key, { apiVersion: "2026-07-29.dahlia", maxNetworkRetries: 0, timeout: 20_000 });
    const runId = randomUUID();
    const evidence = await runStripeProviderAcceptance({ stripe, runId });
    process.stdout.write(`${JSON.stringify({ ...evidence, prerequisites }, null, 2)}\n`);
    return;
  }
  const evidence = {
    schema: "ornigami.a17.stripe-test-acceptance.v1",
    status: "blocked",
    providerMode: prerequisites.keyMode,
    target: "not-run",
    scenarios: [],
    cleanup: "not-needed",
    error: null,
    prerequisites,
    note: "Use --execute with an explicitly authorized Stripe test key to create synthetic test-clock resources. Application webhook and quota evidence is separate.",
  };
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
  process.exitCode = 2;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main().catch((error) => {
    const ownFailure = error instanceof Error && /^Stripe provider (?:scenario failed during (?:create synthetic product|create synthetic EUR 39 monthly price|trial start|no-method trial expiry|successful trial conversion|declined trial conversion|cancellation|hosted checkout payload)(?:; cleanup incomplete)?|scenario passed; cleanup incomplete)$/.test(error.message)
      ? error.message : undefined;
    const safe = error && typeof error === "object" ? {
      name: typeof error.name === "string" ? error.name : "Error",
      message: ownFailure,
      code: typeof error.code === "string" && /^[a-z0-9_]{1,64}$/i.test(error.code) ? error.code : undefined,
      providerCode: typeof error.raw?.code === "string" && /^[a-z0-9_]{1,64}$/i.test(error.raw.code) ? error.raw.code : undefined,
      requestId: typeof error.requestId === "string" && /^[a-z0-9_]{1,64}$/i.test(error.requestId) ? error.requestId : undefined,
      type: typeof error.type === "string" && /^[a-z0-9_]{1,64}$/i.test(error.type) ? error.type : undefined,
      statusCode: Number.isInteger(error.statusCode) ? error.statusCode : undefined,
    } : {};
    process.stderr.write(`Stripe test acceptance failed closed: ${JSON.stringify(safe)}\n`);
    process.exitCode = 1;
  });
}
