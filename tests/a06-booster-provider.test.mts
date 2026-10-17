import assert from "node:assert/strict";
import test from "node:test";
import { loadTs } from "./a02-test-support.mts";

let emailFrom = "mail.example.com";
let replyTo = "reply@example.com";
const linkValidation = loadTs("src/modules/review-booster/services/settings-link-validation.ts", {});
const provider = loadTs<{
  prepareResendPayload: (input: Record<string, unknown>) => Promise<Record<string, unknown>>;
  sendPreparedWithResend: (payload: Record<string, unknown>, key: string, context?: Record<string, unknown>) => Promise<string>;
  classifyResendFailure: (error: unknown) => string;
}>("src/modules/review-booster/services/resend.provider.ts", {
  "@/lib/env": { getRequiredEnv: (name: string) => name === "EMAIL_FROM" ? emailFrom : "test-key", getOptionalEnv: () => replyTo },
  "@/modules/review-booster/services/unsubscribe-token.service": { buildUnsubscribeUrl: () => "https://app.example/unsubscribe?token=abc" },
  "@/modules/review-booster/services/settings-link-validation": linkValidation,
  "@/lib/qr-mail": {
    sendAuthorizedResend: async (bytes: string, context: { idempotencyKey: string }) => {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST", headers: { "Idempotency-Key": context.idempotencyKey }, body: bytes,
        signal: AbortSignal.timeout(10_000),
      });
      let data: unknown;
      try { data = await response.json(); } catch { throw Object.assign(new Error("ambiguous"), { name: "ResendDeliveryError", kind: "ambiguous" }); }
      const id = data && typeof data === "object" ? (data as { id?: unknown }).id : null;
      if (!response.ok || typeof id !== "string") throw Object.assign(new Error("ambiguous"), { name: "ResendDeliveryError", kind: "ambiguous" });
      return id;
    },
  },
});

const mailContext = (idempotencyKey: string) => ({ purpose: "booster_followup", businessId: "business", candidateId: "candidate", workKey: "delivery", idempotencyKey });

test("prepared payload localizes CTA and unsubscribe and safely escapes links/body", async () => {
  for (const language of ["en", "es", "fr", "de", "it", "pt", "pt-BR"]) {
    const payload = await provider.prepareResendPayload({
      business_id: "b1", business_name: "Shop", customer_email: "customer@example.com", subject: "Thanks",
      body: '<script>alert("x")</script>', google_review_url: "https://search.google.com/local/writereview?placeid=fixture-place", review_link_url: "https://reviews.example/path?a=1&b=2", language,
    });
    assert.equal(typeof payload.text, "string");
    assert.match(String(payload.html), /&lt;script&gt;/);
    assert.doesNotMatch(String(payload.html), /<script>/);
    assert.match(String(payload.html), /href="https:\/\/reviews\.example\/path\?a=1&amp;b=2"/);
    assert.match(String(payload.html), /href="https:\/\/app\.example\/unsubscribe\?token=abc"/);
    assert.ok(payload.headers);
    assert.equal(Object.isFrozen(payload), true);
    assert.equal(Object.isFrozen(payload.headers), true);
      assert.ok(String(payload.html).includes(({ en: "Leave your review", es: "Deja tu opinión", fr: "Laisser un avis", de: "Bewertung abgeben", it: "Lascia una recensione", pt: "Deixe sua avaliação", "pt-BR": "Deixe sua avaliação" } as Record<string, string>)[language]));
  }
});

test("sender uses the frozen payload and idempotency header and requires provider ID", async () => {
  const payload = await provider.prepareResendPayload({ business_name: "Shop", customer_email: "customer@example.com", subject: "s", body: "b", google_review_url: "https://search.google.com/local/writereview?placeid=fixture-place", language: "en" });
  const originalFetch = globalThis.fetch;
  let requestBody = "";
  let requestHeaders: Headers | undefined;
  try {
    globalThis.fetch = (async (_url, init) => {
      requestBody = String(init?.body);
      requestHeaders = new Headers(init?.headers);
      return new Response(JSON.stringify({ id: "email-123" }), { status: 200 });
    }) as typeof fetch;
    assert.equal(await provider.sendPreparedWithResend(payload, "stable-key", mailContext("stable-key")), "email-123");
    assert.deepEqual(JSON.parse(requestBody), payload);
    assert.equal(requestHeaders?.get("Idempotency-Key"), "stable-key");
  } finally { globalThis.fetch = originalFetch; }
});

test("a replay sends the prepared payload unchanged after environment settings change", async () => {
  const payload = await provider.prepareResendPayload({ business_name: "Shop", customer_email: "customer@example.com", subject: "s", body: "b", google_review_url: "https://search.google.com/local/writereview?placeid=fixture-place", delivery_id: "delivery-123" });
  assert.deepEqual(payload.tags, [{ name: "ornigami_delivery_id", value: "delivery-123" }]);
  const serialized = JSON.stringify(payload);
  emailFrom = "changed.example.com";
  replyTo = "changed-reply@example.com";
  const originalFetch = globalThis.fetch;
  const requests: Array<{ body: string; key: string | null }> = [];
  try {
    globalThis.fetch = (async (_url, init) => {
      requests.push({ body: String(init?.body), key: new Headers(init?.headers).get("Idempotency-Key") });
      return new Response(JSON.stringify({ id: "email-existing" }), { status: 200 });
    }) as typeof fetch;
    await provider.sendPreparedWithResend(payload, "stable-replay-key", mailContext("stable-replay-key"));
    await provider.sendPreparedWithResend(payload, "stable-replay-key", mailContext("stable-replay-key"));
    assert.deepEqual(requests, [
      { body: serialized, key: "stable-replay-key" },
      { body: serialized, key: "stable-replay-key" },
    ]);
    assert.equal((payload as { from: string }).from, '"Shop" <mail.example.com>');
    assert.equal((payload as { reply_to: string }).reply_to, "reply@example.com");
  } finally {
    globalThis.fetch = originalFetch;
    emailFrom = "mail.example.com";
    replyTo = "reply@example.com";
  }
});

test("all provider rejections, transport failures, and malformed success are ambiguous", async () => {
  const payload = { from: "x", to: "x", reply_to: "x", subject: "x", text: "x", html: "x" };
  const originalFetch = globalThis.fetch;
  try {
    for (const [status, responseBody, expected] of [
      [409, { message: "concurrent request" }, "ambiguous"],
      [503, { message: "unavailable" }, "ambiguous"],
      [400, { message: "invalid address" }, "ambiguous"],
      [200, {}, "ambiguous"],
    ] as const) {
      globalThis.fetch = (async () => new Response(JSON.stringify(responseBody), { status })) as typeof fetch;
      await assert.rejects(provider.sendPreparedWithResend(payload, "same-key", mailContext("same-key")), (error: unknown) => provider.classifyResendFailure(error) === expected);
    }
    globalThis.fetch = (async () => { throw new TypeError("socket reset"); }) as typeof fetch;
    await assert.rejects(provider.sendPreparedWithResend(payload, "same-key", mailContext("same-key")), (error: unknown) => provider.classifyResendFailure(error) === "ambiguous");
    assert.equal(provider.classifyResendFailure({ name: "ResendDeliveryError", kind: "definite_rejection", status: 400 }), "definite_rejection");
  } finally { globalThis.fetch = originalFetch; }
});

test("invalid review URL fails before transport while local tracked links remain available in development", async () => {
  await assert.rejects(provider.prepareResendPayload({ business_name: "Shop", customer_email: "a@example.com", subject: "s", body: "b", google_review_url: "javascript:alert(1)" }));
  await assert.rejects(provider.prepareResendPayload({ business_name: "Shop", customer_email: "a@example.com", subject: "s", body: "b", google_review_url: "http://reviews.example/path" }));
  await assert.rejects(provider.prepareResendPayload({ business_name: "Shop", customer_email: "a@example.com", subject: "s", body: "b", google_review_url: "https://user:password@reviews.example/path" }));
  const local = await provider.prepareResendPayload({ business_name: "Shop", customer_email: "a@example.com", subject: "s", body: "b", google_review_url: "https://search.google.com/local/writereview?placeid=fixture-place", review_link_url: "http://localhost:3000/review" });
  assert.match(String(local.text), /http:\/\/localhost:3000\/review/);
});

test("sender requires an authority context before transport", async () => {
  let calls = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => { calls += 1; return Response.json({ id: "unexpected" }); }) as typeof fetch;
  try {
    await assert.rejects(provider.sendPreparedWithResend({ from: "x", to: "x", reply_to: "x", subject: "x", text: "x", html: "x" }, "k"), /Mail authorization context is required/);
    assert.equal(calls, 0);
  } finally { globalThis.fetch = originalFetch; }
});
