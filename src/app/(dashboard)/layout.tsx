"use client";

import Link from "next/link";
import { ReactNode, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";

import { DashboardCallout, DashboardTopNav } from "@/components/dashboard";
import { DashboardSidebar } from "@/components/dashboard/sidebar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function readDemoCookie(): boolean {
  return typeof document !== "undefined" && document.cookie.includes("ll_demo=true");
}

function DemoBanner() {
  const demoFromCookie = useSyncExternalStore(
    () => () => {},
    readDemoCookie,
    () => false
  );
  const isDemo = demoFromCookie;

  if (!isDemo) return null;

  return (
    <DashboardCallout
      variant="warning"
      className="mb-2"
      action={
        <Button asChild size="sm">
          <Link href="/settings#billing">Start free trial</Link>
        </Button>
      }
    >
      <p>
        Demo mode: you&apos;re using sample reviews. Connect Google Business Profile in Settings for
        live data.
      </p>
    </DashboardCallout>
  );
}

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isConnectGate = pathname === "/connect";

  return (
    <div className="min-h-dvh flex flex-col">
      {!isConnectGate && (
        <header className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
          <div className="mx-auto flex max-w-5xl items-center justify-center px-4 py-3 lg:px-8">
            <DashboardTopNav className="w-full justify-center" />
          </div>
        </header>
      )}
      <main className="flex min-h-0 flex-1 flex-col p-6 lg:p-8">
        <div className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col">
          <DemoBanner />
          {isConnectGate ? (
            <div className="flex min-h-0 flex-1 flex-col justify-center">{children}</div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col gap-6 lg:flex-row lg:items-start">
              <DashboardSidebar className="lg:sticky lg:top-20" />
              <div className={cn("flex min-h-0 flex-1 flex-col")}>{children}</div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
