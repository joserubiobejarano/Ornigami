import { isPrivatePreviewMode } from "@/lib/private-preview";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Validate the builder boundary before any request can be served. Invalid
    // or prematurely "enabled" builder configuration stops startup.
    const { assertBuilderStartupConfiguration } = await import(
      "./lib/builder/startup"
    );
    try {
      assertBuilderStartupConfiguration();
    } catch (error) {
      // Next can report an instrumentation error after its listener is ready.
      // Stop the process explicitly so a misconfigured builder cannot serve.
      console.error(
        error instanceof Error
          ? error.message
          : "Builder configuration is invalid.",
      );
      process.exit(1);
    }
  }

  if (isPrivatePreviewMode()) return;

  if (process.env.NEXT_RUNTIME === "nodejs") {
    const config = await import("../sentry.server.config");
    await config.registerSentry();
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    const config = await import("../sentry.edge.config");
    await config.registerSentry();
  }
}

// Never send the request, original exception, stack or context to the SDK.
export async function onRequestError(error: unknown) {
  if (isPrivatePreviewMode()) return;

  try {
    const Sentry = await import("@sentry/nextjs");
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
