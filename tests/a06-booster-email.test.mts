import assert from "node:assert/strict";
import test from "node:test";
import { loadTs } from "./a02-test-support.mts";

const email = loadTs<{
  buildSubject: (business: string, language?: string | null) => string;
  buildFallbackEmailBody: (input: Record<string, unknown>, now?: Date) => string;
  visitTimingPhrase: (visitedAt?: string | Date | null, now?: Date, language?: string | null) => string;
}>("src/modules/review-booster/services/followup-email-generator.service.ts", {
  "@/lib/env": { getOptionalEnv: () => null },
  openai: {},
});

test("subjects, timing, and fallback copy cover supported locales and locale variants", () => {
  const locales = ["en", "es", "fr", "de", "it", "pt"];
  const expectedSubjectStarts = ["Thank you", "Gracias", "Merci", "Danke", "Grazie", "Obrigado"];
  locales.forEach((locale, index) => assert.ok(email.buildSubject("Acme", locale).startsWith(expectedSubjectStarts[index])));
  assert.equal(email.buildSubject("Acme", "fr-CA"), email.buildSubject("Acme", "fr"));
  assert.equal(email.buildSubject("Acme", "unknown"), email.buildSubject("Acme", "en"));
  const now = new Date("2026-10-03T00:15:00.000Z");
  assert.equal(email.visitTimingPhrase("2026-10-02T23:55:00.000Z", now, "en"), "yesterday");
  assert.equal(email.visitTimingPhrase("2026-10-03T23:55:00.000Z", now, "en"), "today");
  assert.equal(email.visitTimingPhrase(null, now, "en"), "");
  assert.equal(email.visitTimingPhrase("not a date", now, "en"), "");
  for (const locale of locales) {
    const body = email.buildFallbackEmailBody({ business_name: "Acme", customer_name: "Sam", language: locale, visited_at: "2026-10-02T12:00:00.000Z" }, now);
    assert.ok(body.includes("Acme"));
    assert.ok(!/https?:\/\//.test(body));
  }
  for (const [locale, greeting] of [["en", "Hi there,"], ["es", "Hola,"], ["fr", "Bonjour,"], ["de", "Guten Tag,"], ["it", "Ciao,"], ["pt", "Olá,"]] as const) {
    const body = email.buildFallbackEmailBody({ business_name: "Acme", service_name: "haircut", language: locale }, now);
    assert.ok(body.startsWith(greeting));
    assert.match(body, /haircut/);
    assert.doesNotMatch(body, /service\.$/m);
  }
});

test("missing visit timestamp never invents yesterday", () => {
  const body = email.buildFallbackEmailBody({ business_name: "Acme", customer_name: "Sam" }, new Date("2026-10-03T12:00:00Z"));
  assert.doesNotMatch(body, /yesterday|ayer|hier|gestern|ieri|ontem/i);
});

test("a rejected OpenAI generation returns the localized deterministic fallback", async () => {
  class FailingOpenAI {
    responses = { create: async () => { throw new Error("provider unavailable"); } };
  }
  const withFailure = loadTs<{
    generateFollowupEmailBody: (input: Record<string, unknown>) => Promise<string>;
  }>("src/modules/review-booster/services/followup-email-generator.service.ts", {
    "@/lib/env": { getOptionalEnv: () => "unit-test-key" },
    openai: { __esModule: true, default: FailingOpenAI },
  });
  const body = await withFailure.generateFollowupEmailBody({ business_name: "Acme", customer_name: "Sam", language: "es" });
  assert.match(body, /^Hola Sam,/);
  assert.match(body, /gracias/i);
});

test("ambiguous OpenAI timeout and server outcomes remain explicitly unknown", async () => {
  for (const failure of [
    Object.assign(new Error("timed out"), { name: "APIConnectionTimeoutError" }),
    Object.assign(new Error("server error"), { status: 503 }),
  ]) {
    class FailingOpenAI { responses = { create: async () => { throw failure; } }; }
    const withFailure = loadTs<{
      generateFollowupEmailBody: (input: Record<string, unknown>) => Promise<string>;
    }>("src/modules/review-booster/services/followup-email-generator.service.ts", {
      "@/lib/env": { getOptionalEnv: () => "unit-test-key" },
      openai: { __esModule: true, default: FailingOpenAI },
    });
    await assert.rejects(withFailure.generateFollowupEmailBody({ business_name: "Acme" }), (error: unknown) =>
      error instanceof Error && error.name === "BoosterGenerationOutcomeUnknown");
  }
});
