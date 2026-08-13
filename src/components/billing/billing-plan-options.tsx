"use client";

import { useState } from "react";

import { BillingPeriodToggle } from "@/components/billing/billing-period-toggle";
import { ChangePlanButton } from "@/components/dashboard/change-plan-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PLANS, PLAN_ORDER, effectiveMonthlyFromAnnual, formatAnnualSavings, formatPrice, type BillingPeriod, type PlanId } from "@/lib/billing/plans";

export function BillingPlanOptions({ currentPlan, currentPeriod }: { currentPlan: PlanId | null; currentPeriod: BillingPeriod }) {
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>(currentPeriod);

  return (
    <>
      <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold">Choose your billing period</h2>
          <p className="text-sm text-muted-foreground">Switch between monthly billing and the annual plan. Annual savings vary by plan.</p>
        </div>
        <BillingPeriodToggle value={billingPeriod} onChange={setBillingPeriod} id="dashboard-billing-period-toggle" />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {PLAN_ORDER.map((planId) => {
          const plan = PLANS[planId];
          const isCurrent = currentPlan === planId;
          const isCurrentSelection = isCurrent && billingPeriod === currentPeriod;
          return (
            <Card key={planId} className={`transition-transform hover:-translate-y-1 hover:shadow-ink-md ${plan.recommended ? "border-primary ring-2 ring-primary" : ""}`}>
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <CardTitle>{plan.name}</CardTitle>
                  {plan.recommended ? <Badge>Most popular</Badge> : null}
                </div>
                <CardDescription>{plan.tagline}</CardDescription>
                <p className="pt-2 text-2xl font-semibold">{formatPrice(planId, billingPeriod)}<span className="text-sm font-normal text-muted-foreground">/{billingPeriod === "annual" ? "year" : "month"}</span></p>
                <p className="text-xs text-muted-foreground">{billingPeriod === "annual" ? `${formatAnnualSavings(planId)} · ${effectiveMonthlyFromAnnual(planId)}/month effective` : `or ${effectiveMonthlyFromAnnual(planId)}/month billed annually`}</p>
              </CardHeader>
              <CardContent className="space-y-4">
                <ul className="space-y-2 text-sm">{plan.features.map((feature) => <li key={feature} className="flex gap-2"><span className="font-semibold text-primary">✓</span><span>{feature}</span></li>)}</ul>
                {!currentPlan ? <form action="/api/stripe/checkout" method="post"><input type="hidden" name="plan_id" value={planId} /><input type="hidden" name="billing_period" value={billingPeriod} /><Button type="submit" className="w-full">Start free trial</Button></form> : isCurrentSelection ? <p className="text-sm font-medium text-accent-green">Current plan</p> : <ChangePlanButton planId={planId} billingPeriod={billingPeriod} />}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </>
  );
}
