import Link from "next/link";

import { EmptyState } from "@/components/dashboard/empty-state";
import { PageShell } from "@/components/ui/page-shell";
import { businessTypeLabels } from "@/lib/onboarding";
import { deleteOnboardingRequestAction } from "@/app/internal-dashboard/onboarding/actions";
import { DeleteOnboardingButton } from "@/app/internal-dashboard/onboarding/delete-onboarding-button";
import { getOnboardingRequestsForReview } from "@/server/services/onboarding.service";

export const dynamic = "force-dynamic";

export default async function DashboardOnboardingPage() {
  const requests = await getOnboardingRequestsForReview();

  return (
    <PageShell
      title="Onboarding Requests"
      subtitle="Review submitted setup forms and prepare manual assistant configuration."
    >
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-slate-600">Business</th>
              <th className="px-4 py-3 text-left font-medium text-slate-600">Business type</th>
              <th className="px-4 py-3 text-left font-medium text-slate-600">Contact</th>
              <th className="px-4 py-3 text-left font-medium text-slate-600">Status</th>
              <th className="px-4 py-3 text-left font-medium text-slate-600">Created</th>
              <th className="px-4 py-3 text-right font-medium text-slate-600">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {requests.length === 0 ? (
              <tr>
                <td className="px-4 py-6" colSpan={6}>
                  <EmptyState
                    title="No onboarding requests yet"
                    description="New requests will appear here after a business submits the onboarding form."
                  />
                </td>
              </tr>
            ) : (
              requests.map((request) => (
                <tr key={request.id} className="align-top">
                  <td className="px-4 py-3 text-slate-900">
                    <Link
                      href={`/admin/onboarding/${request.id}`}
                      className="font-medium text-slate-900 underline underline-offset-2"
                    >
                      {request.businessName}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-700">{businessTypeLabels[request.businessType]}</td>
                  <td className="px-4 py-3 text-slate-700">
                    <p className="font-medium text-slate-900">{request.contactName}</p>
                    <p className="text-xs text-slate-500">{request.contactEmail}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    <StatusBadge status={request.status} />
                  </td>
                  <td className="px-4 py-3 text-slate-700">{request.createdAt.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right">
                    <form action={deleteOnboardingRequestAction.bind(null, request.id)}>
                      <DeleteOnboardingButton businessName={request.businessName} />
                    </form>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </PageShell>
  );
}

function StatusBadge({ status }: { status: "new" | "reviewed" | "configured" | "archived" }) {
  const styles: Record<typeof status, string> = {
    new: "border-blue-200 bg-blue-50 text-blue-800",
    reviewed: "border-amber-200 bg-amber-50 text-amber-800",
    configured: "border-emerald-200 bg-emerald-50 text-emerald-800",
    archived: "border-slate-200 bg-slate-100 text-slate-700",
  };

  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${styles[status]}`}>
      {status}
    </span>
  );
}

