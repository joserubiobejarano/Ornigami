"use client";

export const dynamic = "force-dynamic";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import {
  DashboardCallout,
  DashboardPage,
  DashboardPageHeader,
} from "@/components/dashboard";
import { Button } from "@/components/ui/button";

function connectErrorMessage(google: string | null, reason: string | null): string | null {
  if (google !== "error") return null;
  if (reason === "missing_refresh_token") {
    return "Google connection failed. Please try again and grant all requested permissions.";
  }
  return "Google connection failed. Please try again.";
}
function ConnectContent() {
  const searchParams = useSearchParams();
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

      <div className="flex w-full flex-col items-stretch gap-3 sm:w-auto sm:items-center">
        <Button asChild variant="outline" size="lg" className="w-full sm:w-auto">
          <Link href="/demo">Try with sample reviews</Link>
        </Button>
        <Button
          type="button"
          size="lg"
          className="w-full sm:w-auto"
          onClick={handleConnectGoogle}
        >
          Connect Google
        </Button>
      </div>
    </DashboardPage>
  );
}

export default function ConnectPage() {
  return (
    <Suspense
      fallback={
        <DashboardPage width="sm" className="text-center">
          <p className="text-sm text-muted-foreground">LoadingÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦</p>
        </DashboardPage>
      }
    >
      <ConnectContent />
    </Suspense>
  );
}
