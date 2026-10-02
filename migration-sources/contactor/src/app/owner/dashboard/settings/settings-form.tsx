"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import {
  initialOwnerSettingsActionState,
} from "@/app/owner/dashboard/settings/action-state";
import { updateOwnerSettingsAction } from "@/app/owner/dashboard/settings/actions";
import type { Business } from "@/server/db/schema";

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

export function OwnerSettingsForm({ business }: { business: Business }) {
  const [state, formAction] = useActionState(
    updateOwnerSettingsAction,
    initialOwnerSettingsActionState,
  );

  return (
    <form action={formAction} className="grid gap-4">
      <label className="grid gap-1 text-sm">
        <span className="font-medium text-slate-700">Business</span>
        <input
          disabled
          value={business.name}
          className="rounded-md border border-slate-200 bg-slate-100 px-3 py-2 text-slate-600"
        />
      </label>

      <label className="grid gap-1 text-sm">
        <span className="font-medium text-slate-700">Preferred channel</span>
        <select
          name="preferredChannel"
          defaultValue={business.preferredChannel}
          className="rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
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
          className="rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
        />
      </label>

      <fieldset className="grid gap-2 rounded-md border border-slate-200 p-3">
        <legend className="px-1 text-sm font-medium text-slate-700">Notification channels</legend>
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
        <legend className="px-1 text-sm font-medium text-slate-700">Notification triggers</legend>
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

