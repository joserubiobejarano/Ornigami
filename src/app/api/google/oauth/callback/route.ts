export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { exchangeCodeForTokens } from "@/lib/google";
import { upsertGbpConnection } from "@/lib/db/gbp";
import { sql } from "@/lib/db/neon";
import { getServerAppUrl } from "@/lib/env";
import { parseGoogleOAuthState } from "@/lib/google-oauth-state";
import { resolveUser } from "@/lib/user-from-req";
import { assertGoogleBusinessOwner, requireGoogleBusinessContext, requireGoogleWorkflowEntitlement } from "@/lib/google-business";
import { safeLogger } from "@/lib/safe-logger";
import type { BusinessContext } from "@/lib/business-context";

function redirectWithGoogleError(reason: string) {
  const response = NextResponse.redirect(
    new URL(`/dashboard/agents/review-replies/google-connection?google=error&reason=${reason}`, getServerAppUrl()),
    { status: 302 }
  );
  response.cookies.set("ll_gbp_oauth_state", "", { path: "/", maxAge: 0 });
  return response;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) return redirectWithGoogleError("connection_failed");

  const cookieState = req.headers.get("cookie")
    ?.split(";")
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith("ll_gbp_oauth_state="))
    ?.slice("ll_gbp_oauth_state=".length);
  let normalizedCookieState = "";
  try {
    normalizedCookieState = cookieState ? decodeURIComponent(cookieState) : "";
  } catch {
    return redirectWithGoogleError("connection_failed");
  }
  if (!normalizedCookieState || normalizedCookieState !== state) {
    return redirectWithGoogleError("connection_failed");
  }

  const parsedState = parseGoogleOAuthState(state);
  if (!parsedState.valid || !parsedState.userId || !parsedState.businessId || !parsedState.ownerUserId) {
    return redirectWithGoogleError("connection_failed");
  }

  const user = await resolveUser(req);
  if (!user || user.demo || user.id !== parsedState.userId) {
    return redirectWithGoogleError("connection_failed");
  }

  // Revalidate actor access, owner role, and the owner's current identity before contacting Google.
  let context: BusinessContext;
  try {
    context = await requireGoogleBusinessContext(user.id, parsedState.businessId);
    assertGoogleBusinessOwner(context);
    if (context.integrationOwnerUserId !== parsedState.ownerUserId) {
      return redirectWithGoogleError("connection_failed");
    }
    await requireGoogleWorkflowEntitlement(context);
  } catch {
    return redirectWithGoogleError("connection_failed");
  }

  let tokens: {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    scope?: string;
    token_type: string;
  };
  try {
    tokens = await exchangeCodeForTokens(code);
  } catch {
    return redirectWithGoogleError("connection_failed");
  }

  const refreshToken = typeof tokens.refresh_token === "string" ? tokens.refresh_token.trim() : "";
  if (!refreshToken || typeof tokens.access_token !== "string" || !tokens.access_token) {
    return redirectWithGoogleError("missing_refresh_token");
  }

  try {
    const latestContext = await requireGoogleBusinessContext(user.id, parsedState.businessId);
    assertGoogleBusinessOwner(latestContext);
    if (latestContext.integrationOwnerUserId !== parsedState.ownerUserId) return redirectWithGoogleError("connection_failed");
    await requireGoogleWorkflowEntitlement(latestContext);
    // An OAuth reconnect may identify a different Google account. Invalidate the prior
    // owner cache before replacing credentials; a complete fresh discovery revalidates rows.
    await sql`
      UPDATE public.gbp_locations SET connected = false, updated_at = now()
      WHERE user_id = ${parsedState.ownerUserId}
    `;
    await upsertGbpConnection({
      userId: parsedState.ownerUserId,
      accessToken: tokens.access_token,
      refreshToken,
      expiresAt: new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString(),
      scope: tokens.scope ?? null,
    });
  } catch (error: unknown) {
    safeLogger.error("google.oauth.callback.save_failed", { error: error instanceof Error ? error.message : "unknown" });
    return redirectWithGoogleError("connection_failed");
  }

  const response = NextResponse.redirect(new URL("/dashboard", getServerAppUrl()), { status: 302 });
  response.cookies.set("ll_gbp_oauth_state", "", { path: "/", maxAge: 0 });
  return response;
}
