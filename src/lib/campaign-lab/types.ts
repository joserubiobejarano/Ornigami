export const CAMPAIGN_LAB_TEMPLATE_ID = "single-product-offer" as const;

export type BaseFixtureId =
  | "sparse"
  | "long-copy"
  | "morrow-advertorial-full"
  | "morrow-advertorial-one-photo";
export type PilotFixtureId = "momisa-glow-box";
export type BrowserOfferFixtureId = "browser-offer";
export type FixtureId = BaseFixtureId | PilotFixtureId | BrowserOfferFixtureId;

export type BaseBrandId = "harbor-field" | "morrow-ceramic";
export type PilotBrandId = "momisa";
export type BrowserOfferBrandId = "browser-offer-brand";
export type BrandId = BaseBrandId | PilotBrandId | BrowserOfferBrandId;

export type LayoutId = "offer-led-one-photo" | "editorial-long-copy";
export type AssetRole =
  | "product-hero"
  | "story-opening"
  | "product-detail"
  | "product-in-use"
  | "product-evidence";

export type CampaignFormat = "offer" | "advertorial";

export type AdvertorialLayoutId = "advertorial-full" | "advertorial-one-photo";

export type AdvertorialSectionId =
  | "disclosure"
  | "opening"
  | "story"
  | "evidence"
  | "product"
  | "close";

export type AdvertorialAssetRole =
  | "story-opening"
  | "product-detail"
  | "product-in-use"
  | "product-evidence"
  | "product-hero";

export type AdvertorialOpening = {
  id: string;
  headline: string;
  standfirst: string;
};

export type ApprovedStoryBeat = {
  id: string;
  role: "opening" | "turn" | "resolution";
  text: string;
  source: ApprovedFactSource;
};

export type Disclosure = {
  label: "Advertisement" | "Advertorial" | "Paid Post" | "Paid content";
  sponsor: string;
  explanation: string;
  repeatAtClose: boolean;
};

export type AssetAssignment = {
  role: AdvertorialAssetRole;
  assetId: string;
};

export type AdvertorialNarrator = {
  name: string;
  role: string;
  source: string;
  releaseOnFile: boolean;
};

/** Approved advertorial material carried alongside the existing campaign brief. */
export type AdvertorialBriefData = {
  openings: readonly AdvertorialOpening[];
  storyBeats: readonly ApprovedStoryBeat[];
  narrator?: AdvertorialNarrator;
  disclosure: Disclosure;
  productTransition: string;
  assetAssignments: readonly AssetAssignment[];
  preferredLayout?: AdvertorialLayoutId;
};

export type AdvertorialImagePlacement = {
  role: AdvertorialAssetRole;
  region: "story" | "product";
};

export type AdvertorialUnusedImage = {
  assetId: string;
  role: AdvertorialAssetRole;
  reason: string;
};

export type AdvertorialBrief = CampaignBrief & {
  format: "advertorial";
  /** The campaign fixture's approved product identity. */
  approvedProductName: string;
  advertorial: AdvertorialBriefData;
};

export type AdvertorialPlan = {
  openingId: string;
  layout: AdvertorialLayoutId;
  sections: AdvertorialSectionId[];
  storyBeatIds: string[];
  factIds: string[];
  assetAssignments: AssetAssignment[];
};

export type AdvertorialDraft = {
  templateId: "single-product-advertorial";
  templateVersion: "1.0.0";
  layout: AdvertorialLayoutId;
  layoutReason: string;
  sections: AdvertorialSectionId[];
  headline: string;
  standfirst: string;
  story: ApprovedStoryBeat[];
  facts: ProductFact[];
  productTransition: string;
  disclosure: Disclosure;
  assetAssignments: AssetAssignment[];
};

export type AdvertorialFit = {
  fit: boolean;
  recommended: "single-product-offer" | "single-product-advertorial";
  layout?: AdvertorialLayoutId;
  /** Another layout that can hold the same approved brief, when one exists. */
  compatibleLayout?: AdvertorialLayoutId;
  /** Why the requested layout cannot render this brief. */
  layoutReason?: string;
  /** Approved images this layout has no slot for. */
  unusedImages: AdvertorialUnusedImage[];
  missingInputs: string[];
};

export type AdvertorialSectionIssue = {
  section: AdvertorialSectionId | "brief" | "layout" | "asset" | "identity";
  message: string;
};

/**
 * The generator may choose one of these template-supported opening angles.
 * The resulting headline is assembled from approved campaign copy on the
 * server; the generator never returns headline text directly.
 */
export type OpeningAngle = "offer-led" | "product-led" | "story-led";

/**
 * The profile-level headline choice. "offer-led" and "product-led" are
 * explicit choices and also constrain generation to the same angle. "angle"
 * is the legacy product-name deterministic mode and keeps the broad,
 * brief-compatible generation choices.
 */
export type ProfileHeadlineMode = "offer-led" | "product-led" | "angle";

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
  /**
   * How the offer sits in the hero. "tint" is the original notification-style
   * block; "editorial" sets the offer as a display-type line between rules.
   * Optional so existing brand tokens keep their approved revision.
   */
  offerStyle?: "tint" | "editorial";
  /** Emphasise the currency amount inside the approved offer string. */
  offerPriceEmphasis?: boolean;
  /** Optional inset between the product field edge and the image. */
  imageInset?: string;
  /**
   * The mobile hero order. "support-first" keeps the copy block before the
   * image; "product-second" places the image between the headline and the
   * offer/action/facts so the visual and DOM order agree.
   */
  mobileHeroOrder?: "support-first" | "product-second";
  heroOrder: "product-first" | "headline-first";
  prefersEditorial: boolean;
  /** The detail band's own surface, so a light editorial brand can stay light. */
  detailBackground: string;
  detailInk: string;
  /** Multiply lets a white-background packshot sit on the brand's art surface. */
  imageBlend: "normal" | "multiply";
  showWordmarkMark: boolean;
};

export type BrandDefinition = {
  id: BrandId;
  name: string;
  wordmark: string;
  descriptor: string;
  tokens: BrandTokens;
  headlineMode: ProfileHeadlineMode;
  detailTitle: string;
};

export type ApprovedFactSource = {
  document: string;
  quote: string;
  reviewedBy: string;
  reviewedOn: string;
};

/**
 * The source campaign artifact the page continues. It is recorded in the
 * private pilot manifest for editorial review; it is not rendered.
 */
export type CampaignSource = {
  channel: string;
  promise: string;
  document: string;
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
  /** Reviewed direct-offer fit override; omitted product heroes preserve the
   * full product, while other roles retain editorial cover framing. */
  imageFit?: "contain" | "cover";
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
  /** Reviewer note describing the tested crop and what must stay visible. */
  crop?: string;
  /** A visible caption that names what the image shows, not what it proves. */
  caption?: string;
};

export type ApprovedCopy = {
  headline?: string;
  lede: string;
  /** A generated lede can be retained for validation without rendering it. */
  hideLede?: boolean;
};

export type CampaignOpening = {
  id: string;
  label: string;
  copy: ApprovedCopy;
};

/**
 * Facts that must be rendered together. Facts outside a required group remain
 * optional and may be omitted when the selected layout cannot fit them.
 */
export type RequiredFactGroup = {
  id: string;
  label: string;
  factIds: readonly string[];
};

export type CampaignBrief = {
  fixtureId: FixtureId;
  brandId: BrandId;
  productName: string;
  /**
   * The intended campaign audience. Optional so every existing fixture,
   * prepared brief, and pilot manifest remains valid without re-authoring.
   */
  audience?: string;
  /** The campaign's primary objective. Optional for the same reason. */
  objective?: string;
  offer: string;
  /**
   * The exact approved substring of `offer` that may receive price emphasis.
   * Emphasis never searches by currency pattern; absence or a non-match keeps
   * the offer unstyled.
   */
  offerPrice?: string;
  destinationUrl: string;
  assetId: string;
  actionLabel: string;
  productNoun: string;
  productFacts: ProductFact[];
  requiredFactGroups?: readonly RequiredFactGroup[];
  copy: ApprovedCopy;
  openingFocus?: string;
  /** Present only when the fixture has approved advertorial material. */
  advertorial?: AdvertorialBriefData;
  /** Private campaign source kept for editorial review. */
  sourceCampaign?: CampaignSource;
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
  audience?: string;
  objective?: string;
  offer: string;
  destinationUrl: string;
  assetId: string;
  openingFocus?: string;
  format?: CampaignFormat;
  advertorialLayout?: AdvertorialLayoutId | "auto";
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
  /** Maximum rendered facts for this layout. Falls back to the template limit. */
  maxFacts?: number;
};

export type TemplateAngleManifest = {
  label: string;
  description: string;
};

export type TemplateSectionManifest = {
  label: string;
  description: string;
};

export type TemplateProfileHeadlineManifest = {
  label: string;
  description: string;
  /** Angles a successful provider proposal may choose for this profile. */
  angles: readonly OpeningAngle[];
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
  profileHeadlineModes: Record<
    ProfileHeadlineMode,
    TemplateProfileHeadlineManifest
  >;
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
  | "audience"
  | "objective"
  | "offer"
  | "destinationUrl"
  | "assetId"
  | "openingFocus"
  | "format"
  | "advertorialLayout";

export type ValidationIssue = {
  field: ValidationField;
  message: string;
};

export type ResolvedBrandTheme = {
  brand: BrandDefinition;
  tokens: BrandTokens;
};

export type PilotDescriptor = {
  id: string;
  label: string;
  status: "preview" | "confirmed";
  note?: string;
};

/** The runtime set of brands, fixtures and assets, including optional local pilots. */
export type CampaignCatalog = {
  brands: Record<string, BrandDefinition>;
  fixtures: Record<string, CampaignFixture>;
  assets: readonly ApprovedAsset[];
  pilot?: PilotDescriptor;
};

export type PilotBundle = {
  brand: BrandDefinition;
  fixture: CampaignFixture;
  assets: ApprovedAsset[];
  pilot: PilotDescriptor;
};
