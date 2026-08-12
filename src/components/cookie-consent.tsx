"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";

export function CookieConsent() {
  const storedConsent = useSyncExternalStore(
    () => () => {},
    () => window.localStorage.getItem("ornigami-cookie-consent"),
    () => "accepted"
  );
  const [dismissed, setDismissed] = useState(false);
  const visible = storedConsent !== "accepted" && !dismissed;

  if (!visible) return null;

  return (
    <aside className="fixed inset-x-4 bottom-4 z-[60] mx-auto max-w-2xl rounded-2xl border border-slate-200 bg-white p-4 shadow-xl shadow-slate-900/10 sm:flex sm:items-center sm:gap-5">
      <p className="text-sm leading-relaxed text-slate-600">
        We use essential cookies to keep Ornigami secure and remember your preferences. Read our{" "}
        <Link href="/privacy" className="font-medium text-slate-900 underline underline-offset-4">privacy policy</Link>.
      </p>
      <button type="button" className="mt-3 inline-flex h-10 shrink-0 items-center justify-center rounded-full bg-slate-900 px-5 text-sm font-semibold text-white transition hover:bg-slate-700 sm:mt-0" onClick={() => { window.localStorage.setItem("ornigami-cookie-consent", "accepted"); setDismissed(true); }}>
        Got it
      </button>
    </aside>
  );
}
