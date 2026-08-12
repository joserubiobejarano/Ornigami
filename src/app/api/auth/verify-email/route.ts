import { NextResponse } from "next/server";

import { verifyEmailToken } from "@/lib/auth-verification";
import { getServerAppUrl } from "@/lib/env";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token")?.trim();
  const verified = token ? await verifyEmailToken(token) : false;
  return NextResponse.redirect(
    new URL(verified ? "/login?verified=1" : "/login?verified=0", getServerAppUrl()),
  );
}
