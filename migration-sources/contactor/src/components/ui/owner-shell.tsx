import type { ReactNode } from "react";

import { logoutOwnerAction } from "@/app/owner/actions";
import { PageShell } from "@/components/ui/page-shell";

export function OwnerPageShell({
  title,
  subtitle,
  ownerName,
  children,
}: {
  title: string;
  subtitle?: string;
  ownerName: string;
  children: ReactNode;
}) {
  return (
    <PageShell
      title={title}
      subtitle={subtitle}
      variant="owner"
      rightSlot={
        <form action={logoutOwnerAction}>
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-600">{ownerName}</span>
            <button
              type="submit"
              className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700"
            >
              Log out
            </button>
          </div>
        </form>
      }
    >
      {children}
    </PageShell>
  );
}
