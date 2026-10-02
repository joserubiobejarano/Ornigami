import { timingSafeEqual } from "node:crypto";

function safeEqual(left: string | null, right: string | undefined): boolean {
  if (!right || left === null) return false;
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function isDevelopment(): boolean {
  return process.env.NODE_ENV !== "production";
}

export function isFollowupAdminRequest(request: Request): boolean {
  const username = process.env.FOLLOWUP_ADMIN_USER;
  const password = process.env.FOLLOWUP_ADMIN_PASSWORD;
  if ((!username || !password) && isDevelopment()) return true;

  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Basic ")) return false;

  try {
    const decoded = Buffer.from(authorization.slice(6), "base64").toString("utf8");
    const separator = decoded.indexOf(":");
    if (separator < 0) return false;
    return safeEqual(decoded.slice(0, separator), username) && safeEqual(decoded.slice(separator + 1), password);
  } catch {
    return false;
  }
}

export function isCronRequestAuthorized(request: Request): boolean {
  return isBearerSecretAuthorized(request, process.env.CRON_SECRET, "authorization");
}

export function isBookingWebhookAuthorized(request: Request): boolean {
  return isBearerSecretAuthorized(request, process.env.BOOKING_WEBHOOK_SECRET, "x-booking-webhook-secret");
}

function isBearerSecretAuthorized(request: Request, secret: string | undefined, headerName: string): boolean {
  if (!secret && isDevelopment()) return true;
  const received = request.headers.get(headerName);
  const value = headerName === "authorization" ? received?.replace(/^Bearer\s+/i, "") ?? null : received;
  return safeEqual(value, secret);
}

export function unauthorizedResponse(): Response {
  return new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401,
    headers: {
      "Content-Type": "application/json",
      "WWW-Authenticate": 'Basic realm="Follow-Up Admin"',
    },
  });
}
