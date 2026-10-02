import { and, eq } from "drizzle-orm";

import { db } from "@/server/db/client";
import { dashboardUsers, type DashboardUser } from "@/server/db/schema";

type CreateDashboardUserInput = {
  fullName: string;
  email: string;
  passwordHash: string;
  businessId?: string | null;
  role?: "owner" | "internal_admin";
};

export async function getDashboardUserByEmail(email: string): Promise<DashboardUser | null> {
  const [result] = await db
    .select()
    .from(dashboardUsers)
    .where(eq(dashboardUsers.email, email.toLowerCase()))
    .limit(1);

  return result ?? null;
}

export async function getDashboardUserById(id: string): Promise<DashboardUser | null> {
  const [result] = await db
    .select()
    .from(dashboardUsers)
    .where(eq(dashboardUsers.id, id))
    .limit(1);

  return result ?? null;
}

export async function getOwnerDashboardUserByBusinessId(
  businessId: string,
): Promise<DashboardUser | null> {
  const [result] = await db
    .select()
    .from(dashboardUsers)
    .where(and(eq(dashboardUsers.businessId, businessId), eq(dashboardUsers.role, "owner")))
    .limit(1);

  return result ?? null;
}

export async function getInternalAdminDashboardUserById(
  id: string,
): Promise<DashboardUser | null> {
  const [result] = await db
    .select()
    .from(dashboardUsers)
    .where(and(eq(dashboardUsers.id, id), eq(dashboardUsers.role, "internal_admin")))
    .limit(1);

  return result ?? null;
}

export async function createDashboardUser(
  input: CreateDashboardUserInput,
): Promise<DashboardUser> {
  const [created] = await db
    .insert(dashboardUsers)
    .values({
      fullName: input.fullName,
      email: input.email.toLowerCase(),
      passwordHash: input.passwordHash,
      businessId: input.businessId ?? null,
      role: input.role ?? "owner",
      updatedAt: new Date(),
    })
    .returning();

  return created;
}

export async function markDashboardUserLastLogin(userId: string): Promise<void> {
  await db
    .update(dashboardUsers)
    .set({
      lastLoginAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(dashboardUsers.id, userId));
}
