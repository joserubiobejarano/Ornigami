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
  if (remaining === 0) return null;

  return (
    <Card className="border-slate-200 shadow-sm">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle>Complete your first setup</CardTitle>
            <CardDescription className="mt-2">
              Finish these steps to start getting value from your active agent.
            </CardDescription>
          </div>
          <Badge variant="secondary">{remaining} left</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <ol className="space-y-3">
          {steps.map((step) => (
            <li key={step.label} className="flex items-start justify-between gap-4 rounded-lg border p-4">
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
