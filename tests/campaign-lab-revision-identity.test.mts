import assert from "node:assert/strict";
import test from "node:test";

import {
  CAMPAIGN_FIXTURES,
  createFormValues,
} from "../src/lib/campaign-lab/fixtures.ts";
import {
  CAMPAIGN_REVISION_IDENTITY_VERSION,
  buildCampaignPreview,
  buildDraftRevisionIdentity,
  calculateDraftRevision,
} from "../src/lib/campaign-lab/template.ts";
import {
  presentationText,
  renderedCopyLength,
  shouldShowClose,
} from "../src/lib/campaign-lab/presentation.ts";
import {
  buildExportReceipt,
  evaluateCampaignExport,
  isLocalPreviewApproved,
  sameExportGuard,
} from "../src/lib/campaign-lab/export.ts";

const fixture = CAMPAIGN_FIXTURES.sparse;
const values = createFormValues(fixture);
const built = buildCampaignPreview(fixture, values);
if (!built.ok) throw new Error("The revision identity fixture must render.");
const base = built.preview;

function revisionWith(input: {
  brief?: typeof base.brief;
  draft?: typeof base.draft;
  asset?: typeof base.asset;
  theme?: typeof base.theme;
} = {}): string {
  return calculateDraftRevision(
    input.brief ?? base.brief,
    input.draft ?? base.draft,
    input.asset ?? base.asset,
    input.theme ?? base.theme,
  );
}

function themeWith(
  tokens: Partial<typeof base.theme.tokens> = {},
  brand: Partial<typeof base.theme.brand> = {},
) {
  return {
    ...base.theme,
    brand: { ...base.theme.brand, ...brand },
    tokens: { ...base.theme.tokens, ...tokens },
  };
}

test("revision identity is versioned and previews carry the version", () => {
  assert.equal(CAMPAIGN_REVISION_IDENTITY_VERSION, 6);
  assert.equal(base.revisionIdentityVersion, 6);
  assert.equal(
    buildDraftRevisionIdentity(base.brief, base.draft, base.asset, base.theme)
      .identityVersion,
    6,
  );
  assert.equal(revisionWith(), base.revision);
});

test("rendered colour, type, spacing, radii, treatment, order, wordmark, and image dimensions participate", () => {
  const changes = [
    ["colour", { theme: themeWith({ accent: "#123456" }) }],
    ["body font", { theme: themeWith({ bodyFont: "Georgia, serif" }) }],
    ["display weight", { theme: themeWith({ displayWeight: 500 }) }],
    ["spacing", { theme: themeWith({ labelTracking: "0.32em" }) }],
    ["radii", { theme: themeWith({ buttonRadius: "18px" }) }],
    ["image treatment", { theme: themeWith({ imageBlend: "multiply" as const }) }],
    [
      "layout order",
      { draft: { ...base.draft, sections: ["hero", "close"] as const } },
    ],
    ["wordmark", { theme: themeWith({}, { wordmark: "Different mark" }) }],
    ["image dimensions", { asset: { ...base.asset, width: 900, height: 1500 } }],
    ["image alt", { asset: { ...base.asset, alt: "A different synthetic image." } }],
  ] as const;

  for (const [label, change] of changes) {
    assert.notEqual(
      revisionWith(change as Parameters<typeof revisionWith>[0]),
      base.revision,
      label,
    );
  }
});

test("non-rendered review notes and unused fact metadata do not change the revision", () => {
  const briefWithReviewNotes = {
    ...base.brief,
    productFacts: base.brief.productFacts.map((fact, index) => ({
      ...fact,
      source: {
        ...fact.source,
        quote: `Changed review note ${index}`,
        reviewedBy: `Reviewer ${index}`,
        reviewedOn: "2026-12-01",
      },
    })),
    sourceCampaign: {
      channel: "Changed internal note",
      promise: "Changed internal promise",
      document: "Changed internal document",
      reviewedBy: "Changed reviewer",
      reviewedOn: "2026-12-01",
    },
  };
  const draftWithReviewNotes = {
    ...base.draft,
    facts: base.draft.facts.map((fact) => ({
      ...fact,
      source: { ...fact.source, quote: "Changed fact source note" },
    })),
  };
  const assetWithReviewNotes = {
    ...base.asset,
    reviewedBy: "Different reviewer",
    reviewedOn: "2026-12-02",
    source: "Different internal source note",
    rights: "Different internal rights note",
    brandId: "another-brand" as typeof base.asset.brandId,
  };

  assert.equal(
    revisionWith({
      brief: briefWithReviewNotes,
      draft: draftWithReviewNotes,
      asset: assetWithReviewNotes,
      theme: themeWith({}, { descriptor: "Changed non-rendered descriptor" }),
    }),
    base.revision,
  );
});

test("equivalent defaults and equivalent values normalize to the same revision", () => {
  const normalizedTheme = themeWith({
    accent: base.theme.tokens.accent.toUpperCase(),
    offerStyle: "tint",
    imageBlend: "normal",
    mobileHeroOrder: "support-first",
    imageInset: "0px",
    imageRadius: "0px",
    displayFont: base.theme.tokens.displayFont.replace(/,\s*/g, ","),
  });
  const omittedTheme = {
    ...base.theme,
    tokens: {
      ...base.theme.tokens,
      offerStyle: undefined,
      imageBlend: undefined,
      mobileHeroOrder: undefined,
      imageInset: undefined,
      imageRadius: "0",
    } as unknown as typeof base.theme.tokens,
  };

  assert.equal(
    revisionWith({ theme: normalizedTheme }),
    revisionWith({ theme: omittedTheme }),
  );
});

test("a hidden lede ignores its unrendered text", () => {
  assert.equal(
    revisionWith({
      brief: { ...base.brief, copy: { ...base.brief.copy, hideLede: true } },
      draft: { ...base.draft, lede: "Changed hidden lede." },
    }),
    revisionWith({
      brief: { ...base.brief, copy: { ...base.brief.copy, hideLede: true } },
      draft: { ...base.draft, lede: "Another hidden lede." },
    }),
  );
  assert.notEqual(
    revisionWith({
      brief: { ...base.brief, copy: { ...base.brief.copy, hideLede: false } },
      draft: { ...base.draft, lede: "Visible lede." },
    }),
    revisionWith({
      brief: { ...base.brief, copy: { ...base.brief.copy, hideLede: false } },
      draft: { ...base.draft, lede: "Different visible lede." },
    }),
  );
});

test("equivalent ASCII whitespace cannot change the closing CTA or identity", () => {
  const ledeA = `A ${"b".repeat(210)}`;
  const ledeB = `A  ${"b".repeat(210)}`;
  const build = (lede: string) => {
    const fixtureA = {
      ...fixture,
      brief: {
        ...fixture.brief,
        copy: { ...fixture.brief.copy, lede, hideLede: false },
      },
    };
    const result = buildCampaignPreview(fixtureA, values);
    assert.equal(result.ok, true);
    if (!result.ok) throw new Error("Expected the whitespace fixture to render.");
    return result.preview;
  };
  const a = build(ledeA);
  const b = build(ledeB);

  assert.equal(renderedCopyLength(a.brief, a.draft), 319);
  assert.equal(renderedCopyLength(b.brief, b.draft), 319);
  assert.equal(shouldShowClose(a.brief, a.draft), false);
  assert.equal(shouldShowClose(b.brief, b.draft), false);
  assert.equal(a.revision, b.revision);
  assert.notEqual(a.brief.copy.lede, b.brief.copy.lede);
});

test("nonbreaking spaces remain meaningful while ASCII whitespace normalizes", () => {
  assert.equal(presentationText("A  B\tC"), "A B C");
  assert.equal(presentationText("Save\u00a020%\u00a0now"), "Save\u00a020%\u00a0now");

  const ordinary = { ...base.brief, offer: "Save 20% on every order" };
  const nonbreaking = {
    ...base.brief,
    offer: "Save\u00a020%\u00a0on\u00a0every\u00a0order",
  };
  assert.notEqual(
    calculateDraftRevision(ordinary, base.draft, base.asset, base.theme),
    calculateDraftRevision(nonbreaking, base.draft, base.asset, base.theme),
  );
  assert.equal(ordinary.offer, "Save 20% on every order");
  assert.equal(nonbreaking.offer, "Save\u00a020%\u00a0on\u00a0every\u00a0order");
});

test("visible notice changes the revision and removing it restores the original", () => {
  const withoutNotice = calculateDraftRevision(
    base.brief,
    base.draft,
    base.asset,
    base.theme,
  );
  const offerNotice = calculateDraftRevision(
    base.brief,
    base.draft,
    base.asset,
    base.theme,
    "Preview · offer provisional",
  );
  const destinationNotice = calculateDraftRevision(
    base.brief,
    base.draft,
    base.asset,
    base.theme,
    "Preview · destination provisional",
  );

  assert.notEqual(offerNotice, withoutNotice);
  assert.notEqual(destinationNotice, offerNotice);
  assert.equal(
    calculateDraftRevision(
      base.brief,
      base.draft,
      base.asset,
      base.theme,
      "Preview · offer provisional",
    ),
    offerNotice,
  );
  assert.equal(
    calculateDraftRevision(base.brief, base.draft, base.asset, base.theme, null),
    withoutNotice,
  );
  assert.equal(
    buildDraftRevisionIdentity(
      base.brief,
      base.draft,
      base.asset,
      base.theme,
      "Preview · offer provisional",
    ).previewNotice,
    "Preview · offer provisional",
  );

  const stale = {
    revision: offerNotice,
    approvalRevision: withoutNotice,
    dirty: false,
    generating: false,
    imagesReady: true,
  };
  assert.equal(isLocalPreviewApproved(stale), false);
  assert.equal(
    sameExportGuard(
      { ...stale, revision: withoutNotice, approvalRevision: withoutNotice },
      stale,
    ),
    false,
  );
});

test("stale approval cannot authorize a newly calculated revision", () => {
  const oldRevision = base.revision;
  const newRevision = revisionWith({
    theme: themeWith({ accent: "#123456" }),
  });
  assert.notEqual(newRevision, oldRevision);

  const stale = {
    revision: newRevision,
    approvalRevision: oldRevision,
    dirty: false,
    generating: false,
    imagesReady: true,
  };
  assert.equal(isLocalPreviewApproved(stale), false);
  assert.equal(
    sameExportGuard(
      { ...stale, revision: oldRevision, approvalRevision: oldRevision },
      stale,
    ),
    false,
  );
  const eligibility = evaluateCampaignExport({
    ...stale,
    supportedFormat: true,
  });
  assert.equal(eligibility.ok, false);
  assert.match(eligibility.reason, /not locally approved/i);
});

test("receipts expose the new identity version and keep v1 receipts readable", async () => {
  const preview = {
    status: "confirmed" as const,
    revision: base.revision,
    revisionIdentityVersion: 4,
    productName: base.brief.productName,
    brandName: base.theme.brand.name,
    offer: base.brief.offer,
    destinationUrl: base.brief.destinationUrl,
    actionLabel: base.brief.actionLabel,
    template: {
      id: base.draft.templateId,
      version: base.draft.templateVersion,
      layout: base.draft.layout,
      sections: base.draft.sections,
    },
    asset: {
      id: base.asset.id,
      contentHash: base.asset.contentHash,
      alt: base.asset.alt,
      width: base.asset.width,
      height: base.asset.height,
      src: base.asset.src,
    },
    verification: null,
  };
  const receipt = await buildExportReceipt({
    preview,
    approval: {
      revision: base.revision,
      approvedAt: "2026-11-18T00:00:00.000Z",
    },
    exportedAt: "2026-11-18T00:00:01.000Z",
    packshotFile: "packshot.webp",
    packshotSha256: base.asset.contentHash,
    files: [],
  });
  assert.equal(receipt.revisionIdentityVersion, 4);

  const legacy = await buildExportReceipt({
    preview: { ...preview, revisionIdentityVersion: undefined },
    approval: {
      revision: base.revision,
      approvedAt: "2026-11-18T00:00:00.000Z",
    },
    exportedAt: "2026-11-18T00:00:01.000Z",
    packshotFile: "packshot.webp",
    packshotSha256: base.asset.contentHash,
    files: [],
  });
  assert.equal("revisionIdentityVersion" in legacy, false);
  assert.equal(legacy.schemaVersion, 1);
});
