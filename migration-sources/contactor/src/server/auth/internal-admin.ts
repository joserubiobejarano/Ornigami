import { getInternalAdminDashboardSession } from "@/server/auth/session";
import { getBusinessById } from "@/server/db/repositories/businesses.repo";

export async function requireInternalAdminSession() {
  const session = await getInternalAdminDashboardSession();

  if (!session) {
    throw new Error("Unauthorized: an internal admin session is required.");
  }

  return session;
}

export async function requireInternalAdminBusinessAccess(businessId: string) {
  await requireInternalAdminSession();
  const business = await getBusinessById(businessId);
  if (!business) throw new Error("Business not found.");
  return business;
}
