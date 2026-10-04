import * as Sentry from "@sentry/nextjs";
import { SENTRY_OPTIONS } from "./src/lib/sentry-options";
import { sanitizeServerEvent } from "./src/lib/sentry-server-events";

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
