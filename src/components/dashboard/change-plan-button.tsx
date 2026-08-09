"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { BillingPeriod, PlanId } from "@/lib/billing/plans";

export function ChangePlanButton({ planId, billingPeriod }: { planId: PlanId; billingPeriod: BillingPeriod }) {
  const [busy, setBusy] = useState(false);
  async function changePlan() {
    setBusy(true);
    const response = await fetch("/api/stripe/change-plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan_id: planId, billing_period: billingPeriod }),
    });
    setBusy(false);
    if (response.ok) window.location.reload();
    else window.alert("We could not change your plan. Please try again.");
  }
  return <Button type="button" onClick={changePlan} disabled={busy}>{busy ? "Changing..." : "Upgrade to Complete"}</Button>;
}