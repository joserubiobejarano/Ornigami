import type {
  AdvertorialBriefData,
  AdvertorialOpening,
  ApprovedAsset,
  ApprovedStoryBeat,
  BaseBrandId,
  BaseFixtureId,
  BrandDefinition,
  BrandId,
  BrandTokens,
  CampaignBrief,
  CampaignCatalog,
  CampaignFixture,
  CampaignFormat,
  CampaignOpening,
  CampaignFormValues,
  Disclosure,
  FixtureId,
  PilotBundle,
  ResolvedBrandTheme,
} from "./types.ts";
import { pickOfferEmphasisInk } from "./brand-review.ts";

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
    headlineMode: "product-led",
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
    imageFit: "contain",
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
    imageFit: "contain",
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
  {
    id: "morrow-prototype",
    brandId: "morrow-ceramic",
    src: "/campaign-assets/morrow-prototype.svg",
    width: 1200,
    height: 1200,
    alt: "Early Morrow ceramic dripper prototype labelled PROTOTYPE 01 on a workbench, with a note reading rib spacing / revised.",
    role: "product-evidence",
    reviewed: true,
    reviewedBy: "Ornigami design review",
    reviewedOn: "2026-11-15",
    source: "Original fictional fixture from the approved Morrow review brief",
    rights: "Original work for this local prototype; fictional brand.",
    contentHash: "340d84ef43beaa1a52c2fb04e376ba716c58988fa07d14117497520fb3e25548",
    caption: "Prototype 01 · revised rib spacing.",
  },
  {
    id: "morrow-ribs",
    brandId: "morrow-ceramic",
    src: "/campaign-assets/morrow-ribs.svg",
    width: 1200,
    height: 1500,
    alt: "Close view of the three raised interior ribs inside the Morrow cream ceramic dripper.",
    role: "product-detail",
    reviewed: true,
    reviewedBy: "Ornigami design review",
    reviewedOn: "2026-11-15",
    source: "Original fictional fixture from the approved Morrow review brief",
    rights: "Original work for this local prototype; fictional brand.",
    contentHash: "200082d2ee10c8ab17678973db47d6835e8b5550a5fd2f8890ab94394dcdb901",
    caption: "Three interior ribs · finished cone.",
  },
  {
    id: "morrow-pour",
    brandId: "morrow-ceramic",
    src: "/campaign-assets/morrow-pour.svg",
    width: 1600,
    height: 1000,
    alt: "Water poured from a kettle into the Morrow cream ceramic dripper on a dark table.",
    role: "product-in-use",
    reviewed: true,
    reviewedBy: "Ornigami design review",
    reviewedOn: "2026-11-15",
    source: "Original fictional fixture from the approved Morrow review brief",
    rights: "Original work for this local prototype; fictional brand.",
    contentHash: "c7dfbcace4ff3c2061da9ebe361fafe937eeb9ad945d27885758af770bdca69b",
    caption: "Water poured into the Morrow dripper.",
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

const MORROW_ADVERTORIAL_OPENINGS: readonly AdvertorialOpening[] = [
  {
    id: "flow-control",
    headline: "Why this pour-over dripper keeps the filter off the wall",
    standfirst: "Three raised interior ribs hold the coffee filter clear of the ceramic wall.",
  },
];

const MORROW_STORY_BEATS: readonly ApprovedStoryBeat[] = [
  {
    id: "prototype-wall",
    role: "opening",
    text: "In the first prototype, the filter sat against the wall.",
    source: {
      document: "Morrow Ceramic approved flow-control lede",
      quote: "In the first prototype, the filter sat against the wall.",
      reviewedBy: "Ornigami content review",
      reviewedOn: "2026-11-15",
    },
  },
  {
    id: "rib-revision",
    role: "turn",
    text: "Morrow revised the spacing between the three interior ribs.",
    source: {
      document: "Morrow Ceramic approved flow-control lede",
      quote: "Morrow revised the spacing between the three interior ribs.",
      reviewedBy: "Ornigami content review",
      reviewedOn: "2026-11-15",
    },
  },
];

const MORROW_DISCLOSURE: Disclosure = {
  label: "Advertisement",
  sponsor: "Morrow Ceramic",
  explanation:
    "Paid advertisement created by Ornigami for Morrow Ceramic. Images are illustrations.",
  repeatAtClose: false,
};

const MORROW_PRODUCT_TRANSITION =
  "The finished dripper uses that revised rib spacing: three interior ribs hold the coffee filter clear of the wall.";

const MORROW_ADVERTORIAL_FACTS = [
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
] as const;

function morrowAdvertorialData(
  assetAssignments: AdvertorialBriefData["assetAssignments"],
  preferredLayout: AdvertorialBriefData["preferredLayout"],
): AdvertorialBriefData {
  return {
    openings: MORROW_ADVERTORIAL_OPENINGS,
    storyBeats: MORROW_STORY_BEATS,
    disclosure: MORROW_DISCLOSURE,
    productTransition: MORROW_PRODUCT_TRANSITION,
    assetAssignments,
    preferredLayout,
  };
}

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
      audience: "People discovering the bottle in a paid social ad on mobile.",
      objective:
        "Send the visitor to the marketplace listing while the 20% offer is clear.",
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
      audience:
        "People curious about pour-over coffee who clicked an email asking what changes when the first pour is slower.",
      objective: "Explain the rib design and lead to the dripper page.",
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
  "morrow-advertorial-full": {
    id: "morrow-advertorial-full",
    label: "Morrow advertorial",
    description: "Approved story, evidence, detail and use images for the full advertorial.",
    openings: [MORROW_OPENINGS[0]],
    assetId: "morrow-ceramic-dripper-front",
    brief: {
      fixtureId: "morrow-advertorial-full",
      brandId: "morrow-ceramic",
      productName: "Morrow ceramic pour-over dripper",
      audience:
        "People curious about pour-over coffee who clicked an email asking what changes when the first pour is slower.",
      objective: "Explain the rib design through the approved story and lead to the dripper page.",
      offer: "Free shipping through 30 November 2026",
      destinationUrl: "https://example.com/morrow",
      assetId: "morrow-ceramic-dripper-front",
      actionLabel: "See the dripper",
      productNoun: "pour-over dripper",
      productFacts: MORROW_ADVERTORIAL_FACTS.map((fact) => ({
        ...fact,
        source: { ...fact.source },
      })),
      requiredFactGroups: [
        { id: "rib-design", label: "the rib design", factIds: ["interior", "outlet", "body"] },
      ],
      copy: MORROW_OPENINGS[0].copy,
      advertorial: morrowAdvertorialData(
        [
          { role: "product-detail", assetId: "morrow-ribs" },
          { role: "product-evidence", assetId: "morrow-prototype" },
          { role: "product-hero", assetId: "morrow-ceramic-dripper-front" },
        ],
        "advertorial-full",
      ),
    },
  },
  "morrow-advertorial-one-photo": {
    id: "morrow-advertorial-one-photo",
    label: "Morrow one photo",
    description: "The same approved story with only the product hero available.",
    openings: [MORROW_OPENINGS[0]],
    assetId: "morrow-ceramic-dripper-front",
    brief: {
      fixtureId: "morrow-advertorial-one-photo",
      brandId: "morrow-ceramic",
      productName: "Morrow ceramic pour-over dripper",
      audience:
        "People curious about pour-over coffee who clicked an email asking what changes when the first pour is slower.",
      objective: "Explain the rib design through the approved story and lead to the dripper page.",
      offer: "Free shipping through 30 November 2026",
      destinationUrl: "https://example.com/morrow",
      assetId: "morrow-ceramic-dripper-front",
      actionLabel: "See the dripper",
      productNoun: "pour-over dripper",
      productFacts: MORROW_ADVERTORIAL_FACTS.map((fact) => ({
        ...fact,
        source: { ...fact.source },
      })),
      requiredFactGroups: [
        { id: "rib-design", label: "the rib design", factIds: ["interior", "outlet", "body"] },
      ],
      copy: MORROW_OPENINGS[0].copy,
      advertorial: morrowAdvertorialData(
        [{ role: "product-hero", assetId: "morrow-ceramic-dripper-front" }],
        "advertorial-one-photo",
      ),
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

/** Known input conflict, distinct from programming errors. Keep all records. */
export class ApprovedAssetLookupError extends Error {
  readonly assetId: string;
  readonly matches: readonly ApprovedAsset[];
  constructor(assetId: string, matches: readonly ApprovedAsset[]) {
    super(`Ambiguous approved asset ID "${assetId}". Conflicting identities: ${matches.map(asset => `${asset.src} [SHA-256 ${asset.contentHash}; fit ${asset.imageFit ?? "role default"}; role ${asset.role}]`).join(" versus ")}. Fix the source IDs and reload; no asset was selected.`);
    this.assetId = assetId; this.matches = matches;
  }
}
export function assetLookupIssue(assetId: string, catalog: CampaignCatalog = BASE_CATALOG) {
  const matches = catalog.assets.filter(asset => asset.id === assetId);
  if (matches.length > 1) return { field: "assetId" as const, message: new ApprovedAssetLookupError(assetId, matches).message };
  if (!matches.length) return { field: "assetId" as const, message: `Approved asset "${assetId}" is not in the approved asset library. Restore the approved source record and reload.` };
  return null;
}
export function getAsset(
  assetId: string,
  catalog: CampaignCatalog = BASE_CATALOG,
): ApprovedAsset | undefined {
  const matches = catalog.assets.filter((asset) => asset.id === assetId);
  if (matches.length > 1) throw new ApprovedAssetLookupError(assetId, matches);
  return matches[0];
}

export function defaultAccent(
  brandId: BrandId,
  catalog: CampaignCatalog = BASE_CATALOG,
): string {
  return getBrand(brandId, catalog).tokens.accent;
}

export function defaultFormat(fixture: CampaignFixture): CampaignFormat {
  return fixture.brief.advertorial ? "advertorial" : "offer";
}

export function openingOptionsForFormat(
  fixture: CampaignFixture,
  format: CampaignFormat,
): readonly { id: string; label: string }[] {
  if (format === "advertorial") {
    return (fixture.brief.advertorial?.openings ?? []).map((opening) => ({
      id: opening.id,
      label: opening.headline,
    }));
  }
  return (fixture.openings ?? []).map((opening) => ({
    id: opening.id,
    label: opening.label,
  }));
}

export function openingFocusForFormat(
  fixture: CampaignFixture,
  format: CampaignFormat,
  preferred?: string,
): string | undefined {
  const options = openingOptionsForFormat(fixture, format);
  if (preferred && options.some((option) => option.id === preferred)) return preferred;
  return options[0]?.id;
}

export function createFormValues(
  fixture: CampaignFixture,
  catalog: CampaignCatalog = BASE_CATALOG,
): CampaignFormValues {
  const format = defaultFormat(fixture);
  return {
    ...(fixture.brief.brandKitSnapshot ? { brandKitSnapshot: fixture.brief.brandKitSnapshot } : {}),
    composition: fixture.brief.composition,
    brandId: fixture.brief.brandId,
    accent: fixture.brief.accentOverride ?? defaultAccent(fixture.brief.brandId, catalog),
    ...(fixture.brief.directionId ? { directionId: fixture.brief.directionId, accentOverride: fixture.brief.accentOverride } : {}),
    productName: fixture.brief.productName,
    audience: fixture.brief.audience,
    objective: fixture.brief.objective,
    offer: fixture.brief.offer,
    offerPrice: fixture.brief.offerPrice,
    destinationUrl: fixture.brief.destinationUrl,
    assetId: fixture.assetId,
    openingFocus: openingFocusForFormat(fixture, format),
    format,
    advertorialLayout: "auto",
  };
}

function optionalCampaignText(value: unknown): string | undefined {
  const text = typeof value === "string" ? value.trim() : "";
  return text || undefined;
}

export function createCampaignBrief(fixture: CampaignFixture, values: CampaignFormValues): CampaignBrief {
  const opening = fixture.openings?.find((option) => option.id === values.openingFocus);
  return {
    ...fixture.brief,
    brandKitSnapshot: values.brandKitSnapshot,
    composition: values.composition,
    ...(values.directionId ? { directionId: values.directionId, accentOverride: values.accentOverride } : {}),
    brandId: values.brandId,
    productName: values.productName.trim(),
    audience:
      values.audience !== undefined
        ? optionalCampaignText(values.audience)
        : optionalCampaignText(fixture.brief.audience),
    objective:
      values.objective !== undefined
        ? optionalCampaignText(values.objective)
        : optionalCampaignText(fixture.brief.objective),
    offer: values.offer.trim(),
    offerPrice:
      values.offerPrice !== undefined
        ? optionalCampaignText(values.offerPrice)
        : fixture.brief.offerPrice,
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
  const tokens = {
    ...brand.tokens,
    accent: normalizedAccent,
    accentInk: pickAccentInk(normalizedAccent),
  };
  return {
    brand,
    tokens: {
      ...tokens,
      offerEmphasisInk: pickOfferEmphasisInk(tokens),
    },
  };
}
