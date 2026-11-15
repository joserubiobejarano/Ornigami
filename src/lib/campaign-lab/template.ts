import {
  createCampaignBrief,
  getAsset,
  getBrand,
  isBrandId,
  resolveBrandTheme,
} from "./fixtures.ts";
import type {
  ApprovedAsset,
  CampaignBrief,
  CampaignFixture,
  CampaignFormValues,
  LayoutId,
  OpeningAngle,
  ProductFact,
  ResolvedBrandTheme,
  SectionId,
  TemplateDraft,
  TemplateManifest,
  TemplatePlan,
  ValidationIssue,
} from "./types.ts";
import { CAMPAIGN_LAB_TEMPLATE_ID } from "./types.ts";

const OFFER_LED_SECTIONS: readonly SectionId[] = ["hero", "hero-facts", "close"];
const EDITORIAL_SECTIONS: readonly SectionId[] = ["hero", "detail", "close"];
const COMPACT_SECTIONS: readonly SectionId[] = ["hero", "close"];

export const SINGLE_PRODUCT_OFFER_TEMPLATE: TemplateManifest = {
  id: CAMPAIGN_LAB_TEMPLATE_ID,
  version: "1.0.0",
  name: "Single product offer",
  format: "Problem–solution / offer-led campaign page",
  requiredInputs: ["brandId", "productName", "offer", "destinationUrl", "assetId"],
  allowedAssetRoles: ["product-hero"],
  layouts: {
    "offer-led-one-photo": {
      label: "Offer-led, one photo",
      description: "A short headline, a single framed product image, and the action close to the offer.",
      requiredAssetRoles: ["product-hero"],
      allowedSectionOrders: [OFFER_LED_SECTIONS, COMPACT_SECTIONS],
    },
    "editorial-long-copy": {
      label: "Editorial, long headline",
      description: "A larger editorial headline field, an arch-cropped product image, and a detail band.",
      requiredAssetRoles: ["product-hero"],
      allowedSectionOrders: [EDITORIAL_SECTIONS, COMPACT_SECTIONS],
    },
  },
  angles: {
    "offer-led": {
      label: "Offer-led opening",
      description: "Lead with the approved offer clause and the product noun.",
    },
    "product-led": {
      label: "Product-led opening",
      description: "Lead with the approved product name.",
    },
    "story-led": {
      label: "Approved story opening",
      description: "Lead with the campaign's approved headline copy.",
    },
  },
  sections: {
    hero: {
      label: "Hero",
      description: "Product identity, opening headline, approved lede, offer, action and product image.",
    },
    "hero-facts": {
      label: "Hero facts",
      description: "A short band of selected approved facts beside the offer-led hero copy.",
    },
    detail: {
      label: "Detail band",
      description: "The editorial detail band with the brand detail title and selected approved facts.",
    },
    close: {
      label: "Closing action",
      description: "Product name, primary action and offer terms.",
    },
  },
  limits: {
    productName: 90,
    offer: 180,
    headline: 180,
    lede: 240,
    factLabel: 40,
    factValue: 80,
    maxFacts: 3,
  },
};

const DESTINATION_MAX_LENGTH = 2048;

export function normalizeDestinationUrl(value: string): string {
  const trimmed = value.trim();
  try {
    return new URL(trimmed).href;
  } catch {
    return trimmed;
  }
}

/** Specific, user-facing destination errors. Only public HTTPS destinations are accepted. */
export function getDestinationUrlError(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return "Enter the destination URL.";
  if (trimmed.length > DESTINATION_MAX_LENGTH) {
    return `Destination URL must be ${DESTINATION_MAX_LENGTH} characters or fewer.`;
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return "Destination URL must be a valid URL, for example https://example.com/offer.";
  }

  if (parsed.protocol !== "https:") {
    return "Destination URL must start with https://.";
  }
  if (parsed.username || parsed.password) {
    return "Destination URL cannot include a username or password.";
  }
  if (!parsed.hostname || !parsed.hostname.includes(".")) {
    return "Destination URL must use a public hostname.";
  }
  return null;
}

export function validateCampaignForm(values: CampaignFormValues): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!isBrandId(values.brandId)) {
    issues.push({
      field: "brandId",
      message: "Choose one of the supported brand styles.",
    });
  }

  if (!/^#[0-9a-f]{6}$/i.test(values.accent.trim())) {
    issues.push({
      field: "accent",
      message: "Accent color must be a six-digit hex value.",
    });
  }

  const productName = values.productName.trim();
  if (!productName) {
    issues.push({ field: "productName", message: "Enter the product name." });
  } else if (productName.length > SINGLE_PRODUCT_OFFER_TEMPLATE.limits.productName) {
    issues.push({
      field: "productName",
      message: `Product name must be ${SINGLE_PRODUCT_OFFER_TEMPLATE.limits.productName} characters or fewer.`,
    });
  }

  const offer = values.offer.trim();
  if (!offer) {
    issues.push({
      field: "offer",
      message: "Add the offer before generating a preview.",
    });
  } else if (offer.length > SINGLE_PRODUCT_OFFER_TEMPLATE.limits.offer) {
    issues.push({
      field: "offer",
      message: `Offer must be ${SINGLE_PRODUCT_OFFER_TEMPLATE.limits.offer} characters or fewer.`,
    });
  }

  const destinationError = getDestinationUrlError(values.destinationUrl);
  if (destinationError) {
    issues.push({ field: "destinationUrl", message: destinationError });
  }

  if (!values.assetId) {
    issues.push({
      field: "assetId",
      message: "Choose an approved product image.",
    });
  } else {
    const asset = getAsset(values.assetId);
    if (!asset) {
      issues.push({
        field: "assetId",
        message: "That product image is not in the approved asset library.",
      });
    } else if (!asset.reviewed) {
      issues.push({
        field: "assetId",
        message: "That product image has not been reviewed for this campaign.",
      });
    } else if (!SINGLE_PRODUCT_OFFER_TEMPLATE.allowedAssetRoles.includes(asset.role)) {
      issues.push({
        field: "assetId",
        message: "That product image cannot be used in this template.",
      });
    }
  }

  return issues;
}

function firstClause(value: string): string {
  return value.split(/[,;.]/)[0]?.trim() ?? "";
}

function capitalize(value: string): string {
  return value.length ? value[0].toUpperCase() + value.slice(1) : value;
}

function withoutTerminalPunctuation(value: string): string {
  return value.replace(/[.!?]+$/, "").trim();
}

function cloneFact(fact: ProductFact): ProductFact {
  return {
    ...fact,
    source: { ...fact.source },
  };
}

function buildOfferLedHeadline(brief: CampaignBrief): string {
  const offerLead = withoutTerminalPunctuation(firstClause(brief.offer));
  if (!offerLead) return withoutTerminalPunctuation(brief.productName);

  const offerLed = `${capitalize(offerLead)} the ${withoutTerminalPunctuation(brief.productNoun)}.`;
  if (offerLed.length > 68 && offerLead.length >= 40) {
    return `${capitalize(offerLead)}.`;
  }
  return offerLed;
}

export function buildHeadline(brief: CampaignBrief, brandId: string): string {
  const brand = getBrand(brandId);
  if (brief.copy.headline) {
    return brief.copy.headline;
  }

  if (brand.headlineMode === "angle") {
    return withoutTerminalPunctuation(brief.productName);
  }

  return buildOfferLedHeadline(brief);
}

export function buildHeadlineForAngle(brief: CampaignBrief, angle: OpeningAngle): string {
  switch (angle) {
    case "offer-led":
      return buildOfferLedHeadline(brief);
    case "product-led":
      return withoutTerminalPunctuation(brief.productName);
    case "story-led":
      return brief.copy.headline?.trim() ?? "";
  }
}

/** Supported for this brief. A story opening needs approved story copy. */
export function getAllowedAngles(brief: CampaignBrief): OpeningAngle[] {
  const angles: OpeningAngle[] = ["offer-led", "product-led"];
  if (brief.copy.headline?.trim()) angles.push("story-led");
  return angles;
}

function chooseLayout(headline: string, brandId: string): LayoutId {
  const brand = getBrand(brandId);
  if (brand.tokens.prefersEditorial || headline.length > 68) {
    return "editorial-long-copy";
  }
  return "offer-led-one-photo";
}

export function defaultSections(layout: LayoutId, hasFacts: boolean): SectionId[] {
  if (!hasFacts) return [...COMPACT_SECTIONS];
  return layout === "editorial-long-copy" ? [...EDITORIAL_SECTIONS] : [...OFFER_LED_SECTIONS];
}

export function layoutReason(layout: LayoutId): string {
  return layout === "editorial-long-copy"
    ? "The headline needs room, so the editorial composition gives it a wider field and a slower opening."
    : "The short headline and single image fit the offer-led composition without adding a second section.";
}

export function resolveApprovedFacts(
  brief: CampaignBrief,
  factIds: readonly string[],
): { facts: ProductFact[]; issues: string[] } {
  const issues: string[] = [];
  const facts: ProductFact[] = [];
  const seen = new Set<string>();

  for (const id of factIds) {
    if (seen.has(id)) {
      issues.push(`Fact "${id}" was selected more than once.`);
      continue;
    }
    seen.add(id);
    const approved = brief.productFacts.find((fact) => fact.id === id);
    if (!approved) {
      issues.push(`Fact "${id}" is not approved for this campaign.`);
      continue;
    }
    facts.push(cloneFact(approved));
  }

  return { facts, issues };
}

export function assembleDraft(brief: CampaignBrief, brandId: string): TemplateDraft {
  const headline = buildHeadline(brief, brandId);
  const layout = chooseLayout(headline, brandId);

  return {
    templateId: SINGLE_PRODUCT_OFFER_TEMPLATE.id,
    templateVersion: SINGLE_PRODUCT_OFFER_TEMPLATE.version,
    layout,
    layoutReason: layoutReason(layout),
    sections: defaultSections(layout, brief.productFacts.length > 0),
    headline,
    lede: brief.copy.lede,
    facts: brief.productFacts
      .slice(0, SINGLE_PRODUCT_OFFER_TEMPLATE.limits.maxFacts)
      .map(cloneFact),
  };
}

export type PlannedDraftResult = {
  draft: TemplateDraft;
  issues: string[];
};

/**
 * Turns an already-validated template plan into renderer slots. Every claim
 * and all campaign identity come from `brief`; the plan only selects.
 */
export function assemblePlannedDraft(brief: CampaignBrief, plan: TemplatePlan): PlannedDraftResult {
  const resolved = resolveApprovedFacts(brief, plan.factIds);
  const headline = buildHeadlineForAngle(brief, plan.angle);

  return {
    draft: {
      templateId: SINGLE_PRODUCT_OFFER_TEMPLATE.id,
      templateVersion: SINGLE_PRODUCT_OFFER_TEMPLATE.version,
      layout: plan.layout,
      layoutReason: layoutReason(plan.layout),
      sections: [...plan.sections],
      headline,
      lede: brief.copy.lede,
      facts: resolved.facts,
    },
    issues: resolved.issues,
  };
}

export type DraftValidationIssue = {
  slot: "template" | "layout" | "sections" | "headline" | "lede" | "facts";
  message: string;
};

function hasFactsSection(sections: readonly SectionId[]): boolean {
  return sections.includes("hero-facts") || sections.includes("detail");
}

export function validateTemplateDraft(
  brief: CampaignBrief,
  draft: TemplateDraft,
): DraftValidationIssue[] {
  const issues: DraftValidationIssue[] = [];
  const manifest = SINGLE_PRODUCT_OFFER_TEMPLATE;

  if (draft.templateId !== manifest.id || draft.templateVersion !== manifest.version) {
    issues.push({
      slot: "template",
      message: "The draft does not use the current template version.",
    });
  }

  const layout = manifest.layouts[draft.layout];
  if (!layout) {
    issues.push({ slot: "layout", message: "The draft uses an unsupported layout." });
  } else {
    const allowed = layout.allowedSectionOrders.some(
      (order) =>
        order.length === draft.sections.length &&
        order.every((section, index) => section === draft.sections[index]),
    );
    if (!allowed) {
      issues.push({
        slot: "sections",
        message: `The section order is not supported by ${layout.label}.`,
      });
    }
  }

  if (hasFactsSection(draft.sections) && draft.facts.length === 0) {
    issues.push({
      slot: "facts",
      message: "A facts section needs at least one approved fact.",
    });
  }
  if (!hasFactsSection(draft.sections) && draft.facts.length > 0) {
    issues.push({
      slot: "facts",
      message: "Approved facts must sit in a facts section.",
    });
  }

  if (!draft.headline.trim()) {
    issues.push({ slot: "headline", message: "The opening headline is empty." });
  } else if (draft.headline.length > manifest.limits.headline) {
    issues.push({
      slot: "headline",
      message: `The headline is ${draft.headline.length} characters. The limit is ${manifest.limits.headline}.`,
    });
  }
  if (/[\r\n]/.test(draft.headline)) {
    issues.push({ slot: "headline", message: "The headline must be a single line." });
  }

  if (!draft.lede.trim()) {
    issues.push({ slot: "lede", message: "The approved lede is empty." });
  } else if (draft.lede.length > manifest.limits.lede) {
    issues.push({
      slot: "lede",
      message: `The lede is ${draft.lede.length} characters. The limit is ${manifest.limits.lede}.`,
    });
  }

  if (draft.facts.length > manifest.limits.maxFacts) {
    issues.push({
      slot: "facts",
      message: `This template accepts at most ${manifest.limits.maxFacts} facts.`,
    });
  }

  const seen = new Set<string>();
  for (const fact of draft.facts) {
    if (seen.has(fact.id)) {
      issues.push({ slot: "facts", message: `Fact "${fact.id}" appears more than once.` });
    }
    seen.add(fact.id);

    const approved = brief.productFacts.find((candidate) => candidate.id === fact.id);
    if (!approved) {
      issues.push({ slot: "facts", message: `Fact "${fact.id}" is not approved.` });
      continue;
    }
    if (approved.label !== fact.label || approved.value !== fact.value) {
      issues.push({
        slot: "facts",
        message: `Fact "${fact.id}" does not match its approved source text.`,
      });
    }
    if (!fact.source.quote.trim()) {
      issues.push({ slot: "facts", message: `Fact "${fact.id}" has no approved source text.` });
    }
    if (fact.label.length > manifest.limits.factLabel) {
      issues.push({
        slot: "facts",
        message: `Fact "${fact.id}" label exceeds ${manifest.limits.factLabel} characters.`,
      });
    }
    if (fact.value.length > manifest.limits.factValue) {
      issues.push({
        slot: "facts",
        message: `Fact "${fact.id}" value exceeds ${manifest.limits.factValue} characters.`,
      });
    }
  }

  return issues;
}

function hashRevision(value: string): string {
  let left = 0x811c9dc5;
  let right = 0x01000193;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    left ^= code + index;
    left = Math.imul(left, 0x01000193);
    right ^= code;
    right = Math.imul(right, 0x85ebca6b);
  }
  return `${(left >>> 0).toString(16).padStart(8, "0")}${(right >>> 0).toString(16).padStart(8, "0")}`;
}

export function calculateDraftRevision(
  brief: CampaignBrief,
  draft: TemplateDraft,
  asset: ApprovedAsset,
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
      heroImage: theme.tokens.heroImage,
    },
    campaign: {
      fixtureId: brief.fixtureId,
      productName: brief.productName,
      offer: brief.offer,
      destinationUrl: normalizeDestinationUrl(brief.destinationUrl),
      actionLabel: brief.actionLabel,
      productNoun: brief.productNoun,
      facts: brief.productFacts,
      copy: brief.copy,
    },
    asset: {
      id: asset.id,
      contentHash: asset.contentHash,
      alt: asset.alt,
    },
    draft: {
      headline: draft.headline,
      lede: draft.lede,
      facts: draft.facts,
    },
  };

  return hashRevision(JSON.stringify(payload));
}

export function shortRevision(revision: string): string {
  return revision.slice(0, 10);
}

export type CampaignPreviewData = {
  brief: CampaignBrief;
  draft: TemplateDraft;
  asset: ApprovedAsset;
  theme: ResolvedBrandTheme;
  revision: string;
};

export type CampaignPreviewResult =
  | { ok: true; preview: CampaignPreviewData }
  | { ok: false; issues: ValidationIssue[] };

function draftIssuesToFieldIssues(issues: DraftValidationIssue[]): ValidationIssue[] {
  return issues.map((issue) => ({
    field:
      issue.slot === "facts" || issue.slot === "headline" || issue.slot === "lede"
        ? "offer"
        : "productName",
    message: issue.message,
  }));
}

/**
 * The deterministic builder. It may shape copy inside the template, but offer,
 * destination and asset identity stay campaign facts.
 */
export function buildCampaignPreview(
  fixture: CampaignFixture,
  values: CampaignFormValues,
): CampaignPreviewResult {
  const issues = validateCampaignForm(values);
  if (issues.length > 0) {
    return { ok: false, issues };
  }

  const brief = createCampaignBrief(fixture, values);
  const draft = assembleDraft(brief, values.brandId);

  const draftIssues = validateTemplateDraft(brief, draft);
  if (draftIssues.length > 0) {
    return {
      ok: false,
      issues: draftIssuesToFieldIssues(draftIssues),
    };
  }

  const asset = getAsset(values.assetId);
  if (!asset) {
    return {
      ok: false,
      issues: [{ field: "assetId", message: "Choose an approved product image." }],
    };
  }

  const theme = resolveBrandTheme(values.brandId, values.accent);
  const revision = calculateDraftRevision(brief, draft, asset, theme);

  return {
    ok: true,
    preview: { brief, draft, asset, theme, revision },
  };
}
