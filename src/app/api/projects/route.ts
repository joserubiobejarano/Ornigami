export const runtime = "nodejs";

export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { resolveUser } from "@/lib/user-from-req";
import { sql } from "@/lib/db/neon";
import { demoProjects } from "@/lib/demo-data";
import { safeLogger } from "@/lib/safe-logger";
import { z } from "zod";

const ProjectCreateSchema = z.object({
  title: z.string().trim().min(1).max(180),
  type: z.string().trim().min(1).max(80),
  input: z.unknown(),
  output_md: z.string().max(50000).optional().nullable(),
});

export async function GET(req: Request) {
  try {
    const isDemo = req.headers.get("x-demo") === "true";

    if (isDemo) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      return NextResponse.json({ projects: demoProjects });
    }

    const user = await resolveUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const data = await sql`
      SELECT *
      FROM public.projects
      WHERE user_id = ${user.id}
      ORDER BY created_at DESC
    `;

    return NextResponse.json({ projects: data ?? [] });
  } catch (e: unknown) {
    safeLogger.error("projects.get.failed", { error: e instanceof Error ? e.message : "unknown" });
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const isDemo = req.headers.get("x-demo") === "true";

    if (isDemo) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      const body = await req.json();
      const mockProject = {
        id: "demo-new-project-" + Date.now(),
        user_id: "demo-user",
        title: body.title || "Demo Project",
        type: body.type || "blog",
        input: body.input || {},
        output_md: body.output_md || "",
        created_at: new Date().toISOString(),
      };
      return NextResponse.json({ project: mockProject });
    }

    const user = await resolveUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const parsed = ProjectCreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid project payload" }, { status: 400 });
    }
    const { title, type, input, output_md } = parsed.data;

    const rows = await sql`
      INSERT INTO public.projects (user_id, title, type, input, output_md)
      VALUES (
        ${user.id},
        ${title},
        ${type},
        ${input as object},
        ${output_md ?? null}
      )
      RETURNING *
    `;

    const data = rows[0];
    return NextResponse.json({ project: data });
  } catch (e: unknown) {
    safeLogger.error("projects.post.failed", { error: e instanceof Error ? e.message : "unknown" });
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
