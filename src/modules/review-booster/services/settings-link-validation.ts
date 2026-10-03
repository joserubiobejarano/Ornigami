import { isIP } from "node:net";

export const MAX_EXTERNAL_URL_LENGTH = 500;
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f]/;

function parseHttpsUrl(value: unknown): URL | null {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_EXTERNAL_URL_LENGTH || CONTROL_CHARS.test(value)) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.port || !url.hostname) return null;
    return url;
  } catch {
    return null;
  }
}

/** Only direct Google review destinations are accepted; arbitrary Google URLs can redirect elsewhere. */
export function isSafeGoogleReviewUrl(value: unknown): value is string {
  const url = parseHttpsUrl(value);
  if (!url) return false;
  const host = url.hostname.toLowerCase();
  if (host === "search.google.com") {
    const keys = [...url.searchParams.keys()];
    return url.pathname === "/local/writereview" && keys.length === 1 && keys[0] === "placeid" &&
      Boolean(url.searchParams.get("placeid")) && !url.hash;
  }
  if (host === "g.page") {
    return /^\/(?:r\/)?[A-Za-z0-9_-]+\/review\/?$/.test(url.pathname) && !url.search && !url.hash;
  }
  return false;
}

function isPrivateIp(host: string): boolean {
  const version = isIP(host);
  if (version === 4) {
    const [a, b] = host.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) ||
      (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19));
  }
  if (version === 6) {
    const normalized = host.toLowerCase();
    return normalized === "::" || normalized === "::1" || normalized.startsWith("fc") ||
      normalized.startsWith("fd") || /^fe[89ab]/.test(normalized) || normalized.startsWith("ff") ||
      normalized.startsWith("::ffff:");
  }
  return false;
}

/** Rebooking destinations are public HTTPS URLs; this validates only and never fetches/resolves them. */
export function isSafeBookingUrl(value: unknown): value is string {
  const url = parseHttpsUrl(value);
  if (!url) return false;
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  const ipHost = host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : host;
  const mappedIpv4 = ipHost.toLowerCase().startsWith("::ffff:") ? ipHost.slice(7) : ipHost;
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") ||
      host.endsWith(".internal") || !host.includes(".") || isPrivateIp(ipHost) || isPrivateIp(mappedIpv4)) return false;
  return true;
}

export function normalizeOptionalSetting(value: unknown): { valid: true; value: string | null } | { valid: false } {
  if (value === null) return { valid: true, value: null };
  if (typeof value !== "string") return { valid: false };
  const trimmed = value.trim();
  return { valid: true, value: trimmed || null };
}

export function isSafeSenderName(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 120 &&
    !CONTROL_CHARS.test(value) && !/[<>]/.test(value);
}

export function extractSafeGoogleReviewUrl(raw: unknown, placeId?: string | null): string | null {
  const record = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  const metadata = record.metadata && typeof record.metadata === "object" && !Array.isArray(record.metadata)
    ? record.metadata as Record<string, unknown>
    : {};
  for (const candidate of [metadata.newReviewUri, metadata.new_review_uri, record.newReviewUri, record.new_review_uri, record.reviewUrl, record.review_url]) {
    if (isSafeGoogleReviewUrl(candidate)) return candidate;
  }
  if (typeof placeId === "string" && placeId.trim()) {
    const fallback = `https://search.google.com/local/writereview?placeid=${encodeURIComponent(placeId.trim())}`;
    return isSafeGoogleReviewUrl(fallback) ? fallback : null;
  }
  return null;
}
