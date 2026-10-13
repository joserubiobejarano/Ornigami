import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { requireActiveAgentAccess, safeApiErrorResponse } from "@/lib/api-security";
import { resolveRequestedBusinessId } from "@/lib/google-business";
import { parseDashboardPageSize } from "@/lib/dashboard-pagination";
import { isSameOriginMutation } from "@/lib/team-lifecycle";
import { createFollowupVisit, getRecentVisitsPage } from "@/modules/review-booster/services/review-booster-db.service";
import { isValidCustomerEmail, normalizePermissionEvidence, normalizeVisitedAt } from "@/modules/review-booster/services/intake-input.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function optionalString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return value.trim() || null;
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  const requested = resolveRequestedBusinessId(url.searchParams.get("businessId"), undefined);
  if (!requested.valid) return NextResponse.json({ error: "Conflicting or invalid businessId" }, { status: 400 });
  const limit = parseDashboardPageSize(url.searchParams.get("limit"));
  if (limit === null) return NextResponse.json({ error: "limit must be a positive integer" }, { status: 400 });
  try {
    const business = await requireActiveAgentAccess(session.user.id, session.user.email, "review_booster", requested.businessId);
    const result = await getRecentVisitsPage(business.id, {
      limit,
      cursor: url.searchParams.get("cursor"),
    });
    return NextResponse.json({ ...result, businessId: business.id });
  } catch (error) {
    return safeApiErrorResponse(error, "review_booster.visits.get");
  }
}

export async function POST(req: Request) {
  if (!isSameOriginMutation(req)) return NextResponse.json({ error: "Cross-origin request rejected." }, { status: 403 });
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Request body must be an object" }, { status: 400 });
  }

  const payload = body as Record<string, unknown>;
  for (const field of ["customer_name", "customer_email", "permission_source", "permission_at", "permission_notice_version"]) {
    if (payload[field] !== undefined && payload[field] !== null && typeof payload[field] !== "string") {
      return NextResponse.json({ error: `${field} must be a string` }, { status: 400 });
    }
  }
  if (payload.visited_at !== undefined && typeof payload.visited_at !== "string") {
    return NextResponse.json({ error: "visited_at must be a string" }, { status: 400 });
  }
  const customerEmail = optionalString(payload.customer_email)?.toLowerCase() ?? null;
  const visitedAt = normalizeVisitedAt(payload.visited_at);
  const customerName = optionalString(payload.customer_name);

  if (!visitedAt) return NextResponse.json({ error: "visited_at must be YYYY-MM-DD (UTC) or an ISO timestamp with Z/an explicit offset" }, { status: 400 });
  if (!customerEmail) return NextResponse.json({ error: "A recipient email is required for review requests" }, { status: 400 });
  if (customerEmail && !isValidCustomerEmail(customerEmail)) return NextResponse.json({ error: "customer_email must be a valid email address of at most 254 characters" }, { status: 400 });
  if (customerName && customerName.length > 120) return NextResponse.json({ error: "customer_name is too long" }, { status: 400 });
  const permission = normalizePermissionEvidence({
    source: payload.permission_source,
    at: payload.permission_at,
    noticeVersion: payload.permission_notice_version,
    recipientEmail: customerEmail,
  });
  if (!permission) return NextResponse.json({ error: "Valid recipient permission source, time, and notice version are required" }, { status: 400 });

  try {
    // Resolve canonical business and paid-agent access for owners and members.
    const business = await requireActiveAgentAccess(session.user.id, session.user.email, "review_booster");
    const visit = await createFollowupVisit({
      businessId: business.id,
      customerName,
      customerEmail,
      visitedAt,
      source: "manual",
      permissionSource: permission.source,
      permissionAt: permission.at,
      permissionNoticeVersion: permission.noticeVersion,
    }, session.user.id);
    return NextResponse.json(visit, { status: 201 });
  } catch (error) {
    return safeApiErrorResponse(error, "review_booster.visits.post");
  }
}
