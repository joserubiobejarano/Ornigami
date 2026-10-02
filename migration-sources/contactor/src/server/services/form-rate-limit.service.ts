import { createHash } from "node:crypto";

import { eq } from "drizzle-orm";

import { env } from "@/server/env";
import { db } from "@/server/db/client";
import { formRateLimits } from "@/server/db/schema";

type FormRateLimitResult = {
  limited: boolean;
  key: string;
  retryAfterSeconds: number;
  remaining: number;
};

function buildKey(input: { businessSlug: string; ipAddress?: string | null; userAgent?: string | null }) {
  const raw = [input.businessSlug.trim().toLowerCase(), input.ipAddress?.trim() || "unknown_ip", input.userAgent?.trim().slice(0, 120) || "unknown_ua"].join("|");
  return createHash("sha256").update(raw).digest("hex");
}

export async function checkFormRateLimit(input: {
  businessSlug: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}): Promise<FormRateLimitResult> {
  const key = buildKey(input);
  const now = new Date();
  const windowMs = env.FORM_RATE_LIMIT_WINDOW_SECONDS * 1000;
  const maxSubmissions = env.FORM_RATE_LIMIT_MAX_SUBMISSIONS;
  const [existing] = await db.select().from(formRateLimits).where(eq(formRateLimits.keyHash, key)).limit(1);
  const withinWindow = existing && existing.windowStartedAt.getTime() > now.getTime() - windowMs;
  const hits = withinWindow ? Number(existing.hits) : 0;
  const limited = hits >= maxSubmissions;
  const nextHits = limited ? hits : hits + 1;
  const windowStartedAt = withinWindow ? existing.windowStartedAt : now;

  await db.insert(formRateLimits).values({
    keyHash: key,
    hits: String(nextHits),
    windowStartedAt,
    updatedAt: now,
  }).onConflictDoUpdate({
    target: formRateLimits.keyHash,
    set: { hits: String(nextHits), windowStartedAt, updatedAt: now },
  });

  const retryAfterMs = limited ? windowStartedAt.getTime() + windowMs - now.getTime() : 0;
  return {
    limited,
    key,
    retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)),
    remaining: Math.max(0, maxSubmissions - nextHits),
  };
}
