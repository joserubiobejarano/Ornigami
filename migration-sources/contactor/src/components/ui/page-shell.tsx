import type { ReactNode } from "react";
import Link from "next/link";

const internalLinks = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/leads", label: "Leads" },
  { href: "/admin/onboarding", label: "Onboarding" },
  { href: "/admin/settings", label: "Settings" },
];
const ownerLinks = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/leads", label: "Leads" },
  { href: "/dashboard/settings", label: "Settings" },
];

export function PageShell({
  title,
  subtitle,
  variant = "internal",
  rightSlot,
  children,
}: {
  title: string;
  subtitle?: string;
  variant?: "internal" | "owner";
  rightSlot?: ReactNode;
  children: ReactNode;
}) {
  const links = variant === "owner" ? ownerLinks : internalLinks;

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-8">
      <header className="mb-8 rounded-xl border border-slate-300 bg-slate-100 p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Ornigami Contact
            </p>
            <p className="mt-1 text-xs uppercase tracking-wide text-slate-500">
              {variant === "owner" ? "Owner dashboard" : "Internal admin"}
            </p>
          </div>
          {rightSlot}
        </div>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-slate-600">{subtitle}</p> : null}
        <nav className="mt-4 flex flex-wrap gap-2">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-800 transition hover:bg-slate-200"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </header>
      {children}
    </div>
  );
}


