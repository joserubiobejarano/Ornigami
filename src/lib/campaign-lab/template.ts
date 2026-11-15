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
  ResolvedBrandTheme,
  TemplateDraft,
  TemplateManifest,
  ValidationIssue,
} from "./types.ts";
import { CAMPAIGN_LAB_TEMPLATE_ID } from "./types.ts";

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
    },
    "editorial-long-copy": {
      label: "Editorial, long headline",
      description: "A larger editorial headline field, an arch-cropped product image, and a detail band.",
      requiredAssetRoles: ["product-hero"],
    },
  },
  limits: {
    productName: 90,
    offer: 180,
    headline: 180,
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

export function buildHeadline(brief: CampaignBrief, brandId: string): string {
  const brand = getBrand(brandId);
  if (brief.copy.headline) {
    return brief.copy.headline;
  }

  if (brand.headlineMode === "angle") {
    return withoutTerminalPunctuation(brief.productName);
  }

  const offerLead = withoutTerminalPunctuation(firstClause(brief.offer));
  if (!offerLead) return withoutTerminalPunctuation(brief.productName);

  const offerLed = `${capitalize(offerLead)} the ${withoutTerminalPunctuation(brief.productNoun)}.`;
  if (offerLed.length > 68 && offerLead.length >= 40) {
    return `${capitalize(offerLead)}.`;
  }
  return offerLed;
}

function chooseLayout(headline: string, brandId: string): LayoutId {
  const brand = getBrand(brandId);
  if (brand.tokens.prefersEditorial || headline.length > 68) {
    return "editorial-long-copy";
  }
  return "offer-led-one-photo";
}

export function assembleDraft(brief: CampaignBrief, brandId: string): TemplateDraft {
  const headline = buildHeadline(brief, brandId);
  const layout = chooseLayout(headline, brandId);

  return {
    templateId: SINGLE_PRODUCT_OFFER_TEMPLATE.id,
    templateVersion: SINGLE_PRODUCT_OFFER_TEMPLATE.version,
    layout,
    layoutReason:
      layout === "editorial-long-copy"
        ? "The headline needs room, so the editorial composition gives it a wider field and a slower opening."
        : "The short headline and single image fit the offer-led composition without adding a second section.",
    headline,
    lede: brief.copy.lede,
    facts: brief.productFacts.map((fact) => ({ ...fact })),
  };
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

/**
 * The deterministic stand-in for a later generator. It may shape copy inside
 * the template, but offer, destination and asset identity stay campaign facts.
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

  if (draft.headline.length > SINGLE_PRODUCT_OFFER_TEMPLATE.limits.headline) {
    return {
      ok: false,
      issues: [
        {
          field: "offer",
          message: `The headline is ${draft.headline.length} characters. Shorten the offer or product name to ${SINGLE_PRODUCT_OFFER_TEMPLATE.limits.headline} characters or fewer.`,
        },
      ],
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
