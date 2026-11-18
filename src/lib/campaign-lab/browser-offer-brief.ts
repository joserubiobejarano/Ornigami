import {
  validateBrowserOfferIntake,
  verifyBrowserOffer,
} from "./browser-offer.ts";
import type {
  BrowserOfferConfirmations,
  BrowserOfferFactInput,
  BrowserOfferIntakeInput,
  BrowserOfferVerification,
} from "./browser-offer.ts";
import { parseCampaignContext } from "./campaign-context.ts";
import type { ValidationIssue } from "./types.ts";

export const BROWSER_OFFER_BRIEF_SCHEMA_VERSION = 1 as const;

/**
 * Server-side placeholder for the local object URL. The browser keeps the real
 * packshot local and hydrates the returned preview with it before rendering.
 */
export const BROWSER_OFFER_SERVER_ASSET_SRC = "browser-offer-local-packshot";

const MAX_BRAND_NAME_LENGTH = 120;
const MAX_FILE_NAME_LENGTH = 200;
const MAX_ALT_LENGTH = 500;
const MAX_RIGHTS_LENGTH = 500;
const MAX_ASSET_DIMENSION = 20_000;
const SHA256_PATTERN = /^[a-f0-9]{64}$/i;
const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export type BrowserOfferBriefAsset = {
  fileName?: string;
  width: number;
  height: number;
  alt: string;
  rights: string;
  contentHash: string;
};

export type BrowserOfferBriefRequest = {
  schemaVersion: typeof BROWSER_OFFER_BRIEF_SCHEMA_VERSION;
  brandName?: string;
  productName: string;
  audience?: string;
  objective?: string;
  /** Supported presentation choice; missing keeps the app-owned default accent. */
  accent?: string;
  offer: string;
  destinationUrl: string;
  facts: BrowserOfferFactInput[];
  asset: BrowserOfferBriefAsset;
  operatorConfirmations?: BrowserOfferConfirmations;
  reviewedOn?: string;
};

export type BrowserOfferBriefContext = {
  source: "browser-offer";
  ownerConfirmed: false;
  assetBytesVerified: false;
  operatorVerification: BrowserOfferVerification;
  asset: BrowserOfferBriefAsset;
};

export type BrowserOfferBriefParseResult =
  | {
      ok: true;
      input: BrowserOfferIntakeInput;
      context: BrowserOfferBriefContext;
      accent?: string;
    }
  | {
      ok: false;
      issues: ValidationIssue[];
    };

const BRIEF_KEYS = new Set([
  "schemaVersion",
  "brandName",
  "productName",
  "audience",
  "objective",
  "accent",
  "offer",
  "destinationUrl",
  "facts",
  "asset",
  "operatorConfirmations",
  "reviewedOn",
]);
const ASSET_KEYS = new Set([
  "fileName",
  "width",
  "height",
  "alt",
  "rights",
  "contentHash",
]);
const FACT_KEYS = new Set(["label", "value"]);
const CONFIRMATION_KEYS = new Set(["offer", "destination", "rights"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function unknownFields(
  record: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  prefix: string,
): string[] {
  return Object.keys(record)
    .filter((key) => !allowed.has(key))
    .map((key) => `${prefix}${key} is not supported.`);
}

function requiredText(
  record: Record<string, unknown>,
  key: string,
): string | null {
  const value = record[key];
  if (typeof value !== "string" || !value.trim()) return null;
  return value.trim();
}

function optionalText(
  record: Record<string, unknown>,
  key: string,
  label: string,
  maxLength: number,
): { value?: string; error?: string } {
  const value = record[key];
  if (value === undefined || value === null) return {};
  if (typeof value !== "string") return { error: `${label} must be text.` };
  const text = value.trim();
  if (!text) return {};
  if (text.length > maxLength) {
    return { error: `${label} must be ${maxLength} characters or fewer.` };
  }
  return { value: text };
}

function parseFacts(value: unknown): BrowserOfferFactInput[] | null {
  if (!Array.isArray(value)) return null;
  const facts: BrowserOfferFactInput[] = [];
  for (const fact of value) {
    if (!isRecord(fact)) return null;
    if (unknownFields(fact, FACT_KEYS, "Fact ").length > 0) return null;
    const label = requiredText(fact, "label");
    const factValue = requiredText(fact, "value");
    if (!label || !factValue) return null;
    facts.push({ label, value: factValue });
  }
  return facts;
}

function parseConfirmations(
  value: unknown,
): {
  confirmations?: BrowserOfferConfirmations;
  issues: string[];
} {
  if (value === undefined || value === null) return { issues: [] };
  if (!isRecord(value)) {
    return { issues: ["operatorConfirmations must be an object when supplied."] };
  }
  const issues = unknownFields(
    value,
    CONFIRMATION_KEYS,
    "operatorConfirmations.",
  );
  const read = (key: keyof BrowserOfferConfirmations) => {
    const entry = value[key];
    if (entry === undefined || entry === null) return null;
    if (typeof entry === "string") return entry;
    issues.push(`operatorConfirmations.${key} must be text or null.`);
    return null;
  };
  return {
    confirmations: {
      offer: read("offer"),
      destination: read("destination"),
      rights: read("rights"),
    },
    issues,
  };
}

function parseAsset(value: unknown): {
  asset?: BrowserOfferBriefAsset;
  issues: string[];
} {
  if (!isRecord(value)) {
    return { issues: ["asset must be an object."] };
  }
  const issues = unknownFields(value, ASSET_KEYS, "asset.");
  if ("src" in value) {
    issues.push(
      "asset.src is not accepted; the packshot file and object URL stay in the browser.",
    );
  }
  const fileName = optionalText(
    value,
    "fileName",
    "Asset file name",
    MAX_FILE_NAME_LENGTH,
  );
  if (fileName.error) issues.push(fileName.error);
  const alt = optionalText(value, "alt", "Alt text", MAX_ALT_LENGTH);
  if (alt.error) issues.push(alt.error);
  const rights = optionalText(value, "rights", "Usage rights", MAX_RIGHTS_LENGTH);
  if (rights.error) issues.push(rights.error);

  const width = value.width;
  const height = value.height;
  if (
    typeof width !== "number" ||
    !Number.isInteger(width) ||
    width <= 0 ||
    width > MAX_ASSET_DIMENSION
  ) {
    issues.push(`asset.width must be an integer from 1 to ${MAX_ASSET_DIMENSION}.`);
  }
  if (
    typeof height !== "number" ||
    !Number.isInteger(height) ||
    height <= 0 ||
    height > MAX_ASSET_DIMENSION
  ) {
    issues.push(`asset.height must be an integer from 1 to ${MAX_ASSET_DIMENSION}.`);
  }
  const contentHash = value.contentHash;
  if (typeof contentHash !== "string" || !SHA256_PATTERN.test(contentHash)) {
    issues.push("asset.contentHash must be a SHA-256 hex digest.");
  }
  if (!alt.value) issues.push("asset.alt is required.");
  if (!rights.value) issues.push("asset.rights is required.");

  if (
    issues.length > 0 ||
    !alt.value ||
    !rights.value ||
    typeof width !== "number" ||
    typeof height !== "number" ||
    typeof contentHash !== "string"
  ) {
    return { issues };
  }

  return {
    asset: {
      ...(fileName.value ? { fileName: fileName.value } : {}),
      width,
      height,
      alt: alt.value,
      rights: rights.value,
      contentHash: contentHash.toLowerCase(),
    },
    issues,
  };
}

/**
 * Validates the bounded browser-brief request and builds the same intake object
 * used by the existing browser catalog. No catalog, provider, environment, or
 * executable configuration is accepted from the client.
 */
export function parseBrowserOfferBriefRequest(
  raw: unknown,
): BrowserOfferBriefParseResult {
  if (!isRecord(raw)) {
    return {
      ok: false,
      issues: [{ field: "brandId", message: "browserBrief must be an object." }],
    };
  }

  const issues: ValidationIssue[] = [];
  const contextIssues: ValidationIssue[] = [];
  for (const message of unknownFields(raw, BRIEF_KEYS, "browserBrief.")) {
    issues.push({ field: "brandId", message });
  }
  if (raw.schemaVersion !== BROWSER_OFFER_BRIEF_SCHEMA_VERSION) {
    issues.push({
      field: "brandId",
      message: `browserBrief.schemaVersion must be ${BROWSER_OFFER_BRIEF_SCHEMA_VERSION}.`,
    });
  }

  const brandName = optionalText(
    raw,
    "brandName",
    "Brand name",
    MAX_BRAND_NAME_LENGTH,
  );
  if (brandName.error) issues.push({ field: "brandId", message: brandName.error });
  const productName = requiredText(raw, "productName");
  if (!productName) {
    issues.push({ field: "productName", message: "Product name is required." });
  }
  const offer = requiredText(raw, "offer");
  if (!offer) issues.push({ field: "offer", message: "Offer is required." });
  const destinationUrl = requiredText(raw, "destinationUrl");
  if (!destinationUrl) {
    issues.push({
      field: "destinationUrl",
      message: "Destination URL is required.",
    });
  }

  const context = parseCampaignContext({
    audience: raw.audience,
    objective: raw.objective,
  });
  if (!context.ok) {
    contextIssues.push(...context.issues);
  }

  let accent: string | undefined;
  if (raw.accent !== undefined && raw.accent !== null) {
    if (typeof raw.accent !== "string") {
      issues.push({ field: "accent", message: "Accent color must be text." });
    } else {
      const value = raw.accent.trim();
      if (value) {
        if (!HEX_COLOR_PATTERN.test(value)) {
          issues.push({
            field: "accent",
            message: "Accent color must be a six-digit hex value.",
          });
        } else {
          accent = value.toLowerCase();
        }
      }
    }
  }

  const facts = parseFacts(raw.facts);
  if (!facts) {
    issues.push({
      field: "offer",
      message: "facts must be an array of label and value objects.",
    });
  }

  const parsedAsset = parseAsset(raw.asset);
  for (const message of parsedAsset.issues) {
    issues.push({ field: "assetId", message });
  }

  const parsedConfirmations = parseConfirmations(raw.operatorConfirmations);
  for (const message of parsedConfirmations.issues) {
    issues.push({ field: "brandId", message });
  }

  let reviewedOn =
    typeof raw.reviewedOn === "string" ? raw.reviewedOn.trim() : undefined;
  if (reviewedOn !== undefined && !DATE_PATTERN.test(reviewedOn)) {
    issues.push({
      field: "brandId",
      message: "browserBrief.reviewedOn must use YYYY-MM-DD.",
    });
  }
  if (!reviewedOn) reviewedOn = new Date().toISOString().slice(0, 10);

  issues.push(...contextIssues);
  if (
    issues.length > 0 ||
    !productName ||
    !offer ||
    !destinationUrl ||
    !facts ||
    !parsedAsset.asset
  ) {
    return { ok: false, issues };
  }

  const input: BrowserOfferIntakeInput = {
    brandName: brandName.value,
    productName,
    audience: context.ok ? context.audience : undefined,
    objective: context.ok ? context.objective : undefined,
    offer,
    destinationUrl,
    facts,
    packshot: {
      ...parsedAsset.asset,
      src: BROWSER_OFFER_SERVER_ASSET_SRC,
    },
    reviewedOn,
    confirmations: parsedConfirmations.confirmations,
  };

  const validation = validateBrowserOfferIntake(input);
  if (!validation.valid) {
    const validationIssues: ValidationIssue[] = [];
    const add = (field: ValidationIssue["field"], message?: string) => {
      if (message) validationIssues.push({ field, message });
    };
    add("productName", validation.errors.productName);
    add("audience", validation.errors.audience);
    add("objective", validation.errors.objective);
    add("offer", validation.errors.offer);
    add("destinationUrl", validation.errors.destinationUrl);
    add("offer", validation.errors.facts);
    for (const row of Object.values(validation.errors.factRows ?? {})) {
      add("offer", row.label);
      add("offer", row.value);
    }
    add("assetId", validation.errors.packshot);
    add("assetId", validation.errors.alt);
    add("assetId", validation.errors.rights);
    return { ok: false, issues: validationIssues };
  }

  return {
    ok: true,
    input,
    ...(accent ? { accent } : {}),
    context: {
      source: "browser-offer",
      ownerConfirmed: false,
      assetBytesVerified: false,
      operatorVerification: verifyBrowserOffer(input),
      asset: parsedAsset.asset,
    },
  };
}

/**
 * Builds the client-to-server contract. The local packshot source and File are
 * deliberately omitted; only declared metadata crosses the boundary.
 */
export function browserOfferBriefFromIntake(
  input: BrowserOfferIntakeInput,
  options: { accent?: string } = {},
): BrowserOfferBriefRequest {
  if (!input.packshot) {
    throw new Error("A packshot is required to build the browser brief.");
  }
  const brandName =
    typeof input.brandName === "string" ? input.brandName.trim() : "";
  return {
    schemaVersion: BROWSER_OFFER_BRIEF_SCHEMA_VERSION,
    ...(brandName ? { brandName } : {}),
    productName: input.productName,
    ...(input.audience !== undefined ? { audience: input.audience } : {}),
    ...(input.objective !== undefined ? { objective: input.objective } : {}),
    ...(options.accent ? { accent: options.accent } : {}),
    offer: input.offer,
    destinationUrl: input.destinationUrl,
    facts: input.facts.map((fact) => ({ ...fact })),
    asset: {
      ...(input.packshot.fileName
        ? { fileName: input.packshot.fileName }
        : {}),
      width: input.packshot.width,
      height: input.packshot.height,
      alt: input.packshot.alt,
      rights: input.packshot.rights,
      contentHash: input.packshot.contentHash,
    },
    ...(input.confirmations
      ? { operatorConfirmations: { ...input.confirmations } }
      : {}),
    reviewedOn: input.reviewedOn,
  };
}
