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
  rebooking_url: string;
  email_from_name: string;
  tone: string;
  language: string;
  selected_location_id: string;
};

const initialState: SettingsPayload = {
  business_name: "",
  business_type: "",
  google_review_url: "",
  rebooking_url: "",
  email_from_name: "",
  tone: "warm and friendly",
  language: "en",
  selected_location_id: ""
};

type GoogleProfileLocation = {
  id: string;
  title: string | null;
  review_url: string | null;
  primary_category: string | null;
  selected?: boolean;
};

type SettingsResponse = {
  error?: string;
  name?: string | null;
  id?: string;
  businessId?: string;
  business_role?: "owner" | "member";
  can_manage_settings?: boolean;
  business_type?: string | null;
  google_review_url?: string | null;
  tone?: string | null;
  language?: string | null;
  google_profile_connected?: boolean;
  google_profile_locations?: GoogleProfileLocation[];
  auto_google_review_url?: string | null;
  effective_google_review_url?: string | null;
  rebooking_url?: string | null;
  email_from_name?: string | null;
  selected_location_id?: string | null;
  rebooking_url_valid?: boolean;
  google_review_url_valid?: boolean;
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
  const [businessId, setBusinessId] = useState("");
  const [canManageSettings, setCanManageSettings] = useState(false);
  const [invalidLegacyReviewUrl, setInvalidLegacyReviewUrl] = useState(false);
  const [invalidLegacyBookingUrl, setInvalidLegacyBookingUrl] = useState(false);
  const [locationToSelect, setLocationToSelect] = useState("");
  const [selectingLocation, setSelectingLocation] = useState(false);

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
          setMessage(data?.error || "We couldn't load your settings. Try again in a moment.");
          return;
        }

        const tone = data?.tone ?? initialState.tone;
        const language = data?.language ?? initialState.language;

        setForm({
          business_name: data?.name ?? "",
          business_type: data?.business_type ?? "",
          google_review_url: data?.google_review_url ?? "",
          rebooking_url: data?.rebooking_url ?? "",
          email_from_name: data?.email_from_name ?? "",
          tone: TONE_OPTIONS.some((option) => option.value === tone) ? tone : initialState.tone,
          language: LANGUAGE_OPTIONS.some((option) => option.value === language)
            ? language
            : initialState.language,
          selected_location_id: data.selected_location_id ?? ""
        });
        setGoogleConnected(Boolean(data.google_profile_connected));
        setBusinessId(data.businessId ?? data.id ?? "");
        setCanManageSettings(data.can_manage_settings === true);
        setInvalidLegacyReviewUrl(data.google_review_url_valid === false);
        setInvalidLegacyBookingUrl(data.rebooking_url_valid === false);
        setGoogleLocations(data.google_profile_locations ?? []);
        setAutoGoogleReviewUrl(data.auto_google_review_url ?? null);
      } catch (error) {
        setMessageKind("error");
        setMessage(error instanceof Error ? error.message : "We couldn't load your settings. Try again in a moment.");
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
      const syncRes = await fetch("/api/google/locations/sync", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(businessId ? { businessId } : {}),
      });
      const syncData = await syncRes.json().catch(() => ({}));
      if (!syncRes.ok) {
        setMessageKind("error");
        setMessage(
          (syncData as { error?: string })?.error || "We couldn't sync your locations. Try again in a moment."
        );
        return;
      }

      const settingsRes = await fetch(`/api/review-booster/settings${businessId ? `?businessId=${encodeURIComponent(businessId)}` : ""}`);
      const settingsData = (await settingsRes.json()) as SettingsResponse;
      if (!settingsRes.ok) {
        setMessageKind("error");
        setMessage((settingsData as { error?: string })?.error || "We couldn't refresh your settings. Try again in a moment.");
        return;
      }

      const refreshedLocations = settingsData.google_profile_locations ?? [];
      setGoogleConnected(Boolean(settingsData.google_profile_connected));
      setGoogleLocations(refreshedLocations);
      setAutoGoogleReviewUrl(settingsData.auto_google_review_url ?? null);
      setInvalidLegacyReviewUrl(settingsData.google_review_url_valid === false);
      setInvalidLegacyBookingUrl(settingsData.rebooking_url_valid === false);
      setForm((prev) => ({ ...prev, selected_location_id: settingsData.selected_location_id ?? "" }));
      setMessageKind("success");
      setMessage("Google locations synced.");
    } catch (error) {
      setMessageKind("error");
      setMessage(error instanceof Error ? error.message : "We couldn't sync your locations. Try again in a moment.");
    } finally {
      setSyncingLocations(false);
    }
  }

  async function selectGoogleLocation() {
    if (!businessId || !locationToSelect || selectingLocation || form.selected_location_id || googleLocations.some((location) => location.selected)) return;
    setSelectingLocation(true);
    setMessage("");
    setMessageKind("info");
    try {
      const response = await fetch("/api/google/locations/selection", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ businessId, locationId: locationToSelect }),
      });
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) {
        setMessageKind("error");
        setMessage(result.error || "We couldn't select this Google location. Try again.");
        return;
      }
      const settingsRes = await fetch(`/api/review-booster/settings?businessId=${encodeURIComponent(businessId)}`);
      const data = await settingsRes.json() as SettingsResponse;
      if (!settingsRes.ok) {
        setMessageKind("error");
        setMessage(data.error || "The selected location could not be loaded.");
        return;
      }
      setForm((prev) => ({ ...prev, selected_location_id: data.selected_location_id ?? "" }));
      setGoogleConnected(Boolean(data.google_profile_connected));
      setGoogleLocations(data.google_profile_locations ?? []);
      setAutoGoogleReviewUrl(data.auto_google_review_url ?? null);
      setLocationToSelect("");
      setMessageKind("success");
      setMessage("Google location selected. Save settings to use its review link.");
    } catch (error) {
      setMessageKind("error");
      setMessage(error instanceof Error ? error.message : "We couldn't select this Google location. Try again.");
    } finally {
      setSelectingLocation(false);
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
          business_name: form.business_name,
          business_type: form.business_type,
          tone: form.tone,
          language: form.language,
          google_review_url: form.google_review_url.trim(),
          rebooking_url: form.rebooking_url.trim(),
          email_from_name: form.email_from_name.trim(),
          businessId: businessId || undefined
        })
      });
      const data = await res.json();
      if (!res.ok) {
        setMessageKind("error");
        setMessage(data?.error || "We couldn't save your changes. Try again in a moment.");
      } else {
        setGoogleConnected(Boolean((data as SettingsResponse).google_profile_connected));
        setGoogleLocations((data as SettingsResponse).google_profile_locations ?? []);
        setAutoGoogleReviewUrl((data as SettingsResponse).auto_google_review_url ?? null);
        setBusinessId((data as SettingsResponse).businessId ?? (data as SettingsResponse).id ?? businessId);
        setInvalidLegacyReviewUrl((data as SettingsResponse).google_review_url_valid === false);
        setInvalidLegacyBookingUrl((data as SettingsResponse).rebooking_url_valid === false);
        setForm((prev) => ({
          ...prev,
          google_review_url: (data as SettingsResponse).google_review_url ?? "",
          rebooking_url: (data as SettingsResponse).rebooking_url ?? "",
          email_from_name: (data as SettingsResponse).email_from_name ?? "",
          selected_location_id: (data as SettingsResponse).selected_location_id ?? "",
        }));
        setMessageKind("success");
        setMessage("Settings saved.");
      }
    } catch (error) {
      setMessageKind("error");
      setMessage(error instanceof Error ? error.message : "We couldn't save your changes. Try again in a moment.");
    } finally {
      setSaving(false);
    }
  }

  const pinnedGoogleLocation = googleLocations.find((location) => location.selected) ??
    googleLocations.find((location) => location.id === form.selected_location_id);
  const hasPinnedGoogleLocation = Boolean(form.selected_location_id || pinnedGoogleLocation);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-6">
      <FollowupsNav />
      <PageHeader title="Settings" backToOverview />
      <form onSubmit={onSubmit} className="w-full space-y-4 rounded-2xl border-[1.5px] border-border bg-card p-6 text-sm text-muted-foreground shadow-ink-sm">
        {!canManageSettings && !loading ? <p role="status">Only the business owner can change Review Booster settings.</p> : null}
        <fieldset disabled={!canManageSettings} className="space-y-4">
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

        <section className="rounded-xl border-[1.5px] border-border bg-surface p-4">
          <p className="text-sm font-medium text-primary">Google profile</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {googleConnected
              ? "Connected. We can auto-use your Google review URL."
              : "Not connected. Connect it to auto-load your review URL."}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {canManageSettings && googleConnected ? (
              <Button
                type="button"
                onClick={() => void syncLocations()}
                disabled={syncingLocations}
                variant="secondary"
                size="sm"
              >
                {syncingLocations ? "Syncing..." : "Sync locations"}
              </Button>
            ) : canManageSettings ? (
              <Button
                type="button"
                onClick={() => {
                  window.location.href = "/api/google/oauth/start";
                }}
                size="sm"
              >
                Connect Google
              </Button>
            ) : null}
          </div>
          {hasPinnedGoogleLocation ? (
            <p className="mt-3 text-xs text-muted-foreground">
              Selected location: {pinnedGoogleLocation?.title ?? "Google location"}. This selection is pinned for this business.
            </p>
          ) : googleLocations.length > 0 ? (
            <p className="mt-3 text-xs text-muted-foreground">No Google location is selected for this business.</p>
          ) : null}
          {canManageSettings && !hasPinnedGoogleLocation && googleLocations.length > 0 ? (
            <div className="mt-3 flex flex-wrap items-end gap-2">
              <label className="block min-w-56 flex-1 space-y-1">
                <span className="text-xs font-medium text-primary">Choose the business location</span>
                <select
                  value={locationToSelect}
                  onChange={(event) => setLocationToSelect(event.target.value)}
                  disabled={selectingLocation}
                  className={nativeSelectClassName}
                >
                  <option value="">Select a location</option>
                  {googleLocations.filter((location) => !location.selected).map((location) => (
                    <option key={location.id} value={location.id}>{location.title || "Untitled location"}</option>
                  ))}
                </select>
              </label>
              <Button type="button" variant="secondary" size="sm" disabled={!locationToSelect || selectingLocation} onClick={() => void selectGoogleLocation()}>
                {selectingLocation ? "Selecting…" : "Use this location"}
              </Button>
            </div>
          ) : null}
          {autoGoogleReviewUrl ? (
            <p className="mt-2 text-xs text-muted-foreground">
              Auto-detected review URL available. A valid manual URL below takes precedence.
            </p>
          ) : null}
        </section>

        <label className="block space-y-1">
          <span className="font-medium text-primary">Google review URL (manual override)</span>
          <p className="text-xs text-muted-foreground">
            Use the direct Google Maps &quot;Write a review&quot; link (the popup review form link). This removes friction and usually converts better than a generic profile link.
          </p>
          {invalidLegacyReviewUrl ? <p role="alert" className="text-xs text-destructive">This saved link is unsafe and cannot be used in a follow-up email. Replace it with a direct Google review link.</p> : null}
          <Input
            value={form.google_review_url}
            onChange={(e) => setForm((prev) => ({ ...prev, google_review_url: e.target.value }))}
            placeholder="https://..."
          />
        </label>

        <label className="block space-y-1">
          <span className="font-medium text-primary">Booking URL (optional)</span>
          <p className="text-xs text-muted-foreground">When set, customers also see a “Book again” link in the same follow-up email.</p>
          {invalidLegacyBookingUrl ? <p role="alert" className="text-xs text-destructive">This saved link is unsafe and will be omitted from emails. Replace it with a public HTTPS booking link or clear it.</p> : null}
          <Input
            type="url"
            value={form.rebooking_url}
            onChange={(e) => setForm((prev) => ({ ...prev, rebooking_url: e.target.value }))}
            placeholder="https://your-booking-site.example/"
          />
        </label>

        <label className="block space-y-1">
          <span className="font-medium text-primary">Email sender name (optional)</span>
          <p className="text-xs text-muted-foreground">This changes the display name only. The sending address remains managed by Ornigami.</p>
          <Input
            maxLength={120}
            value={form.email_from_name}
            onChange={(e) => setForm((prev) => ({ ...prev, email_from_name: e.target.value }))}
            placeholder="Your Business Name"
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
            disabled={loading || saving || selectingLocation}
          >
            {saving ? "Saving..." : "Save settings"}
          </Button>
          {loading ? <span>Loading settings...</span> : null}
        </div>
        </fieldset>
        {message ? (
          <div
            role="status"
            className={
              messageKind === "success"
                ? "rounded-xl border-[1.5px] border-accent-green/35 bg-accent-green/10 px-3 py-2 text-sm font-medium text-primary"
                : messageKind === "error"
                  ? "rounded-xl border-[1.5px] border-destructive/35 bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive"
                  : "rounded-xl border-[1.5px] border-border bg-surface px-3 py-2 text-sm font-medium text-primary"
            }
          >
            {messageKind === "success" ? "Settings saved. " : null}
            {message}
          </div>
        ) : null}
      </form>
    </div>
  );
}
