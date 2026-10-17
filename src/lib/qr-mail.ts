import { createHash } from "node:crypto";
import { getOptionalEnv } from "@/lib/env";

type MailPurpose = "booster_followup" | "auth_verification" | "password_reset" | "team_invitation" | "review_alert" | "public_demo_confirmation" | "public_demo_sample";

export type QrMailContext = {
  purpose: MailPurpose;
  businessId: string | null;
  candidateId: string;
  workKey: string;
  idempotencyKey: string;
  /** Bounded metadata only: never include recipient addresses, message bodies, tokens, or secrets. */
  transportContext?: Record<string, string | number | boolean | null>;
};

export class QrMailOutcomeUnknownError extends Error {
  constructor(message = "Mail provider outcome is unknown.") { super(message); this.name = "QrMailOutcomeUnknownError"; }
}

type Reservation = {
  reservation_ref: string; policy_id: number; provider: string; environment: string; account_binding: string;
  business_id: number; work_key: string; candidate_id: string; units: number; queue_snapshot_ref: string;
  idempotency_key: string; issued_at: string; expires_at: string; state: string; fence: number;
  replayed: boolean; quota_charged: boolean; capacity_held: boolean; retry_permitted: boolean;
};

function required(name: string): string {
  const value = getOptionalEnv(name as keyof import("@/lib/env").ServerEnv) as string | undefined;
  if (typeof value !== "string" || !value.trim()) throw new Error(`Mail authorization is not configured (${name}).`);
  return value.trim();
}

function config(purpose: MailPurpose) {
  if (getOptionalEnv("QR_MAIL_ENABLED") !== "true") throw new Error("Mail authorization is disabled.");
  const base = new URL(required("QR_MAIL_AUTHORITY_URL"));
  if (base.username || base.password || base.search || base.hash || (base.protocol !== "https:" && !(base.protocol === "http:" && ["localhost", "127.0.0.1", "::1"].includes(base.hostname)))) {
    throw new Error("Mail authorization endpoint is invalid.");
  }
  const group = purpose === "booster_followup" || purpose === "public_demo_sample" ? "BOOSTER" : "DIRECT";
  const policyId = Number(required(`QR_MAIL_${group}_POLICY_ID`));
  const businessId = Number(required(`QR_MAIL_${group}_BUSINESS_ID`));
  if (!Number.isSafeInteger(policyId) || policyId < 1 || !Number.isSafeInteger(businessId) || businessId < 1) throw new Error("Mail authorization numeric scope is invalid.");
  return {
    base: base.toString().replace(/\/$/, ""),
    token: required(`QR_MAIL_${group}_AUTHORITY_TOKEN`),
    sourceId: required(`QR_MAIL_${group}_SOURCE_ID`),
    sourceRevision: required(`QR_MAIL_${group}_SOURCE_REVISION`),
    sourceRef: required(`QR_MAIL_${group}_SOURCE_REF`),
    policyId,
    businessId,
    accountBinding: required(`QR_MAIL_${group}_ACCOUNT_BINDING`),
  };
}

export function qrMailConfigured(purpose: MailPurpose): boolean {
  try { config(purpose); return true; } catch { return false; }
}

async function call<T>(base: string, token: string, operation: string, body: unknown): Promise<T> {
  const bytes = JSON.stringify(body);
  if (Buffer.byteLength(bytes, "utf8") > 64 * 1024) throw new Error("Mail authorization request is too large.");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(`${base}/v1/mail/${operation}`, {
      method: "POST",
      redirect: "error",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: bytes,
      signal: controller.signal,
      cache: "no-store",
    });
    const reader = response.body?.getReader();
    if (!reader) throw new Error("Mail authorization returned an empty response.");
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 64 * 1024) { await reader.cancel(); throw new Error("Mail authorization response is too large."); }
      chunks.push(value);
    }
    if (!response.ok) throw new Error(`Mail authorization denied (${operation}, ${response.status}).`);
    const text = Buffer.concat(chunks).toString("utf8");
    let parsed: unknown;
    try { parsed = JSON.parse(text); } catch { throw new Error("Mail authorization returned an invalid response."); }
    if (!parsed || typeof parsed !== "object" || (parsed as { ok?: unknown }).ok !== true) throw new Error(`Mail authorization denied (${operation}).`);
    return parsed as T;
  } finally {
    clearTimeout(timer);
  }
}

async function boundedJson(response: Response, maxBytes: number): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Resend returned an empty response.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) { await reader.cancel(); throw new Error("Resend response is too large; outcome is unknown."); }
    chunks.push(value);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw new Error("Resend response is invalid; outcome is unknown."); }
}

/** Runs the durable QR authority immediately before handing an immutable request to Resend. */
export async function sendThroughQrAuthority<T>(input: {
  context: QrMailContext;
  payloadBytes: string;
  send: () => Promise<T>;
}): Promise<T> {
  const cfg = config(input.context.purpose);
  const transportContext = input.context.transportContext ?? {};
  if (Object.keys(transportContext).length > 32 || Buffer.byteLength(JSON.stringify(transportContext), "utf8") > 8 * 1024 || Object.entries(transportContext).some(([key, value]) =>
    !/^[A-Za-z0-9_]{1,64}$/.test(key) || /email|recipient|to|body|text|html|token|secret|password|content/i.test(key) ||
    (typeof value === "string" && !/^ref:[a-f0-9]{64}$/.test(value) && !/^[a-f0-9]{64}$/.test(value)) ||
    (typeof value === "number" && (!Number.isSafeInteger(value) || value < 0)) ||
    (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean"))) {
    throw new Error("Mail authorization transport context is invalid.");
  }
  const digest = createHash("sha256").update(input.payloadBytes, "utf8").digest("hex");
  const prepared = {
    authorization_id: `ref:${createHash("sha256").update(`${cfg.sourceId}:${input.context.purpose}:${input.context.workKey}`).digest("hex")}`,
    candidate_id: `ref:${createHash("sha256").update(`${cfg.sourceId}:${input.context.purpose}:${input.context.candidateId}`).digest("hex")}`,
    business_id: cfg.businessId,
    purpose: input.context.purpose,
    provider_policy_id: cfg.policyId,
    provider_account_binding: cfg.accountBinding,
    source_id: cfg.sourceId,
    source_revision: cfg.sourceRevision,
    source_ref: cfg.sourceRef,
    payload_digest: digest,
    transport_context: { ...transportContext, ...(input.context.businessId ? { native_business_ref: createHash("sha256").update(input.context.businessId).digest("hex") } : {}) },
  };
  const preflight = await call<{ snapshot: unknown }>(cfg.base, cfg.token, "preflight", {
    purpose: input.context.purpose,
    policy_id: cfg.policyId,
    business_id: cfg.businessId,
    candidate_id: prepared.candidate_id,
    account_binding: cfg.accountBinding,
  });
  if (!preflight.snapshot || typeof preflight.snapshot !== "object") throw new Error("Mail authorization preflight returned no snapshot.");
  const snapshot = preflight.snapshot as Record<string, unknown>;
  if (snapshot.policy_id !== cfg.policyId || snapshot.provider !== "resend" || snapshot.environment !== "live" || snapshot.business_id !== cfg.businessId || snapshot.account_binding !== cfg.accountBinding || snapshot.candidate_id !== prepared.candidate_id || snapshot.units !== 1 || typeof snapshot.queue_snapshot_ref !== "string" || typeof snapshot.reviewed_policy_ref !== "string" || !snapshot.mapping || !Array.isArray(snapshot.sources) || !Array.isArray(snapshot.windows) || !Number.isFinite(Date.parse(String(snapshot.checked_at))) || Date.parse(String(snapshot.expires_at)) <= Date.now()) {
    throw new Error("Mail authorization preflight scope does not match.");
  }
  const reserved = await call<{ reservation: Reservation }>(cfg.base, cfg.token, "reserve", {
    purpose: input.context.purpose,
    snapshot,
    work_key: prepared.authorization_id,
    idempotency_key: `ref:${createHash("sha256").update(`${cfg.sourceId}:${input.context.purpose}:${input.context.idempotencyKey}`).digest("hex")}`,
    units: 1,
  });
  const reservation = reserved.reservation;
  if (!reservation || typeof reservation.reservation_ref !== "string" || !/^ref:[0-9a-f-]{36}$/i.test(reservation.reservation_ref) || !Number.isSafeInteger(reservation.fence) || reservation.fence < 1) {
    throw new Error("Mail authorization returned an invalid reservation.");
  }
  const expectedIdempotency = `ref:${createHash("sha256").update(`${cfg.sourceId}:${input.context.purpose}:${input.context.idempotencyKey}`).digest("hex")}`;
  const validReservation = (value: Reservation, expectedFence?: number, expectedCapacityHeld = true) => value.reservation_ref === reservation.reservation_ref &&
    value.policy_id === cfg.policyId && value.provider === "resend" && value.environment === "live" &&
    value.account_binding === cfg.accountBinding && value.business_id === cfg.businessId && value.work_key === prepared.authorization_id &&
    value.candidate_id === prepared.candidate_id && value.units === 1 && value.queue_snapshot_ref === snapshot.queue_snapshot_ref &&
    value.idempotency_key === expectedIdempotency && Number.isSafeInteger(value.fence) && value.fence >= 1 &&
    (!expectedFence || value.fence > expectedFence) && value.replayed === false && value.quota_charged === true &&
    value.capacity_held === expectedCapacityHeld && value.retry_permitted === false && Date.parse(value.issued_at) <= Date.now() && Date.parse(value.expires_at) > Date.now();
  if (!validReservation(reservation) || reservation.state !== "reserved") {
    throw new Error("Mail authorization reservation scope does not match.");
  }
  const settle = async (outcome: "sent" | "unknown" | "cancelled_before_handoff") => {
    const result = await call<{ reservation: Reservation }>(cfg.base, cfg.token, "settle", { purpose: input.context.purpose, reservation_ref: reservation.reservation_ref, fence, outcome });
    const expectedState = outcome === "sent" ? "sent" : outcome === "unknown" ? "unknown" : "cancelled";
    const expectedCapacityHeld = outcome === "unknown";
    const updated = result.reservation;
    if (!updated || !validReservation(updated, undefined, expectedCapacityHeld) || updated.fence !== fence || updated.state !== expectedState || updated.retry_permitted !== false) {
      throw new Error("Mail authorization settlement could not be confirmed.");
    }
  };
  const expiresAt = Date.parse(reservation.expires_at);
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now() + 12_000) {
    await settle("cancelled_before_handoff").catch(() => undefined);
    throw new Error("Mail authorization reservation expires too soon.");
  }
  let fence = reservation.fence;
  try {
    const verified = await call<{ verified: boolean }>(cfg.base, cfg.token, "verify", { purpose: input.context.purpose, reservation_ref: reservation.reservation_ref, fence, prepared });
    if (verified.verified !== true) throw new Error("Mail authorization verification failed.");
  } catch (error) {
    await settle("cancelled_before_handoff").catch(() => undefined);
    throw error;
  }
  const handed = await call<{ reservation: Reservation }>(cfg.base, cfg.token, "handoff", { purpose: input.context.purpose, reservation_ref: reservation.reservation_ref, fence });
  if (!handed.reservation || !validReservation(handed.reservation, fence) || handed.reservation.state !== "handoff") {
    await settle("cancelled_before_handoff").catch(() => undefined);
    throw new Error("Mail authorization returned an invalid handoff fence.");
  }
  fence = handed.reservation.fence;
  try {
    const finalVerification = await call<{ verified: boolean }>(cfg.base, cfg.token, "verify", { purpose: input.context.purpose, reservation_ref: reservation.reservation_ref, fence, prepared });
    if (finalVerification.verified !== true) throw new Error("Mail authorization verification failed.");
  } catch (error) {
    await settle("unknown").catch(() => undefined);
    throw error;
  }
  let result: T;
  try {
    result = await input.send();
  } catch (error) {
    await settle("unknown").catch(() => undefined);
    throw new QrMailOutcomeUnknownError(error instanceof Error ? error.message : undefined);
  }
  try {
    await settle("sent");
  } catch {
    // Provider acceptance without confirmed authority settlement is terminal/unknown to the caller.
    throw new QrMailOutcomeUnknownError("Provider accepted the email but mail authorization settlement is unknown.");
  }
  return result;
}

/** The only shared Resend transport; provider I/O remains behind the durable authority fence. */
export async function sendAuthorizedResend(payloadBytes: string, context: QrMailContext, signal?: AbortSignal): Promise<string> {
  const apiKey = required("RESEND_API_KEY");
  return sendThroughQrAuthority({
    context, payloadBytes,
    send: async () => {
      const timeout = AbortSignal.timeout(10_000);
      const requestSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST", redirect: "error",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "Idempotency-Key": context.idempotencyKey },
        body: payloadBytes, signal: requestSignal,
      });
      let data: unknown;
      try { data = await boundedJson(response, 16 * 1024); } catch { throw new Error(`Resend outcome is unknown (${response.status}).`); }
      const record = data && typeof data === "object" ? data as { id?: unknown } : {};
      if (!response.ok || typeof record.id !== "string" || !record.id.trim()) throw new Error(`Resend outcome is unknown (${response.status}).`);
      return record.id;
    },
  });
}
