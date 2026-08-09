"use client";

import { Button } from "@/components/ui/button";
import type { BillingPeriod } from "@/lib/billing/plans";

export function BillingPeriodToggle({
  value,
  onChange,
  id = "billing-period-toggle",
}: {
  value: BillingPeriod;
  onChange: (period: BillingPeriod) => void;
  id?: string;
}) {
  return (
    <div id={id} className="inline-flex items-center gap-1 rounded-full border bg-muted/50 p-1" aria-label="Billing period">
      {(["monthly", "annual"] as const).map((period) => (
        <Button
          key={period}
          type="button"
          size="sm"
          variant={value === period ? "default" : "ghost"}
          aria-pressed={value === period}
          onClick={() => onChange(period)}
          className="rounded-full px-4"
        >
          {period === "monthly" ? "Monthly" : "Annual"}
        </Button>
      ))}
    </div>
  );
}
