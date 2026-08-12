"use client";

import { useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { toast } from "sonner";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { BrandMark } from "@/components/brand-mark";
import { safeRelativeRedirect } from "@/lib/safe-redirect";

function LoginForm() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const callbackParam = searchParams?.get("callbackUrl") ?? undefined;
  const afterLoginUrl = safeRelativeRedirect(callbackParam, "/dashboard");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const res = await signIn("credentials", { email, password, redirect: false });

      if (res?.error) {
        const message = res.error || "Could not sign in";
        setError(message);
        toast.error(message);
        return;
      }

      window.location.href = afterLoginUrl;
    } catch {
      const message = "Could not sign in. Check your details and try again.";
      setError(message);
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function signInWithGoogle() {
    await signIn("google", {
      callbackUrl: afterLoginUrl,
    });
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-surface/70 p-6">
      <form onSubmit={onSubmit} className="w-full max-w-sm space-y-5 rounded-2xl border border-border bg-card p-7 shadow-md">
        <Link href="/" className="inline-flex items-center gap-2 text-sm font-semibold text-primary"><BrandMark className="h-7 w-7 text-accent-purple" /> Ornigami</Link>
        <h1 className="text-2xl font-semibold">Log in</h1>
        <Button
          type="button"
          variant="secondary"
          onClick={signInWithGoogle}
          className="w-full"
        >
          Continue with Google
        </Button>
        <div className="space-y-2"><Label htmlFor="login-email">Email</Label><Input id="login-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
        <div className="space-y-2"><Label htmlFor="login-password">Password</Label><Input id="login-password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></div>
        {error ? <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p> : null}
        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? "Signing in…" : "Log in"}
        </Button>
        <p className="text-right text-sm"><Link className="text-primary underline underline-offset-4" href="/contact?subject=password-reset">Forgot password?</Link></p>
        <p className="text-sm text-muted-foreground">
          No account?{" "}
          <Link className="underline" href="/signup">
            Sign up
          </Link>
        </p>
      </form>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-dvh flex items-center justify-center p-6">
        <div className="w-full max-w-sm space-y-3">
          <h1 className="text-2xl font-semibold">Log in</h1>
          <div className="text-muted-foreground">Loading...</div>
        </div>
      </div>
    }>
      <LoginForm />
    </Suspense>
  );
}
