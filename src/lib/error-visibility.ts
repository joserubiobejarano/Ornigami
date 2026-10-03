"use client";

import { SENTRY_OPTIONS } from "@/lib/sentry-options";

type ErrorBoundary = "route" | "global";

const reportedErrors = new WeakSet<object>();
let sentryClientPromise: Promise<typeof import("@sentry/nextjs")> | undefined;

function safeDigest(error: Error & { digest?: string }): string | undefined {
  const digest = error.digest;
  return typeof digest === "string" && /^\d{1,20}$/.test(digest)
    ? digest
    : undefined;
}

async function loadSentry() {
  sentryClientPromise ??= import("@sentry/nextjs").then((Sentry) => {
    // instrumentation-client only initializes Sentry on protected routes. The
    // boundary may also render on a public route, so initialize with the same
    // PII default only when no client has already been configured.
    if (!Sentry.getClient()) {
      const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
      if (dsn) {
        Sentry.init({
          dsn,
          enabled: true,
          tracesSampleRate: 0,
          ...SENTRY_OPTIONS,
        });
      }
    }
    return Sentry;
  });

  return sentryClientPromise;
}

/** Report only a fixed exception and allowlisted metadata; never pass the source error to Sentry. */
export async function captureBoundaryError(
  error: Error & { digest?: string },
  boundary: ErrorBoundary,
): Promise<void> {
  if (reportedErrors.has(error)) return;
  reportedErrors.add(error);

  try {
    const Sentry = await loadSentry();
    if (!Sentry.getClient()) return;

    const digest = safeDigest(error);
    const safeError = new Error(`Ornigami ${boundary} error boundary caught an error`);
    const tags = {
      error_boundary: boundary,
      ...(digest ? { error_digest: digest } : {}),
    };
    const fingerprint = ["ornigami-error-boundary", boundary, digest ?? "no-digest"];

    Sentry.withScope((scope) => {
      scope.clear();
      scope.setLevel("error");
      scope.addEventProcessor((event) => ({
        // Keep only ordinary Sentry envelope metadata and a fixed exception.
        // In particular, strip inherited user, request, breadcrumb, context,
        // extra, transaction, and original exception data from the event.
        event_id: event.event_id,
        timestamp: event.timestamp,
        platform: event.platform,
        sdk: event.sdk,
        release: event.release,
        environment: event.environment,
        level: "error",
        exception: { values: [{ type: "Error", value: safeError.message }] },
        tags,
        fingerprint,
      }));
      Sentry.captureException(safeError);
    });
  } catch {
    // Error reporting must never prevent the recovery UI from rendering.
  }
}

export const ERROR_FALLBACK_COPY = {
  title: "Something went wrong",
  message: "This page ran into a problem. Try loading it again.",
  support: "If it keeps happening, contact us and tell us what you were doing.",
  retry: "Try again",
  home: "Go home",
  contact: "Contact support",
} as const;
