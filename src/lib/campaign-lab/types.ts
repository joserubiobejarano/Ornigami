export const CAMPAIGN_LAB_TEMPLATE_ID = "single-product-offer" as const;

export type FixtureId = "sparse" | "long-copy";
export type BrandId = "harbor-field" | "morrow-ceramic";
export type LayoutId = "offer-led-one-photo" | "editorial-long-copy";
export type AssetRole = "product-hero";

/**
 * The generator may choose one of these template-supported opening angles.
 * The resulting headline is assembled from approved campaign copy on the
 * server; the generator never returns headline text directly.
 */
export type OpeningAngle = "offer-led" | "product-led" | "story-led";

/** Named sections the versioned template can render, in legal orders. */
export type SectionId = "hero" | "hero-facts" | "detail" | "close";

export type BrandTokens = {
  page: string;
  surface: string;
  ink: string;
  muted: string;
  accent: string;
  accentInk: string;
  line: string;
  displayFont: string;
  bodyFont: string;
  displayWeight: number;
  displayTracking: string;
  labelCase: "none" | "uppercase";
  labelTracking: string;
  imageRadius: string;
  buttonRadius: string;
  heroImage: "framed" | "arch";
  heroOrder: "product-first" | "headline-first";
  prefersEditorial: boolean;
};

export type BrandDefinition = {
  id: BrandId;
  name: string;
  wordmark: string;
  descriptor: string;
  tokens: BrandTokens;
  headlineMode: "offer-led" | "angle";
  detailTitle: string;
};

export type ApprovedFactSource = {
  document: string;
  quote: string;
  reviewedBy: string;
  reviewedOn: string;
};

/**
 * A material claim the template may render. `value` is the claim, and
 * `source` is the approved source text it was transcribed from. Only facts in
 * `CampaignBrief.productFacts` can reach the renderer.
 */
export type ProductFact = {
  id: string;
  label: string;
  value: string;
  source: ApprovedFactSource;
};

export type ApprovedAsset = {
  id: string;
  brandId: BrandId;
  src: string;
  width: number;
  height: number;
  alt: string;
  role: AssetRole;
  reviewed: true;
  reviewedBy: string;
  reviewedOn: string;
  source: string;
  rights: string;
  contentHash: string;
};

export type ApprovedCopy = {
  headline?: string;
  lede: string;
};

export type CampaignOpening = {
  id: string;
  label: string;
  copy: ApprovedCopy;
};

export type CampaignBrief = {
  fixtureId: FixtureId;
  brandId: BrandId;
  productName: string;
  offer: string;
  destinationUrl: string;
  assetId: string;
  actionLabel: string;
  productNoun: string;
  productFacts: ProductFact[];
  copy: ApprovedCopy;
  openingFocus?: string;
};

export type CampaignFixture = {
  id: FixtureId;
  label: string;
  description: string;
  brief: CampaignBrief;
  assetId: string;
  openings?: readonly CampaignOpening[];
};

export type CampaignFormValues = {
  brandId: BrandId;
  accent: string;
  productName: string;
  offer: string;
  destinationUrl: string;
  assetId: string;
  openingFocus?: string;
};

export type TemplateDraft = {
  templateId: typeof CAMPAIGN_LAB_TEMPLATE_ID;
  templateVersion: string;
  layout: LayoutId;
  layoutReason: string;
  sections: SectionId[];
  headline: string;
  lede: string;
  facts: ProductFact[];
};

/**
 * A generator proposal after structural validation. It names template
 * variants and approved fact IDs only; it never carries campaign facts.
 */
export type TemplatePlan = {
  angle: OpeningAngle;
  layout: LayoutId;
  sections: SectionId[];
  factIds: string[];
};

export type TemplateLayoutManifest = {
  label: string;
  description: string;
  requiredAssetRoles: readonly AssetRole[];
  allowedSectionOrders: readonly (readonly SectionId[])[];
};

export type TemplateAngleManifest = {
  label: string;
  description: string;
};

export type TemplateSectionManifest = {
  label: string;
  description: string;
};

export type TemplateManifest = {
  id: typeof CAMPAIGN_LAB_TEMPLATE_ID;
  version: string;
  name: string;
  format: string;
  requiredInputs: readonly string[];
  allowedAssetRoles: readonly AssetRole[];
  layouts: Record<LayoutId, TemplateLayoutManifest>;
  angles: Record<OpeningAngle, TemplateAngleManifest>;
  sections: Record<SectionId, TemplateSectionManifest>;
  limits: {
    productName: number;
    offer: number;
    headline: number;
    lede: number;
    factLabel: number;
    factValue: number;
    maxFacts: number;
  };
};

export type ValidationField =
  | "brandId"
  | "accent"
  | "productName"
  | "offer"
  | "destinationUrl"
  | "assetId"
  | "openingFocus";

export type ValidationIssue = {
  field: ValidationField;
  message: string;
};

export type ResolvedBrandTheme = {
  brand: BrandDefinition;
  tokens: BrandTokens;
};
