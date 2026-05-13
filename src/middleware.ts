import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { getAppBaseUrl } from "@/lib/app-base-url";
import { userHasGbpConnection } from "@/lib/db/gbp";

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

export default auth(async (req) => {
  const { pathname } = req.nextUrl;
  const sessionUser = req.auth?.user;

  if (pathname === "/demo/review-replies") {
    return NextResponse.rewrite(new URL("/demo-review-replies", req.url));
  }

  if (pathname === "/demo/review-booster") {
    return NextResponse.rewrite(new URL("/demo-review-booster", req.url));
  }

  if (pathname === "/api/public-demo/review-booster") {
    return NextResponse.rewrite(new URL("/api-public-demo-review-booster", req.url));
  }

  const demoCookie = req.cookies.get("ll_demo")?.value === "true";
  const isDemoMode = !sessionUser && demoCookie;

  const requestHeaders = new Headers(req.headers);
  if (isDemoMode) {
    requestHeaders.set("x-demo", "true");
  }

  if (isDemoMode) {
    if (pathname.startsWith("/api/google/oauth")) {
      return NextResponse.json(
        { error: "Google connection not available in demo mode" },
        { status: 403 }
      );
    }

    return NextResponse.next({
      request: { headers: requestHeaders },
    });
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
    return NextResponse.redirect(login);
  }

  const userId = sessionUser?.id;
  const allowDevBypassWithoutGbp = readAllowDashboardWithoutGbp();

  if (userId && !pathname.startsWith("/api")) {
    try {
      const hasGbp = await userHasGbpConnection(userId);

      if (
        (pathname === "/connect" || pathname.startsWith("/connect/")) &&
        hasGbp
      ) {
        return NextResponse.redirect(
          new URL("/dashboard", getAppBaseUrl(req)),
          302
        );
      }

      if (needsGbpBeforeAccess(pathname, allowDevBypassWithoutGbp) && !hasGbp) {
        return NextResponse.redirect(new URL("/connect", getAppBaseUrl(req)), 302);
      }
    } catch (e) {
      console.error("[middleware] GBP connection check failed", e);
    }
  }

  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
});

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
