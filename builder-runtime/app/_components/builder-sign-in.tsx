"use client";

import { useState } from "react";

const ERROR_MESSAGES: Record<string, string> = {
  invite: "This invitation cannot be used. Ask the operator for a current one.",
  session: "Your builder session ended. Enter a current invitation to continue.",
  unavailable: "Builder access is temporarily unavailable. Try again later.",
  rate_limited:
    "Too many invitation attempts. Wait a minute, then try again.",
  request_too_large: "The invitation request was too large. Paste only the token.",
  unsupported_media_type:
    "The invitation form could not be read. Reload the page and try again.",
};

export function BuilderSignIn({ error }: { error?: string }) {
  const [message, setMessage] = useState(
    error ? ERROR_MESSAGES[error] ?? null : null,
  );
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const token = new FormData(form).get("token");
    if (typeof token !== "string" || !token.trim()) {
      setMessage(ERROR_MESSAGES.invite);
      return;
    }
    setPending(true);
    setMessage(null);
    try {
      const response = await fetch("/api/builder/session/redeem", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ token }),
      });
      if (response.ok) {
        // Session transitions need a fresh server layout, not a cached root
        // layout from the anonymous page.
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.assign("/builder");
        return;
      }
      const payload = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;
      setMessage(
        ERROR_MESSAGES[payload?.error ?? ""] ?? ERROR_MESSAGES.invite,
      );
    } catch {
      setMessage(ERROR_MESSAGES.unavailable);
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-[60vh] w-full max-w-2xl flex-col justify-center px-4 py-12 sm:px-6">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#5f5a4f]">
        Private beta
      </p>
      <h1 className="mt-3 font-display text-3xl font-bold tracking-tight">
        Enter the builder
      </h1>
      <p className="mt-3 text-sm leading-6 text-[#5f5a4f]">
        Access is by a single-use invitation issued by the operator. A legacy
        Ornigami account, plan or password does not grant builder access.
      </p>
      <form
        onSubmit={submit}
        className="mt-6 space-y-3 rounded-[1.25rem] border border-[#ddd3c2] bg-[#fffdf8] p-5"
      >
        <label
          htmlFor="builder-invite-token"
          className="block text-sm font-semibold"
        >
          Invitation token
        </label>
        <input
          id="builder-invite-token"
          name="token"
          type="password"
          autoComplete="one-time-code"
          spellCheck={false}
          required
          data-invite-token
          className="min-h-11 w-full rounded-lg border border-[#c9bda8] bg-white px-3 font-mono text-sm"
          placeholder="Paste the one-time invitation token"
        />
        {message ? (
          <p
            role="alert"
            data-invite-error
            className="text-sm font-medium text-[#a2382a]"
          >
            {message}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={pending}
          className="min-h-11 w-full rounded-full bg-[#234a6b] px-5 text-sm font-semibold text-white disabled:opacity-60"
        >
          {pending ? "Checking invitation…" : "Enter builder"}
        </button>
      </form>
      <p className="mt-4 text-xs leading-5 text-[#6d6a5f]">
        Sessions expire automatically. Sign out when you finish, especially on a
        shared device. Invitations cannot be reused.
      </p>
    </main>
  );
}
