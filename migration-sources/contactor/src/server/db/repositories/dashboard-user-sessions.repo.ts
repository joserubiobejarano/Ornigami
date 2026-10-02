import { and, eq, gt } from "drizzle-orm";

import { db } from "@/server/db/client";
import { dashboardUserSessions, type DashboardUserSession } from "@/server/db/schema";

type CreateDashboardUserSessionInput = {
  userId: string;
  sessionTokenHash: string;
  expiresAt: Date;
};

export async function createDashboardUserSession(
  input: CreateDashboardUserSessionInput,
): Promise<DashboardUserSession> {
  const [created] = await db
    .insert(dashboardUserSessions)
    .values({
      userId: input.userId,
      sessionTokenHash: input.sessionTokenHash,
      expiresAt: input.expiresAt,
    })
    .returning();

  return created;
}

export async function getActiveDashboardSessionByTokenHash(
  sessionTokenHash: string,
): Promise<DashboardUserSession | null> {
  const [result] = await db
    .select()
    .from(dashboardUserSessions)
    .where(
      and(
        eq(dashboardUserSessions.sessionTokenHash, sessionTokenHash),
        gt(dashboardUserSessions.expiresAt, new Date()),
      ),
    )
    .limit(1);

  return result ?? null;
}

export async function deleteDashboardSessionByTokenHash(sessionTokenHash: string): Promise<void> {
  await db
    .delete(dashboardUserSessions)
    .where(eq(dashboardUserSessions.sessionTokenHash, sessionTokenHash));
}

export async function deleteDashboardSessionsByUserId(userId: string): Promise<void> {
  await db.delete(dashboardUserSessions).where(eq(dashboardUserSessions.userId, userId));
}
