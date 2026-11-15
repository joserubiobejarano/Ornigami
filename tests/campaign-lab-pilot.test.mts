import assert from "node:assert/strict";
import test from "node:test";

import {
  BASE_CATALOG,
  createCatalog,
  getAsset,
  getBrand,
  isBrandId,
  isFixtureId,
  resolveBrandTheme,
} from "../src/lib/campaign-lab/fixtures.ts";
import { runCampaignGeneration } from "../src/lib/campaign-lab/generation/service.ts";
import { buildCampaignPreview } from "../src/lib/campaign-lab/template.ts";
import type {
  CampaignFixture,
  PilotBundle,
  ProductFact,
} from "../src/lib/campaign-lab/types.ts";

const sources = {
  contents: {
    document: "Momisa Glow Box front",
    quote: "3 SHEET MASKS / For all skin types",
    reviewedBy: "Ornigami pilot review",
    reviewedOn: "2026-11-15",
  },
  vitaminC: {
    document: "Momisa Vitamin C pouch",
    quote: "VITAMIN C Sheet Mask",
    reviewedBy: "Ornigami pilot review",
    reviewedOn: "2026-11-15",
  },
  collagen: {
    document: "Momisa Deep Collagen pouch",
    quote: "DEEP COLLAGEN Sheet Mask",
    reviewedBy: "Ornigami pilot review",
    reviewedOn: "2026-11-15",
  },
  hyaluronic: {
    document: "Momisa Hyaluronic Acid pouch",
    quote: "HYALURONIC ACID Sheet Mask",
    reviewedBy: "Ornigami pilot review",
    reviewedOn: "2026-11-15",
  },
  skinTypes: {
    document: "Momisa Glow Box front",
    quote: "For all skin types",
    reviewedBy: "Ornigami pilot review",
    reviewedOn: "2026-11-15",
  },
} as const;

const facts: ProductFact[] = [
  { id: "contents", label: "Contents", value: "3 sheet masks", source: sources.contents },
  { id: "vitamin-c", label: "Vitamin C", value: "Vitamin C sheet mask", source: sources.vitaminC },
  { id: "deep-collagen", label: "Deep Collagen", value: "Deep Collagen sheet mask", source: sources.collagen },
  { id: "hyaluronic-acid", label: "Hyaluronic Acid", value: "Hyaluronic Acid sheet mask", source: sources.hyaluronic },
  { id: "skin-types", label: "Skin types", value: "For all skin types", source: sources.skinTypes },
];

const maskNight = {
  headline: "Your mask night, sorted.",
  lede: "Meet the Momisa Glow Box: three sheet masks in one little box.",
};
const threeMasks = {
  headline: "Three masks. One Glow Box.",
  lede: "The Glow Box brings together Vitamin C, Deep Collagen and Hyaluronic Acid sheet masks.",
};

function pilotBundle(): PilotBundle {
  const baseAsset = BASE_CATALOG.assets[0];
  const fixture: CampaignFixture = {
    id: "momisa-glow-box",
    label: "Momisa Glow Box",
    description: "Synthetic Momisa pilot fixture for catalog tests.",
    assetId: "momisa-glow-box-front",
    openings: [
      { id: "mask-night", label: "Your mask night, sorted.", copy: maskNight },
      { id: "three-masks", label: "Three masks, one box", copy: threeMasks },
    ],
    brief: {
      fixtureId: "momisa-glow-box",
      brandId: "momisa",
      productName: "Momisa Glow Box",
      offer: "30% off the Momisa Glow Box for Black Friday",
      destinationUrl: "https://www.amazon.com/s?k=Momisa+Glow+Box+sheet+masks",
      assetId: "momisa-glow-box-front",
      actionLabel: "Shop on Amazon",
      productNoun: "Glow Box",
      productFacts: facts,
      copy: maskNight,
    },
  };
  return {
    pilot: {
      id: "momisa",
      label: "Momisa Glow Box",
      status: "preview",
      note: "Preview inputs: offer and destination are unconfirmed.",
    },
    brand: {
      ...BASE_CATALOG.brands["harbor-field"],
      id: "momisa",
      name: "Momisa",
      wordmark: "momisa",
      descriptor: "Warm editorial",
      headlineMode: "angle",
      detailTitle: "Three masks for three nights in.",
      tokens: {
        ...BASE_CATALOG.brands["harbor-field"].tokens,
        page: "#fffaf2",
        surface: "#f3e7d9",
        ink: "#2b211f",
        accent: "#725139",
        accentInk: "#fffaf2",
        displayFont: "Georgia, serif",
        displayWeight: 400,
        displayTracking: "-0.045em",
        imageRadius: "48% 48% 4px 4px",
        buttonRadius: "999px",
        heroImage: "arch",
        heroOrder: "headline-first",
        prefersEditorial: true,
        detailBackground: "#f3e7d9",
        detailInk: "#2b211f",
        imageBlend: "multiply",
        showWordmarkMark: false,
      },
    },
    fixture,
    assets: [
      {
        ...baseAsset,
        id: "momisa-glow-box-front",
        brandId: "momisa",
        src: "/campaign-lab-pilots/momisa/momisa-glow-box-front.jpg",
        alt: "Momisa Glow Box in peach packaging, printed with three sheet-mask names.",
        contentHash: "a".repeat(64),
        crop: "4:5 portrait, centered; keeps the packshot visible.",
      },
    ],
  };
}

test("a local pilot merges into the base catalog without changing the base fixtures", () => {
  const catalog = createCatalog(pilotBundle());
  assert.equal(isFixtureId("momisa-glow-box"), false);
  assert.equal(isFixtureId("momisa-glow-box", catalog), true);
  assert.equal(isBrandId("momisa"), false);
  assert.equal(isBrandId("momisa", catalog), true);
  assert.equal(getBrand("momisa", catalog).wordmark, "momisa");
  assert.equal(getAsset("momisa-glow-box-front", catalog)?.alt.includes("Momisa Glow Box"), true);
  assert.equal(getAsset("harbor-field-bottle-front", catalog)?.id, "harbor-field-bottle-front");
  assert.equal(resolveBrandTheme("momisa", undefined, catalog).tokens.heroImage, "arch");
  assert.equal(catalog.pilot?.status, "preview");
  assert.equal(BASE_CATALOG.fixtures["sparse"].brief.brandId, "harbor-field");
});

test("the pilot fixture renders with the approved opening and fixed campaign inputs", async () => {
  const catalog = createCatalog(pilotBundle());
  const fixture = catalog.fixtures["momisa-glow-box"];
  const values = {
    brandId: "momisa" as const,
    accent: "#725139",
    productName: fixture.brief.productName,
    offer: fixture.brief.offer,
    destinationUrl: fixture.brief.destinationUrl,
    assetId: fixture.assetId,
    openingFocus: "mask-night",
  };

  const preview = buildCampaignPreview(fixture, values, catalog);
  assert.equal(preview.ok, true);
  if (!preview.ok) return;
  assert.equal(preview.preview.draft.headline, maskNight.headline);
  assert.equal(preview.preview.brief.offer, fixture.brief.offer);
  assert.equal(preview.preview.asset.id, "momisa-glow-box-front");
  assert.equal(preview.preview.theme.brand.id, "momisa");

  const generated = await runCampaignGeneration(
    { fixtureId: "momisa-glow-box", values },
    {
      env: {
        CAMPAIGN_LAB_GENERATION_PROVIDER: "local-test",
        CAMPAIGN_LAB_GENERATION_TEST_MODE: "success",
        CAMPAIGN_LAB_GENERATION_TIMEOUT_MS: "500",
      },
      catalog,
    },
  );
  assert.equal(generated.ok, true);
  if (!generated.ok) return;
  assert.equal(generated.generation.status, "generated");
  assert.equal(generated.generation.angle, "story-led");
  assert.deepEqual(generated.generation.factIds, ["contents", "skin-types", "hyaluronic-acid"]);
  assert.equal(generated.preview.draft.headline, maskNight.headline);
  assert.equal(generated.preview.brief.offer, fixture.brief.offer);
  assert.equal(generated.preview.brief.destinationUrl, fixture.brief.destinationUrl);
});

test("a rejected pilot proposal keeps the fixed campaign inputs in the deterministic fallback", async () => {
  const catalog = createCatalog(pilotBundle());
  const fixture = catalog.fixtures["momisa-glow-box"];
  const values = {
    brandId: "momisa" as const,
    accent: "#725139",
    productName: fixture.brief.productName,
    offer: fixture.brief.offer,
    destinationUrl: fixture.brief.destinationUrl,
    assetId: fixture.assetId,
    openingFocus: "mask-night",
  };
  const result = await runCampaignGeneration(
    { fixtureId: "momisa-glow-box", values },
    {
      env: {
        CAMPAIGN_LAB_GENERATION_PROVIDER: "local-test",
        CAMPAIGN_LAB_GENERATION_TEST_MODE: "invalid",
        CAMPAIGN_LAB_GENERATION_TIMEOUT_MS: "500",
      },
      catalog,
    },
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.generation.status, "fallback");
  assert.equal(result.generation.code, "invalid");
  assert.equal(result.preview.brief.offer, fixture.brief.offer);
  assert.equal(result.preview.brief.destinationUrl, fixture.brief.destinationUrl);
  assert.equal(result.preview.asset.id, "momisa-glow-box-front");
  assert.equal(result.preview.draft.headline, maskNight.headline);
});

test("changing the approved opening changes the story and evidence emphasis but not the fixed inputs", async () => {
  const catalog = createCatalog(pilotBundle());
  const fixture = catalog.fixtures["momisa-glow-box"];
  const base = {
    brandId: "momisa" as const,
    accent: "#725139",
    productName: fixture.brief.productName,
    offer: fixture.brief.offer,
    destinationUrl: fixture.brief.destinationUrl,
    assetId: fixture.assetId,
    openingFocus: "mask-night",
  };
  const env = {
    CAMPAIGN_LAB_GENERATION_PROVIDER: "local-test",
    CAMPAIGN_LAB_GENERATION_TEST_MODE: "success",
    CAMPAIGN_LAB_GENERATION_TIMEOUT_MS: "500",
  };
  const first = await runCampaignGeneration(
    { fixtureId: "momisa-glow-box", values: base },
    { env, catalog },
  );
  const second = await runCampaignGeneration(
    { fixtureId: "momisa-glow-box", values: { ...base, openingFocus: "three-masks" } },
    { env, catalog },
  );
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  if (!first.ok || !second.ok) return;

  assert.equal(first.preview.draft.headline, maskNight.headline);
  assert.equal(second.preview.draft.headline, threeMasks.headline);
  assert.notDeepEqual(first.generation.factIds, second.generation.factIds);
  assert.equal(first.preview.brief.offer, second.preview.brief.offer);
  assert.equal(first.preview.brief.destinationUrl, second.preview.brief.destinationUrl);
  assert.equal(first.preview.asset.id, second.preview.asset.id);
  assert.notEqual(first.preview.revision, second.preview.revision);
});
