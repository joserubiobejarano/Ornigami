export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getGoogleGbpOAuthRedirectUri, googleAuthUrl } from "@/lib/google";
import { resolveUser } from "@/lib/user-from-req";
import { getOptionalEnv, getServerAppUrl } from "@/lib/env";
import { buildGoogleOAuthState } from "@/lib/google-oauth-state";
import { assertGoogleBusinessOwner, googleBusinessErrorResponse, requireGoogleBusinessContext, requireGoogleWorkflowEntitlement } from "@/lib/google-business";
import { safeLogger } from "@/lib/safe-logger";

export async function GET(req: Request) {
  const user = await resolveUser(req);
  if (!user || user.demo) return NextResponse.redirect(new URL("/login", getServerAppUrl()));

  const url = new URL(req.url);
  try {
    const context = await requireGoogleBusinessContext(user.id, url.searchParams.get("businessId"));
    assertGoogleBusinessOwner(context);
    await requireGoogleWorkflowEntitlement(context);
    const state = buildGoogleOAuthState(user.id, context.businessId, context.integrationOwnerUserId);
    const authUrl = googleAuthUrl(state);

    if (getOptionalEnv("NODE_ENV") !== "production" && url.searchParams.get("debug") === "1") {
      safeLogger.info("google.oauth.start.debug", { businessId: context.businessId });
      return NextResponse.json({
        appBaseUrl: getServerAppUrl(),
        redirectUri: getGoogleGbpOAuthRedirectUri(),
        redirect: "[REDACTED]",
      });
    }

    const response = NextResponse.redirect(authUrl, { status: 302 });
    response.cookies.set("ll_gbp_oauth_state", state, {
      httpOnly: true,
      secure: getOptionalEnv("NODE_ENV") === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 10 * 60,
    });
    return response;
  } catch (error) {
    return googleBusinessErrorResponse(error);
  }
}
