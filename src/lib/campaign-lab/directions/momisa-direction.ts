import { buildCampaignPreview } from "../template.ts";
import type { CampaignPreviewData } from "../template.ts";
import type {
  ApprovedAsset,
  BrandDefinition,
  BrandTokens,
  CampaignCatalog,
  CampaignFixture,
  CampaignFormValues,
  ProductFact,
} from "../types.ts";

export const MOMISA_DIRECTION_BRAND_ID = "browser-offer-brand" as const;
export const MOMISA_DIRECTION_FIXTURE_ID = "browser-offer" as const;
export const MOMISA_DIRECTION_ASSET_ID = "browser-offer-packshot" as const;
export const MOMISA_DIRECTION_ASSET_SRC = "/campaign-lab/direction/asset";

export type MomisaDirectionFactInput = {
  id: string;
  label: string;
  value: string;
  sourceQuote: string;
};

export type MomisaDirectionInput = {
  schemaVersion: 1;
  source: {
    commit: string;
    approvedExportRevision: string;
    exportedAt: string;
    approvalScope: string;
    exportPath: string;
  };
  brandName: string;
  productName: string;
  offer: string;
  offerPrice?: string;
  destinationUrl: string;
  actionLabel: string;
  productNoun: string;
  facts: MomisaDirectionFactInput[];
  asset: {
    id: string;
    file: string;
    width: number;
    height: number;
    alt: string;
    sha256: string;
    rights: string;
  };
  review: {
    reviewedBy: string;
    reviewedOn: string;
  };
};

export type MomisaDirectionPreviews = {
  reference: CampaignPreviewData;
  alternative: CampaignPreviewData;
  alternativeOriginal: CampaignPreviewData;
  input: MomisaDirectionInput;
};

/**
 * The approved local export's neutral browser-offer theme, kept verbatim so
 * the reference in the comparison is the approved rendering rather than a
 * new interpretation of it.
 */
export const MOMISA_REFERENCE_TOKENS: BrandTokens = {
  page: "#f6f3ec",
  surface: "#e8e2d6",
  ink: "#1f2a24",
  muted: "#60695f",
  accent: "#2f5d4a",
  accentInk: "#fffaf1",
  line: "#d5cdbf",
  displayFont: "var(--font-sans), ui-sans-serif, system-ui, sans-serif",
  bodyFont: "var(--font-sans), ui-sans-serif, system-ui, sans-serif",
  displayWeight: 700,
  displayTracking: "-0.035em",
  labelCase: "uppercase",
  labelTracking: "0.14em",
  imageRadius: "12px",
  buttonRadius: "999px",
  heroImage: "framed",
  heroOrder: "product-first",
  prefersEditorial: false,
  detailBackground: "#1f2a24",
  detailInk: "#f6f3ec",
  imageBlend: "normal",
  showWordmarkMark: false,
};

/**
 * The original a35c178 alternative. Kept only so the revised B can be shown
 * beside the page the operator already reviewed.
 */
export const MOMISA_ORIGINAL_ALTERNATIVE_TOKENS: BrandTokens = {
  page: "#f6e3cf",
  surface: "#f6e3cf",
  ink: "#24362a",
  muted: "#675748",
  accent: "#2f5d4a",
  accentInk: "#f6e3cf",
  line: "#e6d1bb",
  displayFont: '"EB Garamond", Georgia, serif',
  bodyFont: "Jost, system-ui, sans-serif",
  displayWeight: 400,
  displayTracking: "-0.012em",
  labelCase: "none",
  labelTracking: "0.01em",
  imageRadius: "0px",
  buttonRadius: "2px",
  heroImage: "framed",
  offerStyle: "editorial",
  heroOrder: "headline-first",
  prefersEditorial: false,
  detailBackground: "#24362a",
  detailInk: "#f6e3cf",
  imageBlend: "multiply",
  showWordmarkMark: false,
};

/**
 * Apricot Atelier, revised. The type and palette stay; the product is rendered
 * with normal blending on a warm mat, the price is the offer's typographic
 * anchor, and the mobile DOM is headline -> product -> offer -> CTA -> facts.
 */
export const MOMISA_ALTERNATIVE_TOKENS: BrandTokens = {
  page: "#f6e3cf",
  surface: "#fbf4ea",
  ink: "#24362a",
  muted: "#675748",
  accent: "#2f5d4a",
  accentInk: "#f6e3cf",
  line: "#e6d1bb",
  displayFont: '"EB Garamond", Georgia, serif',
  bodyFont: "Jost, system-ui, sans-serif",
  displayWeight: 400,
  displayTracking: "-0.012em",
  labelCase: "none",
  labelTracking: "0.01em",
  imageRadius: "0px",
  imageInset: "8px",
  buttonRadius: "2px",
  heroImage: "framed",
  offerStyle: "editorial",
  offerPriceEmphasis: true,
  mobileHeroOrder: "product-second",
  heroOrder: "headline-first",
  prefersEditorial: false,
  detailBackground: "#24362a",
  detailInk: "#f6e3cf",
  imageBlend: "normal",
  showWordmarkMark: false,
};

function productFacts(input: MomisaDirectionInput): ProductFact[] {
  return input.facts.map((fact) => ({
    id: fact.id,
    label: fact.label,
    value: fact.value,
    source: {
      document: "Approved local Momisa export",
      quote: fact.sourceQuote,
      reviewedBy: input.review.reviewedBy,
      reviewedOn: input.review.reviewedOn,
    },
  }));
}

function approvedAsset(input: MomisaDirectionInput): ApprovedAsset {
  return {
    id: MOMISA_DIRECTION_ASSET_ID,
    brandId: MOMISA_DIRECTION_BRAND_ID,
    src: MOMISA_DIRECTION_ASSET_SRC,
    width: input.asset.width,
    height: input.asset.height,
    alt: input.asset.alt,
    role: "product-hero",
    reviewed: true,
    reviewedBy: input.review.reviewedBy,
    reviewedOn: input.review.reviewedOn,
    source: `Approved local export: ${input.asset.file}`,
    rights: input.asset.rights,
    contentHash: input.asset.sha256,
  };
}

function fixture(input: MomisaDirectionInput, asset: ApprovedAsset): CampaignFixture {
  const facts = productFacts(input);
  return {
    id: MOMISA_DIRECTION_FIXTURE_ID,
    label: "Momisa approved export",
    description:
      "The approved local Momisa export brief, used unchanged for both visual directions.",
    assetId: asset.id,
    brief: {
      fixtureId: MOMISA_DIRECTION_FIXTURE_ID,
      brandId: MOMISA_DIRECTION_BRAND_ID,
      productName: input.productName,
      offer: input.offer,
      ...(input.offerPrice ? { offerPrice: input.offerPrice } : {}),
      destinationUrl: input.destinationUrl,
      assetId: asset.id,
      actionLabel: input.actionLabel,
      productNoun: input.productNoun,
      productFacts: facts,
      requiredFactGroups: [
        {
          id: "approved-momisa-facts",
          label: "the approved facts",
          factIds: facts.map((fact) => fact.id),
        },
      ],
      copy: {
        lede: `A ${input.productNoun} from ${input.brandName}.`,
        hideLede: true,
      },
    },
  };
}

function brand(
  tokens: BrandTokens,
  wordmark: string,
  descriptor: string,
): BrandDefinition {
  return {
    id: MOMISA_DIRECTION_BRAND_ID,
    name: "Momisa",
    wordmark,
    descriptor,
    tokens,
    headlineMode: "offer-led",
    detailTitle: "Product details",
  };
}

function catalogFor(
  brandDefinition: BrandDefinition,
  fixtureDefinition: CampaignFixture,
  asset: ApprovedAsset,
): CampaignCatalog {
  return {
    brands: { [brandDefinition.id]: brandDefinition },
    fixtures: { [fixtureDefinition.id]: fixtureDefinition },
    assets: [asset],
  };
}

function valuesFor(
  brandDefinition: BrandDefinition,
  input: MomisaDirectionInput,
): CampaignFormValues {
  return {
    brandId: brandDefinition.id,
    accent: brandDefinition.tokens.accent,
    productName: input.productName,
    offer: input.offer,
    destinationUrl: input.destinationUrl,
    assetId: MOMISA_DIRECTION_ASSET_ID,
    format: "offer",
    advertorialLayout: "auto",
  };
}

function build(
  fixtureDefinition: CampaignFixture,
  brandDefinition: BrandDefinition,
  asset: ApprovedAsset,
  input: MomisaDirectionInput,
): CampaignPreviewData {
  const result = buildCampaignPreview(
    fixtureDefinition,
    valuesFor(brandDefinition, input),
    catalogFor(brandDefinition, fixtureDefinition, asset),
  );
  if (!result.ok) {
    throw new Error(
      `The approved Momisa brief does not render for ${brandDefinition.descriptor}: ${result.issues
        .map((issue) => issue.message)
        .join(" ")}`,
    );
  }
  return result.preview;
}

/**
 * Builds both previews from the same approved brief and approved asset bytes.
 * Only the brand tokens and the resulting layout choice differ.
 */
export function buildMomisaDirectionPreviews(
  input: MomisaDirectionInput,
): MomisaDirectionPreviews {
  const asset = approvedAsset(input);
  const fixtureDefinition = fixture(input, asset);
  const referenceBrand = brand(
    MOMISA_REFERENCE_TOKENS,
    input.brandName,
    "Reference · approved neutral export",
  );
  const alternativeBrand = brand(
    MOMISA_ALTERNATIVE_TOKENS,
    "momisa",
    "Alternative · Apricot Atelier",
  );
  const alternativeOriginalBrand = brand(
    MOMISA_ORIGINAL_ALTERNATIVE_TOKENS,
    "momisa",
    "Alternative · original review",
  );

  return {
    reference: build(fixtureDefinition, referenceBrand, asset, input),
    alternative: build(fixtureDefinition, alternativeBrand, asset, input),
    alternativeOriginal: build(
      fixtureDefinition,
      alternativeOriginalBrand,
      asset,
      input,
    ),
    input,
  };
}
