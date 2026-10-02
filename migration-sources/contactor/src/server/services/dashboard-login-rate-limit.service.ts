import { createHash } from "node:crypto";

import { and, eq, gt } from "drizzle-orm";

import { db } from "@/server/db/client";
import { dashboardLoginAttempts } from "@/server/db/schema";

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;
const LOCK_MS = 15 * 60 * 1000;

function hashKey(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function keys(email: string, ipAddress?: string | null): string[] {
  const normalizedEmail = email.trim().toLowerCase();
  const normalizedIp = ipAddress?.trim() || "unknown";
  return [hashKey(`email:${normalizedEmail}`), hashKey(`ip:${normalizedIp}`)];
}

export async function isDashboardLoginRateLimited(input: {
  email: string;
  ipAddress?: string | null;
}): Promise<boolean> {
  const now = new Date();
  const rows = await db
    .select({ failures: dashboardLoginAttempts.failures, lockedUntil: dashboardLoginAttempts.lockedUntil })
    .from(dashboardLoginAttempts)
    .where(and(
      eq(dashboardLoginAttempts.keyHash, keys(input.email, input.ipAddress)[0]),
      gt(dashboardLoginAttempts.lockedUntil, now),
    ))
    .limit(1);

  if (rows.length > 0) return true;

  const accountKey = keys(input.email, input.ipAddress)[0];
  const ipKey = keys(input.email, input.ipAddress)[1];
  const candidates = await db
    .select({ keyHash: dashboardLoginAttempts.keyHash, failures: dashboardLoginAttempts.failures, windowStartedAt: dashboardLoginAttempts.windowStartedAt })
    .from(dashboardLoginAttempts)
    .where(and(
      eq(dashboardLoginAttempts.keyHash, accountKey),
      gt(dashboardLoginAttempts.windowStartedAt, new Date(now.getTime() - WINDOW_MS)),
    ))
    .limit(1);
  const ipCandidates = await db
    .select({ failures: dashboardLoginAttempts.failures, windowStartedAt: dashboardLoginAttempts.windowStartedAt })
    .from(dashboardLoginAttempts)
    .where(and(
      eq(dashboardLoginAttempts.keyHash, ipKey),
      gt(dashboardLoginAttempts.windowStartedAt, new Date(now.getTime() - WINDOW_MS)),
    ))
    .limit(1);

  return [...candidates, ...ipCandidates].some((row) => Number(row.failures) >= MAX_FAILURES);
}

export async function recordDashboardLoginFailure(input: {
  email: string;
  ipAddress?: string | null;
}): Promise<void> {
  const now = new Date();
  for (const keyHash of keys(input.email, input.ipAddress)) {
    const existing = await db
      .select({ failures: dashboardLoginAttempts.failures, windowStartedAt: dashboardLoginAttempts.windowStartedAt })
      .from(dashboardLoginAttempts)
      .where(eq(dashboardLoginAttempts.keyHash, keyHash))
      .limit(1);
    const row = existing[0];
    const withinWindow = row && row.windowStartedAt.getTime() > now.getTime() - WINDOW_MS;
    const failures = withinWindow ? Number(row.failures) + 1 : 1;
    await db
      .insert(dashboardLoginAttempts)
      .values({
        keyHash,
        failures: String(failures),
        windowStartedAt: withinWindow ? row.windowStartedAt : now,
        lockedUntil: failures >= MAX_FAILURES ? new Date(now.getTime() + LOCK_MS) : null,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: dashboardLoginAttempts.keyHash,
        set: {
          failures: String(failures),
          windowStartedAt: withinWindow ? row.windowStartedAt : now,
          lockedUntil: failures >= MAX_FAILURES ? new Date(now.getTime() + LOCK_MS) : null,
          updatedAt: now,
        },
      });
  }
}

export async function clearDashboardLoginFailures(input: {
  email: string;
  ipAddress?: string | null;
}): Promise<void> {
  for (const keyHash of keys(input.email, input.ipAddress)) {
    await db.delete(dashboardLoginAttempts).where(eq(dashboardLoginAttempts.keyHash, keyHash));
  }
}
