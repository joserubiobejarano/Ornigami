import assert from "node:assert/strict";
import test from "node:test";

import {
  MOMISA_ALTERNATIVE_TOKENS,
  MOMISA_REFERENCE_TOKENS,
  buildMomisaDirectionPreviews,
  type MomisaDirectionInput,
} from "../src/lib/campaign-lab/directions/momisa-direction.ts";
import { calculateDraftRevision } from "../src/lib/campaign-lab/template.ts";

const TEST_BRIEF: MomisaDirectionInput = {
  schemaVersion: 1,
  source: {
    commit: "test-source",
    approvedExportRevision: "test-revision",
    exportedAt: "2026-11-17T00:00:00.000Z",
    approvalScope: "local-preview",
    exportPath: ".local/test-bundle",
  },
  brandName: "Example Brand",
  productName: "Example Glow Box",
  offer: "20% off, $9.99",
  destinationUrl: "https://example.com/offer",
  actionLabel: "Shop now",
  productNoun: "box",
  facts: [
    {
      id: "contents",
      label: "Contents",
      value: "2 sheet masks",
      sourceQuote: "Contents: 2 sheet masks",
    },
    {
      id: "skin-types",
      label: "Skin types",
      value: "For all skin types",
      sourceQuote: "Skin types: For all skin types",
    },
  ],
  asset: {
    id: "browser-offer-packshot",
    file: "example.jpg",
    width: 1200,
    height: 1200,
    alt: "Example Glow Box packshot on a white background.",
    sha256:
      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    rights: "Test fixture only.",
  },
  review: {
    reviewedBy: "Test review",
    reviewedOn: "2026-11-17",
  },
};

test("both directions preserve the supplied commercial identity", () => {
  const { reference, alternative } = buildMomisaDirectionPreviews(TEST_BRIEF);

  for (const preview of [reference, alternative]) {
    assert.equal(preview.brief.productName, TEST_BRIEF.productName);
    assert.equal(preview.brief.offer, TEST_BRIEF.offer);
    assert.equal(preview.brief.destinationUrl, TEST_BRIEF.destinationUrl);
    assert.equal(preview.brief.actionLabel, TEST_BRIEF.actionLabel);
    assert.deepEqual(
      preview.draft.facts.map((fact) => [fact.id, fact.label, fact.value]),
      TEST_BRIEF.facts.map((fact) => [fact.id, fact.label, fact.value]),
    );
    assert.equal(preview.asset.id, "browser-offer-packshot");
    assert.equal(preview.asset.contentHash, TEST_BRIEF.asset.sha256);
    assert.equal(preview.asset.alt, TEST_BRIEF.asset.alt);
    assert.equal(preview.asset.width, 1200);
    assert.equal(preview.asset.height, 1200);
    assert.equal(preview.draft.headline, "Example Glow Box");
    assert.equal(preview.brief.copy.hideLede, true);
    assert.ok(preview.brief.copy.lede.trim());
    assert.ok(preview.draft.sections.includes("hero-facts"));
  }
});

test("the reference tokens reproduce the approved local export", () => {
  assert.equal(MOMISA_REFERENCE_TOKENS.page, "#f6f3ec");
  assert.equal(MOMISA_REFERENCE_TOKENS.surface, "#e8e2d6");
  assert.equal(MOMISA_REFERENCE_TOKENS.ink, "#1f2a24");
  assert.equal(MOMISA_REFERENCE_TOKENS.accent, "#2f5d4a");
  assert.equal(MOMISA_REFERENCE_TOKENS.accentInk, "#fffaf1");
  assert.equal(MOMISA_REFERENCE_TOKENS.displayWeight, 700);
  assert.equal(MOMISA_REFERENCE_TOKENS.heroOrder, "product-first");
  assert.equal(MOMISA_REFERENCE_TOKENS.heroImage, "framed");
  assert.equal(MOMISA_REFERENCE_TOKENS.imageRadius, "12px");
  assert.equal(MOMISA_REFERENCE_TOKENS.buttonRadius, "999px");
  assert.equal(MOMISA_REFERENCE_TOKENS.imageBlend, "normal");
  assert.equal(MOMISA_REFERENCE_TOKENS.offerStyle, undefined);
});

test("the alternative uses the Taste-dealt brand character and an editorial offer", () => {
  assert.equal(MOMISA_ALTERNATIVE_TOKENS.page, "#f6e3cf");
  assert.equal(MOMISA_ALTERNATIVE_TOKENS.ink, "#24362a");
  assert.equal(MOMISA_ALTERNATIVE_TOKENS.accent, "#2f5d4a");
  assert.equal(MOMISA_ALTERNATIVE_TOKENS.displayWeight, 400);
  assert.equal(MOMISA_ALTERNATIVE_TOKENS.displayTracking, "-0.012em");
  assert.equal(MOMISA_ALTERNATIVE_TOKENS.labelCase, "none");
  assert.equal(MOMISA_ALTERNATIVE_TOKENS.heroOrder, "headline-first");
  assert.equal(MOMISA_ALTERNATIVE_TOKENS.imageRadius, "0px");
  assert.equal(MOMISA_ALTERNATIVE_TOKENS.buttonRadius, "2px");
  assert.equal(MOMISA_ALTERNATIVE_TOKENS.imageBlend, "multiply");
  assert.equal(MOMISA_ALTERNATIVE_TOKENS.offerStyle, "editorial");
});

test("the direction token change participates in the revision", () => {
  const { reference } = buildMomisaDirectionPreviews(TEST_BRIEF);
  const tintRevision = calculateDraftRevision(
    reference.brief,
    reference.draft,
    reference.asset,
    reference.theme,
  );
  const editorialRevision = calculateDraftRevision(
    reference.brief,
    reference.draft,
    reference.asset,
    {
      ...reference.theme,
      tokens: { ...reference.theme.tokens, offerStyle: "editorial" },
    },
  );

  assert.equal(tintRevision, reference.revision);
  assert.notEqual(editorialRevision, tintRevision);
});
