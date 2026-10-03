import assert from "node:assert/strict";
import test from "node:test";
import { loadTs } from "./a02-test-support.mts";
import type { AtomicBeginSend, AtomicFollowupCandidate, FrozenFollowupPayload } from "../src/modules/review-booster/services/atomic-followup-db.service.ts";
import type { FollowupRunnerDependencies, FollowupRunOutcome } from "../src/modules/review-booster/services/followup-runner.service.ts";

type Payload = FrozenFollowupPayload;
type Visit = AtomicFollowupCandidate;
type Deps = FollowupRunnerDependencies;

const runner = loadTs<{ runEligibleFollowups: (deps: Deps) => Promise<FollowupRunOutcome> }>(
  "src/modules/review-booster/services/followup-runner.service.ts",
  {
    "@/lib/followup-run-policy": { MAX_FOLLOWUPS_PER_RUN: 50 },
    "@/modules/review-booster/services/settings-link-validation": loadTs("src/modules/review-booster/services/settings-link-validation.ts", {}),
  },
);

function visit(id = "visit-1"): Visit {
  return {
    visitId: id, businessId: "business-1", customerName: "Ada", customerEmail: "ada@example.com",
    visitedAt: "2026-10-01T10:00:00.000Z", serviceName: "Consultation", businessName: "Studio",
    businessType: "Salon", city: "Madrid", googleReviewUrl: "https://search.google.com/local/writereview?placeid=fixture-place", rebookingUrl: null,
    tone: "warm", language: "es", emailFromName: "Studio", deliveryId: null, deliveryState: null,
    payload: null, idempotencyKey: null, firstAttemptAt: null,
  };
}

function harness(options: {
  visits?: Visit[];
  send?: (payload: Payload, key: string) => Promise<string>;
  begin?: () => Promise<AtomicBeginSend>;
  persist?: () => Promise<boolean>;
  generate?: (visit: Visit) => Promise<string>;
  finalize?: () => Promise<boolean>;
  release?: () => Promise<boolean>;
} = {}) {
  const visits = options.visits ?? [visit()];
  const state = { claimed: false, recovery: false, payload: null as Payload | null, firstAttemptAt: null as string | null, key: "stable-key-1" };
  const log = { claim: 0, generated: 0, prepared: 0, persisted: 0, began: 0, sent: [] as Array<{ payload: Payload; key: string }>, released: [] as string[], unknown: 0, finalized: 0, limits: [] as number[] };
  const deps: Deps = {
    listCandidates: async (limit) => { log.limits.push(limit); return visits; },
    claim: async () => {
      log.claim += 1;
      if (state.claimed && !state.recovery) return { kind: "busy", deliveryId: "delivery-1", fence: "fence-1", payload: null, idempotencyKey: state.key, firstAttemptAt: null };
      state.claimed = true;
      if (state.recovery) return { kind: "recovery", deliveryId: "delivery-1", fence: "fence-2", payload: state.payload, idempotencyKey: state.key, firstAttemptAt: state.firstAttemptAt };
      return { kind: "claimed", deliveryId: "delivery-1", fence: "fence-1", payload: null, idempotencyKey: state.key, firstAttemptAt: null };
    },
    buildSubject: (businessName, language) => language === "es" ? `Gracias por visitarnos en ${businessName}` : `Thank you for visiting ${businessName}`,
    generateBody: async (candidate) => { log.generated += 1; return options.generate ? options.generate(candidate) : `Body with ${candidate.visitedAt}`; },
    preparePayload: async (_candidate, subject, body, deliveryId) => { log.prepared += 1; return { from: "Studio <mail@example.com>", to: "ada@example.com", reply_to: "mail@example.com", subject, text: body, html: `<p>${body}</p>`, tags: [{ name: "ornigami_delivery_id", value: deliveryId }] }; },
    persistPayload: async (_id, _fence, payload) => { log.persisted += 1; const persisted = options.persist ? await options.persist() : true; if (persisted) state.payload = structuredClone(payload); return persisted; },
    beginSend: async () => {
      log.began += 1;
      if (options.begin) return options.begin();
      state.firstAttemptAt ??= new Date().toISOString();
      return { kind: "send", payload: state.payload!, idempotencyKey: state.key, firstAttemptAt: state.firstAttemptAt };
    },
    sendPrepared: async (payload, key) => { log.sent.push({ payload: structuredClone(payload), key }); return options.send ? options.send(payload, key) : "resend-1"; },
    classifySendError: (error) => (error as { kind?: string })?.kind === "definite_rejection" ? "definite_rejection" : "ambiguous",
    finalizeAccepted: async () => { log.finalized += 1; return options.finalize ? options.finalize() : true; },
    release: async ({ outcome }) => { log.released.push(outcome); return options.release ? options.release() : true; },
    markUnknown: async () => { log.unknown += 1; state.recovery = true; return true; },
  };
  return { deps, log, state };
}

test("runner passes SQL selection cap 50 and performs a complete successful delivery", async () => {
  const { deps, log } = harness();
  const result = await runner.runEligibleFollowups(deps);
  assert.equal(result.sent, 1);
  assert.deepEqual(log.limits, [50]);
  assert.equal(log.persisted, 1);
  assert.equal(log.sent[0]?.payload.text, "Body with 2026-10-01T10:00:00.000Z");
  assert.equal(log.sent[0]?.payload.subject, "Gracias por visitarnos en Studio");
  assert.deepEqual(log.sent[0]?.payload.tags, [{ name: "ornigami_delivery_id", value: "delivery-1" }]);
  assert.equal(log.sent[0]?.key, "stable-key-1");
});

test("overlapping runs use an atomic claim and the second worker never sends", async () => {
  const { deps, log } = harness();
  const [first, second] = await Promise.all([runner.runEligibleFollowups(deps), runner.runEligibleFollowups(deps)]);
  assert.equal(log.sent.length, 1);
  assert.equal(first.sent + second.sent, 1);
  assert.equal(first.skipped + second.skipped, 1);
});

test("a definite first-attempt rejection releases the reservation", async () => {
  const { deps, log } = harness({ send: async () => { throw Object.assign(new Error("invalid recipient"), { kind: "definite_rejection" }); } });
  const result = await runner.runEligibleFollowups(deps);
  assert.equal(result.failed, 1);
  assert.deepEqual(log.released, ["rejected"]);
  assert.equal(log.unknown, 0);
});

test("an ambiguous provider outcome holds the reservation and a retry reuses frozen payload and key", async () => {
  const { deps, log, state } = harness({ send: async () => { throw new Error("socket timed out"); } });
  const first = await runner.runEligibleFollowups(deps);
  assert.equal(first.unknown, 1);
  assert.equal(log.released.length, 0);
  const frozen = structuredClone(state.payload);
  state.firstAttemptAt = new Date().toISOString();
  deps.sendPrepared = async (payload, key) => { log.sent.push({ payload: structuredClone(payload), key }); return "resend-replay"; };
  const second = await runner.runEligibleFollowups(deps);
  assert.equal(second.sent, 1);
  assert.equal(log.generated, 1);
  assert.equal(log.prepared, 1);
  assert.deepEqual(log.sent[0]?.payload, frozen);
  assert.deepEqual(log.sent[1]?.payload, frozen);
  assert.equal(log.sent[0]?.key, log.sent[1]?.key);
});

test("a known rejection on a recovery attempt stays unknown because an earlier send may have succeeded", async () => {
  const { deps, log, state } = harness();
  state.claimed = true;
  state.recovery = true;
  state.payload = { from: "Studio <mail@example.com>", to: "ada@example.com", reply_to: "mail@example.com", subject: "Frozen", text: "Frozen body", html: "<p>Frozen body</p>" };
  state.firstAttemptAt = "2026-10-02T12:00:00.000Z";
  deps.sendPrepared = async () => { throw Object.assign(new Error("401 after key rotation"), { kind: "definite_rejection" }); };
  const result = await runner.runEligibleFollowups(deps);
  assert.equal(result.unknown, 1);
  assert.equal(log.generated, 0);
  assert.equal(log.released.length, 0);
  assert.equal(log.unknown, 1);
});

test("payload persistence failure propagates before any provider call or release", async () => {
  const { deps, log } = harness({ persist: async () => { throw new Error("database unavailable"); } });
  await assert.rejects(runner.runEligibleFollowups(deps), /database unavailable/);
  assert.equal(log.sent.length, 0);
  assert.equal(log.released.length, 0);
});

test("a stale lease cannot send", async () => {
  const { deps, log } = harness({ begin: async () => ({ kind: "stale" }) });
  const result = await runner.runEligibleFollowups(deps);
  assert.equal(result.skipped, 1);
  assert.equal(log.sent.length, 0);
});

test("terminal expired and non-sendable candidates are skipped without aborting the run", async () => {
  const { deps, log } = harness({ visits: [visit("expired"), visit("non-sendable")] });
  const terminalKinds: Array<"expired" | "non_sendable"> = ["expired", "non_sendable"];
  deps.claim = async () => ({ kind: terminalKinds.shift() ?? "ineligible", deliveryId: null, fence: null, payload: null, idempotencyKey: null, firstAttemptAt: null });
  const result = await runner.runEligibleFollowups(deps);
  assert.equal(result.scanned, 2);
  assert.equal(result.skipped, 2);
  assert.equal(log.sent.length, 0);
});

test("suppression or eligibility changing at the pre-send boundary blocks provider I/O", async () => {
  const { deps, log } = harness({ begin: async () => ({ kind: "non_sendable" }) });
  const result = await runner.runEligibleFollowups(deps);
  assert.equal(result.skipped, 1);
  assert.equal(log.sent.length, 0);
});

test("generator failure records a failure and releases the reservation", async () => {
  const { deps, log } = harness({ generate: async () => { throw new Error("generator failed"); } });
  const result = await runner.runEligibleFollowups(deps);
  assert.equal(result.failed, 1);
  assert.deepEqual(log.released, ["generation_failed"]);
  assert.equal(log.sent.length, 0);
});

test("a frozen-payload-free recovery with no prior provider attempt safely regenerates", async () => {
  const { deps, log, state } = harness();
  state.claimed = true;
  state.recovery = true;
  state.firstAttemptAt = null;
  const result = await runner.runEligibleFollowups(deps);
  assert.equal(result.sent, 1);
  assert.equal(log.generated, 1);
  assert.equal(log.persisted, 1);
  assert.equal(log.sent.length, 1);
});

test("missing business name fails before generation or provider I/O", async () => {
  const { deps, log } = harness({ visits: [{ ...visit(), businessName: "" }] });
  const result = await runner.runEligibleFollowups(deps);
  assert.equal(result.failed, 1);
  assert.equal(log.generated, 0);
  assert.equal(log.sent.length, 0);
  assert.deepEqual(log.released, ["generation_failed"]);
});

test("a stale rejection fence is not reported as a definitive failed delivery", async () => {
  const { deps, log } = harness({
    send: async () => { throw Object.assign(new Error("invalid recipient"), { kind: "definite_rejection" }); },
    release: async () => false,
  });
  const result = await runner.runEligibleFollowups(deps);
  assert.equal(result.failed, 0);
  assert.equal(result.skipped, 1);
  assert.deepEqual(log.released, ["rejected"]);
});

test("accepted-send finalization failure propagates without release or a rejected-provider classification", async () => {
  const { deps, log } = harness({ finalize: async () => { throw new Error("database finalize unavailable"); } });
  await assert.rejects(runner.runEligibleFollowups(deps), /database finalize unavailable/);
  assert.equal(log.sent.length, 1);
  assert.equal(log.released.length, 0);
  assert.equal(log.unknown, 0);
});

test("production adapter tags the frozen payload with delivery ID and rechecks manual actor before send", async () => {
  let accessCheck = "";
  let beginActor = "";
  let taggedDelivery = "";
  let providerCalls = 0;
  const factoryModule = loadTs<{
    createFollowupRunnerDependencies: (businessId: string, actorUserId?: string, overrides?: Partial<Deps>) => Promise<Deps>;
    runEligibleFollowups: (deps: Deps) => Promise<FollowupRunOutcome>;
  }>(
    "src/modules/review-booster/services/followup-runner.service.ts",
    {
      "@/lib/followup-run-policy": { MAX_FOLLOWUPS_PER_RUN: 50 },
      "@/modules/review-booster/services/settings-link-validation": loadTs("src/modules/review-booster/services/settings-link-validation.ts", {}),
      "@/modules/review-booster/services/atomic-followup-db.service": {
        listAtomicFollowupCandidates: async () => [visit()],
        claimAtomicFollowupDelivery: async () => ({ kind: "claimed", deliveryId: "delivery-9", fence: "fence-9", payload: null, idempotencyKey: "key-9", firstAttemptAt: null }),
        persistAtomicFollowupPayload: async () => true,
        beginAtomicFollowupSend: async (input: { actorUserId?: string }) => { beginActor = input.actorUserId ?? ""; return { kind: "actor_denied" }; },
        finalizeAtomicFollowupAccepted: async () => true, releaseAtomicFollowupDelivery: async () => true,
        markAtomicFollowupUnknown: async () => true,
      },
      "@/modules/review-booster/services/resend.provider": {
        prepareResendPayload: async (input: { delivery_id?: string }) => {
          taggedDelivery = input.delivery_id ?? "";
          return { from: "Studio <mail@example.com>", to: "ada@example.com", reply_to: "mail@example.com", subject: "s", text: "t", html: "h", tags: [{ name: "ornigami_delivery_id", value: input.delivery_id ?? "" }] };
        },
        sendPreparedWithResend: async () => { providerCalls += 1; return "message-id"; }, classifyResendFailure: () => "ambiguous",
      },
      "@/modules/review-booster/services/followup-email-generator.service": {
        buildSubject: () => "default subject", generateFollowupEmailBody: async () => "default body",
      },
      "@/lib/review-link-token": { buildReviewLinkUrl: () => "https://example.com/review" },
      "@/modules/review-booster/services/review-booster-db.service": { assertBusinessMember: async (businessId: string, userId: string) => { accessCheck = `${businessId}:${userId}`; } },
    },
  );
  const customGenerate = async () => "injected body";
  const deps = await factoryModule.createFollowupRunnerDependencies("business-1", "user-1", {
    generateBody: customGenerate,
  });
  assert.equal(accessCheck, "business-1:user-1");
  assert.equal(await deps.generateBody(visit()), "injected body");
  const result = await factoryModule.runEligibleFollowups(deps);
  assert.equal(result.skipped, 1);
  assert.equal(beginActor, "user-1");
  assert.equal(taggedDelivery, "delivery-9");
  assert.equal(providerCalls, 0);
});
