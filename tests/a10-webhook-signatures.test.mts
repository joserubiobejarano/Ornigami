import assert from "node:assert/strict";
import test from "node:test";
import { loadResendWebhookService, nowSeconds, signWebhook, webhookSecret } from "./a10-webhook-test-support.mts";

test("Resend signature verifier binds raw body and accepts any matching v1 rotation signature", () => {
  const rawBody = '{"type":"email.sent"}';
  const signed = signWebhook(rawBody);
  const headers = new Headers({
    "svix-id": signed.id,
    "svix-timestamp": signed.timestamp,
    "svix-signature": signed.signature,
  });
  const verify = loadResendWebhookService().verifyResendWebhookSignature;
  assert.deepEqual(verify({ rawBody, headers, secret: webhookSecret, nowSeconds }), { valid: true, eventId: signed.id });
  assert.deepEqual(verify({ rawBody: `${rawBody} `, headers, secret: webhookSecret, nowSeconds }), { valid: false });
});

test("Resend signature verifier rejects stale timestamps, malformed keys, missing headers, and bad signatures", () => {
  const rawBody = "{}";
  const stale = signWebhook(rawBody, { timestamp: nowSeconds - 301 });
  const headers = new Headers({ "svix-id": stale.id, "svix-timestamp": stale.timestamp, "svix-signature": stale.signature });
  const verify = loadResendWebhookService().verifyResendWebhookSignature;
  assert.deepEqual(verify({ rawBody, headers, secret: webhookSecret, nowSeconds }), { valid: false });
  assert.deepEqual(verify({ rawBody, headers, secret: "whsec_not-base64!", nowSeconds }), { valid: false });
  assert.deepEqual(verify({ rawBody, headers: new Headers(), secret: webhookSecret, nowSeconds }), { valid: false });
  headers.set("svix-signature", "v1,not-a-valid-signature");
  assert.deepEqual(verify({ rawBody, headers, secret: webhookSecret, nowSeconds }), { valid: false });
});

test("Standard Webhooks header aliases are supported and conflicting aliases fail closed", () => {
  const rawBody = "{}";
  const signed = signWebhook(rawBody);
  const headers = new Headers({
    "webhook-id": signed.id,
    "webhook-timestamp": signed.timestamp,
    "webhook-signature": signed.signature,
  });
  const verify = loadResendWebhookService().verifyResendWebhookSignature;
  assert.equal(verify({ rawBody, headers, secret: webhookSecret, nowSeconds }).valid, true);
  headers.set("svix-id", "other-id");
  assert.equal(verify({ rawBody, headers, secret: webhookSecret, nowSeconds }).valid, false);
});
