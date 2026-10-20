import assert from "node:assert/strict";
import test from "node:test";
import { loadTs } from "./auth-test-harness.mts";
import { isPrivatePreviewMode } from "../src/lib/private-preview.ts";

const BRANCH = "codex/ornigami-staging-readiness-20261018";
const privateEnv = {
  VERCEL_ENV: "preview",
  ORNIGAMI_PRIVATE_STAGING_MODE: "true",
  VERCEL_GIT_COMMIT_REF: BRANCH,
  STRIPE_SECRET_KEY: "synthetic-stripe-key",
  STRIPE_WEBHOOK_SECRET: "synthetic-webhook-secret",
  NEXT_PUBLIC_SENTRY_DSN: "https://synthetic@example.test/42",
  PRIVACY_ACCOUNT_DELETION_ENABLED: "true",
};
const coolifyPrivateEnv = { NODE_ENV: "production", ORNIGAMI_PRIVATE_STAGING_PLATFORM: "coolify", ORNIGAMI_PRIVATE_STAGING_MODE: "true", NEXT_PUBLIC_APP_URL: "https://staging.ornigami.com", AUTH_URL: "https://staging.ornigami.com", STRIPE_SECRET_KEY: "synthetic-stripe-key", STRIPE_WEBHOOK_SECRET: "synthetic-webhook-secret", PRIVACY_ACCOUNT_DELETION_ENABLED: "true" };
const disabledBody = { error: "This operation is unavailable in private Preview." };
const ordinaryEnvs = [
  { VERCEL_ENV: "preview", ORNIGAMI_PRIVATE_STAGING_MODE: undefined, VERCEL_GIT_COMMIT_REF: BRANCH },
  { VERCEL_ENV: "preview", ORNIGAMI_PRIVATE_STAGING_MODE: "true", VERCEL_GIT_COMMIT_REF: "other-branch" },
  { VERCEL_ENV: "production", ORNIGAMI_PRIVATE_STAGING_MODE: "true", VERCEL_GIT_COMMIT_REF: BRANCH, NEXT_PUBLIC_APP_URL: "https://ornigami.com" },
];

type PaymentKind = "checkout" | "portal" | "change-plan" | "webhook" | "account-deletion";
type PaymentOptions = { session?: { user?: { id?: string } | null; deletionUserId?: string } | null; ownerDenied?: boolean; sqlFails?: boolean; beginDeletionResult?: string; frozenDeletion?: string | null };

function paymentRoute(kind: PaymentKind, env: Record<string, string | undefined>, options: PaymentOptions = {}) {
  const counts = { auth: 0, ownerAuthorization: 0, sql: 0, stripeApiAccess: 0, webhookVerification: 0, reconciliation: 0, deletionMutation: 0, frozenRead: 0 };
  class BusinessAccessError extends Error { status = 403; }
  const stripe = new Proxy({}, { get: () => { counts.stripeApiAccess += 1; throw new Error("Stripe API client access is prohibited in this fixture"); } });
  const sql = async () => { counts.sql += 1; if (options.sqlFails !== false) throw new Error("synthetic SQL boundary"); return []; };
  const persistence = new Proxy({}, { get: () => async () => { counts.sql += 1; return {}; } });
  const stripeSdk = class StripeMock {
    static webhooks = { constructEvent: () => { counts.webhookVerification += 1; return { id: "evt_synthetic", type: "customer.updated", data: { object: {} } }; } };
  };
  const imports: Record<string, unknown> = {
    "next/server": { NextResponse: {
      json: (body: unknown, init?: ResponseInit) => Response.json(body, init),
      redirect: (url: URL, status?: number) => Response.redirect(url, status),
    } },
    "@/auth": { auth: async () => { counts.auth += 1; return options.session === undefined ? { user: { id: "11111111-1111-4111-8111-111111111111" } } : options.session; }, signOut: async () => undefined },
    "@/lib/business-context": {
      BusinessAccessError,
      requireBusinessOwner: async () => {
        counts.ownerAuthorization += 1;
        if (options.ownerDenied) throw new BusinessAccessError("Business access denied");
        return { businessId: "synthetic-business", ownerUserId: "11111111-1111-4111-8111-111111111111" };
      },
    },
    "@/lib/db/neon": { sql },
    "@/lib/env": { getServerAppUrl: () => "https://app.example.test", getRequiredEnv: () => "synthetic-webhook-secret" },
    "@/lib/stripe": { stripe },
    "@/lib/billing/plans": { planForAgent: () => "review_replies", stripePriceId: () => "price_synthetic", TRIAL_PERIOD_DAYS: 7 },
    "@/lib/billing/checkout-policy": { TRIAL_CHECKOUT_POLICY: { paymentMethodCollection: "always" }, isCheckoutBillingPeriod: () => true, isCheckoutPlanId: () => true },
    "@/lib/billing/persistence": persistence,
    "@/lib/safe-logger": { safeLogger: { error() {}, warn() {} } },
    "stripe": stripeSdk,
    "@/lib/billing/reconciliation": { reconcileStripeEvent: async () => { counts.reconciliation += 1; return "duplicate"; } },
    "@/lib/privacy-account-deletion": new Proxy({}, { get: (_target, key) => async () => {
      if (key === "getFrozenDeletionOperation") { counts.frozenRead += 1; return options.frozenDeletion === undefined ? "synthetic-frozen-operation" : options.frozenDeletion; }
      if (key === "beginAccountDeletion") { counts.deletionMutation += 1; return { result: options.beginDeletionResult ?? "not_found", operationId: null }; }
      return {};
    } }),
    "@/lib/privacy-deletion-providers": { reconcileOwnerStripeForDeletion: async () => { counts.stripeApiAccess += 1; }, revokeActorGoogleGrant: async () => undefined },
    "@/lib/team-lifecycle": { isSameOriginMutation: () => true },
  };
  const path = kind === "account-deletion" ? "src/app/api/privacy/delete/route.ts" : `src/app/api/stripe/${kind}/route.ts`;
  const route = loadTs(path, { env, overrides: imports }) as Record<string, (request: Request) => Promise<Response>>;
  const request = kind === "checkout"
    ? new Request("https://app.example.test/api/stripe/checkout", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ plan_id: "review_replies", billing_period: "monthly", business_id: "synthetic-business" }) })
    : kind === "portal"
      ? new Request("https://app.example.test/api/stripe/portal?business_id=synthetic-business", { method: "POST" })
      : kind === "change-plan"
        ? new Request("https://app.example.test/api/stripe/change-plan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ plan_id: "review_replies", billing_period: "monthly", business_id: "synthetic-business" }) })
        : kind === "webhook"
          ? new Request("https://app.example.test/api/stripe/webhook", { method: "POST", headers: { "stripe-signature": "synthetic-signature" }, body: "synthetic-payload" })
          : new Request("https://app.example.test/api/privacy/delete", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ confirmation: "DELETE MY DATA" }) });
  return { route, request, counts };
}

async function assertDisabled(response: Response) {
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), disabledBody);
  assert.equal(response.headers.get("cache-control"), "no-store, max-age=0");
}

test("private Preview blocks every payment entry point after its authorization boundary and before prohibited work", async () => {
  for (const env of [privateEnv, coolifyPrivateEnv]) for (const kind of ["checkout", "portal", "change-plan", "webhook", "account-deletion"] as const) {
    const harness = paymentRoute(kind, env);
    await assertDisabled(await harness.route.POST(harness.request));
    if (kind === "webhook") {
      assert.equal(harness.counts.webhookVerification, 1, "signature is verified locally before rejection");
      assert.equal(harness.counts.reconciliation, 0);
    } else {
      assert.equal(harness.counts.auth, 1);
      if (kind !== "account-deletion") assert.equal(harness.counts.ownerAuthorization, 1);
    }
    assert.equal(harness.counts.sql, 0);
    assert.equal(harness.counts.stripeApiAccess, 0);
    assert.equal(harness.counts.deletionMutation, 0);
  }
});

test("private Preview payment routes retain unauthenticated, business-owner and webhook-signature rejection", async () => {
  for (const kind of ["checkout", "portal", "change-plan", "account-deletion"] as const) {
    const harness = paymentRoute(kind, privateEnv, { session: null });
    const response = await harness.route.POST(harness.request);
    assert.ok([401, 302, 307].includes(response.status), `${kind}: ${response.status}`);
    assert.equal(harness.counts.ownerAuthorization, 0);
    assert.equal(harness.counts.sql, 0);
    assert.equal(harness.counts.stripeApiAccess, 0);
  }
  for (const kind of ["checkout", "portal", "change-plan"] as const) {
    const harness = paymentRoute(kind, privateEnv, { ownerDenied: true });
    const response = await harness.route.POST(harness.request);
    assert.equal(response.status, 403, kind);
    assert.equal(harness.counts.ownerAuthorization, 1);
    assert.equal(harness.counts.stripeApiAccess, 0);
    assert.equal(harness.counts.sql, 0);
  }
  const webhook = paymentRoute("webhook", privateEnv);
  const invalid = new Request("https://app.example.test/api/stripe/webhook", { method: "POST", body: "synthetic-payload" });
  assert.equal((await webhook.route.POST(invalid)).status, 400);
  assert.equal(webhook.counts.reconciliation, 0);
  assert.equal(webhook.counts.stripeApiAccess, 0);

  const restrictedWithoutFrozen = paymentRoute("account-deletion", privateEnv, {
    session: { deletionUserId: "11111111-1111-4111-8111-111111111111" }, frozenDeletion: null,
  });
  assert.equal((await restrictedWithoutFrozen.route.POST(restrictedWithoutFrozen.request)).status, 403);
  assert.equal(restrictedWithoutFrozen.counts.deletionMutation, 0);
  const restrictedWithFrozen = paymentRoute("account-deletion", privateEnv, {
    session: { deletionUserId: "11111111-1111-4111-8111-111111111111" },
  });
  await assertDisabled(await restrictedWithFrozen.route.POST(restrictedWithFrozen.request));
  assert.equal(restrictedWithFrozen.counts.frozenRead, 1);
  assert.equal(restrictedWithFrozen.counts.deletionMutation, 0);
});

test("missing/wrong private predicate values and Production preserve payment behavior", async () => {
  for (const env of ordinaryEnvs) {
    for (const kind of ["checkout", "portal", "change-plan"] as const) {
      const harness = paymentRoute(kind, { ...privateEnv, ...env }, { sqlFails: true });
      const response = await harness.route.POST(harness.request);
      assert.notDeepEqual(await response.json(), disabledBody, `${kind} should not receive private-mode rejection`);
      assert.equal(harness.counts.ownerAuthorization, 1);
      assert.ok(harness.counts.sql > 0);
    }
    const webhook = paymentRoute("webhook", { ...privateEnv, ...env });
    assert.equal((await webhook.route.POST(webhook.request)).status, 200);
    assert.equal(webhook.counts.webhookVerification, 1);
    assert.equal(webhook.counts.reconciliation, 1);

    const deletion = paymentRoute("account-deletion", { ...privateEnv, ...env }, { beginDeletionResult: "not_found" });
    assert.equal((await deletion.route.POST(deletion.request)).status, 401);
    assert.equal(deletion.counts.deletionMutation, 1);
  }
});

type CronKind = "review-booster" | "privacy" | "health";
function cronRoute(kind: CronKind, env: Record<string, string | undefined>, authorized: boolean) {
  const counts = { authorized: 0, sql: 0, acquire: 0, queue: 0, alertEvaluation: 0 };
  const unavailableError = class extends Error { retryAfterSeconds = 3; };
  const sql = async () => { counts.sql += 1; return []; };
  const cronHealth = {
    CronLeaseBusyError: unavailableError,
    acquireCronJobRun: async () => { counts.acquire += 1; throw new Error("synthetic stop after route gate"); },
    checkpointCronJobRun: async () => undefined,
    finishCronJobRun: async () => undefined,
  };
  const imports: Record<string, unknown> = {
    "next/server": { NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) } },
    "@/lib/db/neon": { sql },
    "@/lib/cron-auth": { isAuthorizedCronRequest: () => { counts.authorized += 1; return authorized; } },
    "@/lib/cron-health": cronHealth,
    "@/lib/private-preview": { isPrivatePreviewMode: () => isPrivatePreviewMode(env) },
    "@/lib/private-preview-operation": { privatePreviewOperationDisabledResponse: () => Response.json(disabledBody, { status: 503, headers: { "Cache-Control": "no-store, max-age=0" } }) },
    "@/lib/cron-alerts": { evaluateCronAlerts: async () => { counts.alertEvaluation += 1; return { ok: false, activeCount: 0, transportFailures: 0 }; } },
    "@/lib/safe-logger": { safeLogger: { error() {}, warn() {} } },
    "@/lib/db/deadline": { withDatabaseDeadline: (_deadline: Date | number, callback: () => unknown) => callback() },
    "@/lib/cron-budget": { providerWindow: () => 5_000 },
    "@/modules/review-booster/services/review-booster-db.service": { getReviewBoosterBillingPeriodUsage: async () => ({}) },
    "@/modules/review-booster/services/followup-runner.service": {
      createFollowupRunnerDependencies: async () => { counts.queue += 1; return {}; },
      runEligibleFollowups: async () => { counts.queue += 1; return { ok: true }; },
    },
  };
  const route = loadTs<{ GET(request: Request): Promise<Response> }>(`src/app/api/cron/${kind}/route.ts`, { overrides: imports });
  return { route, counts };
}

test("private Preview stops remaining cron, health and alert work after cron authorization", async () => {
  for (const env of [privateEnv, coolifyPrivateEnv]) for (const kind of ["review-booster", "privacy", "health"] as const) {
    const unauthorized = cronRoute(kind, env, false);
    const denied = await unauthorized.route.GET(new Request("https://app.example.test/api/cron"));
    assert.equal(denied.status, 401);
    assert.equal(unauthorized.counts.acquire, 0);
    assert.equal(unauthorized.counts.sql, 0);
    assert.equal(unauthorized.counts.alertEvaluation, 0);

    const authorized = cronRoute(kind, env, true);
    await assertDisabled(await authorized.route.GET(new Request("https://app.example.test/api/cron")));
    assert.equal(authorized.counts.acquire, 0);
    assert.equal(authorized.counts.sql, 0);
    assert.equal(authorized.counts.queue, 0);
    assert.equal(authorized.counts.alertEvaluation, 0);
  }
});

test("missing/wrong private predicate values preserve authorized cron route behavior", async () => {
  for (const kind of ["review-booster", "privacy", "health"] as const) {
    const ordinary = cronRoute(kind, ordinaryEnvs[0], true);
    const response = await ordinary.route.GET(new Request("https://app.example.test/api/cron"));
    assert.notDeepEqual(await response.json(), disabledBody, kind);
    if (kind === "health") assert.equal(ordinary.counts.alertEvaluation, 1);
    else assert.equal(ordinary.counts.acquire, 1);
  }
});
