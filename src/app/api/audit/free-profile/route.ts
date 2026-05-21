export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db/neon";
import { generateProfileAudit, type ProfileAuditInput } from "@/lib/openai";
import { z } from "zod";
import { safeLogger } from "@/lib/safe-logger";

const FreeAuditSchema = z.object({
  businessQuery: z.string().trim().min(1).max(500),
  city: z.string().trim().max(120).optional().nullable(),
  category: z.string().trim().max(120).optional().nullable(),
  email: z.string().trim().email().max(254),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = FreeAuditSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: "Invalid request payload" }, { status: 400 });
    }
    const { businessQuery, city, category, email } = parsed.data;

    const input: ProfileAuditInput = {
      mode: "quick",
      businessName: null,
      city: city || null,
      category: category || null,
      urlOrName: businessQuery,
      gbpData: null,
    };

    const auditText = await generateProfileAudit(input);

    const scoreMatch = auditText.match(/(?:score|scores):?\s+(\d{1,3})\/100/i);
    let score: number | null = null;

    if (scoreMatch) {
      const parsedScore = parseInt(scoreMatch[1], 10);
      score = Math.max(0, Math.min(100, parsedScore));
    }

    try {
      await sql`
        INSERT INTO public.leads (
          email, business_query, city, category, audit_text, score
        ) VALUES (
          ${email},
          ${businessQuery},
          ${city || null},
          ${category || null},
          ${auditText},
          ${score}
        )
      `;
    } catch (insertErr) {
      safeLogger.warn("free_audit.insert_failed");
    }

    return NextResponse.json({
      ok: true,
      auditText,
      score,
    });
  } catch (err: unknown) {
    safeLogger.error("free_audit.post.failed", { error: err instanceof Error ? err.message : "unknown" });
    return NextResponse.json(
      {
        ok: false,
        error: "Something went wrong, please try again.",
      },
      { status: 500 }
    );
  }
}
