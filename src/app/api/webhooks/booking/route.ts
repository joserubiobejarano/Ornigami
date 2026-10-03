import { NextResponse } from "next/server";
import {
  BOOKING_MAX_BODY_BYTES,
  admitBookingEvent,
  getBookingCredential,
  validateBookingEvent,
  verifyBookingSignature,
} from "@/modules/review-booster/services/booking-intake.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function readBoundedBody(request: Request): Promise<string | null> {
  const declaredLength = request.headers.get("content-length");
  if (declaredLength && (!/^\d+$/.test(declaredLength) || Number(declaredLength) > BOOKING_MAX_BODY_BYTES)) return null;
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > BOOKING_MAX_BODY_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))));
}

export async function POST(request: Request) {
  const credentialId = request.headers.get("x-booking-key-id") ?? "";
  const timestamp = request.headers.get("x-booking-timestamp") ?? "";
  const signature = request.headers.get("x-booking-signature") ?? "";
  let credential: Awaited<ReturnType<typeof getBookingCredential>>;
  try { credential = await getBookingCredential(credentialId); }
  catch { return NextResponse.json({ error: "Booking event could not be processed." }, { status: 503 }); }
  if (!credential) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let rawBody: string;
  try {
    const body = await readBoundedBody(request);
    if (body == null) return NextResponse.json({ error: "Request body is too large or invalid." }, { status: 413 });
    rawBody = body;
  } catch {
    return NextResponse.json({ error: "Request body must be valid UTF-8." }, { status: 400 });
  }
  if (!verifyBookingSignature({ secret: credential.secret, timestamp, rawBody, signature })) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let parsed: unknown;
  try { parsed = JSON.parse(rawBody); }
  catch { return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 }); }
  const event = validateBookingEvent(parsed);
  if (!event) return NextResponse.json({ error: "Invalid booking event." }, { status: 400 });

  try {
    const result = await admitBookingEvent(credential.id, event);
    if (result === "unauthorized") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (result === "inactive") return NextResponse.json({ error: "Review Booster is not active for this business." }, { status: 403 });
    if (result === "invalid") return NextResponse.json({ error: "Invalid booking event." }, { status: 400 });
    return NextResponse.json({ ok: true, duplicate: result === "duplicate", visitCreated: result === "created" });
  } catch {
    return NextResponse.json({ error: "Booking event could not be processed." }, { status: 503 });
  }
}
