import { NextResponse, type NextRequest } from "next/server";

import { getInternalAdminDashboardSessionFromRequest } from "@/server/auth/session";

const OWNER_SESSION_COOKIE = "stl_owner_session";

export async function proxy(request: NextRequest) {
  const hasOwnerSessionCookie = Boolean(request.cookies.get(OWNER_SESSION_COOKIE)?.value);
  const path = request.nextUrl.pathname;

  if (path.startsWith("/admin") || path.startsWith("/internal-dashboard")) {
    const internalAdminSession = await getInternalAdminDashboardSessionFromRequest(request);
    if (!internalAdminSession) {
      return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(path)}`, request.url));
    }
  }

  if (path.startsWith("/internal-dashboard")) {
    return NextResponse.redirect(new URL(path.replace("/internal-dashboard", "/admin"), request.url));
  }

  if (path.startsWith("/owner/dashboard")) {
    return NextResponse.redirect(new URL(path.replace("/owner/dashboard", "/dashboard"), request.url));
  }

  if (!hasOwnerSessionCookie && path.startsWith("/dashboard")) {
    if (path === "/dashboard/onboarding" || path.startsWith("/dashboard/onboarding/")) {
      return NextResponse.redirect(new URL(path.replace("/dashboard", "/admin"), request.url));
    }

    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (hasOwnerSessionCookie && path === "/login") {
    const internalAdminSession = await getInternalAdminDashboardSessionFromRequest(request);
    return NextResponse.redirect(new URL(internalAdminSession ? "/admin" : "/dashboard", request.url));
  }

  if (!hasOwnerSessionCookie && path.startsWith("/owner")) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const response = NextResponse.next();
  if (path.startsWith("/f/")) response.headers.delete("X-Frame-Options");
  return response;
}

export const config = {
  matcher: ["/admin/:path*", "/dashboard/:path*", "/internal-dashboard/:path*", "/owner/:path*", "/login"],
};
