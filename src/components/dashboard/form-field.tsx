import * as React from "react";

import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export function FormField({
  label,
  htmlFor,
  hint,
  error,
  children,
  className,
  ...props
}: React.ComponentProps<"div"> & {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string;
}) {
  return (
    <div className={cn("space-y-2", className)} {...props}>
      <Label htmlFor={htmlFor} className="text-sm font-medium">
        {label}
      </Label>
      {children}
      {hint && !error ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      {error ? (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
