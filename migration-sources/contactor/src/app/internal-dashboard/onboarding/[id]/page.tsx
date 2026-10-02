import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { ActivationPanel } from "@/app/internal-dashboard/onboarding/[id]/activation-panel";
import { OnboardingReviewForm } from "@/app/internal-dashboard/onboarding/[id]/review-form";
import { PageShell } from "@/components/ui/page-shell";
import {
  businessTypeLabels,
  onboardingLanguageLabels,
  pricingModeLabels,
  toneLabels,
  websitePlatformLabels,
} from "@/lib/onboarding";
import { buildDefaultReviewDraft } from "@/server/services/onboarding-business-conversion.service";
import { getOnboardingRequestDetail } from "@/server/services/onboarding.service";
import { getBusinessActivationData } from "@/server/services/dashboard.service";
import { resolveAppBaseUrl } from "@/server/lib/app-url";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function OnboardingRequestDetailPage({ params }: Props) {
  const { id } = await params;
  const request = await getOnboardingRequestDetail(id);

  if (!request) {
    notFound();
  }

  const reviewDraft = buildDefaultReviewDraft(request);
  const activationData = request.configuredBusinessId
    ? await getBusinessActivationData(request.configuredBusinessId)
    : null;

  const baseUrl = await resolveAppBaseUrl();
  const loginUrl = `${baseUrl}/login`;
  const hostedFormUrl = activationData
    ? `${baseUrl}/f/${activationData.business.slug}`
    : "";
  const iframeSnippet = activationData
    ? `<iframe src="${hostedFormUrl}" width="100%" height="720" style="border:0;"></iframe>`
    : "";

  return (
    <PageShell
      title={request.businessName}
      subtitle="Internal review and conversion from onboarding request to configured business."
    >
      <section className="grid gap-5">
        {activationData ? (
          <ActivationPanel
            onboardingRequestId={request.id}
            business={activationData.business}
            ownerUser={
              activationData.ownerUser
                ? {
                    fullName: activationData.ownerUser.fullName,
                    email: activationData.ownerUser.email,
                  }
                : null
            }
            checklist={activationData.checklist}
            emailNotifications={activationData.emailNotifications}
            defaultOwnerName={reviewDraft.contactName}
            defaultOwnerEmail={reviewDraft.contactEmail}
            loginUrl={loginUrl}
            hostedFormUrl={hostedFormUrl}
            iframeSnippet={iframeSnippet}
            websitePlatform={request.websitePlatform}
            onboardingLanguage={request.onboardingLanguage}
          />
        ) : null}

        <OnboardingReviewForm
          onboardingRequestId={request.id}
          initialDraft={reviewDraft}
          alreadyConfigured={Boolean(request.configuredBusinessId)}
        />

        <Card title="Original submission (read-only)">
          <div className="grid gap-5 lg:grid-cols-2">
            <div className="grid gap-3">
              <InfoRow label="Status" value={request.status} />
              <InfoRow label="Business type" value={businessTypeLabels[request.businessType]} />
              <InfoRow label="Website" value={request.websiteUrl ?? "-"} />
              <InfoRow label="Website platform" value={websitePlatformLabels[request.websitePlatform]} />
              <InfoRow label="Onboarding language" value={onboardingLanguageLabels[request.onboardingLanguage]} />
              <InfoRow label="Assistant language" value={onboardingLanguageLabels[request.assistantLanguage]} />
              <InfoRow label="City" value={request.city ?? "-"} />
              <InfoRow label="Contact name" value={request.contactName} />
              <InfoRow label="Contact email" value={request.contactEmail} />
              <InfoRow label="Submitted" value={request.createdAt.toLocaleString()} />
              <InfoRow label="Reviewed at" value={request.reviewedAt?.toLocaleString() ?? "-"} />
              <InfoRow
                label="Configured at"
                value={request.configuredAt?.toLocaleString() ?? "-"}
              />
            </div>

            <div className="grid gap-3">
              <InfoRow
                label="Preferred lead channel"
                value={request.preferredLeadChannel.toUpperCase()}
              />
              <InfoRow
                label="Owner notification channels"
                value={(request.preferredOwnerNotificationChannels ?? []).join(", ") || "-"}
              />
              <InfoRow
                label="Owner notification email"
                value={request.ownerNotificationEmail ?? "-"}
              />
              <InfoRow
                label="Owner notification WhatsApp"
                value={request.ownerNotificationWhatsapp ?? "-"}
              />
              <InfoRow
                label="Services offered"
                value={formatList(request.servicesOffered as string[] | null | undefined)}
              />
              <InfoRow
                label="Services not offered"
                value={formatList(request.servicesNotOffered as string[] | null | undefined)}
              />
              <InfoRow
                label="Qualification fields"
                value={formatList(request.qualificationFields as string[] | null | undefined)}
              />
              <InfoRow label="Urgency rules" value={request.urgencyRules ?? "-"} />
            </div>
          </div>
        </Card>

        <Card title="Pricing and guardrails (submitted)">
          <InfoRow label="Pricing mode" value={pricingModeLabels[request.pricingMode]} />
          <InfoRow
            label="Service pricing"
            value={formatPricing(
              request.servicePricing as
                | Array<{ service: string; price: string; mode: "exact" | "starting_at" }>
                | null
                | undefined,
            )}
          />
          <InfoRow label="Tone of voice" value={toneLabels[request.toneOfVoice]} />
          <InfoRow label="FAQ notes" value={request.faqNotes ?? "-"} />
          <InfoRow label="Do not say" value={request.doNotSay ?? "-"} />
          <InfoRow label="Additional notes" value={request.additionalNotes ?? "-"} />
          <InfoRow label="Internal notes" value={request.internalNotes ?? "-"} />
        </Card>

        <Card title="Raw payload snapshot">
          <pre className="overflow-x-auto rounded-lg bg-slate-50 p-3 text-xs text-slate-700">
            {JSON.stringify(request.rawPayload ?? {}, null, 2)}
          </pre>
        </Card>
      </section>
    </PageShell>
  );
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
      <div className="mt-4 grid gap-3">{children}</div>
    </article>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-sm text-slate-800">{value}</p>
    </div>
  );
}

function formatList(value: string[] | null | undefined): string {
  if (!value || value.length === 0) return "-";
  return value.join(", ");
}

function formatPricing(
  value: Array<{ service: string; price: string; mode: "exact" | "starting_at" }> | null | undefined,
): string {
  if (!value || value.length === 0) return "-";
  return value.map((entry) => `${entry.service}: ${entry.price}`).join(" | ");
}

