import { createHmac, timingSafeEqual } from "crypto";

import { getServerAppUrl } from "@/lib/env";

type UnsubscribeTokenPayload = {
  businessId: string;
  customerEmail: string;
};

function getUnsubscribeSecret(): string {
  return (
    process.env.REVIEW_BOOSTER_UNSUBSCRIBE_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    "review-booster-local-secret"
  );
}

function toBase64Url(input: string): string {
  return Buffer.from(input, "utf8").toString("base64url");
}

function fromBase64Url(input: string): string {
  return Buffer.from(input, "base64url").toString("utf8");
}

function sign(data: string): string {
  return createHmac("sha256", getUnsubscribeSecret()).update(data).digest("hex");
}

export function buildUnsubscribeToken(payload: UnsubscribeTokenPayload): string {
  const normalized = {
    businessId: payload.businessId,
    customerEmail: payload.customerEmail.trim().toLowerCase(),
  };
  const encoded = toBase64Url(JSON.stringify(normalized));
  const signature = sign(encoded);
  return `${encoded}.${signature}`;
}

export function verifyUnsubscribeToken(token: string): UnsubscribeTokenPayload | null {
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return null;

  const expectedSignature = sign(encoded);
  const sigA = Buffer.from(signature, "utf8");
  const sigB = Buffer.from(expectedSignature, "utf8");
  if (sigA.length !== sigB.length || !timingSafeEqual(sigA, sigB)) {
    return null;
  }

  try {
    const parsed = JSON.parse(fromBase64Url(encoded)) as UnsubscribeTokenPayload;
    if (!parsed?.businessId || !parsed?.customerEmail) return null;
    return {
      businessId: parsed.businessId,
      customerEmail: parsed.customerEmail.trim().toLowerCase(),
    };
  } catch {
    return null;
  }
}

export function buildUnsubscribeUrl(payload: UnsubscribeTokenPayload): string {
  const token = buildUnsubscribeToken(payload);
  return `${getServerAppUrl()}/api/review-booster/unsubscribe?token=${encodeURIComponent(token)}`;
}
