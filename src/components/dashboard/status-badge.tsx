import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type StatusTone = "success" | "warning" | "error" | "info" | "neutral";

const toneClass: Record<StatusTone, string> = {
  success: "border-accent-green/35 bg-accent-green/10 font-medium text-primary",
  warning: "border-accent-marigold/35 bg-accent-marigold/10 font-medium text-primary",
  error: "border-destructive/35 bg-destructive/10 font-medium text-destructive",
  info: "border-navy/35 bg-navy/10 font-medium text-navy",
  neutral: "border-border bg-surface font-normal text-muted-foreground",
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
