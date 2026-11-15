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

const SECTION_ORDER = {
  full: [
    "disclosure",
    "opening",
    "story",
    "evidence",
    "product",
    "close",
  ] as AdvertorialSectionId[],
  fullWithoutEvidence: [
    "disclosure",
    "opening",
    "story",
    "product",
    "close",
  ] as AdvertorialSectionId[],
  onePhoto: [
    "disclosure",
    "opening",
    "story",
    "product",
    "close",
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
  layouts: {
    "advertorial-full": {
      label: "Advertorial, full material",
      description: "Story, evidence and a product transition with a supporting image set.",
      requiredAssetRoles: ["product-hero"],
      allowedSectionOrders: [SECTION_ORDER.full, SECTION_ORDER.fullWithoutEvidence],
      maxStoryBeats: 3,
      maxFacts: 3,
      maxImages: 4,
    },
    "advertorial-one-photo": {
      label: "Advertorial, one photo",
      description: "A type-led opening, short story and product transition with one packshot.",
      requiredAssetRoles: ["product-hero"],
      allowedSectionOrders: [SECTION_ORDER.onePhoto],
      maxStoryBeats: 2,
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

  for (const id of required) {
    const fact = brief.productFacts.find((candidate) => candidate.id === id);
    if (fact && !seen.has(fact.id)) {
      selected.push(cloneFact(fact));
      seen.add(fact.id);
    }
  }
  for (const fact of brief.productFacts) {
    if (selected.length >= capacity) break;
    if (seen.has(fact.id)) continue;
    selected.push(cloneFact(fact));
    seen.add(fact.id);
  }
  return selected.slice(0, capacity);
}

function selectedOpening(brief: AdvertorialBrief) {
  return (
    brief.advertorial.openings.find((opening) => opening.id === brief.openingFocus) ??
    brief.advertorial.openings[0]
  );
}

function layoutForBrief(
  brief: AdvertorialBrief,
  requested: AdvertorialLayoutId | "auto" = "auto",
): AdvertorialLayoutId {
  if (requested !== "auto") return requested;
  if (brief.advertorial.preferredLayout) return brief.advertorial.preferredLayout;
  return brief.advertorial.assetAssignments.length >= 2
    ? "advertorial-full"
    : "advertorial-one-photo";
}

function assignmentsForLayout(
  brief: AdvertorialBrief,
  layout: AdvertorialLayoutId,
): AssetAssignment[] {
  const assignments = brief.advertorial.assetAssignments
    .filter((assignment) => roleAllowedForLayout(assignment.role, layout))
    .map((assignment) => ({ ...assignment }));

  const heroIndex = assignments.findIndex((assignment) => assignment.role === "product-hero");
  if (heroIndex >= 0) {
    assignments[heroIndex] = { role: "product-hero", assetId: brief.assetId };
  } else {
    assignments.push({ role: "product-hero", assetId: brief.assetId });
  }

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

function advertorialDataMissingInputs(fixture: CampaignFixture): string[] {
  const missing = [
    "An approved advertorial opening (headline and standfirst)",
    "Two or three approved story beats with a source quote",
    "A commercial disclosure (label, sponsor, explanation)",
    "A product transition sentence",
    "Approved image roles beyond the product packshot",
  ];
  if (fixture.brief.advertorial) return [];
  return missing;
}

export function assessAdvertorialFit(
  fixture: CampaignFixture,
  values: CampaignFormValues,
  catalog: CampaignCatalog = BASE_CATALOG,
): AdvertorialFit {
  const missing = advertorialDataMissingInputs(fixture);
  if (!fixture.brief.advertorial) {
    return {
      fit: false,
      recommended: "single-product-offer",
      missingInputs: missing,
    };
  }

  const brief = createAdvertorialBrief(fixture, values);
  if (!brief) {
    return { fit: false, recommended: "single-product-offer", missingInputs: missing };
  }

  const issues = validateAdvertorialBrief(brief, catalog);
  for (const issue of issues) {
    if (!missing.includes(issue.message)) missing.push(issue.message);
  }

  const layout = layoutForBrief(brief, values.advertorialLayout ?? "auto");
  return {
    fit: issues.length === 0,
    recommended: issues.length === 0 ? "single-product-advertorial" : "single-product-offer",
    layout,
    missingInputs: missing,
  };
}

export function validateAdvertorialBrief(
  brief: AdvertorialBrief,
  catalog: CampaignCatalog = BASE_CATALOG,
): AdvertorialSectionIssue[] {
  const issues: AdvertorialSectionIssue[] = [];
  const data = brief.advertorial;
  const limits = ADVERTORIAL_MANIFEST.limits;

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
    if (!roleAllowedForLayout(assignment.role, layoutForBrief(brief))) {
      issues.push(
        sectionIssue(
          "product",
          `The ${assignment.role} image role is not available in this layout.`,
        ),
      );
    }
    if (roles.has(assignment.role)) {
      issues.push(
        sectionIssue("product", `The ${assignment.role} image role is assigned more than once.`),
      );
    }
    roles.add(assignment.role);
    if (assetIds.has(assignment.assetId)) {
      issues.push(sectionIssue("product", `Asset "${assignment.assetId}" is assigned more than once.`));
    }
    assetIds.add(assignment.assetId);

    const asset = getAsset(assignment.assetId, catalog);
    if (!asset) {
      issues.push(
        sectionIssue("product", `Asset "${assignment.assetId}" is not in the approved asset library.`),
      );
      continue;
    }
    if (!asset.reviewed) {
      issues.push(sectionIssue("product", `Asset "${asset.id}" has not been reviewed.`));
    }
    if (!asset.alt.trim()) {
      issues.push(sectionIssue("product", `Asset "${asset.id}" needs reviewed alt text.`));
    }
    if (isPendingRights(asset.rights)) {
      issues.push(
        sectionIssue("product", `Asset "${asset.id}" still has rights pending confirmation.`),
      );
    }
    if (!/^[a-f0-9]{64}$/i.test(asset.contentHash)) {
      issues.push(sectionIssue("product", `Asset "${asset.id}" needs a content hash.`));
    }
    if (asset.role !== assignment.role) {
      issues.push(
        sectionIssue(
          "product",
          `Asset "${asset.id}" is approved as ${asset.role}, not ${assignment.role}.`,
        ),
      );
    }
    if (asset.caption && asset.caption.length > limits.caption) {
      issues.push(
        sectionIssue("product", `Asset "${asset.id}" caption exceeds ${limits.caption} characters.`),
      );
    }
  }
  if (!roles.has("product-hero")) {
    issues.push(
      sectionIssue("product", "The advertorial needs one approved product-hero image."),
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
    layoutForBrief(brief) === "advertorial-full"
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
      ? [...SECTION_ORDER.full]
      : [...SECTION_ORDER.onePhoto];

  return {
    templateId: ADVERTORIAL_TEMPLATE_ID,
    templateVersion: ADVERTORIAL_TEMPLATE_VERSION,
    layout,
    layoutReason:
      layout === "advertorial-full"
        ? "The approved story, facts and supporting images earn the full advertorial sequence."
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
  if (draft.sections.indexOf("close") < 0) {
    issues.push(sectionIssue("close", "The advertorial needs a closing action section."));
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

  if (draft.facts.length > layout.maxFacts) {
    issues.push(
      sectionIssue("evidence", `${layout.label} accepts at most ${layout.maxFacts} facts.`),
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
      sectionIssue("product", `${layout.label} accepts at most ${layout.maxImages} images.`),
    );
  }
  const roles = new Set<string>();
  const assetIds = new Set<string>();
  for (const assignment of draft.assetAssignments) {
    if (!roleAllowedForLayout(assignment.role, draft.layout)) {
      issues.push(
        sectionIssue("product", `The ${assignment.role} image role is not allowed in this layout.`),
      );
    }
    if (roles.has(assignment.role)) {
      issues.push(sectionIssue("product", `The ${assignment.role} role appears more than once.`));
    }
    roles.add(assignment.role);
    if (assetIds.has(assignment.assetId)) {
      issues.push(sectionIssue("product", `Asset "${assignment.assetId}" appears more than once.`));
    }
    assetIds.add(assignment.assetId);

    const asset = getAsset(assignment.assetId, catalog);
    if (!asset) {
      issues.push(
        sectionIssue("product", `Asset "${assignment.assetId}" is not in the approved asset library.`),
      );
      continue;
    }
    if (!asset.reviewed) {
      issues.push(sectionIssue("product", `Asset "${asset.id}" has not been reviewed.`));
    }
    if (!asset.alt.trim()) {
      issues.push(sectionIssue("product", `Asset "${asset.id}" needs reviewed alt text.`));
    }
    if (isPendingRights(asset.rights)) {
      issues.push(sectionIssue("product", `Asset "${asset.id}" still has rights pending confirmation.`));
    }
    if (asset.role !== assignment.role) {
      issues.push(
        sectionIssue(
          "product",
          `Asset "${asset.id}" is approved as ${asset.role}, not ${assignment.role}.`,
        ),
      );
    }
  }
  if (!roles.has("product-hero")) {
    issues.push(sectionIssue("product", "The draft has no product-hero image."));
  }
  if (draft.layout === "advertorial-one-photo" && draft.assetAssignments.length !== 1) {
    issues.push(
      sectionIssue("product", "The one-photo layout needs exactly one product-hero image."),
    );
  }
  if (
    draft.layout === "advertorial-full" &&
    draft.assetAssignments.length < 2
  ) {
    issues.push(
      sectionIssue(
        "product",
        "The full layout needs at least two images; use the one-photo layout for one usable photo.",
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
    sections: draft.sections,
    theme: {
      brandId: theme.brand.id,
      accent: theme.tokens.accent,
      accentInk: theme.tokens.accentInk,
      displayFont: theme.tokens.displayFont,
      bodyFont: theme.tokens.bodyFont,
    },
    campaign: {
      fixtureId: brief.fixtureId,
      productName: brief.productName,
      productNoun: brief.productNoun,
      offer: brief.offer,
      destinationUrl: normalizeDestinationUrl(brief.destinationUrl),
      actionLabel: brief.actionLabel,
      requiredFactGroups: brief.requiredFactGroups ?? [],
    },
    disclosure: draft.disclosure,
    narrator: brief.advertorial.narrator ?? null,
    story: draft.story,
    facts: draft.facts,
    productTransition: draft.productTransition,
    assetAssignments: draft.assetAssignments,
    assets: assets.map((asset) => ({
      id: asset.id,
      role: asset.role,
      contentHash: asset.contentHash,
      alt: asset.alt,
      caption: asset.caption ?? null,
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
  const brief = createAdvertorialBrief(fixture, values);
  if (!brief) {
    const sectionIssues = [
      sectionIssue(
        "brief",
        "This brief has no approved advertorial story, disclosure, or image roles. Use the single-product offer template.",
      ),
    ];
    return {
      ok: false,
      issues: advertorialIssuesToValidation(sectionIssues),
      sectionIssues,
    };
  }

  const briefIssues = validateAdvertorialBrief(brief, catalog);
  if (briefIssues.length > 0) {
    return {
      ok: false,
      issues: advertorialIssuesToValidation(briefIssues),
      sectionIssues: briefIssues,
    };
  }

  const draft = assembleAdvertorialDraft(
    brief,
    values.advertorialLayout ?? "auto",
  );
  const draftIssues = validateAdvertorialDraft(brief, draft, catalog);
  if (draftIssues.length > 0) {
    return {
      ok: false,
      issues: advertorialIssuesToValidation(draftIssues),
      sectionIssues: draftIssues,
    };
  }

  const resolved = resolveAdvertorialAssets(draft, catalog);
  if (resolved.issues.length > 0) {
    return {
      ok: false,
      issues: advertorialIssuesToValidation(resolved.issues),
      sectionIssues: resolved.issues,
    };
  }

  const hero = resolved.assets.find((entry) => entry.assignment.role === "product-hero")?.asset;
  if (!hero) {
    return {
      ok: false,
      issues: advertorialIssuesToValidation([
        sectionIssue("product", "The advertorial needs one approved product-hero image."),
      ]),
      sectionIssues: [
        sectionIssue("product", "The advertorial needs one approved product-hero image."),
      ],
    };
  }

  const theme = resolveBrandTheme(values.brandId, values.accent, catalog);
  const revision = calculateAdvertorialRevision(
    brief,
    draft,
    resolved.assets.map((entry) => entry.asset),
    theme,
  );

  return {
    ok: true,
    preview: {
      brief,
      draft,
      asset: hero,
      assets: resolved.assets,
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

