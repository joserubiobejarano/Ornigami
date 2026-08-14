import { buildCoreUnsubscribeToken, verifyCoreUnsubscribeToken, type UnsubscribeTokenPayload } from "@/modules/review-booster/services/unsubscribe-token.core";

import { getOptionalEnv, getServerAppUrl } from "@/lib/env";

function getUnsubscribeSecret(): string {
  const value = getOptionalEnv("REVIEW_BOOSTER_UNSUBSCRIBE_SECRET") || getOptionalEnv("AUTH_SECRET") || getOptionalEnv("NEXTAUTH_SECRET");
  if (!value && getOptionalEnv("NODE_ENV") === "production") throw new Error("A review unsubscribe signing secret is required in production.");
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
