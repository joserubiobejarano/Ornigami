"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { AGENT_REGISTRY } from "@/lib/agents/registry";
import { cn } from "@/lib/utils";

function isActivePath(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function DashboardSidebar({ className }: { className?: string }) {
  const pathname = usePathname();
  const isInAgents = isActivePath(pathname, "/dashboard/agents");
  const [agentsOpen, setAgentsOpen] = useState(isInAgents);

  useEffect(() => {
    if (isInAgents) setAgentsOpen(true);
  }, [isInAgents]);

  const agents = useMemo(
    () =>
      AGENT_REGISTRY.map((agent) => ({
        href: agent.basePath,
        label: agent.name,
      })),
    []
  );

  return (
    <aside className={cn("w-full border-b border-border pb-4 lg:w-64 lg:border-b-0 lg:pb-0", className)}>
      <nav className="space-y-1" aria-label="Dashboard sidebar">
        <Link
          href="/dashboard"
          className={cn(
            "block rounded-md px-3 py-2 text-sm font-medium transition-colors",
            isActivePath(pathname, "/dashboard") && !isInAgents
              ? "bg-muted text-foreground shadow-sm"
              : "text-foreground hover:bg-muted/60"
          )}
        >
          Home
        </Link>

        <div>
          <button
            type="button"
            onClick={() => setAgentsOpen((prev) => !prev)}
            className={cn(
              "flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm font-medium transition-colors",
              isInAgents ? "bg-muted text-foreground shadow-sm" : "text-foreground hover:bg-muted/60"
            )}
            aria-expanded={agentsOpen}
            aria-controls="dashboard-agents-links"
          >
            <span>Agents</span>
            <span className="text-xs">{agentsOpen ? "−" : "+"}</span>
          </button>

          {agentsOpen ? (
            <div id="dashboard-agents-links" className="mt-1 space-y-1 pl-3">
              {agents.map((agent) => {
                const active = isActivePath(pathname, agent.href);
                return (
                  <Link
                    key={agent.href}
                    href={agent.href}
                    className={cn(
                      "block rounded-md px-3 py-2 text-sm transition-colors",
                      active ? "bg-muted text-foreground shadow-sm" : "text-foreground hover:bg-muted/60"
                    )}
                  >
                    {agent.label}
                  </Link>
                );
              })}
            </div>
          ) : null}
        </div>

        <Link
          href="/settings#billing"
          className={cn(
            "block rounded-md px-3 py-2 text-sm font-medium transition-colors",
            pathname === "/settings" ? "bg-muted text-foreground shadow-sm" : "text-foreground hover:bg-muted/60"
          )}
        >
          Billing
        </Link>

        <Link
          href="/settings"
          className={cn(
            "block rounded-md px-3 py-2 text-sm font-medium transition-colors",
            pathname === "/settings" ? "bg-muted text-foreground shadow-sm" : "text-foreground hover:bg-muted/60"
          )}
        >
          Settings
        </Link>
      </nav>
    </aside>
  );
}
