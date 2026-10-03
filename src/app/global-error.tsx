"use client";

import { ErrorFallback } from "@/app/error-fallback";

export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: "#fbfaf6" }}>
        <ErrorFallback error={error} retry={retry} boundary="global" />
      </body>
    </html>
  );
}
