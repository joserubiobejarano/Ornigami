import { createHmac, timingSafeEqual } from "node:crypto";

export type ReviewLinkPayload = { businessId: string; visitId: string; reviewUrl: string };

function secret(): string {
  const value = process.env.REVIEW_BOOSTER_UNSUBSCRIBE_SECRET || process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (!value && process.env.NODE_ENV === "production") throw new Error("A review link signing secret is required in production.");
  return value || "review-booster-local-secret";
}
function encode(value: string): string { return Buffer.from(value, "utf8").toString("base64url"); }
function decode(value: string): string { return Buffer.from(value, "base64url").toString("utf8"); }
function sign(value: string): string { return createHmac("sha256", secret()).update(value).digest("hex"); }

export function buildReviewLinkToken(payload: ReviewLinkPayload): string {
  const encoded = encode(JSON.stringify(payload));
  return `${encoded}.${sign(encoded)}`;
}

export function verifyReviewLinkToken(token: string): ReviewLinkPayload | null {
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return null;
  const expected = sign(encoded);
  const actual = Buffer.from(signature);
  const wanted = Buffer.from(expected);
  if (actual.length !== wanted.length || !timingSafeEqual(actual, wanted)) return null;
  try {
    const payload = JSON.parse(decode(encoded)) as ReviewLinkPayload;
    if (!payload.businessId || !payload.visitId || !/^https?:\/\//i.test(payload.reviewUrl)) return null;
    return payload;
  } catch {
    return null;
  }
}

export function buildReviewLinkUrl(payload: ReviewLinkPayload): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://ornigami.com";
  return `${baseUrl.replace(/\/$/, "")}/r/${buildReviewLinkToken(payload)}`;
}
