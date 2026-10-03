import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { assertBusinessOwner, BusinessAccessError, requireBusinessOwner } from "@/lib/business-context";
import { safeApiErrorResponse } from "@/lib/api-security";
import { isSameOriginMutation } from "@/lib/team-lifecycle";
import {
  createBookingCredential,
  isBookingCredentialId,
  listBookingCredentials,
  revokeBookingCredential,
} from "@/modules/review-booster/services/booking-intake.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function privateJson(payload: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("Cache-Control", "private, no-store");
  return NextResponse.json(payload, { ...init, headers });
}

async function ownerContext(request: Request, explicitBusinessId?: unknown) {
  const session = await auth();
  if (!session?.user?.id) throw new BusinessAccessError(401, "Authentication required.");
  const businessId = typeof explicitBusinessId === "string" ? explicitBusinessId : null;
  const context = await requireBusinessOwner(session.user.id, businessId);
  assertBusinessOwner(context);
  return { session, context };
}

export async function GET(request: Request) {
  try {
    const requestedIds = new URL(request.url).searchParams.getAll("business_id");
    if (requestedIds.length > 1 || (requestedIds.length === 1 && !UUID_RE.test(requestedIds[0]!))) {
      return privateJson({ error: "Invalid business_id." }, { status: 400 });
    }
    const businessId = requestedIds[0] ?? null;
    const { context } = await ownerContext(request, businessId);
    return privateJson({ credentials: await listBookingCredentials(context.businessId) });
  } catch (error) {
    return safeApiErrorResponse(error, "review_booster.booking_credentials.get");
  }
}

export async function POST(request: Request) {
  if (!isSameOriginMutation(request)) return NextResponse.json({ error: "Cross-origin request rejected." }, { status: 403 });
  let payload: unknown;
  try { payload = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 }); }
  const body = payload && typeof payload === "object" && !Array.isArray(payload) ? payload as Record<string, unknown> : {};
  const label = typeof body.label === "string" ? body.label.trim() : "";
  if (Object.hasOwn(body, "business_id") && (typeof body.business_id !== "string" || !UUID_RE.test(body.business_id))) {
    return privateJson({ error: "Invalid business_id." }, { status: 400 });
  }
  if (!label || label.length > 80) return privateJson({ error: "A credential label of 1 to 80 characters is required." }, { status: 400 });
  try {
    const { session, context } = await ownerContext(request, body.business_id);
    const credential = await createBookingCredential(context.businessId, session.user.id, label);
    return privateJson({ ...credential, created: true, secretShownOnce: true }, { status: 201 });
  } catch (error) {
    return safeApiErrorResponse(error, "review_booster.booking_credentials.post");
  }
}

export async function DELETE(request: Request) {
  if (!isSameOriginMutation(request)) return NextResponse.json({ error: "Cross-origin request rejected." }, { status: 403 });
  let payload: unknown;
  try { payload = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 }); }
  const body = payload && typeof payload === "object" && !Array.isArray(payload) ? payload as Record<string, unknown> : {};
  if (typeof body.credential_id !== "string" || !isBookingCredentialId(body.credential_id)) {
    return privateJson({ error: "A valid credential_id is required." }, { status: 400 });
  }
  if (Object.hasOwn(body, "business_id") && (typeof body.business_id !== "string" || !UUID_RE.test(body.business_id))) {
    return privateJson({ error: "Invalid business_id." }, { status: 400 });
  }
  try {
    const { session, context } = await ownerContext(request, body.business_id);
    const revoked = await revokeBookingCredential(context.businessId, session.user.id, body.credential_id);
    return revoked
      ? privateJson({ revoked: true })
      : privateJson({ error: "Credential not found or already revoked." }, { status: 404 });
  } catch (error) {
    return safeApiErrorResponse(error, "review_booster.booking_credentials.delete");
  }
}
