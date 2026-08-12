"use client";

import Link from "next/link";
import { useState } from "react";

import { BillingPeriodToggle } from "@/components/billing/billing-period-toggle";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PLANS, PLAN_ORDER, effectiveMonthlyFromAnnual, formatAnnualSavings, formatPrice } from "@/lib/billing/plans";

const faqs = [
  ["What happens after the trial?", "Your plan continues automatically after 14 days. Cancel anytime from billing."],
  ["Can I use just one agent?", "Yes. Review Replies or Review Booster is €39/month, and you can upgrade to Complete from billing at any time."],
  ["Do I need a website?", "No. You only need a Google Business Profile for Review Replies."],
  ["Will you post anything without my approval?", "Only 4-5 star replies can be configured for automatic posting. 1-3 star reviews always require your approval."],
  ["Can I cancel anytime?", "Yes. Manage or cancel your subscription from the billing portal."],
  ["Do you support Spanish?", "Yes. Replies match the reviewer's language."],
];

export default function PricingPage() {
  const [billingPeriod, setBillingPeriod] = useState<"monthly" | "annual">("monthly");

  return (
    <main className="min-h-screen bg-white">
      <section className="mx-auto max-w-6xl px-6 pb-16 pt-24 text-center">
        <p className="mb-4 text-sm font-semibold uppercase tracking-[0.2em] text-violet-700">Simple pricing</p>
        <h1 className="text-4xl font-bold tracking-tight text-slate-900 md:text-6xl">Make local growth easier to run.</h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">Two tools that work while you run the business. 14-day free trial, cancel anytime.</p>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-5 text-center">
        <BillingPeriodToggle value={billingPeriod} onChange={setBillingPeriod} id="pricing-billing-period-toggle" />
        <p className="mt-3 text-sm text-muted-foreground">Annual plans are billed once per year.</p>
      </section>

      <section className="mx-auto grid max-w-6xl gap-5 px-6 pb-12 md:grid-cols-3">
        {PLAN_ORDER.map((planId) => {
          const plan = PLANS[planId];
          return (
            <Card key={planId} className={`rounded-2xl border-slate-200 bg-white shadow-sm ${plan.recommended ? "border-violet-400 shadow-lg shadow-violet-100" : ""}`}>
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <CardTitle>{plan.name}</CardTitle>
                  {plan.recommended ? <span className="rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground">Most popular</span> : null}
                </div>
                <CardDescription>{plan.tagline}</CardDescription>
                <div className="pt-4"><span className="text-4xl font-semibold">{formatPrice(planId, billingPeriod)}</span><span className="text-muted-foreground"> / {billingPeriod === "annual" ? "year" : "month"}</span></div>
                <p className="text-sm text-muted-foreground">{billingPeriod === "annual" ? `${formatAnnualSavings(planId)} · ${effectiveMonthlyFromAnnual(planId)}/month effective` : `or ${effectiveMonthlyFromAnnual(planId)}/month billed annually`}</p>
              </CardHeader>
              <CardContent className="space-y-5">
                <ul className="space-y-3 text-sm">{plan.features.map((feature) => <li key={feature} className="flex gap-2"><span className="text-primary">✓</span><span>{feature}</span></li>)}</ul>
                <form action="/api/stripe/checkout" method="post"><input type="hidden" name="plan_id" value={planId} /><input type="hidden" name="billing_period" value={billingPeriod} /><Button type="submit" className="w-full">Start free trial</Button></form>
              </CardContent>
            </Card>
          );
        })}
      </section>

      <p className="mx-auto max-w-4xl px-6 pb-20 text-center text-sm text-muted-foreground">All plans are per location. Running more than one location? <Link className="underline" href="/contact">Get in touch</Link> and we&apos;ll set you up.</p>

      <section className="bg-muted/40 px-6 py-16"><div className="mx-auto max-w-3xl"><h2 className="text-3xl font-semibold">Frequently asked questions</h2><div className="mt-8 space-y-6">{faqs.map(([question, answer]) => <div key={question}><h3 className="font-medium">{question}</h3><p className="mt-2 text-sm text-muted-foreground">{answer}</p></div>)}</div></div></section>

      <section className="mx-auto flex max-w-4xl flex-col items-center gap-4 px-6 py-20 text-center"><h2 className="text-3xl font-semibold">Ready to make reviews easier?</h2><p className="text-muted-foreground">Start with a 14-day trial and see the workflow on your own business.</p><div className="flex flex-wrap justify-center gap-3"><Link href="/signup"><Button>Start free trial</Button></Link><Link href="/demo"><Button variant="outline">See a live demo</Button></Link></div></section>
    </main>
  );
}
