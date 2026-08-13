import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { auth } from "@/auth";
import { getAppBaseUrl } from "@/lib/app-base-url";
import { userHasGbpConnection } from "@/lib/db/gbp";
import { userHasActiveAgentAccess } from "@/lib/db/businesses";

function isProtectedAppPage(pathname: string): boolean {
  const prefixes = [
    "/dashboard",
    "/reviews",
    "/content",
    "/audit",
    "/settings",
    "/connect",
  ];
  return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/** Paths that skip the GBP gate when ALLOW_DASHBOARD_WITHOUT_GBP is set (dev / preview). */
function isGbpDevBypassPath(pathname: string): boolean {
  const prefixes = ["/dashboard", "/reviews", "/settings"];
  return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/** Logged-in app areas that require GBP before access (not /connect). */
function needsGbpBeforeAccess(
  pathname: string,
  allowDevBypassWithoutGbp: boolean
): boolean {
  if (allowDevBypassWithoutGbp && isGbpDevBypassPath(pathname)) {
    return false;
  }
  const prefixes = ["/dashboard", "/reviews", "/content", "/audit", "/settings"];
  return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

function readAllowDashboardWithoutGbp(): boolean {
  const v = process.env.ALLOW_DASHBOARD_WITHOUT_GBP?.trim().toLowerCase();
  return v === "true" || v === "1" || v === "yes";
}

function buildContentSecurityPolicy(nonce: string): string {
  const developmentScriptPolicy = process.env.NODE_ENV !== "production" ? " 'unsafe-eval'" : "";
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data: https:",
    "style-src 'self' 'unsafe-inline' https:",
    `script-src 'self' 'nonce-${nonce}'${developmentScriptPolicy} https://js.stripe.com https://www.googletagmanager.com https://www.google.com https://www.gstatic.com`,
    "connect-src 'self' https://api.stripe.com https://checkout.stripe.com https://api.openai.com https://api.resend.com https://oauth2.googleapis.com https://mybusiness.googleapis.com https://businessprofileperformance.googleapis.com https://generativelanguage.googleapis.com https://*.neon.tech https://*.vercel.app https://*.sentry.io",
    "frame-src 'self' https://js.stripe.com https://hooks.stripe.com https://checkout.stripe.com https://www.google.com",
    "object-src 'none'",
  ].join("; ");
}

const PUBLIC_STATIC_ROUTES = new Set([
  "/",
  "/about",
  "/pricing",
  "/review-replies",
  "/review-booster",
  "/local-seo",
  "/privacy",
  "/terms",
  "/legal",
  "/contact",
  "/free-audit",
  "/demo",
  "/demo-review-replies",
  "/demo-review-booster",
  "/feedback",
  "/login",
  "/signup",
]);

function isPublicStaticRoute(pathname: string): boolean {
  return PUBLIC_STATIC_ROUTES.has(pathname);
}

function readStaticScriptHashes(): string[] {
  const filePath = join(process.cwd(), ".next", "static-csp-hashes.json");
  if (!existsSync(filePath)) return [];
  try {
    const parsed = JSON.parse(readFileSync(filePath, "utf8")) as unknown;
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : [];
  } catch {
    return [];
  }
}

function buildStaticContentSecurityPolicy(): string {
  const developmentScriptPolicy = process.env.NODE_ENV !== "production" ? " 'unsafe-eval'" : "";
  const scriptHashes = readStaticScriptHashes().map((hash) => `'sha256-${hash}'`).join(" ");
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data: https:",
    "style-src 'self' 'unsafe-inline' https:",
    `script-src 'self' ${scriptHashes}${developmentScriptPolicy} https://js.stripe.com https://www.googletagmanager.com https://www.google.com https://www.gstatic.com`,
    "connect-src 'self' https://api.stripe.com https://checkout.stripe.com https://api.openai.com https://api.resend.com https://oauth2.googleapis.com https://mybusiness.googleapis.com https://businessprofileperformance.googleapis.com https://generativelanguage.googleapis.com https://*.neon.tech https://*.vercel.app https://*.sentry.io",
    "frame-src 'self' https://js.stripe.com https://hooks.stripe.com https://checkout.stripe.com https://www.google.com",
    "object-src 'none'",
  ].join("; ");
}

function withSecurityHeaders(response: NextResponse, nonce: string): NextResponse {
  response.headers.set("Content-Security-Policy", buildContentSecurityPolicy(nonce));
  response.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
  return response;
}

function withStaticSecurityHeaders(response: NextResponse): NextResponse {
  response.headers.set("Content-Security-Policy", buildStaticContentSecurityPolicy());
  response.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
  return response;
}

const proxy = auth(async (req) => {
  const { pathname } = req.nextUrl;
  const sessionUser = req.auth?.user;

  if (pathname === "/demo/review-replies") {
    return withStaticSecurityHeaders(NextResponse.rewrite(new URL("/demo-review-replies", req.url)));
  }

  if (pathname === "/demo/review-booster") {
    return withStaticSecurityHeaders(NextResponse.rewrite(new URL("/demo-review-booster", req.url)));
  }

  if (isPublicStaticRoute(pathname)) {
    return withStaticSecurityHeaders(NextResponse.next());
  }

  const nonce = randomBytes(16).toString("base64url");
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-nonce", nonce);
  // Next.js reads the request CSP to apply the nonce to streamed inline
  // hydration scripts. The response CSP alone is too late for those scripts.
  requestHeaders.set("Content-Security-Policy", buildContentSecurityPolicy(nonce));

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
  const allowDevBypassWithoutGbp = readAllowDashboardWithoutGbp();

  if (userId && (isProtectedAppPage(pathname) || pathname === "/connect" || pathname.startsWith("/connect/"))) {
    try {
      const hasGbp = await userHasGbpConnection(userId);

      if (
        (pathname === "/connect" || pathname.startsWith("/connect/")) &&
        hasGbp
      ) {
        return withSecurityHeaders(NextResponse.redirect(
          new URL("/dashboard", getAppBaseUrl(req)),
          302
        ), nonce);
      }

      const canUseBoosterWithoutGbp =
        pathname === "/dashboard" ||
        pathname === "/dashboard/billing" ||
        pathname.startsWith("/dashboard/agents/review-booster");
      const hasRepliesAccess = await userHasActiveAgentAccess(userId, "review_replies");

      if (
        needsGbpBeforeAccess(pathname, allowDevBypassWithoutGbp) &&
        !hasGbp &&
        !(canUseBoosterWithoutGbp && !hasRepliesAccess)
      ) {
        return withSecurityHeaders(NextResponse.redirect(new URL("/connect", getAppBaseUrl(req)), 302), nonce);
      }
    } catch (e) {
      console.error("[middleware] GBP connection check failed", e);
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
