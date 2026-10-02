import { headers } from "next/headers";

export async function resolveAppBaseUrl(): Promise<string> {
  if (process.env.APP_BASE_URL && process.env.APP_BASE_URL.trim().length > 0) {
    return process.env.APP_BASE_URL.trim().replace(/\/$/, "");
  }

  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const proto = requestHeaders.get("x-forwarded-proto") ?? "http";

  if (host) {
    return `${proto}://${host}`.replace(/\/$/, "");
  }

  return "http://localhost:3000";
}
