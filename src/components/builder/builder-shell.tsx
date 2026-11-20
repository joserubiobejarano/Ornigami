import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Builder-owned chrome. It intentionally does not render the reputation
 * marketing header/footer, dashboard navigation, cookie banner or Auth.js
 * session provider.
 */
export function BuilderShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-[#f5f1e8] text-[#1d2a22]">
      <header className="border-b border-[#ddd3c2] bg-[#fbf8f1]">
        <nav
          aria-label="Builder"
          className="mx-auto flex w-full max-w-[1600px] flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6 lg:px-8"
        >
          <Link
            href="/builder"
            className="font-display text-lg font-bold tracking-tight"
          >
            Ornigami Builder
          </Link>
          <div className="flex flex-wrap items-center gap-3 text-xs text-[#5f5a4f]">
            <span className="rounded-full border border-[#c9bda8] bg-[#efe7d8] px-3 py-1 font-semibold uppercase tracking-[0.12em]">
              Private beta
            </span>
            <span>Export only</span>
            <Link
              href="/"
              className="underline decoration-[#b8aa93] underline-offset-4 hover:text-[#1d2a22]"
            >
              Ornigami home
            </Link>
          </div>
        </nav>
      </header>
      <div className="flex-1">{children}</div>
    </div>
  );
}
