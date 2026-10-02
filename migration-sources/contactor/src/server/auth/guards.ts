import { redirect } from "next/navigation";

import { getOwnerDashboardSession } from "@/server/auth/session";

export async function requireOwnerDashboardSession() {
  const session = await getOwnerDashboardSession();

  if (!session) {
    redirect("/login");
  }

  if (session.role !== "owner" || !session.businessId) {
    redirect("/admin");
  }

  return {
    ...session,
    role: "owner" as const,
    businessId: session.businessId as string,
  };
}
