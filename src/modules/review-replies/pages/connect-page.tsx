"use client";

export const dynamic = "force-dynamic";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import {
  DashboardCallout,
  DashboardPage,
  DashboardPageHeader,
} from "@/components/dashboard";
import { Button } from "@/components/ui/button";
import { fetchReplySettings } from "@/modules/review-replies/services/review-replies-api.service";

function connectErrorMessage(google: string | null, reason: string | null): string | null {
  if (google !== "error") return null;
  if (reason === "missing_refresh_token") {
    return "Google connection failed. Please try again and grant all requested permissions.";
  }
  return "Google connection failed. Please try again.";
}
function ConnectContent() {
  const searchParams = useSearchParams();
  const [permission, setPermission] = useState<"loading" | "allowed" | "member" | "error">("loading");
  useEffect(() => {
    let cancelled = false;
    void fetchReplySettings().then((settings) => {
      if (cancelled) return;
      if (!settings) {
        setPermission("error");
      } else if (settings.isOwner === true || settings.role === "owner") {
        setPermission("allowed");
      } else {
        setPermission("member");
      }
    }).catch(() => {
      if (!cancelled) setPermission("error");
    });
    return () => { cancelled = true; };
  }, []);
  const error = connectErrorMessage(
    searchParams.get("google"),
    searchParams.get("reason")
  );

  function handleConnectGoogle() {
    window.location.href = "/api/google/oauth/start";
  }

  return (
    <DashboardPage width="sm" className="flex flex-col items-center space-y-6">
      <DashboardPageHeader
        align="center"
        title="Connect your accounts"
        description="Link Google to start syncing reviews. You can try sample reviews first if you prefer."
      />

      {error && (
        <DashboardCallout variant="error" className="w-full text-center">
          <p>{error}</p>
        </DashboardCallout>
      )}

      {permission === "loading" && <p role="status" className="text-sm text-muted-foreground">Checking workspace access…</p>}
      {permission === "member" && (
        <DashboardCallout variant="neutral" className="w-full max-w-lg" title="Workspace owner action required">
          <p>Only the workspace owner can connect Google and select the business location. Ask the owner to finish setup, then return to your review inbox.</p>
          <div className="mt-3 flex flex-wrap gap-3 text-sm">
            <Link className="underline underline-offset-4" href="/dashboard">Back to dashboard</Link>
            <Link className="underline underline-offset-4" href="/dashboard/agents/review-replies/settings">Review settings</Link>
          </div>
        </DashboardCallout>
      )}
      {permission === "error" && (
        <DashboardCallout variant="error" className="w-full max-w-lg" title="We couldn’t confirm connection access">
          <p>Google connection controls are unavailable until workspace access can be checked. Try opening Review settings again.</p>
          <Link className="mt-3 inline-block underline underline-offset-4" href="/dashboard/agents/review-replies/settings">Open review settings</Link>
        </DashboardCallout>
      )}
      {permission === "allowed" && (
        <div className="flex w-full flex-col items-stretch gap-3 sm:w-auto sm:items-center">
          <Button asChild variant="outline" size="lg" className="w-full sm:w-auto">
            <Link href="/demo">Try with sample reviews</Link>
          </Button>
          <Button type="button" size="lg" className="w-full sm:w-auto" onClick={handleConnectGoogle}>
            Connect Google
          </Button>
        </div>
      )}
    </DashboardPage>
  );
}

export default function ConnectPage() {
  return (
    <Suspense
      fallback={
        <DashboardPage width="sm" className="text-center">
          <p className="text-sm text-muted-foreground">Loading…</p>
        </DashboardPage>
      }
    >
      <ConnectContent />
    </Suspense>
  );
}
