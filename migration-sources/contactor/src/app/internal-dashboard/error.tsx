"use client";

import { useEffect } from "react";

export default function DashboardError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error("Dashboard segment error.", error);
  }, [error]);

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-12">
      <section className="rounded-xl border border-red-200 bg-red-50 p-6">
        <h1 className="text-xl font-semibold text-red-900">Unable to load dashboard</h1>
        <p className="mt-2 text-sm text-red-800">
          Something went wrong while loading this view. Please try again.
        </p>
        <button
          type="button"
          onClick={() => unstable_retry()}
          className="mt-4 rounded-md bg-red-700 px-4 py-2 text-sm font-medium text-white"
        >
          Retry
        </button>
      </section>
    </main>
  );
}
