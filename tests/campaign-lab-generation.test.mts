import assert from "node:assert/strict";
import test from "node:test";

import {
  BASE_CATALOG,
  CAMPAIGN_FIXTURES,
  createFormValues,
} from "../src/lib/campaign-lab/fixtures.ts";
import { GenerationRequestGate } from "../src/lib/campaign-lab/generation/client-gate.ts";
import { resolveGenerationProvider, resolveGenerationTimeoutMs } from "../src/lib/campaign-lab/generation/provider-config.ts";
import { runCampaignGeneration } from "../src/lib/campaign-lab/generation/service.ts";
import type {
  CampaignGenerationProvider,
  GenerationEnv,
  GenerationRequest,
} from "../src/lib/campaign-lab/generation/types.ts";
import { validateGenerationProposal } from "../src/lib/campaign-lab/generation/validate.ts";
import {
  SINGLE_PRODUCT_OFFER_TEMPLATE,
  buildCampaignPreview,
  getAllowedAngles,
  validateTemplateDraft,
} from "../src/lib/campaign-lab/template.ts";

function env(overrides: GenerationEnv = {}): GenerationEnv {
  return {
    CAMPAIGN_LAB_GENERATION_PROVIDER: "local-test",
    CAMPAIGN_LAB_GENERATION_TEST_MODE: "success",
    CAMPAIGN_LAB_GENERATION_TIMEOUT_MS: "500",
    ...overrides,
  };
}

function stubProvider(value: unknown): CampaignGenerationProvider {
  return {
    id: "stub",
    label: "Stub provider",
    async generate() {
      return value;
    },
  };
}

function catalogWithHeadlineMode(
  headlineMode: "offer-led" | "product-led" | "angle",
) {
  return {
    ...BASE_CATALOG,
    brands: {
      ...BASE_CATALOG.brands,
      "harbor-field": {
        ...BASE_CATALOG.brands["harbor-field"],
        headlineMode,
      },
    },
  };
}

function validRequest(): GenerationRequest {
  return {
    template: {
      id: SINGLE_PRODUCT_OFFER_TEMPLATE.id,
      version: SINGLE_PRODUCT_OFFER_TEMPLATE.version,
    },
    brand: { id: "harbor-field", name: "Harbor Field" },
    campaign: {
      fixtureId: "sparse",
      openingFocus: null,
      productName: "Harbor Field travel bottle",
      productNoun: "travel bottle",
      offer: "20% off, 27–30 November 2026",
      lede: "A 500 ml insulated bottle with a screw cap, made for the commute and the trail.",
      storyHeadline: null,
      facts: CAMPAIGN_FIXTURES.sparse.brief.productFacts,
    },
    allowed: {
      angles: ["offer-led", "product-led"],
      layouts: ["offer-led-one-photo", "editorial-long-copy"],
      sectionOrders: {
        "offer-led-one-photo": [["hero", "hero-facts", "close"], ["hero", "close"]],
        "editorial-long-copy": [["hero", "detail", "close"], ["hero", "close"]],
      },
      layoutFactCapacity: {
        "offer-led-one-photo": 3,
        "editorial-long-copy": 3,
      },
      factIds: ["capacity", "closure"],
      maxFacts: 3,
      requiredFactGroups: [],
    },
    limits: { headline: 180, lede: 240, factValue: 80 },
  };
}

test("the local test provider succeeds through the server generation path", async () => {
  const fixture = CAMPAIGN_FIXTURES.sparse;
  const values = createFormValues(fixture);
  const deterministic = buildCampaignPreview(fixture, values);
  const result = await runCampaignGeneration(
    { fixtureId: "sparse", values },
    { env: env() },
  );

  assert.equal(deterministic.ok, true);
  assert.equal(result.ok, true);
  if (!result.ok || !deterministic.ok) return;

  assert.equal(result.generation.status, "generated");
  assert.equal(result.generation.provider, "local-test");
  assert.equal(result.generation.angle, "offer-led");
  assert.equal(result.generation.layout, "offer-led-one-photo");
  assert.deepEqual(result.generation.sections, ["hero", "hero-facts", "close"]);
  assert.deepEqual(result.generation.factIds, ["capacity", "closure"]);
  assert.match(result.preview.revision, /^[a-f0-9]{16}$/);
  assert.notEqual(result.preview.revision, deterministic.preview.revision);
  assert.equal(result.preview.brief.productName, values.productName);
  assert.equal(result.preview.brief.offer, values.offer);
  assert.equal(result.preview.brief.destinationUrl, values.destinationUrl);
  assert.equal(result.preview.asset.id, values.assetId);
  assert.equal(result.preview.asset.alt, deterministic.preview.asset.alt);
  assert.ok(result.preview.asset.alt.length > 20);
  assert.deepEqual(
    result.preview.draft.facts.map((fact) => fact.id),
    ["capacity", "closure"],
  );
  assert.equal(
    result.preview.draft.facts.some((fact) => fact.id === "material"),
    false,
    "the offer-led arrangement selects a subset of the approved facts",
  );
  for (const fact of result.preview.draft.facts) {
    assert.equal(fact.source.quote.length > 0, true);
    assert.equal(fact.value, fixture.brief.productFacts.find((item) => item.id === fact.id)?.value);
  }
  assert.deepEqual(validateTemplateDraft(result.preview.brief, result.preview.draft), []);
});

test("a product-led profile governs successful provider generation", async () => {
  const fixture = CAMPAIGN_FIXTURES.sparse;
  const values = createFormValues(fixture);
  const catalog = catalogWithHeadlineMode("product-led");
  const deterministic = buildCampaignPreview(fixture, values, catalog);
  const result = await runCampaignGeneration(
    { fixtureId: "sparse", values },
    { env: env(), catalog },
  );

  assert.equal(deterministic.ok, true);
  assert.equal(result.ok, true);
  if (!result.ok || !deterministic.ok) return;

  assert.equal(result.generation.status, "generated");
  assert.equal(result.generation.angle, "product-led");
  assert.equal(
    result.preview.draft.headline,
    "Harbor Field travel bottle",
  );
  assert.equal(result.preview.brief.offer, values.offer);
  assert.equal(result.preview.brief.destinationUrl, values.destinationUrl);
  assert.equal(result.preview.asset.id, values.assetId);
  assert.equal(result.preview.asset.alt, deterministic.preview.asset.alt);
  assert.notEqual(result.preview.revision, deterministic.preview.revision);
});

test("an incompatible proposal recovers through the product-led fallback", async () => {
  const fixture = CAMPAIGN_FIXTURES.sparse;
  const values = createFormValues(fixture);
  const catalog = catalogWithHeadlineMode("product-led");
  const deterministic = buildCampaignPreview(fixture, values, catalog);
  const result = await runCampaignGeneration(
    { fixtureId: "sparse", values },
    {
      catalog,
      provider: stubProvider({
        angle: "offer-led",
        layout: "offer-led-one-photo",
        sections: ["hero", "hero-facts", "close"],
        factIds: ["capacity", "closure"],
      }),
    },
  );

  assert.equal(deterministic.ok, true);
  assert.equal(result.ok, true);
  if (!result.ok || !deterministic.ok) return;

  assert.equal(result.generation.status, "fallback");
  assert.equal(result.generation.code, "invalid");
  assert.match(
    result.generation.issues?.join(" ") ?? "",
    /opening angle is not supported/i,
  );
  assert.equal(result.preview.revision, deterministic.preview.revision);
  assert.equal(result.preview.draft.headline, "Harbor Field travel bottle");
  assert.equal(result.preview.brief.offer, values.offer);
  assert.equal(result.preview.brief.destinationUrl, values.destinationUrl);
  assert.equal(result.preview.asset.id, values.assetId);
});

test("invalid output and timeout keep the product-led fallback and fixed inputs", async () => {
  const fixture = CAMPAIGN_FIXTURES.sparse;
  const values = createFormValues(fixture);
  const catalog = catalogWithHeadlineMode("product-led");
  const deterministic = buildCampaignPreview(fixture, values, catalog);
  assert.equal(deterministic.ok, true);
  if (!deterministic.ok) return;

  for (const [mode, code] of [
    ["invalid", "invalid"],
    ["timeout", "timeout"],
  ] as const) {
    const result = await runCampaignGeneration(
      { fixtureId: "sparse", values },
      {
        catalog,
        env: env({
          CAMPAIGN_LAB_GENERATION_TEST_MODE: mode,
          CAMPAIGN_LAB_GENERATION_TIMEOUT_MS: "50",
        }),
      },
    );
    assert.equal(result.ok, true, mode);
    if (!result.ok) continue;
    assert.equal(result.generation.status, "fallback", mode);
    assert.equal(result.generation.code, code, mode);
    assert.equal(result.preview.revision, deterministic.preview.revision);
    assert.equal(result.preview.draft.headline, "Harbor Field travel bottle");
    assert.equal(result.preview.brief.offer, values.offer);
    assert.equal(result.preview.brief.destinationUrl, values.destinationUrl);
    assert.equal(result.preview.asset.id, values.assetId);
  }
});

test("offer-led and legacy angle profiles stay compatible", async () => {
  const fixture = CAMPAIGN_FIXTURES.sparse;
  const values = createFormValues(fixture);

  const offerLedCatalog = catalogWithHeadlineMode("offer-led");
  const offerLed = await runCampaignGeneration(
    { fixtureId: "sparse", values },
    { env: env(), catalog: offerLedCatalog },
  );
  assert.equal(offerLed.ok, true);
  if (offerLed.ok) {
    assert.equal(offerLed.generation.status, "generated");
    assert.equal(offerLed.generation.angle, "offer-led");
    assert.equal(offerLed.preview.brief.offer, values.offer);
  }

  const legacyCatalog = catalogWithHeadlineMode("angle");
  const legacyDeterministic = buildCampaignPreview(
    fixture,
    values,
    legacyCatalog,
  );
  const legacy = await runCampaignGeneration(
    { fixtureId: "sparse", values },
    { env: env(), catalog: legacyCatalog },
  );
  assert.equal(legacyDeterministic.ok, true);
  assert.equal(legacy.ok, true);
  if (legacy.ok && legacyDeterministic.ok) {
    assert.equal(legacy.generation.status, "generated");
    assert.equal(legacy.generation.angle, "offer-led");
    assert.equal(
      legacyDeterministic.preview.draft.headline,
      "Harbor Field travel bottle",
    );
    assert.equal(legacy.preview.brief.offer, values.offer);
    assert.equal(legacy.preview.brief.destinationUrl, values.destinationUrl);
  }
});

test("the local test provider preserves the long-copy story angle and detail arrangement", async () => {
  const fixture = CAMPAIGN_FIXTURES["long-copy"];
  const values = createFormValues(fixture);
  const result = await runCampaignGeneration(
    { fixtureId: "long-copy", values },
    { env: env() },
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(result.generation.status, "generated");
  assert.equal(result.generation.angle, "story-led");
  assert.equal(result.generation.layout, "editorial-long-copy");
  assert.deepEqual(result.generation.sections, ["hero", "detail", "close"]);
  assert.deepEqual(result.generation.factIds, ["interior", "outlet", "body"]);
  assert.equal(result.preview.draft.facts.some((fact) => fact.id === "finish"), false);
  assert.equal(result.preview.draft.headline, fixture.brief.copy.headline);
});

test("invalid provider output is rejected and leaves a valid deterministic draft", async () => {
  const fixture = CAMPAIGN_FIXTURES.sparse;
  const values = createFormValues(fixture);
  const deterministic = buildCampaignPreview(fixture, values);
  const result = await runCampaignGeneration(
    { fixtureId: "sparse", values },
    { env: env({ CAMPAIGN_LAB_GENERATION_TEST_MODE: "invalid" }) },
  );

  assert.equal(deterministic.ok, true);
  assert.equal(result.ok, true);
  if (!result.ok || !deterministic.ok) return;

  assert.equal(result.generation.status, "fallback");
  assert.equal(result.generation.code, "invalid");
  assert.ok((result.generation.issues?.length ?? 0) > 0);
  assert.match(result.generation.issues?.join(" ") ?? "", /may not set "productName"/);
  assert.match(result.generation.issues?.join(" ") ?? "", /layout is not a supported/);
  assert.equal(result.preview.revision, deterministic.preview.revision);
  assert.equal(result.preview.brief.productName, values.productName);
  assert.equal(result.preview.brief.offer, values.offer);
  assert.equal(result.preview.brief.destinationUrl, values.destinationUrl);
  assert.equal(result.preview.asset.id, values.assetId);
  assert.equal(result.preview.asset.alt, deterministic.preview.asset.alt);
});

test("a provider that times out falls back through the server path", async () => {
  const fixture = CAMPAIGN_FIXTURES.sparse;
  const values = createFormValues(fixture);
  const deterministic = buildCampaignPreview(fixture, values);
  const started = Date.now();
  const result = await runCampaignGeneration(
    { fixtureId: "sparse", values },
    {
      env: env({
        CAMPAIGN_LAB_GENERATION_TEST_MODE: "timeout",
        CAMPAIGN_LAB_GENERATION_TIMEOUT_MS: "50",
      }),
    },
  );

  assert.equal(result.ok, true);
  if (!result.ok || !deterministic.ok) return;
  assert.equal(result.generation.status, "fallback");
  assert.equal(result.generation.code, "timeout");
  assert.match(result.generation.message ?? "", /50 ms/);
  assert.equal(result.preview.revision, deterministic.preview.revision);
  assert.ok(Date.now() - started < 1000);
});

test("generation switched off produces an explicit deterministic fallback", async () => {
  const fixture = CAMPAIGN_FIXTURES.sparse;
  const values = createFormValues(fixture);
  const result = await runCampaignGeneration(
    { fixtureId: "sparse", values },
    { env: env({ CAMPAIGN_LAB_GENERATION_PROVIDER: "off" }) },
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.generation.status, "fallback");
  assert.equal(result.generation.code, "unavailable");
  assert.match(result.generation.message ?? "", /switched off/);
  assert.equal(result.preview.asset.id, values.assetId);
});

test("a valid proposal cannot smuggle protected campaign values", async () => {
  const fixture = CAMPAIGN_FIXTURES.sparse;
  const values = createFormValues(fixture);
  const result = await runCampaignGeneration(
    { fixtureId: "sparse", values },
    {
      provider: stubProvider({
        angle: "offer-led",
        layout: "offer-led-one-photo",
        sections: ["hero", "hero-facts", "close"],
        factIds: ["capacity"],
        productName: "Counterfeit product",
        offer: "90% off everything",
        destinationUrl: "https://example.invalid/not-approved",
        assetId: "not-approved-asset",
        alt: "An invented product.",
      }),
    },
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.generation.status, "fallback");
  assert.equal(result.generation.code, "invalid");
  assert.equal(result.preview.brief.productName, values.productName);
  assert.equal(result.preview.brief.offer, values.offer);
  assert.equal(result.preview.brief.destinationUrl, values.destinationUrl);
  assert.equal(result.preview.asset.id, values.assetId);
  assert.notEqual(result.preview.asset.alt, "An invented product.");
});

test("unsupported variants, section orders and fact IDs are rejected", () => {
  const request = validRequest();
  const cases = [
    { angle: "offer-led", layout: "poster-collage", sections: ["hero", "close"], factIds: [] },
    { angle: "offer-led", layout: "offer-led-one-photo", sections: ["hero", "detail", "close"], factIds: ["capacity"] },
    { angle: "offer-led", layout: "offer-led-one-photo", sections: ["close", "hero"], factIds: [] },
    { angle: "offer-led", layout: "offer-led-one-photo", sections: ["hero", "hero-facts", "close"], factIds: ["invented"] },
    { angle: "offer-led", layout: "offer-led-one-photo", sections: ["hero", "hero-facts", "close"], factIds: [] },
    { angle: "invented-angle", layout: "offer-led-one-photo", sections: ["hero", "close"], factIds: [] },
  ];

  for (const candidate of cases) {
    const result = validateGenerationProposal(candidate, request);
    assert.equal(result.ok, false, JSON.stringify(candidate));
  }

  const valid = validateGenerationProposal(
    {
      angle: "offer-led",
      layout: "offer-led-one-photo",
      sections: ["hero", "hero-facts", "close"],
      factIds: ["capacity", "closure"],
    },
    request,
  );
  assert.equal(valid.ok, true);
});

test("template slots enforce approved facts and length limits", () => {
  const fixture = CAMPAIGN_FIXTURES.sparse;
  const values = createFormValues(fixture);
  const preview = buildCampaignPreview(fixture, values);
  assert.equal(preview.ok, true);
  if (!preview.ok) return;

  const overlong = {
    ...preview.preview.draft,
    headline: "x".repeat(SINGLE_PRODUCT_OFFER_TEMPLATE.limits.headline + 1),
  };
  assert.ok(
    validateTemplateDraft(preview.preview.brief, overlong).some((issue) => issue.slot === "headline"),
  );

  const unapprovedFact = {
    ...preview.preview.draft,
    facts: [
      {
        id: "invented",
        label: "Proof",
        value: "Best seller",
        source: {
          document: "None",
          quote: "Not approved.",
          reviewedBy: "",
          reviewedOn: "",
        },
      },
    ],
  };
  assert.ok(
    validateTemplateDraft(preview.preview.brief, unapprovedFact).some((issue) => issue.slot === "facts"),
  );
});

test("story-led is only available when approved story copy exists", () => {
  assert.deepEqual(getAllowedAngles(CAMPAIGN_FIXTURES.sparse.brief), ["offer-led", "product-led"]);
  assert.deepEqual(getAllowedAngles(CAMPAIGN_FIXTURES["long-copy"].brief), [
    "offer-led",
    "product-led",
    "story-led",
  ]);
});

test("explicit profile choices constrain generation angles and legacy angle stays broad", () => {
  const brief = CAMPAIGN_FIXTURES.sparse.brief;
  assert.deepEqual(
    getAllowedAngles(brief, { headlineMode: "product-led" }),
    ["product-led"],
  );
  assert.deepEqual(
    getAllowedAngles(brief, { headlineMode: "offer-led" }),
    ["offer-led"],
  );
  assert.deepEqual(
    getAllowedAngles(brief, { headlineMode: "angle" }),
    ["offer-led", "product-led"],
  );

  const storyBrief = CAMPAIGN_FIXTURES["long-copy"].brief;
  assert.deepEqual(
    getAllowedAngles(storyBrief, { headlineMode: "product-led" }),
    ["product-led"],
  );
  assert.deepEqual(
    getAllowedAngles(storyBrief, { headlineMode: "angle" }),
    ["offer-led", "product-led", "story-led"],
  );
});

test("paid provider configuration is explicit and bounded", () => {
  const unconfigured = resolveGenerationProvider({
    CAMPAIGN_LAB_GENERATION_PROVIDER: "openai",
  });
  assert.equal(unconfigured.ok, false);
  if (unconfigured.ok) return;
  assert.match(unconfigured.reason, /CAMPAIGN_LAB_GENERATION_LIVE=true/);
  assert.match(unconfigured.reason, /OPENAI_ENABLED=true/);
  assert.match(unconfigured.reason, /OPENAI_API_KEY/);

  const configured = resolveGenerationProvider({
    CAMPAIGN_LAB_GENERATION_PROVIDER: "openai",
    CAMPAIGN_LAB_GENERATION_LIVE: "true",
    OPENAI_ENABLED: "true",
    OPENAI_API_KEY: "local-placeholder",
  });
  assert.equal(configured.ok, true);
  if (configured.ok) assert.equal(configured.id, "openai");

  assert.equal(resolveGenerationTimeoutMs({}), 5000);
  assert.equal(resolveGenerationTimeoutMs({ CAMPAIGN_LAB_GENERATION_TIMEOUT_MS: "1" }), 50);
  assert.equal(resolveGenerationTimeoutMs({ CAMPAIGN_LAB_GENERATION_TIMEOUT_MS: "999999" }), 15000);
});

test("the request gate prevents an older response from replacing newer work", () => {
  const gate = new GenerationRequestGate();
  const first = gate.begin();
  const second = gate.begin();
  assert.equal(gate.isCurrent(first), false);
  assert.equal(gate.isCurrent(second), true);
  gate.invalidate();
  assert.equal(gate.isCurrent(second), false);
});

test("an approved opening focus changes the story and survives provider fallback", async () => {
  const fixtureId = "long-copy";
  const values = createFormValues(CAMPAIGN_FIXTURES[fixtureId]);
  const firstPourValues = { ...values, openingFocus: "first-pour" };
  const original = await runCampaignGeneration({ fixtureId, values }, { env: env() });
  const changed = await runCampaignGeneration(
    { fixtureId, values: firstPourValues }, { env: env() },
  );
  assert.equal(original.ok, true);
  assert.equal(changed.ok, true);
  if (!original.ok || !changed.ok) return;
  assert.equal(changed.generation.status, "generated");
  assert.match(original.preview.draft.headline, /rib spacing/i);
  assert.match(changed.preview.draft.headline, /slower first pour/i);
  assert.notEqual(changed.preview.draft.lede, original.preview.draft.lede);
  assert.equal(changed.preview.brief.offer, original.preview.brief.offer);
  assert.equal(changed.preview.brief.destinationUrl, original.preview.brief.destinationUrl);
  assert.deepEqual(changed.preview.asset, original.preview.asset);
  assert.notEqual(changed.preview.revision, original.preview.revision);

  const fallback = await runCampaignGeneration(
    { fixtureId, values: firstPourValues },
    { provider: stubProvider({ angle: "offer-led", layout: "editorial-long-copy", sections: ["hero", "close"], factIds: [] }) },
  );
  assert.equal(fallback.ok, true);
  if (fallback.ok) {
    assert.equal(fallback.generation.status, "fallback");
    assert.equal(fallback.preview.draft.headline, changed.preview.draft.headline);
  }

  const unknown = await runCampaignGeneration(
    { fixtureId, values: { ...values, openingFocus: "invented" } }, { env: env() },
  );
  assert.deepEqual(unknown, {
    ok: false,
    issues: [{ field: "openingFocus", message: "Choose an approved opening for this campaign." }],
  });
});
