import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { safeApiErrorResponse } from "@/lib/api-security";
import { requireBusinessOwner } from "@/lib/business-context";
import { isSameOriginMutation } from "@/lib/team-lifecycle";
import { readBoundedReconciliationRequestBody } from "@/modules/review-booster/services/reconciliation-request-body.service";
import { reconcileBoosterDelivery } from "@/modules/review-booster/services/resend-reconciliation.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_BODY_BYTES = 2048;

function objectBody(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function responseForResult(result: Awaited<ReturnType<typeof reconcileBoosterDelivery>>) {
  switch (result.kind) {
    case "resolved":
    case "already_resolved":
      return NextResponse.json({ status: result.kind, deliveryState: result.deliveryState, deliveryStatus: result.deliveryStatus });
    case "not_found":
      return NextResponse.json({ error: "Delivery not found." }, { status: 404 });
    case "identity_mismatch":
      return NextResponse.json({ error: "Provider email could not be bound to this delivery." }, { status: 409 });
    case "not_reconcilable":
      return NextResponse.json({ error: "This delivery is not ready for reconciliation." }, { status: 409 });
    case "missing_provider_id":
    case "provider_not_found":
    case "provider_unavailable":
    case "provider_response_invalid":
    case "provider_status_unconfirmed":
    case "conflict":
    case "unresolved":
      return NextResponse.json({ status: "unresolved", reason: result.kind }, { status: 202 });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ deliveryId: string }> }) {
  if (!isSameOriginMutation(request)) return NextResponse.json({ error: "Cross-origin request rejected." }, { status: 403 });
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Request body is too large." }, { status: 413 });
  }
  let body: Record<string, unknown> | null;
  try {
    const text = await readBoundedReconciliationRequestBody(request, MAX_BODY_BYTES);
    body = objectBody(JSON.parse(text) as unknown);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "body_too_large") return NextResponse.json({ error: "Request body is too large." }, { status: 413 });
    if (message === "body_timeout") return NextResponse.json({ error: "Request body timed out." }, { status: 408 });
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (!body || typeof body.businessId !== "string" || !UUID_RE.test(body.businessId)) {
    return NextResponse.json({ error: "businessId must be a UUID." }, { status: 400 });
  }
  if (body.providerMessageId !== undefined && body.providerMessageId !== null &&
      (typeof body.providerMessageId !== "string" || body.providerMessageId.length > 80)) {
    return NextResponse.json({ error: "providerMessageId must be a valid string." }, { status: 400 });
  }
  const { deliveryId } = await params;
  if (!UUID_RE.test(deliveryId)) return NextResponse.json({ error: "Delivery not found." }, { status: 404 });

  try {
    const context = await requireBusinessOwner(session.user.id, body.businessId);
    const result = await reconcileBoosterDelivery({
      businessId: context.businessId,
      deliveryId,
      providerMessageId: typeof body.providerMessageId === "string" ? body.providerMessageId : null,
    });
    return responseForResult(result);
  } catch (error) {
    return safeApiErrorResponse(error, "review_booster.delivery.reconcile");
  }
}
