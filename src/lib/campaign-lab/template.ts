import {
  BASE_CATALOG,
  createCampaignBrief,
  getAsset,
  getBrand,
  isBrandId,
  resolveBrandTheme,
} from "./fixtures.ts";
import type {
  ApprovedAsset,
  CampaignBrief,
  CampaignCatalog,
  CampaignFixture,
  CampaignFormValues,
  LayoutId,
  OpeningAngle,
  ProductFact,
  ProfileHeadlineMode,
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
      maxFacts: 3,
    },
    "editorial-long-copy": {
      label: "Editorial, long headline",
      description: "A larger editorial headline field, an arch-cropped product image, and a detail band.",
      requiredAssetRoles: ["product-hero"],
      allowedSectionOrders: [EDITORIAL_SECTIONS, COMPACT_SECTIONS],
      maxFacts: 3,
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
  /**
   * Headline precedence, shared by deterministic previews, provider requests,
   * proposal validation, and fallback:
   *
   * 1. An explicit approved campaign headline (or selected approved opening
   *    carrying one) resolves to story-led and overrides the profile.
   * 2. Otherwise an explicit offer-led or product-led profile constrains both
   *    the deterministic headline and successful provider generation.
   * 3. The legacy angle mode keeps the broad, brief-compatible choices.
   *
   * Profile choices reuse the same OpeningAngle representation.
   */
  profileHeadlineModes: {
    "offer-led": {
      label: "Offer-led profile",
      description:
        "When no approved campaign headline overrides it, deterministic and generated headlines use only the offer-led opening.",
      angles: ["offer-led"],
    },
    "product-led": {
      label: "Product-led profile",
      description:
        "When no approved campaign headline overrides it, deterministic and generated headlines use only the product-led opening.",
      angles: ["product-led"],
    },
    angle: {
      label: "Legacy product-name angle",
      description:
        "The deterministic headline stays the product name; generation keeps the broad brief-compatible openings, including story-led when approved story copy exists.",
      angles: ["offer-led", "product-led", "story-led"],
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

export function validateCampaignForm(
  values: CampaignFormValues,
  catalog: CampaignCatalog = BASE_CATALOG,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!isBrandId(values.brandId, catalog)) {
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
    const asset = getAsset(values.assetId, catalog);
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

/**
 * Offer-led headlines are generated only for a narrow, fully parsed subset:
 * one percentage or currency discount, optionally followed by a plain date
 * window. Anything else - membership, region, thresholds, promo codes,
 * bundles, exclusions or stock qualifiers - falls back to the product name.
 * That default is deliberate: an unparsed condition must never disappear from
 * the headline while the exact offer stays next to the action.
 */
const SIMPLE_DISCOUNT_LEAD =
  /^(?:\d{1,3}(?:\.\d+)?\s?%|[$£€]\s?\d+(?:\.\d+)?)\s+off$/i;

const MONTH_NAME =
  /\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/i;
const MONTH_NAME_ALL = new RegExp(MONTH_NAME.source, "gi");

function isPlainDateWindow(value: string): boolean {
  const normalized = withoutTerminalPunctuation(value).trim();
  if (!normalized) return false;
  const hasDateSignal =
    MONTH_NAME.test(normalized) || /\b\d{4}\b/.test(normalized);
  if (!hasDateSignal) return false;

  const remainder = normalized
    .replace(
      /\b(?:on|through|thru|until|till|from|between|to|and)\b/gi,
      " ",
    )
    .replace(MONTH_NAME_ALL, " ")
    .replace(
      /\b(?:mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)\b/gi,
      " ",
    )
    .replace(/\b\d{1,4}(?:st|nd|rd|th)?\b/g, " ")
    .replace(/[–—\-,./]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return remainder === "";
}

/**
 * Returns the offer lead only when shortening is demonstrably safe. A plain
 * dated discount keeps its offer-led headline; every other form uses the
 * product name until an operator supplies approved headline copy.
 */
export function safeOfferHeadlineLead(offer: string): string | null {
  const clean = withoutTerminalPunctuation(offer.trim());
  if (!clean) return null;

  const segments = clean
    .split(/[,;]/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (segments.length === 0) return null;

  let lead = segments[0];
  const remainder = segments.slice(1);
  const until = lead.match(/^(.*?)\s+(?:through|thru|until|till)\s+(.+)$/i);
  if (until) {
    lead = until[1].trim();
    remainder.unshift(until[2].trim());
  }

  if (!SIMPLE_DISCOUNT_LEAD.test(lead)) return null;
  if (!remainder.every(isPlainDateWindow)) return null;
  return lead;
}

function productNameHeadline(brief: CampaignBrief): string {
  return withoutTerminalPunctuation(brief.productName);
}

function buildOfferLedHeadline(brief: CampaignBrief): string {
  const offerLead = safeOfferHeadlineLead(brief.offer);
  if (!offerLead) return productNameHeadline(brief);

  const offerLed = `${capitalize(offerLead)} the ${withoutTerminalPunctuation(brief.productNoun)}.`;
  return offerLed.length <= SINGLE_PRODUCT_OFFER_TEMPLATE.limits.headline
    ? offerLed
    : productNameHeadline(brief);
}

export function buildHeadline(
  brief: CampaignBrief,
  brandId: string,
  catalog: CampaignCatalog = BASE_CATALOG,
): string {
  const brand = getBrand(brandId, catalog);
  if (brief.copy.headline) {
    return brief.copy.headline;
  }

  if (brand.headlineMode === "product-led") {
    return buildHeadlineForAngle(brief, "product-led");
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

/**
 * A selected approved opening or explicit approved campaign headline wins over
 * every profile choice. Without one, the profile's permitted angles apply.
 */
export function getAllowedAngles(
  brief: CampaignBrief,
  brand?: { headlineMode: ProfileHeadlineMode },
): OpeningAngle[] {
  if (brief.copy.headline?.trim()) return ["story-led"];
  if (!brand || brand.headlineMode === "angle") {
    return ["offer-led", "product-led"];
  }
  return [
    ...SINGLE_PRODUCT_OFFER_TEMPLATE.profileHeadlineModes[brand.headlineMode]
      .angles,
  ];
}

function chooseLayout(
  headline: string,
  brandId: string,
  catalog: CampaignCatalog = BASE_CATALOG,
): LayoutId {
  const brand = getBrand(brandId, catalog);
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

export function layoutFactCapacity(
  layout: LayoutId,
  manifest: TemplateManifest = SINGLE_PRODUCT_OFFER_TEMPLATE,
): number {
  return manifest.layouts[layout]?.maxFacts ?? manifest.limits.maxFacts;
}

export function getRequiredFactIds(brief: CampaignBrief): string[] {
  const ids = new Set<string>();
  for (const group of brief.requiredFactGroups ?? []) {
    for (const id of group.factIds) ids.add(id);
  }
  return [...ids];
}

/** Validates the brief's group declarations before any draft is assembled. */
export function validateBriefFactGroups(brief: CampaignBrief): string[] {
  const issues: string[] = [];
  const groups = brief.requiredFactGroups ?? [];
  const groupIds = new Set<string>();
  const maxCapacity = Math.max(
    ...Object.keys(SINGLE_PRODUCT_OFFER_TEMPLATE.layouts).map((layout) =>
      layoutFactCapacity(layout as LayoutId),
    ),
  );

  for (const group of groups) {
    if (!group.id?.trim()) {
      issues.push("A required fact group needs an ID.");
      continue;
    }
    if (groupIds.has(group.id)) {
      issues.push(`Required fact group "${group.id}" is declared more than once.`);
    }
    groupIds.add(group.id);

    const label = group.label?.trim() || group.id;
    if (group.factIds.length === 0) {
      issues.push(`Required fact group "${label}" must include at least one fact.`);
    }
    const seen = new Set<string>();
    for (const id of group.factIds) {
      if (seen.has(id)) {
        issues.push(`Required fact group "${label}" repeats fact "${id}".`);
      }
      seen.add(id);
      if (!brief.productFacts.some((fact) => fact.id === id)) {
        issues.push(`Required fact group "${label}" references unapproved fact "${id}".`);
      }
    }
    if (seen.size > maxCapacity) {
      issues.push(
        `Required fact group "${label}" needs ${seen.size} facts, but no supported layout accepts more than ${maxCapacity}.`,
      );
    }
  }

  const totalRequired = getRequiredFactIds(brief).length;
  if (groups.length > 1 && totalRequired > maxCapacity) {
    issues.push(
      `Required fact groups need ${totalRequired} facts together, but no supported layout accepts more than ${maxCapacity}.`,
    );
  }

  return issues;
}

export type LayoutSelection = {
  layout: LayoutId;
  switched: boolean;
  fits: boolean;
};

/**
 * Prefers the normal layout choice, then falls back to any supported layout
 * whose fact capacity can hold the required group.
 */
export function selectLayoutForRequiredFacts(
  candidate: LayoutId,
  requiredCount: number,
  manifest: TemplateManifest = SINGLE_PRODUCT_OFFER_TEMPLATE,
): LayoutSelection {
  const layouts = Object.keys(manifest.layouts) as LayoutId[];
  const ordered = [candidate, ...layouts.filter((layout) => layout !== candidate)];
  const fitting = ordered.find((layout) => layoutFactCapacity(layout, manifest) >= requiredCount);
  return fitting
    ? { layout: fitting, switched: fitting !== candidate, fits: true }
    : { layout: candidate, switched: false, fits: false };
}

function selectFactsForBrief(brief: CampaignBrief, capacity: number): ProductFact[] {
  const requiredIds = new Set(getRequiredFactIds(brief));
  const requiredFacts = brief.productFacts.filter((fact) => requiredIds.has(fact.id));
  const selected = requiredFacts.map(cloneFact);

  if (selected.length < capacity) {
    for (const fact of brief.productFacts) {
      if (requiredIds.has(fact.id)) continue;
      if (selected.length >= capacity) break;
      selected.push(cloneFact(fact));
    }
  }

  return selected;
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

export function assembleDraft(
  brief: CampaignBrief,
  brandId: string,
  catalog: CampaignCatalog = BASE_CATALOG,
): TemplateDraft {
  const headline = buildHeadline(brief, brandId, catalog);
  const candidate = chooseLayout(headline, brandId, catalog);
  const requiredIds = getRequiredFactIds(brief);
  const selection = selectLayoutForRequiredFacts(candidate, requiredIds.length);
  const capacity = layoutFactCapacity(selection.layout);
  const facts = selectFactsForBrief(brief, capacity);

  return {
    templateId: SINGLE_PRODUCT_OFFER_TEMPLATE.id,
    templateVersion: SINGLE_PRODUCT_OFFER_TEMPLATE.version,
    layout: selection.layout,
    layoutReason: selection.switched
      ? `The required facts need more room, so the ${SINGLE_PRODUCT_OFFER_TEMPLATE.layouts[selection.layout].label} layout is used.`
      : layoutReason(selection.layout),
    sections: defaultSections(selection.layout, facts.length > 0),
    headline,
    lede: brief.copy.lede,
    facts,
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

    const capacity = layoutFactCapacity(draft.layout, manifest);
    if (draft.facts.length > capacity) {
      issues.push({
        slot: "facts",
        message: `The selected layout accepts at most ${capacity} facts; the draft renders ${draft.facts.length}.`,
      });
    }
  }

  const renderedIds = new Set(draft.facts.map((fact) => fact.id));
  for (const group of brief.requiredFactGroups ?? []) {
    const missing = group.factIds.filter((id) => !renderedIds.has(id));
    if (missing.length > 0) {
      issues.push({
        slot: "facts",
        message: `Required fact group "${group.label || group.id}" is incomplete; missing ${missing.join(", ")}.`,
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

export function hashRevision(value: string): string {
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
      ...(theme.tokens.offerStyle && theme.tokens.offerStyle !== "tint"
        ? { offerStyle: theme.tokens.offerStyle }
        : {}),
      ...(theme.tokens.offerPriceEmphasis ? { offerPriceEmphasis: true } : {}),
      ...(theme.tokens.imageInset ? { imageInset: theme.tokens.imageInset } : {}),
      ...(theme.tokens.mobileHeroOrder &&
      theme.tokens.mobileHeroOrder !== "support-first"
        ? { mobileHeroOrder: theme.tokens.mobileHeroOrder }
        : {}),
    },
    campaign: {
      fixtureId: brief.fixtureId,
      productName: brief.productName,
      offer: brief.offer,
      ...(brief.offerPrice ? { offerPrice: brief.offerPrice } : {}),
      destinationUrl: normalizeDestinationUrl(brief.destinationUrl),
      actionLabel: brief.actionLabel,
      productNoun: brief.productNoun,
      facts: brief.productFacts,
      requiredFactGroups: brief.requiredFactGroups ?? [],
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
  catalog: CampaignCatalog = BASE_CATALOG,
): CampaignPreviewResult {
  const issues = validateCampaignForm(values, catalog);
  if (values.openingFocus !== undefined &&
      !fixture.openings?.some((option) => option.id === values.openingFocus)) {
    issues.push({ field: "openingFocus", message: "Choose an approved opening for this campaign." });
  }
  if (issues.length > 0) {
    return { ok: false, issues };
  }

  const brief = createCampaignBrief(fixture, values);
  const groupIssues = validateBriefFactGroups(brief);
  if (groupIssues.length > 0) {
    return {
      ok: false,
      issues: groupIssues.map((message) => ({ field: "offer", message })),
    };
  }

  const draft = assembleDraft(brief, values.brandId, catalog);

  const draftIssues = validateTemplateDraft(brief, draft);
  if (draftIssues.length > 0) {
    return {
      ok: false,
      issues: draftIssuesToFieldIssues(draftIssues),
    };
  }

  const asset = getAsset(values.assetId, catalog);
  if (!asset) {
    return {
      ok: false,
      issues: [{ field: "assetId", message: "Choose an approved product image." }],
    };
  }

  const theme = resolveBrandTheme(values.brandId, values.accent, catalog);
  const revision = calculateDraftRevision(brief, draft, asset, theme);

  return {
    ok: true,
    preview: { brief, draft, asset, theme, revision },
  };
}
