"use client";

import { FormEvent, useEffect, useState } from "react";

import { FollowupsNav } from "@/modules/review-booster/components/followups-nav";
import { PageHeader } from "@/modules/review-booster/components/page-header";

type SettingsPayload = {
  google_review_url: string;
  rebooking_url: string;
  tone: string;
  language: string;
  email_from_name: string;
};

const initialState: SettingsPayload = {
  google_review_url: "",
  rebooking_url: "",
  tone: "",
  language: "",
  email_from_name: ""
};

export default function ReviewBoosterSettingsPage() {
  const [form, setForm] = useState<SettingsPayload>(initialState);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function loadSettings() {
      setLoading(true);
      setMessage("");
      try {
        const res = await fetch("/api/review-booster/settings");
        const data = await res.json();
        if (!res.ok) {
          setMessage(data?.error || "Failed to load settings.");
          return;
        }
        setForm({
          google_review_url: data?.google_review_url ?? "",
          rebooking_url: data?.rebooking_url ?? "",
          tone: data?.tone ?? "",
          language: data?.language ?? "",
          email_from_name: data?.email_from_name ?? ""
        });
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Failed to load settings.");
      } finally {
        setLoading(false);
      }
    }

    loadSettings();
  }, []);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");

    try {
      const res = await fetch("/api/review-booster/settings", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify(form)
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data?.error || "Failed to save settings.");
      } else {
        setMessage("Settings saved.");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to save settings.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <FollowupsNav />
      <PageHeader title="Settings" backToOverview />
      <form onSubmit={onSubmit} className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-700 shadow-sm">
        <label className="block space-y-1">
          <span className="font-medium text-slate-900">Google review URL</span>
          <input
            required
            value={form.google_review_url}
            onChange={(e) => setForm((prev) => ({ ...prev, google_review_url: e.target.value }))}
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
            placeholder="https://..."
          />
        </label>

        <label className="block space-y-1">
          <span className="font-medium text-slate-900">Rebooking URL</span>
          <input
            value={form.rebooking_url}
            onChange={(e) => setForm((prev) => ({ ...prev, rebooking_url: e.target.value }))}
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
            placeholder="https://..."
          />
        </label>

        <label className="block space-y-1">
          <span className="font-medium text-slate-900">Tone</span>
          <input
            value={form.tone}
            onChange={(e) => setForm((prev) => ({ ...prev, tone: e.target.value }))}
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
            placeholder="warm and friendly"
          />
        </label>

        <label className="block space-y-1">
          <span className="font-medium text-slate-900">Language</span>
          <input
            value={form.language}
            onChange={(e) => setForm((prev) => ({ ...prev, language: e.target.value }))}
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
            placeholder="en"
          />
        </label>

        <label className="block space-y-1">
          <span className="font-medium text-slate-900">Email from name</span>
          <input
            value={form.email_from_name}
            onChange={(e) => setForm((prev) => ({ ...prev, email_from_name: e.target.value }))}
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
            placeholder="Your Business Name"
          />
        </label>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={loading || saving}
            className="inline-flex rounded-lg bg-[#0f172b] px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-70"
          >
            {saving ? "Saving..." : "Save settings"}
          </button>
          {loading ? <span>Loading settings...</span> : null}
        </div>
        {message ? <p>{message}</p> : null}
      </form>
    </div>
  );
}
