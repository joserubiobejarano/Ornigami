"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { BillingPeriod, PlanId } from "@/lib/billing/plans";

export function ChangePlanButton({ planId, billingPeriod, label = "Change plan" }: { planId: PlanId; billingPeriod: BillingPeriod; label?: string }) {
  const [busy, setBusy] = useState(false);
  async function changePlan() {
    if (!window.confirm("This change will be applied to your Stripe subscription and invoiced immediately. Continue?")) return;
    setBusy(true);
    const response = await fetch("/api/stripe/change-plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan_id: planId, billing_period: billingPeriod }),
    });
    setBusy(false);
    if (response.ok) window.location.reload();
    else window.alert("We couldn't change your plan. Try again in a moment.");
  }
  return <Button type="button" onClick={changePlan} disabled={busy}>{busy ? "Changing…" : label}</Button>;
}
