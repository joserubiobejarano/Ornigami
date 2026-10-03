import assert from "node:assert/strict";
import test from "node:test";
import { loadTs } from "./a02-test-support.mts";

const base = { ownerUserId: "owner", actorUserId: "member", businessId: "business", recipientEmail: "owner@example.test",
  businessName: "Shop", locationName: "accounts/A/locations/L", reviews: [{ reviewerName: "R", starRating: 5, comment: "Review" }] };

test("review alert holds a lifecycle lease and settles known delivery outcomes without logging response bodies", async () => {
  const originalFetch = globalThis.fetch;
  const finished: string[] = [];
  let status = 202;
  globalThis.fetch = async () => new Response("private provider text", { status });
  try {
    const mod = loadTs<{ sendNewReviewAlert(input: typeof base): Promise<void> }>("src/lib/review-alerts.ts", {
      "@/lib/env": { getOptionalEnv: (name: string) => name === "RESEND_API_KEY" ? "test-key" : "test@example.test" },
      "@/lib/safe-logger": { safeLogger: { warn: () => undefined } },
      "@/lib/account-lifecycle": {
        beginAccountLifecycleOperation: async (input: { kind: string; actorUserId?: string; businessId: string; leaseMs: number }) => {
          assert.equal(input.kind, "resend_review_alert");
          assert.equal(input.actorUserId, "member");
          assert.equal(input.businessId, "business");
          assert.equal(input.leaseMs, 25_000);
          return { result: "claimed", token: "attempt" };
        },
        finishAccountLifecycleOperation: async (_token: string, outcome: string) => { finished.push(outcome); return true; },
      },
    });
    await mod.sendNewReviewAlert(base);
    assert.deepEqual(finished, ["done"]);
    status = 503;
    await assert.rejects(mod.sendNewReviewAlert(base), /provider rejected/);
    assert.deepEqual(finished, ["done", "uncertain"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("review alert does not send after lifecycle admission is denied", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; return Response.json({}); };
  try {
    const mod = loadTs<{ sendNewReviewAlert(input: typeof base): Promise<void> }>("src/lib/review-alerts.ts", {
      "@/lib/env": { getOptionalEnv: () => "set" },
      "@/lib/safe-logger": { safeLogger: { warn: () => undefined } },
      "@/lib/account-lifecycle": { beginAccountLifecycleOperation: async () => ({ result: "frozen", token: null }) },
    });
    await mod.sendNewReviewAlert(base);
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
