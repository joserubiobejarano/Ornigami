import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { sql } from "@/lib/db/neon";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await sql`SELECT id, email, name, email_verified, created_at, updated_at FROM public.users WHERE id = ${userId}`;
  if (!user.length) {
    return NextResponse.json(
      { error: "Account not found or session expired." },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  const [profiles, businesses, memberships, invitations, reviews, visits] = await Promise.all([
    sql`SELECT id, full_name, business_name, city, country, plan_type, plan_status, created_at, updated_at FROM public.profiles WHERE id = ${userId}`,
    sql`SELECT * FROM public.businesses WHERE owner_user_id = ${userId}`,
    sql`SELECT bm.business_id, bm.role, bm.created_at, b.name AS business_name FROM public.business_members bm INNER JOIN public.businesses b ON b.id = bm.business_id WHERE bm.user_id = ${userId}`,
    sql`SELECT i.business_id, i.email, i.role, i.expires_at, i.accepted_at, i.created_at FROM public.team_invitations i INNER JOIN public.businesses b ON b.id = i.business_id WHERE i.invited_by = ${userId}`,
    sql`SELECT * FROM public.reviews WHERE user_id = ${userId}`,
    sql`SELECT v.* FROM public.followup_visits v JOIN public.businesses b ON b.id = v.business_id WHERE b.owner_user_id = ${userId}`,
  ]);
  return NextResponse.json({ user, profiles, businesses, memberships, invitations, reviews, visits }, { headers: { "Cache-Control": "no-store" } });
}
