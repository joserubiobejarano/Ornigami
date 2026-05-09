"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/dashboard/followups", label: "Overview" },
  { href: "/dashboard/followups/upload", label: "Upload CSV" },
  { href: "/dashboard/followups/new", label: "Add Visit" },
  { href: "/dashboard/followups/settings", label: "Settings" }
];

export function FollowupsNav() {
  const pathname = usePathname();

  return (
    <nav className="rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
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
                    ? "bg-[#0f172b] text-white"
                    : "text-slate-700 hover:bg-slate-100 hover:text-slate-900"
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