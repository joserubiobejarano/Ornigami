"use client";

import { useActionState, useMemo, useState, type ReactNode } from "react";

import type { OnboardingReviewActionState } from "@/app/dashboard/onboarding/[id]/action-state";
import { initialOnboardingReviewActionState } from "@/app/dashboard/onboarding/[id]/action-state";
import {
  createBusinessFromOnboardingAction,
  runOnboardingReviewChecksAction,
} from "@/app/dashboard/onboarding/[id]/actions";
import {
  onboardingLanguageLabels,
  onboardingLanguages,
  businessTypeLabels,
  onboardingBusinessTypes,
  onboardingPricingModes,
  onboardingTones,
  pricingModeLabels,
  toneLabels,
  websitePlatformLabels,
  websitePlatforms,
} from "@/lib/onboarding";
import type { OnboardingReviewDraft } from "@/server/services/onboarding-business-conversion.service";

type OnboardingReviewFormProps = {
  onboardingRequestId: string;
  initialDraft: OnboardingReviewDraft;
  alreadyConfigured: boolean;
};

export function OnboardingReviewForm({
  onboardingRequestId,
  initialDraft,
  alreadyConfigured,
}: OnboardingReviewFormProps) {
  const [form, setForm] = useState<OnboardingReviewDraft>(initialDraft);
  const [slugEditedManually, setSlugEditedManually] = useState(false);

  const runChecksWithId = runOnboardingReviewChecksAction.bind(null, onboardingRequestId);
  const createWithId = createBusinessFromOnboardingAction.bind(null, onboardingRequestId);

  const [checkState, checkFormAction, checksPending] = useActionState(
    runChecksWithId,
    initialOnboardingReviewActionState,
  );
  const [createState, createFormAction, createPending] = useActionState(
    createWithId,
    initialOnboardingReviewActionState,
  );

  const activeState = createState.status !== "idle" ? createState : checkState;
  const localBlockingIssues = useMemo(() => getLocalBlockingIssues(form), [form]);

  return (
    <form action={createFormAction} className="grid gap-5 rounded-xl border border-slate-200 bg-white p-5">
      <header>
        <h2 className="text-lg font-semibold text-slate-900">Internal review and normalization</h2>
        <p className="mt-1 text-sm text-slate-600">
          Review and edit this payload before creating the business record.
        </p>
      </header>

      <section className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-600">Business basics</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Business name">
            <input
              name="businessName"
              value={form.businessName}
              onChange={(event) => {
                const nextBusinessName = event.target.value;
                setForm((current) => ({
                  ...current,
                  businessName: nextBusinessName,
                  slug: slugEditedManually ? current.slug : slugifyForPreview(nextBusinessName),
                }));
              }}
              className="rounded-md border border-slate-300 bg-white px-3 py-2 outline-none focus:border-slate-600"
            />
          </Field>
          <Field label="Slug (editable)">
            <input
              name="slug"
              value={form.slug}
              onChange={(event) => {
                setSlugEditedManually(true);
                setForm((current) => ({ ...current, slug: event.target.value }));
              }}
              className="rounded-md border border-slate-300 bg-white px-3 py-2 outline-none focus:border-slate-600"
            />
          </Field>
          <Field label="Business type">
            <select
              name="businessType"
              value={form.businessType}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  businessType: event.target.value as OnboardingReviewDraft["businessType"],
                }))
              }
              className="rounded-md border border-slate-300 bg-white px-3 py-2 outline-none focus:border-slate-600"
            >
              {onboardingBusinessTypes.map((businessType) => (
                <option key={businessType} value={businessType}>
                  {businessTypeLabels[businessType]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Website">
            <input
              name="websiteUrl"
              value={form.websiteUrl}
              onChange={(event) => setForm((current) => ({ ...current, websiteUrl: event.target.value }))}
              className="rounded-md border border-slate-300 bg-white px-3 py-2 outline-none focus:border-slate-600"
            />
          </Field>
          <Field label="Website platform">
            <select
              name="websitePlatform"
              value={form.websitePlatform}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  websitePlatform: event.target.value as OnboardingReviewDraft["websitePlatform"],
                }))
              }
              className="rounded-md border border-slate-300 bg-white px-3 py-2 outline-none focus:border-slate-600"
            >
              {websitePlatforms.map((platform) => (
                <option key={platform} value={platform}>
                  {websitePlatformLabels[platform]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Onboarding language">
            <select
              name="onboardingLanguage"
              value={form.onboardingLanguage}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  onboardingLanguage: event.target.value as OnboardingReviewDraft["onboardingLanguage"],
                }))
              }
              className="rounded-md border border-slate-300 bg-white px-3 py-2 outline-none focus:border-slate-600"
            >
              {onboardingLanguages.map((language) => (
                <option key={language} value={language}>
                  {onboardingLanguageLabels[language]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Assistant language">
            <select
              name="assistantLanguage"
              value={form.assistantLanguage}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  assistantLanguage: event.target.value as OnboardingReviewDraft["assistantLanguage"],
                }))
              }
              className="rounded-md border border-slate-300 bg-white px-3 py-2 outline-none focus:border-slate-600"
            >
              {onboardingLanguages.map((language) => (
                <option key={language} value={language}>
                  {onboardingLanguageLabels[language]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="City">
            <input
              name="city"
              value={form.city}
              onChange={(event) => setForm((current) => ({ ...current, city: event.target.value }))}
              className="rounded-md border border-slate-300 bg-white px-3 py-2 outline-none focus:border-slate-600"
            />
          </Field>
          <Field label="Contact name">
            <input
              name="contactName"
              value={form.contactName}
              onChange={(event) => setForm((current) => ({ ...current, contactName: event.target.value }))}
              className="rounded-md border border-slate-300 bg-white px-3 py-2 outline-none focus:border-slate-600"
            />
          </Field>
          <Field label="Contact email">
            <input
              type="email"
              name="contactEmail"
              value={form.contactEmail}
              onChange={(event) => setForm((current) => ({ ...current, contactEmail: event.target.value }))}
              className="rounded-md border border-slate-300 bg-white px-3 py-2 outline-none focus:border-slate-600"
            />
          </Field>
        </div>
      </section>

      <section className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-600">Notifications</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Owner notification email">
            <input
              name="ownerNotificationEmail"
              type="email"
              value={form.ownerNotificationEmail}
              onChange={(event) =>
                setForm((current) => ({ ...current, ownerNotificationEmail: event.target.value }))
              }
              className="rounded-md border border-slate-300 bg-white px-3 py-2 outline-none focus:border-slate-600"
            />
          </Field>
          <Field label="Owner notification WhatsApp">
            <input
              name="ownerNotificationWhatsapp"
              value={form.ownerNotificationWhatsapp}
              onChange={(event) =>
                setForm((current) => ({ ...current, ownerNotificationWhatsapp: event.target.value }))
              }
              className="rounded-md border border-slate-300 bg-white px-3 py-2 outline-none focus:border-slate-600"
            />
          </Field>
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          <CheckField
            name="notifyOwnerViaEmail"
            checked={form.notifyOwnerViaEmail}
            label="Notify via email"
            onChange={(checked) => setForm((current) => ({ ...current, notifyOwnerViaEmail: checked }))}
          />
          <CheckField
            name="notifyOwnerViaWhatsapp"
            checked={form.notifyOwnerViaWhatsapp}
            label="Notify via WhatsApp"
            onChange={(checked) =>
              setForm((current) => ({ ...current, notifyOwnerViaWhatsapp: checked }))
            }
          />
          <CheckField
            name="notifyOnUrgent"
            checked={form.notifyOnUrgent}
            label="Notify on urgent"
            onChange={(checked) => setForm((current) => ({ ...current, notifyOnUrgent: checked }))}
          />
          <CheckField
            name="notifyOnQualificationReady"
            checked={form.notifyOnQualificationReady}
            label="Notify on qualification ready"
            onChange={(checked) =>
              setForm((current) => ({ ...current, notifyOnQualificationReady: checked }))
            }
          />
          <CheckField
            name="notifyOnNewLead"
            checked={form.notifyOnNewLead}
            label="Notify on new lead"
            onChange={(checked) => setForm((current) => ({ ...current, notifyOnNewLead: checked }))}
          />
        </div>
      </section>

      <section className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-600">Lead and services config</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Preferred lead channel">
            <select
              name="preferredLeadChannel"
              value={form.preferredLeadChannel}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  preferredLeadChannel: event.target.value as "sms" | "whatsapp",
                }))
              }
              className="rounded-md border border-slate-300 bg-white px-3 py-2 outline-none focus:border-slate-600"
            >
              <option value="sms">SMS</option>
              <option value="whatsapp">WhatsApp</option>
            </select>
          </Field>
          <Field label="Pricing mode">
            <select
              name="pricingMode"
              value={form.pricingMode}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  pricingMode: event.target.value as OnboardingReviewDraft["pricingMode"],
                }))
              }
              className="rounded-md border border-slate-300 bg-white px-3 py-2 outline-none focus:border-slate-600"
            >
              {onboardingPricingModes.map((mode) => (
                <option key={mode} value={mode}>
                  {pricingModeLabels[mode]}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <TextAreaField
          label="Offered services (one per line)"
          name="offeredServices"
          value={form.offeredServices.join("\n")}
          onChange={(value) =>
            setForm((current) => ({
              ...current,
              offeredServices: splitList(value),
            }))
          }
        />
        <TextAreaField
          label="Not offered services (one per line)"
          name="notOfferedServices"
          value={form.notOfferedServices.join("\n")}
          onChange={(value) =>
            setForm((current) => ({
              ...current,
              notOfferedServices: splitList(value),
            }))
          }
        />
        <TextAreaField
          label="Qualification fields (one per line)"
          name="qualificationFields"
          value={form.qualificationFields.join("\n")}
          onChange={(value) =>
            setForm((current) => ({
              ...current,
              qualificationFields: splitList(value),
            }))
          }
        />
        <TextAreaField
          label="Service pricing (one per line: Service | Price)"
          name="servicePricing"
          value={form.servicePricing.map((entry) => `${entry.service} | ${entry.price}`).join("\n")}
          onChange={(value) =>
            setForm((current) => ({
              ...current,
              servicePricing: parseServicePricingRows(value),
            }))
          }
        />
      </section>

      <section className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-600">Qualification setup</h3>
        <Field label="Tone of voice">
          <select
            name="toneOfVoice"
            value={form.toneOfVoice}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                toneOfVoice: event.target.value as OnboardingReviewDraft["toneOfVoice"],
              }))
            }
            className="rounded-md border border-slate-300 bg-white px-3 py-2 outline-none focus:border-slate-600"
          >
            {onboardingTones.map((tone) => (
              <option key={tone} value={tone}>
                {toneLabels[tone]}
              </option>
            ))}
          </select>
        </Field>

        <TextAreaField
          label="Urgency rules"
          name="urgencyRules"
          value={form.urgencyRules}
          onChange={(value) => setForm((current) => ({ ...current, urgencyRules: value }))}
        />
        <TextAreaField
          label="FAQ notes"
          name="faqNotes"
          value={form.faqNotes}
          onChange={(value) => setForm((current) => ({ ...current, faqNotes: value }))}
        />
        <TextAreaField
          label="Things assistant should never say"
          name="doNotSay"
          value={form.doNotSay}
          onChange={(value) => setForm((current) => ({ ...current, doNotSay: value }))}
        />
        <TextAreaField
          label="Extra notes"
          name="extraNotes"
          value={form.extraNotes}
          onChange={(value) => setForm((current) => ({ ...current, extraNotes: value }))}
        />
        <TextAreaField
          label="Internal notes (internal only)"
          name="internalNotes"
          value={form.internalNotes}
          onChange={(value) => setForm((current) => ({ ...current, internalNotes: value }))}
        />
      </section>

      {localBlockingIssues.length > 0 ? (
        <IssueList
          title="Local blocking issues"
          style="error"
          items={localBlockingIssues.map((message) => ({ severity: "error", message }))}
        />
      ) : null}

      <ServerIssues state={activeState} />

      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          formAction={checkFormAction}
          disabled={checksPending || createPending || alreadyConfigured}
          className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 disabled:opacity-60"
        >
          {checksPending ? "Running checks..." : "Run validation checks"}
        </button>
        <button
          type="submit"
          disabled={createPending || checksPending || alreadyConfigured || localBlockingIssues.length > 0}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {createPending ? "Creating business..." : "Create Business from Onboarding"}
        </button>
      </div>
      {alreadyConfigured ? (
        <p className="text-sm text-amber-700">
          This request is already configured. Creating another business is disabled.
        </p>
      ) : null}
    </form>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="font-medium text-slate-700">{label}</span>
      {children}
    </label>
  );
}

function TextAreaField({
  label,
  name,
  value,
  onChange,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="font-medium text-slate-700">{label}</span>
      <textarea
        name={name}
        rows={4}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-24 rounded-md border border-slate-300 bg-white px-3 py-2 outline-none focus:border-slate-600"
      />
    </label>
  );
}

function CheckField({
  name,
  checked,
  label,
  onChange,
}: {
  name: string;
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
      <input
        type="checkbox"
        name={name}
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="size-4"
      />
      {label}
    </label>
  );
}

function ServerIssues({ state }: { state: OnboardingReviewActionState }) {
  if (state.status === "idle") return null;

  return (
    <div className="grid gap-3">
      {state.message ? (
        <p
          className={`text-sm ${
            state.status === "success" ? "text-emerald-700" : "text-red-700"
          }`}
        >
          {state.message}
        </p>
      ) : null}
      {state.errors.length > 0 ? (
        <IssueList title="Blocking issues" style="error" items={state.errors} />
      ) : null}
      {state.warnings.length > 0 ? (
        <IssueList title="Warnings" style="warning" items={state.warnings} />
      ) : null}
    </div>
  );
}

function IssueList({
  title,
  style,
  items,
}: {
  title: string;
  style: "error" | "warning";
  items: Array<{ message: string }>;
}) {
  return (
    <div
      className={`rounded-md border p-3 text-sm ${
        style === "error"
          ? "border-red-200 bg-red-50 text-red-800"
          : "border-amber-200 bg-amber-50 text-amber-800"
      }`}
    >
      <p className="font-semibold">{title}</p>
      <ul className="mt-2 list-disc pl-5">
        {items.map((issue, index) => (
          <li key={`${issue.message}-${index}`}>{issue.message}</li>
        ))}
      </ul>
    </div>
  );
}

function getLocalBlockingIssues(form: OnboardingReviewDraft): string[] {
  const issues: string[] = [];

  if (!form.businessName.trim()) {
    issues.push("Business name is required.");
  }

  if (!form.slug.trim()) {
    issues.push("Slug is required.");
  }

  if (form.offeredServices.length === 0) {
    issues.push("Add at least one offered service.");
  }

  if (form.qualificationFields.length === 0) {
    issues.push("Add at least one qualification field.");
  }

  if (form.notifyOwnerViaEmail && !form.ownerNotificationEmail.trim()) {
    issues.push("Notification email is required when notify via email is enabled.");
  }

  if (form.notifyOwnerViaWhatsapp && !form.ownerNotificationWhatsapp.trim()) {
    issues.push("Owner WhatsApp is required when notify via WhatsApp is enabled.");
  }

  return issues;
}

function slugifyForPreview(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 120);
}

function splitList(value: string): string[] {
  return value
    .split(/\r?\n|,/g)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function parseServicePricingRows(value: string): OnboardingReviewDraft["servicePricing"] {
  const rows = value
    .split(/\r?\n/g)
    .map((row) => row.trim())
    .filter((row) => row.length > 0);

  return rows
    .map((row) => {
      const splitIndex = row.includes("|") ? row.indexOf("|") : row.indexOf(":");
      if (splitIndex <= 0) return null;

      const service = row.slice(0, splitIndex).trim();
      const price = row.slice(splitIndex + 1).trim();
      if (!service || !price) return null;

      return {
        service,
        price,
        mode: "exact" as const,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);
}
