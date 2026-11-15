import type {
  ApprovedAsset,
  BrandDefinition,
  BrandId,
  BrandTokens,
  CampaignBrief,
  CampaignFixture,
  CampaignFormValues,
  FixtureId,
  ResolvedBrandTheme,
} from "./types.ts";

const harborTokens: BrandTokens = {
  page: "#f4eee4",
  surface: "#e9dfcf",
  ink: "#232420",
  muted: "#625f56",
  accent: "#9a3f25",
  accentInk: "#fff8ee",
  line: "#d7cab7",
  displayFont: "var(--font-sans), ui-sans-serif, system-ui, sans-serif",
  bodyFont: "var(--font-sans), ui-sans-serif, system-ui, sans-serif",
  displayWeight: 800,
  displayTracking: "-0.045em",
  labelCase: "uppercase",
  labelTracking: "0.16em",
  imageRadius: "6px",
  buttonRadius: "6px",
  heroImage: "framed",
  heroOrder: "product-first",
  prefersEditorial: false,
};

const morrowTokens: BrandTokens = {
  page: "#f2ebde",
  surface: "#e6dbc8",
  ink: "#1d2a3c",
  muted: "#5c6066",
  accent: "#234a6b",
  accentInk: "#f9f3e8",
  line: "#cbbda8",
  displayFont: 'Georgia, "Iowan Old Style", "Palatino Linotype", "Times New Roman", serif',
  bodyFont: "var(--font-sans), ui-sans-serif, system-ui, sans-serif",
  displayWeight: 400,
  displayTracking: "-0.03em",
  labelCase: "uppercase",
  labelTracking: "0.2em",
  imageRadius: "999px 999px 12px 12px",
  buttonRadius: "999px",
  heroImage: "arch",
  heroOrder: "headline-first",
  prefersEditorial: true,
};

export const BRANDS: Record<BrandId, BrandDefinition> = {
  "harbor-field": {
    id: "harbor-field",
    name: "Harbor Field",
    wordmark: "Harbor Field",
    descriptor: "Warm utility",
    tokens: harborTokens,
    headlineMode: "offer-led",
    detailTitle: "Built for the day.",
  },
  "morrow-ceramic": {
    id: "morrow-ceramic",
    name: "Morrow Ceramic",
    wordmark: "Morrow",
    descriptor: "Editorial craft",
    tokens: morrowTokens,
    headlineMode: "angle",
    detailTitle: "The ribs are the design.",
  },
};

export const APPROVED_ASSETS: readonly ApprovedAsset[] = [
  {
    id: "harbor-field-bottle-front",
    brandId: "harbor-field",
    src: "/campaign-assets/harbor-field-bottle.webp",
    width: 1200,
    height: 1500,
    alt: "Harbor Field 500 ml insulated travel bottle in graphite with a brushed steel screw cap, centred on a warm off-white studio backdrop.",
    role: "product-hero",
    reviewed: true,
    reviewedBy: "Ornigami design review",
    reviewedOn: "2026-11-12",
    source: "Original fictional fixture rendered from assets/campaign-lab/harbor-field-bottle.svg",
    rights: "Original work for this local prototype; fictional brand.",
    contentHash: "7428586f0fcbd847f741ebfd1415c4ecd38ff0754c831edf6b5fc94a3a609ab2",
  },
  {
    id: "morrow-ceramic-dripper-front",
    brandId: "morrow-ceramic",
    src: "/campaign-assets/morrow-ceramic-dripper.webp",
    width: 1200,
    height: 1500,
    alt: "Morrow cream ceramic pour-over dripper with a ribbed interior and single outlet, resting on a matching carafe against a deep blue wall.",
    role: "product-hero",
    reviewed: true,
    reviewedBy: "Ornigami design review",
    reviewedOn: "2026-11-12",
    source: "Original fictional fixture rendered from assets/campaign-lab/morrow-ceramic-dripper.svg",
    rights: "Original work for this local prototype; fictional brand.",
    contentHash: "4a6a4811b830ccfc712da50ef589cf6c6dbc54996ec55dbf5472055f209356b7",
  },
];

export const CAMPAIGN_FIXTURES: Record<FixtureId, CampaignFixture> = {
  sparse: {
    id: "sparse",
    label: "Sparse offer",
    description: "One product photo, one direct offer, one action.",
    assetId: "harbor-field-bottle-front",
    brief: {
      fixtureId: "sparse",
      brandId: "harbor-field",
      productName: "Harbor Field travel bottle",
      offer: "20% off, 27–30 November 2026",
      destinationUrl: "https://example.com/harbor-field",
      assetId: "harbor-field-bottle-front",
      actionLabel: "Shop on Amazon",
      productNoun: "travel bottle",
      productFacts: [
        { label: "Capacity", value: "500 ml" },
        { label: "Closure", value: "Screw cap" },
      ],
      copy: {
        lede: "A 500 ml insulated bottle with a screw cap, made for the commute and the trail.",
      },
    },
  },
  "long-copy": {
    id: "long-copy",
    label: "Long headline",
    description: "An editorial identity and a headline that needs room.",
    assetId: "morrow-ceramic-dripper-front",
    brief: {
      fixtureId: "long-copy",
      brandId: "morrow-ceramic",
      productName: "Morrow ceramic pour-over dripper",
      offer: "Free shipping through 30 November 2026",
      destinationUrl: "https://example.com/morrow",
      assetId: "morrow-ceramic-dripper-front",
      actionLabel: "See the dripper",
      productNoun: "pour-over dripper",
      productFacts: [
        { label: "Interior", value: "Three ribs" },
        { label: "Outlet", value: "Single outlet" },
        { label: "Body", value: "Ceramic" },
      ],
      copy: {
        headline: "What changes when your first pour is slower, steadier, and entirely your own?",
        lede: "The rib spacing holds the filter clear of the wall, so water moves through the bed at its own pace.",
      },
    },
  },
};

export function isFixtureId(value: string | null | undefined): value is FixtureId {
  return value === "sparse" || value === "long-copy";
}

export function normalizeFixtureId(value: string | string[] | undefined): FixtureId {
  const candidate = Array.isArray(value) ? value[0] : value;
  return isFixtureId(candidate) ? candidate : "sparse";
}

export function isBrandId(value: string): value is BrandId {
  return value === "harbor-field" || value === "morrow-ceramic";
}

export function getBrand(brandId: string): BrandDefinition {
  return BRANDS[isBrandId(brandId) ? brandId : "harbor-field"];
}

export function getAsset(assetId: string): ApprovedAsset | undefined {
  return APPROVED_ASSETS.find((asset) => asset.id === assetId);
}

export function defaultAccent(brandId: BrandId): string {
  return BRANDS[brandId].tokens.accent;
}

export function createFormValues(fixture: CampaignFixture): CampaignFormValues {
  return {
    brandId: fixture.brief.brandId,
    accent: defaultAccent(fixture.brief.brandId),
    productName: fixture.brief.productName,
    offer: fixture.brief.offer,
    destinationUrl: fixture.brief.destinationUrl,
    assetId: fixture.assetId,
  };
}

export function createCampaignBrief(fixture: CampaignFixture, values: CampaignFormValues): CampaignBrief {
  return {
    ...fixture.brief,
    brandId: values.brandId,
    productName: values.productName.trim(),
    offer: values.offer.trim(),
    destinationUrl: values.destinationUrl.trim(),
    assetId: values.assetId,
  };
}

function parseHexColor(value: string): { r: number; g: number; b: number } | null {
  const match = /^#([0-9a-f]{6})$/i.exec(value.trim());
  if (!match) return null;
  const hex = match[1];
  return {
    r: Number.parseInt(hex.slice(0, 2), 16),
    g: Number.parseInt(hex.slice(2, 4), 16),
    b: Number.parseInt(hex.slice(4, 6), 16),
  };
}

/** Picks the readable foreground for a filled action without changing the approved accent. */
export function pickAccentInk(accent: string): string {
  const rgb = parseHexColor(accent);
  if (!rgb) return "#fffaf1";
  const channel = (value: number) => {
    const normalized = value / 255;
    return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  };
  const luminance = 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b);
  const darkInk = "#171813";
  const lightInk = "#fffaf1";
  const contrast = (first: number, second: number) =>
    (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
  const darkContrast = contrast(luminance, 0.0103);
  const lightContrast = contrast(luminance, 0.9591);
  return darkContrast >= lightContrast ? darkInk : lightInk;
}

export function resolveBrandTheme(brandId: string, accent?: string): ResolvedBrandTheme {
  const brand = getBrand(brandId);
  const normalizedAccent = parseHexColor(accent ?? "") ? accent!.trim() : brand.tokens.accent;
  return {
    brand,
    tokens: {
      ...brand.tokens,
      accent: normalizedAccent,
      accentInk: pickAccentInk(normalizedAccent),
    },
  };
}
