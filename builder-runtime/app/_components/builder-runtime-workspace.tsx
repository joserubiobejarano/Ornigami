"use client";

import { useEffect } from "react";

import { OfferIntake } from "@/components/campaign-lab/offer-intake";
import { builderClientLifecycle } from "@builder/lib/client-lifecycle";

/**
 * Runtime-only workspace adapter. The subject ID scopes tab recovery and is
 * sent with generation requests so a stale tab cannot act under a different
 * session.
 */
export function BuilderRuntimeWorkspace({
  subjectId,
}: {
  subjectId: string;
}) {
  useEffect(() => {
    let cancelled = false;
    const reload = () => {
      if (!cancelled) window.location.reload();
    };
    const channel =
      "BroadcastChannel" in window
        ? new BroadcastChannel("ornigami-builder-session")
        : null;
    channel?.addEventListener("message", () => {
      builderClientLifecycle.endWorkspace(subjectId, { broadcast: false });
      reload();
    });

    const checkSession = async () => {
      try {
        const response = await fetch("/api/builder/session", {
          cache: "no-store",
          credentials: "same-origin",
        });
        if (!response.ok) {
          builderClientLifecycle.endWorkspace(subjectId);
          reload();
          return;
        }
        const payload = (await response.json()) as { subjectId?: unknown };
        if (payload.subjectId !== subjectId) {
          builderClientLifecycle.endWorkspace(subjectId);
          reload();
        }
      } catch {
        // A transient network failure must not discard a valid local draft.
      }
    };
    const onFocus = () => void checkSession();
    const onVisibility = () => {
      if (document.visibilityState === "visible") void checkSession();
    };
    const interval = window.setInterval(checkSession, 15_000);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    void checkSession();

    return () => {
      cancelled = true;
      channel?.close();
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [subjectId]);

  return (
    <OfferIntake
      surface="builder"
      generationEndpoint="/api/builder/generate"
      recoveryScope={subjectId}
      builderSubject={subjectId}
      lifecycle={builderClientLifecycle}
      onSessionInactive={() => {
        builderClientLifecycle.endWorkspace(subjectId);
        window.location.reload();
      }}
    />
  );
}
