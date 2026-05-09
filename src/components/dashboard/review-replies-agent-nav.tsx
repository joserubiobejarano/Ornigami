"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const items = [
  { href: "/dashboard/agents/review-replies", label: "Overview" },
  { href: "/dashboard/agents/review-replies/reviews", label: "Reviews" },
  { href: "/demo", label: "Test Sample Reviews" },
  { href: "/dashboard/agents/review-replies/settings", label: "Settings" },
] as const;

export function ReviewRepliesAgentNav() {
  const pathname = usePathname();

  return (
    <nav className="rounded-xl border border-slate-200 bg-white p-2 shadow-sm" aria-label="Review Replies">
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
                    ? "bg-[#0f172b] text-white"
                    : "text-slate-700 hover:bg-slate-100 hover:text-slate-900"
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
