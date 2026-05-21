export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { resolveUser } from "@/lib/user-from-req";
import { sql } from "@/lib/db/neon";
import { safeLogger } from "@/lib/safe-logger";

export async function GET(req: Request) {
  try {
    const user = await resolveUser(req);
    if (!user) {
      return new NextResponse(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      });
    }

    const [projectsRow] = await sql`
      SELECT count(*)::int AS c FROM public.projects WHERE user_id = ${user.id}
    `;
    const [reviewsRow] = await sql`
      SELECT count(*)::int AS c FROM public.reviews WHERE user_id = ${user.id}
    `;
    const [locationsRow] = await sql`
      SELECT count(*)::int AS c FROM public.gbp_locations WHERE user_id = ${user.id}
    `;

    return NextResponse.json({
      projectsCount: Number((projectsRow as { c: number }).c ?? 0),
      reviewsCount: Number((reviewsRow as { c: number }).c ?? 0),
      locationsCount: Number((locationsRow as { c: number }).c ?? 0),
    });
  } catch (e: unknown) {
    safeLogger.error("dashboard.summary.get.failed", { error: e instanceof Error ? e.message : "unknown" });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
