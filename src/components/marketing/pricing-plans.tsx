import Link from "next/link";
import { Check } from "lucide-react";

import { BillingPeriodToggle } from "@/components/billing/billing-period-toggle";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FoldedCorner } from "@/components/marketing/primitives";
import {
  PLANS,
  PLAN_ORDER,
  effectiveMonthlyFromAnnual,
  formatAnnualSavings,
  formatPrice,
  type PlanId,
} from "@/lib/billing/plans";

const planCopy: Record<PlanId, { name: string; tagline: string }> = {
  replies: { name: "Start", tagline: "Answer every review." },
  booster: { name: "Grow", tagline: "Reviews and follow-ups, together." },
  complete: { name: "Complete", tagline: "Your full local reputation toolkit." },
};

export function PricingPlans() {
  return (
    <>
      <section className="mx-auto max-w-6xl px-4 py-10 text-center md:px-6">
        <BillingPeriodToggle id="pricing-billing-period-toggle" targetId="pricing-plan-grid" />
        <p className="mt-3 text-sm text-muted-foreground">
          Save with yearly billing. Prices are per location. Need several?{" "}
          <Link className="font-semibold text-primary underline underline-offset-4" href="/contact">
            Get in touch.
          </Link>
        </p>
      </section>
      <section
        id="pricing-plan-grid"
        data-billing-period="monthly"
        className="group mx-auto grid max-w-6xl gap-5 px-4 pb-16 md:grid-cols-3 md:px-6"
      >
        {PLAN_ORDER.map((planId) => {
          const plan = PLANS[planId];
          const copy = planCopy[planId];
          return (
            <Card
              key={planId}
              className={`relative border-[1.5px] border-border bg-card shadow-ink-sm transition-transform hover:-translate-y-1 hover:shadow-ink-md ${plan.recommended ? "border-primary ring-2 ring-primary" : ""}`}
            >
              {plan.recommended ? <FoldedCorner /> : null}
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <CardTitle className="text-xl">{copy.name}</CardTitle>
                  {plan.recommended ? (
                    <span className="rounded-full bg-tint-butter px-3 py-1 text-xs font-bold text-primary">
                      Most popular
                    </span>
                  ) : null}
                </div>
                <CardDescription>{copy.tagline}</CardDescription>
                <div className="pt-4">
                  <span className="font-mono text-4xl font-semibold text-primary group-data-[billing-period=annual]:hidden">
                    {formatPrice(planId, "monthly")}
                  </span>
                  <span className="hidden font-mono text-4xl font-semibold text-primary group-data-[billing-period=annual]:inline">
                    {formatPrice(planId, "annual")}
                  </span>
                  <span className="text-muted-foreground group-data-[billing-period=annual]:hidden"> / month</span>
                  <span className="hidden text-muted-foreground group-data-[billing-period=annual]:inline"> / year</span>
                </div>
                <p className="text-sm text-muted-foreground group-data-[billing-period=annual]:hidden">
                  or {effectiveMonthlyFromAnnual(planId)}/month billed annually
                </p>
                <p className="hidden text-sm text-muted-foreground group-data-[billing-period=annual]:block">
                  {formatAnnualSavings(planId)}
                </p>
              </CardHeader>
              <CardContent className="space-y-5">
                <ul className="space-y-3 text-sm">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex gap-2">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-accent-green" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
                <form action="/api/stripe/checkout" method="post">
                  <input type="hidden" name="plan_id" value={planId} />
                  <input type="hidden" name="billing_period" value="monthly" data-pricing-billing-period />
                  <Button type="submit" variant="accent" className="w-full">
                    Start free trial
                  </Button>
                </form>
              </CardContent>
            </Card>
          );
        })}
      </section>
      <p className="mx-auto max-w-4xl px-4 pb-16 text-center text-sm text-muted-foreground md:px-6">
        Every plan includes the 14-day free trial. Change or cancel anytime.
      </p>
    </>
  );
}
