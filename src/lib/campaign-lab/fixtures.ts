import type {
  ApprovedAsset,
  BaseBrandId,
  BaseFixtureId,
  BrandDefinition,
  BrandId,
  BrandTokens,
  CampaignBrief,
  CampaignCatalog,
  CampaignFixture,
  CampaignOpening,
  CampaignFormValues,
  FixtureId,
  PilotBundle,
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
  detailBackground: "#232420",
  detailInk: "#f4eee4",
  imageBlend: "normal",
  showWordmarkMark: true,
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
  detailBackground: "#1d2a3c",
  detailInk: "#f2ebde",
  imageBlend: "normal",
  showWordmarkMark: true,
};

export const BRANDS: Record<BaseBrandId, BrandDefinition> = {
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

const MORROW_OPENINGS: readonly CampaignOpening[] = [
  {
    id: "flow-control",
    label: "Rib design",
    copy: {
      headline: "Why Morrow revised the rib spacing inside its ceramic pour-over dripper",
      lede: "In the first prototype, the filter sat against the wall. Morrow revised the spacing between the three interior ribs.",
    },
  },
  {
    id: "first-pour",
    label: "First pour",
    copy: {
      headline: "Start with a slower first pour",
      lede: "Take your time with that first pour. The ceramic dripper has three interior ribs and a single outlet.",
    },
  },
];

export const CAMPAIGN_FIXTURES: Record<BaseFixtureId, CampaignFixture> = {
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
        {
          id: "capacity",
          label: "Capacity",
          value: "500 ml",
          source: {
            document: "Harbor Field approved product sheet",
            quote: "Capacity: 500 ml.",
            reviewedBy: "Ornigami content review",
            reviewedOn: "2026-11-12",
          },
        },
        {
          id: "closure",
          label: "Closure",
          value: "Screw cap",
          source: {
            document: "Harbor Field approved product sheet",
            quote: "Closure: brushed steel screw cap.",
            reviewedBy: "Ornigami content review",
            reviewedOn: "2026-11-12",
          },
        },
        {
          id: "material",
          label: "Material",
          value: "Stainless steel",
          source: {
            document: "Harbor Field approved product sheet",
            quote: "Body material: stainless steel.",
            reviewedBy: "Ornigami content review",
            reviewedOn: "2026-11-12",
          },
        },
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
    openings: MORROW_OPENINGS,
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
        {
          id: "interior",
          label: "Interior",
          value: "Three ribs",
          source: {
            document: "Morrow Ceramic approved product sheet",
            quote: "Interior: three raised ribs that hold the filter clear of the wall.",
            reviewedBy: "Ornigami content review",
            reviewedOn: "2026-11-12",
          },
        },
        {
          id: "outlet",
          label: "Outlet",
          value: "Single outlet",
          source: {
            document: "Morrow Ceramic approved product sheet",
            quote: "Outlet: one centred outlet.",
            reviewedBy: "Ornigami content review",
            reviewedOn: "2026-11-12",
          },
        },
        {
          id: "body",
          label: "Body",
          value: "Ceramic",
          source: {
            document: "Morrow Ceramic approved product sheet",
            quote: "Body: glazed ceramic.",
            reviewedBy: "Ornigami content review",
            reviewedOn: "2026-11-12",
          },
        },
        {
          id: "finish",
          label: "Finish",
          value: "Matte glaze",
          source: {
            document: "Morrow Ceramic approved product sheet",
            quote: "Finish: matte glaze.",
            reviewedBy: "Ornigami content review",
            reviewedOn: "2026-11-12",
          },
        },
      ],
      copy: MORROW_OPENINGS[0].copy,
    },
  },
};

export const BASE_CATALOG: CampaignCatalog = {
  brands: BRANDS,
  fixtures: CAMPAIGN_FIXTURES,
  assets: APPROVED_ASSETS,
};

/** Merges an optional local pilot into the reviewed base catalog. */
export function createCatalog(pilot?: PilotBundle | null): CampaignCatalog {
  if (!pilot) return BASE_CATALOG;
  return {
    brands: { ...BRANDS, [pilot.brand.id]: pilot.brand },
    fixtures: { ...CAMPAIGN_FIXTURES, [pilot.fixture.id]: pilot.fixture },
    assets: [...APPROVED_ASSETS, ...pilot.assets],
    pilot: pilot.pilot,
  };
}

export function isFixtureId(
  value: string | null | undefined,
  catalog: CampaignCatalog = BASE_CATALOG,
): value is FixtureId {
  return typeof value === "string" && Boolean(catalog.fixtures[value]);
}

export function normalizeFixtureId(
  value: string | string[] | undefined,
  catalog: CampaignCatalog = BASE_CATALOG,
): FixtureId {
  const candidate = Array.isArray(value) ? value[0] : value;
  return isFixtureId(candidate, catalog) ? candidate : "sparse";
}

export function isBrandId(
  value: string,
  catalog: CampaignCatalog = BASE_CATALOG,
): value is BrandId {
  return Boolean(catalog.brands[value]);
}

export function getBrand(
  brandId: string,
  catalog: CampaignCatalog = BASE_CATALOG,
): BrandDefinition {
  return catalog.brands[brandId] ?? BRANDS["harbor-field"];
}

export function getAsset(
  assetId: string,
  catalog: CampaignCatalog = BASE_CATALOG,
): ApprovedAsset | undefined {
  return catalog.assets.find((asset) => asset.id === assetId);
}

export function defaultAccent(
  brandId: BrandId,
  catalog: CampaignCatalog = BASE_CATALOG,
): string {
  return getBrand(brandId, catalog).tokens.accent;
}

export function createFormValues(
  fixture: CampaignFixture,
  catalog: CampaignCatalog = BASE_CATALOG,
): CampaignFormValues {
  return {
    brandId: fixture.brief.brandId,
    accent: defaultAccent(fixture.brief.brandId, catalog),
    productName: fixture.brief.productName,
    offer: fixture.brief.offer,
    destinationUrl: fixture.brief.destinationUrl,
    assetId: fixture.assetId,
    openingFocus: fixture.openings?.[0]?.id,
  };
}

export function createCampaignBrief(fixture: CampaignFixture, values: CampaignFormValues): CampaignBrief {
  const opening = fixture.openings?.find((option) => option.id === values.openingFocus);
  return {
    ...fixture.brief,
    brandId: values.brandId,
    productName: values.productName.trim(),
    offer: values.offer.trim(),
    destinationUrl: values.destinationUrl.trim(),
    assetId: values.assetId,
    copy: opening?.copy ?? fixture.brief.copy,
    openingFocus: opening?.id,
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

export function resolveBrandTheme(
  brandId: string,
  accent?: string,
  catalog: CampaignCatalog = BASE_CATALOG,
): ResolvedBrandTheme {
  const brand = getBrand(brandId, catalog);
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
