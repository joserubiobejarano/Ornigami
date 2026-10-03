"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";

const CONFIRMATION = "DELETE MY DATA";

type DeletionResponse = {
  ok?: boolean;
  error?: string;
  confirmationRequired?: boolean;
  recoverable?: boolean;
};

export default function AccountDeletionForm({ initialState }: { initialState: "none" | "pending" | "confirmation" | "complete" }) {
  const [confirmation, setConfirmation] = useState(initialState === "none" ? "" : CONFIRMATION);
  const [confirmWorkspace, setConfirmWorkspace] = useState(false);
  const [workspacePrompt, setWorkspacePrompt] = useState(initialState === "confirmation");
  const [pending, setPending] = useState(initialState === "pending" || initialState === "confirmation");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const complete = initialState === "complete";
  const [supportRequired, setSupportRequired] = useState(false);

  async function finishLocally() {
    await signOut({ redirect: false }).catch(() => {});
    window.location.replace("/");
  }

  async function submitDeletion() {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/privacy/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          confirmation: CONFIRMATION,
          confirmSharedWorkspaceData: confirmWorkspace,
        }),
      });
      const body = await response.json().catch(() => ({})) as DeletionResponse;

      if (response.ok && body.ok === true) {
        await finishLocally();
        return;
      }
      if (body.confirmationRequired) {
        setWorkspacePrompt(true);
        setPending(false);
        setMessage(body.error ?? "This will also delete your workspace and team data. Confirm to continue.");
        return;
      }
      if (response.status === 401) {
        setPending(false);
        setSupportRequired(true);
        setMessage("Your session ended before we could confirm the result. Contact privacy@ornigami.com so we can verify the request safely.");
        return;
      }
      if (response.status === 202 || (response.status === 409 && !body.confirmationRequired) || body.recoverable) {
        setPending(true);
        setMessage("Deletion is still processing. Retry here to check progress and continue the same request.");
        return;
      }
      setMessage(body.error ?? "Deletion could not be completed. You can retry this request.");
    } catch {
      setPending(true);
      setMessage("We could not confirm the result. Retry to resume the same deletion request.");
    } finally {
      setBusy(false);
    }
  }

  if (complete) {
    return <main className="mx-auto max-w-xl px-6 py-16" aria-live="polite">
      <h1 className="text-3xl font-semibold">Account deleted</h1>
      <p className="mt-4 text-muted-foreground">Your account deletion is complete. You can close this page.</p>
      <button type="button" onClick={() => void finishLocally()} className="mt-6 rounded-md border px-4 py-2">Sign out</button>
    </main>;
  }

  return <main className="mx-auto max-w-xl px-6 py-16" aria-live="polite">
    <h1 className="text-3xl font-semibold">Delete your account</h1>
    <p className="mt-4 text-muted-foreground">
      This request removes your account data after billing and connected services have been handled.
      If work is still in progress, you can return here and retry safely.
    </p>
    <label className="mt-8 block text-sm font-medium" htmlFor="deletion-confirmation">
      Type <span className="font-mono">{CONFIRMATION}</span> to continue
    </label>
    <input
      id="deletion-confirmation"
      autoComplete="off"
      value={confirmation}
      onChange={(event) => setConfirmation(event.target.value)}
      disabled={pending || busy}
      className="mt-2 w-full rounded-md border bg-background px-3 py-2"
    />
    {workspacePrompt && <label className="mt-5 flex gap-3 text-sm">
      <input
        type="checkbox"
        checked={confirmWorkspace}
        onChange={(event) => setConfirmWorkspace(event.target.checked)}
        disabled={busy}
      />
      <span>I understand this also deletes my workspace and its team data. Teammate accounts remain.</span>
    </label>}
    {message && <p className="mt-5 rounded-md border p-3 text-sm" role="status">{message}</p>}
      <button
      type="button"
      onClick={() => submitDeletion()}
      disabled={busy || supportRequired || confirmation !== CONFIRMATION || (workspacePrompt && !confirmWorkspace)}
      className="mt-6 rounded-md bg-destructive px-4 py-2 font-medium text-destructive-foreground disabled:opacity-50"
    >
      {busy ? "Checking deletion status…" : pending ? "Retry deletion" : "Delete account"}
    </button>
  </main>;
}
