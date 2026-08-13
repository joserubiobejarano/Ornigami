"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function FreeAuditForm() {
  const [businessQuery, setBusinessQuery] = useState("");
  const [city, setCity] = useState("");
  const [category, setCategory] = useState("");
  const [email, setEmail] = useState("");
  const [result, setResult] = useState<{ auditText: string; score: number | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const response = await fetch("/api/audit/free-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessQuery, city, category, email }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) {
        throw new Error(data.error || "We couldn't check that profile just now. Try again in a moment.");
      }
      setResult({ auditText: data.auditText, score: data.score });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "We couldn't check that profile just now. Try again in a moment.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <form onSubmit={submit} className="space-y-5 rounded-2xl border-[1.5px] border-border bg-card p-7 shadow-ink-sm">
        <div>
          <h2 className="text-xl font-bold text-primary">Find your business</h2>
          <p className="mt-2 text-sm text-muted-foreground">We&apos;ll use this to create an example profile check.</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="audit-business">Business name or Google profile</Label>
          <Input id="audit-business" value={businessQuery} onChange={(event) => setBusinessQuery(event.target.value)} required placeholder="Example: Northside Coffee" />
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="audit-city">City</Label>
            <Input id="audit-city" value={city} onChange={(event) => setCity(event.target.value)} placeholder="Madrid" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="audit-category">Category</Label>
            <Input id="audit-category" value={category} onChange={(event) => setCategory(event.target.value)} placeholder="Cafe" />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="audit-email">Email</Label>
          <Input id="audit-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required placeholder="you@example.com" />
        </div>
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        <Button type="submit" variant="accent" disabled={loading}>{loading ? "Checking..." : "Check my profile"}</Button>
      </form>
      {result ? (
        <section className="mt-10">
          <div className="rounded-2xl border-[1.5px] border-border bg-tint-mint p-7 shadow-ink-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">Result</p>
                <h2 className="mt-2 text-2xl font-bold text-primary">Here&apos;s what we found.</h2>
              </div>
              {result.score !== null ? <span className="rounded-full bg-card px-3 py-1.5 font-mono text-sm font-bold text-primary">Example · {result.score}/100</span> : null}
            </div>
            <pre className="mt-6 whitespace-pre-wrap font-sans text-sm leading-relaxed text-muted-foreground">{result.auditText}</pre>
            <Button className="mt-7" variant="accent" asChild>
              <Link href="/signup">Fix these with Ornigami <ArrowRight className="h-4 w-4" /></Link>
            </Button>
          </div>
        </section>
      ) : null}
    </>
  );
}
