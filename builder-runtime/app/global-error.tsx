"use client";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[#f5f1e8] text-[#1d2a22]">
        <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col justify-center px-4 py-12 sm:px-6">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#5f5a4f]">
            Ornigami Builder
          </p>
          <h1 className="mt-3 font-display text-3xl font-bold tracking-tight">
            The builder is unavailable
          </h1>
          <p className="mt-3 text-sm leading-6 text-[#5f5a4f]">
            No approved work or export was created. Try the request again.
          </p>
          <button
            type="button"
            onClick={reset}
            className="mt-6 min-h-11 w-fit rounded-full border border-[#c9bda8] bg-[#fbf8f1] px-5 text-sm font-semibold text-[#1d2a22] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1d2a22]"
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
