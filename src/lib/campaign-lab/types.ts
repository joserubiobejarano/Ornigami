export const CAMPAIGN_LAB_TEMPLATE_ID = "single-product-offer" as const;

export type FixtureId = "sparse" | "long-copy";
export type BrandId = "harbor-field" | "morrow-ceramic";
export type LayoutId = "offer-led-one-photo" | "editorial-long-copy";
export type AssetRole = "product-hero";

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

export type ProductFact = {
  label: string;
  value: string;
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
};

export type CampaignFixture = {
  id: FixtureId;
  label: string;
  description: string;
  brief: CampaignBrief;
  assetId: string;
};

export type CampaignFormValues = {
  brandId: BrandId;
  accent: string;
  productName: string;
  offer: string;
  destinationUrl: string;
  assetId: string;
};

export type TemplateDraft = {
  templateId: typeof CAMPAIGN_LAB_TEMPLATE_ID;
  templateVersion: string;
  layout: LayoutId;
  layoutReason: string;
  headline: string;
  lede: string;
  facts: ProductFact[];
};

export type TemplateLayoutManifest = {
  label: string;
  description: string;
  requiredAssetRoles: readonly AssetRole[];
};

export type TemplateManifest = {
  id: typeof CAMPAIGN_LAB_TEMPLATE_ID;
  version: string;
  name: string;
  format: string;
  requiredInputs: readonly string[];
  allowedAssetRoles: readonly AssetRole[];
  layouts: Record<LayoutId, TemplateLayoutManifest>;
  limits: {
    productName: number;
    offer: number;
    headline: number;
  };
};

export type ValidationField =
  | "brandId"
  | "accent"
  | "productName"
  | "offer"
  | "destinationUrl"
  | "assetId";

export type ValidationIssue = {
  field: ValidationField;
  message: string;
};

export type ResolvedBrandTheme = {
  brand: BrandDefinition;
  tokens: BrandTokens;
};
