"use client";

import Link from "next/link";
import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="flex min-h-[70vh] items-center justify-center px-6 py-20">
      <div className="max-w-md text-center">
        <BrandMark className="mx-auto h-12 w-12 text-accent-purple" />
        <h1 className="mt-6 text-3xl font-semibold">Something went wrong</h1>
        <p className="mt-3 text-muted-foreground">Try again, or return to your workspace.</p>
        <div className="mt-7 flex justify-center gap-3"><Button type="button" onClick={reset}>Try again</Button><Button variant="secondary" asChild><Link href="/dashboard">Dashboard</Link></Button></div>
      </div>
    </main>
  );
}
