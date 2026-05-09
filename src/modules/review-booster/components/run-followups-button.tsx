"use client";

import { useState } from "react";

type RunResult = {
  scanned: number;
  sent: number;
  failed: number;
  skipped: number;
};

export function RunFollowupsButton({
  onFinished
}: {
  onFinished?: (result: RunResult) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<RunResult | null>(null);

  async function runNow() {
    setLoading(true);
    setMessage("");
    setResult(null);

    try {
      const res = await fetch("/api/review-booster/run-now", { method: "POST" });
      const data = await res.json();

      if (!res.ok) {
        setMessage(data?.error || "Failed to run follow-ups now.");
      } else {
        setResult(data);
        setMessage("Run complete.");
        onFinished?.(data);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to run follow-ups now.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={runNow}
        disabled={loading}
        className="inline-flex rounded-lg bg-[#0f172b] px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-70"
      >
        {loading ? "Running..." : "Send eligible follow-ups now"}
      </button>
      {message ? <p className="text-sm text-slate-700">{message}</p> : null}
      {result ? (
        <p className="text-sm text-slate-700">
          scanned: <span className="font-semibold">{result.scanned}</span> | sent: <span className="font-semibold">{result.sent}</span> | failed: <span className="font-semibold">{result.failed}</span> | skipped: <span className="font-semibold">{result.skipped}</span>
        </p>
      ) : null}
    </div>
  );
}
