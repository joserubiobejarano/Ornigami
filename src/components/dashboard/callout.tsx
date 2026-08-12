import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const calloutVariants = cva(
  "rounded-lg border px-4 py-3 text-sm [&_a]:font-medium [&_a]:underline-offset-4 [&_a]:hover:underline",
  {
    variants: {
      variant: {
        info: "border-accent-yellow/35 bg-accent-yellow/10 text-primary",
        warning: "border-accent-yellow/35 bg-accent-yellow/10 text-primary",
        success: "border-accent-green/35 bg-accent-green/10 text-primary",
        error:
          "border-destructive/35 bg-destructive/10 text-destructive dark:border-destructive/50 dark:bg-destructive/15",
        neutral: "border-border bg-muted/50 text-foreground",
      },
    },
    defaultVariants: {
      variant: "neutral",
    },
  }
);

export type DashboardCalloutVariant = NonNullable<VariantProps<typeof calloutVariants>["variant"]>;

export function DashboardCallout({
  variant,
  title,
  children,
  action,
  className,
  ...props
}: React.ComponentProps<"div"> & {
  variant?: DashboardCalloutVariant;
  title?: string;
  action?: React.ReactNode;
}) {
  return (
    <div
      role={variant === "error" ? "alert" : undefined}
      className={cn(
        calloutVariants({ variant }),
        "flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4",
        className
      )}
      {...props}
    >
      <div className="min-w-0 flex-1 space-y-1.5">
        {title ? <p className="font-medium leading-snug">{title}</p> : null}
        <div className="text-sm leading-relaxed text-foreground/90 [&_p+p]:mt-2">{children}</div>
      </div>
      {action ? <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">{action}</div> : null}
    </div>
  );
}
