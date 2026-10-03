"use client";

import { ErrorFallback } from "@/app/error-fallback";

export default function Error({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return <ErrorFallback error={error} retry={retry} boundary="route" />;
}
