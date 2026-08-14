// Client initialization lives in instrumentation-client.ts so the Sentry SDK
// can be loaded only for authenticated application routes.
import { SENTRY_OPTIONS } from "./src/lib/sentry-options";

export const sentryClientOptions = SENTRY_OPTIONS;
