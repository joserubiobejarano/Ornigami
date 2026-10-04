"use client";

import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import { captureBoundaryError } from "@/lib/error-visibility";

export default function ReviewBoosterError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    void captureBoundaryError(error, "route");
  }, [error]);

  return (
    <section className="mx-auto w-full max-w-3xl space-y-4 rounded-2xl border-[1.5px] border-destructive/35 bg-card p-6 shadow-ink-sm" role="alert">
      <h1 className="text-xl font-bold text-primary">Review Booster could not load</h1>
      <p className="text-sm text-muted-foreground">Your visits and totals couldn&apos;t load. Please try again.</p>
      <Button type="button" onClick={retry}>Retry dashboard</Button>
    </section>
  );
}
