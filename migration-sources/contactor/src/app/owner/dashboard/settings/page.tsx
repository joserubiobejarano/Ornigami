import { EmptyState } from "@/components/dashboard/empty-state";
import { OwnerPageShell } from "@/components/ui/owner-shell";
import { requireOwnerDashboardSession } from "@/server/auth/guards";
import { getDashboardSettingsData } from "@/server/services/dashboard.service";

import { OwnerSettingsForm } from "@/app/owner/dashboard/settings/settings-form";

export const dynamic = "force-dynamic";

export default async function OwnerDashboardSettingsPage() {
  const session = await requireOwnerDashboardSession();
  const data = await getDashboardSettingsData({ businessId: session.businessId });

  return (
    <OwnerPageShell
      title="Settings"
      subtitle="Manage your own notification and channel preferences."
      ownerName={session.fullName}
    >
      {!data ? (
        <EmptyState
          title="Business not found"
          description="Your account is not connected to a valid business yet."
        />
      ) : (
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <OwnerSettingsForm business={data.business} />
        </section>
      )}
    </OwnerPageShell>
  );
}
