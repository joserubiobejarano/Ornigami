import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type StatusTone = "success" | "warning" | "error" | "info" | "neutral";

const toneClass: Record<StatusTone, string> = {
  success: "border-accent-green/35 bg-accent-green/10 font-medium text-primary",
  warning: "border-accent-yellow/35 bg-accent-yellow/10 font-medium text-primary",
  error: "border-destructive/35 bg-destructive/10 font-medium text-destructive",
  info:
    "border-accent-yellow/35 bg-accent-yellow/10 font-medium text-primary",
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
