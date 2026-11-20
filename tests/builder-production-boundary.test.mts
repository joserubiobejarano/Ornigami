import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import {
  BUILDER_CLOSED_MESSAGE,
  getBuilderAccessDecision,
} from "../src/lib/builder/access.ts";
import {
  BUILDER_FIRST_BETA_SCOPE,
  assertBuilderStartupConfiguration,
  validateBuilderEnvironment,
} from "../src/lib/builder/config.ts";
import {
  createBuilderGenerateHandler,
  parseBuilderGenerationRequest,
  runBuilderGeneration,
  type BuilderGenerationResponse,
} from "../src/lib/builder/generation.ts";
import type { BrowserOfferBriefRequest } from "../src/lib/campaign-lab/browser-offer-brief.ts";
import { LocalTestGenerationProvider } from "../src/lib/campaign-lab/generation/local-test-provider.ts";

function browserBrief(): BrowserOfferBriefRequest {
  return {
    schemaVersion: 1,
    brandName: "Harbor Field",
    productName: "Harbor Field travel bottle",
    audience: "Mobile shoppers.",
    objective: "Reach the listing.",
    offer: "20% off, 27-30 November 2026",
    destinationUrl: "https://example.com/harbor-field",
    facts: [
      { label: "Capacity", value: "500 ml" },
      { label: "Closure", value: "Screw cap" },
    ],
    asset: {
      fileName: "bottle.png",
      width: 1200,
      height: 1500,
      alt: "Graphite travel bottle on a studio backdrop.",
      rights: "Synthetic local fixture.",
      contentHash: "a".repeat(64),
    },
    operatorConfirmations: {
      offer: "20% off, 27-30 November 2026",
      destination: "https://example.com/harbor-field",
      rights: "Synthetic local fixture.",
    },
    reviewedOn: "2026-11-18",
  };
}

function request(body: unknown): Request {
  return new Request("http://localhost/api/builder/generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("the first-beta scope is offer-only, static and export-only", () => {
  assert.deepEqual(BUILDER_FIRST_BETA_SCOPE.formats, ["single-product-offer"]);
  assert.deepEqual(BUILDER_FIRST_BETA_SCOPE.directions, ["clear", "editorial"]);
  assert.equal(BUILDER_FIRST_BETA_SCOPE.preview, "static");
  assert.equal(BUILDER_FIRST_BETA_SCOPE.export, "zip");
  assert.equal(BUILDER_FIRST_BETA_SCOPE.durableProjects, false);
  assert.equal(BUILDER_FIRST_BETA_SCOPE.hostedPublishing, false);
  assert.equal(BUILDER_FIRST_BETA_SCOPE.billing, false);
  assert.equal(BUILDER_FIRST_BETA_SCOPE.publicUrlImport, false);
  assert.equal(BUILDER_FIRST_BETA_SCOPE.advertorial, false);
  assert.equal(BUILDER_FIRST_BETA_SCOPE.motion, false);
});

test("builder startup rejects premature access, providers and legacy reuse", () => {
  const empty = validateBuilderEnvironment({});
  assert.equal(empty.ok, true);
  assert.equal(empty.ok && empty.config.accessMode, "closed");

  const closed = validateBuilderEnvironment({
    BUILDER_BETA_ACCESS_MODE: "closed",
    BUILDER_GENERATION_PROVIDER: "disabled",
    BUILDER_BETA_LEGACY_AUTH: "false",
  });
  assert.equal(closed.ok, true);

  for (const env of [
    { BUILDER_BETA_ACCESS_MODE: "invite" },
    { BUILDER_BETA_ENABLED: "true" },
    { BUILDER_GENERATION_PROVIDER: "openai" },
    { BUILDER_GENERATION_PROVIDER: "local-test" },
    { BUILDER_BETA_LEGACY_AUTH: "true" },
    { BUILDER_BETA_LEGACY_BILLING: "1" },
    { BUILDER_BETA_DURABLE_PROJECTS: "true" },
    { BUILDER_BETA_URL_IMPORT: "yes" },
    { BUILDER_BETA_PUBLISHING: "on" },
  ]) {
    const result = validateBuilderEnvironment(env);
    assert.equal(result.ok, false, JSON.stringify(env));
    assert.throws(() => assertBuilderStartupConfiguration(env), /Builder configuration is invalid/);
  }
});

test("builder access never treats a legacy reputation identity or plan as permission", () => {
  const decision = getBuilderAccessDecision({
    NODE_ENV: "production",
    AUTH_SECRET: "legacy-secret",
    DATABASE_URL: "https://example.invalid/database",
    STRIPE_SECRET_KEY: "sk_test_legacy",
    GOOGLE_CLIENT_ID: "legacy-google",
    CRON_SECRET: "legacy-cron",
  });
  assert.equal(decision.allowed, false);
  if (!decision.allowed) {
    assert.equal(decision.reason, "closed");
    assert.equal(decision.message, BUILDER_CLOSED_MESSAGE);
  }
});

test("the closed builder API returns a no-store 404 without reading the body", async () => {
  let generated = false;
  const handler = createBuilderGenerateHandler({
    access: () => ({ allowed: false, reason: "closed", message: BUILDER_CLOSED_MESSAGE }),
    generate: async () => {
      generated = true;
      return { ok: true } as unknown as BuilderGenerationResponse;
    },
  });
  const response = await handler(request({ browserBrief: browserBrief() }));
  assert.equal(response.status, 404);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("x-robots-tag"), "noindex, nofollow");
  assert.deepEqual(await response.json(), { ok: false, error: "Not found." });
  assert.equal(generated, false);
});

test("the closed builder API does not touch the request at all", async () => {
  const handler = createBuilderGenerateHandler({
    access: () => ({ allowed: false, reason: "closed", message: BUILDER_CLOSED_MESSAGE }),
  });
  const untouched = new Proxy({} as Request, {
    get() {
      throw new Error("a denied builder request must not be inspected");
    },
  });
  const response = await handler(untouched);
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { ok: false, error: "Not found." });
});

test("the builder parser accepts only the bounded browser brief contract", () => {
  const accepted = parseBuilderGenerationRequest({
    browserBrief: browserBrief(),
    requestId: "11111111-1111-4111-8111-111111111111",
  });
  assert.equal(accepted.ok, true);
  if (accepted.ok) {
    assert.equal(accepted.requestId, "11111111-1111-4111-8111-111111111111");
    assert.equal(accepted.brief.context.ownerConfirmed, false);
    assert.equal(accepted.brief.context.assetBytesVerified, false);
  }

  for (const body of [
    { browserBrief: browserBrief() },
    { browserBrief: browserBrief(), requestId: "req-1" },
    { browserBrief: browserBrief(), requestId: "1" },
    { browserBrief: browserBrief(), requestId: "11111111-1111-4111-8111-11111111111z" },
    { fixtureId: "sparse", requestId: "11111111-1111-4111-8111-111111111111" },
    { values: {}, browserBrief: browserBrief(), requestId: "11111111-1111-4111-8111-111111111111" },
    { browserBrief: browserBrief(), format: "advertorial", requestId: "11111111-1111-4111-8111-111111111111" },
    { browserBrief: browserBrief(), values: { format: "advertorial" }, requestId: "11111111-1111-4111-8111-111111111111" },
  ]) {
    const rejected = parseBuilderGenerationRequest(body);
    assert.equal(rejected.ok, false, JSON.stringify(body));
    if (!rejected.ok) assert.equal(rejected.status, 400);
  }

  const invalid = parseBuilderGenerationRequest({
    browserBrief: { schemaVersion: 1 },
    requestId: "11111111-1111-4111-8111-111111111111",
  });
  assert.equal(invalid.ok, false);
  if (!invalid.ok) assert.equal(invalid.status, 422);
});

test("builder generation defaults to an offline deterministic draft and never reads lab provider settings", async () => {
  const parsed = parseBuilderGenerationRequest({
    browserBrief: browserBrief(),
    requestId: "22222222-2222-4222-8222-222222222222",
  });
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;

  const result = await runBuilderGeneration(parsed, {
    env: {
      CAMPAIGN_LAB_GENERATION_PROVIDER: "openai",
      CAMPAIGN_LAB_GENERATION_LIVE: "true",
      OPENAI_ENABLED: "true",
      OPENAI_API_KEY: "must-not-be-used",
    },
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.generation.status, "fallback");
    assert.equal(result.generation.provider, "none");
    assert.equal(result.preview.draft.templateId, "single-product-offer");
    assert.equal(result.preview.brief.productName, "Harbor Field travel bottle");
    assert.equal(result.preview.brief.destinationUrl, "https://example.com/harbor-field");
  }
});

test("the qualified offer pipeline remains available to the isolated builder wrapper", async () => {
  const parsed = parseBuilderGenerationRequest({
    browserBrief: browserBrief(),
    requestId: "33333333-3333-4333-8333-333333333333",
  });
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;

  const result = await runBuilderGeneration(parsed, {
    provider: new LocalTestGenerationProvider("success"),
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.generation.status, "generated");
    assert.equal(result.generation.providerMode, "local-test");
    assert.equal(result.preview.brief.productName, "Harbor Field travel bottle");
    assert.match(result.preview.revision ?? "", /^[a-f0-9]{16}$/);
  }
});

test("the authorized handler still uses only the browser brief and injected work", async () => {
  let received: unknown;
  const handler = createBuilderGenerateHandler({
    access: () => ({ allowed: true, reason: "authorized", subject: "test-subject" }),
    generate: async (parsed) => {
      received = parsed;
      return {
        ok: true,
        requestId: parsed.requestId,
        browserBrief: parsed.brief.context,
      } as unknown as BuilderGenerationResponse;
    },
  });
  const response = await handler(request({ browserBrief: browserBrief(), requestId: "44444444-4444-4444-8444-444444444444" }));
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.requestId, "44444444-4444-4444-8444-444444444444");
  assert.equal(payload.browserBrief.source, "browser-offer");
  assert.ok(received);
  assert.equal((received as { brief?: { context?: { source?: string } } }).brief?.context?.source, "browser-offer");
});

test("builder runtime source has no legacy auth, billing, database, job or provider imports", () => {
  const files = [
    "src/lib/builder/access.ts",
    "src/lib/builder/config.ts",
    "src/lib/builder/draft-storage.ts",
    "src/lib/builder/generation.ts",
    "src/lib/builder/request-id.ts",
    "src/lib/builder/startup.ts",
    "src/app/builder/layout.tsx",
    "src/app/builder/page.tsx",
    "src/app/builder/not-found.tsx",
    "src/app/api/builder/generate/route.ts",
  ];
  const forbidden =
    /(?:@\/auth|lib\/db|lib\/stripe|lib\/billing|lib\/google|lib\/cron|lib\/review-|lib\/openai|lib\/resend|lib\/privacy-|services\/review|api\/cron)/;
  for (const file of files) {
    const source = readFileSync(join(process.cwd(), file), "utf8");
    assert.doesNotMatch(source, forbidden, file);
  }
});

test("the development lab guard remains intact and the builder gate denies first", () => {
  const availability = readFileSync(
    join(process.cwd(), "src/lib/campaign-lab/availability.ts"),
    "utf8",
  );
  assert.match(availability, /nodeEnv === "development"/);

  const page = readFileSync(join(process.cwd(), "src/app/builder/page.tsx"), "utf8");
  assert.match(page, /getBuilderAccessDecision/);
  assert.match(page, /notFound\(\)/);
  assert.ok(
    page.indexOf("if (!getBuilderAccessDecision().allowed) notFound();") <
      page.indexOf("return <BuilderWorkspace />"),
  );

  const api = readFileSync(
    join(process.cwd(), "src/app/api/builder/generate/route.ts"),
    "utf8",
  );
  assert.doesNotMatch(api, /campaign-lab\/generate/);
  const handler = readFileSync(
    join(process.cwd(), "src/lib/builder/generation.ts"),
    "utf8",
  );
  const accessCheck = handler.indexOf("if (!access.allowed)");
  assert.ok(accessCheck > -1);
  assert.ok(accessCheck < handler.indexOf("readBoundedJsonBody("));
  assert.ok(accessCheck < handler.indexOf("(dependencies.generate"));
});
