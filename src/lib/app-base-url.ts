import type { NextRequest } from "next/server";

import { normalizeAppBaseUrl } from "@/lib/env";
import { getOptionalEnv } from "@/lib/env";

/**
 * Canonical browser origin for redirects. Prefer `NEXT_PUBLIC_APP_URL` so
 * middleware redirects stay correct when Auth.js rewrites `req.nextUrl` via
 * `AUTH_URL` (must still point at your app origin, not a DB/auth host).
 */
export function getAppBaseUrl(req: NextRequest): string {
  const raw = getOptionalEnv("NEXT_PUBLIC_APP_URL")?.trim();
  const fromEnv = raw ? normalizeAppBaseUrl(raw) : undefined;
  if (fromEnv) return fromEnv;

  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (!host) {
    try {
      return new URL(req.url).origin;
    } catch {
      return "http://localhost:3000";
    }
  }
  const h = host.toLowerCase();
  const isLocal =
    h.startsWith("localhost") ||
    h.startsWith("127.0.0.1") ||
    h.startsWith("[::1]");
  const proto =
    req.headers.get("x-forwarded-proto") ?? (isLocal ? "http" : "https");
  return `${proto}://${host}`;
}
