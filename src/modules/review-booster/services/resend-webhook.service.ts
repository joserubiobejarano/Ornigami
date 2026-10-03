import { createHmac, timingSafeEqual } from "node:crypto";
import { parseResendDeliveryEvent, type NormalizedResendWebhookDeliveryEvent } from "@/modules/review-booster/services/delivery-events.service";

export const RESEND_WEBHOOK_MAX_BODY_BYTES = 128 * 1024;
export const RESEND_WEBHOOK_TOLERANCE_SECONDS = 300;

export type DeliveryEventApplyResult = {
  kind: "applied" | "duplicate" | "conflict" | "unmatched" | "invalid";
  deliveryId?: string;
  deliveryState?: string;
  status?: string;
};

export type ApplyDeliveryEvent = (event: {
  eventId: string;
  type: "email.sent" | "email.delivered" | "email.bounced" | "email.complained" | "email.failed" | "email.suppressed" | "email.delivery_delayed";
  createdAt: string;
  providerMessageId: string;
  deliveryId: string | null;
  recipients: string[];
  evidenceSource: "webhook";
}) => Promise<DeliveryEventApplyResult>;

export type ResendWebhookHandlerOptions = {
  getSecret?: () => string | undefined;
  applyDeliveryEvent: ApplyDeliveryEvent;
  nowSeconds?: () => number;
  requestBodyTimeoutMs?: number;
};

type WebhookHeaders = { id: string; timestamp: string; signature: string };

function readHeaderPair(headers: Headers, svix: string, standard: string): string | null {
  const svixValue = headers.get(`svix-${svix}`);
  const standardValue = headers.get(`webhook-${standard}`);
  if (svixValue && standardValue && svixValue !== standardValue) return null;
  return svixValue ?? standardValue;
}

function readWebhookHeaders(headers: Headers): WebhookHeaders | null {
  const id = readHeaderPair(headers, "id", "id");
  const timestamp = readHeaderPair(headers, "timestamp", "timestamp");
  const signature = readHeaderPair(headers, "signature", "signature");
  if (!id || !timestamp || !signature) return null;
  if (id.length > 256 || id.includes(".") || !/^[\x21-\x7e]+$/.test(id)) return null;
  if (!/^\d{1,12}$/.test(timestamp)) return null;
  return { id, timestamp, signature };
}

function decodeSigningSecret(secret: string): Buffer | null {
  const serialized = secret.startsWith("whsec_") ? secret.slice(6) : "";
  if (!serialized || !/^[A-Za-z0-9+/]+={0,2}$/.test(serialized)) return null;
  const key = Buffer.from(serialized, "base64");
  return key.length >= 24 && key.toString("base64").replace(/=+$/, "") === serialized.replace(/=+$/, "") ? key : null;
}

export function verifyResendWebhookSignature(input: {
  rawBody: string;
  headers: Headers;
  secret: string;
  nowSeconds?: number;
}): { valid: true; eventId: string } | { valid: false } {
  const key = decodeSigningSecret(input.secret);
  const metadata = readWebhookHeaders(input.headers);
  if (!key || !metadata) return { valid: false };
  const timestampSeconds = Number(metadata.timestamp);
  const nowSeconds = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (!Number.isSafeInteger(timestampSeconds) || Math.abs(nowSeconds - timestampSeconds) > RESEND_WEBHOOK_TOLERANCE_SECONDS) {
    return { valid: false };
  }

  const signedContent = Buffer.from(`${metadata.id}.${metadata.timestamp}.${input.rawBody}`, "utf8");
  const expected = createHmac("sha256", key).update(signedContent).digest();
  const candidates = metadata.signature.trim().split(/\s+/);
  let matched = false;
  for (const candidate of candidates) {
    const parts = candidate.split(",");
    if (parts.length !== 2 || parts[0] !== "v1" || !/^[A-Za-z0-9+/]+={0,2}$/.test(parts[1])) continue;
    const actual = Buffer.from(parts[1], "base64");
    if (actual.length !== expected.length) continue;
    matched = timingSafeEqual(expected, actual) || matched;
  }
  return matched ? { valid: true, eventId: metadata.id } : { valid: false };
}

async function readBoundedBody(request: Request, timeoutMs = 10_000): Promise<string | "too_large" | "invalid_utf8" | "timeout" | "read_error"> {
  const declaredLength = request.headers.get("content-length");
  if (declaredLength && (!/^\d+$/.test(declaredLength) || Number(declaredLength) > RESEND_WEBHOOK_MAX_BODY_BYTES)) return "too_large";
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  const deadline = Date.now() + timeoutMs;
  try {
    while (true) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        void reader.cancel().catch(() => undefined);
        return "timeout";
      }
      let timer: ReturnType<typeof setTimeout> | undefined;
      let read: ReadableStreamReadResult<Uint8Array>;
      try {
        read = await Promise.race([
          reader.read(),
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new Error("body_read_timeout")), remaining);
          }),
        ]);
      } catch (error) {
        void reader.cancel().catch(() => undefined);
        return error instanceof Error && error.message === "body_read_timeout" ? "timeout" : "read_error";
      } finally {
        if (timer) clearTimeout(timer);
      }
      const { done, value } = read;
      if (done) break;
      byteLength += value.byteLength;
      if (byteLength > RESEND_WEBHOOK_MAX_BODY_BYTES) {
        void reader.cancel().catch(() => undefined);
        return "too_large";
      }
      chunks.push(value);
    }
  } finally {
    try { reader.releaseLock(); } catch { /* a cancelled reader may still be settling */ }
  }
  try {
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))));
  } catch {
    return "invalid_utf8";
  }
}

function response(message: string, status: number): Response {
  return Response.json({ error: message }, { status });
}

/** Shared handler factory keeps route behavior directly testable without importing Next runtime internals. */
export function createResendWebhookPost(options: ResendWebhookHandlerOptions) {
  return async function POST(request: Request): Promise<Response> {
    let secret: string | undefined;
    try { secret = options.getSecret?.() ?? process.env.RESEND_WEBHOOK_SECRET; } catch { secret = undefined; }
    if (!secret) return response("Webhook processing is unavailable.", 503);

    let read: Awaited<ReturnType<typeof readBoundedBody>>;
    try { read = await readBoundedBody(request, options.requestBodyTimeoutMs); }
    catch { return response("Request body could not be read.", 400); }
    if (read === "too_large") return response("Request body is too large.", 413);
    if (read === "invalid_utf8") return response("Request body must be valid UTF-8.", 400);
    if (read === "timeout") return response("Request body could not be read in time.", 408);
    if (read === "read_error") return response("Request body could not be read.", 400);

    const verification = verifyResendWebhookSignature({
      rawBody: read,
      headers: request.headers,
      secret,
      nowSeconds: options.nowSeconds?.(),
    });
    if (!verification.valid) return response("Invalid webhook signature.", 401);

    let payload: unknown;
    try { payload = JSON.parse(read); }
    catch { return response("Invalid JSON body.", 400); }

    const event = parseResendDeliveryEvent(payload, verification.eventId);
    if (!event) return response("Invalid delivery event.", 400);
    if (event.kind === "ignore") return Response.json({ ok: true, ignored: event.reason });

    try {
      const result = await options.applyDeliveryEvent(event.event as NormalizedResendWebhookDeliveryEvent);
      if (result.kind === "applied" || result.kind === "duplicate") {
        return Response.json({ ok: true, duplicate: result.kind === "duplicate" });
      }
      if (result.kind === "unmatched" && !event.hasBoosterDeliveryTag) {
        return Response.json({ ok: true, ignored: "unmatched_provider_event" });
      }
      return response("Delivery event is awaiting reconciliation.", 503);
    } catch {
      return response("Delivery event could not be processed.", 503);
    }
  };
}
