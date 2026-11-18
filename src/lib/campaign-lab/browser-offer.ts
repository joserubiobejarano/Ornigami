import {
  SINGLE_PRODUCT_OFFER_TEMPLATE,
  getDestinationUrlError,
} from "./template.ts";
import type {
  ApprovedAsset,
  BrandDefinition,
  BrandTokens,
  CampaignCatalog,
  CampaignFixture,
  ProductFact,
  RequiredFactGroup,
} from "./types.ts";

export const BROWSER_OFFER_FIXTURE_ID = "browser-offer" as const;
export const BROWSER_OFFER_ASSET_ID = "browser-offer-packshot" as const;
export const BROWSER_OFFER_BRAND_ID = "browser-offer-brand" as const;
export const BROWSER_OFFER_MAX_FACTS = 3;
export const BROWSER_OFFER_MIN_FACTS = 2;

export type BrowserOfferFactInput = {
  label: string;
  value: string;
};

export type BrowserOfferPackshotInput = {
  src: string;
  width: number;
  height: number;
  alt: string;
  rights: string;
  contentHash: string;
  fileName?: string;
};

export type BrowserOfferConfirmations = {
  offer?: string | null;
  destination?: string | null;
  rights?: string | null;
};

export type BrowserOfferIntakeInput = {
  brandName?: string;
  productName: string;
  audience?: string;
  objective?: string;
  offer: string;
  destinationUrl: string;
  facts: readonly BrowserOfferFactInput[];
  packshot: BrowserOfferPackshotInput | null;
  reviewedOn: string;
  confirmations?: BrowserOfferConfirmations;
};

export type OfferVerification = "missing" | "provisional" | "confirmed";
export type DestinationVerification =
  | "missing"
  | "search"
  | "unconfirmed"
  | "invalid"
  | "direct";

export type BrowserOfferVerification = {
  offer: OfferVerification;
  destination: DestinationVerification;
  rights: OfferVerification;
  provisional: boolean;
};

export type BrowserOfferFactErrors = {
  label?: string;
  value?: string;
};

export type BrowserOfferIntakeErrors = {
  productName?: string;
  offer?: string;
  destinationUrl?: string;
  facts?: string;
  factRows?: Record<number, BrowserOfferFactErrors>;
  packshot?: string;
  alt?: string;
  rights?: string;
};

export type BrowserOfferIntakeValidation = {
  valid: boolean;
  errors: BrowserOfferIntakeErrors;
};

export function isProvisionalRights(value: string): boolean {
  return /pending|unconfirmed|not confirmed|preview only|confirm .*rights/i.test(
    value,
  );
}

export function classifyOffer(value: string): OfferVerification {
  const offer = trimmed(value);
  if (!offer) return "missing";
  if (/placeholder|pending|unconfirmed|tbc|to be confirmed/i.test(offer)) {
    return "provisional";
  }
  return "confirmed";
}

export function classifyDestination(value: string): DestinationVerification {
  const destination = trimmed(value);
  if (!destination) return "missing";
  if (getDestinationUrlError(destination)) return "invalid";
  if (
    /amazon\.[^/]+\/s\?|(?:^|[/.])search(?:[/?]|$)|placeholder|pending|unconfirmed/i.test(
      destination,
    )
  ) {
    return "search";
  }
  return "direct";
}

function confirmedExactly(
  confirmed: string | null | undefined,
  value: string,
): boolean {
  return Boolean(confirmed) && confirmed === value.trim();
}

export function verifyBrowserOffer(input: BrowserOfferIntakeInput): BrowserOfferVerification {
  const offerValue = input.offer.trim();
  const destinationValue = input.destinationUrl.trim();
  const rightsValue = input.packshot?.rights.trim() ?? "";
  const confirmations = input.confirmations;

  const offerClassification = classifyOffer(offerValue);
  const destinationClassification = classifyDestination(destinationValue);
  const rightsClassification: OfferVerification = rightsValue
    ? isProvisionalRights(rightsValue)
      ? "provisional"
      : "confirmed"
    : "missing";

  const offer =
    offerClassification === "confirmed" &&
    !confirmedExactly(confirmations?.offer, offerValue)
      ? "provisional"
      : offerClassification;
  const destination =
    destinationClassification === "direct" &&
    !confirmedExactly(confirmations?.destination, destinationValue)
      ? "unconfirmed"
      : destinationClassification;
  const rights =
    rightsClassification === "confirmed" &&
    !confirmedExactly(confirmations?.rights, rightsValue)
      ? "provisional"
      : rightsClassification;

  return {
    offer,
    destination,
    rights,
    provisional:
      offer === "provisional" ||
      destination === "search" ||
      destination === "unconfirmed" ||
      rights === "provisional",
  };
}

export function provisionalOfferInputs(
  verification: BrowserOfferVerification,
): string[] {
  return [
    verification.offer === "provisional" ? "offer" : null,
    verification.destination === "search" ||
    verification.destination === "unconfirmed"
      ? "destination"
      : null,
    verification.rights === "provisional" ? "media rights" : null,
  ].filter((value): value is string => Boolean(value));
}

export function browserOfferPilotNote(
  verification: BrowserOfferVerification,
): string {
  return verification.provisional
    ? `Provisional: ${provisionalOfferInputs(verification).join(", ")}. Confirm before publication.`
    : "Local browser brief · not publication approval.";
}

const NEUTRAL_TOKENS: BrandTokens = {
  page: "#f6f3ec",
  surface: "#e8e2d6",
  ink: "#1f2a24",
  muted: "#60695f",
  accent: "#2f5d4a",
  accentInk: "#f8faf7",
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

function browserBrand(brandName?: string): BrandDefinition {
  const name = brandName?.trim() || "Preview brand";
  return {
    id: BROWSER_OFFER_BRAND_ID,
    name,
    wordmark: brandName?.trim() || "Preview",
    descriptor: brandName?.trim() ? "Local brand preview" : "Neutral preview",
    tokens: { ...NEUTRAL_TOKENS },
    headlineMode: "offer-led",
    detailTitle: "Product details",
  };
}

function trimmed(value: string): string {
  return value.trim();
}

function factSlug(label: string, index: number): string {
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return slug || `fact-${index + 1}`;
}

function uniqueFactIds(labels: readonly string[]): string[] {
  const used = new Map<string, number>();
  return labels.map((label, index) => {
    const base = factSlug(label, index);
    const count = used.get(base) ?? 0;
    used.set(base, count + 1);
    return count === 0 ? base : `${base}-${count + 1}`;
  });
}

function productNoun(productName: string): string {
  const words = trimmed(productName).split(/\s+/);
  return (words.at(-1) ?? "product").toLowerCase();
}

function productLede(productName: string, brand: BrandDefinition): string {
  return `A ${productNoun(productName)} from ${brand.name}.`;
}

export function validateBrowserOfferIntake(
  input: BrowserOfferIntakeInput,
): BrowserOfferIntakeValidation {
  const errors: BrowserOfferIntakeErrors = {};
  const limits = SINGLE_PRODUCT_OFFER_TEMPLATE.limits;

  const productName = trimmed(input.productName);
  if (!productName) {
    errors.productName = "Enter the product name.";
  } else if (productName.length > limits.productName) {
    errors.productName = `Use ${limits.productName} characters or fewer.`;
  }

  const offer = trimmed(input.offer);
  if (!offer) {
    errors.offer = "Enter the offer.";
  } else if (offer.length > limits.offer) {
    errors.offer = `Use ${limits.offer} characters or fewer.`;
  }

  const destinationError = getDestinationUrlError(input.destinationUrl);
  if (destinationError) {
    errors.destinationUrl = destinationError;
  }

  if (input.facts.length < BROWSER_OFFER_MIN_FACTS) {
    errors.facts = `Add at least ${BROWSER_OFFER_MIN_FACTS} approved facts.`;
  } else if (input.facts.length > BROWSER_OFFER_MAX_FACTS) {
    errors.facts = `The offer page holds up to ${BROWSER_OFFER_MAX_FACTS} facts.`;
  }

  const factRows: Record<number, BrowserOfferFactErrors> = {};
  input.facts.forEach((fact, index) => {
    const row: BrowserOfferFactErrors = {};
    const label = trimmed(fact.label);
    const value = trimmed(fact.value);
    if (!label) {
      row.label = "Enter the fact label.";
    } else if (label.length > limits.factLabel) {
      row.label = `Use ${limits.factLabel} characters or fewer.`;
    }
    if (!value) {
      row.value = "Enter the approved value.";
    } else if (value.length > limits.factValue) {
      row.value = `Use ${limits.factValue} characters or fewer.`;
    }
    if (row.label || row.value) factRows[index] = row;
  });
  if (Object.keys(factRows).length > 0) {
    errors.factRows = factRows;
  }

  if (!input.packshot) {
    errors.packshot = "Choose a local packshot.";
  }
  if (!trimmed(input.packshot?.alt ?? "")) {
    errors.alt = "Enter the packshot alt text.";
  }
  if (!trimmed(input.packshot?.rights ?? "")) {
    errors.rights = "Enter the usage rights.";
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

/**
 * Builds a browser-only offer fixture from the operator's approved inputs.
 * It does not write a pilot file or call the pilot loader.
 */
export function buildBrowserOfferCatalog(
  input: BrowserOfferIntakeInput,
): {
  fixture: CampaignFixture;
  catalog: CampaignCatalog;
  verification: BrowserOfferVerification;
} {
  const brand = browserBrand(input.brandName);
  const verification = verifyBrowserOffer(input);
  const factsInput = input.facts.map((fact) => ({
    label: trimmed(fact.label),
    value: trimmed(fact.value),
  }));
  const ids = uniqueFactIds(factsInput.map((fact) => fact.label));
  const productFacts: ProductFact[] = factsInput.map((fact, index) => ({
    id: ids[index],
    label: fact.label,
    value: fact.value,
    source: {
      document: "Browser offer intake",
      quote: `${fact.label}: ${fact.value}`,
      reviewedBy: "Local browser operator",
      reviewedOn: input.reviewedOn,
    },
  }));
  const requiredFactGroups: RequiredFactGroup[] =
    productFacts.length > 0
      ? [
          {
            id: "browser-offer-required-facts",
            label: "the approved facts",
            factIds: ids,
          },
        ]
      : [];
  const packshot = input.packshot;
  if (!packshot) {
    throw new Error("A packshot is required to build the offer brief.");
  }

  const asset: ApprovedAsset = {
    id: BROWSER_OFFER_ASSET_ID,
    brandId: brand.id,
    src: packshot.src,
    width: packshot.width,
    height: packshot.height,
    alt: trimmed(packshot.alt),
    role: "product-hero",
    reviewed: true,
    reviewedBy: "Local browser operator",
    reviewedOn: input.reviewedOn,
    source: packshot.fileName
      ? `Browser intake upload: ${packshot.fileName}`
      : "Browser intake upload",
    rights: trimmed(packshot.rights),
    contentHash: packshot.contentHash,
  };

  const fixture: CampaignFixture = {
    id: BROWSER_OFFER_FIXTURE_ID,
    label: "Browser offer",
    description: "A single-product offer entered in the local browser intake.",
    assetId: asset.id,
    brief: {
      fixtureId: BROWSER_OFFER_FIXTURE_ID,
      brandId: brand.id,
      productName: trimmed(input.productName),
      audience: trimmed(input.audience ?? "") || undefined,
      objective: trimmed(input.objective ?? "") || undefined,
      offer: trimmed(input.offer),
      destinationUrl: trimmed(input.destinationUrl),
      assetId: asset.id,
      actionLabel: "Shop now",
      productNoun: productNoun(input.productName),
      productFacts,
      requiredFactGroups,
      copy: {
        lede: productLede(input.productName, brand),
        hideLede: true,
      },
    },
  };

  return {
    fixture,
    verification,
    catalog: {
      brands: { [brand.id]: brand },
      fixtures: { [fixture.id]: fixture },
      assets: [asset],
      pilot: {
        id: BROWSER_OFFER_FIXTURE_ID,
        label: "Browser offer intake",
        status: verification.provisional ? "preview" : "confirmed",
        note: browserOfferPilotNote(verification),
      },
    },
  };
}
