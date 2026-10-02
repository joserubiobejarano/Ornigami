import { LeadForm } from "@/app/f/[businessSlug]/lead-form";
import { notFound } from "next/navigation";

import { getHostedFormBusinessBySlug } from "@/server/services/form-submission.service";

type Props = {
  params: Promise<{
    businessSlug: string;
  }>;
};

export default async function HostedFormPage({ params }: Props) {
  const { businessSlug } = await params;
  const business = await getHostedFormBusinessBySlug(businessSlug);
  if (!business) {
    notFound();
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-2xl px-4 py-10 sm:px-6">
      <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-violet-700">Ornigami Contact · {business.name}</p>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900 sm:text-3xl">
          {business.name}
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          Share your details and message. Our team will follow up on{" "}
          {business.preferredChannel === "whatsapp" ? "WhatsApp" : "SMS"}.
        </p>
        <p className="mt-3 text-xs text-slate-500">Your details go directly to this business so they can respond through their preferred channel.</p>
      </div>
      <LeadForm
        businessSlug={business.slug}
        preferredChannel={business.preferredChannel}
      />
    </main>
  );
}
