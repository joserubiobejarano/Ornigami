"use client";

import { useState } from "react";
import { Button } from "@/components/followups/button";

type RunResult = {
  scanned: number;
  sent: number;
  failed: number;
  skipped: number;
};

export function RunFollowupsButton({
  onFinished,
  disabled = false,
  disabledReason
}: {
  onFinished?: (result: RunResult) => void;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<RunResult | null>(null);

  async function runNow() {
    setLoading(true);
    setMessage("");
    setResult(null);

    try {
      const res = await fetch("/api/followups/run-now", { method: "POST" });
      const data = await res.json();

      if (!res.ok) {
        setMessage(data?.error || "We couldn't run the follow-ups. Try again in a moment.");
      } else {
        setResult(data);
        setMessage("Follow-ups scheduled.");
        onFinished?.(data);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "We couldn't run the follow-ups. Try again in a moment.");
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
      >
        {loading ? "Running..." : "Run campaign"}
      </Button>
      {disabled && disabledReason ? <p className="text-sm text-muted-foreground">{disabledReason}</p> : null}
      {message ? <p className="text-sm text-foreground">{message}</p> : null}
      {result ? (
        <p className="text-sm text-foreground">
          scanned: <span className="font-semibold">{result.scanned}</span> | sent:{" "}
          <span className="font-semibold">{result.sent}</span> | failed:{" "}
          <span className="font-semibold">{result.failed}</span> | skipped:{" "}
          <span className="font-semibold">{result.skipped}</span>
        </p>
      ) : null}
    </div>
  );
}
