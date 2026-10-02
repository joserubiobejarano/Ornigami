"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { initialLoginActionState } from "@/app/login/action-state";
import { loginAction } from "@/app/login/actions";

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
    >
      {pending ? "Signing in..." : "Sign in"}
    </button>
  );
}

export function LoginForm() {
  const [state, formAction] = useActionState(loginAction, initialLoginActionState);

  return (
    <form action={formAction} className="mt-5 grid gap-4">
      <label className="grid gap-1 text-sm">
        <span className="font-medium text-slate-700">Email</span>
        <input
          name="email"
          type="email"
          required
          className="rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
        />
      </label>

      <label className="grid gap-1 text-sm">
        <span className="font-medium text-slate-700">Password</span>
        <input
          name="password"
          type="password"
          required
          className="rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
        />
      </label>

      <SubmitButton />

      {state.status === "error" && state.message ? (
        <p className="text-sm text-red-700">{state.message}</p>
      ) : null}
    </form>
  );
}
