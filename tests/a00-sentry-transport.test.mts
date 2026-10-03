import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { loadTs } from "./a02-test-support.mts";

const Sentry = createRequire(import.meta.url)("@sentry/nextjs") as typeof import("@sentry/nextjs");

test("cron transport acknowledgement uses the installed SDK hook and emits only fixed operational data", async () => {
  const previousDsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  process.env.NEXT_PUBLIC_SENTRY_DSN = "https://public@sentry.invalid/42";
  const envelopes: unknown[] = [];
  const updates: string[] = [];
  try {
    Sentry.init({
      dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
      defaultIntegrations: false,
      tracesSampleRate: 0,
      sendDefaultPii: false,
      transport: () => ({
        send: async (envelope: unknown) => { envelopes.push(envelope); return { statusCode: 200 }; },
        flush: async () => true,
      }),
    });
    Sentry.setUser({ email: "private-person@example.test" });
    Sentry.setContext("private-context", { token: "private-provider-token" });
    const alerts = loadTs<typeof import("../src/lib/cron-alerts.ts")>("src/lib/cron-alerts.ts", {
      "@sentry/nextjs": Sentry,
      "@/lib/safe-logger": { safeLogger: { error: () => undefined } },
      "@/lib/db/neon": { sql: async (parts: TemplateStringsArray) => {
        const query = parts.join("?");
        if (query.includes("claim_cron_alerts")) return [{ alert_key: "privacy_retention:never_run", job_name: "privacy_retention", reason: "never_run" }];
        if (query.includes("UPDATE")) { updates.push(query); return []; }
        return [{ active_count: 1, transport_failures: 0 }];
      } },
    });
    assert.equal((await alerts.evaluateCronAlerts()).ok, true);
    assert.equal(envelopes.length, 1, "one in-memory SDK transport request, with no HTTP implementation");
    assert.equal(updates.length, 1);
    assert.match(updates[0]!, /transport_failures = 0/);
    const serialized = JSON.stringify(envelopes);
    assert.match(serialized, /Scheduled job privacy_retention needs attention/);
    assert.doesNotMatch(serialized, /private-person|private-provider-token|private-context/);
  } finally {
    await Sentry.close(2_000);
    if (previousDsn === undefined) delete process.env.NEXT_PUBLIC_SENTRY_DSN;
    else process.env.NEXT_PUBLIC_SENTRY_DSN = previousDsn;
  }
});
