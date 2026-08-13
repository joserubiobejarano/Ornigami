"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { BillingPeriod } from "@/lib/billing/plans";

export function BillingPeriodToggle({
  value,
  onChange,
  id = "billing-period-toggle",
  defaultValue = "monthly",
  targetId,
}: {
  value?: BillingPeriod;
  onChange?: (period: BillingPeriod) => void;
  id?: string;
  defaultValue?: BillingPeriod;
  targetId?: string;
}) {
  const [internalValue, setInternalValue] = useState<BillingPeriod>(defaultValue);
  const selectedValue = value ?? internalValue;

  function selectPeriod(period: BillingPeriod) {
    if (value === undefined) setInternalValue(period);
    onChange?.(period);

    if (targetId) {
      document.getElementById(targetId)?.setAttribute("data-billing-period", period);
      document
        .querySelectorAll<HTMLInputElement>("[data-pricing-billing-period]")
        .forEach((input) => {
          input.value = period;
        });
    }
  }

  return (
    <div id={id} className="inline-flex items-center gap-1 rounded-full border-[1.5px] border-border bg-surface p-1" aria-label="Billing period">
      {(["monthly", "annual"] as const).map((period) => (
        <Button
          key={period}
          type="button"
          size="sm"
          variant={selectedValue === period ? "default" : "ghost"}
          aria-pressed={selectedValue === period}
          onClick={() => selectPeriod(period)}
          className="rounded-full px-4"
        >
          {period === "monthly" ? "Monthly" : "Yearly"}
        </Button>
      ))}
    </div>
  );
}
