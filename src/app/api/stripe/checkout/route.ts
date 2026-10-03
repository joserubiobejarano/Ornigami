import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import type Stripe from "stripe";

import { auth } from "@/auth";
import { BusinessAccessError, requireBusinessOwner } from "@/lib/business-context";
import { sql } from "@/lib/db/neon";
import { getServerAppUrl } from "@/lib/env";
import { stripe } from "@/lib/stripe";
import { planForAgent, stripePriceId, TRIAL_PERIOD_DAYS } from "@/lib/billing/plans";
import { TRIAL_CHECKOUT_POLICY, isCheckoutBillingPeriod, isCheckoutPlanId } from "@/lib/billing/checkout-policy";
import {
  claimCheckoutIntent, expireCheckoutIntent, finalizeCheckoutIntent, markCheckoutIntentCompleted,
  markCheckoutIntentUncertain, claimOwnerCustomerProvisioning, finalizeOwnerCustomerProvisioning,
  beginBillingCustomerProviderCall, finishBillingCustomerProviderCall, recordBillingCustomerProviderResult,
  beginBillingCheckoutProviderCall, finishBillingCheckoutProviderCall,
  getTrialEligibility,
} from "@/lib/billing/persistence";
import { safeLogger } from "@/lib/safe-logger";

type CheckoutValues = { plan_id?: unknown; billing_period?: unknown; business_id?: unknown; agent_id?: unknown };

async function readValues(request: Request): Promise<CheckoutValues> {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const parsed = await request.json().catch(() => ({}));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as CheckoutValues : {};
  }
  if (contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    return {
      plan_id: form.get("plan_id"), billing_period: form.get("billing_period"),
      business_id: form.has("business_id") ? form.get("business_id") : undefined,
      agent_id: form.has("agent_id") ? form.get("agent_id") : undefined,
    };
  }
  return {};
}

function recoverable(message: string, status = 503) {
  return NextResponse.json({ error: message, recoverable: true }, { status });
}

function sessionCustomerId(session: Stripe.Checkout.Session): string | null {
  return typeof session.customer === "string" ? session.customer : session.customer?.id ?? null;
}

async function setBusinessCustomer(businessId: string, customerId: string): Promise<void> {
  const rows = await sql`SELECT public.set_billing_business_customer(${businessId}::uuid,${customerId}) AS changed`;
  if ((rows[0] as { changed?: boolean } | undefined)?.changed !== true) throw new Error("Business customer mapping changed during checkout");
}

async function findSessionsForIntent(customerId: string, token: string): Promise<Stripe.Checkout.Session[]> {
  const matches: Stripe.Checkout.Session[] = [];
  for (const status of ["open", "complete", "expired"] as const) {
    const page = stripe.checkout.sessions.list({ customer: customerId, status, limit: 100 });
    for await (const session of page) {
      if (session.metadata?.billing_intent_token === token) matches.push(session);
    }
  }
  return matches;
}

async function reconcileExistingSession(input: {
  intentId: string; fence: string; idempotencyKey: string; payload: Stripe.Checkout.SessionCreateParams;
  sessionId?: string | null; url?: string | null; customerId: string;
}): Promise<Response | "retry" | "expired"> {
  let session: Stripe.Checkout.Session | undefined;
  try {
    if (input.sessionId) {
      session = await stripe.checkout.sessions.retrieve(input.sessionId);
    } else {
      const token = input.payload.metadata?.billing_intent_token;
      if (typeof token !== "string" || !token) return recoverable("Checkout intent is missing its reconciliation token");
      const matches = await findSessionsForIntent(input.customerId, token);
      if (matches.length > 1) return recoverable("Multiple Stripe sessions require reconciliation", 409);
      session = matches[0];
    }
  } catch (error) {
    await markCheckoutIntentUncertain({ intentId: input.intentId, fence: input.fence });
    safeLogger.warn("stripe.checkout.session_reconcile_failed", { error: error instanceof Error ? error.message : "unknown" });
    return recoverable("Checkout status is being reconciled");
  }
  if (!session) return "retry";
  if (sessionCustomerId(session) !== input.customerId) {
    await markCheckoutIntentUncertain({ intentId: input.intentId, fence: input.fence });
    return recoverable("Checkout customer mapping requires reconciliation", 409);
  }
  if (session.status === "complete") {
    const completed = await markCheckoutIntentCompleted({ intentId: input.intentId, fence: input.fence, sessionId: session.id });
    if (!completed) return recoverable("Checkout completed; subscription status is being reconciled", 409);
    return recoverable("Checkout already completed; subscription status is being reconciled", 409);
  }
  if (session.status === "open") {
    if (!session.url) return recoverable("Stripe checkout URL is unavailable");
    const saved = await finalizeCheckoutIntent({ intentId: input.intentId, fence: input.fence, sessionId: session.id, url: session.url });
    if (!saved) return recoverable("Checkout session is being reconciled");
    return NextResponse.redirect(session.url, { status: 303 });
  }
  const expired = await expireCheckoutIntent({ intentId: input.intentId, fence: input.fence, sessionId: session.id });
  if (!expired) return recoverable("Checkout intent changed while reconciling", 409);
  return "expired";
}

async function getOwnerCustomer(ownerUserId: string, businessId: string): Promise<string> {
  const mappings = await sql`
    SELECT b.stripe_customer_id AS business_customer_id,
           c.stripe_customer_id AS owner_customer_id
    FROM public.businesses b
    LEFT JOIN public.billing_owner_customers c ON c.owner_user_id = b.owner_user_id
    WHERE b.id = ${businessId} AND b.owner_user_id = ${ownerUserId}
    LIMIT 1
  `;
  const mapping = mappings[0] as { business_customer_id: string | null; owner_customer_id: string | null } | undefined;
  if (!mapping) throw new Error("Canonical business mapping is unavailable");
  if (mapping.business_customer_id && mapping.owner_customer_id && mapping.business_customer_id !== mapping.owner_customer_id) {
    throw new Error("Conflicting owner and business Stripe customer mappings");
  }
  if (mapping.business_customer_id && !mapping.owner_customer_id) {
    throw new Error("Legacy Stripe customer mapping requires reconciliation");
  }
  if (mapping.owner_customer_id) {
    const customer = await stripe.customers.retrieve(mapping.owner_customer_id);
    if (customer.deleted) throw new Error("Mapped Stripe customer is deleted");
    if (customer.metadata.owner_user_id && customer.metadata.owner_user_id !== ownerUserId) {
      throw new Error("Stripe customer owner mapping is inconsistent");
    }
    await setBusinessCustomer(businessId, customer.id);
    return customer.id;
  }

  const claim = await claimOwnerCustomerProvisioning({ ownerUserId });
  if (claim.kind === "mapped" && claim.customerId) {
    const customer = await stripe.customers.retrieve(claim.customerId);
    if (customer.deleted) throw new Error("Mapped Stripe customer is deleted");
    if (customer.metadata.owner_user_id && customer.metadata.owner_user_id !== ownerUserId) {
      throw new Error("Stripe customer owner mapping is inconsistent");
    }
    if (claim.fence && customer.metadata.billing_customer_provisioning_key !== claim.idempotencyKey) {
      throw new Error("Stripe customer provisioning token is inconsistent");
    }
    if (claim.fence && !(await finalizeOwnerCustomerProvisioning({ ownerUserId, fence: claim.fence, customerId: customer.id }))) {
      throw new Error("Stripe customer provisioning requires reconciliation");
    }
    await setBusinessCustomer(businessId, customer.id);
    return customer.id;
  }
  if (claim.kind === "busy") throw new Error("Stripe customer creation is in progress");
  if (claim.kind === "uncertain") {
    if (!claim.fence) throw new Error("Stripe customer provisioning lease is unavailable");
    if (!(await beginBillingCustomerProviderCall({ ownerUserId, fence: claim.fence }))) {
      throw new Error("Stripe customer recovery is blocked by account lifecycle state");
    }
    let recoveryOutcome: "done" | "uncertain" = "uncertain";
    let recoveredCustomerId: string | null = null;
    try {
      const found = await stripe.customers.search(
        { query: `metadata['billing_customer_provisioning_key']:'${claim.idempotencyKey ?? ""}'`, limit: 10 },
        { timeout: 20_000, maxNetworkRetries: 0 },
      );
      if (found.data.length > 1) throw new Error("Multiple Stripe customers require reconciliation");
      if (found.data.length === 1) {
        if (found.data[0].metadata.billing_customer_provisioning_key !== claim.idempotencyKey || found.data[0].metadata.owner_user_id !== ownerUserId) {
          throw new Error("Stripe customer provisioning token is inconsistent");
        }
        if (!(await recordBillingCustomerProviderResult({ ownerUserId, fence: claim.fence, customerId: found.data[0].id }))) {
          throw new Error("Stripe customer provider result could not be recorded");
        }
        recoveryOutcome = "done";
        recoveredCustomerId = found.data[0].id;
      } else {
        // An empty eventually consistent search is not proof of absence. Only retry
        // the same key while Stripe's documented idempotency window remains open.
        const ageMs = claim.createdAt ? Date.now() - new Date(claim.createdAt).getTime() : Number.POSITIVE_INFINITY;
        if (ageMs >= 23 * 60 * 60 * 1000 || !claim.idempotencyKey || !claim.email) {
          throw new Error("Stripe customer creation requires reconciliation");
        }
      }
    } finally {
      if (!(await finishBillingCustomerProviderCall({ ownerUserId, fence: claim.fence, outcome: recoveryOutcome }))) {
        throw new Error("Stripe customer recovery lease requires reconciliation");
      }
    }
    if (recoveredCustomerId) {
      if (!(await finalizeOwnerCustomerProvisioning({ ownerUserId, fence: claim.fence, customerId: recoveredCustomerId }))) {
        throw new Error("Stripe customer provisioning requires reconciliation");
      }
      await setBusinessCustomer(businessId, recoveredCustomerId);
      return recoveredCustomerId;
    }
    const createdCustomerId = await createOwnerStripeCustomer({ ownerUserId, fence: claim.fence, email: claim.email!, idempotencyKey: claim.idempotencyKey! });
    if (!(await finalizeOwnerCustomerProvisioning({ ownerUserId, fence: claim.fence, customerId: createdCustomerId }))) throw new Error("Stripe customer provisioning requires reconciliation");
    await setBusinessCustomer(businessId, createdCustomerId);
    return createdCustomerId;
  }
  if (claim.kind !== "claimed" || !claim.fence || !claim.idempotencyKey || !claim.email || !claim.createdAt) {
    throw new Error("Stripe customer mapping requires reconciliation");
  }
  const createdCustomerId = await createOwnerStripeCustomer({ ownerUserId, fence: claim.fence, email: claim.email, idempotencyKey: claim.idempotencyKey });
  if (!(await finalizeOwnerCustomerProvisioning({ ownerUserId, fence: claim.fence, customerId: createdCustomerId }))) throw new Error("Stripe customer provisioning requires reconciliation");
  await setBusinessCustomer(businessId, createdCustomerId);
  return createdCustomerId;
}

async function createOwnerStripeCustomer(input: { ownerUserId: string; fence: string; email: string; idempotencyKey: string }): Promise<string> {
  if (!(await beginBillingCustomerProviderCall({ ownerUserId: input.ownerUserId, fence: input.fence }))) {
    throw new Error("Stripe customer creation is blocked by account lifecycle state");
  }
  let outcome: "done" | "uncertain" = "uncertain";
  try {
    const customer = await stripe.customers.create({
      email: input.email,
      metadata: { owner_user_id: input.ownerUserId, billing_customer_provisioning_key: input.idempotencyKey },
    }, { idempotencyKey: input.idempotencyKey, timeout: 20_000, maxNetworkRetries: 0 });
    if (!(await recordBillingCustomerProviderResult({ ownerUserId: input.ownerUserId, fence: input.fence, customerId: customer.id }))) {
      throw new Error("Stripe customer provider result could not be recorded");
    }
    outcome = "done";
    return customer.id;
  } finally {
    if (!(await finishBillingCustomerProviderCall({ ownerUserId: input.ownerUserId, fence: input.fence, outcome }))) {
      throw new Error("Stripe customer provider lease requires reconciliation");
    }
  }
}

export async function POST(request: Request) {
  try {
    const appUrl = getServerAppUrl();
    const session = await auth();
    if (!session?.user?.id) return NextResponse.redirect(new URL("/login", appUrl));
    const values = await readValues(request);
    if (values.agent_id === "speed_to_lead") return NextResponse.json({ error: "speed_to_lead is coming soon" }, { status: 400 });
    const requestedPlan = isCheckoutPlanId(values.plan_id)
      ? values.plan_id
      : values.plan_id == null && (values.agent_id === "review_replies" || values.agent_id === "review_booster")
        ? planForAgent(values.agent_id)
        : null;
    if (!requestedPlan) return NextResponse.json({ error: "A valid plan_id is required" }, { status: 400 });
    const billingPeriod = values.billing_period == null ? "monthly" : values.billing_period;
    if (!isCheckoutBillingPeriod(billingPeriod)) return NextResponse.json({ error: "Invalid billing_period" }, { status: 400 });
    if (values.business_id !== undefined && typeof values.business_id !== "string") return NextResponse.json({ error: "Invalid business_id" }, { status: 400 });

    const context = await requireBusinessOwner(session.user.id, values.business_id as string | undefined);
    const planId = requestedPlan;
    const customerId = await getOwnerCustomer(context.ownerUserId, context.businessId);
    const activeRows = await sql`
      SELECT DISTINCT stripe_subscription_id
      FROM public.business_agents
      WHERE business_id = ${context.businessId}
        AND stripe_subscription_id IS NOT NULL
    `;
    for (const raw of activeRows as Array<{ stripe_subscription_id: string }>) {
      try {
        const prior = await stripe.subscriptions.retrieve(raw.stripe_subscription_id);
        if (!["canceled", "incomplete_expired"].includes(prior.status)) {
          return NextResponse.json({ error: "existing_subscription", recoverable: true }, { status: 409 });
        }
      } catch {
        return recoverable("Existing subscription status requires reconciliation", 409);
      }
    }
    const providerSubscriptions = stripe.subscriptions.list({ customer: customerId, status: "all", limit: 100 });
    for await (const subscription of providerSubscriptions) {
      if (["canceled", "incomplete_expired"].includes(subscription.status)) continue;
      const metadataOwner = subscription.metadata.owner_user_id ?? subscription.metadata.billing_owner_user_id ?? subscription.metadata.user_id;
      if (metadataOwner && metadataOwner !== context.ownerUserId) return recoverable("Stripe subscription ownership requires reconciliation", 409);
      let subscriptionBusinessId = subscription.metadata.business_id;
      if (!subscriptionBusinessId) {
        const linkedRows = await sql`
          SELECT b.id AS business_id, b.owner_user_id
          FROM public.business_agents a
          INNER JOIN public.businesses b ON b.id = a.business_id
          WHERE a.stripe_subscription_id = ${subscription.id}
        `;
        if (linkedRows.length !== 1) return recoverable("Unmapped Stripe subscription requires reconciliation", 409);
        const linked = linkedRows[0] as { business_id: string; owner_user_id: string };
        if (linked.owner_user_id !== context.ownerUserId) return recoverable("Stripe subscription mapping is inconsistent", 409);
        subscriptionBusinessId = linked.business_id;
      } else {
        const ownerRows = await sql`SELECT owner_user_id FROM public.businesses WHERE id = ${subscriptionBusinessId} LIMIT 1`;
        const mappedOwnerId = (ownerRows[0] as { owner_user_id?: string } | undefined)?.owner_user_id;
        if (!mappedOwnerId || mappedOwnerId !== context.ownerUserId) return recoverable("Stripe subscription business mapping is inconsistent", 409);
      }
      if (subscriptionBusinessId === context.businessId) {
        return NextResponse.json({ error: "existing_subscription", recoverable: true }, { status: 409 });
      }
    }
    const eligibility = await getTrialEligibility({ businessId: context.businessId, ownerUserId: context.ownerUserId });
    const trialRequested = eligibility === "eligible" || eligibility === "reserved";
    const priceId = stripePriceId(planId, billingPeriod);
    const token = randomUUID();
    const metadata = {
      user_id: context.ownerUserId,
      owner_user_id: context.ownerUserId,
      billing_owner_user_id: context.ownerUserId,
      business_id: context.businessId,
      plan_id: planId,
      billing_period: billingPeriod,
      billing_intent_token: token,
    };
    const payload: Stripe.Checkout.SessionCreateParams = {
      mode: "subscription",
      payment_method_collection: TRIAL_CHECKOUT_POLICY.paymentMethodCollection,
      customer: customerId,
      client_reference_id: context.ownerUserId,
      line_items: [{ price: priceId, quantity: 1 }],
      currency: "eur",
      subscription_data: {
        metadata,
        ...(trialRequested ? {
          trial_period_days: TRIAL_PERIOD_DAYS,
          trial_settings: { end_behavior: { missing_payment_method: TRIAL_CHECKOUT_POLICY.missingPaymentMethod } },
        } : {}),
      },
      metadata,
      success_url: `${appUrl}/dashboard/billing?success=1`,
      cancel_url: `${appUrl}/dashboard/billing?canceled=1`,
      expires_at: Math.floor(Date.now() / 1000) + 23 * 60 * 60,
      allow_promotion_codes: true,
    };
    const requestHash = JSON.stringify({ businessId: context.businessId, ownerUserId: context.ownerUserId, planId, billingPeriod, customerId });
    let claim = await claimCheckoutIntent({
      businessId: context.businessId,
      ownerUserId: context.ownerUserId,
      planId,
      billingPeriod,
      customerId,
      requestHash,
      stripePayload: payload as unknown as Record<string, unknown>,
      trialRequested,
    });
    if (["busy", "conflict", "blocked"].includes(claim.kind)) {
      return recoverable(claim.kind === "conflict" ? "A different checkout is already pending" : "Checkout is already being processed", claim.kind === "busy" ? 503 : 409);
    }
    if (!claim.intentId || !claim.idempotencyKey || !claim.fence || !claim.stripePayload) return recoverable("Checkout intent is unavailable");
    if (claim.status === "completed") return recoverable("Checkout completed; subscription cancellation must reconcile before another checkout", 409);

    const effectivePayload = claim.stripePayload as unknown as Stripe.Checkout.SessionCreateParams;
    if (claim.kind === "existing") {
      const already = await reconcileExistingSession({
        intentId: claim.intentId, fence: claim.fence, idempotencyKey: claim.idempotencyKey,
        payload: effectivePayload, sessionId: claim.sessionId, url: claim.url, customerId,
      });
      if (already instanceof Response) return already;
      if (already === "expired") {
        claim = await claimCheckoutIntent({
          businessId: context.businessId, ownerUserId: context.ownerUserId, planId, billingPeriod,
          customerId, requestHash, stripePayload: payload as unknown as Record<string, unknown>, trialRequested,
        });
        if (claim.kind !== "claimed") return recoverable("A new checkout intent could not be claimed", claim.kind === "conflict" ? 409 : 503);
        if (!claim.intentId || !claim.idempotencyKey || !claim.fence || !claim.stripePayload) {
          return recoverable("Checkout intent is unavailable");
        }
      } else if (already === "retry") {
        const createdAt = claim.createdAt ? Date.parse(claim.createdAt) : Number.NaN;
        if (!Number.isFinite(createdAt) || Date.now() - createdAt >= 24 * 60 * 60 * 1000) {
          return recoverable("Checkout idempotency window expired; reconciliation is required", 409);
        }
        if (typeof effectivePayload.expires_at === "number" && effectivePayload.expires_at <= Math.floor(Date.now() / 1000)) {
          await markCheckoutIntentUncertain({ intentId: claim.intentId, fence: claim.fence });
          return recoverable("Checkout intent expired without a confirmed Stripe session; reconciliation is required", 409);
        }
        claim = await claimCheckoutIntent({
          businessId: context.businessId, ownerUserId: context.ownerUserId, planId, billingPeriod,
          customerId, requestHash, stripePayload: payload as unknown as Record<string, unknown>, trialRequested,
        });
        if (claim.kind !== "claimed" && claim.kind !== "existing") {
          return recoverable("Checkout is being reconciled", claim.kind === "conflict" ? 409 : 503);
        }
        if (!claim.intentId || !claim.idempotencyKey || !claim.fence || !claim.stripePayload) {
          return recoverable("Checkout intent is unavailable");
        }
      }
    }

    if (!(await beginBillingCheckoutProviderCall({ intentId: claim.intentId, fence: claim.fence }))) {
      return recoverable("Checkout creation is blocked by account lifecycle state", 409);
    }
    let providerOutcome: "done" | "uncertain" = "uncertain";
    try {
      const checkout = await stripe.checkout.sessions.create(
        (claim.stripePayload as unknown as Stripe.Checkout.SessionCreateParams),
        { idempotencyKey: claim.idempotencyKey!, timeout: 20_000, maxNetworkRetries: 0 }
      );
      providerOutcome = "done";
      if (!checkout.url) return recoverable("Stripe checkout URL is unavailable");
      const saved = await finalizeCheckoutIntent({ intentId: claim.intentId!, fence: claim.fence!, sessionId: checkout.id, url: checkout.url });
      if (!saved) return recoverable("Checkout session was created and is being reconciled");
      return NextResponse.redirect(checkout.url, { status: 303 });
    } catch (error) {
      await markCheckoutIntentUncertain({ intentId: claim.intentId!, fence: claim.fence! });
      safeLogger.warn("stripe.checkout.provider_outcome_uncertain", { error: error instanceof Error ? error.message : "unknown" });
      return recoverable("Checkout status is being reconciled");
    } finally {
      if (!(await finishBillingCheckoutProviderCall({ intentId: claim.intentId, fence: claim.fence, outcome: providerOutcome }))) {
        safeLogger.warn("stripe.checkout.provider_lease_finish_failed", { intentId: claim.intentId });
      }
    }
  } catch (error: unknown) {
    if (error instanceof BusinessAccessError) return NextResponse.json({ error: error.message }, { status: error.status });
    safeLogger.error("stripe.checkout.failed", { error: error instanceof Error ? error.message : "unknown" });
    return recoverable("Unable to create checkout session");
  }
}

export const runtime = "nodejs";
