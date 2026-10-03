"use client";

import Link from "next/link";
import Image from "next/image";
import { ReactNode, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { DashboardCallout, DashboardTopNav } from "@/components/dashboard";
import { DashboardUserMenu } from "@/components/dashboard/user-menu";
import { Button } from "@/components/ui/button";

function readDemoCookie(): boolean {
  return typeof document !== "undefined" && document.cookie.includes("ll_demo=true");
}

function DemoBanner({ canManageBilling }: { canManageBilling: boolean }) {
  const demoFromCookie = useSyncExternalStore(() => () => {}, readDemoCookie, () => false);
  if (!demoFromCookie) return null;
  return <DashboardCallout variant="warning" className="mb-2" action={canManageBilling ? <Button asChild size="sm"><Link href="/dashboard/billing">Start free trial</Link></Button> : undefined}><p>Demo mode: you&apos;re using sample reviews. Connect Google in Settings for live data.</p></DashboardCallout>;
}

export function DashboardLayoutClient({ children, canManageBilling = false }: { children: ReactNode; canManageBilling?: boolean }) {
  const pathname = usePathname();
  const isConnectGate = pathname === "/connect" || pathname === "/dashboard/agents/review-replies/google-connection";
  return (
    <div className="flex min-h-dvh flex-col">
      {!isConnectGate ? (
        <header className="sticky top-0 z-20 border-b-[1.5px] border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
          <div className="mx-auto grid w-full max-w-7xl grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-3 px-4 py-3 lg:grid-cols-[auto_minmax(0,1fr)_auto] lg:px-8">
            <Link href="/" className="flex min-w-0 items-center" aria-label="Ornigami home">
              <Image src="/logo-ink.svg" alt="Ornigami" width={180} height={72} className="h-9 w-[132px] object-contain object-left dark:hidden" />
              <Image src="/logo-paper.svg" alt="Ornigami" width={180} height={72} className="hidden h-9 w-[132px] object-contain object-left dark:block" />
            </Link>
            <div className="col-span-2 row-start-2 min-w-0 overflow-x-auto lg:col-span-1 lg:col-start-2 lg:row-start-1">
              <DashboardTopNav canManageBilling={canManageBilling} className="w-max min-w-full justify-start lg:w-full lg:justify-center" />
            </div>
            <div className="col-start-2 row-start-1 justify-self-end lg:col-start-3">
              <DashboardUserMenu canManageBilling={canManageBilling} />
            </div>
          </div>
        </header>
      ) : null}
      <main className="flex min-h-0 flex-1 flex-col p-4 sm:p-6 lg:p-8">
        <div className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col">
          <DemoBanner canManageBilling={canManageBilling} />
          {isConnectGate ? <div className="flex min-h-0 flex-1 flex-col justify-center">{children}</div> : <div className="flex min-h-0 flex-1 flex-col">{children}</div>}
        </div>
      </main>
    </div>
  );
}
