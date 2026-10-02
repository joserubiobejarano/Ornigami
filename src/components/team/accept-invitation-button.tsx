"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { resolveInvitationRedirect } from "@/lib/team-invitation-flow";

export function AcceptInvitationButton({ token }: { token: string }) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function acceptInvitation() {
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`/api/team/invitations/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { Accept: "application/json" },
        credentials: "include",
      });
      const body: unknown = await response.json().catch(() => ({}));
      if (!response.ok) {
        const apiError = body && typeof body === "object" && "error" in body && typeof body.error === "string"
          ? body.error
          : "The invitation could not be accepted. Check that it is still valid and try again.";
        throw new Error(apiError);
      }

      const redirectTo = body && typeof body === "object" && "redirectTo" in body && typeof body.redirectTo === "string"
        ? body.redirectTo
        : null;
      const destination = resolveInvitationRedirect(redirectTo, window.location.origin);
      if (!destination) {
        throw new Error("The invitation was accepted, but the next page could not be opened. Go to your workspace to continue.");
      }
      // Only navigate after explicit acceptance success, avoiding dashboard provisioning beforehand.
      window.location.assign(destination);
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "The invitation could not be accepted. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-3">
      {error ? <p role="alert" aria-live="polite" className="rounded-xl border-[1.5px] border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p> : null}
      <Button type="button" variant="accent" disabled={submitting} aria-busy={submitting} onClick={() => void acceptInvitation()}>
        {submitting ? "Accepting invitation…" : "Accept invitation"}
      </Button>
    </div>
  );
}
