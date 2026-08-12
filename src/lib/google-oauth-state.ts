import crypto from "node:crypto";

type GoogleOAuthStatePayload = {
  uid: string;
  nonce: string;
  exp: number;
};

const STATE_TTL_SECONDS = 10 * 60;

function getSigningSecret(): string {
  const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret && process.env.NODE_ENV === "production") throw new Error("AUTH_SECRET is required in production.");
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

export function buildGoogleOAuthState(userId: string): string {
  const payload: GoogleOAuthStatePayload = {
    uid: userId,
    nonce: crypto.randomBytes(16).toString("hex"),
    exp: Math.floor(Date.now() / 1000) + STATE_TTL_SECONDS,
  };
  const encodedPayload = base64url(JSON.stringify(payload));
  const signature = signPayload(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

export function parseGoogleOAuthState(rawState: string): { valid: boolean; userId?: string; reason?: string } {
  const [encodedPayload, signature] = rawState.split(".");
  if (!encodedPayload || !signature) {
    return { valid: false, reason: "missing_parts" };
  }

  const expected = signPayload(encodedPayload);
  const providedBuf = Buffer.from(signature);
  const expectedBuf = Buffer.from(expected);
  if (providedBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(providedBuf, expectedBuf)) {
    return { valid: false, reason: "bad_signature" };
  }

  try {
    const payload = JSON.parse(unbase64url(encodedPayload)) as GoogleOAuthStatePayload;
    if (!payload.uid || !payload.exp) {
      return { valid: false, reason: "bad_payload" };
    }
    if (payload.exp < Math.floor(Date.now() / 1000)) {
      return { valid: false, reason: "expired" };
    }
    return { valid: true, userId: payload.uid };
  } catch {
    return { valid: false, reason: "decode_failed" };
  }
}
