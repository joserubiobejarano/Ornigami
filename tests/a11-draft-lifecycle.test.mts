import assert from "node:assert/strict";
import test from "node:test";
import { loadTs } from "./a02-test-support.mts";

type ProcessReviewDraft = {
  processReviewDraft(input: {
    ownerUserId: string;
    actorUserId: string;
    businessId: string;
    locationName: string;
    row: { id: number; google_review_id: string; comment: string; star_rating: number };
    profile: null;
    source: "scheduled" | "individual" | "interactive_batch";
    providerTimeoutMs?: number;
  }): Promise<{ outcome: string; stage?: string; reason?: string; posted?: boolean }>;
};

function loadProcessor(generate: () => Promise<string>) {
  const calls = { claimed: 0, reserved: 0, generated: 0, saved: 0, releasedUsage: 0, lifecycleBegins: 0, lifecycleFinishes: [] as string[] };
  let unresolved = false;
  const mod = loadTs<ProcessReviewDraft>("src/lib/review-draft-processing.ts", {
    "@/lib/review-reply-server": {
      generateReplyForReviewRow: async (_row: unknown, _profile: unknown, options: { timeoutMs?: number }) => {
        calls.generated += 1;
        assert.equal(options.timeoutMs, 1200, "scheduled provider timeout reaches the actual generation boundary");
        return generate();
      },
      postReplyToGoogleAndPersist: async () => ({ ok: true }),
    },
    "@/lib/review-draft-policy": {
      claimReplyGeneration: async () => { calls.claimed += 1; return { ok: true, claim: { token: "claim", fence: 1, version: 0 } }; },
      reserveReplyGenerationUsage: async () => { calls.reserved += 1; return { ok: true, reservationId: "reservation" }; },
      saveGeneratedReplyDraftAndCharge: async () => { calls.saved += 1; return { ok: true, draft: { replyId: 1, reviewId: "review", reply: "Thanks", state: "ai_drafted", version: 1, updatedAt: null } }; },
      releaseReplyGenerationUsage: async () => { calls.releasedUsage += 1; },
      releaseReplyGenerationClaim: async () => undefined,
    },
    "@/lib/google-review-rating": { parseGoogleStarRating: () => null },
    "@/lib/account-lifecycle": {
      beginAccountLifecycleOperation: async () => {
        calls.lifecycleBegins += 1;
        if (unresolved) return { result: "uncertain", token: null };
        return { result: "claimed", token: "lifecycle-token" };
      },
      finishAccountLifecycleOperation: async (_token: string, outcome: "done" | "uncertain" | "failed") => {
        calls.lifecycleFinishes.push(outcome);
        if (outcome === "uncertain") unresolved = true;
        return true;
      },
    },
  });
  return { mod, calls };
}

const input = {
  ownerUserId: "owner-1",
  actorUserId: "actor-1",
  businessId: "business-1",
  locationName: "accounts/10/locations/20",
  row: { id: 1, google_review_id: "review-1", comment: "Useful feedback", star_rating: 5 },
  profile: null,
  source: "scheduled" as const,
  providerTimeoutMs: 1200,
};

function providerError(name: string, status?: number): Error {
  const error = new Error("provider failure");
  error.name = name;
  if (status !== undefined) Object.assign(error, { status });
  return error;
}

test("ambiguous OpenAI transport, timeout, and server failures leave lifecycle uncertain and prevent another generation", async () => {
  for (const failure of [
    providerError("APIConnectionError"),
    providerError("APIConnectionTimeoutError"),
    providerError("APIError", 503),
  ]) {
    const { mod, calls } = loadProcessor(async () => { throw failure; });
    await assert.rejects(mod.processReviewDraft(input), failure);
    assert.deepEqual(calls.lifecycleFinishes, ["uncertain"]);
    assert.equal(calls.saved, 0);
    assert.equal(calls.releasedUsage, 1);

    assert.deepEqual(await mod.processReviewDraft(input), { outcome: "skipped", reason: "busy" });
    assert.equal(calls.generated, 1, "a later scheduler pass is denied by the unresolved lifecycle row");
    assert.equal(calls.lifecycleFinishes.length, 1);
  }
});

test("successful and known rejected generation outcomes finish accurately", async () => {
  const success = loadProcessor(async () => "A concise owner reply.");
  assert.deepEqual(await success.mod.processReviewDraft(input), {
    outcome: "saved",
    draft: { replyId: 1, reviewId: "review", reply: "Thanks", state: "ai_drafted", version: 1, updatedAt: null },
    posted: false,
  });
  assert.deepEqual(success.calls.lifecycleFinishes, ["done"]);
  assert.equal(success.calls.saved, 1);

  const rejected = loadProcessor(async () => { throw providerError("BadRequestError", 400); });
  assert.deepEqual(await rejected.mod.processReviewDraft(input), { outcome: "failed", stage: "generate" });
  assert.deepEqual(rejected.calls.lifecycleFinishes, ["done"], "known 4xx rejection has no ambiguous provider side effect");
  assert.equal(rejected.calls.saved, 0);
  assert.equal(rejected.calls.releasedUsage, 1);
});
