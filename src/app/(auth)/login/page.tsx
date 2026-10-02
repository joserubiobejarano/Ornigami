"use client";

import Image from "next/image";
import Link from "next/link";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { authPageHref, getAuthReturnPath } from "@/lib/auth-return-path";
import { isValidAuthPassword } from "@/lib/auth-password-policy";

function LoginForm() {
  const searchParams = useSearchParams();
  const callbackUrl = getAuthReturnPath(searchParams);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const verificationState = searchParams.get("verified");
  const verificationExpired = verificationState === "0";
  const verificationSucceeded = verificationState === "1";

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!email.trim() || email.length > 254) { setError("Enter a valid email address."); return; }
    if (!isValidAuthPassword(password)) { setError("Enter a valid password."); return; }
    setIsSubmitting(true);
    try {
      const response = await signIn("credentials", { email: email.trim(), password, callbackUrl, redirect: false });
      if (!response?.ok) { setError("That email or password doesn't match. Try again or reset your password."); return; }
      window.location.assign(callbackUrl);
    } catch {
      setError("We couldn't sign you in just now. Try again in a moment.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function signInWithGoogle() {
    setError(null);
    setGoogleLoading(true);
    try {
      await signIn("google", { callbackUrl });
    } catch {
      setError("Google sign-in couldn't start. Try again or use your email and password.");
    } finally {
      setGoogleLoading(false);
    }
  }

  return <main className="flex min-h-dvh items-center justify-center bg-surface/55 p-6"><form onSubmit={onSubmit} className="w-full max-w-md space-y-5 rounded-3xl border-[1.5px] border-border bg-card p-8 shadow-ink-md" aria-busy={isSubmitting || googleLoading}>
    <Link href="/" className="inline-flex"><Image src="/logo-ink.svg" alt="Ornigami" width={180} height={72} className="h-10 w-[150px] object-contain object-left dark:hidden" /><Image src="/logo-paper.svg" alt="Ornigami" width={180} height={72} className="hidden h-10 w-[150px] object-contain object-left dark:block" /></Link>
    <div><span className="inline-flex rounded-full border border-border bg-tint-navy px-3 py-1 text-[0.7rem] font-bold uppercase tracking-[0.12em] text-primary">Welcome back</span><h1 className="mt-4 text-3xl font-extrabold text-primary">Welcome back.</h1></div>
    {verificationSucceeded && <p role="status" className="rounded-xl border border-border bg-surface px-3 py-3 text-sm text-muted-foreground">Your email is verified. You can sign in now.</p>}
    {verificationExpired && <div role="status" className="rounded-xl border border-border bg-surface px-3 py-3 text-sm text-muted-foreground">That verification link is invalid or has expired. <Link className="font-semibold text-primary underline" href={authPageHref("/resend-verification", callbackUrl)}>Request a new link</Link>.</div>}
    <Button type="button" variant="secondary" onClick={signInWithGoogle} disabled={isSubmitting || googleLoading} className="w-full">{googleLoading ? "Connecting to Google…" : "Continue with Google"}</Button>
    <div className="flex items-center gap-3 text-xs text-muted-foreground"><span className="h-px flex-1 bg-border" />or<span className="h-px flex-1 bg-border" /></div>
    <div className="space-y-2"><Label htmlFor="login-email">Email</Label><Input id="login-email" type="email" autoComplete="email" maxLength={254} required value={email} onChange={e => setEmail(e.target.value)} /></div>
    <div className="space-y-2"><Label htmlFor="login-password">Password</Label><Input id="login-password" type="password" autoComplete="current-password" maxLength={72} required value={password} onChange={e => setPassword(e.target.value)} /></div>
    {error && <p role="alert" aria-live="polite" className="rounded-xl border-[1.5px] border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
    <Button type="submit" className="w-full" disabled={isSubmitting || googleLoading}>{isSubmitting ? "Logging in…" : "Log in"}</Button>
    <p className="text-right text-sm"><Link className="text-primary underline underline-offset-4" href={authPageHref("/forgot-password", callbackUrl)}>Forgot password?</Link></p>
    <p className="text-right text-sm"><Link className="text-primary underline underline-offset-4" href={authPageHref("/resend-verification", callbackUrl)}>Didn’t get a verification email? Send another</Link></p>
    <p className="text-sm text-muted-foreground">New here? <Link className="font-semibold text-primary underline underline-offset-4" href={authPageHref("/signup", callbackUrl)}>Start free trial</Link></p>
  </form></main>;
}

export default function LoginPage() {
  return <Suspense fallback={<main className="flex min-h-dvh items-center justify-center p-6"><p role="status" className="text-muted-foreground">Loading sign-in…</p></main>}><LoginForm /></Suspense>;
}
