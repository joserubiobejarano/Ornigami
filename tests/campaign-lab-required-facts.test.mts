import assert from "node:assert/strict";
import test from "node:test";

import {
  BASE_CATALOG,
  CAMPAIGN_FIXTURES,
} from "../src/lib/campaign-lab/fixtures.ts";
import { runCampaignGeneration } from "../src/lib/campaign-lab/generation/service.ts";
import type { GenerationRequest } from "../src/lib/campaign-lab/generation/types.ts";
import { validateGenerationProposal } from "../src/lib/campaign-lab/generation/validate.ts";
import {
  SINGLE_PRODUCT_OFFER_TEMPLATE,
  assembleDraft,
  buildCampaignPreview,
  layoutFactCapacity,
  selectLayoutForRequiredFacts,
  validateBriefFactGroups,
  validateTemplateDraft,
} from "../src/lib/campaign-lab/template.ts";
import type {
  CampaignCatalog,
  CampaignFixture,
  ProductFact,
  RequiredFactGroup,
  TemplateManifest,
} from "../src/lib/campaign-lab/types.ts";

const source = (document: string, quote: string) => ({
  document,
  quote,
  reviewedBy: "Required-group test review",
  reviewedOn: "2026-11-15",
});

const facts: ProductFact[] = [
  { id: "contents", label: "Contents", value: "3 items", source: source("Pack front", "3 ITEMS") },
  { id: "mask-a", label: "Item A", value: "Item A", source: source("Item A pack", "ITEM A") },
  { id: "mask-b", label: "Item B", value: "Item B", source: source("Item B pack", "ITEM B") },
  { id: "mask-c", label: "Item C", value: "Item C", source: source("Item C pack", "ITEM C") },
  { id: "skin-types", label: "Skin types", value: "For all skin types", source: source("Pack front", "For all skin types") },
];

const completeSet: RequiredFactGroup = {
  id: "complete-set",
  label: "the complete set",
  factIds: ["mask-a", "mask-b", "mask-c"],
};

function catalogWith(fixture: CampaignFixture): CampaignCatalog {
  return {
    ...BASE_CATALOG,
    fixtures: { ...BASE_CATALOG.fixtures, [fixture.id]: fixture },
  };
}

function fixtureWithGroup(group: RequiredFactGroup = completeSet): CampaignFixture {
  return {
    id: "sparse",
    label: "Synthetic required group",
    description: "Synthetic required-fact fixture.",
    assetId: "harbor-field-bottle-front",
    brief: {
      fixtureId: "sparse",
      brandId: "harbor-field",
      productName: "Synthetic set",
      offer: "20% off the synthetic set",
      destinationUrl: "https://example.com/synthetic-set",
      assetId: "harbor-field-bottle-front",
      actionLabel: "Shop the set",
      productNoun: "set",
      productFacts: facts,
      requiredFactGroups: [group],
      copy: {
        headline: "Three items. One set.",
        lede: "The set brings together three individually packed items.",
      },
    },
  };
}

function valuesFor(fixture: CampaignFixture) {
  return {
    brandId: fixture.brief.brandId,
    accent: "#9a3f25",
    productName: fixture.brief.productName,
    offer: fixture.brief.offer,
    destinationUrl: fixture.brief.destinationUrl,
    assetId: fixture.assetId,
  };
}

function requestFor(): GenerationRequest {
  return {
    template: {
      id: SINGLE_PRODUCT_OFFER_TEMPLATE.id,
      version: SINGLE_PRODUCT_OFFER_TEMPLATE.version,
    },
    brand: { id: "harbor-field", name: "Harbor Field" },
    campaign: {
      fixtureId: "sparse",
      openingFocus: null,
      productName: "Synthetic set",
      productNoun: "set",
      offer: "20% off the synthetic set",
      lede: "The set brings together three individually packed items.",
      storyHeadline: "Three items. One set.",
      facts,
    },
    allowed: {
      angles: ["offer-led", "product-led", "story-led"],
      layouts: ["offer-led-one-photo", "editorial-long-copy"],
      sectionOrders: {
        "offer-led-one-photo": [["hero", "hero-facts", "close"], ["hero", "close"]],
        "editorial-long-copy": [["hero", "detail", "close"], ["hero", "close"]],
      },
      layoutFactCapacity: {
        "offer-led-one-photo": 2,
        "editorial-long-copy": 3,
      },
      factIds: facts.map((fact) => fact.id),
      maxFacts: 3,
      requiredFactGroups: [completeSet],
    },
    limits: { headline: 180, lede: 240, factValue: 80 },
  };
}

test("briefs without fact groups keep their existing deterministic fact output", () => {
  const sparse = assembleDraft(CAMPAIGN_FIXTURES.sparse.brief, "harbor-field");
  const longCopy = assembleDraft(CAMPAIGN_FIXTURES["long-copy"].brief, "morrow-ceramic");
  assert.equal(CAMPAIGN_FIXTURES.sparse.brief.requiredFactGroups, undefined);
  assert.equal(CAMPAIGN_FIXTURES["long-copy"].brief.requiredFactGroups, undefined);
  assert.deepEqual(sparse.facts.map((fact) => fact.id), ["capacity", "closure", "material"]);
  assert.deepEqual(longCopy.facts.map((fact) => fact.id), ["interior", "outlet", "body"]);
});

test("deterministic assembly includes every required fact and may omit optional facts", () => {
  const fixture = fixtureWithGroup();
  const catalog = catalogWith(fixture);
  const preview = buildCampaignPreview(fixture, valuesFor(fixture), catalog);
  assert.equal(preview.ok, true);
  if (!preview.ok) return;

  const ids = preview.preview.draft.facts.map((fact) => fact.id);
  assert.deepEqual(ids, ["mask-a", "mask-b", "mask-c"]);
  assert.equal(ids.includes("contents"), false);
  assert.equal(ids.includes("skin-types"), false);
  assert.equal(preview.preview.draft.layout, "offer-led-one-photo");
  assert.deepEqual(validateTemplateDraft(fixture.brief, preview.preview.draft), []);
});

test("the generator cannot return an incomplete required group", async () => {
  const fixture = fixtureWithGroup();
  const catalog = catalogWith(fixture);
  const result = await runCampaignGeneration(
    { fixtureId: "sparse", values: valuesFor(fixture) },
    {
      catalog,
      env: {
        CAMPAIGN_LAB_GENERATION_PROVIDER: "local-test",
        CAMPAIGN_LAB_GENERATION_TEST_MODE: "incomplete",
        CAMPAIGN_LAB_GENERATION_TIMEOUT_MS: "500",
      },
    },
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.generation.status, "fallback");
  assert.equal(result.generation.code, "invalid");
  assert.match(result.generation.issues?.join(" ") ?? "", /Required fact group "the complete set" is incomplete/);
  assert.deepEqual(
    result.preview.draft.facts.map((fact) => fact.id),
    ["mask-a", "mask-b", "mask-c"],
  );
  assert.equal(result.preview.brief.offer, fixture.brief.offer);
  assert.equal(result.preview.brief.destinationUrl, fixture.brief.destinationUrl);
  assert.equal(result.preview.asset.id, fixture.assetId);
});

test("normal generation includes the full required group", async () => {
  const fixture = fixtureWithGroup();
  const catalog = catalogWith(fixture);
  const result = await runCampaignGeneration(
    { fixtureId: "sparse", values: valuesFor(fixture) },
    {
      catalog,
      env: {
        CAMPAIGN_LAB_GENERATION_PROVIDER: "local-test",
        CAMPAIGN_LAB_GENERATION_TEST_MODE: "success",
        CAMPAIGN_LAB_GENERATION_TIMEOUT_MS: "500",
      },
    },
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.generation.status, "generated");
  assert.deepEqual(result.generation.factIds, ["mask-a", "mask-b", "mask-c"]);
  assert.deepEqual(
    result.preview.draft.facts.map((fact) => fact.id),
    ["mask-a", "mask-b", "mask-c"],
  );
});

test("a required group larger than every layout capacity returns a clear validation error", () => {
  const tooLarge: RequiredFactGroup = {
    ...completeSet,
    id: "four-items",
    label: "the four items",
    factIds: ["mask-a", "mask-b", "mask-c", "contents"],
  };
  const fixture = fixtureWithGroup(tooLarge);
  const catalog = catalogWith(fixture);
  const preview = buildCampaignPreview(fixture, valuesFor(fixture), catalog);
  assert.equal(preview.ok, false);
  if (preview.ok) return;
  assert.match(preview.issues[0]?.message ?? "", /no supported layout accepts more than 3/);

  const draft = assembleDraft(fixture.brief, fixture.brief.brandId, catalog);
  const draftIssues = validateTemplateDraft(fixture.brief, draft);
  assert.ok(draftIssues.some((issue) => /accepts at most 3 facts/.test(issue.message)));
});

test("deterministic assembly switches to a supported layout when the preferred one cannot fit", () => {
  const fixture = fixtureWithGroup();
  const catalog = catalogWith(fixture);
  const layout = SINGLE_PRODUCT_OFFER_TEMPLATE.layouts["offer-led-one-photo"];
  const original = layout.maxFacts;
  try {
    layout.maxFacts = 2;
    const draft = assembleDraft(fixture.brief, fixture.brief.brandId, catalog);
    assert.equal(draft.layout, "editorial-long-copy");
    assert.match(draft.layoutReason, /required facts need more room/);
    assert.deepEqual(
      draft.facts.map((fact) => fact.id),
      ["mask-a", "mask-b", "mask-c"],
    );
    assert.deepEqual(validateTemplateDraft(fixture.brief, draft), []);
  } finally {
    layout.maxFacts = original;
  }
});

test("layout capacity selects a supported layout that can hold the required group", () => {
  const manifest = JSON.parse(JSON.stringify(SINGLE_PRODUCT_OFFER_TEMPLATE)) as TemplateManifest;
  manifest.layouts["offer-led-one-photo"].maxFacts = 2;
  manifest.layouts["editorial-long-copy"].maxFacts = 3;

  assert.equal(layoutFactCapacity("offer-led-one-photo", manifest), 2);
  assert.equal(layoutFactCapacity("editorial-long-copy", manifest), 3);

  const switched = selectLayoutForRequiredFacts("offer-led-one-photo", 3, manifest);
  assert.deepEqual(switched, {
    layout: "editorial-long-copy",
    switched: true,
    fits: true,
  });

  const none = selectLayoutForRequiredFacts("offer-led-one-photo", 4, manifest);
  assert.equal(none.layout, "offer-led-one-photo");
  assert.equal(none.fits, false);
});

test("provider validation rejects a layout that cannot hold the selected facts", () => {
  const result = validateGenerationProposal(
    {
      angle: "offer-led",
      layout: "offer-led-one-photo",
      sections: ["hero", "hero-facts", "close"],
      factIds: ["mask-a", "mask-b", "mask-c"],
    },
    requestFor(),
  );
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.issues.join(" "), /accepts at most 2 facts/);
});

test("required fact groups reject unapproved or duplicate declarations", () => {
  const fixture = fixtureWithGroup({
    id: "invalid",
    label: "invalid group",
    factIds: ["mask-a", "mask-a", "invented"],
  });
  const issues = validateBriefFactGroups(fixture.brief);
  assert.ok(issues.some((issue) => /repeats fact/.test(issue)));
  assert.ok(issues.some((issue) => /unapproved fact/.test(issue)));
  assert.equal(fixture.brief.requiredFactGroups?.[0]?.id, "invalid");
});
