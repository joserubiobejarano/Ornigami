"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { authPageHref, getAuthReturnPath, sanitizeAuthReturnPath } from "@/lib/auth-return-path";
import { isValidAuthPassword } from "@/lib/auth-password-policy";

function ResetPasswordForm() {
  const params = useSearchParams();
  const rawToken = params.get("token") || "";
  const token = /^[A-Za-z0-9_-]{43}$/.test(rawToken) ? rawToken : "";
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [callbackUrl, setCallbackUrl] = useState(() => getAuthReturnPath(params));
  const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(null); setSuccess(null);
    if (!token) { setError("This reset link is missing or invalid. Request a new one."); return; }
    if (!isValidAuthPassword(password)) { setError("Use a password with at least 8 characters and no more than 72 UTF-8 bytes."); return; }
    if (password !== confirmPassword) { setError("Passwords do not match."); return; }
    setBusy(true);
    try {
      const response = await fetch("/api/auth/reset-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, password }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (typeof data.callbackUrl === "string") setCallbackUrl(sanitizeAuthReturnPath(data.callbackUrl));
        setError(data.message || data.error || "This reset link is invalid or has expired. Request a new one.");
        return;
      }
      const nextCallback = sanitizeAuthReturnPath(data.callbackUrl);
      setCallbackUrl(nextCallback);
      setPassword("");
      setConfirmPassword("");
      setSuccess(data.message || "Your password has been reset. You can now sign in.");
      window.history.replaceState(null, "", authPageHref("/reset-password", nextCallback));
    } catch { setError("We couldn't reset the password just now. Try again in a moment."); }
    finally { setBusy(false); }
  }
  return <main className="flex min-h-dvh items-center justify-center bg-surface/55 p-6"><form onSubmit={submit} className="w-full max-w-md space-y-5 rounded-3xl border-[1.5px] border-border bg-card p-8 shadow-ink-md" aria-busy={busy}>
    <Link href="/" className="text-sm font-semibold text-primary underline">Ornigami</Link>
    <div><span className="inline-flex rounded-full border border-border bg-tint-butter px-3 py-1 text-[0.7rem] font-bold uppercase tracking-[0.12em] text-primary">Account recovery</span><h1 className="mt-4 text-3xl font-extrabold text-primary">Choose a new password</h1><p className="mt-2 text-sm text-muted-foreground">Use at least 8 characters and no more than 72 UTF-8 bytes.</p></div>
    {!token && !success && <p role="status" className="rounded-xl border border-border bg-surface px-3 py-3 text-sm text-muted-foreground">This reset link is missing or expired. <Link className="font-semibold text-primary underline" href={authPageHref("/forgot-password", callbackUrl)}>Request another reset link</Link>.</p>}
    {token && !success && <><div className="space-y-2"><Label htmlFor="reset-password">New password</Label><Input id="reset-password" type="password" autoComplete="new-password" minLength={8} maxLength={72} required value={password} onChange={e => setPassword(e.target.value)} /></div><div className="space-y-2"><Label htmlFor="reset-confirm-password">Confirm new password</Label><Input id="reset-confirm-password" type="password" autoComplete="new-password" minLength={8} maxLength={72} required value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} /></div></>}
    {error && <p role="alert" aria-live="polite" className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error} {token && <Link className="font-semibold underline" href={authPageHref("/forgot-password", callbackUrl)}>Request a fresh link</Link>}</p>}
    {success && <p role="status" aria-live="polite" className="rounded-xl border border-border bg-surface px-3 py-3 text-sm text-muted-foreground">{success}</p>}
    {token && !success && <Button type="submit" className="w-full" disabled={busy}>{busy ? "Updating password…" : "Reset password"}</Button>}
    <p className="text-sm text-muted-foreground"><Link className="font-semibold text-primary underline" href={authPageHref("/login", callbackUrl)}>Go to login</Link></p>
  </form></main>;
}
export default function ResetPasswordPage() { return <Suspense fallback={<main className="flex min-h-dvh items-center justify-center p-6"><p role="status">Loading…</p></main>}><ResetPasswordForm /></Suspense>; }
