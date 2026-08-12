"use client";

import Link from "next/link";
import { BrandMark } from "@/components/brand-mark";

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="flex min-h-[70vh] items-center justify-center px-6 py-20">
      <div className="max-w-md text-center">
        <BrandMark className="mx-auto h-12 w-12 text-violet-700" />
        <h1 className="mt-6 text-3xl font-semibold">Something went wrong</h1>
        <p className="mt-3 text-muted-foreground">Try again, or return to your workspace.</p>
        <div className="mt-7 flex justify-center gap-3"><button type="button" onClick={reset} className="rounded-full bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90">Try again</button><Link href="/dashboard" className="rounded-full border border-border px-5 py-3 text-sm font-semibold hover:bg-muted">Dashboard</Link></div>
      </div>
    </main>
  );
}
