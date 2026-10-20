import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { loadTs } from "./a02-test-support.mts";

const base = { ownerUserId: "owner", actorUserId: "member", businessId: "business", recipientEmail: "owner@example.test",
  businessName: "Shop", locationName: "accounts/A/locations/L", reviews: [{ eventId: "review-event-001", reviewerName: "R", starRating: 5, comment: "Review" }] };

const mailConfiguration = {
  RESEND_API_KEY: "fixture-resend-key",
  EMAIL_FROM: "reviews@example.test",
  REPLY_TO_EMAIL: "support@example.test",
};

function getMailEnv(name: string): string | undefined {
  return mailConfiguration[name as keyof typeof mailConfiguration];
}

test("review alert holds a lifecycle lease and settles known delivery outcomes without logging response bodies", async () => {
  const finished: string[] = [];
  const lifecycleKeys: string[] = [];
  const authorizedContexts: Array<Record<string, unknown>> = [];
  const reviewKey = `review-alert:${createHash("sha256").update("review-event-001").digest("hex")}`;
  let failUnknown = false;
  try {
    const mod = loadTs<{ sendNewReviewAlert(input: typeof base): Promise<void> }>("src/lib/review-alerts.ts", {
      "@/lib/env": { getOptionalEnv: getMailEnv },
      "@/lib/safe-logger": { safeLogger: { warn: () => undefined } },
      "@/lib/qr-mail": {
        qrMailConfigured: () => true,
        sendAuthorizedResend: async (_payload: string, context: Record<string, unknown>) => {
          authorizedContexts.push(context);
          if (failUnknown) { const error = new Error("provider outcome unknown"); error.name = "QrMailOutcomeUnknownError"; throw error; }
          return "fake-provider-id";
        },
      },
      "@/lib/account-lifecycle": {
        beginAccountLifecycleOperation: async (input: { kind: string; actorUserId?: string; businessId: string; leaseMs: number; idempotencyKey: string }) => {
          assert.equal(input.kind, "resend_review_alert");
          assert.equal(input.actorUserId, "member");
          assert.equal(input.businessId, "business");
          assert.equal(input.leaseMs, 25_000);
          lifecycleKeys.push(input.idempotencyKey);
          return { result: "claimed", token: "attempt" };
        },
        finishAccountLifecycleOperation: async (_token: string, outcome: string) => { finished.push(outcome); return true; },
      },
    });
    await mod.sendNewReviewAlert(base);
    assert.deepEqual(finished, ["done"]);
    assert.deepEqual(lifecycleKeys, [reviewKey], "review eventId remains part of the lifecycle idempotency key");
    assert.deepEqual(authorizedContexts.map((context) => context.idempotencyKey), [reviewKey], "review eventId remains bound to provider idempotency");
    assert.deepEqual(authorizedContexts.map((context) => context.candidateId), [reviewKey]);
    failUnknown = true;
    await assert.rejects(mod.sendNewReviewAlert(base), /provider outcome is unknown/);
    assert.deepEqual(finished, ["done", "uncertain"]);
  } finally {
  }
});

test("review alert does not send after lifecycle admission is denied", async () => {
  let calls = 0;
  try {
    const mod = loadTs<{ sendNewReviewAlert(input: typeof base): Promise<void> }>("src/lib/review-alerts.ts", {
      "@/lib/env": { getOptionalEnv: getMailEnv },
      "@/lib/safe-logger": { safeLogger: { warn: () => undefined } },
      "@/lib/qr-mail": { qrMailConfigured: () => true, sendAuthorizedResend: async () => { calls += 1; return "fake-id"; } },
      "@/lib/account-lifecycle": { beginAccountLifecycleOperation: async () => ({ result: "frozen", token: null }) },
    });
    await mod.sendNewReviewAlert(base);
    assert.equal(calls, 0);
  } finally {
  }
});
