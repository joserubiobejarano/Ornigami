import assert from "node:assert/strict";
import test from "node:test";
import { loadTs } from "./a02-test-support.mts";

const resources = loadTs<typeof import("../src/lib/google-resources.js")>("src/lib/google-resources.ts", {});
type Poster = {
  postReplyToGoogleAndPersist(actor: string, business: string, review: string, location: string, reply: string,
    approval?: { intent: "manual" | "automatic"; expectedVersion: number; expectedText: string }):
    Promise<{ ok: boolean; status?: number }>;
};
const location = "accounts/10/locations/20";

function loadPoster(outcome: "success" | "throw" | 400 | 429 | 503) {
  const calls = { provider: 0, claims: 0, finishes: [] as boolean[] };
  const mod = loadTs<Poster>("src/lib/review-reply-server.ts", {
    "@/lib/google": { googleFetch: async () => {
      calls.provider += 1;
      if (outcome === "throw") throw new Error("private transport detail");
      return new Response("provider body must stay private", { status: outcome === "success" ? 200 : outcome });
    } },
    "@/lib/db/neon": { sql: async () => [{ id: 21 }] },
    "@/lib/openai": { generateReviewReply: async () => "draft", sanitizeReviewReply: (value: string) => value },
    "@/lib/google-review-rating": { parseGoogleStarRating: () => null },
    "@/lib/api-security": { requireActiveAgentBusinessContext: async () => ({
      businessId: "business-1", integrationOwnerUserId: "owner-1", business: { owner_user_id: "owner-1" }, role: "member",
    }) },
    "@/lib/google-business": { getSelectedGoogleLocation: async () => ({ location_name: location, connection_version: "generation-1" }) },
    "@/lib/google-resources": resources,
    "@/lib/review-draft-policy": {
      claimReplyPost: async () => { calls.claims += 1; return { ok: true, token: "post-token" }; },
      finishReplyPost: async (_business: string, _review: string, _text: string, _token: string, success: boolean) => { calls.finishes.push(success); return true; },
    },
    "@/lib/account-lifecycle": {
      beginAccountLifecycleOperation: async () => ({ result: "claimed", token: "lifecycle-token" }),
      finishAccountLifecycleOperation: async () => true,
    },
  });
  return { mod, calls };
}

test("provider posting fails closed without approved intent/version/exact text", async () => {
  const { mod, calls } = loadPoster("success");
  const result = await mod.postReplyToGoogleAndPersist("member-1", "business-1", "review-1", location, "approved text");
  assert.deepEqual(result, { ok: false, error: "An approved saved draft version is required", status: 409 });
  assert.equal(calls.provider, 0);
  assert.equal(calls.claims, 0);
});

test("uncertain transport and server failures retain the posting fence for reconciliation", async () => {
  for (const outcome of ["throw", 503] as const) {
    const { mod, calls } = loadPoster(outcome);
    const result = await mod.postReplyToGoogleAndPersist("member-1", "business-1", "review-1", location, "approved text", {
      intent: "manual", expectedVersion: 3, expectedText: "approved text",
    });
    assert.equal(result.ok, false);
    assert.equal(calls.claims, 1);
    assert.deepEqual(calls.finishes, [], "uncertain outcome must keep the posting claim");
  }
});

test("definitive provider rejection releases the posting fence; success finalizes it", async () => {
  for (const outcome of [400, 429] as const) {
    const { mod, calls } = loadPoster(outcome);
    const result = await mod.postReplyToGoogleAndPersist("member-1", "business-1", "review-1", location, "approved text", {
      intent: "manual", expectedVersion: 3, expectedText: "approved text",
    });
    assert.equal(result.ok, false);
    assert.deepEqual(calls.finishes, [false]);
  }
  const accepted = loadPoster("success");
  assert.deepEqual(await accepted.mod.postReplyToGoogleAndPersist("member-1", "business-1", "review-1", location, "approved text", {
    intent: "manual", expectedVersion: 3, expectedText: "approved text",
  }), { ok: true });
  assert.deepEqual(accepted.calls.finishes, [true]);
});
