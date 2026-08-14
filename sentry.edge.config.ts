import * as Sentry from "@sentry/nextjs";
import { SENTRY_OPTIONS } from "./src/lib/sentry-options";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 0,
  ...SENTRY_OPTIONS,
});
