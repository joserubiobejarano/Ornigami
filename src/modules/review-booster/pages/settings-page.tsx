"use client";

import { FormEvent, useEffect, useState } from "react";

import { FollowupsNav } from "@/modules/review-booster/components/followups-nav";
import { PageHeader } from "@/modules/review-booster/components/page-header";

type SettingsPayload = {
  business_name: string;
  business_type: string;
  google_review_url: string;
  tone: string;
  language: string;
  selected_location_id: string;
};

const initialState: SettingsPayload = {
  business_name: "",
  business_type: "",
  google_review_url: "",
  tone: "warm and friendly",
  language: "en",
  selected_location_id: ""
};

type GoogleProfileLocation = {
  id: string;
  title: string | null;
  review_url: string | null;
  primary_category: string | null;
};

type SettingsResponse = {
  error?: string;
  name?: string | null;
  business_type?: string | null;
  google_review_url?: string | null;
  tone?: string | null;
  language?: string | null;
  google_profile_connected?: boolean;
  google_profile_locations?: GoogleProfileLocation[];
  auto_google_review_url?: string | null;
  effective_google_review_url?: string | null;
};

const TONE_OPTIONS = [
  { value: "warm and friendly", label: "Warm and friendly" },
  { value: "professional", label: "Professional" },
  { value: "casual", label: "Casual" },
  { value: "luxury", label: "Luxury" }
];

const LANGUAGE_OPTIONS = [
  { value: "en", label: "English" },
  { value: "es", label: "Spanish" },
  { value: "fr", label: "French" },
  { value: "de", label: "German" },
  { value: "it", label: "Italian" },
  { value: "pt", label: "Portuguese" }
];

export default function ReviewBoosterSettingsPage() {
  const [form, setForm] = useState<SettingsPayload>(initialState);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [googleConnected, setGoogleConnected] = useState(false);
  const [googleLocations, setGoogleLocations] = useState<GoogleProfileLocation[]>([]);
  const [autoGoogleReviewUrl, setAutoGoogleReviewUrl] = useState<string | null>(null);
  const [syncingLocations, setSyncingLocations] = useState(false);

  useEffect(() => {
    async function loadSettings() {
      setLoading(true);
      setMessage("");
      try {
        const res = await fetch("/api/review-booster/settings");
        const data = (await res.json()) as SettingsResponse;
        if (!res.ok) {
          setMessage(data?.error || "Failed to load settings.");
          return;
        }

        const firstGoogleLocationId = data.google_profile_locations?.[0]?.id ?? "";
        const tone = data?.tone ?? initialState.tone;
        const language = data?.language ?? initialState.language;

        setForm({
          business_name: data?.name ?? "",
          business_type: data?.business_type ?? "",
          google_review_url: data?.google_review_url ?? "",
          tone: TONE_OPTIONS.some((option) => option.value === tone) ? tone : initialState.tone,
          language: LANGUAGE_OPTIONS.some((option) => option.value === language)
            ? language
            : initialState.language,
          selected_location_id: firstGoogleLocationId
        });
        setGoogleConnected(Boolean(data.google_profile_connected));
        setGoogleLocations(data.google_profile_locations ?? []);
        setAutoGoogleReviewUrl(data.auto_google_review_url ?? null);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Failed to load settings.");
      } finally {
        setLoading(false);
      }
    }

    loadSettings();
  }, []);

  async function syncLocations() {
    setSyncingLocations(true);
    setMessage("");
    try {
      const syncRes = await fetch("/api/google/locations/sync", { method: "POST" });
      const syncData = await syncRes.json().catch(() => ({}));
      if (!syncRes.ok) {
        setMessage(
          (syncData as { error?: string })?.error || "Failed to sync locations from Google."
        );
        return;
      }

      const settingsRes = await fetch("/api/review-booster/settings");
      const settingsData = (await settingsRes.json()) as SettingsResponse;
      if (!settingsRes.ok) {
        setMessage((settingsData as { error?: string })?.error || "Failed to refresh settings.");
        return;
      }

      const refreshedLocations = settingsData.google_profile_locations ?? [];
      setGoogleConnected(Boolean(settingsData.google_profile_connected));
      setGoogleLocations(refreshedLocations);
      setAutoGoogleReviewUrl(settingsData.auto_google_review_url ?? null);
      setForm((prev) => ({
        ...prev,
        selected_location_id: refreshedLocations[0]?.id ?? ""
      }));
      setMessage("Google locations synced.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to sync locations from Google.");
    } finally {
      setSyncingLocations(false);
    }
  }

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
        body: JSON.stringify({
          ...form,
          google_review_url: form.google_review_url.trim(),
          selected_location_id: form.selected_location_id || null
        })
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data?.error || "Failed to save settings.");
      } else {
        setGoogleConnected(Boolean((data as SettingsResponse).google_profile_connected));
        setGoogleLocations((data as SettingsResponse).google_profile_locations ?? []);
        setAutoGoogleReviewUrl((data as SettingsResponse).auto_google_review_url ?? null);
        setMessage("Settings saved.");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to save settings.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-6">
      <FollowupsNav />
      <PageHeader title="Settings" backToOverview />
      <form onSubmit={onSubmit} className="w-full space-y-4 rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-700 shadow-sm">
        <label className="block space-y-1">
          <span className="font-medium text-slate-900">Business name</span>
          <input
            required
            value={form.business_name}
            onChange={(e) => setForm((prev) => ({ ...prev, business_name: e.target.value }))}
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
            placeholder="Your Business Name"
          />
        </label>

        <label className="block space-y-1">
          <span className="font-medium text-slate-900">Business type</span>
          <input
            value={form.business_type}
            onChange={(e) => setForm((prev) => ({ ...prev, business_type: e.target.value }))}
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
            placeholder="Dental clinic, salon, gym..."
          />
        </label>

        <section className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm font-medium text-slate-900">Google Business Profile</p>
          <p className="mt-1 text-xs text-slate-600">
            {googleConnected
              ? "Connected. We can auto-use your Google review URL."
              : "Not connected. Connect it to auto-load your review URL."}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {googleConnected ? (
              <button
                type="button"
                onClick={() => void syncLocations()}
                disabled={syncingLocations}
                className="inline-flex rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 transition hover:bg-slate-100 disabled:opacity-70"
              >
                {syncingLocations ? "Syncing..." : "Sync locations"}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  window.location.href = "/api/google/oauth/start";
                }}
                className="inline-flex rounded-lg bg-[#0f172b] px-3 py-2 text-sm font-medium text-white transition hover:opacity-90"
              >
                Connect Google Business Profile
              </button>
            )}
          </div>
          {googleLocations.length > 0 ? (
            <label className="mt-3 block space-y-1">
              <span className="text-xs font-medium text-slate-700">Connected location</span>
              <select
                value={form.selected_location_id}
                onChange={(e) => setForm((prev) => ({ ...prev, selected_location_id: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
              >
                {googleLocations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.title || "Untitled location"}
                    {location.primary_category ? ` - ${location.primary_category}` : ""}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {autoGoogleReviewUrl ? (
            <p className="mt-2 text-xs text-slate-600">
              Auto-detected review URL available. Manual URL below will be used only as fallback.
            </p>
          ) : null}
        </section>

        <label className="block space-y-1">
          <span className="font-medium text-slate-900">Google review URL (manual fallback)</span>
          <input
            value={form.google_review_url}
            onChange={(e) => setForm((prev) => ({ ...prev, google_review_url: e.target.value }))}
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
            placeholder="https://..."
          />
        </label>

        <label className="block space-y-1">
          <span className="font-medium text-slate-900">Tone</span>
          <select
            value={form.tone}
            onChange={(e) => setForm((prev) => ({ ...prev, tone: e.target.value }))}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
          >
            {TONE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block space-y-1">
          <span className="font-medium text-slate-900">Language</span>
          <select
            value={form.language}
            onChange={(e) => setForm((prev) => ({ ...prev, language: e.target.value }))}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
          >
            {LANGUAGE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
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
