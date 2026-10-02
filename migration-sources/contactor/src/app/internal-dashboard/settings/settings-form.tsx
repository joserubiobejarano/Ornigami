"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { initialDashboardSettingsActionState } from "@/app/internal-dashboard/settings/action-state";
import {
  updateDashboardSettingsAction,
} from "@/app/internal-dashboard/settings/actions";
import type { Business, BusinessPromptSetting } from "@/server/db/schema";

type DashboardSettingsFormProps = {
  business: Business;
  promptSettings: BusinessPromptSetting | null;
};

function toJson(value: unknown, fallback: Record<string, unknown> | unknown[] = {}) {
  return JSON.stringify(value ?? fallback, null, 2);
}

function SaveButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="w-fit rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
    >
      {pending ? "Saving..." : "Save settings"}
    </button>
  );
}

export function DashboardSettingsForm({
  business,
  promptSettings,
}: DashboardSettingsFormProps) {
  const [state, formAction] = useActionState(
    updateDashboardSettingsAction,
    initialDashboardSettingsActionState,
  );

  return (
    <form action={formAction} className="grid gap-4">
      <input type="hidden" name="businessId" value={business.id} />
      <label className="grid gap-1 text-sm">
        <span className="font-medium text-slate-700">Business name</span>
        <input
          name="businessName"
          required
          defaultValue={business.name}
          className="rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
        />
      </label>

      <fieldset className="grid gap-2 rounded-md border border-slate-200 p-3">
        <legend className="px-1 text-sm font-medium text-slate-700">
          Channel availability
        </legend>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            name="smsEnabled"
            defaultChecked={business.smsEnabled}
            className="size-4"
          />
          SMS enabled
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            name="whatsappEnabled"
            defaultChecked={business.whatsappEnabled}
            className="size-4"
          />
          WhatsApp enabled
        </label>
      </fieldset>

      <label className="grid gap-1 text-sm">
        <span className="font-medium text-slate-700">Twilio phone number</span>
        <input
          name="twilioPhoneNumber"
          defaultValue={business.twilioPhoneNumber ?? ""}
          placeholder="+15799002615 or whatsapp:+15799002615"
          className="rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
        />
      </label>

      <label className="grid gap-1 text-sm">
        <span className="font-medium text-slate-700">Preferred channel</span>
        <select
          name="preferredChannel"
          className="rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
          defaultValue={business.preferredChannel}
        >
          <option value="sms">SMS</option>
          <option value="whatsapp">WhatsApp</option>
        </select>
      </label>

      <label className="grid gap-1 text-sm">
        <span className="font-medium text-slate-700">Notification email</span>
        <input
          name="notificationEmail"
          type="email"
          defaultValue={business.notificationEmail ?? ""}
          className="rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
        />
      </label>

      <label className="grid gap-1 text-sm">
        <span className="font-medium text-slate-700">Notification WhatsApp</span>
        <input
          name="notificationWhatsapp"
          defaultValue={business.notificationWhatsapp ?? business.notificationPhone ?? ""}
          placeholder="+15557654321"
          className="rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
        />
      </label>

      <fieldset className="grid gap-2 rounded-md border border-slate-200 p-3">
        <legend className="px-1 text-sm font-medium text-slate-700">
          Owner notification channels
        </legend>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            name="notifyOwnerViaEmail"
            defaultChecked={business.notifyOwnerViaEmail}
            className="size-4"
          />
          Email channel enabled
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            name="notifyOwnerViaWhatsapp"
            defaultChecked={business.notifyOwnerViaWhatsapp}
            className="size-4"
          />
          WhatsApp channel enabled
        </label>
      </fieldset>

      <fieldset className="grid gap-2 rounded-md border border-slate-200 p-3">
        <legend className="px-1 text-sm font-medium text-slate-700">
          Owner notification triggers
        </legend>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            name="notifyOnUrgent"
            defaultChecked={business.notifyOnUrgent}
            className="size-4"
          />
          Notify when lead is urgent
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            name="notifyOnQualificationReady"
            defaultChecked={business.notifyOnQualificationReady}
            className="size-4"
          />
          Notify when lead is qualification ready
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            name="notifyOnNewLead"
            defaultChecked={business.notifyOnNewLead}
            className="size-4"
          />
          Notify on every brand-new lead
        </label>
      </fieldset>

      <label className="grid gap-1 text-sm">
        <span className="font-medium text-slate-700">Business description</span>
        <textarea
          name="businessDescription"
          rows={4}
          defaultValue={promptSettings?.businessDescription ?? ""}
          className="rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
        />
      </label>

      <label className="grid gap-1 text-sm">
        <span className="font-medium text-slate-700">Services summary</span>
        <textarea
          name="servicesSummary"
          rows={4}
          defaultValue={promptSettings?.servicesSummary ?? ""}
          className="rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
        />
      </label>

      <label className="grid gap-1 text-sm">
        <span className="font-medium text-slate-700">Tone of voice</span>
        <input
          name="toneOfVoice"
          defaultValue={promptSettings?.toneOfVoice ?? ""}
          className="rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
        />
      </label>

      <label className="grid gap-1 text-sm">
        <span className="font-medium text-slate-700">Assistant language</span>
        <select
          name="assistantLanguage"
          defaultValue={promptSettings?.assistantLanguage ?? "english"}
          className="rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
        >
          <option value="english">English</option>
          <option value="spanish">Spanish</option>
        </select>
      </label>

      <label className="grid gap-1 text-sm">
        <span className="font-medium text-slate-700">Offered services JSON</span>
        <textarea
          name="offeredServicesJson"
          rows={6}
          defaultValue={toJson(promptSettings?.offeredServices, [])}
          className="font-mono rounded-md border border-slate-300 px-3 py-2 text-xs outline-none focus:border-slate-500"
        />
      </label>

      <label className="grid gap-1 text-sm">
        <span className="font-medium text-slate-700">Not offered services JSON</span>
        <textarea
          name="notOfferedServicesJson"
          rows={6}
          defaultValue={toJson(promptSettings?.notOfferedServices, [])}
          className="font-mono rounded-md border border-slate-300 px-3 py-2 text-xs outline-none focus:border-slate-500"
        />
      </label>

      <label className="grid gap-1 text-sm">
        <span className="font-medium text-slate-700">Qualification rules JSON</span>
        <textarea
          name="qualificationRulesJson"
          rows={8}
          defaultValue={toJson(promptSettings?.qualificationRules ?? null, {})}
          className="font-mono rounded-md border border-slate-300 px-3 py-2 text-xs outline-none focus:border-slate-500"
        />
      </label>

      <label className="grid gap-1 text-sm">
        <span className="font-medium text-slate-700">FAQ context JSON</span>
        <textarea
          name="faqContextJson"
          rows={8}
          defaultValue={toJson(promptSettings?.faqContext ?? null, {})}
          className="font-mono rounded-md border border-slate-300 px-3 py-2 text-xs outline-none focus:border-slate-500"
        />
      </label>

      <SaveButton />

      {state.status === "error" && state.message ? (
        <p className="text-sm text-red-700">{state.message}</p>
      ) : null}

      {state.status === "success" && state.message ? (
        <p className="text-sm text-emerald-700">{state.message}</p>
      ) : null}
    </form>
  );
}

