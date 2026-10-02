import { NextResponse } from "next/server";

import { clearOwnerDashboardSession, getOwnerDashboardSession } from "@/server/auth/session";
import { deleteBusinessById } from "@/server/db/repositories/businesses.repo";

export async function POST(request: Request) {
  const session = await getOwnerDashboardSession();
  if (!session || session.role !== "owner" || !session.businessId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  if (body?.confirmation !== "DELETE MY DATA") return NextResponse.json({ error: "Confirmation required." }, { status: 400 });
  await deleteBusinessById(session.businessId);
  await clearOwnerDashboardSession();
  return NextResponse.json({ ok: true });
}
