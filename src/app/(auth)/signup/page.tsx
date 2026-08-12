"use client";

import { useState } from "react";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { toast } from "sonner";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();

    const reg = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, fullName }),
    });

    const data = await reg.json().catch(() => ({}));
    if (!reg.ok) {
      toast.error(data.error || "Could not create account");
      return;
    }

    toast.success("Account created. Check your inbox to verify your email before signing in.");
  }

  async function signInWithGoogle() {
    await signIn("google", { callbackUrl: "/dashboard" });
  }

  return (
    <div className="min-h-dvh flex items-center justify-center p-6">
      <form onSubmit={onSubmit} className="w-full max-w-sm space-y-3">
        <h1 className="text-2xl font-semibold">Create account</h1>
        <Button
          type="button"
          variant="secondary"
          onClick={signInWithGoogle}
          className="w-full"
        >
          Continue with Google
        </Button>
        <Input
          placeholder="Full name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          required
        />
        <Input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <Input
          type="password"
          placeholder="Password (min 8 characters)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={8}
          required
        />
        <Button type="submit" className="w-full">
          Sign up
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
