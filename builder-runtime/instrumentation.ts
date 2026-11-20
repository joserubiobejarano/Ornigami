/**
 * Builder-only startup instrumentation. This deliberately does not import the
 * reputation Sentry configuration or any legacy auth/database/job module.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { assertBuilderStartupConfiguration } = await import(
    "@/lib/builder/startup"
  );
  try {
    assertBuilderStartupConfiguration();
  } catch (error) {
    console.error(
      error instanceof Error
        ? error.message
        : "Builder configuration is invalid.",
    );
    process.exit(1);
  }
}
