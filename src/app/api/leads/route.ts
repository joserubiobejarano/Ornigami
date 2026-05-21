export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db/neon";
import { z } from "zod";
import { safeLogger } from "@/lib/safe-logger";

const LeadsSchema = z.object({
  email: z.string().trim().email().max(254),
  query_text: z.string().trim().min(1).max(2000),
  audit_result: z.union([z.string().max(20000), z.record(z.string(), z.unknown())]).optional().nullable(),
  user_agent: z.string().max(500).optional().nullable(),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = LeadsSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid lead payload" }, { status: 400 });
    }
    const { email, query_text, audit_result } = parsed.data;

    const auditText =
      typeof audit_result === "string"
        ? audit_result
        : audit_result
          ? JSON.stringify(audit_result)
          : "";

    await sql`
      INSERT INTO public.leads (
        email, business_query, audit_text
      ) VALUES (
        ${email},
        ${query_text},
        ${auditText || "(no audit text)"}
      )
    `;

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    safeLogger.error("leads.post.failed", { error: err instanceof Error ? err.message : "unknown" });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
