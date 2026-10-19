import { isPrivatePreviewMode } from "./src/lib/private-preview";
import { SENTRY_OPTIONS } from "./src/lib/sentry-options";

export async function registerSentry() {
  if (isPrivatePreviewMode()) return;
  const [Sentry, { sanitizeServerEvent }] = await Promise.all([
    import("@sentry/nextjs"),
    import("./src/lib/sentry-server-events"),
  ]);
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    enabled: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),
    defaultIntegrations: false,
    tracesSampleRate: 0,
    beforeSend: sanitizeServerEvent,
    beforeSendTransaction: () => null,
    beforeBreadcrumb: () => null,
    ...SENTRY_OPTIONS,
  });
}
