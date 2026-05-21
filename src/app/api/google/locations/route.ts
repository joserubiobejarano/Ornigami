import { NextRequest, NextResponse } from "next/server";

import { resolveUser } from "@/lib/user-from-req";

import { googleFetch } from "@/lib/google";

import { sql } from "@/lib/db/neon";
import { getUserPlan } from "@/lib/plan-server";
import { canUseGoogleConnection } from "@/lib/plan";
import { safeLogger } from "@/lib/safe-logger";

export const runtime = "nodejs";

const LIST_URL =
  "https://mybusinessbusinessinformation.googleapis.com/v1/locations?pageSize=100&readMask=name,title,storeCode,placeId";

export async function GET(req: NextRequest) {
  const user = await resolveUser(req);

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const plan = await getUserPlan(user.id);
  if (!canUseGoogleConnection(plan)) {
    return NextResponse.json({ error: "Google Business Profile access requires a paid plan" }, { status: 403 });
  }

  try {
    const r = await googleFetch(user.id, LIST_URL);

    if (!r.ok) {
      return NextResponse.json({ error: "Google locations sync failed" }, { status: 502 });
    }

    const json = await r.json();

    const upserts = (json.locations ?? []).map((loc: Record<string, unknown>) => ({
      user_id: user.id,
      location_name: loc.name as string,
      title: (loc.title as string) ?? null,
      store_code: (loc.storeCode as string) ?? null,
      place_id: (loc.placeId as string) ?? null,
      updated_at: new Date().toISOString(),
    }));

    for (const row of upserts) {
      await sql`
        INSERT INTO public.gbp_locations (
          user_id, location_name, title, store_code, place_id, updated_at
        ) VALUES (
          ${row.user_id},
          ${row.location_name},
          ${row.title},
          ${row.store_code},
          ${row.place_id},
          ${row.updated_at}
        )
        ON CONFLICT (user_id, location_name) DO UPDATE SET
          title = EXCLUDED.title,
          store_code = EXCLUDED.store_code,
          place_id = EXCLUDED.place_id,
          updated_at = EXCLUDED.updated_at
      `;
    }

    return NextResponse.json({ locations: json.locations ?? [] });
  } catch (e: unknown) {
    safeLogger.error("google.locations.get.failed", { error: e instanceof Error ? e.message : "unknown" });
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
