import crypto from "node:crypto";
import { getOptionalEnv } from "@/lib/env";

type GoogleOAuthStatePayload = {
  uid: string;
  bid: string;
  oid: string;
  nonce: string;
  exp: number;
};

const STATE_TTL_SECONDS = 10 * 60;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function getSigningSecret(): string {
  const secret = getOptionalEnv("AUTH_SECRET") || getOptionalEnv("NEXTAUTH_SECRET");
  if (!secret && getOptionalEnv("NODE_ENV") === "production") throw new Error("AUTH_SECRET is required in production.");
  return secret || "local-dev-google-oauth-secret";
}

function base64url(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function unbase64url(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

function signPayload(encodedPayload: string): string {
  return crypto.createHmac("sha256", getSigningSecret()).update(encodedPayload).digest("base64url");
}

export function buildGoogleOAuthState(userId: string, businessId: string, ownerUserId: string): string {
  const payload: GoogleOAuthStatePayload = {
    uid: userId,
    bid: businessId,
    oid: ownerUserId,
    nonce: crypto.randomBytes(16).toString("hex"),
    exp: Math.floor(Date.now() / 1000) + STATE_TTL_SECONDS,
  };
  const encodedPayload = base64url(JSON.stringify(payload));
  const signature = signPayload(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

export function parseGoogleOAuthState(rawState: string): {
  valid: boolean; userId?: string; businessId?: string; ownerUserId?: string; reason?: string;
} {
  const parts = rawState.split(".");
  if (parts.length !== 2) {
    return { valid: false, reason: "missing_parts" };
  }
  const [encodedPayload, signature] = parts;
  if (!encodedPayload || !signature) return { valid: false, reason: "missing_parts" };

  const expected = signPayload(encodedPayload);
  const providedBuf = Buffer.from(signature);
  const expectedBuf = Buffer.from(expected);
  if (providedBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(providedBuf, expectedBuf)) {
    return { valid: false, reason: "bad_signature" };
  }

  try {
    const decoded: unknown = JSON.parse(unbase64url(encodedPayload));
    if (!decoded || typeof decoded !== "object" || Array.isArray(decoded)) {
      return { valid: false, reason: "bad_payload" };
    }
    const payload = decoded as GoogleOAuthStatePayload;
    if (!UUID_RE.test(payload.uid) || !UUID_RE.test(payload.bid) || !UUID_RE.test(payload.oid) ||
        typeof payload.nonce !== "string" || !/^[0-9a-f]{32}$/i.test(payload.nonce) ||
        typeof payload.exp !== "number" || !Number.isSafeInteger(payload.exp)) {
      return { valid: false, reason: "bad_payload" };
    }
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp <= now) {
      return { valid: false, reason: "expired" };
    }
    if (payload.exp > now + STATE_TTL_SECONDS) return { valid: false, reason: "bad_payload" };
    return { valid: true, userId: payload.uid, businessId: payload.bid, ownerUserId: payload.oid };
  } catch {
    return { valid: false, reason: "decode_failed" };
  }
}
