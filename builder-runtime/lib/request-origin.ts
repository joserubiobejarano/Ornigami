import type { BuilderRuntimeConfig } from "./runtime-config.ts";

/**
 * State-changing builder endpoints require the full configured external
 * origin. The intended reverse-proxy model terminates TLS at
 * `NEXT_PUBLIC_APP_URL` and forwards to the runtime; request URL, Host and
 * forwarded headers never widen the accepted origin.
 */
export function isSameOriginRequest(
  request: Request,
  config: BuilderRuntimeConfig,
): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin") return false;

  let expected: string;
  let supplied: string;
  try {
    expected = new URL(config.appUrl).origin;
    supplied = new URL(origin).origin;
  } catch {
    return false;
  }
  return supplied === expected;
}
