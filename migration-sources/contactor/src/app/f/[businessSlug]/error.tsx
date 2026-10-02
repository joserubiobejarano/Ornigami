"use client";

import { useEffect } from "react";

export default function HostedFormError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error("Hosted form segment error.", error);
  }, [error]);

  return (
    <main className="mx-auto min-h-screen w-full max-w-2xl px-4 py-10 sm:px-6">
      <section className="rounded-2xl border border-red-200 bg-red-50 p-6">
        <h1 className="text-xl font-semibold text-red-900">Unable to load this form</h1>
        <p className="mt-2 text-sm text-red-800">
          Something went wrong while loading this business form.
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
