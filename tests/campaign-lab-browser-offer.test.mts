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
    confirmations: {
      offer: "20% off, 27–30 November 2026",
      destination: "https://example.com/harbor-field",
      rights: "Client-approved for web and paid social.",
    },
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
  assert.equal(fixture.brief.copy.hideLede, true);
  assert.equal(fixture.brief.copy.headline, undefined);
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

test("a conditional long offer uses the product name and keeps the exact terms", () => {
  const offer =
    "Free shipping plus a matching carafe through 30 November 2026 when you order the complete pour-over set";
  const built = buildBrowserOfferCatalog({
    ...completeInput(),
    productName: "Morrow ceramic dripper",
    offer,
    confirmations: {
      ...completeInput().confirmations,
      offer,
    },
  });
  assert.equal(built.fixture.brief.offer, offer);
  assert.equal(built.fixture.brief.copy.headline, undefined);
  assert.equal(built.fixture.brief.copy.hideLede, true);

  const preview = buildCampaignPreview(
    built.fixture,
    createFormValues(built.fixture, built.catalog),
    built.catalog,
  );
  assert.equal(preview.ok, true);
  if (!preview.ok) return;
  assert.equal(preview.preview.draft.headline, "Morrow ceramic dripper");
  assert.equal(preview.preview.draft.lede, "A dripper from Harbor Field.");
  assert.equal(preview.preview.brief.offer, offer);
});

test("a changed offer derives a headline from the current brief", () => {
  const initialOffer =
    "50% off your first order when you spend $75 or more, excluding gift cards and sale items";
  const freeShippingOffer = "Free shipping on orders over $75";
  const unparsedOffer =
    "A free custom engraving is included with every travel bottle for the whole launch season";
  const built = buildBrowserOfferCatalog({
    ...completeInput(),
    offer: initialOffer,
    confirmations: {
      ...completeInput().confirmations,
      offer: initialOffer,
    },
  });
  const values = createFormValues(built.fixture, built.catalog);
  const first = buildCampaignPreview(built.fixture, values, built.catalog);
  const second = buildCampaignPreview(
    built.fixture,
    { ...values, offer: freeShippingOffer },
    built.catalog,
  );
  const third = buildCampaignPreview(
    built.fixture,
    { ...values, offer: unparsedOffer },
    built.catalog,
  );

  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(third.ok, true);
  if (!first.ok || !second.ok || !third.ok) return;
  assert.equal(first.preview.draft.headline, "Harbor Field travel bottle");
  assert.equal(second.preview.draft.headline, "Harbor Field travel bottle");
  assert.equal(second.preview.brief.offer, freeShippingOffer);
  assert.notEqual(first.preview.revision, second.preview.revision);
  assert.equal(third.preview.draft.headline, "Harbor Field travel bottle");
  assert.equal(third.preview.brief.offer, unparsedOffer);
});

test("browser intake keeps qualifiers out of automatic headlines", () => {
  const cases = [
    { offer: "20% off, members only", headline: "Harbor Field travel bottle" },
    { offer: "20% off, US customers only", headline: "Harbor Field travel bottle" },
    { offer: "20% off orders over $50", headline: "Harbor Field travel bottle" },
    { offer: "20% off, 27-30 November 2026", headline: "20% off the bottle." },
  ] as const;

  for (const { offer, headline } of cases) {
    const built = buildBrowserOfferCatalog({
      ...completeInput(),
      offer,
      confirmations: {
        ...completeInput().confirmations,
        offer,
      },
    });
    const preview = buildCampaignPreview(
      built.fixture,
      createFormValues(built.fixture, built.catalog),
      built.catalog,
    );
    assert.equal(preview.ok, true, offer);
    if (!preview.ok) return;
    assert.equal(preview.preview.draft.headline, headline, offer);
    assert.equal(preview.preview.brief.offer, offer);
    assert.equal(built.verification.offer, "confirmed");
  }
});

test("every valid offer length renders successfully", () => {
  for (let length = 1; length <= 180; length += 1) {
    const offer =
      length === 180
        ? "x".repeat(180)
        : "save ".repeat(40).slice(0, length).trim();
    const input: BrowserOfferIntakeInput = {
      ...completeInput(),
      offer,
      confirmations: {
        ...completeInput().confirmations,
        offer,
      },
    };
    assert.equal(
      validateBrowserOfferIntake(input).valid,
      true,
      `intake rejected a valid ${length}-character offer`,
    );
    const built = buildBrowserOfferCatalog(input);
    const preview = buildCampaignPreview(
      built.fixture,
      createFormValues(built.fixture, built.catalog),
      built.catalog,
    );
    assert.equal(
      preview.ok,
      true,
      `preview failed for a ${length}-character offer`,
    );
    if (preview.ok) {
      assert.ok(preview.preview.draft.headline.length <= 180);
    }
  }
});

test("a 180-character conditional offer uses the product name", () => {
  const offer =
    "50% off your first order when you spend $75 or more, excluding gift cards and sale items, plus free returns for the launch season and future refills ordered directly from our team.";
  const built = buildBrowserOfferCatalog({
    ...completeInput(),
    offer,
    confirmations: {
      ...completeInput().confirmations,
      offer,
    },
  });
  const preview = buildCampaignPreview(
    built.fixture,
    createFormValues(built.fixture, built.catalog),
    built.catalog,
  );
  assert.equal(offer.length, 180);
  assert.equal(preview.ok, true);
  if (!preview.ok) return;
  assert.equal(preview.preview.draft.headline, "Harbor Field travel bottle");
  assert.equal(preview.preview.brief.offer, offer);
});

test("reviewed offer emphasis is an exact substring and is never inferred", () => {
  const offer = "30% off, was $10, now $7.50";
  const input: BrowserOfferIntakeInput = {
    ...completeInput(),
    offer,
    offerPrice: "$7.50",
    confirmations: {
      ...completeInput().confirmations,
      offer,
    },
  };
  assert.equal(validateBrowserOfferIntake(input).valid, true);
  const built = buildBrowserOfferCatalog(input);
  assert.equal(built.fixture.brief.offerPrice, "$7.50");
  const preview = buildCampaignPreview(
    built.fixture,
    createFormValues(built.fixture, built.catalog),
    built.catalog,
  );
  assert.equal(preview.ok, true);
  if (preview.ok) {
    assert.equal(preview.preview.brief.offer, offer);
    assert.equal(preview.preview.brief.offerPrice, "$7.50");
  }

  for (const offerPrice of ["$10.00", "$8.00", "not in the offer"]) {
    const candidate = { ...input, offerPrice };
    assert.equal(validateBrowserOfferIntake(candidate).valid, false, offerPrice);
  }
  assert.equal(
    validateBrowserOfferIntake({ ...input, offerPrice: " $7.50 " }).valid,
    true,
  );

  const blank = { ...input, offerPrice: "  " };
  assert.equal(validateBrowserOfferIntake(blank).valid, true);
  assert.equal(buildBrowserOfferCatalog(blank).fixture.brief.offerPrice, undefined);
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

test("explicit confirmations bind to the exact offer, destination, and rights values", () => {
  const confirmed = verifyBrowserOffer(completeInput());
  assert.equal(confirmed.provisional, false);
  assert.equal(confirmed.offer, "confirmed");
  assert.equal(confirmed.destination, "direct");
  assert.equal(confirmed.rights, "confirmed");

  const edited = verifyBrowserOffer({
    ...completeInput(),
    offer: "25% off through 24 November 2026",
  });
  assert.equal(edited.offer, "provisional");
  assert.equal(edited.destination, "direct");
  assert.equal(edited.rights, "confirmed");
});

test("unconfirmed direct, Amazon search, invalid, and confirmed direct destinations stay distinct", () => {
  const directUrl = "https://example.com/harbor-field";
  const searchUrl = "https://www.amazon.com/s?k=Momisa+Glow+Box";

  assert.equal(classifyDestination(""), "missing");
  assert.equal(classifyDestination("not-a-url"), "invalid");
  assert.equal(classifyDestination(searchUrl), "search");
  assert.equal(classifyDestination(directUrl), "direct");

  const unconfirmed = verifyBrowserOffer({
    ...completeInput(),
    confirmations: { ...completeInput().confirmations, destination: null },
  });
  assert.equal(unconfirmed.destination, "unconfirmed");
  assert.equal(unconfirmed.provisional, true);

  const staleConfirmation = verifyBrowserOffer({
    ...completeInput(),
    destinationUrl: "https://example.com/harbor-field-offer",
  });
  assert.equal(staleConfirmation.destination, "unconfirmed");
  assert.equal(staleConfirmation.provisional, true);

  assert.equal(verifyBrowserOffer(completeInput()).destination, "direct");
  assert.equal(verifyBrowserOffer(completeInput()).provisional, false);
});

test("Amazon search destinations and pending rights stay provisional even when confirmed", () => {
  const offer = "30% off, placeholder terms";
  const destinationUrl = "https://www.amazon.com/s?k=Momisa+Glow+Box";
  const rights = "Rights pending confirmation";
  const input: BrowserOfferIntakeInput = {
    ...completeInput(),
    offer,
    destinationUrl,
    packshot: { ...packshot, rights },
    confirmations: { offer, destination: destinationUrl, rights },
  };
  const built = buildBrowserOfferCatalog(input);
  assert.deepEqual(built.verification, {
    offer: "provisional",
    destination: "search",
    rights: "provisional",
    provisional: true,
  });
  assert.equal(built.catalog.pilot?.status, "preview");
  assert.match(built.catalog.pilot?.note ?? "", /offer, destination, media rights/i);
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
