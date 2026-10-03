import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { sql } from "@/lib/db/neon";
import { decryptToken, encryptToken } from "@/lib/encrypted-token";
import { isValidCustomerEmail, isValidCustomerPhone, normalizeVisitedAt } from "@/modules/review-booster/services/intake-input.service";

export const BOOKING_MAX_BODY_BYTES = 64 * 1024;
export const BOOKING_MAX_CLOCK_SKEW_SECONDS = 5 * 60;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SOURCE_RE = /^[a-z0-9][a-z0-9._-]{0,39}$/i;

export type BookingEvent = {
  source: string;
  event_type: string;
  external_id: string;
  customer_name?: string | null;
  customer_email?: string | null;
  customer_phone?: string | null;
  service_name?: string | null;
  visited_at?: string | null;
};

export type BookingCredential = { id: string; business_id: string; secret: string };

export function newBookingCredentialSecret(): string {
  return randomBytes(32).toString("base64url");
}

export function bookingSignature(secret: string, timestamp: string, rawBody: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${rawBody}`, "utf8").digest("hex");
}

export function verifyBookingSignature(input: {
  secret: string;
  timestamp: string;
  rawBody: string;
  signature: string;
  nowSeconds?: number;
}): boolean {
  if (!/^\d{10}$/.test(input.timestamp) || !/^(?:sha256=)?[0-9a-f]{64}$/i.test(input.signature)) return false;
  const timestamp = Number(input.timestamp);
  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (!Number.isSafeInteger(timestamp) || Math.abs(now - timestamp) > BOOKING_MAX_CLOCK_SKEW_SECONDS) return false;
  const supplied = input.signature.replace(/^sha256=/i, "");
  const expected = bookingSignature(input.secret, input.timestamp, input.rawBody);
  return timingSafeEqual(Buffer.from(supplied, "hex"), Buffer.from(expected, "hex"));
}

export function validateBookingEvent(value: unknown): BookingEvent | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const payload = value as Record<string, unknown>;
  if ("business_id" in payload || "businessId" in payload) return null;
  if (typeof payload.source !== "string" || !SOURCE_RE.test(payload.source)) return null;
  if (payload.source.toLowerCase() === "csv") return null;
  if (typeof payload.event_type !== "string" || !/^[a-z][a-z0-9._-]{0,79}$/i.test(payload.event_type)) return null;
  if (typeof payload.external_id !== "string" || !payload.external_id.trim() || payload.external_id.length > 200) return null;
  const optionalText = (key: string, max: number): string | null | undefined => {
    const item = payload[key];
    if (item == null) return item as null | undefined;
    if (typeof item !== "string" || item.length > max) return undefined;
    return item.trim() || null;
  };
  const customerName = optionalText("customer_name", 120);
  const customerEmail = optionalText("customer_email", 254);
  const customerPhone = optionalText("customer_phone", 32);
  const serviceName = optionalText("service_name", 120);
  const rawVisitedAt = optionalText("visited_at", 64);
  const visitedAt = rawVisitedAt ? normalizeVisitedAt(rawVisitedAt) : rawVisitedAt;
  if ([customerName, customerEmail, customerPhone, serviceName, rawVisitedAt].some((item, index) => item === undefined && payload[["customer_name", "customer_email", "customer_phone", "service_name", "visited_at"][index]] != null)) return null;
  if (rawVisitedAt && !visitedAt) return null;
  if (customerEmail && !isValidCustomerEmail(customerEmail)) return null;
  if (customerPhone && !isValidCustomerPhone(customerPhone)) return null;
  const eventType = payload.event_type.toLowerCase();
  if (!["appointment.completed", "booking.completed"].includes(eventType) || !visitedAt || (!customerEmail && !customerPhone)) return null;
  return {
    source: payload.source.toLowerCase(),
    event_type: eventType,
    external_id: payload.external_id.trim(),
    customer_name: customerName,
    customer_email: customerEmail,
    customer_phone: customerPhone,
    service_name: serviceName,
    visited_at: visitedAt,
  };
}

export async function getBookingCredential(id: string): Promise<BookingCredential | null> {
  if (!UUID_RE.test(id)) return null;
  const rows = await sql`
    SELECT id, business_id, encrypted_secret
    FROM public.booster_booking_credentials
    WHERE id = ${id} AND revoked_at IS NULL
  `;
  const row = rows[0] as { id: string; business_id: string; encrypted_secret: string } | undefined;
  if (!row) return null;
  return { id: row.id, business_id: row.business_id, secret: decryptToken(row.encrypted_secret).value };
}

export async function admitBookingEvent(credentialId: string, event: BookingEvent): Promise<"created" | "duplicate" | "unauthorized" | "inactive" | "invalid"> {
  const rows = await sql`
    SELECT public.admit_booster_booking_event(
      ${credentialId}::uuid, ${event.source}, ${event.event_type}, ${event.external_id},
      ${event.customer_name ?? null}, ${event.customer_email ?? null}, ${event.customer_phone ?? null},
      ${event.service_name ?? null}, ${event.visited_at ?? null}::timestamptz
    ) AS result
  `;
  const result = (rows[0] as { result?: unknown } | undefined)?.result;
  if (result === "created" || result === "duplicate" || result === "inactive" || result === "invalid") return result;
  return "unauthorized";
}

export async function createBookingCredential(businessId: string, actorUserId: string, label: string): Promise<{ id: string; secret: string }> {
  const secret = newBookingCredentialSecret();
  const rows = await sql`
    SELECT public.create_booster_booking_credential(
      ${businessId}::uuid, ${actorUserId}::uuid, ${label}, ${encryptToken(secret)}
    ) AS id
  `;
  const id = (rows[0] as { id?: unknown } | undefined)?.id;
  if (typeof id !== "string") throw new Error("Booking credential could not be created.");
  return { id, secret };
}

export async function listBookingCredentials(businessId: string) {
  const rows = await sql`
    SELECT id, label, created_at, last_used_at, revoked_at
    FROM public.booster_booking_credentials WHERE business_id = ${businessId}
    ORDER BY created_at DESC, id DESC
  `;
  return rows;
}

export async function revokeBookingCredential(businessId: string, actorUserId: string, credentialId: string): Promise<boolean> {
  const rows = await sql`
    SELECT public.revoke_booster_booking_credential(
      ${businessId}::uuid, ${actorUserId}::uuid, ${credentialId}::uuid
    ) AS revoked
  `;
  return (rows[0] as { revoked?: unknown } | undefined)?.revoked === true;
}

export function isBookingCredentialId(value: string): boolean { return UUID_RE.test(value); }
