import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }
}

// Never send the request, original exception, stack or context to the SDK.
export async function onRequestError(error: unknown) {
  try {
    const digest = error && typeof error === "object" && "digest" in error
      && typeof error.digest === "string" && /^\d{1,20}$/.test(error.digest) ? error.digest : undefined;
    Sentry.withScope((scope) => {
      scope.clear();
      scope.setTag("error_boundary", "server");
      if (digest) scope.setTag("error_digest", digest);
      Sentry.captureException(new Error("Ornigami server request failed"));
    });
    await Sentry.flush(2_000);
  } catch {
    // Observability must not interfere with the application's error response.
  }
}
