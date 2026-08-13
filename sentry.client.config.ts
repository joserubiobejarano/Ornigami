// Client initialization lives in instrumentation-client.ts so the Sentry SDK
// can be loaded only for authenticated application routes. Keep this option
// documented here for the security regression test and legacy tooling.
export const sentryClientOptions = {
  sendDefaultPii: false,
};
