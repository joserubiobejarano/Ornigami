import { EmptyState } from "@/components/dashboard/empty-state";
import { PageShell } from "@/components/ui/page-shell";
import { getDashboardSettingsData } from "@/server/services/dashboard.service";
import { DashboardSettingsForm } from "@/app/internal-dashboard/settings/settings-form";

export const dynamic = "force-dynamic";

export default async function DashboardSettingsPage() {
  const data = await getDashboardSettingsData();

  return (
    <PageShell
      title="Settings"
      subtitle="Edit business profile and qualification context for the demo business."
    >
      {!data ? (
        <EmptyState
          title="No seeded demo business found"
          description="Run the seed script to create the demo business before editing settings."
        />
      ) : (
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <DashboardSettingsForm
            business={data.business}
            promptSettings={data.promptSettings}
          />
        </section>
      )}
    </PageShell>
  );
}

