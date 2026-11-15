import assert from "node:assert/strict";
import test from "node:test";

import {
  APPROVED_ASSETS,
  CAMPAIGN_FIXTURES,
  createFormValues,
  getAsset,
  resolveBrandTheme,
} from "../src/lib/campaign-lab/fixtures.ts";
import { isCampaignLabAvailable } from "../src/lib/campaign-lab/availability.ts";
import {
  SINGLE_PRODUCT_OFFER_TEMPLATE,
  assembleDraft,
  buildCampaignPreview,
  buildHeadline,
  getDestinationUrlError,
  validateCampaignForm,
} from "../src/lib/campaign-lab/template.ts";

function sparseValues() {
  return createFormValues(CAMPAIGN_FIXTURES.sparse);
}

function longCopyValues() {
  return createFormValues(CAMPAIGN_FIXTURES["long-copy"]);
}

test("the campaign lab is available only in local development", () => {
  assert.equal(isCampaignLabAvailable("development"), true);
  assert.equal(isCampaignLabAvailable("production"), false);
  assert.equal(isCampaignLabAvailable("test"), false);
  assert.equal(isCampaignLabAvailable(undefined), false);
});

test("the single-product template is versioned and declares its contract", () => {
  assert.equal(SINGLE_PRODUCT_OFFER_TEMPLATE.id, "single-product-offer");
  assert.match(SINGLE_PRODUCT_OFFER_TEMPLATE.version, /^\d+\.\d+\.\d+$/);
  assert.ok(SINGLE_PRODUCT_OFFER_TEMPLATE.requiredInputs.includes("offer"));
  assert.ok(SINGLE_PRODUCT_OFFER_TEMPLATE.requiredInputs.includes("destinationUrl"));
  assert.ok(SINGLE_PRODUCT_OFFER_TEMPLATE.requiredInputs.includes("assetId"));
  assert.deepEqual(SINGLE_PRODUCT_OFFER_TEMPLATE.allowedAssetRoles, ["product-hero"]);
  assert.deepEqual(Object.keys(SINGLE_PRODUCT_OFFER_TEMPLATE.layouts).sort(), [
    "editorial-long-copy",
    "offer-led-one-photo",
  ]);
});

test("the fixtures use two visibly different brands and reviewed assets", () => {
  const sparse = CAMPAIGN_FIXTURES.sparse;
  const longCopy = CAMPAIGN_FIXTURES["long-copy"];

  assert.equal(sparse.brief.brandId, "harbor-field");
  assert.equal(longCopy.brief.brandId, "morrow-ceramic");
  assert.notEqual(sparse.brief.destinationUrl, longCopy.brief.destinationUrl);
  assert.notEqual(sparse.brief.actionLabel, longCopy.brief.actionLabel);

  const harbor = resolveBrandTheme("harbor-field");
  const morrow = resolveBrandTheme("morrow-ceramic");
  assert.notEqual(harbor.tokens.accent, morrow.tokens.accent);
  assert.notEqual(harbor.tokens.displayFont, morrow.tokens.displayFont);
  assert.notEqual(harbor.tokens.heroImage, morrow.tokens.heroImage);
  assert.notEqual(harbor.tokens.buttonRadius, morrow.tokens.buttonRadius);

  for (const asset of APPROVED_ASSETS) {
    assert.equal(asset.reviewed, true);
    assert.ok(asset.alt.length > 20, `${asset.id} needs useful alt text`);
    assert.ok(asset.reviewedBy.length > 0);
    assert.ok(asset.reviewedOn.length > 0);
    assert.ok(asset.source.length > 0);
    assert.ok(asset.rights.length > 0);
    assert.ok(asset.contentHash.length > 0);
  }
});

test("deterministic assembly keeps offer, destination and asset identity as campaign facts", () => {
  for (const fixture of Object.values(CAMPAIGN_FIXTURES)) {
    const values = createFormValues(fixture);
    const first = buildCampaignPreview(fixture, values);
    const second = buildCampaignPreview(fixture, values);
    assert.equal(first.ok, true);
    assert.equal(second.ok, true);
    if (!first.ok || !second.ok) return;

    assert.equal(first.preview.revision, second.preview.revision);
    assert.equal(first.preview.brief.offer, values.offer);
    assert.equal(first.preview.brief.destinationUrl, values.destinationUrl);
    assert.equal(first.preview.brief.assetId, values.assetId);
    assert.equal(first.preview.asset.id, values.assetId);

    const draft = first.preview.draft as unknown as Record<string, unknown>;
    assert.equal("offer" in draft, false);
    assert.equal("destinationUrl" in draft, false);
    assert.equal("assetId" in draft, false);
    assert.equal("brandStyle" in draft, false);

    draft.facts = [{ label: "Changed", value: "Outside the brief" }];
    assert.notEqual(first.preview.brief.productFacts[0]?.label, "Changed");
  }
});

test("the sparse fixture uses the one-photo layout and the long-copy fixture earns the editorial layout", () => {
  const sparse = buildCampaignPreview(CAMPAIGN_FIXTURES.sparse, sparseValues());
  const longCopy = buildCampaignPreview(CAMPAIGN_FIXTURES["long-copy"], longCopyValues());
  assert.equal(sparse.ok, true);
  assert.equal(longCopy.ok, true);
  if (!sparse.ok || !longCopy.ok) return;

  assert.equal(sparse.preview.draft.layout, "offer-led-one-photo");
  assert.equal(longCopy.preview.draft.layout, "editorial-long-copy");
  assert.ok(longCopy.preview.draft.headline.length > 68);
  assert.equal(
    longCopy.preview.draft.templateVersion,
    SINGLE_PRODUCT_OFFER_TEMPLATE.version,
  );
});

test("the layout adapts to a long offer when the short brand no longer fits", () => {
  const values = sparseValues();
  values.offer =
    "A free custom engraving with every travel bottle ordered before the campaign closes";
  const result = buildCampaignPreview(CAMPAIGN_FIXTURES.sparse, values);
  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.ok(result.preview.draft.headline.length > 68);
  assert.equal(result.preview.draft.layout, "editorial-long-copy");
  assert.equal(
    result.preview.draft.headline,
    "A free custom engraving with every travel bottle ordered before the campaign closes.",
  );
  assert.match(result.preview.draft.layoutReason, /headline needs room/);
});

test("destination validation returns specific errors and accepts a public HTTPS URL", () => {
  assert.equal(getDestinationUrlError("https://example.com/harbor-field"), null);
  assert.match(getDestinationUrlError("not a url") ?? "", /valid URL/);
  assert.match(getDestinationUrlError("http://example.com/harbor-field") ?? "", /https:\/\//);
  assert.match(getDestinationUrlError("javascript:alert(1)") ?? "", /https:\/\//);
  assert.match(getDestinationUrlError("https://user:pass@example.com") ?? "", /username or password/);
  assert.match(getDestinationUrlError("https://localhost/offer") ?? "", /public hostname/);
  assert.match(getDestinationUrlError("") ?? "", /Enter the destination URL/);
});

test("missing offer, missing image and unknown images return field-level errors", () => {
  const missingOffer = sparseValues();
  missingOffer.offer = "   ";
  const offerIssues = validateCampaignForm(missingOffer);
  assert.ok(
    offerIssues.some(
      (issue) => issue.field === "offer" && /Add the offer/.test(issue.message),
    ),
  );

  const missingImage = sparseValues();
  missingImage.assetId = "";
  const imageIssues = validateCampaignForm(missingImage);
  assert.ok(
    imageIssues.some(
      (issue) =>
        issue.field === "assetId" && /Choose an approved product image/.test(issue.message),
    ),
  );

  const unknownImage = sparseValues();
  unknownImage.assetId = "not-in-the-library";
  const unknownIssues = validateCampaignForm(unknownImage);
  assert.ok(
    unknownIssues.some(
      (issue) =>
        issue.field === "assetId" && /not in the approved asset library/.test(issue.message),
    ),
  );

  const invalidDestination = sparseValues();
  invalidDestination.destinationUrl = "ftp://example.com/offer";
  const destinationIssues = validateCampaignForm(invalidDestination);
  assert.ok(
    destinationIssues.some(
      (issue) =>
        issue.field === "destinationUrl" && /must start with https/.test(issue.message),
    ),
  );
});

test("an invalid edit does not mutate the last valid preview", () => {
  const values = sparseValues();
  const valid = buildCampaignPreview(CAMPAIGN_FIXTURES.sparse, values);
  assert.equal(valid.ok, true);
  if (!valid.ok) return;

  const previousOffer = valid.preview.brief.offer;
  const previousRevision = valid.preview.revision;
  const previousDestination = valid.preview.brief.destinationUrl;

  const invalidValues = { ...values, offer: "" };
  const invalid = buildCampaignPreview(CAMPAIGN_FIXTURES.sparse, invalidValues);
  assert.equal(invalid.ok, false);

  assert.equal(valid.preview.brief.offer, previousOffer);
  assert.equal(valid.preview.revision, previousRevision);
  assert.equal(valid.preview.brief.destinationUrl, previousDestination);
  assert.equal(valid.preview.asset.id, "harbor-field-bottle-front");
});

test("offer, destination, product name, image and accent changes each produce a new revision", () => {
  const fixture = CAMPAIGN_FIXTURES.sparse;
  const base = buildCampaignPreview(fixture, sparseValues());
  assert.equal(base.ok, true);
  if (!base.ok) return;

  const changes = [
    { ...sparseValues(), offer: "25% off, 27–30 November 2026" },
    { ...sparseValues(), destinationUrl: "https://example.com/harbor-field-offer" },
    { ...sparseValues(), productName: "Harbor Field insulated bottle" },
    { ...sparseValues(), assetId: "morrow-ceramic-dripper-front" },
    { ...sparseValues(), accent: "#1f5f4a" },
  ];

  for (const values of changes) {
    const next = buildCampaignPreview(fixture, values);
    assert.equal(next.ok, true);
    if (!next.ok) return;
    assert.notEqual(next.preview.revision, base.preview.revision);
    assert.equal(next.preview.brief.offer, values.offer);
    assert.equal(next.preview.brief.destinationUrl, values.destinationUrl);
    assert.equal(next.preview.asset.id, values.assetId);
  }
});

test("brand style changes keep the campaign offer and destination but change the revision", () => {
  const fixture = CAMPAIGN_FIXTURES.sparse;
  const baseValues = sparseValues();
  const base = buildCampaignPreview(fixture, baseValues);
  const restyled = buildCampaignPreview(fixture, {
    ...baseValues,
    brandId: "morrow-ceramic",
    accent: "#234a6b",
  });
  assert.equal(base.ok, true);
  assert.equal(restyled.ok, true);
  if (!base.ok || !restyled.ok) return;

  assert.equal(restyled.preview.brief.offer, base.preview.brief.offer);
  assert.equal(restyled.preview.brief.destinationUrl, base.preview.brief.destinationUrl);
  assert.notEqual(restyled.preview.revision, base.preview.revision);
  assert.equal(restyled.preview.theme.brand.id, "morrow-ceramic");
});

test("headline assembly and accent contrast remain deterministic", () => {
  const values = sparseValues();
  const brief = CAMPAIGN_FIXTURES.sparse.brief;
  assert.equal(
    buildHeadline({ ...brief, ...values, productName: values.productName }, values.brandId),
    "20% off the travel bottle.",
  );

  const lightAccent = resolveBrandTheme("harbor-field", "#f4eee4");
  const darkAccent = resolveBrandTheme("harbor-field", "#171813");
  assert.notEqual(lightAccent.tokens.accentInk, darkAccent.tokens.accentInk);

  const draft = assembleDraft(CAMPAIGN_FIXTURES.sparse.brief, "harbor-field");
  assert.equal(draft.layout, "offer-led-one-photo");
  assert.equal(draft.templateId, SINGLE_PRODUCT_OFFER_TEMPLATE.id);
  assert.ok(getAsset(CAMPAIGN_FIXTURES.sparse.assetId));
});
