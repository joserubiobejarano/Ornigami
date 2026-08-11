export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { resolveUser } from "@/lib/user-from-req";
import { saveReplyDraft } from "@/lib/review-reply-server";
import { getBusinessForUser } from "@/lib/db/businesses";

const BodySchema = z.object({
  reviewId: z.string().min(1),
  reply: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const isDemo = req.headers.get("x-demo") === "true";
  if (isDemo) {
    return NextResponse.json({ ok: true });
  }

  const user = await resolveUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const message = first ? `${first.path.join(".")}: ${first.message}` : "Invalid input";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const { reviewId, reply } = parsed.data;
  const business = await getBusinessForUser(user.id);
  if (!business) {
    return NextResponse.json({ error: "Business setup is incomplete." }, { status: 409 });
  }
  const result = await saveReplyDraft(business.id, reviewId, reply);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
