import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";

import { auth } from "@/auth";
import { getAppBaseUrl } from "@/lib/app-base-url";
import { getMiddlewareAccessState } from "@/lib/db/access";
import { safeLogger } from "@/lib/safe-logger";
import { shouldRedirectToGoogleConnect, shouldRedirectAfterAccessResolutionError } from "@/lib/disconnected-access-policy";
import { buildContentSecurityPolicy } from "@/lib/security-headers";

function isProtectedAppPage(pathname: string): boolean {
  const prefixes = [
    "/dashboard",
    "/reviews",
    "/settings",
    "/connect",
  ];
  return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

function withSecurityHeaders(response: NextResponse, nonce: string): NextResponse {
  response.headers.set("Content-Security-Policy", buildContentSecurityPolicy(nonce));
  response.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
  return response;
}

const proxy = auth(async (req) => {
  const { pathname } = req.nextUrl;
  const sessionUser = req.auth?.user;
  const isRestrictedDeletionSession =
    req.auth?.accountLifecycle === "deleting" &&
    typeof req.auth.deletionUserId === "string" &&
    !sessionUser?.id;

  const nonce = randomBytes(16).toString("base64url");
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-nonce", nonce);
  // Next.js reads the request CSP to apply the nonce to streamed inline
  // hydration scripts. The response CSP alone is too late for those scripts.
  requestHeaders.set("Content-Security-Policy", buildContentSecurityPolicy(nonce));

  if (isRestrictedDeletionSession) {
    // Only Auth.js session/sign-in plumbing and the recovery screen remain
    // reachable while deletion is pending.
    const isAuthJsEndpoint = /^\/api\/auth\/(?:csrf|providers|session|signin(?:\/.*)?|callback(?:\/.*)?|signout|error|verify-request)$/.test(pathname);
    if (isAuthJsEndpoint) return withSecurityHeaders(NextResponse.next({ request: { headers: requestHeaders } }), nonce);
    if (pathname.startsWith("/api/")) {
      if (pathname === "/api/privacy/delete" && req.method === "POST") {
        return withSecurityHeaders(NextResponse.next({ request: { headers: requestHeaders } }), nonce);
      }
      return withSecurityHeaders(NextResponse.json({ error: "Restricted account session" }, { status: 403 }), nonce);
    }
    if (pathname === "/account/deletion") {
      return withSecurityHeaders(NextResponse.next({ request: { headers: requestHeaders } }), nonce);
    }
    if (pathname === "/login" || pathname.startsWith("/login/") || pathname === "/signup" || pathname.startsWith("/signup/")) {
      return withSecurityHeaders(NextResponse.redirect(new URL("/account/deletion", getAppBaseUrl(req)), 302), nonce);
    }
    return withSecurityHeaders(NextResponse.redirect(new URL("/account/deletion", getAppBaseUrl(req)), 302), nonce);
  }

  if (pathname === "/demo/review-replies") {
    return withSecurityHeaders(
      NextResponse.rewrite(new URL("/demo-review-replies", req.url), { request: { headers: requestHeaders } }),
      nonce
    );
  }

  if (pathname === "/demo/review-booster") {
    return withSecurityHeaders(
      NextResponse.rewrite(new URL("/demo-review-booster", req.url), { request: { headers: requestHeaders } }),
      nonce
    );
  }

  if (pathname === "/api/public-demo/review-booster") {
    return withSecurityHeaders(NextResponse.rewrite(new URL("/api-public-demo-review-booster", req.url)), nonce);
  }

  const demoCookie = req.cookies.get("ll_demo")?.value === "true";
  const isPublicReviewReplyDemoRequest =
    pathname === "/api/openai/review-reply" &&
    req.headers.get("x-demo") === "true" &&
    req.headers.get("x-sample-review") === "true";
  const isDemoMode = !sessionUser && (demoCookie || isPublicReviewReplyDemoRequest);

  // Internal demo headers are controlled by middleware, never by the client.
  requestHeaders.delete("x-demo");
  if (isDemoMode) {
    requestHeaders.set("x-demo", "true");
  }

  if (isDemoMode) {
    if (pathname.startsWith("/api/google/oauth")) {
      return withSecurityHeaders(NextResponse.json(
        { error: "Google connection not available in demo mode" },
        { status: 403 }
      ), nonce);
    }

    return withSecurityHeaders(NextResponse.next({
      request: { headers: requestHeaders },
    }), nonce);
  }

  const isAuthPage =
    pathname.startsWith("/login") || pathname.startsWith("/signup");

  const needsSession =
    !pathname.startsWith("/api") &&
    !isAuthPage &&
    isProtectedAppPage(pathname);

  if (needsSession && !sessionUser) {
    const callbackPath = pathname + (req.nextUrl.search || "");
    const loginSearch = new URLSearchParams({ callbackUrl: callbackPath });
    const login = new URL(`/login?${loginSearch.toString()}`, getAppBaseUrl(req));
    return withSecurityHeaders(NextResponse.redirect(login), nonce);
  }

  const userId = sessionUser?.id;


  if (userId && (isProtectedAppPage(pathname) || pathname === "/connect" || pathname.startsWith("/connect/"))) {
    try {
      const { hasGbp, hasRepliesAccess } = await getMiddlewareAccessState(userId);

      if (
        (pathname === "/connect" || pathname.startsWith("/connect/")) &&
        hasGbp
      ) {
        return withSecurityHeaders(NextResponse.redirect(
          new URL("/dashboard", getAppBaseUrl(req)),
          302
        ), nonce);
      }

      if (shouldRedirectToGoogleConnect(pathname, { hasGbp, hasRepliesAccess })) {
        return withSecurityHeaders(NextResponse.redirect(new URL("/connect", getAppBaseUrl(req)), 302), nonce);
      }
    } catch (e) {
      safeLogger.error("middleware.gbp_check_failed", {
        error: e instanceof Error ? e.message : "unknown",
      });
      if (shouldRedirectAfterAccessResolutionError(pathname)) {
        return withSecurityHeaders(NextResponse.redirect(new URL("/connect", getAppBaseUrl(req)), 302), nonce);
      }
    }
  }

  return withSecurityHeaders(NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  }), nonce);
});

export { proxy };

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
