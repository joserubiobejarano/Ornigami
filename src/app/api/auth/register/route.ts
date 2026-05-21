import { NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { z } from "zod";

import { createUserWithPassword, findUserByEmail } from "@/lib/db/users";
import { safeLogger } from "@/lib/safe-logger";

export const runtime = "nodejs";

const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  fullName: z.string().min(1).max(200).optional(),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = RegisterSchema.safeParse(body);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return NextResponse.json(
        { ok: false, error: first ? `${first.path.join(".")}: ${first.message}` : "Invalid input" },
        { status: 400 }
      );
    }

    const { email, password, fullName } = parsed.data;

    const existing = await findUserByEmail(email);
    if (existing) {
      return NextResponse.json(
        { ok: false, error: "An account with this email already exists" },
        { status: 409 }
      );
    }

    const passwordHash = await hash(password, 10);
    await createUserWithPassword({
      email,
      passwordHash,
      fullName: fullName ?? null,
    });

    const res = NextResponse.json({ ok: true });
    res.cookies.set("ll_demo", "", { path: "/", maxAge: 0 });
    return res;
  } catch (e: unknown) {
    safeLogger.error("auth.register.post.failed", { error: e instanceof Error ? e.message : "unknown" });
    return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
  }
}
