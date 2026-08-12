import { buildCoreUnsubscribeToken, verifyCoreUnsubscribeToken, type UnsubscribeTokenPayload } from "@/modules/review-booster/services/unsubscribe-token.core";

import { getServerAppUrl } from "@/lib/env";

function getUnsubscribeSecret(): string {
  const value = process.env.REVIEW_BOOSTER_UNSUBSCRIBE_SECRET || process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (!value && process.env.NODE_ENV === "production") throw new Error("A review unsubscribe signing secret is required in production.");
  return value || "review-booster-local-secret";
}

export function buildUnsubscribeToken(payload: UnsubscribeTokenPayload): string {
  return buildCoreUnsubscribeToken(payload, getUnsubscribeSecret());
}

export function verifyUnsubscribeToken(token: string): UnsubscribeTokenPayload | null {
  return verifyCoreUnsubscribeToken(token, getUnsubscribeSecret());
}
export function buildUnsubscribeUrl(payload: UnsubscribeTokenPayload): string {
  const token = buildUnsubscribeToken(payload);
  return `${getServerAppUrl()}/api/review-booster/unsubscribe?token=${encodeURIComponent(token)}`;
}
