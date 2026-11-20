"use client";

import { useState } from "react";

import { clearBuilderDraftStorage } from "@/lib/builder/draft-storage";

function clearBuilderDrafts() {
  try {
    clearBuilderDraftStorage(window.sessionStorage);
  } catch {
    // A blocked storage area is already private-by-default.
  }
}

export function BuilderLogoutButton() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signOut() {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/builder/session/logout", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
      });
      if (!response.ok) {
        setError(
          "Sign out could not be confirmed. Your session is still active. Try again.",
        );
        return;
      }

      // Stop the intake persistence effect before clearing and navigating.
      window.dispatchEvent(new Event("ornigami-builder-signout"));
      clearBuilderDrafts();
      window.addEventListener("pagehide", clearBuilderDrafts, { once: true });

      if ("BroadcastChannel" in window) {
        const channel = new BroadcastChannel("ornigami-builder-session");
        channel.postMessage({ type: "session-ended" });
        channel.close();
      }

      // Clear the authenticated root layout and any cached workspace state.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign("/");
    } catch {
      setError(
        "Sign out could not be confirmed. Check the connection and try again.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <span className="flex flex-col items-end gap-1">
      <button
        type="button"
        data-builder-logout
        disabled={pending}
        className="min-h-9 rounded-full border border-[#c9bda8] px-3 py-1 text-xs font-semibold text-[#4f4a3f] hover:bg-[#efe7d8] disabled:opacity-60"
        onClick={() => void signOut()}
      >
        {pending ? "Signing out…" : "Sign out"}
      </button>
      {error ? (
        <span
          role="alert"
          data-builder-logout-error
          className="max-w-64 text-right text-[0.68rem] font-medium leading-4 text-[#a2382a]"
        >
          {error}
        </span>
      ) : null}
    </span>
  );
}
