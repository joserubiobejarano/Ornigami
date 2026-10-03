import assert from "node:assert/strict";
import test from "node:test";
import { loadTs } from "./auth-test-harness.mts";

const actor = "00000000-0000-4000-8000-000000000012";
const operation = "00000000-0000-4000-8000-000000000032";
const fence = "00000000-0000-4000-8000-000000000042";

function loadRoute(config: {
  session?: unknown;
  enabled?: boolean;
  role?: "owner" | "member";
  beginResult?: string;
  finalizeResult?: string;
  claimResult?: "claimed" | "busy" | "complete";
  frozenOperation?: string | null;
  signOutFailure?: boolean;
  steps?: { billing: boolean; google: boolean };
  stripeFailure?: Error;
}) {
  const state = {
    authCalls: 0,
    beginCalls: 0,
    beginConfirmedValues: [] as boolean[],
    frozenLookups: 0,
    reconcileCalls: 0,
    revokeCalls: 0,
    releaseCalls: [] as string[],
    signOutCalls: 0,
    steps: config.steps ?? { billing: false, google: false },
  };
  const loaded = loadTs<{ POST(request: Request): Promise<Response> }>("src/app/api/privacy/delete/route.ts", {
    env: { PRIVACY_ACCOUNT_DELETION_ENABLED: config.enabled === false ? "false" : "true" },
    overrides: {
      "@/auth": {
        auth: async () => { state.authCalls += 1; return config.session ?? { user: { id: actor } }; },
        signOut: async () => {
          state.signOutCalls += 1;
          if (config.signOutFailure) throw new Error("cookie clear failed");
        },
      },
      "@/lib/team-lifecycle": { isSameOriginMutation: () => true },
      "@/lib/safe-logger": { safeLogger: { error: () => undefined } },
      "@/lib/stripe": { stripe: {} },
      "@/lib/billing/reconciliation": { cancelMappedOwnedBillingSubscriptions: async () => [] },
      "@/lib/privacy-account-deletion": {
        beginAccountDeletion: async (_actor: string, _confirmed: boolean) => {
          state.beginCalls += 1;
          state.beginConfirmedValues.push(_confirmed);
          return { result: config.beginResult ?? "frozen", operationId: operation, accountRole: config.role ?? "member" };
        },
        getFrozenDeletionOperation: async () => {
          state.frozenLookups += 1;
          return config.frozenOperation === undefined ? operation : config.frozenOperation;
        },
        claimAccountDeletion: async () => ({ result: config.claimResult ?? "claimed", actorUserId: actor, accountRole: config.role ?? "member", fence }),
        getAccountDeletionSteps: async () => ({ ...state.steps }),
        renewAccountDeletionLease: async () => undefined,
        recordAccountDeletionStep: async (_id: string, _fence: string, step: "billing" | "google") => { state.steps[step] = true; },
        releaseAccountDeletion: async (_id: string, _fence: string, code: string) => { state.releaseCalls.push(code); },
        finalizeAccountDeletion: async () => config.finalizeResult ?? "complete",
      },
      "@/lib/privacy-deletion-providers": {
        reconcileOwnerStripeForDeletion: async (input: { ownerUserId: string }) => {
          state.reconcileCalls += 1;
          assert.equal(input.ownerUserId, actor, "Stripe uses the actor's own billing records");
          if (config.stripeFailure) throw config.stripeFailure;
        },
        revokeActorGoogleGrant: async (userId: string) => {
          state.revokeCalls += 1;
          assert.equal(userId, actor, "member deletion revokes the actor's Google grant");
        },
      },
    },
  });
  return { loaded, state };
}

const request = (body: unknown) => new Request("https://ornigami.example/api/privacy/delete", {
  method: "POST",
  headers: { "content-type": "application/json", origin: "https://ornigami.example" },
  body: JSON.stringify(body),
});

test("A11 deletion remains disabled until auth/billing guards are integrated", async () => {
  const { loaded, state } = loadRoute({ enabled: false });
  const response = await loaded.POST(request({ confirmation: "DELETE MY DATA" }));
  assert.equal(response.status, 503);
  assert.equal(state.authCalls, 0);
  assert.equal(state.beginCalls, 0);
  assert.equal(state.reconcileCalls, 0);
});

test("A11 member account deletion processes the actor's own billing and Google grants", async () => {
  const { loaded, state } = loadRoute({ role: "member" });
  const response = await loaded.POST(request({ confirmation: "DELETE MY DATA" }));
  assert.equal(response.status, 200);
  assert.equal(state.reconcileCalls, 1, "a teammate can still have personal legacy billing to reconcile");
  assert.equal(state.revokeCalls, 1);
  assert.equal(state.signOutCalls, 1);
  assert.equal(state.steps.billing, true);
  assert.equal(state.steps.google, true);
});

test("A11 restricted session resumes only an existing frozen operation", async () => {
  const { loaded, state } = loadRoute({ session: { deletionUserId: actor }, role: "member" });
  const response = await loaded.POST(request({ confirmation: "DELETE MY DATA" }));
  assert.equal(response.status, 200);
  assert.equal(state.beginCalls, 1, "restricted identity rechecks the existing operation without creating a new one");
  assert.deepEqual(state.beginConfirmedValues, [false]);
  assert.equal(state.reconcileCalls, 1);
});

test("A11 owner team confirmation is required before any freeze or provider call", async () => {
  const { loaded, state } = loadRoute({ role: "owner", beginResult: "team_confirmation_required" });
  const response = await loaded.POST(request({ confirmation: "DELETE MY DATA", confirmSharedWorkspaceData: false }));
  assert.equal(response.status, 409);
  assert.equal(state.beginCalls, 1);
  assert.equal(state.reconcileCalls, 0);
  assert.equal(state.revokeCalls, 0);
});

test("A11 late workspace admission asks for explicit confirmation and retains the frozen operation", async () => {
  const { loaded, state } = loadRoute({ role: "owner", finalizeResult: "team_confirmation_required" });
  const response = await loaded.POST(request({ confirmation: "DELETE MY DATA" }));
  assert.equal(response.status, 409);
  assert.deepEqual(state.releaseCalls, ["team_confirmation_required"]);
  assert.equal(state.signOutCalls, 0);
  assert.equal(state.beginCalls, 1, "the retried confirmation will upgrade this same operation");
});

test("A11 provider failure keeps the operation recoverable and does not sign out", async () => {
  const { loaded, state } = loadRoute({ role: "owner", stripeFailure: new Error("stripe_subscription_unmapped") });
  const response = await loaded.POST(request({ confirmation: "DELETE MY DATA", confirmSharedWorkspaceData: true }));
  assert.equal(response.status, 202);
  assert.deepEqual(state.releaseCalls, ["provider_or_storage_failure"]);
  assert.equal(state.signOutCalls, 0);
  assert.equal(state.steps.billing, false);
});

test("A11 rejects malformed bodies before creating a deletion operation", async () => {
  const { loaded, state } = loadRoute({});
  const response = await loaded.POST(new Request("https://ornigami.example/api/privacy/delete", {
    method: "POST", headers: { "content-type": "application/json", origin: "https://ornigami.example" }, body: "[]",
  }));
  assert.equal(response.status, 400);
  assert.equal(state.beginCalls, 0);
});

test("A11 refuses a restricted session without a frozen operation", async () => {
  const { loaded, state } = loadRoute({ session: { deletionUserId: actor }, frozenOperation: null });
  const response = await loaded.POST(request({ confirmation: "DELETE MY DATA" }));
  assert.equal(response.status, 403);
  assert.equal(state.frozenLookups, 1);
  assert.equal(state.beginCalls, 0);
  assert.equal(state.reconcileCalls, 0);
});

test("A11 busy deletion worker returns a retryable conflict", async () => {
  const { loaded, state } = loadRoute({ claimResult: "busy" });
  const response = await loaded.POST(request({ confirmation: "DELETE MY DATA" }));
  assert.equal(response.status, 409);
  assert.equal(state.reconcileCalls, 0);
  assert.equal(state.signOutCalls, 0);
});

test("A11 completed deletion remains successful when browser cookie cleanup fails", async () => {
  const { loaded } = loadRoute({ beginResult: "complete", signOutFailure: true });
  const response = await loaded.POST(request({ confirmation: "DELETE MY DATA" }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
});
