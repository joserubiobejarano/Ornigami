"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Check, ChevronsUpDown } from "lucide-react";
import { useMemo } from "react";

import { AGENT_REGISTRY } from "@/lib/agents/registry";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export function DashboardTopNav({ className }: { className?: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const activeAgents = useMemo(() => AGENT_REGISTRY.filter((agent) => agent.status === "active"), []);
  const selectedAgentPath = activeAgents.find((agent) => pathname === agent.basePath || pathname.startsWith(`${agent.basePath}/`))?.basePath ?? "";
  const selectedAgent = activeAgents.find((agent) => agent.basePath === selectedAgentPath);

  return (
    <nav className={cn("flex flex-wrap items-center justify-center gap-1 rounded-xl border border-border/70 bg-muted/40 px-2 py-2 shadow-sm", className)} aria-label="Dashboard">
      <Button asChild size="sm" className={cn(pathname === "/dashboard" ? "ring-1 ring-primary/30" : "ring-1 ring-transparent")}><Link href="/dashboard">Dashboard</Link></Button>
      {[{ href: "/reviews", label: "Reviews" }, { href: "/content", label: "Content" }, { href: "/audit", label: "Audit" }, { href: "/settings", label: "Settings" }, { href: "/dashboard/billing", label: "Billing" }].map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return <Link key={item.href} href={item.href} className={cn("rounded-lg px-3 py-2 text-sm font-medium transition-colors", active ? "bg-background text-primary shadow-sm" : "text-muted-foreground hover:bg-background hover:text-foreground")}>{item.label}</Link>;
      })}
      <DropdownMenu>
        <DropdownMenuTrigger asChild id="dashboard-agent-menu-trigger">
          <Button variant="outline" className="h-10 min-w-52 justify-between rounded-lg border-border bg-background/90 px-3 text-sm font-medium">
            <span>{selectedAgent?.name ?? "Select an agent"}</span>
            <ChevronsUpDown className="size-4 opacity-70" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent id="dashboard-agent-menu-content" align="start" className="min-w-52 rounded-lg p-1.5">
          {activeAgents.map((agent) => {
            const active = agent.basePath === selectedAgentPath;
            return (
              <DropdownMenuItem key={agent.id} onSelect={() => router.push(agent.basePath)} className="cursor-pointer rounded-md px-2.5 py-2">
                <span className="flex-1">{agent.name}</span>
                {active ? <Check className="size-4 text-foreground" /> : null}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </nav>
  );
}
