import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type StatusTone = "success" | "warning" | "error" | "info" | "neutral";

const toneClass: Record<StatusTone, string> = {
  success:
    "border-emerald-600/35 bg-emerald-500/10 font-medium text-emerald-900 dark:text-emerald-100",
  warning:
    "border-amber-600/35 bg-amber-500/10 font-medium text-amber-950 dark:text-amber-100",
  error:
    "border-red-600/35 bg-red-500/10 font-medium text-red-900 dark:text-red-100",
  info:
    "border-sky-600/35 bg-sky-500/10 font-medium text-sky-900 dark:text-sky-100",
  neutral: "font-normal text-foreground",
};

export function StatusBadge({
  tone,
  className,
  ...props
}: React.ComponentProps<typeof Badge> & { tone: StatusTone }) {
  return (
    <Badge variant="outline" className={cn("shrink-0", toneClass[tone], className)} {...props} />
  );
}
