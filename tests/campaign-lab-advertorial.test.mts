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
    "close",
  ]);
  assert.equal(draft.sections[0], "disclosure");
  assert.equal(draft.headline, "Why the filter sits away from the wall");
  assert.equal(draft.standfirst, "Three raised interior ribs hold it clear.");
  assert.deepEqual(draft.story.map((beat) => beat.id), ["prototype-wall", "rib-revision"]);
  assert.deepEqual(draft.story.map((beat) => beat.text), [
    "In the first prototype, the filter sat against the wall.",
    "Morrow revised the spacing between the three interior ribs.",
  ]);
  assert.deepEqual(draft.facts.map((fact) => fact.id), ["interior", "outlet"]);
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
  assert.deepEqual(draft.sections, ["disclosure", "opening", "story", "product", "close"]);
  assert.deepEqual(assets.map((entry) => entry.assignment.role), ["product-hero"]);
  assert.equal(draft.story.length, 2);
  assert.deepEqual(draft.facts.map((fact) => fact.id), ["interior", "outlet"]);
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
    assert.ok(fullFromOne.sectionIssues.some((issue) => /full layout needs at least two images/i.test(issue.message)));
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
