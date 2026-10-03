"use client";

import { Button } from "@/components/ui/button";

export default function ReviewBoosterError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <section className="mx-auto w-full max-w-3xl space-y-4 rounded-2xl border border-destructive/35 bg-card p-6" role="alert">
      <h1 className="text-xl font-semibold text-card-foreground">Review Booster could not load</h1>
      <p className="text-sm text-muted-foreground">Your visit statuses and dashboard totals could not be loaded. Try loading the dashboard again.</p>
      <Button type="button" onClick={retry}>Retry dashboard</Button>
    </section>
  );
}
