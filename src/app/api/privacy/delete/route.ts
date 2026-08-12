import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { sql } from "@/lib/db/neon";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  if (body?.confirmation !== "DELETE MY DATA") return NextResponse.json({ error: "Confirmation required." }, { status: 400 });
  await sql`DELETE FROM public.users WHERE id = ${userId}`;
  return NextResponse.json({ ok: true });
}
