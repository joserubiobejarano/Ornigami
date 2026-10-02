import { redirect } from "next/navigation";

import { getInternalAdminDashboardSession } from "@/server/auth/session";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getInternalAdminDashboardSession();
  if (!session) redirect("/login?next=%2Fadmin");
  return children;
}
