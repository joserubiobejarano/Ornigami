export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { getGoogleGbpOAuthRedirectUri, googleAuthUrl } from "@/lib/google";
import { resolveUser } from "@/lib/user-from-req";
import { getServerAppUrl } from "@/lib/env";
import { buildGoogleOAuthState } from "@/lib/google-oauth-state";
import { getUserPlan } from "@/lib/plan-server";
import { canUseGoogleConnection } from "@/lib/plan";
import { safeLogger } from "@/lib/safe-logger";

export async function GET(req: Request) {
  const user = await resolveUser(req);
  if (!user) return NextResponse.redirect(new URL("/login", getServerAppUrl()));

  const plan = await getUserPlan(user.id);
  if (!canUseGoogleConnection(plan)) {
    return NextResponse.redirect(new URL("/pricing", getServerAppUrl()));
  }

  const state = buildGoogleOAuthState(user.id);
  const url = googleAuthUrl(state);

  const u = new URL(req.url);
  if (process.env.NODE_ENV !== "production" && u.searchParams.get("debug") === "1") {
    safeLogger.info("google.oauth.start.debug");
    return NextResponse.json({
      appBaseUrl: getServerAppUrl(),
      redirectUri: getGoogleGbpOAuthRedirectUri(),
      redirect: "[REDACTED]",
    });
  }

  const res = NextResponse.redirect(url, { status: 302 });
  res.cookies.set("ll_gbp_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 10 * 60,
  });
  return res;
}

