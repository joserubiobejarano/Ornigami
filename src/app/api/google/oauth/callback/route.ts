export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { exchangeCodeForTokens } from "@/lib/google";
import { upsertGbpConnection } from "@/lib/db/gbp";
import { getServerAppUrl } from "@/lib/env";
import { parseGoogleOAuthState } from "@/lib/google-oauth-state";
import { resolveUser } from "@/lib/user-from-req";
import { safeLogger } from "@/lib/safe-logger";

function redirectWithGoogleError(reason: string) {
  const res = NextResponse.redirect(
    new URL(`/connect?google=error&reason=${reason}`, getServerAppUrl()),
    { status: 302 }
  );
  res.cookies.set("ll_gbp_oauth_state", "", {
    path: "/",
    maxAge: 0,
  });
  return res;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) {
    return redirectWithGoogleError("connection_failed");
  }

  const cookieState = req.headers
    .get("cookie")
    ?.split(";")
    .map((v) => v.trim())
    .find((v) => v.startsWith("ll_gbp_oauth_state="))
    ?.split("=")[1];
  const normalizedCookieState = cookieState ? decodeURIComponent(cookieState) : "";
  if (!normalizedCookieState || normalizedCookieState !== state) {
    return redirectWithGoogleError("connection_failed");
  }

  const parsedState = parseGoogleOAuthState(state);
  if (!parsedState.valid || !parsedState.userId) {
    return redirectWithGoogleError("connection_failed");
  }

  const user = await resolveUser(req);
  if (!user || user.id !== parsedState.userId) {
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
  if (!refreshToken) {
    return redirectWithGoogleError("missing_refresh_token");
  }

  try {
    await upsertGbpConnection({
      userId: user.id,
      accessToken: tokens.access_token,
      refreshToken,
      expiresAt: new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString(),
      scope: tokens.scope ?? null,
    });
  } catch (e: unknown) {
    safeLogger.error("google.oauth.callback.save_failed", {
      error: e instanceof Error ? e.message : "unknown",
    });
    return redirectWithGoogleError("connection_failed");
  }

  const res = NextResponse.redirect(new URL("/dashboard", getServerAppUrl()), {
    status: 302,
  });
  res.cookies.set("ll_gbp_oauth_state", "", {
    path: "/",
    maxAge: 0,
  });
  return res;
}
