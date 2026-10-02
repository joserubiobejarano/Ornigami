"use client";

import { useMemo, useState, type FormEvent, type ReactNode } from "react";

import {
  businessTypeLabels,
  businessTypeTemplates,
  onboardingLanguageLabels,
  onboardingLanguages,
  onboardingBusinessTypes,
  ownerNotificationChannels,
  pricingModeLabels,
  toneLabels,
  websitePlatformLabels,
  websitePlatforms,
} from "@/lib/onboarding";
import {
  submitOnboardingSchema,
  type SubmitOnboardingInput,
} from "@/server/validators/onboarding";

type SubmissionStatus = "idle" | "loading" | "success" | "error";

type SubmitApiResponse = {
  ok: boolean;
  error?: string;
  details?: {
    fieldErrors?: Record<string, string[] | undefined>;
    formErrors?: string[];
  };
};

type FieldErrors = Record<string, string>;

type FormState = {
  businessName: string;
  businessType: SubmitOnboardingInput["businessType"];
  websiteUrl: string;
  websitePlatform: SubmitOnboardingInput["websitePlatform"];
  onboardingLanguage: SubmitOnboardingInput["onboardingLanguage"];
  assistantLanguage: SubmitOnboardingInput["assistantLanguage"];
  city: string;
  contactName: string;
  contactEmail: string;
  ownerNotificationEmail: string;
  ownerNotificationWhatsapp: string;
  preferredLeadChannel: SubmitOnboardingInput["preferredLeadChannel"];
  preferredOwnerNotificationChannels: Array<"email" | "whatsapp">;
  servicesOffered: string[];
  servicesNotOffered: string[];
  pricingMode: SubmitOnboardingInput["pricingMode"];
  pricingByService: Record<string, string>;
  qualificationFields: string[];
  urgencyRules: string;
  toneOfVoice: SubmitOnboardingInput["toneOfVoice"];
  faqNotes: string;
  doNotSay: string;
  additionalNotes: string;
};

const initialBusinessType: SubmitOnboardingInput["businessType"] = "dental_clinic";

const initialState: FormState = {
  businessName: "",
  businessType: initialBusinessType,
  websiteUrl: "",
  websitePlatform: "other",
  onboardingLanguage: "english",
  assistantLanguage: "english",
  city: "",
  contactName: "",
  contactEmail: "",
  ownerNotificationEmail: "",
  ownerNotificationWhatsapp: "",
  preferredLeadChannel: "whatsapp",
  preferredOwnerNotificationChannels: ["email"],
  servicesOffered: [...businessTypeTemplates[initialBusinessType].servicesOffered],
  servicesNotOffered: [],
  pricingMode: "varies",
  pricingByService: {},
  qualificationFields: [...businessTypeTemplates[initialBusinessType].qualificationFields],
  urgencyRules: "",
  toneOfVoice: "professional",
  faqNotes: "",
  doNotSay: "",
  additionalNotes: "",
};

const sections = [
  "Business",
  "Services",
  "Pricing",
  "Channels",
  "Tone",
] as const;

export function OnboardingForm() {
  const [form, setForm] = useState<FormState>(initialState);
  const [status, setStatus] = useState<SubmissionStatus>("idle");
  const [formError, setFormError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const completionCount = useMemo(() => {
    let complete = 0;

    if (form.businessName.trim() && form.contactName.trim() && form.contactEmail.trim()) complete += 1;
    if (form.servicesOffered.length > 0 && form.qualificationFields.length > 0) complete += 1;
    if (form.pricingMode) complete += 1;
    if (
      form.preferredOwnerNotificationChannels.length > 0 &&
      (!form.preferredOwnerNotificationChannels.includes("email") ||
        form.ownerNotificationEmail.trim()) &&
      (!form.preferredOwnerNotificationChannels.includes("whatsapp") ||
        form.ownerNotificationWhatsapp.trim())
    ) {
      complete += 1;
    }
    if (form.toneOfVoice) complete += 1;

    return complete;
  }, [form]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("loading");
    setFormError("");
    setFieldErrors({});

    const payload = buildPayload(form);
    const validation = submitOnboardingSchema.safeParse(payload);

    if (!validation.success) {
      setStatus("error");
      setFormError("Please review the highlighted fields.");
      setFieldErrors(flattenFieldErrors(validation.error.flatten().fieldErrors));
      return;
    }

    try {
      const response = await fetch("/api/onboarding/submit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const body = (await response.json().catch(() => null)) as SubmitApiResponse | null;

      if (!response.ok || !body?.ok) {
        setStatus("error");
        setFormError(body?.error ?? "Unable to submit onboarding request.");
        const apiErrors = body?.details?.fieldErrors ?? {};
        setFieldErrors(flattenFieldErrors(apiErrors));
        return;
      }

      setStatus("success");
    } catch {
      setStatus("error");
      setFormError("Unexpected error while submitting onboarding request.");
    }
  }

  function applyBusinessTemplate(nextBusinessType: SubmitOnboardingInput["businessType"]) {
    const template = businessTypeTemplates[nextBusinessType];

    setForm((current) => ({
      ...current,
      businessType: nextBusinessType,
      servicesOffered: [...template.servicesOffered],
      servicesNotOffered: [],
      qualificationFields: [...template.qualificationFields],
      pricingByService: syncPricingByService(current.pricingByService, template.servicesOffered),
    }));
  }

  function toggleOwnerNotificationChannel(channel: "email" | "whatsapp") {
    setForm((current) => {
      const exists = current.preferredOwnerNotificationChannels.includes(channel);
      const next = exists
        ? current.preferredOwnerNotificationChannels.filter((value) => value !== channel)
        : [...current.preferredOwnerNotificationChannels, channel];

      return {
        ...current,
        preferredOwnerNotificationChannels: next,
      };
    });
  }

  if (status === "success") {
    return (
      <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-emerald-900">
        <h2 className="text-xl font-semibold">Setup request received</h2>
        <p className="mt-2 text-sm sm:text-base">
          Thanks - we&apos;ve received your setup details and we&apos;ll configure your assistant shortly.
        </p>
      </section>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="text-sm font-medium text-slate-800">Progress</p>
          <p className="text-sm text-slate-600">
            {completionCount}/{sections.length} sections complete
          </p>
        </div>
        <div className="h-2 rounded-full bg-slate-200">
          <div
            className="h-2 rounded-full bg-slate-900 transition-all"
            style={{ width: `${(completionCount / sections.length) * 100}%` }}
          />
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-600">
          {sections.map((sectionName) => (
            <span key={sectionName} className="rounded-full bg-slate-100 px-2.5 py-1">
              {sectionName}
            </span>
          ))}
        </div>
      </section>

      <SectionCard title="Business basics" description="Core details we need for setup and contact.">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Business name"
            required
            value={form.businessName}
            error={fieldErrors.businessName}
            onChange={(value) => setForm((current) => ({ ...current, businessName: value }))}
          />
          <SelectField
            label="Business type"
            value={form.businessType}
            onChange={(value) => applyBusinessTemplate(value as SubmitOnboardingInput["businessType"])}
            options={onboardingBusinessTypes.map((value) => ({
              value,
              label: businessTypeLabels[value],
            }))}
          />
          <TextField
            label="Website (optional)"
            value={form.websiteUrl}
            error={fieldErrors.websiteUrl}
            placeholder="https://example.com"
            onChange={(value) => setForm((current) => ({ ...current, websiteUrl: value }))}
          />
          <SelectField
            label="Website platform"
            value={form.websitePlatform}
            onChange={(value) =>
              setForm((current) => ({
                ...current,
                websitePlatform: value as SubmitOnboardingInput["websitePlatform"],
              }))
            }
            options={websitePlatforms.map((value) => ({
              value,
              label: websitePlatformLabels[value],
            }))}
            helper="Tell us where your website is built so we can give you the right installation instructions."
          />
          <SelectField
            label="Onboarding form language"
            value={form.onboardingLanguage}
            onChange={(value) =>
              setForm((current) => ({
                ...current,
                onboardingLanguage: value as SubmitOnboardingInput["onboardingLanguage"],
              }))
            }
            options={onboardingLanguages.map((value) => ({
              value,
              label: onboardingLanguageLabels[value],
            }))}
          />
          <SelectField
            label="Preferred assistant language"
            value={form.assistantLanguage}
            onChange={(value) =>
              setForm((current) => ({
                ...current,
                assistantLanguage: value as SubmitOnboardingInput["assistantLanguage"],
              }))
            }
            options={onboardingLanguages.map((value) => ({
              value,
              label: onboardingLanguageLabels[value],
            }))}
            helper="This is the language your lead assistant will use when talking to customers."
          />
          <TextField
            label="City (optional)"
            value={form.city}
            error={fieldErrors.city}
            onChange={(value) => setForm((current) => ({ ...current, city: value }))}
          />
          <TextField
            label="Contact name"
            required
            value={form.contactName}
            error={fieldErrors.contactName}
            onChange={(value) => setForm((current) => ({ ...current, contactName: value }))}
          />
          <TextField
            label="Contact email"
            type="email"
            required
            value={form.contactEmail}
            error={fieldErrors.contactEmail}
            onChange={(value) => setForm((current) => ({ ...current, contactEmail: value }))}
          />
        </div>
      </SectionCard>

      <SectionCard
        title="Services and qualification"
        description="Adjust the suggested template values so the assistant asks the right questions."
      >
        <TagField
          label="Services offered"
          helper="Add the services customers can ask about. Example: Whitening, veneers, emergency dental care."
          tags={form.servicesOffered}
          error={fieldErrors.servicesOffered}
          onChange={(tags) =>
            setForm((current) => ({
              ...current,
              servicesOffered: tags,
              pricingByService: syncPricingByService(current.pricingByService, tags),
            }))
          }
          placeholder="Add a service"
        />

        <div className="mt-4">
          <TagField
            label="Services not offered"
            helper="Optional. Add treatments/services you do not provide so the assistant avoids suggesting them."
            tags={form.servicesNotOffered}
            error={fieldErrors.servicesNotOffered}
            onChange={(tags) => setForm((current) => ({ ...current, servicesNotOffered: tags }))}
            placeholder="Add a not-offered service"
          />
        </div>

        <div className="mt-4">
          <TagField
            label="Qualification fields"
            helper="What details should be captured from each lead? Example: service needed, preferred date, budget, insurance."
            tags={form.qualificationFields}
            error={fieldErrors.qualificationFields}
            onChange={(tags) => setForm((current) => ({ ...current, qualificationFields: tags }))}
            placeholder="Add a qualification field"
          />
        </div>

        <div className="mt-4">
          <TextAreaField
            label="Urgency rules (optional)"
            helper="Examples: emergency cases, same-day requests, high-value opportunities."
            value={form.urgencyRules}
            error={fieldErrors.urgencyRules}
            onChange={(value) => setForm((current) => ({ ...current, urgencyRules: value }))}
          />
        </div>
      </SectionCard>

      <SectionCard
        title="Pricing behavior"
        description="How should the assistant handle pricing questions?"
      >
        <div className="grid gap-2 sm:grid-cols-2">
          {(Object.keys(pricingModeLabels) as Array<SubmitOnboardingInput["pricingMode"]>).map((mode) => (
            <label
              key={mode}
              className={`cursor-pointer rounded-lg border p-3 text-sm transition ${
                form.pricingMode === mode
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-200 bg-slate-50 text-slate-700"
              }`}
            >
              <input
                type="radio"
                className="sr-only"
                name="pricingMode"
                checked={form.pricingMode === mode}
                onChange={() => setForm((current) => ({ ...current, pricingMode: mode }))}
              />
              {pricingModeLabels[mode]}
            </label>
          ))}
        </div>

        {(form.pricingMode === "exact" || form.pricingMode === "starting_at") && (
          <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm font-medium text-slate-800">Per-service pricing (optional)</p>
            <p className="mt-1 text-xs text-slate-600">
              Leave blank where pricing should still be handled manually.
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {form.servicesOffered.length === 0 ? (
                <p className="text-sm text-slate-600">
                  Add services first to include pricing details.
                </p>
              ) : (
                form.servicesOffered.map((service) => (
                  <label key={service} className="grid gap-1 text-sm text-slate-700">
                    <span className="font-medium">{service}</span>
                    <input
                      value={form.pricingByService[service] ?? ""}
                      onChange={(event) => {
                        const nextValue = event.target.value;
                        setForm((current) => ({
                          ...current,
                          pricingByService: {
                            ...current.pricingByService,
                            [service]: nextValue,
                          },
                        }));
                      }}
                      className="rounded-md border border-slate-300 bg-white px-3 py-2 outline-none focus:border-slate-600"
                      placeholder={form.pricingMode === "exact" ? "e.g. $120" : "e.g. from $120"}
                    />
                  </label>
                ))
              )}
            </div>
          </div>
        )}
      </SectionCard>

      <SectionCard
        title="Channels and owner notifications"
        description="Choose how leads are answered and where important lead alerts should be sent."
      >
        <div>
          <p className="text-sm font-medium text-slate-800">Preferred lead reply channel</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {([
              ["whatsapp", "WhatsApp"],
              ["sms", "SMS"],
            ] as const).map(([channel, label]) => (
              <label
                key={channel}
                className={`cursor-pointer rounded-lg border px-3 py-2 text-sm transition ${
                  form.preferredLeadChannel === channel
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-200 bg-slate-50 text-slate-700"
                }`}
              >
                <input
                  type="radio"
                  className="sr-only"
                  name="preferredLeadChannel"
                  checked={form.preferredLeadChannel === channel}
                  onChange={() => setForm((current) => ({ ...current, preferredLeadChannel: channel }))}
                />
                {label}
              </label>
            ))}
          </div>
        </div>

        <div className="mt-4">
          <p className="text-sm font-medium text-slate-800">How should we notify you about important leads?</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {ownerNotificationChannels.map((channel) => (
              <button
                type="button"
                key={channel}
                onClick={() => toggleOwnerNotificationChannel(channel)}
                className={`rounded-full border px-3 py-1.5 text-sm transition ${
                  form.preferredOwnerNotificationChannels.includes(channel)
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-300 bg-white text-slate-700"
                }`}
              >
                {channel === "email" ? "Email" : "WhatsApp"}
              </button>
            ))}
          </div>
          {fieldErrors.preferredOwnerNotificationChannels ? (
            <p className="mt-2 text-xs text-red-700">{fieldErrors.preferredOwnerNotificationChannels}</p>
          ) : null}
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {form.preferredOwnerNotificationChannels.includes("email") ? (
            <TextField
              label="Owner notification email"
              type="email"
              required
              value={form.ownerNotificationEmail}
              error={fieldErrors.ownerNotificationEmail}
              onChange={(value) =>
                setForm((current) => ({ ...current, ownerNotificationEmail: value }))
              }
            />
          ) : null}

          {form.preferredOwnerNotificationChannels.includes("whatsapp") ? (
            <TextField
              label="Owner notification WhatsApp"
              required
              value={form.ownerNotificationWhatsapp}
              error={fieldErrors.ownerNotificationWhatsapp}
              onChange={(value) =>
                setForm((current) => ({ ...current, ownerNotificationWhatsapp: value }))
              }
            />
          ) : null}
        </div>
      </SectionCard>

      <SectionCard
        title="Tone and guardrails"
        description="Set the style and constraints for assistant responses."
      >
        <div className="grid gap-2 sm:grid-cols-3">
          {(Object.keys(toneLabels) as Array<SubmitOnboardingInput["toneOfVoice"]>).map((tone) => (
            <label
              key={tone}
              className={`cursor-pointer rounded-lg border px-3 py-2 text-sm transition ${
                form.toneOfVoice === tone
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-200 bg-slate-50 text-slate-700"
              }`}
            >
              <input
                type="radio"
                className="sr-only"
                name="toneOfVoice"
                checked={form.toneOfVoice === tone}
                onChange={() => setForm((current) => ({ ...current, toneOfVoice: tone }))}
              />
              <span className="font-medium">{toneLabels[tone]}</span>
              <span className="mt-1 block text-xs opacity-90">
                {tone === "professional"
                  ? "Clear, polite, and formal."
                  : tone === "warm"
                    ? "Friendly and approachable, but still professional."
                    : "Short, efficient, and straight to the point."}
              </span>
            </label>
          ))}
        </div>

        <div className="mt-4 grid gap-4">
          <TextAreaField
            label="Common questions / FAQ notes (optional)"
            helper="Example: Do you accept insurance? What are your opening hours? Do I need to book in advance? Add common questions so the assistant answers correctly."
            value={form.faqNotes}
            error={fieldErrors.faqNotes}
            onChange={(value) => setForm((current) => ({ ...current, faqNotes: value }))}
          />
          <TextAreaField
            label="Things the assistant should never say (optional)"
            helper="Example: Don’t guarantee same-day appointments. Don’t quote exact prices unless confirmed. Don’t mention treatments we don’t offer."
            value={form.doNotSay}
            error={fieldErrors.doNotSay}
            onChange={(value) => setForm((current) => ({ ...current, doNotSay: value }))}
          />
          <TextAreaField
            label="Extra notes for setup (optional)"
            helper="Example: We only handle emergencies during working hours. For whitening, always offer a consultation first."
            value={form.additionalNotes}
            error={fieldErrors.additionalNotes}
            onChange={(value) => setForm((current) => ({ ...current, additionalNotes: value }))}
          />
        </div>
      </SectionCard>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <button
          type="submit"
          disabled={status === "loading"}
          className="w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition disabled:opacity-60 sm:w-auto"
        >
          {status === "loading" ? "Submitting..." : "Submit onboarding details"}
        </button>
        {status === "error" && formError ? <p className="mt-3 text-sm text-red-700">{formError}</p> : null}
      </div>
    </form>
  );
}

function buildPayload(form: FormState): SubmitOnboardingInput {
  return {
    businessName: form.businessName,
    businessType: form.businessType,
    websiteUrl: form.websiteUrl,
    websitePlatform: form.websitePlatform,
    onboardingLanguage: form.onboardingLanguage,
    assistantLanguage: form.assistantLanguage,
    city: form.city,
    contactName: form.contactName,
    contactEmail: form.contactEmail,
    ownerNotificationEmail: form.ownerNotificationEmail,
    ownerNotificationWhatsapp: form.ownerNotificationWhatsapp,
    preferredLeadChannel: form.preferredLeadChannel,
    preferredOwnerNotificationChannels: form.preferredOwnerNotificationChannels,
    servicesOffered: form.servicesOffered,
    servicesNotOffered: form.servicesNotOffered,
    pricingMode: form.pricingMode,
    servicePricing:
      form.pricingMode === "exact" || form.pricingMode === "starting_at"
        ? form.servicesOffered
            .map((service) => ({
              service,
              price: form.pricingByService[service] ?? "",
            }))
            .filter((entry) => entry.price.trim().length > 0)
        : [],
    qualificationFields: form.qualificationFields,
    urgencyRules: form.urgencyRules,
    toneOfVoice: form.toneOfVoice,
    faqNotes: form.faqNotes,
    doNotSay: form.doNotSay,
    additionalNotes: form.additionalNotes,
  };
}

function syncPricingByService(
  current: Record<string, string>,
  services: string[],
): Record<string, string> {
  const next: Record<string, string> = {};
  for (const service of services) {
    if (current[service]) {
      next[service] = current[service];
    }
  }
  return next;
}

function flattenFieldErrors(fieldErrors: Record<string, string[] | undefined>): FieldErrors {
  const result: FieldErrors = {};

  for (const [key, errors] of Object.entries(fieldErrors)) {
    if (!errors || errors.length === 0) continue;
    result[key] = errors[0] ?? "Invalid value.";
  }

  return result;
}

function SectionCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
      <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
      <p className="mt-1 text-sm text-slate-600">{description}</p>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function TextField({
  label,
  value,
  onChange,
  required,
  type = "text",
  placeholder,
  error,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  type?: "text" | "email";
  placeholder?: string;
  error?: string;
}) {
  return (
    <label className="grid gap-1 text-sm text-slate-700">
      <span className="font-medium text-slate-800">
        {label}
        {required ? " *" : ""}
      </span>
      <input
        type={type}
        value={value}
        required={required}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-slate-600"
      />
      {error ? <span className="text-xs text-red-700">{error}</span> : null}
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
  helper,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  helper?: string;
}) {
  return (
    <label className="grid gap-1 text-sm text-slate-700">
      <span className="font-medium text-slate-800">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-md border border-slate-300 bg-white px-3 py-2 outline-none focus:border-slate-600"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {helper ? <span className="text-xs text-slate-500">{helper}</span> : null}
    </label>
  );
}

function TextAreaField({
  label,
  value,
  onChange,
  helper,
  error,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  helper?: string;
  error?: string;
}) {
  return (
    <label className="grid gap-1 text-sm text-slate-700">
      <span className="font-medium text-slate-800">{label}</span>
      <textarea
        value={value}
        rows={4}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-slate-600"
      />
      {helper ? <span className="text-xs text-slate-500">{helper}</span> : null}
      {error ? <span className="text-xs text-red-700">{error}</span> : null}
    </label>
  );
}

function TagField({
  label,
  helper,
  tags,
  onChange,
  placeholder,
  error,
}: {
  label: string;
  helper?: string;
  tags: string[];
  onChange: (tags: string[]) => void;
  placeholder: string;
  error?: string;
}) {
  const [draft, setDraft] = useState("");

  function pushDraft() {
    const nextTag = normalizeTag(draft);
    if (!nextTag) return;

    const dedupe = new Set(tags.map((tag) => tag.toLowerCase()));
    if (!dedupe.has(nextTag.toLowerCase())) {
      onChange([...tags, nextTag]);
    }

    setDraft("");
  }

  return (
    <div className="grid gap-2">
      <label className="text-sm font-medium text-slate-800">{label}</label>
      {helper ? <p className="text-xs text-slate-500">{helper}</p> : null}
      <div className="flex flex-wrap gap-2">
        {tags.length === 0 ? (
          <p className="text-sm text-slate-500">No items yet.</p>
        ) : (
          tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-slate-50 px-3 py-1 text-sm text-slate-700"
            >
              {tag}
              <button
                type="button"
                onClick={() => onChange(tags.filter((value) => value !== tag))}
                className="text-slate-500 hover:text-slate-900"
                aria-label={`Remove ${tag}`}
              >
                x
              </button>
            </span>
          ))
        )}
      </div>
      <div className="flex gap-2">
        <input
          value={draft}
          placeholder={placeholder}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === ",") {
              event.preventDefault();
              pushDraft();
            }
          }}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-600"
        />
        <button
          type="button"
          onClick={pushDraft}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700"
        >
          Add
        </button>
      </div>
      {error ? <span className="text-xs text-red-700">{error}</span> : null}
    </div>
  );
}

function normalizeTag(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}
