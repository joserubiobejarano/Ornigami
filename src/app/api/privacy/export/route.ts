import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { sql } from "@/lib/db/neon";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [user, profiles, businesses, reviews, visits] = await Promise.all([
    sql`SELECT id, email, name, email_verified, created_at, updated_at FROM public.users WHERE id = ${userId}`,
    sql`SELECT id, full_name, business_name, city, country, plan_type, plan_status, created_at, updated_at FROM public.profiles WHERE id = ${userId}`,
    sql`SELECT * FROM public.businesses WHERE owner_user_id = ${userId}`,
    sql`SELECT * FROM public.reviews WHERE user_id = ${userId}`,
    sql`SELECT v.* FROM public.followup_visits v JOIN public.businesses b ON b.id = v.business_id WHERE b.owner_user_id = ${userId}`,
  ]);
  return NextResponse.json({ user, profiles, businesses, reviews, visits }, { headers: { "Cache-Control": "no-store" } });
}
