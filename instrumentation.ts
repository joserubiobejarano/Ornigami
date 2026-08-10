import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Initialize in the instrumentation hook itself. This keeps the server SDK
    // available to App Router route handlers on Vercel, where the side-effect
    // import can otherwise be tree-shaken from the runtime bundle.
    Sentry.init({
      dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
      enabled: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),
      tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 0,
      sendDefaultPii: false,
    });
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
