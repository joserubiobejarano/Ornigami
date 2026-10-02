import { NextResponse } from "next/server";
import { sql } from "@/server/db";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  if (body?.confirmation !== "DELETE MY DATA") return NextResponse.json({ error: "Confirmation required." }, { status: 400 });
  await sql`DELETE FROM businesses`;
  return NextResponse.json({ ok: true });
}
