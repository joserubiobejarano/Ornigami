"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const items = [
  { href: "/dashboard/agents/review-replies", label: "Overview" },
  { href: "/dashboard/agents/review-replies/reviews", label: "Reviews" },
  { href: "/dashboard/agents/review-replies/google-connection", label: "Google profile" },
  { href: "/dashboard/agents/review-replies/settings", label: "Settings" },
] as const;

export function ReviewRepliesAgentNav() {
  const pathname = usePathname();

  return (
    <nav className="rounded-2xl border-[1.5px] border-border bg-card p-2 shadow-ink-sm" aria-label="Review Replies">
      <ul className="flex flex-wrap gap-2">
        {items.map((item) => {
          const active =
            pathname === item.href ||
            (item.href !== "/dashboard/agents/review-replies" && pathname.startsWith(item.href));

          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={cn(
                  "inline-flex rounded-lg px-3 py-2 text-sm font-medium transition",
                  active
                    ? "bg-tint-navy text-primary shadow-ink-sm"
                    : "text-muted-foreground hover:bg-surface hover:text-primary"
                )}
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
