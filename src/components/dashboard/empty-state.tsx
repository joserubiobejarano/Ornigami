import * as React from "react";

import { cn } from "@/lib/utils";

export function DashboardEmptyState({
  title,
  description,
  children,
  className,
  ...props
}: React.ComponentProps<"div"> & {
  title: string;
  description?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border-[1.5px] border-border bg-tint-navy px-6 py-10 text-center shadow-ink-sm",
        className
      )}
      {...props}
    >
      <div className="mx-auto max-w-md space-y-2">
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        {description ? (
          <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {children ? <div className="mt-6 flex flex-wrap items-center justify-center gap-2">{children}</div> : null}
    </div>
  );
}
