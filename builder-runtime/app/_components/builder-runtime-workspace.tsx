"use client";

import { useCallback, useEffect } from "react";

import { OfferIntake } from "@/components/campaign-lab/offer-intake";
import { BUILDER_DRAFT_STORAGE_PREFIX } from "@/lib/builder/draft-storage";

/**
 * Runtime-only workspace adapter. The subject ID scopes tab recovery and is
 * sent with generation requests so a stale tab cannot act under a different
 * session.
 */
const BUILDER_STORAGE_PREFIX = BUILDER_DRAFT_STORAGE_PREFIX;

export function BuilderRuntimeWorkspace({
  subjectId,
}: {
  subjectId: string;
}) {
  const clearScopedRecovery = useCallback(() => {
    window.dispatchEvent(new Event("ornigami-builder-signout"));
    try {
      window.sessionStorage.removeItem(
        `${BUILDER_STORAGE_PREFIX}:${subjectId}`,
      );
    } catch {
      // Storage can be unavailable; the server session remains authoritative.
    }
  }, [subjectId]);

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
      clearScopedRecovery();
      reload();
    });

    const checkSession = async () => {
      try {
        const response = await fetch("/api/builder/session", {
          cache: "no-store",
          credentials: "same-origin",
        });
        if (!response.ok) {
          clearScopedRecovery();
          reload();
          return;
        }
        const payload = (await response.json()) as { subjectId?: unknown };
        if (payload.subjectId !== subjectId) {
          clearScopedRecovery();
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
  }, [subjectId, clearScopedRecovery]);

  return (
    <OfferIntake
      surface="builder"
      generationEndpoint="/api/builder/generate"
      recoveryScope={subjectId}
      builderSubject={subjectId}
      onSessionInactive={() => {
        clearScopedRecovery();
        window.location.reload();
      }}
    />
  );
}
