"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

export function Switch({
  className,
  checked,
  onCheckedChange,
  disabled,
  id,
  "aria-labelledby": ariaLabelledBy,
  ...props
}: Omit<React.ComponentProps<"button">, "onClick" | "type"> & {
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      id={id}
      aria-checked={checked}
      aria-labelledby={ariaLabelledBy}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "peer relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        "disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "bg-primary" : "bg-muted",
        className
      )}
      {...props}
    >
      <span
        className={cn(
          "pointer-events-none block h-5 w-5 rounded-full bg-background shadow-md ring-0 transition-transform",
          checked ? "translate-x-5" : "translate-x-0.5"
        )}
        aria-hidden
      />
    </button>
  );
}
