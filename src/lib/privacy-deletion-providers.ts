import type Stripe from "stripe";

import { sql } from "@/lib/db/neon";
import { decryptToken } from "@/lib/encrypted-token";

type DeletionStripe = {
  checkout: { sessions: {
    list: (params: Stripe.Checkout.SessionListParams, options?: Stripe.RequestOptions) => AsyncIterable<Stripe.Checkout.Session>;
    retrieve: (id: string, params?: Stripe.Checkout.SessionRetrieveParams, options?: Stripe.RequestOptions) => Promise<Stripe.Checkout.Session>;
    expire: (id: string, params?: Stripe.Checkout.SessionExpireParams, options?: Stripe.RequestOptions) => Promise<Stripe.Checkout.Session>;
  } };
  subscriptions: {
    list: (params: Stripe.SubscriptionListParams, options?: Stripe.RequestOptions) => AsyncIterable<Stripe.Subscription>;
    retrieve: (id: string, params?: Stripe.SubscriptionRetrieveParams, options?: Stripe.RequestOptions) => Promise<Stripe.Subscription>;
    cancel: (id: string, params?: Stripe.SubscriptionCancelParams, options?: Stripe.RequestOptions) => Promise<Stripe.Subscription>;
  };
  customers: { retrieve: (id: string, params?: Stripe.CustomerRetrieveParams, options?: Stripe.RequestOptions) => Promise<Stripe.Customer | Stripe.DeletedCustomer> };
};

const STRIPE_TIMEOUT = 10_000;
const REVOCATION_TIMEOUT = 10_000;
const MAX_PROVIDER_OBJECTS = 2_000;

function objectId(value: string | { id: string } | null | undefined): string | null {
  if (typeof value === "string") return value;
  return value && typeof value.id === "string" ? value.id : null;
}

function assertOwnerMetadata(value: { metadata?: Stripe.Metadata | null }, ownerUserId: string, businessIds: Set<string>) {
  const metadata = value.metadata ?? {};
  for (const key of ["owner_user_id", "billing_owner_user_id", "user_id"] as const) {
    const owner = metadata[key];
    if (owner && owner !== ownerUserId) throw new Error("provider_owner_mismatch");
  }
  const businessId = metadata.business_id;
  if (businessId && !businessIds.has(businessId)) throw new Error("provider_business_mismatch");
  return businessId ?? null;
}

type IntentRow = {
  id: string;
  business_id: string;
  customer_id: string;
  status: string;
  stripe_session_id: string | null;
  provider_intent_token: string | null;
  provider_create_state: string;
  provider_create_lease_until: string | null;
  provider_create_finished_at: string | null;
  fence: string;
};

/**
 * Drain provider billing for a frozen owner before local mappings can be removed.
 * Unknown checkout intents, customers, or subscriptions stop deletion and remain
 * recoverable for reconciliation.
 */
export async function reconcileOwnerStripeForDeletion(input: {
  stripe: DeletionStripe;
  ownerUserId: string;
  operationId: string;
  assertFence: () => Promise<void>;
  cancelMapped: (ownerUserId: string, operationId: string) => Promise<string[]>;
}): Promise<void> {
  const deadline = Date.now() + 45_000;
  let providerObjects = 0;
  const checkpoint = async (mutating = false) => {
    if (Date.now() >= deadline || providerObjects > MAX_PROVIDER_OBJECTS) throw new Error("billing_reconciliation_budget_exhausted");
    if (mutating) await input.assertFence();
  };
  const [businessRows, mappingRows, intentRows, provisioningRows] = await Promise.all([
    sql`SELECT id FROM public.businesses WHERE owner_user_id=${input.ownerUserId}`,
    sql`
      SELECT stripe_customer_id FROM (
        SELECT stripe_customer_id FROM public.billing_owner_customers WHERE owner_user_id=${input.ownerUserId}
        UNION ALL SELECT stripe_customer_id FROM public.user_billing WHERE user_id=${input.ownerUserId}
        UNION ALL SELECT stripe_customer_id FROM public.businesses WHERE owner_user_id=${input.ownerUserId} AND stripe_customer_id IS NOT NULL
      ) AS mappings WHERE stripe_customer_id IS NOT NULL
    `,
    sql`SELECT id,business_id,customer_id,status,stripe_session_id,provider_intent_token,
               provider_create_state,provider_create_lease_until,provider_create_finished_at,fence
        FROM public.billing_checkout_intents WHERE owner_user_id=${input.ownerUserId}
          AND status IN ('pending','uncertain','completed') ORDER BY created_at,id`,
    sql`SELECT owner_email FROM public.billing_customer_provisioning WHERE owner_user_id=${input.ownerUserId}`,
  ]);
  const businessIds = new Set((businessRows as Array<{ id: string }>).map((row) => row.id));
  const customerIds = new Set((mappingRows as Array<{ stripe_customer_id: string }>).map((row) => row.stripe_customer_id));
  const intents = intentRows as IntentRow[];
  if (intents.some((row) => !businessIds.has(row.business_id))) throw new Error("billing_intent_business_mismatch");
  for (const intent of intents) {
    if (!["idle", "active", "done", "uncertain"].includes(intent.provider_create_state)) {
      throw new Error("billing_checkout_provider_state_unknown");
    }
    if (intent.provider_create_state === "active" && !intent.provider_create_lease_until) {
      throw new Error("billing_checkout_provider_lease_invalid");
    }
    if (intent.provider_create_lease_until && new Date(intent.provider_create_lease_until).getTime() > Date.now()) {
      throw new Error("billing_checkout_provider_call_in_progress");
    }
    if (intent.provider_create_state === "done" && !intent.provider_create_finished_at) {
      throw new Error("billing_checkout_provider_state_invalid");
    }
    if (intent.provider_create_state === "uncertain" && !intent.provider_create_finished_at) {
      throw new Error("billing_checkout_provider_state_invalid");
    }
  }

  if (provisioningRows.length) {
    // Stripe customer search is eventually consistent and cannot prove that
    // an uncommitted customer does not exist. Keep deletion frozen for A03
    // customer-provisioning reconciliation instead of guessing from absence.
    throw new Error("billing_customer_provisioning_unresolved");
  }
  for (const intent of intents) customerIds.add(intent.customer_id);
  const legacyRows = await sql`SELECT id FROM public.subscriptions WHERE user_id=${input.ownerUserId}`;
  const legacyMappedSubscriptionIds = new Set((legacyRows as Array<{ id: string }>).map((row) => row.id));
  const agentRows = await sql`
    SELECT DISTINCT stripe_subscription_id FROM public.business_agents ba
    JOIN public.businesses b ON b.id=ba.business_id
    WHERE b.owner_user_id=${input.ownerUserId} AND ba.stripe_subscription_id IS NOT NULL
  `;
  const hasAgentSubscription = (agentRows as Array<{ stripe_subscription_id: string }>).length > 0;
  if (customerIds.size > 1) throw new Error("billing_customer_mapping_conflict");
  if (!customerIds.size && !intents.length && !legacyMappedSubscriptionIds.size && !hasAgentSubscription) return;

  for (const subscriptionId of legacyMappedSubscriptionIds) {
    await checkpoint();
    const subscription = await input.stripe.subscriptions.retrieve(subscriptionId, {}, {
      timeout: STRIPE_TIMEOUT,
      maxNetworkRetries: 0,
    });
    const businessId = assertOwnerMetadata(subscription, input.ownerUserId, businessIds);
    if (subscription.metadata?.business_id && !businessId) throw new Error("legacy_subscription_business_unresolved");
    const customerId = objectId(subscription.customer);
    if (customerId) customerIds.add(customerId);
    else if (subscription.status !== "canceled" && subscription.status !== "incomplete_expired") {
      throw new Error("legacy_subscription_customer_unresolved");
    }
  }
  if (customerIds.size > 1) throw new Error("billing_customer_mapping_conflict");
  const sessionsByCustomer = new Map<string, Stripe.Checkout.Session[]>();
  const mappedSubscriptions = new Set(legacyMappedSubscriptionIds);
  for (const customerId of customerIds) {
    const customer = await input.stripe.customers.retrieve(customerId, {}, { timeout: STRIPE_TIMEOUT, maxNetworkRetries: 0 });
    if (customer.deleted) {
      throw new Error("billing_customer_mapping_unresolved");
    }
    assertOwnerMetadata(customer, input.ownerUserId, businessIds);
    const sessions: Stripe.Checkout.Session[] = [];
    for await (const session of input.stripe.checkout.sessions.list(
      { customer: customerId, limit: 100 }, { timeout: STRIPE_TIMEOUT, maxNetworkRetries: 0 },
    )) {
      providerObjects += 1;
      await checkpoint();
      if (objectId(session.customer) !== customerId) throw new Error("checkout_customer_mismatch");
      assertOwnerMetadata(session, input.ownerUserId, businessIds);
      sessions.push(session);
    }
    sessionsByCustomer.set(customerId, sessions);
  }

  for (const intent of intents) {
    if (!intent.provider_intent_token) throw new Error("billing_intent_token_missing");
    const sessions = sessionsByCustomer.get(intent.customer_id) ?? [];
    let matches = sessions.filter((session) => session.metadata?.billing_intent_token === intent.provider_intent_token);
    if (intent.stripe_session_id && !matches.some((session) => session.id === intent.stripe_session_id)) {
      await checkpoint();
      const fetched = await input.stripe.checkout.sessions.retrieve(
        intent.stripe_session_id, {}, { timeout: STRIPE_TIMEOUT, maxNetworkRetries: 0 },
      );
      if (objectId(fetched.customer) !== intent.customer_id || fetched.metadata?.billing_intent_token !== intent.provider_intent_token) {
        throw new Error("billing_intent_session_mismatch");
      }
      assertOwnerMetadata(fetched, input.ownerUserId, businessIds);
      matches = [...matches, fetched];
      sessions.push(fetched);
    }
    const unique = [...new Map(matches.map((session) => [session.id, session])).values()];
    if (unique.length !== 1) throw new Error("billing_intent_session_unresolved");
  }

  for (const sessions of sessionsByCustomer.values()) {
    for (const session of sessions) {
      await checkpoint(session.status === "open");
      if (session.status === "open") {
        const expired = await input.stripe.checkout.sessions.expire(session.id, {}, { timeout: STRIPE_TIMEOUT, maxNetworkRetries: 0 });
        await checkpoint(true);
        const confirmed = expired.status === "expired" ? expired : await input.stripe.checkout.sessions.retrieve(
          session.id, {}, { timeout: STRIPE_TIMEOUT, maxNetworkRetries: 0 },
        );
        if (confirmed.status !== "expired") throw new Error("checkout_expiration_unconfirmed");
        const index = sessions.indexOf(session);
        if (index >= 0) sessions[index] = confirmed;
      } else if (session.status === "complete" && session.mode === "subscription" && !objectId(session.subscription)) {
        throw new Error("completed_checkout_subscription_unresolved");
      }
    }
  }

  // Expire all open sessions before canceling any mapped subscription. A
  // missing/ambiguous unresolved intent above prevents deletion and is retried.
  await checkpoint(true);
  const canceledAgentSubscriptions = await input.cancelMapped(input.ownerUserId, input.operationId);
  canceledAgentSubscriptions.forEach((id) => mappedSubscriptions.add(id));
  await checkpoint(true);
  for (const subscriptionId of legacyMappedSubscriptionIds) {
    const current = await input.stripe.subscriptions.retrieve(subscriptionId, {}, {
      timeout: STRIPE_TIMEOUT,
      maxNetworkRetries: 0,
    });
    if (current.status === "canceled" || current.status === "incomplete_expired") continue;
    await checkpoint(true);
    const canceled = await input.stripe.subscriptions.cancel(subscriptionId, {}, {
      timeout: STRIPE_TIMEOUT,
      maxNetworkRetries: 0,
    });
    await checkpoint(true);
    if (canceled.status !== "canceled") throw new Error("legacy_subscription_cancellation_unconfirmed");
  }
  for (const customerId of customerIds) {
    for await (const subscription of input.stripe.subscriptions.list(
      { customer: customerId, status: "all", limit: 100 }, { timeout: STRIPE_TIMEOUT, maxNetworkRetries: 0 },
    )) {
      providerObjects += 1;
      await checkpoint();
      if (objectId(subscription.customer) !== customerId) throw new Error("stripe_subscription_customer_mismatch");
      if (subscription.status === "canceled" || subscription.status === "incomplete_expired") continue;
      const metadataBusinessId = assertOwnerMetadata(subscription, input.ownerUserId, businessIds);
      const isLocallyMapped = mappedSubscriptions.has(subscription.id);
      if (!isLocallyMapped && (!metadataBusinessId || subscription.metadata?.owner_user_id !== input.ownerUserId)) {
        throw new Error("stripe_subscription_unmapped");
      }
      await checkpoint(true);
      const canceled = await input.stripe.subscriptions.cancel(subscription.id, {}, { timeout: STRIPE_TIMEOUT, maxNetworkRetries: 0 });
      await checkpoint(true);
      const confirmed = canceled.status === "canceled" ? canceled : await input.stripe.subscriptions.retrieve(
        subscription.id, {}, { timeout: STRIPE_TIMEOUT, maxNetworkRetries: 0 },
      );
      if (confirmed.status !== "canceled") throw new Error("stripe_subscription_cancellation_unconfirmed");
    }
  }

  // All pre-freeze create leases are either live (blocked above) or expired.
  // Every unresolved durable intent must map to one provider session; final SQL
  // rechecks that its row did not change after this reconciliation timestamp.
  for (const customerId of customerIds) {
    for await (const session of input.stripe.checkout.sessions.list(
      { customer: customerId, limit: 100 }, { timeout: STRIPE_TIMEOUT, maxNetworkRetries: 0 },
    )) {
      providerObjects += 1;
      await checkpoint();
      assertOwnerMetadata(session, input.ownerUserId, businessIds);
      if (session.status === "open") throw new Error("checkout_session_still_open");
      if (session.status === "complete" && session.mode === "subscription" && !objectId(session.subscription)) {
        throw new Error("completed_checkout_subscription_unresolved");
      }
    }
    for await (const subscription of input.stripe.subscriptions.list(
      { customer: customerId, status: "all", limit: 100 }, { timeout: STRIPE_TIMEOUT, maxNetworkRetries: 0 },
    )) {
      providerObjects += 1;
      await checkpoint();
      if (objectId(subscription.customer) !== customerId) throw new Error("stripe_subscription_customer_mismatch");
      if (subscription.status !== "canceled" && subscription.status !== "incomplete_expired") {
        throw new Error("stripe_subscription_still_billable");
      }
    }
  }

  for (const intent of intents) {
    const session = (sessionsByCustomer.get(intent.customer_id) ?? [])
      .find((item) => item.metadata?.billing_intent_token === intent.provider_intent_token);
    if (!session || (session.status !== "complete" && session.status !== "expired")) {
      throw new Error("billing_intent_session_unresolved");
    }
    const finalStatus = session.status === "complete" ? "completed" : "expired";
    await checkpoint(true);
    if (intent.status === "pending" || intent.status === "uncertain") {
      const finished = await sql`SELECT public.finish_billing_checkout_intent(
        ${intent.id}::uuid,${intent.fence}::uuid,${session.id},NULL,${finalStatus}
      ) AS changed`;
      if ((finished[0] as { changed?: boolean } | undefined)?.changed !== true) {
        throw new Error("billing_checkout_intent_changed");
      }
    }
    const marked = await sql`UPDATE public.billing_checkout_intents
      SET provider_create_state='done',provider_create_lease_until=NULL,
          provider_create_finished_at=COALESCE(provider_create_finished_at,now()),updated_at=now()
      WHERE id=${intent.id}::uuid AND owner_user_id=${input.ownerUserId}
        AND fence=${intent.fence}::uuid AND provider_create_state IN ('idle','active','done','uncertain')
      RETURNING id`;
    if (!marked.length) throw new Error("billing_checkout_provider_state_changed");
  }
}

export async function revokeActorGoogleGrant(userId: string, fetcher: typeof fetch = fetch): Promise<void> {
  const rows = await sql`SELECT refresh_token FROM public.gbp_connections WHERE user_id=${userId}`;
  if (!rows.length) return;
  const encrypted = (rows[0] as { refresh_token?: unknown }).refresh_token;
  if (typeof encrypted !== "string" || !encrypted) throw new Error("google_refresh_token_missing");
  const token = decryptToken(encrypted).value;
  if (!token) throw new Error("google_refresh_token_invalid");
  const response = await fetcher("https://oauth2.googleapis.com/revoke", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token }),
    signal: AbortSignal.timeout(REVOCATION_TIMEOUT),
  });
  if (response.status !== 200) throw new Error("google_revocation_unconfirmed");
}
