import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export type ActivationChecklistStep = {
  label: string;
  description: string;
  complete: boolean;
  href?: string;
  actionLabel?: string;
};

export function ActivationChecklist({ steps }: { steps: ActivationChecklistStep[] }) {
  const remaining = steps.filter((step) => !step.complete).length;
  if (remaining === 0) {
    return (
      <Card className="border-[1.5px] border-accent-green/35 bg-tint-mint shadow-ink-sm">
        <CardContent className="flex items-center gap-3 p-5">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent-green/15 text-sm font-bold text-accent-green" aria-hidden="true">✓</span>
          <p className="text-sm font-semibold text-primary">You&apos;re all set — Ornigami is working in the background.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-[1.5px] border-border bg-tint-mint shadow-ink-sm">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle>A few steps to get set up</CardTitle>
            <CardDescription className="mt-2">
              Connect your Google profile, set your tone, and let the quiet work begin.
            </CardDescription>
          </div>
          <Badge variant="secondary">{remaining} left</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <ol className="space-y-3">
          {steps.map((step) => (
            <li key={step.label} className="flex items-start justify-between gap-4 rounded-xl border-[1.5px] border-border bg-card/70 p-4">
              <div className="flex min-w-0 gap-3">
                <span
                  aria-hidden="true"
                  className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                    step.complete ? "bg-accent-green/10 text-accent-green" : "bg-surface text-muted-foreground"
                  }`}
                >
                  {step.complete ? "✓" : ""}
                </span>
                <div>
                  <p className={`text-sm font-medium ${step.complete ? "text-muted-foreground line-through" : ""}`}>
                    {step.label}
                  </p>
              <p className="mt-1 text-sm text-muted-foreground">{step.description}</p>
                </div>
              </div>
              {!step.complete && step.href && step.actionLabel ? (
                <Button asChild size="sm" variant="outline" className="shrink-0">
                  <Link href={step.href}>{step.actionLabel}</Link>
                </Button>
              ) : null}
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
