import { NextResponse } from "next/server";
import { z } from "zod";

import { requireActiveAgentAccess, safeApiErrorResponse } from "@/lib/api-security";
import { getProfileReplyDefaults } from "@/lib/reply-profile-defaults";
import { sql } from "@/lib/db/neon";
import { resolveUser } from "@/lib/user-from-req";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PutSchema = z.object({
  businessName: z.string().optional(),
  tone: z.string().optional(),
  ownerName: z.string().optional(),
  contactPreference: z.string().optional(),
  autoReplyAllReviews: z.boolean().optional(),
});

function isDemoUser(user: unknown): boolean {
  return Boolean(user && typeof user === "object" && "demo" in user && (user as { demo?: boolean }).demo);
}

function emptyToNull(value: string | undefined): string | null {
  const t = value?.trim();
  return t ? t : null;
}

export async function GET(req: Request) {
  const isDemo = req.headers.get("x-demo") === "true";
  if (isDemo) {
    return NextResponse.json({ error: "Not available in demo mode" }, { status: 403 });
  }

  const user = await resolveUser(req);
  if (!user || isDemoUser(user)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const email = "email" in user ? user.email : null;
    await requireActiveAgentAccess(user.id, email, "review_replies");
    const row = await getProfileReplyDefaults(user.id);
    if (!row) {
      return NextResponse.json({
        businessName: "",
        tone: "",
        ownerName: "",
        contactPreference: "",
        autoReplyAllReviews: false,
      });
    }

    return NextResponse.json({
      businessName: row.business_name?.trim() ?? "",
      tone: row.reply_tone?.trim() ?? "",
      ownerName: row.owner_name?.trim() ?? "",
      contactPreference: row.contact_preference?.trim() ?? "",
      autoReplyAllReviews: row.auto_reply_all_reviews === true,
    });
  } catch (error) {
    return safeApiErrorResponse(error, "settings.reply.get");
  }
}

export async function PUT(req: Request) {
  const isDemo = req.headers.get("x-demo") === "true";
  if (isDemo) {
    return NextResponse.json({ error: "Not available in demo mode" }, { status: 403 });
  }

  const user = await resolveUser(req);
  if (!user || isDemoUser(user)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const email = "email" in user ? user.email : null;
    await requireActiveAgentAccess(user.id, email, "review_replies");
  } catch (error) {
    return safeApiErrorResponse(error, "settings.reply.guard");
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = PutSchema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const message = first ? `${first.path.join(".")}: ${first.message}` : "Invalid input";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const { businessName, tone, ownerName, contactPreference, autoReplyAllReviews } = parsed.data;

  const existing = await getProfileReplyDefaults(user.id);
  const nextAutoReply =
    autoReplyAllReviews !== undefined
      ? autoReplyAllReviews
      : (existing?.auto_reply_all_reviews ?? false);

  try {
    await sql`
      UPDATE public.profiles
      SET
        business_name = ${emptyToNull(businessName)},
        reply_tone = ${emptyToNull(tone)},
        owner_name = ${emptyToNull(ownerName)},
        contact_preference = ${emptyToNull(contactPreference)},
        auto_reply_all_reviews = ${nextAutoReply},
        updated_at = now()
      WHERE id = ${user.id}
    `;
    return NextResponse.json({ ok: true });
  } catch (error) {
    return safeApiErrorResponse(error, "settings.reply.put");
  }
}
