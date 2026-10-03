import { createHmac } from "node:crypto";
import { loadTs } from "./a02-test-support.mts";

export const webhookSecret = `whsec_${Buffer.from("synthetic-resend-webhook-signing-key-32").toString("base64")}`;
export const nowSeconds = 1_798_997_600;
const signingKey = Buffer.from(webhookSecret.slice("whsec_".length), "base64");

export function signWebhook(rawBody: string, options: { id?: string; timestamp?: number; key?: Buffer } = {}) {
  const id = options.id ?? "msg_test_123";
  const timestamp = String(options.timestamp ?? nowSeconds);
  const key = options.key ?? signingKey;
  const signature = createHmac("sha256", key).update(`${id}.${timestamp}.${rawBody}`, "utf8").digest("base64");
  return {
    id,
    timestamp,
    signature: `v1,${Buffer.alloc(32, 0).toString("base64")} v1,${signature}`,
  };
}

export function loadResendWebhookService() {
  const deliveryEvents = loadTs<Record<string, (...args: never[]) => unknown>>(
    "src/modules/review-booster/services/delivery-events.service.ts",
    { "@/modules/review-booster/services/delivery-events-db.service": {} },
  );
  return loadTs<{
    createResendWebhookPost: (options: Record<string, unknown>) => (request: Request) => Promise<Response>;
    verifyResendWebhookSignature: (input: { rawBody: string; headers: Headers; secret: string; nowSeconds?: number }) => { valid: boolean; eventId?: string };
    RESEND_WEBHOOK_MAX_BODY_BYTES: number;
  }>("src/modules/review-booster/services/resend-webhook.service.ts", {
    "@/modules/review-booster/services/delivery-events.service": deliveryEvents,
  });
}

export function loadResendWebhookRoute(applyDeliveryEvent: (event: Record<string, unknown>) => Promise<Record<string, unknown>>) {
  const service = loadResendWebhookService();
  const handler = service.createResendWebhookPost({
    getSecret: () => webhookSecret,
    applyDeliveryEvent,
    nowSeconds: () => nowSeconds,
  });
  return loadTs<{ POST: (request: Request) => Promise<Response> }>("src/app/api/webhooks/resend/route.ts", {
    "@/modules/review-booster/services/delivery-events-db.service": { applyBoosterDeliveryEvent: applyDeliveryEvent },
    "@/modules/review-booster/services/resend-webhook.service": { createResendWebhookPost: () => handler },
  });
}

export function deliveryPayload(overrides: Record<string, unknown> = {}) {
  return {
    type: "email.bounced",
    created_at: "2026-10-03T12:00:00.000Z",
    data: {
      email_id: "resend-email-id-1",
      to: ["Customer@example.com"],
      tags: { ornigami_delivery_id: "2c6e5665-5f94-4e21-bbaa-f49fc04e2091" },
      bounce: { type: "Permanent" },
    },
    ...overrides,
  };
}

export function signedRequest(rawBody: string, options: { id?: string; timestamp?: number; headers?: Record<string, string> } = {}) {
  const signature = signWebhook(rawBody, options);
  return new Request("https://app.example/api/webhooks/resend", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "svix-id": signature.id,
      "svix-timestamp": signature.timestamp,
      "svix-signature": signature.signature,
      ...options.headers,
    },
    body: rawBody,
  });
}
