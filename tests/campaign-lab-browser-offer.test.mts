import assert from "node:assert/strict";
import test from "node:test";

import {
  BROWSER_OFFER_FIXTURE_ID,
  BROWSER_OFFER_MAX_FACTS,
  buildBrowserOfferCatalog,
  classifyDestination,
  isProvisionalRights,
  validateBrowserOfferIntake,
  verifyBrowserOffer,
} from "../src/lib/campaign-lab/browser-offer.ts";
import type {
  BrowserOfferIntakeInput,
  BrowserOfferPackshotInput,
} from "../src/lib/campaign-lab/browser-offer.ts";
import { createFormValues } from "../src/lib/campaign-lab/fixtures.ts";
import { buildCampaignPreview } from "../src/lib/campaign-lab/template.ts";

const packshot: BrowserOfferPackshotInput = {
  src: "blob:local-packshot",
  width: 1200,
  height: 1500,
  alt: "Graphite travel bottle on a warm studio backdrop.",
  rights: "Client-approved for web and paid social.",
  contentHash: "a".repeat(64),
  fileName: "packshot.webp",
};

function completeInput(): BrowserOfferIntakeInput {
  return {
    brandName: "Harbor Field",
    productName: "Harbor Field travel bottle",
    offer: "20% off, 27–30 November 2026",
    destinationUrl: "https://example.com/harbor-field",
    facts: [
      { label: "Capacity", value: "500 ml" },
      { label: "Closure", value: "Screw cap" },
      { label: "Material", value: "Stainless steel" },
    ],
    packshot,
    reviewedOn: "2026-11-16",
  };
}

test("a complete browser brief validates and builds the existing offer preview", () => {
  const input = completeInput();
  const validation = validateBrowserOfferIntake(input);
  assert.equal(validation.valid, true);
  assert.deepEqual(validation.errors, {});

  const { fixture, catalog, verification } = buildBrowserOfferCatalog(input);
  assert.equal(fixture.id, BROWSER_OFFER_FIXTURE_ID);
  assert.equal(fixture.brief.brandId, "browser-offer-brand");
  assert.equal(catalog.brands["browser-offer-brand"]?.name, "Harbor Field");
  assert.equal(fixture.brief.productName, input.productName);
  assert.equal(fixture.brief.offer, input.offer);
  assert.equal(fixture.brief.destinationUrl, input.destinationUrl);
  assert.equal(fixture.brief.productNoun, "bottle");
  assert.equal(fixture.brief.assetId, "browser-offer-packshot");
  assert.equal(verification.provisional, false);
  assert.equal(verification.offer, "confirmed");
  assert.equal(verification.destination, "direct");
  assert.ok(
    fixture.brief.copy.lede &&
      fixture.brief.copy.lede.includes("Harbor Field") &&
      !fixture.brief.copy.lede.includes("500 ml"),
  );
  assert.deepEqual(
    fixture.brief.requiredFactGroups?.[0]?.factIds,
    ["capacity", "closure", "material"],
  );
  assert.equal(catalog.assets.length, 1);
  assert.equal(catalog.assets[0]?.alt, packshot.alt);
  assert.equal(catalog.assets[0]?.rights, packshot.rights);
  assert.equal(catalog.assets[0]?.contentHash, packshot.contentHash);
  assert.equal(catalog.assets[0]?.width, packshot.width);
  assert.equal(catalog.assets[0]?.height, packshot.height);

  const preview = buildCampaignPreview(fixture, createFormValues(fixture, catalog), catalog);
  assert.equal(preview.ok, true);
  if (!preview.ok) return;
  assert.equal(preview.preview.draft.templateId, "single-product-offer");
  assert.deepEqual(
    preview.preview.draft.facts.map((fact) => fact.id),
    ["capacity", "closure", "material"],
  );
  assert.equal(preview.preview.brief.offer, input.offer);
  assert.equal(preview.preview.brief.destinationUrl, input.destinationUrl);
  assert.equal(preview.preview.asset.id, "browser-offer-packshot");
});

test("a blank brand name uses the neutral preview identity", () => {
  const built = buildBrowserOfferCatalog({
    ...completeInput(),
    brandName: "",
  });
  assert.equal(built.catalog.brands["browser-offer-brand"]?.name, "Preview brand");
  assert.equal(built.catalog.brands["browser-offer-brand"]?.wordmark, "Preview");
  assert.equal(built.fixture.brief.copy.lede, "A bottle from Preview brand.");
});

test("Amazon search destinations and pending rights stay provisional", () => {
  assert.equal(
    classifyDestination("https://www.amazon.com/s?k=Momisa+Glow+Box"),
    "provisional",
  );
  const input: BrowserOfferIntakeInput = {
    ...completeInput(),
    offer: "30% off, placeholder terms",
    destinationUrl: "https://www.amazon.com/s?k=Momisa+Glow+Box",
    packshot: { ...packshot, rights: "Rights pending confirmation" },
  };
  const built = buildBrowserOfferCatalog(input);
  assert.deepEqual(built.verification, {
    offer: "provisional",
    destination: "provisional",
    rights: "provisional",
    provisional: true,
  });
  assert.equal(built.catalog.pilot?.status, "preview");
  assert.match(built.catalog.pilot?.note ?? "", /offer, destination, media rights/i);
  assert.equal(verifyBrowserOffer(completeInput()).provisional, false);
});

test("a changed offer changes the preview revision while keeping the approved packshot", () => {
  const input = completeInput();
  const built = buildBrowserOfferCatalog(input);
  const values = createFormValues(built.fixture, built.catalog);
  const first = buildCampaignPreview(built.fixture, values, built.catalog);
  const second = buildCampaignPreview(
    built.fixture,
    { ...values, offer: "25% off through 24 November 2026" },
    built.catalog,
  );

  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  if (!first.ok || !second.ok) return;
  assert.notEqual(first.preview.revision, second.preview.revision);
  assert.equal(second.preview.brief.offer, "25% off through 24 November 2026");
  assert.equal(second.preview.asset.id, first.preview.asset.id);
  assert.equal(second.preview.brief.destinationUrl, first.preview.brief.destinationUrl);
});

test("missing and invalid intake inputs are reported at their fields", () => {
  const validation = validateBrowserOfferIntake({
    productName: " ",
    offer: "",
    destinationUrl: "not-a-url",
    facts: [
      { label: "", value: "" },
      { label: "", value: "" },
    ],
    packshot: null,
    reviewedOn: "2026-11-16",
  });

  assert.equal(validation.valid, false);
  assert.match(validation.errors.productName ?? "", /product name/i);
  assert.match(validation.errors.offer ?? "", /offer/i);
  assert.match(validation.errors.destinationUrl ?? "", /http/i);
  assert.ok(validation.errors.factRows?.[0]?.label);
  assert.ok(validation.errors.factRows?.[0]?.value);
  assert.match(validation.errors.packshot ?? "", /packshot/i);
  assert.match(validation.errors.alt ?? "", /alt text/i);
  assert.match(validation.errors.rights ?? "", /rights/i);
});

test("the intake caps the offered fact presentation without truncating a group", () => {
  const input = completeInput();
  const tooMany: BrowserOfferIntakeInput = {
    ...input,
    facts: Array.from({ length: BROWSER_OFFER_MAX_FACTS + 1 }, (_, index) => ({
      label: `Fact ${index + 1}`,
      value: `Value ${index + 1}`,
    })),
  };
  const validation = validateBrowserOfferIntake(tooMany);
  assert.equal(validation.valid, false);
  assert.match(validation.errors.facts ?? "", /up to 3 facts/i);
});

test("provisional rights are allowed but surfaced as provisional", () => {
  assert.equal(isProvisionalRights("Rights pending confirmation"), true);
  assert.equal(isProvisionalRights("Client-approved for web and paid social"), false);

  const input: BrowserOfferIntakeInput = {
    ...completeInput(),
    packshot: { ...packshot, rights: "Rights pending confirmation" },
  };
  assert.equal(validateBrowserOfferIntake(input).valid, true);
});

test("building a catalog requires a packshot", () => {
  assert.throws(
    () =>
      buildBrowserOfferCatalog({
        ...completeInput(),
        packshot: null,
      }),
    /packshot is required/i,
  );
});
