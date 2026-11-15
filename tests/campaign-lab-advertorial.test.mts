import assert from "node:assert/strict";
import test from "node:test";

import {
  ADVERTORIAL_MANIFEST,
  ADVERTORIAL_TEMPLATE_ID,
  assembleAdvertorialDraft,
  assessAdvertorialFit,
  buildAdvertorialPreview,
  buildConfiguredPreview,
  calculateAdvertorialRevision,
  createAdvertorialBrief,
  validateAdvertorialBrief,
  validateAdvertorialDraft,
} from "../src/lib/campaign-lab/advertorial.ts";
import {
  BASE_CATALOG,
  CAMPAIGN_FIXTURES,
  createFormValues,
  openingFocusForFormat,
} from "../src/lib/campaign-lab/fixtures.ts";
import { SINGLE_PRODUCT_OFFER_TEMPLATE } from "../src/lib/campaign-lab/template.ts";
import type {
  AdvertorialBriefData,
  CampaignCatalog,
  CampaignFixture,
  CampaignFormValues,
} from "../src/lib/campaign-lab/types.ts";

function fixture(id: CampaignFixture["id"]): CampaignFixture {
  return CAMPAIGN_FIXTURES[id as keyof typeof CAMPAIGN_FIXTURES];
}

function valuesFor(item: CampaignFixture): CampaignFormValues {
  return createFormValues(item);
}

function withAdvertorial(
  item: CampaignFixture,
  patch: Partial<AdvertorialBriefData>,
): CampaignFixture {
  const current = item.brief.advertorial;
  if (!current) throw new Error("fixture has no advertorial material");
  return {
    ...item,
    brief: {
      ...item.brief,
      advertorial: { ...current, ...patch },
    },
  };
}

function catalogWith(item: CampaignFixture): CampaignCatalog {
  return {
    ...BASE_CATALOG,
    fixtures: { ...BASE_CATALOG.fixtures, [item.id]: item },
  };
}

test("the advertorial manifest is versioned and additive", () => {
  assert.equal(ADVERTORIAL_MANIFEST.id, ADVERTORIAL_TEMPLATE_ID);
  assert.equal(ADVERTORIAL_MANIFEST.version, "1.0.0");
  assert.deepEqual(Object.keys(ADVERTORIAL_MANIFEST.layouts).sort(), [
    "advertorial-full",
    "advertorial-one-photo",
  ]);
  assert.deepEqual(ADVERTORIAL_MANIFEST.layouts["advertorial-one-photo"].requiredAssetRoles, [
    "product-hero",
  ]);
  assert.deepEqual(SINGLE_PRODUCT_OFFER_TEMPLATE.allowedAssetRoles, ["product-hero"]);
  assert.equal(SINGLE_PRODUCT_OFFER_TEMPLATE.version, "1.0.0");
});

test("the full Morrow brief assembles the approved reading sequence", () => {
  const item = fixture("morrow-advertorial-full");
  const result = buildAdvertorialPreview(item, valuesFor(item));
  assert.equal(result.ok, true);
  if (!result.ok) return;

  const { draft, assets, brief } = result.preview;
  assert.equal(draft.layout, "advertorial-full");
  assert.deepEqual(draft.sections, [
    "disclosure",
    "opening",
    "story",
    "product",
  ]);
  assert.equal(draft.sections[0], "disclosure");
  assert.equal(draft.sections.at(-1), "product");
  assert.equal(draft.sections.includes("close"), false);
  assert.deepEqual(ADVERTORIAL_MANIFEST.sectionContract, {
    endsAt: "product",
    primaryAction: { section: "product", count: 1 },
  });
  assert.equal(draft.headline, "Why the filter sits away from the wall");
  assert.equal(draft.standfirst, "Three raised interior ribs hold it clear.");
  assert.deepEqual(draft.story.map((beat) => beat.id), ["prototype-wall", "rib-revision"]);
  assert.deepEqual(draft.story.map((beat) => beat.text), [
    "In the first prototype, the filter sat against the wall.",
    "Morrow revised the spacing between the three interior ribs.",
  ]);
  assert.deepEqual(draft.facts.map((fact) => fact.id), ["interior", "outlet", "body"]);
  assert.equal(
    draft.productTransition,
    "The dripper holds the filter clear of the wall the same way.",
  );
  assert.deepEqual(
    assets.map((entry) => entry.assignment.role),
    ["product-detail", "product-evidence", "product-hero"],
  );
  assert.equal(draft.disclosure.label, "Advertisement");
  assert.equal(draft.disclosure.sponsor, "Morrow Ceramic");
  assert.equal(brief.offer, "Free shipping through 30 November 2026");
  assert.equal(brief.destinationUrl, "https://example.com/morrow");
});

test("the one-photo brief removes the evidence band and extra image roles", () => {
  const item = fixture("morrow-advertorial-one-photo");
  const result = buildAdvertorialPreview(item, valuesFor(item));
  assert.equal(result.ok, true);
  if (!result.ok) return;

  const { draft, assets } = result.preview;
  assert.equal(draft.layout, "advertorial-one-photo");
  assert.deepEqual(draft.sections, ["disclosure", "opening", "story", "product"]);
  assert.equal(draft.sections.at(-1), "product");
  assert.deepEqual(assets.map((entry) => entry.assignment.role), ["product-hero"]);
  assert.equal(draft.story.length, 2);
  assert.deepEqual(draft.facts.map((fact) => fact.id), ["interior", "outlet", "body"]);
  assert.equal(draft.sections.includes("evidence"), false);
});

test("assembly is deterministic and keeps offer, destination, action and asset identity", () => {
  const item = fixture("morrow-advertorial-full");
  const values = valuesFor(item);
  const first = buildAdvertorialPreview(item, values);
  const second = buildAdvertorialPreview(item, values);
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  if (!first.ok || !second.ok) return;

  assert.equal(first.preview.revision, second.preview.revision);
  assert.equal(first.preview.brief.offer, values.offer);
  assert.equal(first.preview.brief.destinationUrl, values.destinationUrl);
  assert.equal(first.preview.brief.actionLabel, item.brief.actionLabel);
  assert.equal(first.preview.asset.id, values.assetId);
  assert.equal(first.preview.assets.length, 3);

  const draft = first.preview.draft as unknown as Record<string, unknown>;
  assert.equal("offer" in draft, false);
  assert.equal("destinationUrl" in draft, false);
  assert.equal("actionLabel" in draft, false);
  assert.equal("assetId" in draft, false);
});

test("the full and one-photo layouts keep the same story and required facts", () => {
  const fullItem = fixture("morrow-advertorial-full");
  const onePhotoItem = fixture("morrow-advertorial-one-photo");
  const full = buildAdvertorialPreview(fullItem, valuesFor(fullItem));
  const onePhoto = buildAdvertorialPreview(onePhotoItem, valuesFor(onePhotoItem));
  assert.equal(full.ok, true);
  assert.equal(onePhoto.ok, true);
  if (!full.ok || !onePhoto.ok) return;

  assert.deepEqual(
    full.preview.draft.story.map((beat) => beat.id),
    onePhoto.preview.draft.story.map((beat) => beat.id),
  );
  assert.deepEqual(
    full.preview.draft.story.map((beat) => beat.text),
    onePhoto.preview.draft.story.map((beat) => beat.text),
  );
  assert.deepEqual(
    full.preview.draft.facts.map((fact) => fact.id),
    onePhoto.preview.draft.facts.map((fact) => fact.id),
  );
  assert.deepEqual(
    full.preview.draft.facts.map((fact) => fact.value),
    onePhoto.preview.draft.facts.map((fact) => fact.value),
  );
});

test("changing a story beat, fact, image or offer produces a new revision", () => {
  const item = fixture("morrow-advertorial-full");
  const values = valuesFor(item);
  const base = buildAdvertorialPreview(item, values);
  assert.equal(base.ok, true);
  if (!base.ok) return;
  const { brief, assets, theme, revision } = base.preview;

  const changedBeat = assembleAdvertorialDraft({
    ...brief,
    advertorial: {
      ...brief.advertorial,
      storyBeats: brief.advertorial.storyBeats.map((beat, index) =>
        index === 0 ? { ...beat, text: "The approved story changed." } : beat,
      ),
    },
  });
  assert.notEqual(
    calculateAdvertorialRevision(brief, changedBeat, assets.map((entry) => entry.asset), theme),
    revision,
  );

  const changedFact = assembleAdvertorialDraft({
    ...brief,
    productFacts: brief.productFacts.map((fact) =>
      fact.id === "interior" ? { ...fact, value: "Four ribs" } : fact,
    ),
  });
  assert.notEqual(
    calculateAdvertorialRevision(brief, changedFact, assets.map((entry) => entry.asset), theme),
    revision,
  );

  const changedOffer = buildAdvertorialPreview(item, { ...values, offer: "Free shipping through 31 December 2026" });
  assert.equal(changedOffer.ok, true);
  if (changedOffer.ok) assert.notEqual(changedOffer.preview.revision, revision);

  const changedDestination = buildAdvertorialPreview(item, {
    ...values,
    destinationUrl: "https://example.com/morrow-dripper",
  });
  assert.equal(changedDestination.ok, true);
  if (changedDestination.ok) assert.notEqual(changedDestination.preview.revision, revision);
});

test("an offer-only brief reports the exact advertorial inputs it needs", () => {
  const sparse = fixture("sparse");
  const fit = assessAdvertorialFit(sparse, valuesFor(sparse));
  assert.equal(fit.fit, false);
  assert.equal(fit.recommended, "single-product-offer");
  assert.ok(fit.missingInputs.some((input) => /story beats/i.test(input)));
  assert.ok(fit.missingInputs.some((input) => /disclosure/i.test(input)));
  assert.ok(fit.missingInputs.some((input) => /product transition/i.test(input)));
  assert.equal(
    fit.missingInputs.some((input) => /beyond the product packshot|supporting image/i.test(input)),
    false,
  );

  const result = buildConfiguredPreview(sparse, { ...valuesFor(sparse), format: "advertorial" });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.ok(result.issues.some((issue) => /no approved advertorial story/i.test(issue.message)));
});

test("the offer path remains selectable and unchanged for an offer-only brief", () => {
  const sparse = fixture("sparse");
  const result = buildConfiguredPreview(sparse, { ...valuesFor(sparse), format: "offer" });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.preview.draft.templateId, SINGLE_PRODUCT_OFFER_TEMPLATE.id);
  assert.equal(result.preview.brief.offer, sparse.brief.offer);
  assert.equal(result.preview.brief.destinationUrl, sparse.brief.destinationUrl);
});

test("a missing disclosure, unapproved beat and first-person release are rejected by section", () => {
  const item = fixture("morrow-advertorial-full");
  const values = valuesFor(item);

  const noSponsor = withAdvertorial(item, {
    disclosure: {
      ...item.brief.advertorial!.disclosure,
      sponsor: "",
    },
  });
  const noSponsorResult = buildAdvertorialPreview(noSponsor, values, catalogWith(noSponsor));
  assert.equal(noSponsorResult.ok, false);
  if (!noSponsorResult.ok) {
    assert.ok(noSponsorResult.sectionIssues.some((issue) => issue.section === "disclosure" && /sponsor/i.test(issue.message)));
  }

  const brief = createAdvertorialBrief(item, values);
  assert.ok(brief);
  if (!brief) return;
  const draft = assembleAdvertorialDraft(brief);
  draft.story[0] = { ...draft.story[0], id: "invented-beat" };
  const draftIssues = validateAdvertorialDraft(brief, draft);
  assert.ok(draftIssues.some((issue) => issue.section === "story" && /not approved/i.test(issue.message)));

  const firstPerson = withAdvertorial(item, {
    storyBeats: item.brief.advertorial!.storyBeats.map((beat, index) =>
      index === 0 ? { ...beat, text: "I revised the first prototype." } : beat,
    ),
  });
  const firstPersonBrief = createAdvertorialBrief(firstPerson, values);
  assert.ok(firstPersonBrief);
  if (!firstPersonBrief) return;
  const firstPersonIssues = validateAdvertorialBrief(firstPersonBrief);
  assert.ok(firstPersonIssues.some((issue) => issue.section === "story" && /narrator/i.test(issue.message)));
});

test("the one-photo layout rejects extra roles and the full layout rejects a single image", () => {
  const fullItem = fixture("morrow-advertorial-full");
  const fullValues = valuesFor(fullItem);
  const fullBrief = createAdvertorialBrief(fullItem, fullValues);
  assert.ok(fullBrief);
  if (!fullBrief) return;

  const onePhoto = assembleAdvertorialDraft(fullBrief, "advertorial-one-photo");
  onePhoto.assetAssignments.push({ role: "product-detail", assetId: "morrow-ribs" });
  const onePhotoIssues = validateAdvertorialDraft(fullBrief, onePhoto);
  assert.ok(onePhotoIssues.some((issue) => /not allowed in this layout/i.test(issue.message)));

  const onePhotoItem = fixture("morrow-advertorial-one-photo");
  const onePhotoValues = { ...valuesFor(onePhotoItem), advertorialLayout: "advertorial-full" as const };
  const fullFromOne = buildAdvertorialPreview(onePhotoItem, onePhotoValues);
  assert.equal(fullFromOne.ok, false);
  if (!fullFromOne.ok) {
    assert.ok(fullFromOne.sectionIssues.some((issue) => /full layout needs at least two approved images/i.test(issue.message)));
  }
});

test("pending rights and a missing product hero block the advertorial", () => {
  const item = fixture("morrow-advertorial-full");
  const values = valuesFor(item);
  const pendingCatalog: CampaignCatalog = {
    ...BASE_CATALOG,
    assets: BASE_CATALOG.assets.map((asset) =>
      asset.id === "morrow-prototype"
        ? { ...asset, rights: "Rights pending confirmation" }
        : asset,
    ),
  };
  const pending = buildAdvertorialPreview(item, values, pendingCatalog);
  assert.equal(pending.ok, false);
  if (!pending.ok) {
    assert.ok(pending.sectionIssues.some((issue) => /rights pending/i.test(issue.message)));
  }

  const noHero = withAdvertorial(item, {
    assetAssignments: item.brief.advertorial!.assetAssignments.filter(
      (assignment) => assignment.role !== "product-hero",
    ),
  });
  const noHeroResult = buildAdvertorialPreview(noHero, values, catalogWith(noHero));
  assert.equal(noHeroResult.ok, false);
  if (!noHeroResult.ok) {
    assert.ok(noHeroResult.sectionIssues.some((issue) => /product-hero/i.test(issue.message)));
  }
});

test("the packshot is bound to the campaign's approved assignment", () => {
  const item = fixture("morrow-advertorial-full");
  const values = valuesFor(item);

  const wrongPackshot = buildAdvertorialPreview(item, {
    ...values,
    assetId: "harbor-field-bottle-front",
  });
  assert.equal(wrongPackshot.ok, false);
  if (!wrongPackshot.ok) {
    assert.ok(
      wrongPackshot.issues.some(
        (issue) =>
          issue.field === "assetId" &&
          /approved packshot/i.test(issue.message) &&
          /harbor-field-bottle-front/.test(issue.message),
      ),
    );
  }

  const wrongFit = assessAdvertorialFit(item, {
    ...values,
    assetId: "harbor-field-bottle-front",
  });
  assert.equal(wrongFit.fit, false);
  assert.ok(wrongFit.missingInputs.some((input) => /approved packshot/i.test(input)));

  const edited = buildAdvertorialPreview(item, {
    ...values,
    offer: "Free shipping through 31 December 2026",
    destinationUrl: "https://example.com/morrow-dripper",
  });
  assert.equal(edited.ok, true);
  if (!edited.ok) return;
  assert.equal(edited.preview.asset.id, "morrow-ceramic-dripper-front");
  assert.equal(edited.preview.brief.offer, "Free shipping through 31 December 2026");
  assert.equal(edited.preview.brief.destinationUrl, "https://example.com/morrow-dripper");
});

test("the revision covers visible copy, presentation and asset content", () => {
  const item = fixture("morrow-advertorial-full");
  const result = buildAdvertorialPreview(item, valuesFor(item));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const { brief, draft, assets, theme, revision } = result.preview;
  const plainAssets = assets.map((entry) => entry.asset);
  const revisionFor = (
    nextDraft = draft,
    nextAssets = plainAssets,
    nextTheme = theme,
  ) => calculateAdvertorialRevision(brief, nextDraft, nextAssets, nextTheme);

  assert.notEqual(
    revisionFor({ ...draft, headline: `${draft.headline} (revised)` }),
    revision,
  );
  assert.notEqual(
    revisionFor({ ...draft, standfirst: `${draft.standfirst} (revised)` }),
    revision,
  );
  assert.notEqual(
    revisionFor({
      ...draft,
      disclosure: { ...draft.disclosure, explanation: "A revised disclosure." },
    }),
    revision,
  );
  assert.notEqual(
    revisionFor(draft, plainAssets, {
      ...theme,
      tokens: { ...theme.tokens, imageRadius: "0px" },
    }),
    revision,
  );
  assert.notEqual(
    revisionFor(
      draft,
      plainAssets.map((asset) =>
        asset.id === "morrow-ceramic-dripper-front"
          ? { ...asset, width: asset.width + 1 }
          : asset,
      ),
    ),
    revision,
  );
  assert.notEqual(
    revisionFor(
      draft,
      plainAssets.map((asset) =>
        asset.id === "morrow-ceramic-dripper-front"
          ? { ...asset, caption: "A revised caption." }
          : asset,
      ),
    ),
    revision,
  );
});

test("approved opening copy and opening focus each produce a new revision", () => {
  const item = fixture("morrow-advertorial-full");
  const values = valuesFor(item);
  const current = item.brief.advertorial!;
  const base = buildAdvertorialPreview(item, values);
  assert.equal(base.ok, true);
  if (!base.ok) return;

  const revisedCopy = withAdvertorial(item, {
    openings: [
      {
        ...current.openings[0],
        headline: "Why Morrow revised the rib spacing again",
        standfirst: "What changed in the second pour test?",
      },
      ...current.openings.slice(1),
    ],
  });
  const revised = buildAdvertorialPreview(revisedCopy, values, catalogWith(revisedCopy));
  assert.equal(revised.ok, true);
  if (!revised.ok) return;
  assert.equal(revised.preview.draft.headline, "Why Morrow revised the rib spacing again");
  assert.equal(revised.preview.draft.standfirst, "What changed in the second pour test?");
  assert.notEqual(revised.preview.revision, base.preview.revision);

  const secondOpening = withAdvertorial(item, {
    openings: [
      ...current.openings,
      {
        id: "second-opening",
        headline: "Start with a slower first pour",
        standfirst: "Three interior ribs and a single outlet.",
      },
    ],
  });
  const first = buildAdvertorialPreview(secondOpening, values, catalogWith(secondOpening));
  const second = buildAdvertorialPreview(
    secondOpening,
    { ...values, openingFocus: "second-opening" },
    catalogWith(secondOpening),
  );
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  if (!first.ok || !second.ok) return;
  assert.equal(first.preview.draft.headline, current.openings[0].headline);
  assert.equal(second.preview.draft.headline, "Start with a slower first pour");
  assert.notEqual(second.preview.revision, first.preview.revision);
});

test("fit and generation agree for the full brief with full and packshot-only imagery", () => {
  const fullItem = fixture("morrow-advertorial-full");
  const fullValues = valuesFor(fullItem);
  const fullFit = assessAdvertorialFit(fullItem, fullValues);
  const fullPreview = buildAdvertorialPreview(fullItem, fullValues);
  assert.equal(fullFit.fit, true);
  assert.equal(fullPreview.ok, true);
  if (!fullPreview.ok) return;
  assert.deepEqual(fullPreview.preview.draft.facts.map((fact) => fact.id), [
    "interior",
    "outlet",
    "body",
  ]);
  assert.equal(fullPreview.preview.assets.length, 3);

  const packshotOnly = withAdvertorial(fullItem, {
    assetAssignments: fullItem.brief.advertorial!.assetAssignments.filter(
      (assignment) => assignment.role === "product-hero",
    ),
  });
  const catalog = catalogWith(packshotOnly);
  const onePhotoValues = {
    ...valuesFor(packshotOnly),
    advertorialLayout: "advertorial-one-photo" as const,
  };
  const onePhotoFit = assessAdvertorialFit(packshotOnly, onePhotoValues, catalog);
  const onePhotoPreview = buildAdvertorialPreview(packshotOnly, onePhotoValues, catalog);
  assert.equal(onePhotoFit.fit, true);
  assert.equal(onePhotoFit.layout, "advertorial-one-photo");
  assert.equal(onePhotoPreview.ok, true);
  if (!onePhotoPreview.ok) return;
  assert.deepEqual(onePhotoPreview.preview.draft.facts.map((fact) => fact.id), [
    "interior",
    "outlet",
    "body",
  ]);
  assert.equal(onePhotoPreview.preview.assets.length, 1);
  assert.equal(onePhotoPreview.preview.assets[0].assignment.role, "product-hero");
  assert.equal(onePhotoPreview.preview.draft.sections.includes("evidence"), false);
  assert.equal(onePhotoPreview.preview.draft.sections.at(-1), "product");

  const autoValues = { ...valuesFor(packshotOnly), advertorialLayout: "auto" as const };
  const autoFit = assessAdvertorialFit(packshotOnly, autoValues, catalog);
  assert.equal(autoFit.fit, true);
  assert.equal(autoFit.layout, "advertorial-one-photo");

  const noPreference = withAdvertorial(packshotOnly, { preferredLayout: undefined });
  const noPreferenceFit = assessAdvertorialFit(
    noPreference,
    { ...valuesFor(noPreference), advertorialLayout: "auto" as const },
    catalogWith(noPreference),
  );
  assert.equal(noPreferenceFit.fit, true);
  assert.equal(noPreferenceFit.layout, "advertorial-one-photo");

  const fullRequested = {
    ...valuesFor(packshotOnly),
    advertorialLayout: "advertorial-full" as const,
  };
  const fullFitFromPackshot = assessAdvertorialFit(packshotOnly, fullRequested, catalog);
  const fullPreviewFromPackshot = buildAdvertorialPreview(packshotOnly, fullRequested, catalog);
  assert.equal(fullFitFromPackshot.fit, false);
  assert.equal(fullFitFromPackshot.compatibleLayout, "advertorial-one-photo");
  assert.match(fullFitFromPackshot.layoutReason ?? "", /at least two approved images/i);
  assert.equal(fullPreviewFromPackshot.ok, false);
  if (!fullPreviewFromPackshot.ok) {
    assert.ok(
      fullPreviewFromPackshot.sectionIssues.some((issue) =>
        /at least two approved images/i.test(issue.message),
      ),
    );
  }

  const sameBriefOnePhoto = assessAdvertorialFit(fullItem, {
    ...fullValues,
    advertorialLayout: "advertorial-one-photo",
  });
  const sameBriefOnePhotoPreview = buildAdvertorialPreview(fullItem, {
    ...fullValues,
    advertorialLayout: "advertorial-one-photo",
  });
  assert.equal(sameBriefOnePhoto.fit, true);
  assert.equal(sameBriefOnePhotoPreview.ok, true);
  if (sameBriefOnePhotoPreview.ok) {
    assert.deepEqual(
      sameBriefOnePhotoPreview.preview.draft.facts.map((fact) => fact.id),
      ["interior", "outlet", "body"],
    );
  }
});

test("only image roles with a verified placement enter fit and assembly", () => {
  const item = fixture("morrow-advertorial-full");
  const heroAndUse = withAdvertorial(item, {
    preferredLayout: "advertorial-full",
    assetAssignments: [
      { role: "product-hero", assetId: "morrow-ceramic-dripper-front" },
      { role: "product-in-use", assetId: "morrow-pour" },
    ],
  });
  const catalog = catalogWith(heroAndUse);
  const autoValues = { ...valuesFor(heroAndUse), advertorialLayout: "auto" as const };
  const fit = assessAdvertorialFit(heroAndUse, autoValues, catalog);
  const preview = buildAdvertorialPreview(heroAndUse, autoValues, catalog);

  assert.equal(fit.fit, true);
  assert.equal(fit.layout, "advertorial-one-photo");
  assert.equal(fit.unusedImages.length, 1);
  assert.equal(fit.unusedImages[0].assetId, "morrow-pour");
  assert.equal(fit.unusedImages[0].role, "product-in-use");
  assert.match(fit.unusedImages[0].reason, /one photo places only product-hero/i);

  assert.equal(preview.ok, true);
  if (!preview.ok) return;
  assert.deepEqual(
    preview.preview.assets.map((entry) => entry.asset.id),
    ["morrow-ceramic-dripper-front"],
  );
  assert.deepEqual(
    preview.preview.assets.map((entry) => entry.assignment.role),
    ["product-hero"],
  );
  assert.equal(preview.preview.unusedImages[0].assetId, "morrow-pour");

  const fullValues = { ...valuesFor(heroAndUse), advertorialLayout: "advertorial-full" as const };
  const fullFit = assessAdvertorialFit(heroAndUse, fullValues, catalog);
  const fullPreview = buildAdvertorialPreview(heroAndUse, fullValues, catalog);
  assert.equal(fullFit.fit, false);
  assert.equal(fullFit.compatibleLayout, "advertorial-one-photo");
  assert.ok(fullFit.unusedImages.some((image) => image.assetId === "morrow-pour"));
  assert.equal(fullPreview.ok, false);
});

test("the advertorial product name is bound to the campaign identity", () => {
  const item = fixture("morrow-advertorial-full");
  const values = valuesFor(item);
  const swapped = buildAdvertorialPreview(item, {
    ...values,
    productName: "Harbor Field travel bottle",
  });
  assert.equal(swapped.ok, false);
  if (!swapped.ok) {
    assert.ok(
      swapped.issues.some(
        (issue) =>
          issue.field === "productName" &&
          /does not match this campaign's approved product/i.test(issue.message),
      ),
    );
  }

  const swappedFit = assessAdvertorialFit(item, {
    ...values,
    productName: "Harbor Field travel bottle",
  });
  assert.equal(swappedFit.fit, false);
  assert.equal(swappedFit.compatibleLayout, undefined);

  const edited = buildAdvertorialPreview(item, {
    ...values,
    offer: "Free shipping through 31 December 2026",
    destinationUrl: "https://example.com/morrow-dripper",
  });
  assert.equal(edited.ok, true);
  if (!edited.ok) return;
  assert.equal(edited.preview.brief.productName, item.brief.productName);
  assert.equal(edited.preview.brief.offer, "Free shipping through 31 December 2026");
  assert.equal(edited.preview.brief.destinationUrl, "https://example.com/morrow-dripper");
});

test("opening focus initializes from the selected format's own options", () => {
  const item = fixture("morrow-advertorial-full");
  const distinct = withAdvertorial(item, {
    openings: [
      {
        id: "advertorial-question",
        headline: "Why the filter sits away from the wall",
        standfirst: "Three raised interior ribs hold it clear.",
      },
    ],
  });
  const withDistinctOfferOpening: CampaignFixture = {
    ...distinct,
    openings: [
      {
        id: "offer-rib",
        label: "Rib design",
        copy: item.brief.copy,
      },
    ],
  };
  const values = createFormValues(withDistinctOfferOpening);
  assert.equal(values.format, "advertorial");
  assert.equal(values.openingFocus, "advertorial-question");
  assert.equal(
    openingFocusForFormat(withDistinctOfferOpening, "offer"),
    "offer-rib",
  );
  assert.equal(
    openingFocusForFormat(withDistinctOfferOpening, "advertorial"),
    "advertorial-question",
  );

  const preview = buildAdvertorialPreview(
    withDistinctOfferOpening,
    values,
    catalogWith(withDistinctOfferOpening),
  );
  assert.equal(preview.ok, true);
  if (!preview.ok) return;
  assert.equal(preview.preview.draft.headline, "Why the filter sits away from the wall");
});

test("one-photo rejects a required group larger than the verified fact presentation", () => {
  const base = fixture("morrow-advertorial-one-photo");
  const facts = Array.from({ length: 27 }, (_, index) => ({
    id: `fact-${index + 1}`,
    label: `Fact ${index + 1}`,
    value: `Value ${index + 1}`,
    source: {
      document: "Stress fixture",
      quote: `Fact ${index + 1}`,
      reviewedBy: "Local QA",
      reviewedOn: "2026-11-15",
    },
  }));
  const stress: CampaignFixture = {
    ...base,
    brief: {
      ...base.brief,
      productFacts: facts,
      requiredFactGroups: [
        { id: "stress", label: "the stress group", factIds: facts.map((fact) => fact.id) },
      ],
    },
  };
  const catalog = catalogWith(stress);
  const values = {
    ...valuesFor(stress),
    advertorialLayout: "advertorial-one-photo" as const,
  };
  const fit = assessAdvertorialFit(stress, values, catalog);
  const result = buildAdvertorialPreview(stress, values, catalog);

  assert.equal(fit.fit, false);
  assert.equal(fit.recommended, "single-product-offer");
  assert.ok(
    fit.missingInputs.some(
      (input) =>
        /the stress group/i.test(input) &&
        /27 facts/i.test(input) &&
        /at most 3/i.test(input),
    ),
  );
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(
      result.issues.some(
        (issue) =>
          issue.field === "advertorialLayout" &&
          /the stress group/i.test(issue.message) &&
          /27 facts/i.test(issue.message) &&
          /at most 3/i.test(issue.message),
      ),
    );
  }
});

test("the section contract rejects a closing action after the product block", () => {
  const item = fixture("morrow-advertorial-full");
  const brief = createAdvertorialBrief(item, valuesFor(item));
  assert.ok(brief);
  if (!brief) return;

  const draft = assembleAdvertorialDraft(brief);
  draft.sections = [...draft.sections, "close"];
  const issues = validateAdvertorialDraft(brief, draft);
  assert.ok(
    issues.some(
      (issue) =>
        issue.section === "layout" &&
        /closing action section is not part of this template/i.test(issue.message),
    ),
  );
  assert.ok(
    issues.some(
      (issue) =>
        issue.section === "layout" && /must end at the product block/i.test(issue.message),
    ),
  );
});

test("required fact groups stay complete in the advertorial", () => {
  const item = fixture("morrow-advertorial-full");
  const values = valuesFor(item);
  const brief = createAdvertorialBrief(item, values);
  assert.ok(brief);
  if (!brief) return;

  const draft = assembleAdvertorialDraft(brief, "advertorial-one-photo");
  draft.facts = draft.facts.filter((fact) => fact.id !== "outlet");
  const issues = validateAdvertorialDraft(brief, draft);
  assert.ok(issues.some((issue) => /Required fact group "the rib design" is incomplete/.test(issue.message)));
  assert.deepEqual(assessAdvertorialFit(item, values).missingInputs, []);
});
