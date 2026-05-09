"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

import {
  DashboardCallout,
  DashboardPage,
  DashboardPageHeader,
  FormField,
  StatusBadge,
} from "@/components/dashboard";
import SignOutButton from "@/components/SignOutButton";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

const DEFAULT_TONE = "Friendly and professional";

const TONE_OPTIONS = [
  "Warm and friendly",
  "Professional",
  "Casual",
  "Luxury",
] as const;

type GoogleLocation = {
  id: string;
  locationName: string;
  title: string | null;
  primaryCategory: string | null;
  isSuspended: boolean;
};

type ConnectionData = {
  connected: boolean;
  locations?: GoogleLocation[];
};

function SettingsPageContent() {
  const searchParams = useSearchParams();
  const [isDemo, setIsDemo] = useState(false);
  const [connectionData, setConnectionData] = useState<ConnectionData | null>(null);
  const [connLoading, setConnLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [businessName, setBusinessName] = useState("");
  const [tone, setTone] = useState(DEFAULT_TONE);
  const [ownerName, setOwnerName] = useState("");
  const [contactPreference, setContactPreference] = useState("");
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  const [isSyncing, setIsSyncing] = useState(false);
  const [autoReplyAllReviews, setAutoReplyAllReviews] = useState(false);
  const [autoReplySaving, setAutoReplySaving] = useState(false);

  function readApiErrorMessage(raw: unknown, fallback: string): string {
    if (raw && typeof raw === "object" && "error" in raw && typeof raw.error === "string") {
      const normalized = raw.error.toLowerCase();
      if (normalized.includes("not connected")) return "Google connection failed. Please try again.";
      if (normalized.includes("paid plans"))
        return "Connecting Google Business Profile and syncing reviews requires a paid plan.";
      return raw.error;
    }
    return fallback;
  }

  useEffect(() => {
    const cookies = document.cookie.split(";");
    const demoCookie = cookies.find((c) => c.trim().startsWith("ll_demo="));
    const isDemoMode = demoCookie?.split("=")[1] === "true";
    setIsDemo(isDemoMode);

    if (isDemoMode) {
      setConnLoading(false);
      setSettingsLoading(false);
      return;
    }

    let cancelled = false;

    async function load() {
      setConnLoading(true);
      setSettingsLoading(true);
      setError(null);
      setSettingsError(null);

      try {
        const [connRes, settingsRes] = await Promise.all([
          fetch("/api/google/connection"),
          fetch("/api/settings/reply"),
        ]);

        if (cancelled) return;

        if (settingsRes.ok) {
          const s = await settingsRes.json();
          setBusinessName(typeof s.businessName === "string" ? s.businessName : "");
          setTone(
            typeof s.tone === "string" && s.tone.trim() ? s.tone.trim() : DEFAULT_TONE
          );
          setOwnerName(typeof s.ownerName === "string" ? s.ownerName : "");
          setContactPreference(typeof s.contactPreference === "string" ? s.contactPreference : "");
          setAutoReplyAllReviews(Boolean(s.autoReplyAllReviews));
        } else {
          setSettingsError("Could not load reply settings.");
        }

        if (connRes.ok) {
          const data = await connRes.json();
          setConnectionData(data);
        } else {
          setError("Failed to load Google connection.");
          setConnectionData(null);
        }
      } catch {
        if (!cancelled) {
          setError("Failed to load Google connection.");
          setSettingsError("Could not load reply settings.");
          setConnectionData(null);
        }
      } finally {
        if (!cancelled) {
          setConnLoading(false);
          setSettingsLoading(false);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const googleStatus = searchParams.get("google");
    const reason = searchParams.get("reason");
    if (googleStatus !== "error") return;
    if (reason === "missing_refresh_token") {
      setError("Google connection failed. Please try again.");
      return;
    }
    setError("Google connection failed. Please try again.");
  }, [searchParams]);

  const fetchConnectionData = async () => {
    setConnLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/google/connection");
      if (!res.ok) throw new Error("Failed to load connection data");
      const data = await res.json();
      setConnectionData(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load connection data");
    } finally {
      setConnLoading(false);
    }
  };

  const handleSaveReplySettings = async () => {
    setSaveState("saving");
    setSettingsError(null);
    try {
      const res = await fetch("/api/settings/reply", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessName,
          tone,
          ownerName,
          contactPreference,
          autoReplyAllReviews,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(typeof j.error === "string" ? j.error : "Save failed");
      }
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 2500);
    } catch (e: unknown) {
      setSaveState("error");
      setSettingsError(e instanceof Error ? e.message : "Save failed");
      setTimeout(() => setSaveState("idle"), 3000);
    }
  };

  const handleSyncLocations = async () => {
    setIsSyncing(true);
    setError(null);
    try {
      const res = await fetch("/api/google/locations/sync", { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(readApiErrorMessage(body, "Location sync failed. Please try again."));
      }
      await fetchConnectionData();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Location sync failed. Please try again.");
    } finally {
      setIsSyncing(false);
    }
  };

  const handleDisconnect = async () => {
    setError(null);
    try {
      const res = await fetch("/api/google/disconnect", { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(readApiErrorMessage(body, "Failed to disconnect"));
      }
      await fetchConnectionData();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to disconnect");
    }
  };

  const handleConnectGoogle = () => {
    window.location.href = "/api/google/oauth/start";
  };

  const persistAutoReply = async (next: boolean) => {
    setAutoReplySaving(true);
    try {
      const res = await fetch("/api/settings/reply", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessName,
          tone,
          ownerName,
          contactPreference,
          autoReplyAllReviews: next,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(typeof j.error === "string" ? j.error : "Save failed");
      }
      setAutoReplyAllReviews(next);
      toast.success(
        next
          ? "Auto-reply on — new replies will post to Google after sync or when you generate."
          : "Auto-reply off — replies are saved as drafts."
      );
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Could not update auto-reply");
    } finally {
      setAutoReplySaving(false);
    }
  };

  if (isDemo) {
    return (
      <DashboardPage width="md">
        <DashboardPageHeader
          title="Settings"
          description="Configure review reply defaults and connect Google Business Profile."
        />

        <DashboardCallout
          variant="warning"
          title="You are in demo mode"
          action={
            <Button asChild size="sm">
              <Link href="/signup">Create your free account</Link>
            </Button>
          }
        >
          <p className="text-foreground">
            Settings are not available in demo mode. Create your free account to save reply preferences
            and connect Google Business Profile.
          </p>
        </DashboardCallout>

        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle>Google Business Profile</CardTitle>
            <CardDescription>Google connection is not available in demo mode.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/signup">Create your free account</Link>
            </Button>
          </CardContent>
        </Card>
      </DashboardPage>
    );
  }

  const locations = connectionData?.locations || [];
  const gbpConnected = Boolean(connectionData?.connected);

  return (
    <DashboardPage width="md">
      <DashboardPageHeader title="Settings" />

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>Reply settings</CardTitle>
          <CardDescription>
            These defaults are used when generating review replies. Optional fields can be left blank.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {settingsError && (
            <DashboardCallout variant="error">
              <p>{settingsError}</p>
            </DashboardCallout>
          )}
          {settingsLoading ? (
            <p className="text-sm text-foreground">Loading reply settings…</p>
          ) : (
            <>
              <FormField label="Business name" htmlFor="settings-business-name">
                <Input
                  id="settings-business-name"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  placeholder="Your business name"
                  autoComplete="organization"
                />
              </FormField>
              <FormField label="Tone" htmlFor="settings-tone">
                <select
                  id="settings-tone"
                  value={tone}
                  onChange={(e) => setTone(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-foreground"
                >
                  {TONE_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField
                label="Owner name or team name (optional)"
                htmlFor="settings-owner"
              >
                <Input
                  id="settings-owner"
                  value={ownerName}
                  onChange={(e) => setOwnerName(e.target.value)}
                  placeholder="e.g. Jamie or The Downtown Team"
                  autoComplete="name"
                />
              </FormField>
              <FormField
                label="Contact preference (optional)"
                htmlFor="settings-contact"
              >
                <Input
                  id="settings-contact"
                  value={contactPreference}
                  onChange={(e) => setContactPreference(e.target.value)}
                  placeholder='e.g. "Call the store directly" or "Email us directly"'
                />
              </FormField>
              <div className="flex flex-wrap items-center gap-3 pt-2">
                <Button
                  type="button"
                  onClick={() => void handleSaveReplySettings()}
                  disabled={saveState === "saving"}
                >
                  {saveState === "saving" ? "Saving…" : "Save reply settings"}
                </Button>
                {saveState === "saved" && (
                  <Badge variant="secondary" className="font-normal text-foreground">
                    Saved
                  </Badge>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <CardTitle className="flex flex-wrap items-center gap-2">
                <span>Google Business Profile</span>
                {!connLoading && gbpConnected && <StatusBadge tone="success">Connected</StatusBadge>}
              </CardTitle>
              <CardDescription>
                {connLoading
                  ? "Loading connection…"
                  : gbpConnected
                    ? `Locations synced: ${locations.length}`
                    : "Connect to sync locations and reviews."}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <DashboardCallout variant="error">
              <p>{error}</p>
            </DashboardCallout>
          )}

          {connLoading && (
            <p className="text-sm text-foreground">Loading Google connection…</p>
          )}

          {!connLoading && !gbpConnected && (
            <div className="space-y-4">
              <p className="text-sm leading-relaxed text-foreground">
                Sync your locations and reviews so LocalLift can help you reply on Google Business
                Profile.
              </p>
              <div className="flex flex-wrap gap-3">
                <Button onClick={handleConnectGoogle}>Connect with Google</Button>
                {error && (
                  <Button type="button" onClick={() => void fetchConnectionData()}>
                    Retry
                  </Button>
                )}
              </div>
            </div>
          )}

          {!connLoading && gbpConnected && (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-3">
                <Button onClick={handleSyncLocations} disabled={isSyncing}>
                  {isSyncing ? "Syncing…" : "Sync locations"}
                </Button>
                <Button onClick={handleDisconnect}>
                  Disconnect Google
                </Button>
              </div>

              {locations.length > 0 ? (
                <div className="overflow-hidden rounded-xl border border-border shadow-sm">
                  <div className="border-b border-border bg-muted/50 px-4 py-2.5 text-sm font-medium">
                    Locations
                  </div>
                  <ul className="max-h-80 divide-y divide-border overflow-auto">
                    {locations.map((loc) => (
                      <li key={loc.id} className="px-4 py-3.5">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-medium">
                              {loc.title || loc.locationName}
                            </div>
                            {loc.primaryCategory && (
                              <div className="mt-1 text-xs text-foreground">
                                {loc.primaryCategory}
                              </div>
                            )}
                          </div>
                          <Badge
                            variant={loc.isSuspended ? "destructive" : "secondary"}
                            className="shrink-0"
                          >
                            {loc.isSuspended ? "Suspended" : "Active"}
                          </Badge>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="text-sm text-foreground">
                  No locations synced yet. Click &quot;Sync locations&quot; to pull them from Google.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>Auto-reply to all reviews</CardTitle>
          <CardDescription>
            When enabled, we generate replies after each review sync and when you click Generate, then post
            them to Google Business Profile automatically. When disabled, replies are saved as drafts for you
            to review and post manually.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-row items-center justify-between gap-4 rounded-lg border border-border bg-muted/30 px-4 py-3">
            <div className="min-w-0 space-y-0.5">
              <p className="text-sm font-medium text-foreground">Automatic posting</p>
              <p className="text-xs text-foreground">
                {autoReplyAllReviews
                  ? "ON — replies publish to GBP when generated or after sync."
                  : "OFF — replies are stored as drafts only."}
              </p>
            </div>
            <Switch
              checked={autoReplyAllReviews}
              onCheckedChange={(v) => void persistAutoReply(v)}
              disabled={autoReplySaving || settingsLoading}
              aria-label="Auto-reply to all reviews"
            />
          </div>
        </CardContent>
      </Card>

      <div className="border-t border-border pt-6">
        <p className="mb-3 text-sm text-foreground">Signed in as your account.</p>
        <SignOutButton className="w-full sm:w-auto" />
      </div>
    </DashboardPage>
  );
}

export default function SettingsPage() {
  return (
    <Suspense
      fallback={
        <DashboardPage width="md">
          <p className="text-sm text-muted-foreground">Loading settings…</p>
        </DashboardPage>
      }
    >
      <SettingsPageContent />
    </Suspense>
  );
}
