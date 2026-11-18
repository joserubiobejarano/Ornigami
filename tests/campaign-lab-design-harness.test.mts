import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  BASE_CATALOG,
  CAMPAIGN_FIXTURES,
  createFormValues,
  getAsset,
} from "../src/lib/campaign-lab/fixtures.ts";
import {
  buildRuntimeGuidance,
  DESIGN_GUIDANCE_PACK_VERSION,
  DESIGN_HARNESS_VERSION,
} from "../src/lib/campaign-lab/generation/guidance/pack.ts";
import { buildOpenAIMessages } from "../src/lib/campaign-lab/generation/prompt.ts";
import { runCampaignGeneration } from "../src/lib/campaign-lab/generation/service.ts";
import type {
  CampaignGenerationProvider,
  GenerationRequest,
} from "../src/lib/campaign-lab/generation/types.ts";
import {
  buildBrowserOfferCatalog,
} from "../src/lib/campaign-lab/browser-offer.ts";
import {
  parsePersistedOfferIntakeBrief,
  parsePreparedOfferIntakeBrief,
  serializePersistedOfferIntakeBrief,
} from "../src/lib/campaign-lab/offer-intake-brief.ts";

const root = path.resolve(import.meta.dirname, "..");

function planFor(request: GenerationRequest) {
  const angle = request.allowed.angles[0];
  const layout =
    angle === "story-led"
      ? request.allowed.layouts.find((item) => item === "editorial-long-copy") ??
        request.allowed.layouts[0]
      : request.allowed.layouts[0];
  const sections = [...request.allowed.sectionOrders[layout][0]];
  const hasFacts = sections.includes("hero-facts") || sections.includes("detail");
  const factIds = hasFacts
    ? request.allowed.factIds.slice(
        0,
        Math.min(
          request.allowed.maxFacts,
          request.allowed.layoutFactCapacity[layout],
        ),
      )
    : [];
  return { angle, layout, sections, factIds };
}

function captureProvider() {
  const requests: GenerationRequest[] = [];
  const provider: CampaignGenerationProvider = {
    id: "capture-model",
    label: "Capture model",
    model: "synthetic-capture",
    async generate(request) {
      requests.push(request);
      return planFor(request);
    },
  };
  return { provider, requests };
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory()
      ? sourceFiles(full)
      : /\.(?:ts|tsx)$/.test(name)
        ? [full]
        : [];
  });
}

test("two synthetic briefs carry distinct audience, objective, brand, asset, template and evidence context", async () => {
  for (const fixtureId of ["sparse", "long-copy"] as const) {
    const fixture = CAMPAIGN_FIXTURES[fixtureId];
    const values = createFormValues(fixture);
    const { provider, requests } = captureProvider();
    const result = await runCampaignGeneration(
      { fixtureId, values },
      { provider },
    );

    assert.equal(result.ok, true, fixtureId);
    if (!result.ok) continue;
    assert.equal(result.generation.status, "generated", fixtureId);
    assert.equal(result.generation.providerMode, "model", fixtureId);
    assert.equal(result.generation.harnessVersion, DESIGN_HARNESS_VERSION);
    assert.equal(
      result.generation.guidancePackVersion,
      DESIGN_GUIDANCE_PACK_VERSION,
    );

    assert.equal(requests.length, 1, fixtureId);
    const request = requests[0];
    assert.equal(request.campaign.audience, fixture.brief.audience);
    assert.equal(request.campaign.objective, fixture.brief.objective);
    assert.match(request.campaign.audience ?? "", /paid social|pour-over/i);
    assert.match(request.campaign.objective ?? "", /marketplace|rib design/i);

    const brand = BASE_CATALOG.brands[fixture.brief.brandId];
    assert.equal(request.brand.character.descriptor, brand.descriptor);
    assert.equal(request.brand.character.headlineMode, brand.headlineMode);
    assert.equal(request.brand.tokens.accent, values.accent);
    assert.equal(request.brand.tokens.displayFont, brand.tokens.displayFont);

    const asset = getAsset(values.assetId);
    assert.ok(asset);
    assert.equal(request.assets.selected.id, asset.id);
    assert.equal(request.assets.selected.role, asset.role);
    assert.equal(request.assets.selected.width, asset.width);
    assert.equal(request.assets.selected.height, asset.height);
    assert.ok(request.assets.approved.some((item) => item.id === asset.id));
    assert.deepEqual(request.assets.allowedRoles, ["product-hero"]);

    assert.equal(request.template.id, "single-product-offer");
    assert.equal(request.template.version, "1.0.0");
    assert.deepEqual(Object.keys(request.template.capabilities.layouts), [
      "offer-led-one-photo",
      "editorial-long-copy",
    ]);
    assert.equal(request.template.constraints.limits.maxFacts, 3);
    assert.equal(request.campaign.facts[0].source.quote.length > 0, true);

    assert.equal(request.guidance.pack.version, DESIGN_GUIDANCE_PACK_VERSION);
    assert.equal(request.guidance.hard.owner, "ornigami");
    assert.equal(request.guidance.advisory.owner, "adapted-taste-skill");
    assert.ok(
      request.guidance.hard.rules.some((rule) =>
        /Choose angle from/.test(rule),
      ),
    );
    assert.ok(
      request.guidance.advisory.rules.some((rule) =>
        /product image/i.test(rule),
      ),
    );
    assert.ok(
      request.guidance.sources.some(
        (source) =>
          source.id === "taste-skill" &&
          source.license === "MIT" &&
          source.version === "2.5.1",
      ),
    );

    const messages = buildOpenAIMessages(request);
    const userPrompt = messages.find((message) => message.role === "user")
      ?.content ?? "";
    assert.match(userPrompt, /"audience":/);
    assert.match(userPrompt, /"objective":/);
    assert.match(userPrompt, new RegExp(asset.width.toString()));
    assert.match(userPrompt, /"guidance":/);
    assert.match(userPrompt, new RegExp(DESIGN_GUIDANCE_PACK_VERSION));
    assert.match(userPrompt, /Avoid|Use the audience|product image/i);
    assert.match(messages[0].content, /guidance\.hard/);
  }
});

test("guidance is loaded only for a valid generation attempt", async () => {
  const fixture = CAMPAIGN_FIXTURES.sparse;
  const values = createFormValues(fixture);
  let loads = 0;
  const loader = async (request: Omit<GenerationRequest, "guidance">) => {
    loads += 1;
    return buildRuntimeGuidance(request);
  };

  const invalid = await runCampaignGeneration(
    { fixtureId: "sparse", values: { ...values, offer: "   " } },
    { guidanceLoader: loader },
  );
  assert.equal(invalid.ok, false);
  assert.equal(loads, 0);

  const unavailable = await runCampaignGeneration(
    { fixtureId: "sparse", values },
    {
      env: { CAMPAIGN_LAB_GENERATION_PROVIDER: "off" },
      guidanceLoader: loader,
    },
  );
  assert.equal(unavailable.ok, true);
  if (unavailable.ok) {
    assert.equal(unavailable.generation.status, "fallback");
    assert.equal(unavailable.generation.providerMode, "none");
    assert.equal(unavailable.generation.code, "unavailable");
  }
  assert.equal(loads, 0);

  let generated = 0;
  const provider: CampaignGenerationProvider = {
    id: "local-test",
    label: "Local test provider",
    async generate(request) {
      generated += 1;
      return planFor(request);
    },
  };
  const success = await runCampaignGeneration(
    { fixtureId: "sparse", values },
    { provider, guidanceLoader: loader },
  );
  assert.equal(success.ok, true);
  if (success.ok) assert.equal(success.generation.providerMode, "local-test");
  assert.equal(loads, 1);
  assert.equal(generated, 1);

  let calledWithoutGuidance = 0;
  const rejected = await runCampaignGeneration(
    { fixtureId: "sparse", values },
    {
      provider: {
        ...provider,
        async generate(request) {
          calledWithoutGuidance += 1;
          return planFor(request);
        },
      },
      guidanceLoader: async () => {
        throw new Error("synthetic guidance failure");
      },
    },
  );
  assert.equal(rejected.ok, true);
  if (rejected.ok) {
    assert.equal(rejected.generation.status, "fallback");
    assert.equal(rejected.generation.code, "unavailable");
    assert.match(rejected.generation.message ?? "", /guidance could not be loaded/i);
  }
  assert.equal(calledWithoutGuidance, 0);

  const serviceSource = readFileSync(
    path.join(root, "src/lib/campaign-lab/generation/service.ts"),
    "utf8",
  );
  assert.match(serviceSource, /await import\("\.\/guidance\/pack\.ts"\)/);
  assert.doesNotMatch(
    serviceSource,
    /from\s+["'][^"']*guidance\/pack\.ts["']/,
    "the guidance content must stay a lazy import",
  );
});

test("guidance content is absent from app pages and components", () => {
  for (const directory of ["src/app", "src/components"]) {
    for (const file of sourceFiles(path.join(root, directory))) {
      const source = readFileSync(file, "utf8");
      assert.doesNotMatch(
        source,
        /generation\/guidance\/pack/,
        `${path.relative(root, file)} must not import the guidance pack`,
      );
    }
  }
});

test("the runtime pack uses only Ornigami and reviewed Taste guidance", () => {
  const packSource = readFileSync(
    path.join(root, "src/lib/campaign-lab/generation/guidance/pack.ts"),
    "utf8",
  );
  for (const otherTool of [
    "genjutsu",
    "impeccable",
    "superdesign",
    "better-design",
  ]) {
    assert.doesNotMatch(packSource, new RegExp(otherTool, "i"));
  }
  const guidance = buildRuntimeGuidance({
    harness: {
      version: DESIGN_HARNESS_VERSION,
      guidancePack: {
        id: "ornigami-single-product-offer",
        version: DESIGN_GUIDANCE_PACK_VERSION,
      },
    },
    template: {
      id: "single-product-offer",
      version: "1.0.0",
      name: "Single product offer",
      format: "offer",
      capabilities: {
        layouts: {} as never,
        angles: {} as never,
        profileHeadlineModes: {} as never,
        sections: {} as never,
      },
      constraints: {
        requiredInputs: [],
        allowedAssetRoles: [],
        limits: {
          productName: 90,
          offer: 180,
          headline: 180,
          lede: 240,
          factLabel: 40,
          factValue: 80,
          maxFacts: 3,
        },
      },
    },
    brand: {
      id: "harbor-field",
      name: "Harbor Field",
      wordmark: "Harbor Field",
      character: {
        descriptor: "Warm utility",
        headlineMode: "offer-led",
        detailTitle: "Built for the day.",
      },
      tokens: {} as never,
    },
    campaign: {
      fixtureId: "sparse",
      openingFocus: null,
      audience: "Buyers",
      objective: "Act",
      productName: "Bottle",
      productNoun: "bottle",
      offer: "20% off",
      lede: "Lede",
      storyHeadline: null,
      facts: [],
    },
    assets: {
      selected: {
        id: "asset",
        role: "product-hero",
        width: 1,
        height: 1,
      },
      approved: [],
      allowedRoles: ["product-hero"],
    },
    allowed: {
      angles: ["offer-led"],
      layouts: ["offer-led-one-photo"],
      sectionOrders: { "offer-led-one-photo": [["hero", "close"]], "editorial-long-copy": [] },
      layoutFactCapacity: { "offer-led-one-photo": 3, "editorial-long-copy": 3 },
      factIds: [],
      maxFacts: 3,
      requiredFactGroups: [],
    },
    limits: { headline: 180, lede: 240, factValue: 80 },
  });
  assert.deepEqual(
    guidance.sources.map((source) => source.id),
    ["ornigami-template", "ornigami-design-rules", "taste-skill"],
  );
  const license = readFileSync(
    path.join(
      root,
      "src/lib/campaign-lab/generation/guidance/TASTE-SKILL-LICENSE.txt",
    ),
    "utf8",
  );
  assert.match(license, /MIT License/);
  assert.match(license, /Copyright \(c\) 2026 Leonxlnx/);
});

test("invalid output and timeout recovery keep harness and provider mode metadata", async () => {
  const fixture = CAMPAIGN_FIXTURES.sparse;
  const values = createFormValues(fixture);

  for (const [mode, code] of [
    ["invalid", "invalid"],
    ["timeout", "timeout"],
  ] as const) {
    const result = await runCampaignGeneration(
      { fixtureId: "sparse", values },
      {
        env: {
          CAMPAIGN_LAB_GENERATION_PROVIDER: "local-test",
          CAMPAIGN_LAB_GENERATION_TEST_MODE: mode,
          CAMPAIGN_LAB_GENERATION_TIMEOUT_MS: "50",
        },
      },
    );
    assert.equal(result.ok, true, mode);
    if (!result.ok) continue;
    assert.equal(result.generation.status, "fallback", mode);
    assert.equal(result.generation.code, code, mode);
    assert.equal(result.generation.providerMode, "local-test", mode);
    assert.equal(result.generation.harnessVersion, DESIGN_HARNESS_VERSION);
    assert.equal(
      result.generation.guidancePackVersion,
      DESIGN_GUIDANCE_PACK_VERSION,
    );
    assert.equal(result.preview.brief.offer, values.offer, mode);
    assert.equal(result.preview.brief.destinationUrl, values.destinationUrl, mode);
    assert.equal(result.preview.asset.id, values.assetId, mode);
  }
});

test("a provider cannot supply audience, objective, brand, assets, or guidance", async () => {
  const fixture = CAMPAIGN_FIXTURES.sparse;
  const values = createFormValues(fixture);
  const { provider } = captureProvider();
  const result = await runCampaignGeneration(
    { fixtureId: "sparse", values },
    {
      provider: {
        ...provider,
        async generate(request) {
          return {
            ...planFor(request),
            audience: "A different audience",
            objective: "A different objective",
            brand: { name: "Counterfeit" },
            assets: [],
            guidance: { hard: { rules: [] } },
          };
        },
      },
    },
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.generation.status, "fallback");
  assert.equal(result.generation.code, "invalid");
  assert.match(result.generation.issues?.join(" ") ?? "", /may not set "audience"/);
  assert.equal(result.preview.brief.audience, fixture.brief.audience);
  assert.equal(result.preview.brief.objective, fixture.brief.objective);
  assert.equal(result.preview.theme.brand.name, "Harbor Field");
  assert.equal(result.preview.asset.id, values.assetId);
});

test("prepared and persisted offer briefs carry audience and objective without breaking older payloads", () => {
  const prepared = parsePreparedOfferIntakeBrief(
    JSON.stringify({
      schemaVersion: 1,
      brandName: "Harbor Field",
      productName: "Harbor Field bottle",
      audience: "Commuters who saw a mobile ad.",
      objective: "Send the visitor to the exact offer.",
      offer: "20% off",
      destinationUrl: "https://example.com/harbor-field",
      facts: [
        { label: "Material", value: "Steel" },
        { label: "Capacity", value: "500 ml" },
      ],
      alt: "Bottle.",
      rights: "Local only.",
    }),
  );
  assert.equal(prepared.ok, true);
  if (prepared.ok) {
    assert.equal(prepared.brief.audience, "Commuters who saw a mobile ad.");
    assert.equal(prepared.brief.objective, "Send the visitor to the exact offer.");

    const built = buildBrowserOfferCatalog({
      brandName: prepared.brief.brandName,
      productName: prepared.brief.productName,
      audience: prepared.brief.audience,
      objective: prepared.brief.objective,
      offer: prepared.brief.offer,
      destinationUrl: prepared.brief.destinationUrl,
      facts: prepared.brief.facts,
      packshot: {
        src: "data:image/png;base64,",
        width: 1,
        height: 1,
        alt: prepared.brief.alt,
        rights: prepared.brief.rights,
        contentHash: "",
      },
      reviewedOn: "2026-11-18",
    });
    assert.equal(
      built.fixture.brief.audience,
      "Commuters who saw a mobile ad.",
    );
    assert.equal(
      built.fixture.brief.objective,
      "Send the visitor to the exact offer.",
    );
  }

  const older = parsePreparedOfferIntakeBrief(
    JSON.stringify({
      schemaVersion: 1,
      productName: "Harbor Field bottle",
      offer: "20% off",
      destinationUrl: "https://example.com/harbor-field",
      facts: [
        { label: "Material", value: "Steel" },
        { label: "Capacity", value: "500 ml" },
      ],
      alt: "Bottle.",
      rights: "Local only.",
    }),
  );
  assert.equal(older.ok, true);
  if (older.ok) {
    assert.equal(older.brief.audience, "");
    assert.equal(older.brief.objective, "");
  }

  const serialized = serializePersistedOfferIntakeBrief({
    brandName: "Harbor Field",
    productName: "Harbor Field bottle",
    audience: "Commuters",
    objective: "Direct offer",
    offer: "20% off",
    destinationUrl: "https://example.com/harbor-field",
    facts: [
      { label: "Material", value: "Steel" },
      { label: "Capacity", value: "500 ml" },
    ],
    alt: "Bottle.",
    rights: "Local only.",
  });
  const restored = parsePersistedOfferIntakeBrief(serialized);
  assert.equal(restored?.audience, "Commuters");
  assert.equal(restored?.objective, "Direct offer");
});
