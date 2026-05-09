"use client";

import { FormEvent, useState } from "react";

import { FollowupsNav } from "@/modules/review-booster/components/followups-nav";
import { PageHeader } from "@/modules/review-booster/components/page-header";

type NewVisitPayload = {
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  service_name: string;
};

const initialState: NewVisitPayload = {
  customer_name: "",
  customer_email: "",
  customer_phone: "",
  service_name: ""
};

export default function ReviewBoosterNewVisitPage() {
  const [form, setForm] = useState<NewVisitPayload>(initialState);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");

    try {
      const res = await fetch("/api/review-booster/visits", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          ...form,
          visited_at: new Date().toISOString()
        })
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data?.error || "Failed to create visit.");
      } else {
        setMessage("Visit created.");
        setForm(initialState);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to create visit.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <FollowupsNav />
      <PageHeader title="New Visit" backToOverview />
      <form onSubmit={onSubmit} className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-700 shadow-sm">
        <label className="block space-y-1">
          <span className="font-medium text-slate-900">Customer name</span>
          <input
            value={form.customer_name}
            onChange={(e) => setForm((prev) => ({ ...prev, customer_name: e.target.value }))}
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
          />
        </label>

        <label className="block space-y-1">
          <span className="font-medium text-slate-900">Customer email</span>
          <input
            type="email"
            value={form.customer_email}
            onChange={(e) => setForm((prev) => ({ ...prev, customer_email: e.target.value }))}
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
          />
        </label>

        <label className="block space-y-1">
          <span className="font-medium text-slate-900">Customer phone</span>
          <input
            value={form.customer_phone}
            onChange={(e) => setForm((prev) => ({ ...prev, customer_phone: e.target.value }))}
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
          />
        </label>

        <label className="block space-y-1">
          <span className="font-medium text-slate-900">Service name</span>
          <input
            value={form.service_name}
            onChange={(e) => setForm((prev) => ({ ...prev, service_name: e.target.value }))}
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
          />
        </label>

        <button
          type="submit"
          disabled={saving}
          className="inline-flex rounded-lg bg-[#0f172b] px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-70"
        >
          {saving ? "Creating..." : "Create visit"}
        </button>
        {message ? <p>{message}</p> : null}
      </form>
    </div>
  );
}
