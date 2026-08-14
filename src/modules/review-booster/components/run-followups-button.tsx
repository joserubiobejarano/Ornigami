"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";

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
    setMessage("Getting your follow-ups ready…");

    try {
      const res = await fetch("/api/review-booster/run-now", { method: "POST" });
      const data = await res.json();

      if (!res.ok) {
        setMessage(data?.error || "We couldn't run the follow-ups. Try again in a moment.");
        setMessageKind("error");
      } else {
        setResult(data);
        if ((data?.failed ?? 0) > 0) {
          setMessage("Some follow-ups couldn't send. We'll keep them here so you can try again.");
        } else {
          setMessage("Follow-ups scheduled.");
        }
        setMessageKind((data?.failed ?? 0) > 0 ? "error" : "success");
        onFinished?.(data);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "We couldn't run the follow-ups. Try again in a moment.");
      setMessageKind("error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      <Button
        type="button"
        onClick={runNow}
        disabled={loading || disabled}
        size="sm"
      >
        {loading ? (
          <span className="inline-flex items-center gap-2">
            <span className="inline-flex h-2.5 w-2.5 animate-ping rounded-full bg-accent-marigold" />
            Running follow-ups...
          </span>
        ) : (
          "Run campaign"
        )}
      </Button>
      {disabled && disabledReason ? <p className="text-sm text-muted-foreground">{disabledReason}</p> : null}
      {message ? (
        <div
          role="status"
          className={
            messageKind === "success"
              ? "rounded-xl border-[1.5px] border-accent-green/35 bg-accent-green/10 px-3 py-2 text-sm font-medium text-primary"
              : messageKind === "error"
                ? "rounded-xl border-[1.5px] border-destructive/35 bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive"
                : messageKind === "running"
                  ? "rounded-xl border-[1.5px] border-accent-marigold/35 bg-accent-marigold/10 px-3 py-2 text-sm font-medium text-primary"
                  : "rounded-lg border-[1.5px] border-border bg-surface px-3 py-2 text-sm font-medium text-primary"
          }
        >
          {message}
        </div>
      ) : null}
      {result ? (
        <div className="space-y-2 rounded-xl border-[1.5px] border-border bg-surface p-3 text-sm text-primary">
          <p className="font-semibold text-primary">Run summary</p>
          <p>
            scanned: <span className="font-semibold">{result.scanned}</span> | sent:{" "}
            <span className="font-semibold text-accent-green">{result.sent}</span> | failed:{" "}
            <span className={result.failed > 0 ? "font-semibold text-destructive" : "font-semibold"}>{result.failed}</span> | skipped:{" "}
            <span className="font-semibold">{result.skipped}</span>
          </p>
        </div>
      ) : null}
    </div>
  );
}
