"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { authPageHref, getAuthReturnPath } from "@/lib/auth-return-path";

function ResendForm() {
  const params = useSearchParams();
  const callbackUrl = getAuthReturnPath(params);
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(null); setMessage(null);
    if (!email.trim() || email.length > 254) { setError("Enter a valid email address."); return; }
    setBusy(true);
    try {
      const response = await fetch("/api/auth/resend-verification", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: email.trim(), callbackUrl }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) { setError(data.message || data.error || "We couldn't process that request. Try again shortly."); return; }
      setMessage(data.message || "If the address belongs to an account that needs verification, we'll send a fresh link.");
    } catch { setError("We couldn't send the request just now. Check your connection and try again."); }
    finally { setBusy(false); }
  }
  return <main className="flex min-h-dvh items-center justify-center bg-surface/55 p-6"><form onSubmit={submit} className="w-full max-w-md space-y-5 rounded-3xl border-[1.5px] border-border bg-card p-8 shadow-ink-md" aria-busy={busy}>
    <Link href="/" className="text-sm font-semibold text-primary underline">Ornigami</Link>
    <div><span className="inline-flex rounded-full border border-border bg-tint-butter px-3 py-1 text-[0.7rem] font-bold uppercase tracking-[0.12em] text-primary">Email verification</span><h1 className="mt-4 text-3xl font-extrabold text-primary">Send a fresh link</h1><p className="mt-2 text-sm text-muted-foreground">Enter your email and we’ll send a new verification link if one is needed.</p></div>
    <div className="space-y-2"><Label htmlFor="resend-email">Email</Label><Input id="resend-email" type="email" autoComplete="email" maxLength={254} required value={email} onChange={e => setEmail(e.target.value)} /></div>
    {error && <p role="alert" aria-live="polite" className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
    {message && <p role="status" aria-live="polite" className="rounded-xl border border-border bg-surface px-3 py-3 text-sm text-muted-foreground">{message}</p>}
    <Button type="submit" className="w-full" disabled={busy}>{busy ? "Sending…" : "Send verification email"}</Button>
    <p className="text-sm text-muted-foreground"><Link className="font-semibold text-primary underline" href={authPageHref("/login", callbackUrl)}>Back to login</Link> · <Link className="text-primary underline" href={authPageHref("/signup", callbackUrl)}>Create account</Link></p>
  </form></main>;
}
export default function ResendVerificationPage() { return <Suspense fallback={<main className="flex min-h-dvh items-center justify-center p-6"><p role="status">Loading…</p></main>}><ResendForm /></Suspense>; }
