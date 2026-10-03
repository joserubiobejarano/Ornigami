import { DashboardLayoutClient } from "@/components/dashboard/dashboard-layout";
import { requireUser } from "@/lib/auth";
import { resolveBusinessForSessionUserStrict } from "@/lib/api-security";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await requireUser();
  let canManageBilling = false;
  try {
    const context = await resolveBusinessForSessionUserStrict(session.user.id);
    canManageBilling = context.role === "owner";
  } catch {
    // The server UI fails closed; route and API authorization remains authoritative.
  }
  return <DashboardLayoutClient canManageBilling={canManageBilling}>{children}</DashboardLayoutClient>;
}
