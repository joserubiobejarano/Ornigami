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

function DemoBanner() {
  const demoFromCookie = useSyncExternalStore(() => () => {}, readDemoCookie, () => false);
  if (!demoFromCookie) return null;
  return <DashboardCallout variant="warning" className="mb-2" action={<Button asChild size="sm"><Link href="/dashboard/billing">Start free trial</Link></Button>}><p>Demo mode: you&apos;re using sample reviews. Connect Google in Settings for live data.</p></DashboardCallout>;
}

export function DashboardLayoutClient({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isConnectGate = pathname === "/connect";
  return <div className="min-h-dvh flex flex-col">{!isConnectGate ? <header className="sticky top-0 z-20 border-b-[1.5px] border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80"><div className="mx-auto grid w-full max-w-7xl grid-cols-[auto_1fr_auto] items-center gap-3 px-4 py-3 lg:px-8"><Link href="/" className="flex items-center" aria-label="Ornigami home"><Image src="/logo-ink.svg" alt="Ornigami" width={180} height={72} className="h-9 w-[132px] object-contain object-left dark:hidden" /><Image src="/logo-paper.svg" alt="Ornigami" width={180} height={72} className="hidden h-9 w-[132px] object-contain object-left dark:block" /></Link><DashboardTopNav className="w-full justify-center overflow-x-auto" /><div className="justify-self-end"><DashboardUserMenu /></div></div></header> : null}<main className="flex min-h-0 flex-1 flex-col p-6 lg:p-8"><div className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col"><DemoBanner />{isConnectGate ? <div className="flex min-h-0 flex-1 flex-col justify-center">{children}</div> : <div className="flex min-h-0 flex-1 flex-col">{children}</div>}</div></main></div>;
}
