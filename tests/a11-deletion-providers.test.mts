import assert from "node:assert/strict";
import test from "node:test";
import { loadTs } from "./auth-test-harness.mts";

type FakeSession = {
  id: string;
  customer: string;
  status: "open" | "complete" | "expired";
  mode: "subscription";
  subscription: string | null;
  metadata: Record<string, string>;
};
type FakeSubscription = {
  id: string;
  customer: string;
  status: string;
  metadata: Record<string, string>;
};

const owner = "00000000-0000-4000-8000-000000000011";
const business = "00000000-0000-4000-8000-000000000021";

function makeProvider(rows: {
  businesses?: unknown[];
  mappings?: unknown[];
  intents?: unknown[];
  provisioning?: unknown[];
  legacySubscriptions?: unknown[];
  agentSubscriptions?: unknown[];
}, state: { sessions?: FakeSession[]; subscriptions?: FakeSubscription[]; canceled?: string[]; expired?: string[] }, mappedOwner = owner, customerMetadata?: Record<string, string>) {
  const reads: string[] = [];
  const deletedCustomers = new Set<string>();
  const sql = async (strings: TemplateStringsArray) => {
    const query = strings.join(" ");
    reads.push(query);
    if (query.includes("FROM public.billing_owner_customers")) return rows.mappings ?? [{ stripe_customer_id: "cus-owner" }];
    if (query.includes("FROM public.businesses WHERE owner_user_id")) return rows.businesses ?? [{ id: business }];
    if (query.includes("FROM public.billing_checkout_intents")) return rows.intents ?? [];
    if (query.includes("FROM public.billing_customer_provisioning")) return rows.provisioning ?? [];
    if (query.includes("FROM public.subscriptions WHERE user_id")) return rows.legacySubscriptions ?? [];
    if (query.includes("FROM public.business_agents ba")) return rows.agentSubscriptions ?? [];
    if (query.includes("finish_billing_checkout_intent")) return [{ changed: true }];
    if (query.includes("UPDATE public.billing_checkout_intents")) return [{ id: "intent" }];
    if (query.includes("INSERT INTO public.privacy_stripe_customer_erasure_evidence")) return [{ operation_id: "op" }];
    if (query.includes("UPDATE public.privacy_stripe_customer_erasure_evidence")) return [{ operation_id: "op" }];
    throw new Error(`Unexpected SQL: ${query}`);
  };
  const asyncValues = <T,>(items: T[]): AsyncIterable<T> => ({
    async *[Symbol.asyncIterator]() { for (const item of items) yield item; },
  });
  const stripe = {
    customers: {
      retrieve: async (id: string) => deletedCustomers.has(id)
        ? ({ id, deleted: true } as const)
        : ({ id, deleted: false, metadata: customerMetadata ?? { owner_user_id: mappedOwner } }),
      del: async (id: string) => { deletedCustomers.add(id); return { id, deleted: true as const }; },
    },
    checkout: { sessions: {
      list: () => asyncValues(state.sessions ?? []),
      retrieve: async (id: string) => {
        const found = (state.sessions ?? []).find((session) => session.id === id);
        if (!found) throw new Error("missing session");
        return { ...found, metadata: { ...found.metadata } };
      },
      expire: async (id: string) => {
        state.expired?.push(id);
        const sessions = state.sessions ?? [];
        const index = sessions.findIndex((item) => item.id === id);
        if (index < 0) throw new Error("missing session");
        const expired = { ...sessions[index]!, status: "expired" as const };
        sessions[index] = expired;
        return { ...expired, metadata: { ...expired.metadata } };
      },
    } },
    subscriptions: {
      list: () => asyncValues(state.subscriptions ?? []),
      retrieve: async (id: string) => (state.subscriptions ?? []).find((item) => item.id === id)!,
      cancel: async (id: string) => {
        state.canceled?.push(id);
        const subscription = (state.subscriptions ?? []).find((item) => item.id === id)!;
        subscription.status = "canceled";
        return subscription;
      },
    },
  };
  const loaded = loadTs<{ reconcileOwnerStripeForDeletion(input: {
    stripe: never;
    ownerUserId: string;
    operationId: string;
    assertFence: () => Promise<void>;
    cancelMapped: () => Promise<string[]>;
  }): Promise<void> }>("src/lib/privacy-deletion-providers.ts", {
    overrides: {
      "@/lib/db/neon": { sql },
      "@/lib/encrypted-token": { decryptToken: (value: string) => ({ value, legacy: false }) },
    },
  });
  return { loaded, stripe, reads };
}

test("A11 Stripe drain cancels confirmed owner orphan subscriptions and expires open sessions", async () => {
  const state = {
    sessions: [{ id: "cs-open", customer: "cus-owner", status: "open", mode: "subscription", subscription: null, metadata: {} }] as FakeSession[],
    subscriptions: [{ id: "sub-orphan", customer: "cus-owner", status: "active", metadata: { owner_user_id: owner, business_id: business } }] as FakeSubscription[],
    canceled: [] as string[], expired: [] as string[],
  };
  const { loaded, stripe } = makeProvider({}, state);
  let fenceChecks = 0;
  await loaded.reconcileOwnerStripeForDeletion({
    stripe: stripe as never,
    ownerUserId: owner,
    operationId: "operation-1",
    assertFence: async () => { fenceChecks += 1; },
    cancelMapped: async () => [],
  });
  assert.deepEqual(state.expired, ["cs-open"]);
  assert.deepEqual(state.canceled, ["sub-orphan"]);
  assert.ok(fenceChecks >= 4, "the deletion fence is renewed around each provider mutation");
});

test("A11 Stripe drain refuses an unmapped provider subscription without owner proof", async () => {
  const state = {
    sessions: [] as FakeSession[],
    subscriptions: [{ id: "sub-unknown", customer: "cus-owner", status: "active", metadata: {} }] as FakeSubscription[],
    canceled: [] as string[], expired: [] as string[],
  };
  const { loaded, stripe } = makeProvider({}, state);
  await assert.rejects(loaded.reconcileOwnerStripeForDeletion({
    stripe: stripe as never,
    ownerUserId: owner,
    operationId: "operation-2",
    assertFence: async () => undefined,
    cancelMapped: async () => [],
  }), /stripe_subscription_unmapped/);
  assert.deepEqual(state.canceled, [], "unknown subscription state remains untouched pending reconciliation");
});

test("A11 Stripe rejects conflicting owner aliases on retrieved customers", async () => {
  const { loaded, stripe } = makeProvider({}, { sessions: [], subscriptions: [] }, owner, {
    owner_user_id: owner,
    billing_owner_user_id: "00000000-0000-4000-8000-000000000099",
  });
  await assert.rejects(loaded.reconcileOwnerStripeForDeletion({
    stripe: stripe as never,
    ownerUserId: owner,
    operationId: "operation-metadata-conflict",
    assertFence: async () => undefined,
    cancelMapped: async () => [],
  }), /provider_owner_mismatch/);
});

test("A11 deletion blocks an unresolved intent before any mapped cancellation", async () => {
  const state = { sessions: [] as FakeSession[], subscriptions: [] as FakeSubscription[], canceled: [] as string[], expired: [] as string[] };
  const { loaded, stripe } = makeProvider({
    intents: [{
      id: "00000000-0000-4000-8000-000000000031",
      business_id: business,
      customer_id: "cus-owner",
      status: "uncertain",
      stripe_session_id: null,
      provider_intent_token: "immutable-token",
      provider_create_state: "uncertain",
      provider_create_lease_until: null,
      provider_create_finished_at: "2026-10-03T00:00:00.000Z",
      fence: "00000000-0000-4000-8000-000000000041",
    }],
  }, state);
  let mappedCancellationCalled = false;
  await assert.rejects(loaded.reconcileOwnerStripeForDeletion({
    stripe: stripe as never,
    ownerUserId: owner,
    operationId: "operation-3",
    assertFence: async () => undefined,
    cancelMapped: async () => { mappedCancellationCalled = true; return []; },
  }), /billing_intent_session_unresolved/);
  assert.equal(mappedCancellationCalled, false);
  assert.deepEqual(state.canceled, []);
});

test("A11 legacy personal subscription mapping is reconciled without touching a teammate customer", async () => {
  const member = "00000000-0000-4000-8000-000000000012";
  const state = {
    sessions: [] as FakeSession[],
    subscriptions: [{ id: "sub-personal", customer: "cus-personal", status: "active", metadata: {} }] as FakeSubscription[],
    canceled: [] as string[], expired: [] as string[],
  };
  const { loaded, stripe } = makeProvider({
    businesses: [],
    mappings: [{ stripe_customer_id: "cus-personal" }],
    legacySubscriptions: [{ id: "sub-personal" }],
  }, state, member);
  await loaded.reconcileOwnerStripeForDeletion({
    stripe: stripe as never,
    ownerUserId: member,
    operationId: "operation-4",
    assertFence: async () => undefined,
    cancelMapped: async () => [],
  });
  assert.deepEqual(state.canceled, ["sub-personal"]);
});

test("A11 exhausts provider pagination and stores fresh expiration responses", async () => {
  const sessions = Array.from({ length: 120 }, (_, index) => ({
    id: `cs-page-${index}`,
    customer: "cus-owner",
    status: "open" as const,
    mode: "subscription" as const,
    subscription: null,
    metadata: {},
  }));
  const subscriptions = Array.from({ length: 120 }, (_, index) => ({
    id: `sub-page-${index}`,
    customer: "cus-owner",
    status: "trialing",
    metadata: { owner_user_id: owner, business_id: business },
  }));
  const state = { sessions, subscriptions, canceled: [] as string[], expired: [] as string[] };
  const { loaded, stripe } = makeProvider({}, state);
  await loaded.reconcileOwnerStripeForDeletion({
    stripe: stripe as never,
    ownerUserId: owner,
    operationId: "operation-pages",
    assertFence: async () => undefined,
    cancelMapped: async () => [],
  });
  assert.equal(state.expired.length, 120);
  assert.equal(state.canceled.length, 120);
  assert.ok(state.sessions.every((session) => String(session.status) === "expired"));
  assert.ok(state.subscriptions.every((subscription) => subscription.status === "canceled"));
});

test("A11 resolves a durable session id even when exhaustive list omitted it", async () => {
  const state = { sessions: [] as FakeSession[], subscriptions: [] as FakeSubscription[], canceled: [] as string[], expired: [] as string[] };
  const { loaded, stripe } = makeProvider({
    intents: [{
      id: "00000000-0000-4000-8000-000000000031",
      business_id: business,
      customer_id: "cus-owner",
      status: "uncertain",
      stripe_session_id: "cs-persisted",
      provider_intent_token: "immutable-token",
      provider_create_state: "uncertain",
      provider_create_lease_until: null,
      provider_create_finished_at: "2026-10-03T00:00:00.000Z",
      fence: "00000000-0000-4000-8000-000000000041",
    }],
  }, state);
  const customer = stripe.checkout.sessions.retrieve;
  stripe.checkout.sessions.retrieve = async () => {
    const session: FakeSession = {
      id: "cs-persisted", customer: "cus-owner", status: "open", mode: "subscription", subscription: null,
      metadata: { billing_intent_token: "immutable-token" },
    };
    state.sessions.push(session);
    return session;
  };
  await loaded.reconcileOwnerStripeForDeletion({
    stripe: stripe as never,
    ownerUserId: owner,
    operationId: "operation-persisted",
    assertFence: async () => undefined,
    cancelMapped: async () => [],
  });
  assert.deepEqual(state.expired, ["cs-persisted"]);
  stripe.checkout.sessions.retrieve = customer;
});

test("A11 recovers a lost Stripe customer-delete response from its tombstone after terminal intents", async () => {
  const operation = "00000000-0000-4000-8000-000000000032";
  const intents = ["completed", "expired"].map((status, index) => ({
    id: `00000000-0000-4000-8000-00000000004${index}`,
    business_id: business, customer_id: "cus-owner", status,
    stripe_session_id: `cs-${status}`, provider_intent_token: `intent-${status}`,
    provider_create_state: "done", provider_create_lease_until: null,
    provider_create_finished_at: new Date().toISOString(), fence: "00000000-0000-4000-8000-000000000099",
  }));
  let evidenceStatus = "started";
  const loaded = loadTs<{ reconcileOwnerStripeForDeletion(input: {
    stripe: never; ownerUserId: string; operationId: string; assertFence: () => Promise<void>; cancelMapped: () => Promise<string[]>;
  }): Promise<void> }>("src/lib/privacy-deletion-providers.ts", { overrides: {
    "@/lib/db/neon": { sql: async (strings: TemplateStringsArray) => {
      const query = strings.join(" ");
      if (query.includes("FROM public.billing_owner_customers")) return [{ stripe_customer_id: "cus-owner" }];
      if (query.includes("FROM public.businesses WHERE owner_user_id")) return [{ id: business }];
      if (query.includes("FROM public.billing_checkout_intents")) return intents;
      if (query.includes("FROM public.billing_customer_provisioning")) return [];
      if (query.includes("FROM public.subscriptions WHERE user_id")) return [];
      if (query.includes("FROM public.business_agents ba")) return [];
      if (query.includes("SELECT status FROM public.privacy_stripe_customer_erasure_evidence")) return [{ status: evidenceStatus }];
      if (query.includes("UPDATE public.privacy_stripe_customer_erasure_evidence")) { evidenceStatus = "complete"; return []; }
      if (query.includes("DELETE FROM public.billing_customer_provisioning")) return [];
      throw new Error(`Unexpected SQL: ${query}`);
    } },
    "@/lib/encrypted-token": { decryptToken: (value: string) => ({ value, legacy: false }) },
  } });
  const stripe = {
    customers: { retrieve: async (id: string) => ({ id, deleted: true }) },
    checkout: { sessions: { list: () => { throw new Error("deleted customer must not be enumerated after durable drain evidence"); } } },
    subscriptions: { list: () => { throw new Error("deleted customer subscriptions must not be re-enumerated"); } },
  } as never;
  await loaded.reconcileOwnerStripeForDeletion({
    stripe, ownerUserId: owner, operationId: operation, assertFence: async () => undefined, cancelMapped: async () => [],
  });
  assert.equal(evidenceStatus, "complete");
});

test("A11 refuses a deleted Stripe tombstone returned for a different customer ID", async () => {
  const state = { sessions: [] as FakeSession[], subscriptions: [] as FakeSubscription[] };
  const { loaded, stripe } = makeProvider({}, state);
  stripe.customers.retrieve = async () => ({ id: "cus-someone-else", deleted: true });
  await assert.rejects(loaded.reconcileOwnerStripeForDeletion({
    stripe: stripe as never, ownerUserId: owner, operationId: "00000000-0000-4000-8000-000000000036",
    assertFence: async () => undefined, cancelMapped: async () => [],
  }), /billing_customer_identity_mismatch/);
});

test("A11 confirms Google's actor-owned grant revocation and fails closed on provider 400", async () => {
  const actor = "00000000-0000-4000-8000-000000000012";
  let sqlActor = "";
  let evidenceWritten = false;
  const operation = "00000000-0000-4000-8000-000000000032";
  const loaded = loadTs<{ revokeActorGoogleGrant(userId: string, operationId: string, fetcher?: typeof fetch): Promise<void> }>(
    "src/lib/privacy-deletion-providers.ts",
    {
      overrides: {
        "@/lib/db/neon": { sql: async (strings: TemplateStringsArray, ...values: unknown[]) => {
          const query = strings.join(" ");
          if (query.includes("FROM public.gbp_connections")) {
            sqlActor = String(values[0]);
            return [{ refresh_token: "stored-token", connection_version: "00000000-0000-4000-8000-000000000099" }];
          }
          if (query.includes("SELECT connection_version,encrypted_refresh_token FROM public.privacy_google_revocation_evidence")) {
            return evidenceWritten ? [{ connection_version: "00000000-0000-4000-8000-000000000099", encrypted_refresh_token: "stored-token" }] : [];
          }
          if (query.includes("SELECT operation_id FROM public.privacy_google_revocation_evidence")) return [];
          if (query.includes("INSERT INTO public.privacy_google_revocation_evidence")) { evidenceWritten = true; return [{ operation_id: operation }]; }
          if (query.includes("DELETE FROM public.gbp_connections")) return [{ user_id: actor }];
          throw new Error(`Unexpected SQL: ${query}`);
        } },
        "@/lib/encrypted-token": { decryptToken: (value: string) => ({ value: `plain:${value}`, legacy: false }) },
      },
    },
  );
  let requestUrl = "";
  let requestBody = "";
  await loaded.revokeActorGoogleGrant(actor, operation, async (input, init) => {
    requestUrl = String(input);
    requestBody = String(init?.body);
    assert.ok(init?.signal);
    return new Response(null, { status: 200 });
  });
  assert.equal(sqlActor, actor);
  assert.equal(requestUrl, "https://oauth2.googleapis.com/revoke");
  assert.equal(new URLSearchParams(requestBody).get("token"), "plain:stored-token");
  evidenceWritten = false;
  await assert.rejects(loaded.revokeActorGoogleGrant(actor, "00000000-0000-4000-8000-000000000033", async () => new Response(null, { status: 400 })), /google_revocation_unconfirmed/);
  evidenceWritten = false;
  await assert.rejects(loaded.revokeActorGoogleGrant(actor, "00000000-0000-4000-8000-000000000034", async () => new Response(null, { status: 204 })), /google_revocation_unconfirmed/);
});

test("A11 reuses an acknowledged Google revoke only for the exact stored generation and token", async () => {
  const actor = "00000000-0000-4000-8000-000000000012";
  const version = "00000000-0000-4000-8000-000000000099";
  let evidenceWritten = false;
  const loaded = loadTs<{ revokeActorGoogleGrant(userId: string, operationId: string, fetcher?: typeof fetch): Promise<void> }>(
    "src/lib/privacy-deletion-providers.ts",
    { overrides: {
      "@/lib/db/neon": { sql: async (strings: TemplateStringsArray) => {
        const query = strings.join(" ");
        if (query.includes("FROM public.gbp_connections")) return [{ refresh_token: "stored-token", connection_version: version }];
        if (query.includes("SELECT connection_version,encrypted_refresh_token FROM public.privacy_google_revocation_evidence")) return evidenceWritten ? [{ connection_version: version, encrypted_refresh_token: "stored-token" }] : [];
        if (query.includes("SELECT operation_id FROM public.privacy_google_revocation_evidence")) return [{ operation_id: "prior-ack" }];
        if (query.includes("INSERT INTO public.privacy_google_revocation_evidence")) { evidenceWritten = true; return [{ operation_id: "op" }]; }
        if (query.includes("DELETE FROM public.gbp_connections")) return [{ user_id: actor }];
        throw new Error(`Unexpected SQL: ${query}`);
      } },
      "@/lib/encrypted-token": { decryptToken: (value: string) => ({ value: `plain:${value}`, legacy: false }) },
    } },
  );
  let providerCalls = 0;
  await loaded.revokeActorGoogleGrant(actor, "00000000-0000-4000-8000-000000000035", async () => {
    providerCalls++;
    return new Response(null, { status: 400 });
  });
  assert.equal(providerCalls, 0);
});
