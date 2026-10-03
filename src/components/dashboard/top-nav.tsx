"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Check, ChevronsUpDown } from "lucide-react";
import { useMemo } from "react";

import { AGENT_REGISTRY } from "@/lib/agents/registry";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export function DashboardTopNav({ className, canManageBilling = false }: { className?: string; canManageBilling?: boolean }) {
  const pathname = usePathname();
  const navigationItems = [
    { href: "/dashboard/agents/review-replies/reviews", label: "Reviews" },
    { href: "/dashboard/agents/review-replies/settings", label: "Settings" },
    ...(canManageBilling ? [{ href: "/dashboard/billing", label: "Billing" }] : []),
  ];

  return (
    <nav className={cn("grid min-w-full items-center gap-1 rounded-2xl border-[1.5px] border-border bg-card px-2 py-2 shadow-ink-sm sm:flex sm:flex-nowrap", canManageBilling ? "grid-cols-4" : "grid-cols-3", className)} aria-label="Dashboard">
      <Link href="/dashboard" aria-label="Dashboard" className={cn("whitespace-nowrap rounded-xl px-2 py-2 text-center text-xs font-medium transition-colors sm:px-3 sm:text-sm", pathname === "/dashboard" ? "bg-tint-butter text-primary" : "text-muted-foreground hover:bg-surface hover:text-primary")}><span className="sm:hidden">Home</span><span className="hidden sm:inline">Dashboard</span></Link>
      {navigationItems.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return <Link key={item.href} href={item.href} className={cn("whitespace-nowrap rounded-xl px-2 py-2 text-center text-xs font-medium transition-colors sm:px-3 sm:text-sm", active ? "bg-tint-navy text-primary" : "text-muted-foreground hover:bg-surface hover:text-primary")}>{item.label}</Link>;
      })}
      <DashboardAgentMenu className="hidden lg:block" />
    </nav>
  );
}

export function DashboardAgentMenu({ className, compact = false }: { className?: string; compact?: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const activeAgents = useMemo(() => AGENT_REGISTRY.filter((agent) => agent.status === "active"), []);
  const selectedAgent = activeAgents.find((agent) => pathname === agent.basePath || pathname.startsWith(`${agent.basePath}/`));
  const menuId = compact ? "dashboard-mobile-agent-menu" : "dashboard-agent-menu";
  return (
    <div className={className}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild id={`${menuId}-trigger`}>
          <Button variant="outline" aria-label={compact ? `Choose an agent${selectedAgent ? `: ${selectedAgent.name}` : ""}` : undefined} className={cn("h-10 shrink-0 justify-between rounded-xl px-3 text-sm font-medium", !compact && "min-w-52")}>
            <span>{compact ? "Agents" : selectedAgent?.name ?? "Select an agent"}</span>
            <ChevronsUpDown className="size-4 opacity-70" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent id={`${menuId}-content`} align={compact ? "end" : "start"} className="min-w-52 rounded-lg p-1.5">
          {activeAgents.map((agent) => {
            const active = agent.id === selectedAgent?.id;
            return (
              <DropdownMenuItem key={agent.id} onSelect={() => router.push(agent.basePath)} className="cursor-pointer rounded-lg px-2.5 py-2">
                <span className="flex-1">{agent.name}</span>
                {active ? <Check className="size-4 text-foreground" /> : null}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
