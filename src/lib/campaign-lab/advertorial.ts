import {
  BASE_CATALOG,
  createCampaignBrief,
  getAsset,
  getBrand,
  resolveBrandTheme,
} from "./fixtures.ts";
import {
  buildCampaignPreview,
  getDestinationUrlError,
  hashRevision,
  normalizeDestinationUrl,
} from "./template.ts";
import type { CampaignPreviewData } from "./template.ts";
import type {
  AdvertorialBrief,
  AdvertorialDraft,
  AdvertorialFit,
  AdvertorialLayoutId,
  AdvertorialPlan,
  AdvertorialSectionId,
  AdvertorialSectionIssue,
  ApprovedAsset,
  ApprovedStoryBeat,
  AssetAssignment,
  CampaignBrief,
  CampaignCatalog,
  CampaignFixture,
  CampaignFormValues,
  Disclosure,
  ProductFact,
  ResolvedBrandTheme,
  ValidationField,
  ValidationIssue,
} from "./types.ts";

export const ADVERTORIAL_TEMPLATE_ID = "single-product-advertorial" as const;
export const ADVERTORIAL_TEMPLATE_VERSION = "1.0.0" as const;

const DISCLOSURE_LABELS: readonly Disclosure["label"][] = [
  "Advertisement",
  "Advertorial",
  "Paid Post",
  "Paid content",
];

/**
 * The advertorial ends at the product block. The action belongs to that block
 * and is not repeated in a separate close section.
 */
const SECTION_ORDER = {
  full: [
    "disclosure",
    "opening",
    "story",
    "evidence",
    "product",
  ] as AdvertorialSectionId[],
  fullWithoutEvidence: [
    "disclosure",
    "opening",
    "story",
    "product",
  ] as AdvertorialSectionId[],
  onePhoto: [
    "disclosure",
    "opening",
    "story",
    "product",
  ] as AdvertorialSectionId[],
};

const STORY_ROLE_ORDER: Record<ApprovedStoryBeat["role"], number> = {
  opening: 0,
  turn: 1,
  resolution: 2,
};

export const ADVERTORIAL_MANIFEST = {
  id: ADVERTORIAL_TEMPLATE_ID,
  version: ADVERTORIAL_TEMPLATE_VERSION,
  name: "Single product advertorial",
  format: "Story-led single-product advertorial",
  requiredInputs: [
    "brandId",
    "productName",
    "productNoun",
    "offer",
    "destinationUrl",
    "actionLabel",
    "disclosure",
    "openingId",
    "storyBeatIds",
    "productTransition",
    "assetAssignments",
  ],
  allowedAssetRoles: [
    "story-opening",
    "product-detail",
    "product-in-use",
    "product-evidence",
    "product-hero",
  ],
  sectionContract: {
    endsAt: "product",
    primaryAction: {
      section: "product",
      count: 1,
    },
  },
  layouts: {
    "advertorial-full": {
      label: "Advertorial, full material",
      description: "Story, evidence and a product transition with a supporting image set.",
      requiredAssetRoles: ["product-hero"],
      allowedSectionOrders: [SECTION_ORDER.full, SECTION_ORDER.fullWithoutEvidence],
      maxStoryBeats: 3,
      /** Optional-fact capacity; a required group is always rendered whole. */
      maxFacts: 3,
      maxImages: 4,
    },
    "advertorial-one-photo": {
      label: "Advertorial, one photo",
      description: "A type-led opening, short story and product transition with one packshot.",
      requiredAssetRoles: ["product-hero"],
      allowedSectionOrders: [SECTION_ORDER.onePhoto],
      maxStoryBeats: 2,
      /** Optional-fact capacity; a required group is always rendered whole. */
      maxFacts: 2,
      maxImages: 1,
    },
  },
  limits: {
    headline: 90,
    standfirst: 200,
    storyBeat: 280,
    productTransition: 200,
    disclosure: 140,
    byline: 80,
    caption: 120,
    offer: 180,
    actionLabel: 40,
    maxWordsFull: 420,
    maxWordsOnePhoto: 300,
  },
} as const;

function cloneBeat(beat: ApprovedStoryBeat): ApprovedStoryBeat {
  return { ...beat, source: { ...beat.source } };
}

function cloneFact(fact: ProductFact): ProductFact {
  return { ...fact, source: { ...fact.source } };
}

function cloneDisclosure(disclosure: Disclosure): Disclosure {
  return { ...disclosure };
}

function roleAllowedForLayout(role: AssetAssignment["role"], layout: AdvertorialLayoutId): boolean {
  if (layout === "advertorial-one-photo") return role === "product-hero";
  return ADVERTORIAL_MANIFEST.allowedAssetRoles.includes(role);
}

function isPendingRights(value: string): boolean {
  return /pending|unconfirmed|not confirmed|preview only/i.test(value);
}

function wordCount(value: string): number {
  return value.trim() ? value.trim().split(/\s+/).length : 0;
}

function sectionIssue(
  section: AdvertorialSectionIssue["section"],
  message: string,
): AdvertorialSectionIssue {
  return { section, message };
}

function storyBeatsInArc(beats: readonly ApprovedStoryBeat[]): ApprovedStoryBeat[] {
  return [...beats].sort((left, right) => {
    const byRole = STORY_ROLE_ORDER[left.role] - STORY_ROLE_ORDER[right.role];
    return byRole;
  });
}

function requiredFactIds(brief: CampaignBrief): string[] {
  const ids = new Set<string>();
  for (const group of brief.requiredFactGroups ?? []) {
    for (const id of group.factIds) ids.add(id);
  }
  return [...ids];
}

function selectFacts(brief: CampaignBrief, capacity: number): ProductFact[] {
  const required = new Set(requiredFactIds(brief));
  const selected: ProductFact[] = [];
  const seen = new Set<string>();

  // A required group is atomic: it renders whole even when that exceeds the
  // layout's optional-fact capacity. Optional facts then fill up to capacity.
  for (const id of required) {
    const fact = brief.productFacts.find((candidate) => candidate.id === id);
    if (fact && !seen.has(fact.id)) {
      selected.push(cloneFact(fact));
      seen.add(fact.id);
    }
  }
  const target = Math.max(capacity, selected.length);
  for (const fact of brief.productFacts) {
    if (selected.length >= target) break;
    if (seen.has(fact.id)) continue;
    selected.push(cloneFact(fact));
    seen.add(fact.id);
  }
  return selected;
}

function selectedOpening(brief: AdvertorialBrief) {
  return (
    brief.advertorial.openings.find((opening) => opening.id === brief.openingFocus) ??
    brief.advertorial.openings[0]
  );
}

function layoutCanUseApprovedAssignments(
  brief: AdvertorialBrief,
  layout: AdvertorialLayoutId,
): boolean {
  const usable = brief.advertorial.assetAssignments.filter((assignment) =>
    roleAllowedForLayout(assignment.role, layout),
  );
  return layout === "advertorial-full" ? usable.length >= 2 : usable.length >= 1;
}

function layoutForBrief(
  brief: AdvertorialBrief,
  requested: AdvertorialLayoutId | "auto" = "auto",
): AdvertorialLayoutId {
  if (requested !== "auto") return requested;
  const preferred = brief.advertorial.preferredLayout;
  if (preferred) {
    if (layoutCanUseApprovedAssignments(brief, preferred)) return preferred;
    const fallback =
      preferred === "advertorial-full" ? "advertorial-one-photo" : "advertorial-full";
    if (layoutCanUseApprovedAssignments(brief, fallback)) return fallback;
    return preferred;
  }
  return layoutCanUseApprovedAssignments(brief, "advertorial-full")
    ? "advertorial-full"
    : "advertorial-one-photo";
}

function approvedAssignmentForRole(
  brief: AdvertorialBrief,
  role: AssetAssignment["role"],
): AssetAssignment | undefined {
  return brief.advertorial.assetAssignments.find((assignment) => assignment.role === role);
}

function assignmentsForLayout(
  brief: AdvertorialBrief,
  layout: AdvertorialLayoutId,
): AssetAssignment[] {
  // The campaign's approved assignments are the only source of truth. The
  // editor's selected asset never replaces the approved packshot.
  const assignments = brief.advertorial.assetAssignments
    .filter((assignment) => roleAllowedForLayout(assignment.role, layout))
    .map((assignment) => ({ ...assignment }));

  const seenRoles = new Set<string>();
  return assignments.filter((assignment) => {
    if (seenRoles.has(assignment.role)) return false;
    seenRoles.add(assignment.role);
    return true;
  });
}

export function createAdvertorialBrief(
  fixture: CampaignFixture,
  values: CampaignFormValues,
): AdvertorialBrief | null {
  if (!fixture.brief.advertorial) return null;
  const base = createCampaignBrief(fixture, values);
  const data = fixture.brief.advertorial;
  return {
    ...base,
    format: "advertorial",
    openingFocus: values.openingFocus ?? base.openingFocus,
    sourceCampaign: base.sourceCampaign ? { ...base.sourceCampaign } : undefined,
    advertorial: {
      ...data,
      openings: data.openings.map((opening) => ({ ...opening })),
      storyBeats: data.storyBeats.map(cloneBeat),
      narrator: data.narrator ? { ...data.narrator } : undefined,
      disclosure: cloneDisclosure(data.disclosure),
      assetAssignments: data.assetAssignments.map((assignment) => ({ ...assignment })),
    },
  };
}

function advertorialDataMissingInputs(
  fixture: CampaignFixture,
  catalog: CampaignCatalog,
): string[] {
  if (fixture.brief.advertorial) return [];
  const missing = [
    "An approved advertorial opening (headline and standfirst)",
    "Two or three approved story beats with a source quote",
    "A commercial disclosure (label, sponsor, explanation)",
    "A product transition sentence",
    "Approved image roles beyond the product packshot",
  ];
  if (catalog.pilot?.status === "preview") {
    missing.push(
      "Confirmed final offer and direct destination (current pilot values are preview placeholders)",
      "Confirmed media rights for the packshot and any supporting image",
    );
  }
  return missing;
}

type AdvertorialEvaluation =
  | {
      ok: true;
      brief: AdvertorialBrief;
      draft: AdvertorialDraft;
      assets: AdvertorialResolvedAsset[];
      hero: ApprovedAsset;
      layout: AdvertorialLayoutId;
    }
  | {
      ok: false;
      brief: AdvertorialBrief | null;
      layout: AdvertorialLayoutId;
      issues: AdvertorialSectionIssue[];
    };

/**
 * One pipeline for fit and generation: validate the brief, assemble the draft
 * for the requested layout, validate that draft, then resolve its assets.
 */
function evaluateAdvertorial(
  fixture: CampaignFixture,
  values: CampaignFormValues,
  catalog: CampaignCatalog,
): AdvertorialEvaluation {
  const brief = createAdvertorialBrief(fixture, values);
  if (!brief) {
    return {
      ok: false,
      brief: null,
      layout: "advertorial-full",
      issues: [
        sectionIssue(
          "brief",
          "This brief has no approved advertorial story, disclosure, or image roles. Use the single-product offer template.",
        ),
      ],
    };
  }

  const layout = layoutForBrief(brief, values.advertorialLayout ?? "auto");
  const briefIssues = validateAdvertorialBrief(brief, catalog, layout);
  if (briefIssues.length > 0) {
    return { ok: false, brief, layout, issues: briefIssues };
  }

  const draft = assembleAdvertorialDraft(brief, layout);
  const draftIssues = validateAdvertorialDraft(brief, draft, catalog);
  if (draftIssues.length > 0) {
    return { ok: false, brief, layout, issues: draftIssues };
  }

  const resolved = resolveAdvertorialAssets(draft, catalog);
  if (resolved.issues.length > 0) {
    return { ok: false, brief, layout, issues: resolved.issues };
  }

  const hero = resolved.assets.find((entry) => entry.assignment.role === "product-hero")?.asset;
  if (!hero) {
    return {
      ok: false,
      brief,
      layout,
      issues: [sectionIssue("asset", "The advertorial needs one approved product-hero image.")],
    };
  }

  return { ok: true, brief, draft, assets: resolved.assets, hero, layout };
}

export function assessAdvertorialFit(
  fixture: CampaignFixture,
  values: CampaignFormValues,
  catalog: CampaignCatalog = BASE_CATALOG,
): AdvertorialFit {
  const missing = advertorialDataMissingInputs(fixture, catalog);
  const requested = values.advertorialLayout ?? "auto";
  const evaluation = evaluateAdvertorial(fixture, values, catalog);
  const layout = evaluation.layout;

  if (!evaluation.ok) {
    for (const issue of evaluation.issues) {
      if (!missing.includes(issue.message)) missing.push(issue.message);
    }
  }

  let compatibleLayout: AdvertorialLayoutId | undefined;
  if (!evaluation.ok && fixture.brief.advertorial) {
    const alternatives: AdvertorialLayoutId[] = [
      layout === "advertorial-full" ? "advertorial-one-photo" : "advertorial-full",
    ];
    for (const alternative of alternatives) {
      const candidate = evaluateAdvertorial(
        fixture,
        { ...values, advertorialLayout: alternative },
        catalog,
      );
      if (candidate.ok) {
        compatibleLayout = alternative;
        break;
      }
    }
  }

  const layoutReason = evaluation.ok
    ? undefined
    : evaluation.issues.find(
        (issue) => issue.section === "layout" || issue.section === "asset",
      )?.message ??
      (requested !== "auto"
        ? `The ${ADVERTORIAL_MANIFEST.layouts[layout].label} layout cannot render this brief.`
        : undefined);

  return {
    fit: evaluation.ok,
    recommended:
      evaluation.ok || compatibleLayout
        ? "single-product-advertorial"
        : "single-product-offer",
    layout,
    ...(compatibleLayout ? { compatibleLayout } : {}),
    ...(layoutReason ? { layoutReason } : {}),
    missingInputs: missing,
  };
}

export function validateAdvertorialBrief(
  brief: AdvertorialBrief,
  catalog: CampaignCatalog = BASE_CATALOG,
  requestedLayout: AdvertorialLayoutId = layoutForBrief(brief),
): AdvertorialSectionIssue[] {
  const issues: AdvertorialSectionIssue[] = [];
  const data = brief.advertorial;
  const limits = ADVERTORIAL_MANIFEST.limits;
  const approvedLayout = layoutForBrief(brief);

  if (!getBrand(brief.brandId, catalog).tokens) {
    issues.push(sectionIssue("brief", "Choose one of the supported brand styles."));
  }
  if (!brief.productName.trim()) {
    issues.push(sectionIssue("product", "Add the approved product name."));
  }
  if (!brief.productNoun.trim()) {
    issues.push(sectionIssue("product", "Add the approved product noun."));
  }
  if (!brief.offer.trim()) {
    issues.push(sectionIssue("product", "Add the approved offer before previewing."));
  } else if (brief.offer.length > limits.offer) {
    issues.push(sectionIssue("product", `The offer must be ${limits.offer} characters or fewer.`));
  }
  const destinationError = getDestinationUrlError(brief.destinationUrl);
  if (destinationError) {
    issues.push(sectionIssue("product", destinationError));
  }
  if (!brief.actionLabel.trim()) {
    issues.push(sectionIssue("product", "Add the approved action label."));
  } else if (brief.actionLabel.length > limits.actionLabel) {
    issues.push(
      sectionIssue("product", `The action label must be ${limits.actionLabel} characters or fewer.`),
    );
  }

  const disclosure = data.disclosure;
  if (!disclosure?.label || !DISCLOSURE_LABELS.includes(disclosure.label)) {
    issues.push(
      sectionIssue("disclosure", "Choose an approved disclosure label for this publication surface."),
    );
  }
  if (!disclosure?.sponsor?.trim()) {
    issues.push(sectionIssue("disclosure", "Add the sponsor named in the disclosure."));
  }
  if (!disclosure?.explanation?.trim()) {
    issues.push(
      sectionIssue("disclosure", "Add the disclosure explanation naming who created or paid for the page."),
    );
  }
  if (disclosure?.explanation && disclosure.explanation.length > limits.disclosure) {
    issues.push(
      sectionIssue("disclosure", `The disclosure must be ${limits.disclosure} characters or fewer.`),
    );
  }

  const openings = data.openings ?? [];
  if (openings.length === 0) {
    issues.push(sectionIssue("opening", "Add an approved advertorial opening."));
  } else if (
    brief.openingFocus &&
    !openings.some((candidate) => candidate.id === brief.openingFocus)
  ) {
    issues.push(
      sectionIssue("opening", "Choose an approved advertorial opening for this campaign."),
    );
  }
  const opening = selectedOpening(brief);
  if (!opening) {
    issues.push(sectionIssue("opening", "Choose an approved advertorial opening."));
  } else {
    if (!opening.headline.trim()) {
      issues.push(sectionIssue("opening", "The approved advertorial headline is empty."));
    } else if (opening.headline.length > limits.headline) {
      issues.push(
        sectionIssue("opening", `The headline must be ${limits.headline} characters or fewer.`),
      );
    }
    if (!opening.standfirst.trim()) {
      issues.push(sectionIssue("opening", "The approved standfirst is empty."));
    } else if (opening.standfirst.length > limits.standfirst) {
      issues.push(
        sectionIssue("opening", `The standfirst must be ${limits.standfirst} characters or fewer.`),
      );
    }
    if (
      opening.headline.trim().toLowerCase() === opening.standfirst.trim().toLowerCase()
    ) {
      issues.push(sectionIssue("opening", "The headline and standfirst repeat each other."));
    }
  }

  if (!data.productTransition.trim()) {
    issues.push(sectionIssue("product", "Add the approved product transition sentence."));
  } else if (data.productTransition.length > limits.productTransition) {
    issues.push(
      sectionIssue(
        "product",
        `The product transition must be ${limits.productTransition} characters or fewer.`,
      ),
    );
  }

  const beats = data.storyBeats ?? [];
  if (beats.length < 2) {
    issues.push(sectionIssue("story", "Add at least two approved story beats."));
  }
  if (beats.length > 3) {
    issues.push(sectionIssue("story", "The advertorial accepts at most three story beats."));
  }
  const beatIds = new Set<string>();
  let lastRole = -1;
  for (const beat of beats) {
    if (!beat.id?.trim()) {
      issues.push(sectionIssue("story", "Every story beat needs an approved ID."));
    }
    if (beatIds.has(beat.id)) {
      issues.push(sectionIssue("story", `Story beat "${beat.id}" appears more than once.`));
    }
    beatIds.add(beat.id);
    if (!beat.text.trim()) {
      issues.push(sectionIssue("story", `Story beat "${beat.id}" has no approved text.`));
    } else if (beat.text.length > limits.storyBeat) {
      issues.push(
        sectionIssue("story", `Story beat "${beat.id}" exceeds ${limits.storyBeat} characters.`),
      );
    }
    if (!beat.source?.quote?.trim()) {
      issues.push(sectionIssue("story", `Story beat "${beat.id}" has no approved source quote.`));
    }
    const roleIndex = STORY_ROLE_ORDER[beat.role];
    if (roleIndex < lastRole) {
      issues.push(
        sectionIssue("story", `Story beat "${beat.id}" is outside the approved opening-to-turn arc.`),
      );
    }
    lastRole = Math.max(lastRole, roleIndex);
  }

  if (brief.productFacts.length < 2) {
    issues.push(sectionIssue("evidence", "Add at least two approved product facts."));
  }
  const factIds = new Set<string>();
  for (const fact of brief.productFacts) {
    if (factIds.has(fact.id)) {
      issues.push(sectionIssue("evidence", `Fact "${fact.id}" appears more than once.`));
    }
    factIds.add(fact.id);
    if (!fact.source?.quote?.trim()) {
      issues.push(sectionIssue("evidence", `Fact "${fact.id}" has no approved source quote.`));
    }
  }
  for (const group of brief.requiredFactGroups ?? []) {
    for (const id of group.factIds) {
      if (!factIds.has(id)) {
        issues.push(
          sectionIssue(
            "evidence",
            `Required fact group "${group.label || group.id}" references unapproved fact "${id}".`,
          ),
        );
      }
    }
  }

  if (
    brief.copy.lede &&
    /\b(I|we|my|our)\b/.test(
      [opening?.headline, opening?.standfirst, ...beats.map((beat) => beat.text)]
        .filter(Boolean)
        .join(" "),
    )
  ) {
    if (!data.narrator?.releaseOnFile) {
      issues.push(
        sectionIssue("story", "First-person copy needs a named narrator with a release on file."),
      );
    }
  }

  const assignments = data.assetAssignments ?? [];
  const roles = new Set<string>();
  const assetIds = new Set<string>();
  for (const assignment of assignments) {
    if (!roleAllowedForLayout(assignment.role, approvedLayout)) {
      issues.push(
        sectionIssue(
          "asset",
          `The ${assignment.role} image role is not available in this layout.`,
        ),
      );
    }
    if (roles.has(assignment.role)) {
      issues.push(
        sectionIssue("asset", `The ${assignment.role} image role is assigned more than once.`),
      );
    }
    roles.add(assignment.role);
    if (assetIds.has(assignment.assetId)) {
      issues.push(sectionIssue("asset", `Asset "${assignment.assetId}" is assigned more than once.`));
    }
    assetIds.add(assignment.assetId);

    const asset = getAsset(assignment.assetId, catalog);
    if (!asset) {
      issues.push(
        sectionIssue("asset", `Asset "${assignment.assetId}" is not in the approved asset library.`),
      );
      continue;
    }
    if (!asset.reviewed) {
      issues.push(sectionIssue("asset", `Asset "${asset.id}" has not been reviewed.`));
    }
    if (!asset.alt.trim()) {
      issues.push(sectionIssue("asset", `Asset "${asset.id}" needs reviewed alt text.`));
    }
    if (isPendingRights(asset.rights)) {
      issues.push(
        sectionIssue("asset", `Asset "${asset.id}" still has rights pending confirmation.`),
      );
    }
    if (!/^[a-f0-9]{64}$/i.test(asset.contentHash)) {
      issues.push(sectionIssue("asset", `Asset "${asset.id}" needs a content hash.`));
    }
    if (asset.role !== assignment.role) {
      issues.push(
        sectionIssue(
          "asset",
          `Asset "${asset.id}" is approved as ${asset.role}, not ${assignment.role}.`,
        ),
      );
    }
    if (asset.brandId !== brief.brandId) {
      issues.push(
        sectionIssue(
          "asset",
          `Asset "${asset.id}" belongs to ${asset.brandId}, not the approved campaign brand ${brief.brandId}.`,
        ),
      );
    }
    if (asset.caption && asset.caption.length > limits.caption) {
      issues.push(
        sectionIssue("asset", `Asset "${asset.id}" caption exceeds ${limits.caption} characters.`),
      );
    }
  }
  const approvedHero = approvedAssignmentForRole(brief, "product-hero");
  if (!roles.has("product-hero")) {
    issues.push(
      sectionIssue("asset", "The advertorial needs one approved product-hero image."),
    );
  } else if (!approvedHero) {
    issues.push(
      sectionIssue("asset", "The campaign has no approved product-hero assignment."),
    );
  } else if (brief.assetId !== approvedHero.assetId) {
    issues.push(
      sectionIssue(
        "asset",
        `The selected image "${brief.assetId}" is not the campaign's approved packshot "${approvedHero.assetId}".`,
      ),
    );
  }

  if (catalog.pilot?.status === "preview") {
    const pilotRights = catalog.assets
      .filter((asset) => asset.brandId === brief.brandId)
      .find((asset) => isPendingRights(asset.rights));
    if (pilotRights) {
      issues.push(
        sectionIssue(
          "disclosure",
          "Confirm media rights and the final offer before this preview can be published.",
        ),
      );
    }
  }

  const words =
    wordCount(opening?.headline ?? "") +
    wordCount(opening?.standfirst ?? "") +
    beats.reduce((total, beat) => total + wordCount(beat.text), 0) +
    wordCount(data.productTransition) +
    wordCount(brief.offer);
  const maxWords =
    requestedLayout === "advertorial-full"
      ? limits.maxWordsFull
      : limits.maxWordsOnePhoto;
  if (words > maxWords) {
    issues.push(
      sectionIssue("story", `The page uses ${words} words; this layout allows ${maxWords}.`),
    );
  }

  return issues;
}

export function assembleAdvertorialDraft(
  brief: AdvertorialBrief,
  requestedLayout: AdvertorialLayoutId | "auto" = "auto",
): AdvertorialDraft {
  const layout = layoutForBrief(brief, requestedLayout);
  const maxBeats = ADVERTORIAL_MANIFEST.layouts[layout].maxStoryBeats;
  const maxFacts = ADVERTORIAL_MANIFEST.layouts[layout].maxFacts;
  const opening = selectedOpening(brief);
  const story = storyBeatsInArc(brief.advertorial.storyBeats).slice(0, maxBeats);
  const facts = selectFacts(brief, maxFacts);
  const assetAssignments = assignmentsForLayout(brief, layout);
  const sections =
    layout === "advertorial-full"
      ? [...SECTION_ORDER.fullWithoutEvidence]
      : [...SECTION_ORDER.onePhoto];

  return {
    templateId: ADVERTORIAL_TEMPLATE_ID,
    templateVersion: ADVERTORIAL_TEMPLATE_VERSION,
    layout,
    layoutReason:
      layout === "advertorial-full"
        ? "The approved story and its two supporting images earn the full sequence; the facts sit with the product."
        : "One reviewed packshot supports the one-photo composition; the opening stays type-led.",
    sections,
    headline: opening?.headline ?? "",
    standfirst: opening?.standfirst ?? "",
    story: story.map(cloneBeat),
    facts,
    productTransition: brief.advertorial.productTransition,
    disclosure: cloneDisclosure(brief.advertorial.disclosure),
    assetAssignments,
  };
}

function sameDisclosure(left: Disclosure, right: Disclosure): boolean {
  return (
    left.label === right.label &&
    left.sponsor === right.sponsor &&
    left.explanation === right.explanation &&
    left.repeatAtClose === right.repeatAtClose
  );
}

export function validateAdvertorialDraft(
  brief: AdvertorialBrief,
  draft: AdvertorialDraft,
  catalog: CampaignCatalog = BASE_CATALOG,
): AdvertorialSectionIssue[] {
  const issues: AdvertorialSectionIssue[] = [];
  const limits = ADVERTORIAL_MANIFEST.limits;

  if (
    draft.templateId !== ADVERTORIAL_TEMPLATE_ID ||
    draft.templateVersion !== ADVERTORIAL_TEMPLATE_VERSION
  ) {
    issues.push(sectionIssue("brief", "The draft does not use the current template version."));
  }

  const layout = ADVERTORIAL_MANIFEST.layouts[draft.layout];
  if (!layout) {
    issues.push(sectionIssue("layout", "The draft uses an unsupported advertorial layout."));
    return issues;
  }

  const allowed = layout.allowedSectionOrders.some(
    (order) =>
      order.length === draft.sections.length &&
      order.every((section, index) => section === draft.sections[index]),
  );
  if (!allowed) {
    issues.push(
      sectionIssue("layout", `The section order is not supported by ${layout.label}.`),
    );
  }
  if (draft.sections[0] !== "disclosure") {
    issues.push(sectionIssue("disclosure", "The disclosure must be the first section."));
  }
  if (draft.sections.indexOf("product") < 0) {
    issues.push(sectionIssue("product", "The advertorial needs a product transition section."));
  }
  if (draft.sections[draft.sections.length - 1] !== "product") {
    issues.push(
      sectionIssue(
        "layout",
        "The advertorial must end at the product block with its one primary action.",
      ),
    );
  }
  if (draft.sections.includes("close")) {
    issues.push(
      sectionIssue(
        "layout",
        "The closing action section is not part of this template; the product block carries the single action.",
      ),
    );
  }
  if (draft.sections.includes("evidence") && draft.facts.length === 0) {
    issues.push(sectionIssue("evidence", "An evidence section needs at least one approved fact."));
  }

  const opening = brief.advertorial.openings.find(
    (candidate) =>
      candidate.headline === draft.headline && candidate.standfirst === draft.standfirst,
  );
  if (!opening) {
    issues.push(sectionIssue("opening", "The draft headline and standfirst are not an approved opening."));
  }
  if (!draft.headline.trim()) {
    issues.push(sectionIssue("opening", "The opening headline is empty."));
  } else if (draft.headline.length > limits.headline) {
    issues.push(
      sectionIssue("opening", `The headline must be ${limits.headline} characters or fewer.`),
    );
  }
  if (!draft.standfirst.trim()) {
    issues.push(sectionIssue("opening", "The standfirst is empty."));
  } else if (draft.standfirst.length > limits.standfirst) {
    issues.push(
      sectionIssue("opening", `The standfirst must be ${limits.standfirst} characters or fewer.`),
    );
  }
  if (draft.headline.trim().toLowerCase() === draft.standfirst.trim().toLowerCase()) {
    issues.push(sectionIssue("opening", "The headline and standfirst repeat each other."));
  }

  if (draft.story.length < 2) {
    issues.push(sectionIssue("story", "The advertorial needs at least two approved story beats."));
  }
  if (draft.story.length > layout.maxStoryBeats) {
    issues.push(
      sectionIssue("story", `${layout.label} accepts at most ${layout.maxStoryBeats} story beats.`),
    );
  }
  const beatIds = new Set<string>();
  let lastRole = -1;
  for (const beat of draft.story) {
    if (beatIds.has(beat.id)) {
      issues.push(sectionIssue("story", `Story beat "${beat.id}" appears more than once.`));
    }
    beatIds.add(beat.id);
    const approved = brief.advertorial.storyBeats.find((candidate) => candidate.id === beat.id);
    if (!approved) {
      issues.push(sectionIssue("story", `Story beat "${beat.id}" is not approved for this campaign.`));
      continue;
    }
    if (approved.text !== beat.text || approved.role !== beat.role) {
      issues.push(sectionIssue("story", `Story beat "${beat.id}" does not match its approved text.`));
    }
    if (!beat.source?.quote?.trim()) {
      issues.push(sectionIssue("story", `Story beat "${beat.id}" has no approved source quote.`));
    }
    if (beat.text.length > limits.storyBeat) {
      issues.push(
        sectionIssue("story", `Story beat "${beat.id}" exceeds ${limits.storyBeat} characters.`),
      );
    }
    const roleIndex = STORY_ROLE_ORDER[beat.role];
    if (roleIndex < lastRole) {
      issues.push(
        sectionIssue("story", `Story beat "${beat.id}" is outside the approved opening-to-turn arc.`),
      );
    }
    lastRole = Math.max(lastRole, roleIndex);
  }

  const requiredIds = new Set(requiredFactIds(brief));
  const optionalFacts = draft.facts.filter((fact) => !requiredIds.has(fact.id));
  if (optionalFacts.length > layout.maxFacts) {
    issues.push(
      sectionIssue(
        "evidence",
        `${layout.label} accepts at most ${layout.maxFacts} optional facts.`,
      ),
    );
  }
  const factIds = new Set<string>();
  for (const fact of draft.facts) {
    if (factIds.has(fact.id)) {
      issues.push(sectionIssue("evidence", `Fact "${fact.id}" appears more than once.`));
    }
    factIds.add(fact.id);
    const approved = brief.productFacts.find((candidate) => candidate.id === fact.id);
    if (!approved) {
      issues.push(sectionIssue("evidence", `Fact "${fact.id}" is not approved for this campaign.`));
      continue;
    }
    if (
      approved.label !== fact.label ||
      approved.value !== fact.value ||
      approved.source.quote !== fact.source.quote
    ) {
      issues.push(sectionIssue("evidence", `Fact "${fact.id}" does not match its approved source text.`));
    }
  }
  for (const group of brief.requiredFactGroups ?? []) {
    const missing = group.factIds.filter((id) => !factIds.has(id));
    if (missing.length > 0) {
      issues.push(
        sectionIssue(
          "evidence",
          `Required fact group "${group.label || group.id}" is incomplete; missing ${missing.join(", ")}.`,
        ),
      );
    }
  }

  if (!sameDisclosure(brief.advertorial.disclosure, draft.disclosure)) {
    issues.push(sectionIssue("disclosure", "The draft disclosure does not match the approved disclosure."));
  }
  if (!draft.productTransition.trim()) {
    issues.push(sectionIssue("product", "The product transition is empty."));
  } else if (draft.productTransition !== brief.advertorial.productTransition) {
    issues.push(sectionIssue("product", "The product transition does not match the approved copy."));
  }

  if (draft.assetAssignments.length > layout.maxImages) {
    issues.push(
      sectionIssue("asset", `${layout.label} accepts at most ${layout.maxImages} images.`),
    );
  }
  const roles = new Set<string>();
  const assetIds = new Set<string>();
  for (const assignment of draft.assetAssignments) {
    if (!roleAllowedForLayout(assignment.role, draft.layout)) {
      issues.push(
        sectionIssue("asset", `The ${assignment.role} image role is not allowed in this layout.`),
      );
    }
    if (roles.has(assignment.role)) {
      issues.push(sectionIssue("asset", `The ${assignment.role} role appears more than once.`));
    }
    roles.add(assignment.role);
    if (assetIds.has(assignment.assetId)) {
      issues.push(sectionIssue("asset", `Asset "${assignment.assetId}" appears more than once.`));
    }
    assetIds.add(assignment.assetId);

    const approvedAssignment = brief.advertorial.assetAssignments.find(
      (candidate) =>
        candidate.role === assignment.role && candidate.assetId === assignment.assetId,
    );
    if (!approvedAssignment) {
      issues.push(
        sectionIssue(
          "asset",
          `Asset "${assignment.assetId}" is not the campaign's approved ${assignment.role} assignment.`,
        ),
      );
    }

    const asset = getAsset(assignment.assetId, catalog);
    if (!asset) {
      issues.push(
        sectionIssue("asset", `Asset "${assignment.assetId}" is not in the approved asset library.`),
      );
      continue;
    }
    if (!asset.reviewed) {
      issues.push(sectionIssue("asset", `Asset "${asset.id}" has not been reviewed.`));
    }
    if (!asset.alt.trim()) {
      issues.push(sectionIssue("asset", `Asset "${asset.id}" needs reviewed alt text.`));
    }
    if (isPendingRights(asset.rights)) {
      issues.push(sectionIssue("asset", `Asset "${asset.id}" still has rights pending confirmation.`));
    }
    if (asset.role !== assignment.role) {
      issues.push(
        sectionIssue(
          "asset",
          `Asset "${asset.id}" is approved as ${asset.role}, not ${assignment.role}.`,
        ),
      );
    }
    if (asset.brandId !== brief.brandId) {
      issues.push(
        sectionIssue(
          "asset",
          `Asset "${asset.id}" belongs to ${asset.brandId}, not the approved campaign brand ${brief.brandId}.`,
        ),
      );
    }
  }
  const approvedHero = approvedAssignmentForRole(brief, "product-hero");
  if (!roles.has("product-hero")) {
    issues.push(sectionIssue("asset", "The draft has no product-hero image."));
  } else if (!approvedHero) {
    issues.push(sectionIssue("asset", "The campaign has no approved product-hero assignment."));
  } else if (brief.assetId !== approvedHero.assetId) {
    issues.push(
      sectionIssue(
        "asset",
        `The draft uses "${brief.assetId}" but the campaign's approved packshot is "${approvedHero.assetId}".`,
      ),
    );
  }
  if (draft.layout === "advertorial-one-photo" && draft.assetAssignments.length !== 1) {
    issues.push(
      sectionIssue("asset", "The one-photo layout needs exactly one product-hero image."),
    );
  }
  if (
    draft.layout === "advertorial-full" &&
    draft.assetAssignments.length < 2
  ) {
    issues.push(
      sectionIssue(
        "asset",
        "The full layout needs at least two approved images; use the one-photo layout for one usable photo.",
      ),
    );
  }

  const words =
    wordCount(draft.headline) +
    wordCount(draft.standfirst) +
    draft.story.reduce((total, beat) => total + wordCount(beat.text), 0) +
    wordCount(draft.productTransition) +
    wordCount(brief.offer);
  const maxWords =
    draft.layout === "advertorial-full"
      ? limits.maxWordsFull
      : limits.maxWordsOnePhoto;
  if (words > maxWords) {
    issues.push(sectionIssue("story", `The page uses ${words} words; this layout allows ${maxWords}.`));
  }

  return issues;
}

export type AdvertorialResolvedAsset = {
  assignment: AssetAssignment;
  asset: ApprovedAsset;
};

export type AdvertorialPreviewData = {
  brief: AdvertorialBrief;
  draft: AdvertorialDraft;
  asset: ApprovedAsset;
  assets: AdvertorialResolvedAsset[];
  theme: ResolvedBrandTheme;
  revision: string;
};

export type AdvertorialPreviewResult =
  | { ok: true; preview: AdvertorialPreviewData }
  | { ok: false; issues: ValidationIssue[]; sectionIssues: AdvertorialSectionIssue[] };

function sectionToField(section: AdvertorialSectionIssue["section"]): ValidationField {
  switch (section) {
    case "layout":
      return "advertorialLayout";
    case "asset":
      return "assetId";
    case "product":
      return "offer";
    default:
      return "format";
  }
}

export function advertorialIssuesToValidation(
  issues: AdvertorialSectionIssue[],
): ValidationIssue[] {
  return issues.map((issue) => ({
    field: sectionToField(issue.section),
    message: issue.message,
  }));
}

export function calculateAdvertorialRevision(
  brief: AdvertorialBrief,
  draft: AdvertorialDraft,
  assets: readonly ApprovedAsset[],
  theme: ResolvedBrandTheme,
): string {
  const payload = {
    template: {
      id: draft.templateId,
      version: draft.templateVersion,
    },
    layout: draft.layout,
    layoutReason: draft.layoutReason,
    sections: draft.sections,
    brand: {
      id: theme.brand.id,
      name: theme.brand.name,
      wordmark: theme.brand.wordmark,
      descriptor: theme.brand.descriptor,
      headlineMode: theme.brand.headlineMode,
      detailTitle: theme.brand.detailTitle,
    },
    // Every token can change a rendered color, type style, crop or label.
    theme: { ...theme.tokens },
    campaign: {
      fixtureId: brief.fixtureId,
      productName: brief.productName,
      productNoun: brief.productNoun,
      offer: brief.offer,
      destinationUrl: normalizeDestinationUrl(brief.destinationUrl),
      actionLabel: brief.actionLabel,
      requiredFactGroups: brief.requiredFactGroups ?? [],
      openingFocus: brief.openingFocus ?? null,
      sourceCampaign: brief.sourceCampaign ?? null,
    },
    headline: draft.headline,
    standfirst: draft.standfirst,
    disclosure: draft.disclosure,
    narrator: brief.advertorial.narrator ?? null,
    story: draft.story,
    facts: draft.facts,
    productTransition: draft.productTransition,
    assetAssignments: draft.assetAssignments,
    assets: assets.map((asset) => ({
      id: asset.id,
      brandId: asset.brandId,
      role: asset.role,
      src: asset.src,
      width: asset.width,
      height: asset.height,
      contentHash: asset.contentHash,
      alt: asset.alt,
      caption: asset.caption ?? null,
      crop: asset.crop ?? null,
      imageBlend: theme.tokens.imageBlend,
    })),
  };

  return hashRevision(JSON.stringify(payload));
}

export function resolveAdvertorialAssets(
  draft: AdvertorialDraft,
  catalog: CampaignCatalog = BASE_CATALOG,
): { assets: AdvertorialResolvedAsset[]; issues: AdvertorialSectionIssue[] } {
  const issues: AdvertorialSectionIssue[] = [];
  const assets: AdvertorialResolvedAsset[] = [];
  for (const assignment of draft.assetAssignments) {
    const asset = getAsset(assignment.assetId, catalog);
    if (!asset) {
      issues.push(
        sectionIssue("product", `Asset "${assignment.assetId}" is not in the approved asset library.`),
      );
      continue;
    }
    assets.push({ assignment, asset });
  }
  return { assets, issues };
}

export function buildAdvertorialPreview(
  fixture: CampaignFixture,
  values: CampaignFormValues,
  catalog: CampaignCatalog = BASE_CATALOG,
): AdvertorialPreviewResult {
  const evaluation = evaluateAdvertorial(fixture, values, catalog);
  if (!evaluation.ok) {
    return {
      ok: false,
      issues: advertorialIssuesToValidation(evaluation.issues),
      sectionIssues: evaluation.issues,
    };
  }

  const theme = resolveBrandTheme(values.brandId, values.accent, catalog);
  const revision = calculateAdvertorialRevision(
    evaluation.brief,
    evaluation.draft,
    evaluation.assets.map((entry) => entry.asset),
    theme,
  );

  return {
    ok: true,
    preview: {
      brief: evaluation.brief,
      draft: evaluation.draft,
      asset: evaluation.hero,
      assets: evaluation.assets,
      theme,
      revision,
    },
  };
}

export type ConfiguredPreviewData = CampaignPreviewData | AdvertorialPreviewData;

export type ConfiguredPreviewResult =
  | { ok: true; preview: ConfiguredPreviewData }
  | { ok: false; issues: ValidationIssue[] };

/**
 * One editor entry point. The selected format chooses the template; the offer
 * path keeps its existing plan/model boundary and the advertorial path is
 * assembled deterministically from approved brief material.
 */
export function buildConfiguredPreview(
  fixture: CampaignFixture,
  values: CampaignFormValues,
  catalog: CampaignCatalog = BASE_CATALOG,
): ConfiguredPreviewResult {
  const format =
    values.format ?? (fixture.brief.advertorial ? "advertorial" : "offer");
  if (format === "advertorial") {
    return buildAdvertorialPreview(fixture, values, catalog);
  }
  const offer = buildCampaignPreview(fixture, values, catalog);
  if (!offer.ok) return offer;
  return { ok: true, preview: offer.preview };
}

export function advertorialPlanFromDraft(draft: AdvertorialDraft): AdvertorialPlan {
  return {
    openingId: draft.headline,
    layout: draft.layout,
    sections: [...draft.sections],
    storyBeatIds: draft.story.map((beat) => beat.id),
    factIds: draft.facts.map((fact) => fact.id),
    assetAssignments: draft.assetAssignments.map((assignment) => ({ ...assignment })),
  };
}

