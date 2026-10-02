"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "@/components/followups/theme-toggle";

const NAV_ITEMS = [
  { href: "/dashboard/followups", label: "Overview" },
  { href: "/dashboard/followups/upload", label: "Upload visits" },
  { href: "/dashboard/followups/new", label: "Add a visit" },
  { href: "/dashboard/followups/settings", label: "Settings" },
];

export function FollowupsNav() {
  const pathname = usePathname();

  return (
    <nav className="rounded-2xl border-[1.5px] border-border bg-card p-2 shadow-ink-sm">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 px-2 py-1">
        <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-xs font-bold text-primary-foreground">O</span>
        <span className="text-sm font-semibold text-card-foreground">Ornigami · Review Booster</span>
        </div>
        <ThemeToggle />
      </div>
      <ul className="flex flex-wrap gap-2">
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={`inline-flex rounded-xl px-3 py-2 text-sm font-medium transition ${active ? "bg-tint-peach text-primary" : "text-muted-foreground hover:bg-surface hover:text-primary"}`}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
