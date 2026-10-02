import { PageShell } from "@/components/ui/page-shell";

export default function DashboardLoading() {
  return (
    <PageShell title="Loading dashboard..." subtitle="Fetching latest leads and activity.">
      <section className="grid gap-4 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div
            key={index}
            className="h-24 animate-pulse rounded-xl border border-slate-200 bg-white"
          />
        ))}
      </section>
      <section className="mt-6 h-72 animate-pulse rounded-xl border border-slate-200 bg-white" />
    </PageShell>
  );
}
