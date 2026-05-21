export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";

import { resolveUser } from "@/lib/user-from-req";
import { sql } from "@/lib/db/neon";
import { checkUsageLimit, incrementUsage } from "@/lib/usage";
import { generateProfileAudit, type ProfileAuditInput } from "@/lib/openai";
import { safeLogger } from "@/lib/safe-logger";
import { z } from "zod";

const AuditProfileSchema = z.object({
  mode: z.enum(["connected", "quick"]),
  locationId: z.string().uuid().optional(),
  urlOrName: z.string().trim().min(1).max(500).optional(),
  city: z.string().trim().max(120).optional().nullable(),
  category: z.string().trim().max(120).optional().nullable(),
});

export async function POST(req: NextRequest) {
  try {
    const user = await resolveUser(req);

    const body = await req.json();
    const parsed = AuditProfileSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request payload" }, { status: 400 });
    }
    const { mode, locationId, urlOrName, city, category } = parsed.data;

    if (mode !== "connected" && mode !== "quick") {
      return NextResponse.json({ error: "Invalid mode" }, { status: 400 });
    }

    if (mode === "connected" && !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (mode === "connected" && user && !("demo" in user && user.demo)) {
      const usage = await checkUsageLimit(user.id, "audits");
      if (!usage.allowed) {
        return NextResponse.json(
          {
            error: "Monthly limit reached",
            message: `You've reached your monthly limit of ${usage.limit} connected reports (legacy). Your usage will reset on ${usage.resetDate || "the next billing cycle"}.`,
          },
          { status: 403 }
        );
      }
    }

    let input: ProfileAuditInput;

    if (mode === "connected") {
      if (!locationId) {
        return NextResponse.json({ error: "Missing locationId" }, { status: 400 });
      }

      const locRows = await sql`
        SELECT *
        FROM public.gbp_locations
        WHERE id = ${locationId}
          AND user_id = ${user!.id}
        LIMIT 1
      `;

      const location = locRows[0] as Record<string, unknown> | undefined;

      if (!location) {
        return NextResponse.json({ error: "Location not found" }, { status: 404 });
      }

      const raw = (location.raw as Record<string, unknown>) || {};

      const businessName =
        (location.title as string) ||
        (raw.title as string) ||
        ((raw.storefront as Record<string, unknown>)?.title as string) ||
        null;

      const extractedCity =
        city ||
        ((raw.storefront as { address?: { locality?: string } })?.address?.locality) ||
        ((raw.address as { locality?: string })?.locality) ||
        null;

      const extractedCategory =
        category ||
        ((raw.storefront as { primaryCategoryId?: string } | undefined)?.primaryCategoryId) ||
        (raw.primaryCategoryId as string) ||
        null;

      input = {
        mode: "connected",
        businessName,
        city: extractedCity as string | null,
        category: extractedCategory as string | null,
        urlOrName: (location.location_name as string) || null,
        gbpData: location,
      };
    } else {
      if (!urlOrName) {
        return NextResponse.json({ error: "Missing urlOrName" }, { status: 400 });
      }

      input = {
        mode: "quick",
        businessName: null,
        city: city || null,
        category: category || null,
        urlOrName,
        gbpData: null,
      };
    }

    const markdown = await generateProfileAudit(input);

    if (mode === "connected" && user && !("demo" in user && user.demo)) {
      await incrementUsage(user.id, "audits");
    }

    return NextResponse.json({ markdown });
  } catch (err: unknown) {
    safeLogger.error("audit.profile.post.failed", { error: err instanceof Error ? err.message : "unknown" });
    return NextResponse.json({ error: "Failed to generate report" }, { status: 500 });
  }
}
