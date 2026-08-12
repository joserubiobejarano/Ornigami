"use client";

import { useState } from "react";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { toast } from "sonner";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { BrandMark } from "@/components/brand-mark";

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setIsSubmitting(true);

    try {
      const reg = await fetch("/api/auth/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password, fullName }) });

      const data = await reg.json().catch(() => ({}));
      if (!reg.ok) {
        const message = data.error || "Could not create account";
        setError(message);
        toast.error(message);
        return;
      }

      toast.success("Account created. Check your inbox to verify your email before signing in.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function signInWithGoogle() {
    await signIn("google", { callbackUrl: "/dashboard" });
  }

  return (
    <div className="min-h-dvh flex items-center justify-center bg-muted/30 p-6">
      <form onSubmit={onSubmit} className="w-full max-w-sm space-y-5 rounded-2xl border border-border bg-card p-6 shadow-sm">
        <Link href="/" className="inline-flex items-center gap-2 text-sm font-semibold"><BrandMark className="h-7 w-7 text-violet-700" /> Ornigami</Link>
        <h1 className="text-2xl font-semibold">Create account</h1>
        <Button
          type="button"
          variant="secondary"
          onClick={signInWithGoogle}
          className="w-full"
        >
          Continue with Google
        </Button>
        <div className="space-y-2"><Label htmlFor="signup-name">Full name</Label><Input id="signup-name" autoComplete="name" value={fullName} onChange={(e) => setFullName(e.target.value)} required /></div>
        <div className="space-y-2"><Label htmlFor="signup-email">Email</Label><Input id="signup-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
        <div className="space-y-2"><Label htmlFor="signup-password">Password</Label><Input id="signup-password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required /><p className="text-xs text-muted-foreground">Use at least 8 characters.</p></div>
        <div className="space-y-2"><Label htmlFor="signup-confirm-password">Confirm password</Label><Input id="signup-confirm-password" type="password" autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} minLength={8} required /></div>
        {error ? <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p> : null}
        <p className="text-xs text-muted-foreground">By creating an account, you agree to our <Link className="underline" href="/terms">Terms</Link> and <Link className="underline" href="/privacy">Privacy Policy</Link>.</p>
        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? "Creating account…" : "Sign up"}
        </Button>
        <p className="text-sm text-muted-foreground">
          Have an account?{" "}
          <Link className="underline" href="/login">
            Log in
          </Link>
        </p>
      </form>
    </div>
  );
}
