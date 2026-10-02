"use client";

import Image from "next/image";
import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { getAuthReturnPath, authPageHref } from "@/lib/auth-return-path";
import { isValidAuthPassword } from "@/lib/auth-password-policy";

function SignupForm() {
  const searchParams = useSearchParams();
  const callbackUrl = getAuthReturnPath(searchParams);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(null); setSuccess(null);
    if (!fullName.trim() || fullName.trim().length > 200) { setError("Enter your name (up to 200 characters)."); return; }
    if (!email.trim() || email.length > 254) { setError("Enter a valid email address."); return; }
    if (!isValidAuthPassword(password)) { setError("Use a password with at least 8 characters and no more than 72 UTF-8 bytes."); return; }
    if (password !== confirmPassword) { setError("Passwords do not match."); return; }
    setIsSubmitting(true);
    try {
      const response = await fetch("/api/auth/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: email.trim(), password, fullName: fullName.trim(), callbackUrl }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) { setError(data.message || data.error || "We couldn't create the account. Check the details or try again shortly."); return; }
      setSuccess(data.message || "If the address can be registered, we sent a verification email. Follow its link to finish setup.");
    } catch {
      setError("We couldn't create the account just now. Check your connection and try again.");
    } finally { setIsSubmitting(false); }
  }

  async function signInWithGoogle() {
    setError(null); setGoogleLoading(true);
    try { await signIn("google", { callbackUrl }); }
    catch { setError("Google sign-in couldn't start. Try again in a moment."); }
    finally { setGoogleLoading(false); }
  }

  return <main className="flex min-h-dvh items-center justify-center bg-surface/55 p-6"><form onSubmit={onSubmit} className="w-full max-w-md space-y-5 rounded-3xl border-[1.5px] border-border bg-card p-8 shadow-ink-md" aria-busy={isSubmitting || googleLoading}>
    <Link href="/" className="inline-flex"><Image src="/logo-ink.svg" alt="Ornigami" width={180} height={72} className="h-10 w-[150px] object-contain object-left dark:hidden" /><Image src="/logo-paper.svg" alt="Ornigami" width={180} height={72} className="hidden h-10 w-[150px] object-contain object-left dark:block" /></Link>
    <div><span className="inline-flex rounded-full border border-border bg-tint-butter px-3 py-1 text-[0.7rem] font-bold uppercase tracking-[0.12em] text-primary">Start your free trial</span><h1 className="mt-4 text-3xl font-extrabold text-primary">Start your free trial.</h1><p className="mt-2 text-sm text-muted-foreground">14 days free. No card required.</p></div>
    <Button type="button" variant="secondary" onClick={signInWithGoogle} disabled={isSubmitting || googleLoading} className="w-full">{googleLoading ? "Connecting to Google…" : "Continue with Google"}</Button>
    <div className="flex items-center gap-3 text-xs text-muted-foreground"><span className="h-px flex-1 bg-border" />or<span className="h-px flex-1 bg-border" /></div>
    <div className="space-y-2"><Label htmlFor="signup-name">Your name</Label><Input id="signup-name" autoComplete="name" maxLength={200} required value={fullName} onChange={e => setFullName(e.target.value)} /></div>
    <div className="space-y-2"><Label htmlFor="signup-email">Email</Label><Input id="signup-email" type="email" autoComplete="email" maxLength={254} required value={email} onChange={e => setEmail(e.target.value)} /></div>
    <div className="space-y-2"><Label htmlFor="signup-password">Password</Label><Input id="signup-password" type="password" autoComplete="new-password" maxLength={72} minLength={8} required value={password} onChange={e => setPassword(e.target.value)} /><p className="text-xs text-muted-foreground">At least 8 characters and at most 72 UTF-8 bytes.</p></div>
    <div className="space-y-2"><Label htmlFor="signup-confirm-password">Confirm password</Label><Input id="signup-confirm-password" type="password" autoComplete="new-password" maxLength={72} minLength={8} required value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} /></div>
    {error && <p role="alert" aria-live="polite" className="rounded-xl border-[1.5px] border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
    {success && <div role="status" aria-live="polite" className="space-y-2 rounded-xl border border-border bg-surface px-3 py-3 text-sm text-muted-foreground"><p>{success}</p><p><Link className="font-semibold text-primary underline" href={authPageHref("/resend-verification", callbackUrl)}>Resend verification email</Link></p></div>}
    <p className="text-xs text-muted-foreground">By creating an account, you agree to our <Link className="underline" href="/terms">Terms</Link> and <Link className="underline" href="/privacy">Privacy Policy</Link>.</p>
    <Button type="submit" variant="accent" className="w-full" disabled={isSubmitting || googleLoading}>{isSubmitting ? "Creating account…" : "Create account"}</Button>
    <p className="text-sm text-muted-foreground">Already have an account? <Link className="font-semibold text-primary underline underline-offset-4" href={authPageHref("/login", callbackUrl)}>Log in</Link></p>
  </form></main>;
}

export default function SignupPage() { return <Suspense fallback={<main className="flex min-h-dvh items-center justify-center p-6"><p role="status" className="text-muted-foreground">Loading signup…</p></main>}><SignupForm /></Suspense>; }
