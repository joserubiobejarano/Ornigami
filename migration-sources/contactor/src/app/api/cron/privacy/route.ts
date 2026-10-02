import { NextResponse } from "next/server";
import { lt } from "drizzle-orm";

import { isAuthorizedCronRequest } from "@/server/auth/cron";
import { db } from "@/server/db/client";
import { dateDaysAgo, PRIVACY_RETENTION_DAYS } from "@/server/privacy-retention";
import { conversations, dashboardLoginAttempts, dashboardUserSessions, formRateLimits, leadEvents, leads, messages, onboardingRequests, formSubmissions } from "@/server/db/schema";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const cutoff = dateDaysAgo(PRIVACY_RETENTION_DAYS.operationalRecords);
  const stateCutoff = dateDaysAgo(PRIVACY_RETENTION_DAYS.rateLimitState);
  await db.delete(messages).where(lt(messages.createdAt, cutoff));
  await db.delete(conversations).where(lt(conversations.updatedAt, cutoff));
  await db.delete(formSubmissions).where(lt(formSubmissions.createdAt, cutoff));
  await db.delete(leadEvents).where(lt(leadEvents.createdAt, cutoff));
  await db.delete(leads).where(lt(leads.createdAt, cutoff));
  await db.delete(onboardingRequests).where(lt(onboardingRequests.createdAt, cutoff));
  await db.delete(dashboardUserSessions).where(lt(dashboardUserSessions.expiresAt, new Date()));
  await db.delete(dashboardLoginAttempts).where(lt(dashboardLoginAttempts.updatedAt, stateCutoff));
  await db.delete(formRateLimits).where(lt(formRateLimits.updatedAt, stateCutoff));
  return NextResponse.json({ ok: true });
}
