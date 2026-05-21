export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";

import { resolveUser } from "@/lib/user-from-req";
import { sql } from "@/lib/db/neon";
import { safeLogger } from "@/lib/safe-logger";

export async function POST(req: NextRequest) {
  const isDemo = req.headers.get("x-demo") === "true";

  if (isDemo) {
    return NextResponse.json({ ok: true });
  }

  const user = await resolveUser(req);

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    await sql`
      DELETE FROM public.gbp_connections WHERE user_id = ${user.id}
    `;
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    safeLogger.error("google.disconnect.post.failed", { error: e instanceof Error ? e.message : "unknown" });
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
