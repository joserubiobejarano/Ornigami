"use client";

import { useState } from "react";

import { builderClientLifecycle } from "@builder/lib/client-lifecycle";

type SignOutState = "idle" | "pending" | "unconfirmed";

export function BuilderLogoutButton() {
  const [state, setState] = useState<SignOutState>("idle");

  async function signOut() {
    if (state === "pending") return;
    setState("pending");
    builderClientLifecycle.beginSignOut();
    try {
      const response = await fetch("/api/builder/session/logout", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: "",
      });
      if (!response.ok) {
        builderClientLifecycle.signOutUnconfirmed();
        setState("unconfirmed");
        return;
      }
      builderClientLifecycle.confirmSignOut();
      // A fresh server layout prevents the authenticated shell from being reused.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign("/");
    } catch {
      builderClientLifecycle.signOutUnconfirmed();
      setState("unconfirmed");
    }
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button
        type="button"
        data-builder-logout
        data-builder-logout-state={state}
        disabled={state === "pending"}
        className="min-h-9 rounded-full border border-[#c9bda8] px-3 py-1 text-xs font-semibold text-[#4f4a3f] hover:bg-[#efe7d8] disabled:opacity-60"
        onClick={() => void signOut()}
      >
        {state === "pending"
          ? "Signing out…"
          : state === "unconfirmed"
            ? "Retry sign out"
            : "Sign out"}
      </button>
      {state === "unconfirmed" ? (
        <span
          role="alert"
          data-builder-logout-error
          className="max-w-64 text-[0.68rem] font-medium text-[#a2382a]"
        >
          Sign-out could not be confirmed. The server session may still be
          active. Retry before leaving this device.
        </span>
      ) : null}
    </span>
  );
}
