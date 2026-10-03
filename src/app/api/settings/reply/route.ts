import { NextResponse } from "next/server";
import { z } from "zod";
import { requireActiveAgentBusinessContext, safeApiErrorResponse } from "@/lib/api-security";
import { getProfileReplyDefaults } from "@/lib/reply-profile-defaults";
import { resolveRequestedBusinessId } from "@/lib/google-business";
import { sql } from "@/lib/db/neon";
import { resolveUser } from "@/lib/user-from-req";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PutSchema = z.object({
  businessId: z.string().optional(),
  businessName: z.string().optional(),
  tone: z.string().optional(),
  ownerName: z.string().optional(),
  contactPreference: z.string().optional(),
  autoReplyAllReviews: z.boolean().optional(),
});

function isDemoUser(user: unknown): boolean {
  return Boolean(user && typeof user === "object" && "demo" in user && (user as { demo?: boolean }).demo);
}

function clean(value: string | null | undefined): string | null {
  return value?.trim() || null;
}

async function resolveRequestContext(req: Request, userId: string, email?: string | null, bodyBusinessId?: unknown) {
  const query = new URL(req.url).searchParams.get("businessId");
  const requested = resolveRequestedBusinessId(query, bodyBusinessId);
  if (!requested.valid) return { response: NextResponse.json({ error: "Conflicting or invalid businessId" }, { status: 400 }) };
  try {
    return { context: await requireActiveAgentBusinessContext(userId, email, "review_replies", requested.businessId) };
  } catch (error) {
    return { response: safeApiErrorResponse(error, "settings.reply.context") };
  }
}

export async function GET(req: Request) {
  if (req.headers.get("x-demo") === "true") return NextResponse.json({ error: "Not available in demo mode" }, { status: 403 });
  const user = await resolveUser(req);
  if (!user || isDemoUser(user)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const email = "email" in user ? user.email : null;
  const resolved = await resolveRequestContext(req, user.id, email);
  if (resolved.response) return resolved.response;
  try {
    const context = resolved.context!;
    const row = await getProfileReplyDefaults(context.replyPolicyOwnerUserId);
    return NextResponse.json({
      businessId: context.businessId,
      role: context.role,
      isOwner: context.role === "owner",
      canManageAutoReply: context.role === "owner",
      businessName: row?.business_name?.trim() ?? "",
      tone: row?.reply_tone?.trim() ?? "",
      ownerName: row?.owner_name?.trim() ?? "",
      contactPreference: row?.contact_preference?.trim() ?? "",
      autoReplyAllReviews: row?.auto_reply_all_reviews === true,
    });
  } catch (error) {
    return safeApiErrorResponse(error, "settings.reply.get");
  }
}

export async function PUT(req: Request) {
  if (req.headers.get("x-demo") === "true") return NextResponse.json({ error: "Not available in demo mode" }, { status: 403 });
  const user = await resolveUser(req);
  if (!user || isDemoUser(user)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const parsed = PutSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid settings" }, { status: 400 });
  const email = "email" in user ? user.email : null;
  const resolved = await resolveRequestContext(req, user.id, email, parsed.data.businessId);
  if (resolved.response) return resolved.response;
  const context = resolved.context!;
  if (context.role !== "owner") {
    return NextResponse.json({ error: "Only the business owner can change shared reply settings." }, { status: 403 });
  }
  try {
    const updated = await sql`
      UPDATE public.profiles
      SET business_name = CASE WHEN ${parsed.data.businessName !== undefined} THEN ${clean(parsed.data.businessName)} ELSE business_name END,
        reply_tone = CASE WHEN ${parsed.data.tone !== undefined} THEN ${clean(parsed.data.tone)} ELSE reply_tone END,
        owner_name = CASE WHEN ${parsed.data.ownerName !== undefined} THEN ${clean(parsed.data.ownerName)} ELSE owner_name END,
        contact_preference = CASE WHEN ${parsed.data.contactPreference !== undefined} THEN ${clean(parsed.data.contactPreference)} ELSE contact_preference END,
        auto_reply_all_reviews = CASE WHEN ${parsed.data.autoReplyAllReviews !== undefined} THEN ${parsed.data.autoReplyAllReviews ?? false} ELSE auto_reply_all_reviews END,
        updated_at = now()
      WHERE id = ${context.replyPolicyOwnerUserId}
      RETURNING id
    `;
    if (!updated.length) return NextResponse.json({ error: "Reply settings are unavailable." }, { status: 409 });
    return NextResponse.json({ ok: true, businessId: context.businessId, role: context.role });
  } catch (error) {
    return safeApiErrorResponse(error, "settings.reply.put");
  }
}
