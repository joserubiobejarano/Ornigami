const MAX_RETURN_PATH_LENGTH = 2048;
const ORIGIN = "https://ornigami.invalid";

function isSafeLocalPath(value: string): boolean {
  if (!value.startsWith("/") || value.startsWith("//") || /[\\\u0000-\u001f\u007f]/.test(value)) return false;
  let decoded = value;
  for (let i = 0; i < 16; i++) {
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    } catch {
      return false;
    }
    if (i === 15 && decoded !== value) return false;
  }
  if (!decoded.startsWith("/") || decoded.startsWith("//") || /[\\\u0000-\u001f\u007f]/.test(decoded)) return false;
  try {
    const url = new URL(decoded, ORIGIN);
    return url.origin === ORIGIN && url.pathname.startsWith("/") && !url.pathname.startsWith("//");
  } catch {
    return false;
  }
}

export function sanitizeAuthReturnPath(value: unknown, fallback = "/dashboard"): string {
  const safeFallback = typeof fallback === "string" && fallback.length <= MAX_RETURN_PATH_LENGTH && isSafeLocalPath(fallback)
    ? (() => { const url = new URL(fallback, ORIGIN); return `${url.pathname}${url.search}${url.hash}`; })()
    : "/dashboard";
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_RETURN_PATH_LENGTH || !isSafeLocalPath(value)) {
    return safeFallback;
  }
  const normalized = new URL(value, ORIGIN);
  const result = `${normalized.pathname}${normalized.search}${normalized.hash}`;
  if (result.length > MAX_RETURN_PATH_LENGTH || !isSafeLocalPath(result)) return safeFallback;
  return result;
}

export function getAuthReturnPath(searchParams: { get(name: string): string | null }): string {
  const callbackUrl = searchParams.get("callbackUrl");
  if (callbackUrl) return sanitizeAuthReturnPath(callbackUrl);
  const invite = searchParams.get("invite");
  if (invite && invite.length <= 512 && /^[A-Za-z0-9_-]+$/.test(invite)) {
    return `/team/invite/${encodeURIComponent(invite)}`;
  }
  return "/dashboard";
}

export function authPageHref(path: string, callbackUrl: string): string {
  const safePath = sanitizeAuthReturnPath(path, "/login");
  const url = new URL(safePath, ORIGIN);
  url.searchParams.set("callbackUrl", sanitizeAuthReturnPath(callbackUrl));
  return `${url.pathname}${url.search}${url.hash}`;
}
