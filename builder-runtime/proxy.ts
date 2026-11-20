import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import {
  applyBuilderProxySecurityHeaders,
  buildBuilderContentSecurityPolicy,
} from "@/lib/security-headers";

/**
 * The builder runtime proxy intentionally has no reputation Auth.js import.
 * It only supplies the builder nonce/CSP, no-store policy and security headers.
 */
export function proxy(request: NextRequest): NextResponse {
  const nonce = randomBytes(16).toString("base64url");
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set(
    "Content-Security-Policy",
    buildBuilderContentSecurityPolicy(nonce),
  );

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  applyBuilderProxySecurityHeaders(response.headers, nonce);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
