"use client";

export const dynamic = "force-dynamic";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";

import {
  DashboardCallout,
  DashboardPage,
  DashboardPageHeader,
  FormField,
  StatusBadge,
} from "@/components/dashboard";
import SignOutButton from "@/components/SignOutButton";
import { TeamMembersCard } from "@/components/dashboard/team-members-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { nativeSelectClassName } from "@/lib/form-controls";
import {
  TONE_OPTIONS,
  useReviewReplySettings,
} from "@/modules/review-replies/hooks/use-review-reply-settings";

type GoogleLocation = {
  id: string;
  locationName: string;
  title: string | null;
  primaryCategory: string | null;
  isSuspended: boolean;
  selected: boolean;
};

type ConnectionData = {
  connected: boolean;
  canManage?: boolean;
  selectionLocked?: boolean;
  locations?: GoogleLocation[];
};

function SettingsPageContent() {
  const { data: session } = useSession();
  const searchParams = useSearchParams();
  const [connectionData, setConnectionData] = useState<ConnectionData | null>(null);
  const [connLoading, setConnLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isSyncing, setIsSyncing] = useState(false);
  const [selectingLocation, setSelectingLocation] = useState<string | null>(null);
  const {
    isDemo,
    businessId,
    readOnly,
    canManageAutoReply,
    businessName,
    setBusinessName,
    tone,
    setTone,
    ownerName,
    setOwnerName,
    contactPreference,
    setContactPreference,
    settingsLoading,
    settingsError,
    saveState,
    autoReplyAllReviews,
    autoReplySaving,
    saveReplySettings,
    persistAutoReply,
  } = useReviewReplySettings();

  function readApiErrorMessage(raw: unknown, fallback: string): string {
    if (raw && typeof raw === "object" && "error" in raw && typeof raw.error === "string") {
      const normalized = raw.error.toLowerCase();
      if (normalized.includes("not connected")) return "Google connection failed. Please try again.";
      if (normalized.includes("paid plans"))
        return "Connecting Google and syncing reviews requires a paid plan.";
      return raw.error;
    }
    return fallback;
  }

  const fetchConnectionData = useCallback(async () => {
    setConnLoading(true);
    setError(null);
    try {
      const connectionQuery = businessId ? `?businessId=${encodeURIComponent(businessId)}` : "";
      const res = await fetch(`/api/google/connection${connectionQuery}`);
      if (!res.ok) throw new Error("We couldn't load your Google connection. Try again in a moment.");
      const data = await res.json();
      setConnectionData(data);
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "We couldn't load your Google connection. Try again in a moment.");
      setConnectionData(null);
    } finally {
      setConnLoading(false);
    }
  }, [businessId]);

  useEffect(() => {
    if (isDemo) {
      setConnLoading(false);
      return;
    }
    void fetchConnectionData();
  }, [fetchConnectionData, isDemo]);

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

  const handleSyncLocations = async () => {
    setIsSyncing(true);
    setError(null);
    try {
      const res = await fetch("/api/google/locations/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(businessId ? { businessId } : {}),
      });
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
    if (!window.confirm("Disconnect Google? Review syncing and posting will stop until you reconnect.")) return;
    setError(null);
    try {
      const res = await fetch("/api/google/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(businessId ? { businessId } : {}),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(readApiErrorMessage(body, "We couldn't disconnect Google. Try again in a moment."));
      }
      await fetchConnectionData();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "We couldn't disconnect Google. Try again in a moment.");
    }
  };

  const handleConnectGoogle = () => {
    window.location.href = "/api/google/oauth/start";
  };

  const handleSelectLocation = async (locationId: string) => {
    setSelectingLocation(locationId);
    setError(null);
    try {
      const res = await fetch("/api/google/locations/selection", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...(businessId ? { businessId } : {}), locationId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(readApiErrorMessage(body, "We couldn't select this location. Please try again."));
      }
      await fetchConnectionData();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Location selection failed.");
    } finally {
      setSelectingLocation(null);
    }
  };


  if (isDemo) {
    return (
      <DashboardPage width="md">
        <DashboardPageHeader
          title="Settings"
          description="Set your reply tone and connect Google to start syncing reviews."
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
            Create your free account to save reply preferences and connect Google.
          </p>
        </DashboardCallout>

        <Card className="shadow-ink-sm">
          <CardHeader>
            <CardTitle>Google profile</CardTitle>
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

      <Card className="border-[1.5px] border-border shadow-ink-sm">
        <CardHeader>
            <CardTitle>Your reply tone</CardTitle>
          <CardDescription>
            These details shape AI drafts. Every generated reply is saved for review before it can be posted.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {settingsError && (
            <DashboardCallout variant="error">
              <p>{settingsError}</p>
            </DashboardCallout>
          )}
          {settingsLoading ? (
            <div className="space-y-3"><Skeleton className="h-4 w-32" /><Skeleton className="h-9 w-full" /><Skeleton className="h-4 w-24" /><Skeleton className="h-9 w-full" /></div>
          ) : (
            <>
              {readOnly && (
                <DashboardCallout variant="neutral">
                  <p>Reply settings are read-only for your workspace role. Ask the workspace owner to change them.</p>
                </DashboardCallout>
              )}
              <FormField label="Business name" htmlFor="settings-business-name">
                <Input
                  id="settings-business-name"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  placeholder="Your business name"
                  autoComplete="organization"
                  readOnly={readOnly}
                />
              </FormField>
              <FormField label="Tone" htmlFor="settings-tone">
                <select
                  id="settings-tone"
                  value={tone}
                  onChange={(e) => setTone(e.target.value)}
                  className={nativeSelectClassName}
                  disabled={readOnly}
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
                  readOnly={readOnly}
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
                  readOnly={readOnly}
                />
              </FormField>
              <div className="flex flex-wrap items-center gap-3 pt-2">
                <Button
                  type="button"
                  onClick={() => void saveReplySettings()}
                  disabled={saveState === "saving" || readOnly}
                >
                  {saveState === "saving" ? "Saving…" : "Save changes"}
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

      <Card className="border-[1.5px] border-border shadow-ink-sm">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <CardTitle className="flex flex-wrap items-center gap-2">
                <span>Google profile</span>
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
            <div className="space-y-2"><Skeleton className="h-4 w-44" /><Skeleton className="h-10 w-full" /></div>
          )}

          {!connLoading && !gbpConnected && (
            <div className="space-y-4">
              <p className="text-sm leading-relaxed text-foreground">
                Sync your locations and reviews so Ornigami can help you reply on Google Business
                Profile.
              </p>
              <div className="flex flex-wrap gap-3">
                <Button onClick={handleConnectGoogle} disabled={connectionData?.canManage !== true}>Connect Google</Button>
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
              {connectionData?.selectionLocked && !locations.some((location) => location.selected) ? (
                <p className="text-sm text-foreground">
                  Your selected location is unavailable. Reconnect the Google account that manages it and sync locations again.
                </p>
              ) : null}
              <div className="flex flex-wrap gap-3">
                <Button onClick={handleSyncLocations} disabled={isSyncing}>
                  {isSyncing ? "Syncing…" : "Sync locations"}
                </Button>
                <Button onClick={handleDisconnect} disabled={connectionData?.canManage !== true}>
                  Disconnect Google
                </Button>
              </div>

              {locations.length > 0 ? (
                <div className="overflow-hidden rounded-xl border-[1.5px] border-border shadow-ink-sm">
                  <div className="border-b border-border bg-surface px-4 py-2.5 text-sm font-medium text-primary">
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
                          {loc.selected ? <Badge>Selected</Badge> : connectionData?.canManage && !connectionData.selectionLocked && !locations.some((location) => location.selected) ? (
                            <Button size="sm" onClick={() => void handleSelectLocation(loc.id)} disabled={selectingLocation !== null}>
                              {selectingLocation === loc.id ? "Selecting…" : "Use this location"}
                            </Button>
                          ) : null}
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

      <Card className="border-[1.5px] border-border shadow-ink-sm">
        <CardHeader>
          <CardTitle>Auto-post trusted replies</CardTitle>
          <CardDescription>
            With owner approval enabled, interactive sync may post replies to known 4–5-star reviews. Unknown and 1–3-star reviews always require manual approval. Scheduled runs save drafts only.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-row items-center justify-between gap-4 rounded-xl border-[1.5px] border-border bg-surface px-4 py-3">
            <div className="min-w-0 space-y-0.5">
              <p className="text-sm font-medium text-foreground">Automatic posting</p>
              <p className="text-xs text-foreground">
                {autoReplyAllReviews
                  ? "ON — eligible replies may post after interactive sync. Generate always saves a draft; scheduled runs save drafts only."
                  : "OFF — replies are saved as drafts until you approve and post them."}
              </p>
            </div>
            <Switch
              checked={autoReplyAllReviews}
              onCheckedChange={(v) => void persistAutoReply(v)}
              disabled={autoReplySaving || settingsLoading || !canManageAutoReply}
              aria-label="Auto-post trusted replies"
            />
          </div>
          {!canManageAutoReply && (
            <p className="mt-2 text-xs text-muted-foreground">Only the workspace owner can change this setting.</p>
          )}
        </CardContent>
      </Card>

      <TeamMembersCard />

      <div className="border-t border-border pt-6">
        <p className="mb-3 text-sm text-muted-foreground">Signed in as {session?.user?.email ?? "your account"}.</p>
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
