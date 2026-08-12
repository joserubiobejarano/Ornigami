"use client";

import { FormEvent, useEffect, useState } from "react";

import { FollowupsNav } from "@/modules/review-booster/components/followups-nav";
import { PageHeader } from "@/modules/review-booster/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { nativeSelectClassName } from "@/lib/form-controls";

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
  const [messageKind, setMessageKind] = useState<"success" | "error" | "info">("info");
  const [googleConnected, setGoogleConnected] = useState(false);
  const [googleLocations, setGoogleLocations] = useState<GoogleProfileLocation[]>([]);
  const [autoGoogleReviewUrl, setAutoGoogleReviewUrl] = useState<string | null>(null);
  const [syncingLocations, setSyncingLocations] = useState(false);

  useEffect(() => {
    async function loadSettings() {
      setLoading(true);
      setMessage("");
      setMessageKind("info");
      try {
        const res = await fetch("/api/review-booster/settings");
        const data = (await res.json()) as SettingsResponse;
        if (!res.ok) {
          setMessageKind("error");
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
        setMessageKind("error");
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
    setMessageKind("info");
    try {
      const syncRes = await fetch("/api/google/locations/sync", { method: "POST" });
      const syncData = await syncRes.json().catch(() => ({}));
      if (!syncRes.ok) {
        setMessageKind("error");
        setMessage(
          (syncData as { error?: string })?.error || "Failed to sync locations from Google."
        );
        return;
      }

      const settingsRes = await fetch("/api/review-booster/settings");
      const settingsData = (await settingsRes.json()) as SettingsResponse;
      if (!settingsRes.ok) {
        setMessageKind("error");
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
      setMessageKind("success");
      setMessage("Google locations synced.");
    } catch (error) {
      setMessageKind("error");
      setMessage(error instanceof Error ? error.message : "Failed to sync locations from Google.");
    } finally {
      setSyncingLocations(false);
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    setMessageKind("info");

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
        setMessageKind("error");
        setMessage(data?.error || "Failed to save settings.");
      } else {
        setGoogleConnected(Boolean((data as SettingsResponse).google_profile_connected));
        setGoogleLocations((data as SettingsResponse).google_profile_locations ?? []);
        setAutoGoogleReviewUrl((data as SettingsResponse).auto_google_review_url ?? null);
        setMessageKind("success");
        setMessage("Settings saved.");
      }
    } catch (error) {
      setMessageKind("error");
      setMessage(error instanceof Error ? error.message : "Failed to save settings.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-6">
      <FollowupsNav />
      <PageHeader title="Settings" backToOverview />
      <form onSubmit={onSubmit} className="w-full space-y-4 rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground shadow-sm">
        <label className="block space-y-1">
          <span className="font-medium text-primary">Business name</span>
          <Input
            required
            value={form.business_name}
            onChange={(e) => setForm((prev) => ({ ...prev, business_name: e.target.value }))}
            placeholder="Your Business Name"
          />
        </label>

        <label className="block space-y-1">
          <span className="font-medium text-primary">Business type</span>
          <Input
            value={form.business_type}
            onChange={(e) => setForm((prev) => ({ ...prev, business_type: e.target.value }))}
            placeholder="Dental clinic, salon, gym..."
          />
        </label>

        <section className="rounded-lg border border-border bg-surface p-4">
          <p className="text-sm font-medium text-primary">Google Business Profile</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {googleConnected
              ? "Connected. We can auto-use your Google review URL."
              : "Not connected. Connect it to auto-load your review URL."}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {googleConnected ? (
              <Button
                type="button"
                onClick={() => void syncLocations()}
                disabled={syncingLocations}
                variant="secondary"
                size="sm"
              >
                {syncingLocations ? "Syncing..." : "Sync locations"}
              </Button>
            ) : (
              <Button
                type="button"
                onClick={() => {
                  window.location.href = "/api/google/oauth/start";
                }}
                size="sm"
              >
                Connect Google Business Profile
              </Button>
            )}
          </div>
          {googleLocations.length > 0 ? (
            <label className="mt-3 block space-y-1">
              <span className="text-xs font-medium text-primary">Connected location</span>
              <select
                value={form.selected_location_id}
                onChange={(e) => setForm((prev) => ({ ...prev, selected_location_id: e.target.value }))}
                className={nativeSelectClassName}
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
            <p className="mt-2 text-xs text-muted-foreground">
              Auto-detected review URL available. Manual URL below will be used only as fallback.
            </p>
          ) : null}
        </section>

        <label className="block space-y-1">
          <span className="font-medium text-primary">Google review URL (manual fallback)</span>
          <p className="text-xs text-muted-foreground">
            Use the direct Google Maps &quot;Write a review&quot; link (the popup review form link). This removes friction and usually converts better than a generic profile link.
          </p>
          <Input
            value={form.google_review_url}
            onChange={(e) => setForm((prev) => ({ ...prev, google_review_url: e.target.value }))}
            placeholder="https://..."
          />
        </label>

        <label className="block space-y-1">
          <span className="font-medium text-primary">Tone</span>
          <select
            value={form.tone}
            onChange={(e) => setForm((prev) => ({ ...prev, tone: e.target.value }))}
            className={nativeSelectClassName}
          >
            {TONE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block space-y-1">
          <span className="font-medium text-primary">Language</span>
          <select
            value={form.language}
            onChange={(e) => setForm((prev) => ({ ...prev, language: e.target.value }))}
            className={nativeSelectClassName}
          >
            {LANGUAGE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <div className="flex items-center gap-3">
          <Button
            type="submit"
            disabled={loading || saving}
          >
            {saving ? "Saving..." : "Save settings"}
          </Button>
          {loading ? <span>Loading settings...</span> : null}
        </div>
        {message ? (
          <div
            role="status"
            className={
              messageKind === "success"
                ? "rounded-lg border border-accent-green/35 bg-accent-green/10 px-3 py-2 text-sm font-medium text-primary"
                : messageKind === "error"
                  ? "rounded-lg border border-destructive/35 bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive"
                  : "rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium text-primary"
            }
          >
            {messageKind === "success" ? "Settings updated successfully. " : null}
            {message}
          </div>
        ) : null}
      </form>
    </div>
  );
}
