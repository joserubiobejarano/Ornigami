import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { loadTs } from "./a02-test-support.mts";

const Sentry = createRequire(import.meta.url)("@sentry/nextjs") as typeof import("@sentry/nextjs");

test("installed SDK drops automatic public errors while preserving fixed boundaries and protected capture", async () => {
  const previousDsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const location = { pathname: "/", href: "https://ornigami.test/" };
  Object.defineProperty(globalThis, "window", { configurable: true, value: { location } });
  process.env.NEXT_PUBLIC_SENTRY_DSN = "https://public@sentry.invalid/42";
  const envelopes: unknown[] = [];
  let sharedOptions: Parameters<typeof Sentry.init>[0] | undefined;
  try {
    const shared = loadTs<typeof import("../src/lib/sentry-client.ts")>("src/lib/sentry-client.ts", {
      "@sentry/nextjs": {
        getClient: () => undefined,
        init: (options: Parameters<typeof Sentry.init>[0]) => { sharedOptions = options; },
      },
      "@/lib/sentry-options": { SENTRY_OPTIONS: { sendDefaultPii: false } },
    });
    await shared.getOrInitializeSentryClient();
    assert.ok(sharedOptions, "use the actual application initializer options");
    Sentry.init({
      ...sharedOptions,
      // This process exercises SDK event processing without browser integrations or HTTP.
      defaultIntegrations: false,
      integrations: [],
      sendClientReports: false,
      transport: () => ({
        send: async (envelope: unknown) => { envelopes.push(envelope); return { statusCode: 200 }; },
        flush: async () => true,
      }),
    });
    Sentry.setUser({ email: "private-public-person@example.test" });
    Sentry.setContext("private-public-context", { token: "private-public-token" });
    Sentry.captureException(new Error("private automatic public error"));
    assert.equal(await Sentry.flush(2_000), true);
    assert.equal(envelopes.length, 0, "automatic public errors must not reach the transport");

    const visibility = loadTs<typeof import("../src/lib/error-visibility.ts")>("src/lib/error-visibility.ts", {
      "@/lib/sentry-client": { getOrInitializeSentryClient: async () => Sentry },
    });
    await visibility.captureBoundaryError(Object.assign(new Error("private original boundary error"), { digest: "12345" }), "global");
    assert.equal(await Sentry.flush(2_000), true);
    assert.equal(envelopes.length, 1, "the fixed public boundary remains visible");
    const serialized = JSON.stringify(envelopes);
    assert.match(serialized, /Ornigami global error boundary caught an error/);
    assert.match(serialized, /12345/);
    assert.doesNotMatch(serialized, /private-public|private original|private automatic|private-public-context/);

    location.pathname = "/dashboard";
    location.href = "https://ornigami.test/dashboard";
    Sentry.captureException(new Error("protected capture regression fixture"));
    assert.equal(await Sentry.flush(2_000), true);
    assert.equal(envelopes.length, 2, "protected error capture remains available");

    location.pathname = "/pricing";
    location.href = "https://ornigami.test/pricing";
    Sentry.captureException(new Error("private public error after protected navigation"));
    assert.equal(await Sentry.flush(2_000), true);
    assert.equal(envelopes.length, 2, "returning to a public page restores the gate");
  } finally {
    await Sentry.close(2_000);
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
    else delete (globalThis as unknown as Record<string, unknown>).window;
    if (previousDsn === undefined) delete process.env.NEXT_PUBLIC_SENTRY_DSN;
    else process.env.NEXT_PUBLIC_SENTRY_DSN = previousDsn;
  }
});
