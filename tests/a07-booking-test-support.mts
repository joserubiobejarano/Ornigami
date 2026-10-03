import { createHmac } from "node:crypto";
import { loadTs } from "./a02-test-support.mts";

export function bookingSignature(secret: string, timestamp: string, rawBody: string) {
  return createHmac("sha256", secret).update(`${timestamp}.${rawBody}`, "utf8").digest("hex");
}

export function loadBookingModule() {
  const inputs = loadTs<Record<string, (...args: unknown[]) => unknown>>("src/modules/review-booster/services/intake-input.service.ts", {});
  return loadTs<{
    verifyBookingSignature: (input: { secret: string; timestamp: string; rawBody: string; signature: string; nowSeconds?: number }) => boolean;
    validateBookingEvent: (value: unknown) => Record<string, unknown> | null;
  }>("src/modules/review-booster/services/booking-intake.service.ts", {
    "@/lib/db/neon": { sql: async () => [] },
    "@/lib/encrypted-token": { encryptToken: (value: string) => `encrypted:${value}`, decryptToken: (value: string) => ({ value: value.replace(/^encrypted:/, ""), legacy: false }) },
    "@/modules/review-booster/services/intake-input.service": inputs,
  });
}

export function routeRequest(service: Record<string, unknown>) {
  return loadTs<{ POST: (request: Request) => Promise<Response> }>("src/app/api/webhooks/booking/route.ts", {
    "next/server": { NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) } },
    "@/modules/review-booster/services/booking-intake.service": service,
  });
}
