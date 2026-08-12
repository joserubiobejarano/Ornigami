"use client";

import { useState } from "react";

type RunResult = {
  scanned: number;
  sent: number;
  failed: number;
  skipped: number;
};

export function RunFollowupsButton({
  onFinished,
  disabled = false,
  disabledReason,
}: {
  onFinished?: (result: RunResult) => void;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<RunResult | null>(null);
  const [messageKind, setMessageKind] = useState<"idle" | "success" | "error" | "running">("idle");

  async function runNow() {
    setLoading(true);
    setMessage("");
    setResult(null);
    setMessageKind("running");
    setMessage("Sending eligible follow-ups now...");

    try {
      const res = await fetch("/api/review-booster/run-now", { method: "POST" });
      const data = await res.json();

      if (!res.ok) {
        setMessage(data?.error || "Failed to run follow-ups now.");
        setMessageKind("error");
      } else {
        setResult(data);
        if ((data?.failed ?? 0) > 0) {
          setMessage("Run finished with partial issues. Some follow-ups failed.");
        } else {
          setMessage("Run complete. Eligible follow-ups were sent successfully.");
        }
        setMessageKind((data?.failed ?? 0) > 0 ? "error" : "success");
        onFinished?.(data);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to run follow-ups now.");
      setMessageKind("error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={runNow}
        disabled={loading || disabled}
        className="inline-flex rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 disabled:opacity-70"
      >
        {loading ? (
          <span className="inline-flex items-center gap-2">
            <span className="inline-flex h-2.5 w-2.5 animate-ping rounded-full bg-sky-300" />
            Running follow-ups...
          </span>
        ) : (
          "Send eligible follow-ups now"
        )}
      </button>
      {disabled && disabledReason ? <p className="text-sm text-muted-foreground">{disabledReason}</p> : null}
      {message ? (
        <div
          role="status"
          className={
            messageKind === "success"
              ? "rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100"
              : messageKind === "error"
                ? "rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-900 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-100"
                : messageKind === "running"
                  ? "rounded-lg border border-sky-300 bg-sky-50 px-3 py-2 text-sm font-medium text-sky-900 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-100"
                  : "rounded-lg border border-border bg-muted px-3 py-2 text-sm font-medium text-card-foreground"
          }
        >
          {message}
        </div>
      ) : null}
      {result ? (
        <div className="space-y-2 rounded-lg border border-border bg-muted p-3 text-sm text-card-foreground">
          <p className="font-semibold text-card-foreground">Run summary</p>
          <p>
            scanned: <span className="font-semibold">{result.scanned}</span> | sent:{" "}
            <span className="font-semibold text-emerald-700">{result.sent}</span> | failed:{" "}
            <span className={result.failed > 0 ? "font-semibold text-rose-700" : "font-semibold"}>{result.failed}</span> | skipped:{" "}
            <span className="font-semibold">{result.skipped}</span>
          </p>
        </div>
      ) : null}
    </div>
  );
}
