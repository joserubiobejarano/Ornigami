import { join, resolve } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { getStripeAcceptancePrerequisites, readStripeCliTestKey } from "./a17-stripe-test-acceptance.mjs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DAY = 86400;
const SETTLE_AFTER_BOUNDARY = 7200;
const delay = (ms) => new Promise((resolveDelay) => setTimeout(resolveDelay, ms));

export function assertStripeAnnualExecutionAuthorized({ key, env = process.env }) {
  if (env.A17_STRIPE_CONFIRM !== "I_AUTHORIZE_TEST_MODE_PROVIDER_OBJECTS" ||
      env.A17_STRIPE_TARGET !== "isolated-test" || !/^sk_test_[A-Za-z0-9_]{12,}$/.test(key || "")) {
    throw new Error("execution requires explicit test-mode authorization, isolated-test marker, and a confirmed sk_test key");
  }
}

export function addUtcCalendarMonths(timestamp, months) {
  const date = new Date(timestamp * 1000);
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, lastDay));
  return Math.floor(date.getTime() / 1000);
}

function testObject(object, label) {
  if (!object || object.livemode !== false) throw new Error(`${label} failed test-mode verification`);
  return object;
}

async function waitForClock(stripe, clockId) {
  for (let i = 0; i < 90; i += 1) {
    const clock = testObject(await stripe.testHelpers.testClocks.retrieve(clockId), "test clock");
    if (clock.status === "ready") return clock;
    if (clock.status !== "advancing") throw new Error("test clock entered an unexpected state");
    await delay(1000);
  }
  throw new Error("test clock did not finish advancing within 90 seconds");
}

function invoiceSummary(invoice) {
  if (!invoice || invoice.livemode !== false) throw new Error("invoice was not confirmed as a test-mode object");
  return {
    id: invoice.id,
    status: invoice.status,
    paid: invoice.paid,
    currency: invoice.currency,
    amountDue: invoice.amount_due,
    amountPaid: invoice.amount_paid,
    billingReason: invoice.billing_reason,
    lines: (invoice.lines?.data ?? []).map((line) => ({
      amount: line.amount,
      currency: line.currency,
      period: { start: line.period?.start, end: line.period?.end },
      priceId: (() => {
        const value = line.pricing?.price_details?.price ?? line.price;
        return typeof value === "string" ? value : value?.id ?? null;
      })(),
      recurringInterval: line.price?.recurring?.interval ?? null,
      recurringIntervalCount: line.price?.recurring?.interval_count ?? null,
    })),
  };
}

/** Attempts every owned-resource cleanup and reports any unconfirmed action. */
export async function cleanupStripeAnnualResources({ stripe, resources, product, price }) {
  let cleanupIncomplete = false;
  if (resources.subscriptionId) {
    try {
      const current = testObject(await stripe.subscriptions.retrieve(resources.subscriptionId), "cleanup subscription");
      if (current.status !== "canceled" && current.status !== "incomplete_expired") {
        const canceled = testObject(await stripe.subscriptions.cancel(resources.subscriptionId), "canceled subscription");
        if (canceled.status !== "canceled") cleanupIncomplete = true;
      }
    } catch { cleanupIncomplete = true; }
  }
  if (resources.paymentMethodId) {
    try {
      const detached = testObject(await stripe.paymentMethods.detach(resources.paymentMethodId), "detached payment method");
      if (detached.customer !== null) cleanupIncomplete = true;
      else resources.paymentMethodId = null;
    } catch { cleanupIncomplete = true; }
  }
  if (resources.clockId) {
    try {
      const clock = testObject(await stripe.testHelpers.testClocks.retrieve(resources.clockId), "cleanup test clock");
      if (clock.status === "ready") {
        const deleted = await stripe.testHelpers.testClocks.del(resources.clockId);
        if (!deleted.deleted) cleanupIncomplete = true;
        else resources.clockId = null;
      } else cleanupIncomplete = true;
    } catch { cleanupIncomplete = true; }
  }
  if (resources.customerId) {
    try {
      const deleted = await stripe.customers.del(resources.customerId);
      if (!deleted.deleted) cleanupIncomplete = true;
      else resources.customerId = null;
    } catch {
      // Test-clock deletion may already have removed its attached customer.
      try {
        const customer = await stripe.customers.retrieve(resources.customerId);
        if (!customer.deleted) cleanupIncomplete = true;
        else resources.customerId = null;
      } catch (error) {
        if (error?.code === "resource_missing") resources.customerId = null;
        else cleanupIncomplete = true;
      }
    }
  }
  if (price) {
    try {
      const archived = testObject(await stripe.prices.update(price.id, { active: false }), "archived annual price");
      if (archived.active !== false) cleanupIncomplete = true;
    } catch { cleanupIncomplete = true; }
  }
  if (product) {
    try {
      const archived = testObject(await stripe.products.update(product.id, { active: false }), "archived annual product");
      if (archived.active !== false) cleanupIncomplete = true;
    } catch { cleanupIncomplete = true; }
  }
  return { cleanupIncomplete };
}

/** Creates, verifies, and cleans up a disposable annual test-clock subscription. */
export async function runStripeAnnualAcceptance({ stripe, runId }) {
  if (!stripe || !UUID.test(runId ?? "")) throw new Error("annual acceptance requires a Stripe client and run UUID");
  const evidenceDir = resolve(".local/a17-stripe-evidence");
  mkdirSync(evidenceDir, { recursive: true });
  const evidencePath = join(evidenceDir, `annual-${runId}.json`);
  const resources = { productId: null, priceId: null, clockId: null, customerId: null, paymentMethodId: null, subscriptionId: null };
  let product = null;
  let price = null;
  let failurePhase = null;
  let cleanupIncomplete = false;
  const persist = (status, scenarios = []) => writeFileSync(evidencePath, `${JSON.stringify({
    schema: "ornigami.a17.stripe-annual-acceptance.v1", runId, status, providerMode: "stripe-test",
    resources, scenarios, cleanupIncomplete,
  }, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  let scenarios = [];

  try {
    failurePhase = "create annual test product and price";
    product = testObject(await stripe.products.create({ name: `A17 synthetic annual ${runId}`, metadata: { a17_acceptance_run: runId } }), "product");
    resources.productId = product.id;
    price = testObject(await stripe.prices.create({
      product: product.id, currency: "eur", unit_amount: 36000,
      recurring: { interval: "year", interval_count: 1 }, metadata: { a17_acceptance_run: runId },
    }), "price");
    resources.priceId = price.id;
    if (price.currency !== "eur" || price.unit_amount !== 36000 || price.recurring?.interval !== "year" || price.recurring?.interval_count !== 1) {
      throw new Error("synthetic price does not match EUR 360/year");
    }
    persist("running");

    failurePhase = "create annual trial subscription";
    const now = Math.floor(Date.now() / 1000);
    const clock = testObject(await stripe.testHelpers.testClocks.create({ frozen_time: now, name: `a17-${runId}-annual` }), "test clock");
    resources.clockId = clock.id;
    persist("running");
    const customer = testObject(await stripe.customers.create({
      test_clock: clock.id, email: `a17-${runId}@example.test`, name: "A17 synthetic annual customer",
      metadata: { a17_acceptance_run: runId },
    }), "customer");
    resources.customerId = customer.id;
    const paymentMethod = testObject(await stripe.paymentMethods.create({ type: "card", card: { token: "tok_visa" } }), "payment method");
    resources.paymentMethodId = paymentMethod.id;
    testObject(await stripe.paymentMethods.attach(paymentMethod.id, { customer: customer.id }), "attached payment method");
    testObject(await stripe.customers.update(customer.id, { invoice_settings: { default_payment_method: paymentMethod.id } }), "customer invoice settings");
    let subscription = testObject(await stripe.subscriptions.create({
      customer: customer.id, items: [{ price: price.id }], trial_period_days: 14,
      default_payment_method: paymentMethod.id,
      metadata: { a17_acceptance_run: runId }, expand: ["latest_invoice"],
    }), "subscription");
    resources.subscriptionId = subscription.id;
    if (subscription.status !== "trialing" || subscription.trial_end - subscription.trial_start !== 14 * DAY) {
      throw new Error("annual subscription did not start with an exact 14-day trial");
    }

    failurePhase = "convert annual trial to paid subscription";
    const trialEnd = subscription.trial_end;
    const firstPeriodEnd = addUtcCalendarMonths(trialEnd, 12);
    // Leave time for Stripe's simulated invoice finalization/payment attempt to settle.
    await stripe.testHelpers.testClocks.advance(clock.id, { frozen_time: trialEnd + SETTLE_AFTER_BOUNDARY });
    await waitForClock(stripe, clock.id);
    subscription = testObject(await stripe.subscriptions.retrieve(subscription.id, { expand: ["latest_invoice"] }), "subscription");
    let firstInvoice = subscription.latest_invoice;
    if (typeof firstInvoice === "string") firstInvoice = await stripe.invoices.retrieve(firstInvoice, { expand: ["lines.data.price"] });
    testObject(firstInvoice, "initial annual invoice");
    const paidItem = subscription.items.data[0];
    const firstInvoiceEvidence = invoiceSummary(firstInvoice);
    const firstLine = firstInvoiceEvidence.lines.find((line) => line.priceId === price.id);
    if (subscription.status !== "active" || firstInvoice.status !== "paid" || firstInvoice.amount_paid !== 36000 ||
        paidItem.current_period_start !== trialEnd || paidItem.current_period_end !== firstPeriodEnd ||
        firstLine?.amount !== 36000 || firstLine.period.start !== trialEnd || firstLine.period.end !== firstPeriodEnd) {
      throw new Error("annual trial conversion did not create the expected paid annual period and invoice");
    }

    failurePhase = "renew annual subscription";
    const renewalBoundary = addUtcCalendarMonths(paidItem.current_period_start, 12);
    if (renewalBoundary !== paidItem.current_period_end) throw new Error("Stripe annual period does not match 12 UTC calendar months");
    await stripe.testHelpers.testClocks.advance(clock.id, { frozen_time: renewalBoundary + SETTLE_AFTER_BOUNDARY });
    await waitForClock(stripe, clock.id);
    subscription = testObject(await stripe.subscriptions.retrieve(subscription.id, { expand: ["latest_invoice"] }), "subscription");
    let renewalInvoice = subscription.latest_invoice;
    if (typeof renewalInvoice === "string") renewalInvoice = await stripe.invoices.retrieve(renewalInvoice, { expand: ["lines.data.price"] });
    testObject(renewalInvoice, "annual renewal invoice");
    const renewedItem = subscription.items.data[0];
    const renewalInvoiceEvidence = invoiceSummary(renewalInvoice);
    const renewalLine = renewalInvoiceEvidence.lines.find((line) => line.priceId === price.id);
    const renewalStart = renewalLine?.period.start;
    const renewalEnd = renewalLine?.period.end;
    if (subscription.status !== "active" || renewalInvoice.id === firstInvoice.id || renewalInvoice.billing_reason !== "subscription_cycle" ||
        renewalInvoice.status !== "paid" || renewalInvoice.amount_paid !== 36000 ||
        renewedItem.current_period_start !== renewalBoundary || renewedItem.current_period_end !== addUtcCalendarMonths(renewalBoundary, 12) ||
        renewalLine?.amount !== 36000 || renewalStart !== renewalBoundary || renewalEnd !== renewedItem.current_period_end) {
      throw new Error("annual renewal did not produce the expected paid EUR 360 invoice and next annual period");
    }
    scenarios = [{
      id: "annual-trial-conversion-and-renewal", status: "passed", currency: "eur", annualAmount: 36000,
      annualInterval: `${price.recurring.interval} x ${price.recurring.interval_count}`,
      trialDays: 14, subscriptionStatus: subscription.status,
      periods: {
        initial: { start: paidItem.current_period_start, end: paidItem.current_period_end, calendarMonths: 12 },
        renewal: { start: renewedItem.current_period_start, end: renewedItem.current_period_end, calendarMonths: 12 },
      },
      invoices: [firstInvoiceEvidence, renewalInvoiceEvidence],
    }];
    if (firstInvoice.id === renewalInvoice.id) throw new Error("annual renewal reused the conversion invoice");
    persist("running", scenarios);
  } catch {
    // Keep provider errors and potentially sensitive request data out of evidence and CLI output.
    scenarios = [{ id: "annual-trial-conversion-and-renewal", status: "failed", phase: failurePhase }];
  } finally {
    ({ cleanupIncomplete } = await cleanupStripeAnnualResources({ stripe, resources, product, price }));
  }

  const passed = scenarios[0]?.status === "passed";
  const status = cleanupIncomplete ? (passed ? "cleanup-incomplete" : "scenario-failed-and-cleanup-incomplete") : passed ? "provider-annual-passed" : "scenario-failed";
  persist(status, scenarios);
  if (status !== "provider-annual-passed") throw new Error(`Stripe annual provider acceptance ${status}; phase=${failurePhase ?? "cleanup"}`);
  return { schema: "ornigami.a17.stripe-annual-acceptance.v1", status, providerMode: "stripe-test", runId, scenarios, cleanup: "subscription canceled; payment method detached; test clock and customer deleted; synthetic product and price deactivated", evidenceFile: evidencePath };
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const envKey = process.env.STRIPE_SECRET_KEY;
  // A present inherited key is authoritative: live/unknown keys block, never fall through to CLI config.
  const key = envKey !== undefined ? envKey : readStripeCliTestKey();
  const prerequisites = getStripeAcceptancePrerequisites({ STRIPE_SECRET_KEY: key || "" });
  if (!args.has("--execute")) {
    process.stdout.write(`${JSON.stringify({ status: "blocked", providerMode: prerequisites.keyMode, target: "not-run", prerequisites })}\n`);
    process.exitCode = 2;
    return;
  }
  assertStripeAnnualExecutionAuthorized({ key });
  const { default: Stripe } = await import("stripe");
  const stripe = new Stripe(key, { apiVersion: "2026-07-29.dahlia", maxNetworkRetries: 0, timeout: 20_000 });
  const evidence = await runStripeAnnualAcceptance({ stripe, runId: randomUUID() });
  process.stdout.write(`${JSON.stringify({ ...evidence, prerequisites }, null, 2)}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main().catch((error) => {
    const message = error instanceof Error && /^Stripe annual provider acceptance (?:provider-annual-passed|cleanup-incomplete|scenario-failed(?:-and-cleanup-incomplete)?); phase=[a-z ]+$/.test(error.message)
      ? `${error.message}; evidence saved under .local/a17-stripe-evidence` : "Stripe annual acceptance failed closed; details omitted";
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
