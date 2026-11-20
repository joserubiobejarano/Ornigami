"use client";

import { useState } from "react";

const BUILDER_STORAGE_PREFIX = "ornigami.builder.offer-intake.brief.v1";

export function BuilderLogoutButton() {
  const [pending, setPending] = useState(false);

  async function signOut() {
    if (pending) return;
    setPending(true);
    try {
      for (let index = window.sessionStorage.length - 1; index >= 0; index -= 1) {
        const key = window.sessionStorage.key(index);
        if (key?.startsWith(BUILDER_STORAGE_PREFIX)) {
          window.sessionStorage.removeItem(key);
        }
      }
    } catch {
      // A blocked storage area must not prevent sign-out.
    }
    if ("BroadcastChannel" in window) {
      const channel = new BroadcastChannel("ornigami-builder-session");
      channel.postMessage({ type: "session-ended" });
      channel.close();
    }
    try {
      await fetch("/api/builder/session/logout", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: "",
      });
    } catch {
      // Navigate home even if the network request fails; the server session
      // cannot be used once the browser cookie is cleared by a later request.
    }
    // Clear the authenticated root layout and any cached workspace state.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign("/");
  }

  return (
    <button
      type="button"
      data-builder-logout
      disabled={pending}
      className="min-h-9 rounded-full border border-[#c9bda8] px-3 py-1 text-xs font-semibold text-[#4f4a3f] hover:bg-[#efe7d8] disabled:opacity-60"
      onClick={() => void signOut()}
    >
      {pending ? "Signing out…" : "Sign out"}
    </button>
  );
}
