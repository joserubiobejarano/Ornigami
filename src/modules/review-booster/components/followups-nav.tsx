"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/dashboard/agents/review-booster", label: "Overview" },
  { href: "/dashboard/agents/review-booster/upload", label: "Upload CSV" },
  { href: "/dashboard/agents/review-booster/new", label: "Add Visit" },
  { href: "/dashboard/agents/review-booster/settings", label: "Settings" }
];

export function FollowupsNav() {
  const pathname = usePathname();

  return (
    <nav className="rounded-xl border border-border bg-card p-2 shadow-sm">
      <ul className="flex flex-wrap gap-2">
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={[
                  "inline-flex rounded-lg px-3 py-2 text-sm font-medium transition",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-secondary hover:text-card-foreground"
                ].join(" ")}
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
