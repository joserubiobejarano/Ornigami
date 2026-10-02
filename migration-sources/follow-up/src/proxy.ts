import { NextResponse, type NextRequest } from "next/server";
import { isFollowupAdminRequest, unauthorizedResponse } from "@/server/auth";

export function proxy(request: NextRequest) {
  if (isFollowupAdminRequest(request)) return NextResponse.next();
  return unauthorizedResponse();
}

export const config = {
  matcher: ["/dashboard/:path*", "/api/followups/:path*", "/api/privacy/:path*"],
};
