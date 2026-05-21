import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { sql } from "@/lib/db/neon";
import { safeLogger } from "@/lib/safe-logger";
import { z } from "zod";

const FeedbackSchema = z.object({
  message: z.string().trim().min(1).max(3000),
  category: z.string().trim().max(80).optional().nullable(),
  url: z.string().trim().url().max(500).optional().nullable(),
  browser: z.string().trim().max(240).optional().nullable(),
});

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const session = await auth();
    const body = await req.json();
    const parsed = FeedbackSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid feedback payload" }, { status: 400 });
    }
    const { message, category, url, browser } = parsed.data;

    await sql`
      INSERT INTO public.feedback (user_id, message, category, url, browser)
      VALUES (
        ${session?.user?.id ?? null},
        ${message},
        ${category ?? null},
        ${url ?? null},
        ${browser ?? null}
      )
    `;

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    safeLogger.error("feedback.post.failed", { error: e instanceof Error ? e.message : "unknown" });
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
