import { getRequiredEnv } from "@/lib/env";
import {
  getBoosterDeliveryReconciliationContext,
  applyBoosterDeliveryEvent,
  type NormalizedBoosterDeliveryEvent,
} from "@/modules/review-booster/services/delivery-events-db.service";

const MAX_PROVIDER_RESPONSE_BYTES = 256 * 1024;
const LOOKUP_TIMEOUT_MS = 10_000;
const RESEND_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type FrozenPayload = {
  from?: unknown;
  to?: unknown;
  subject?: unknown;
  text?: unknown;
  html?: unknown;
  tags?: unknown;
};

export type ResendEmailLookup = {
  id: string;
  to: string[];
  from: string;
  subject: string;
  html: string | null;
  text: string | null;
  tags: Array<{ name: string; value: string }>;
  last_event: string;
};

export type ReconciliationResult =
  | { kind: "resolved"; deliveryId: string; deliveryState: string; deliveryStatus: string | null }
  | { kind: "already_resolved"; deliveryId: string; deliveryState: string; deliveryStatus: string | null }
  | { kind: "not_found" | "not_reconcilable" | "missing_provider_id" | "provider_not_found" | "provider_unavailable" | "provider_response_invalid" | "identity_mismatch" | "provider_status_unconfirmed" | "conflict" | "unresolved" };

type ReconciliationContext = {
  deliveryId: string;
  businessId: string;
  state: string;
  deliveryStatus: string | null;
  providerMessageId: string | null;
  payload: FrozenPayload | null;
  currentRecipient: string | null;
  currentStatus: string | null;
  leaseUntil?: string | Date | null;
};

type ResendReconciliationDependencies = {
  loadContext: typeof getBoosterDeliveryReconciliationContext;
  applyEvent: typeof applyBoosterDeliveryEvent;
  lookup: (providerMessageId: string) => Promise<ResendEmailLookup | null>;
  now: () => Date;
};

function normalizedEmail(value: string): string {
  return value.trim().toLowerCase();
}

function recipientFromPayload(value: unknown): string | null {
  const recipients = typeof value === "string" ? [value] : Array.isArray(value) ? value : [];
  if (recipients.length !== 1 || typeof recipients[0] !== "string" || !recipients[0].trim()) return null;
  return recipients[0];
}

function tagMatches(tags: unknown, deliveryId: string): boolean {
  if (!Array.isArray(tags)) return false;
  const matches = tags.filter((tag) => tag && typeof tag === "object" &&
    (tag as { name?: unknown }).name === "ornigami_delivery_id");
  return matches.length === 1 && (matches[0] as { value?: unknown }).value === deliveryId;
}

function lookupMatchesDelivery(email: ResendEmailLookup, context: ReconciliationContext, submittedId: string, storedIdIsTrusted: boolean): boolean {
  const payload = context.payload;
  if (email.id !== submittedId) return false;
  if (!payload) {
    // A previously persisted Resend ID is durable evidence from the original
    // successful send. The DB adapter also checks its provider-ID/recipient
    // correlation hash when the payload has been privacy-cleared.
    return storedIdIsTrusted && Boolean(context.currentRecipient) && email.to.length === 1 &&
      normalizedEmail(email.to[0]) === normalizedEmail(context.currentRecipient!);
  }
  if (!tagMatches(email.tags, context.deliveryId) || !tagMatches(payload.tags, context.deliveryId)) return false;
  if (typeof payload.from !== "string" || email.from !== payload.from) return false;
  if (typeof payload.subject !== "string" || email.subject !== payload.subject) return false;
  const expectedRecipient = recipientFromPayload(payload.to);
  if (!expectedRecipient || email.to.length !== 1 || normalizedEmail(email.to[0]) !== normalizedEmail(expectedRecipient)) return false;
  if (!context.currentRecipient || normalizedEmail(context.currentRecipient) !== normalizedEmail(expectedRecipient)) return false;

  // The retrieve API may return null for plain text. Every returned body form
  // must agree with the frozen request, and at least one exact form is required.
  let bodyMatched = false;
  if (email.html !== null) {
    if (typeof payload.html !== "string" || email.html !== payload.html) return false;
    bodyMatched = true;
  }
  if (email.text !== null) {
    if (typeof payload.text !== "string" || email.text !== payload.text) return false;
    bodyMatched = true;
  }
  return bodyMatched;
}

function eventType(lastEvent: string): NormalizedBoosterDeliveryEvent["type"] | null {
  switch (lastEvent) {
    case "sent": return "email.sent";
    case "delivered": return "email.delivered";
    case "bounced": return "email.bounced";
    case "complained": return "email.complained";
    case "failed": return "email.failed";
    case "suppressed": return "email.suppressed";
    case "delivery_delayed": return "email.delivery_delayed";
    // These snapshots prove the provider created/accepted the immutable email
    // object, but are not delivery evidence. Preserve quota at the conservative
    // accepted/sent level rather than rendering them as delivered.
    case "opened":
    case "clicked":
    case "queued":
    case "scheduled":
    case "canceled": return "email.sent";
    default: return null;
  }
}

function isLookup(value: unknown): value is ResendEmailLookup {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return typeof row.id === "string" && Array.isArray(row.to) && row.to.every((item) => typeof item === "string") &&
    typeof row.from === "string" && typeof row.subject === "string" &&
    (typeof row.html === "string" || row.html === null) &&
    (typeof row.text === "string" || row.text === null) &&
    Array.isArray(row.tags) && row.tags.every((tag) => tag && typeof tag === "object" &&
      typeof (tag as Record<string, unknown>).name === "string" && typeof (tag as Record<string, unknown>).value === "string") &&
    typeof row.last_event === "string";
}

async function readBoundedJson(response: Response, timeoutMs: number): Promise<unknown> {
  const announcedLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(announcedLength) && announcedLength > MAX_PROVIDER_RESPONSE_BYTES) throw new Error("provider_response_too_large");
  if (!response.body) throw new Error("provider_response_empty");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  const deadline = Date.now() + timeoutMs;
  try {
    while (true) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        void reader.cancel().catch(() => undefined);
        throw new Error("provider_response_timeout");
      }
      let timer: ReturnType<typeof setTimeout> | undefined;
      let result: ReadableStreamReadResult<Uint8Array>;
      try {
        result = await Promise.race([
          reader.read(),
          new Promise<never>((_resolve, reject) => {
            timer = setTimeout(() => reject(new Error("provider_response_timeout")), remaining);
          }),
        ]);
      } catch (error) {
        void reader.cancel().catch(() => undefined);
        throw error instanceof Error && error.message === "provider_response_timeout" ? error : new Error("provider_response_read_error");
      } finally {
        if (timer) clearTimeout(timer);
      }
      const { done, value } = result;
      if (done) break;
      total += value.byteLength;
      if (total > MAX_PROVIDER_RESPONSE_BYTES) {
        void reader.cancel().catch(() => undefined);
        throw new Error("provider_response_too_large");
      }
      chunks.push(value);
    }
  } finally {
    try { reader.releaseLock(); } catch { /* a timed-out read may still be settling */ }
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder().decode(body)) as unknown;
}

/** Performs one bounded authenticated GET; all failures remain unresolved. */
export async function lookupResendEmail(providerMessageId: string, timeoutMs = LOOKUP_TIMEOUT_MS): Promise<ResendEmailLookup | null> {
  const apiKey = getRequiredEnv("RESEND_API_KEY");
  const controller = new AbortController();
  const startedAt = Date.now();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`https://api.resend.com/emails/${encodeURIComponent(providerMessageId)}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: "no-store",
      signal: controller.signal,
    });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`resend_lookup_http_${response.status}`);
    const value = await readBoundedJson(response, Math.max(0, timeoutMs - (Date.now() - startedAt)));
    if (!isLookup(value)) throw new Error("resend_lookup_malformed_response");
    return value;
  } finally {
    clearTimeout(timer);
  }
}

const defaultDependencies: ResendReconciliationDependencies = {
  loadContext: getBoosterDeliveryReconciliationContext,
  applyEvent: applyBoosterDeliveryEvent,
  lookup: lookupResendEmail,
  now: () => new Date(),
};

/**
 * Reconciles only positive provider evidence. A miss, timeout, stale state, or
 * identity mismatch never releases quota or changes the frozen send key.
 */
export async function reconcileBoosterDelivery(input: {
  businessId: string;
  deliveryId: string;
  providerMessageId?: string | null;
}, dependencies: ResendReconciliationDependencies = defaultDependencies): Promise<ReconciliationResult> {
  const context = await dependencies.loadContext({ businessId: input.businessId, deliveryId: input.deliveryId }) as ReconciliationContext | null;
  if (!context) return { kind: "not_found" };
  if (context.businessId !== input.businessId || context.deliveryId !== input.deliveryId) return { kind: "not_found" };
  if (context.state === "accepted") return { kind: "already_resolved", deliveryId: context.deliveryId, deliveryState: context.state, deliveryStatus: context.deliveryStatus };
  if (context.state !== "reconciliation_required" && context.state !== "unknown") return { kind: "not_reconcilable" };

  const leaseUntil = context.leaseUntil == null ? null : new Date(context.leaseUntil).getTime();
  if (context.state === "unknown") {
    if (leaseUntil === null || !Number.isFinite(leaseUntil) || leaseUntil > dependencies.now().getTime()) {
      return { kind: "not_reconcilable" };
    }
  }

  const suppliedId = input.providerMessageId?.trim() || null;
  const providerMessageId = context.providerMessageId ?? suppliedId;
  if (!providerMessageId) return { kind: "missing_provider_id" };
  if (!RESEND_ID_RE.test(providerMessageId) || (context.providerMessageId && suppliedId && suppliedId !== context.providerMessageId)) {
    return { kind: "identity_mismatch" };
  }

  let email: ResendEmailLookup | null;
  try {
    email = await dependencies.lookup(providerMessageId);
  } catch {
    return { kind: "provider_unavailable" };
  }
  if (!email) return { kind: "provider_not_found" };
  if (!isLookup(email)) return { kind: "provider_response_invalid" };
  if (!lookupMatchesDelivery(email, context, providerMessageId, context.providerMessageId === providerMessageId)) return { kind: "identity_mismatch" };

  const type = eventType(email.last_event);
  if (!type) return { kind: "provider_status_unconfirmed" };
  const observedAt = dependencies.now().toISOString();
  const event: NormalizedBoosterDeliveryEvent = {
    eventId: `lookup:${providerMessageId}:${type}:${observedAt}`,
    type,
    createdAt: observedAt,
    providerMessageId,
    deliveryId: context.deliveryId,
    recipients: email.to,
    evidenceSource: "provider_lookup",
  };
  const result = await dependencies.applyEvent(event);
  if (result.kind === "conflict" || result.kind === "invalid" || result.kind === "unmatched") return { kind: "conflict" };
  if (result.kind !== "applied" && result.kind !== "duplicate") return { kind: "unresolved" };
  if (result.state !== "accepted") return { kind: "unresolved" };
  return {
    kind: result.kind === "duplicate" ? "already_resolved" : "resolved",
    deliveryId: context.deliveryId,
    deliveryState: result.state,
    deliveryStatus: result.deliveryStatus ?? null,
  };
}
