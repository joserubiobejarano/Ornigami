import { parseOfferComposition, type OfferComposition } from "./composition.ts";
import { parseBrandSnapshot, paletteTokens, type BrandKitSnapshot } from "./brand-review.ts";
import { resolveVisualDirection } from "./visual-directions.ts";
import {
  BROWSER_OFFER_MAX_FACTS,
  BROWSER_OFFER_MIN_FACTS,
  validateBrowserOfferIntake,
} from "./browser-offer.ts";
import type { BrowserOfferFactInput } from "./browser-offer.ts";
import { parseCampaignContext } from "./campaign-context.ts";

export const OFFER_INTAKE_BRIEF_STORAGE_KEY =
  "ornigami.campaign-lab.offer-intake.brief.v1";

/**
 * The production builder uses a distinct tab-local key so laboratory drafts,
 * including URL-import evidence, never appear in the builder and vice versa.
 */
export const BUILDER_OFFER_INTAKE_BRIEF_STORAGE_KEY =
  "ornigami.builder.offer-intake.brief.v1";

export type PersistedOfferIntakeBrief = {
  schemaVersion: 1;
  brandKitSnapshot?: BrandKitSnapshot;
  directionId?: string;
  composition?: OfferComposition;
  accent?: string;
  brandName: string;
  productName: string;
  audience: string;
  objective: string;
  offer: string;
  offerPrice?: string;
  destinationUrl: string;
  facts: BrowserOfferFactInput[];
  alt: string;
  rights: string;
};

export type PreparedOfferIntakeBrief = Omit<
  PersistedOfferIntakeBrief,
  "schemaVersion"
>;

export type PreparedOfferIntakeBriefResult =
  | { ok: true; brief: PreparedOfferIntakeBrief }
  | { ok: false; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requiredText(
  record: Record<string, unknown>,
  key: string,
  label: string,
): string {
  const value = record[key];
  if (typeof value !== "string") {
    throw new Error(`${label} must be text.`);
  }
  if (!value.trim()) {
    throw new Error(`${label} is required.`);
  }
  return value;
}

function optionalText(
  record: Record<string, unknown>,
  key: string,
  label: string,
): string {
  const value = record[key];
  if (value === undefined) return "";
  if (typeof value !== "string") {
    throw new Error(`${label} must be text.`);
  }
  return value;
}

function preparedFact(value: unknown, index: number): BrowserOfferFactInput {
  if (!isRecord(value)) {
    throw new Error(`Fact ${index + 1} must be an object with label and value.`);
  }
  return {
    label: requiredText(value, "label", `Fact ${index + 1} label`),
    value: requiredText(value, "value", `Fact ${index + 1} value`),
  };
}

function preparedValidationMessage(
  errors: ReturnType<typeof validateBrowserOfferIntake>["errors"],
): string {
  const messages = [
    errors.productName,
    errors.offer,
    errors.offerPrice,
    errors.destinationUrl,
    errors.facts,
    errors.alt,
    errors.rights,
  ].filter((message): message is string => Boolean(message));
  for (const row of Object.values(errors.factRows ?? {})) {
    if (row.label) messages.push(row.label);
    if (row.value) messages.push(row.value);
  }
  return messages.slice(0, 3).join(" ");
}

export function parsePreparedOfferIntakeBrief(
  raw: string,
): PreparedOfferIntakeBriefResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: "Prepared brief must be valid JSON." };
  }

  if (!isRecord(parsed)) {
    return { ok: false, error: "Prepared brief must be one JSON object." };
  }
  if (parsed.schemaVersion !== 1) {
    return { ok: false, error: "Prepared brief schemaVersion must be 1." };
  }

  try {
    const rawFacts = parsed.facts;
    if (!Array.isArray(rawFacts)) {
      throw new Error("Facts must be an array.");
    }
    if (rawFacts.length < BROWSER_OFFER_MIN_FACTS) {
      throw new Error(`Add at least ${BROWSER_OFFER_MIN_FACTS} facts.`);
    }
    if (rawFacts.length > BROWSER_OFFER_MAX_FACTS) {
      throw new Error(`Use no more than ${BROWSER_OFFER_MAX_FACTS} facts.`);
    }

    const context = parseCampaignContext({
      audience: parsed.audience,
      objective: parsed.objective,
    });
    if (!context.ok) {
      throw new Error(context.issues.map((issue) => issue.message).join(" "));
    }

    const brief: PreparedOfferIntakeBrief = {
      ...(parsed.brandKitSnapshot !== undefined ? { brandKitSnapshot: parseBrandSnapshot(parsed.brandKitSnapshot) } : {}),
      ...(parsed.composition !== undefined ? { composition: parseOfferComposition(parsed.composition) } : {}),
      ...(parsed.directionId !== undefined ? { directionId: resolveVisualDirection(parsed.directionId).id } : {}),
      ...(parsed.accent !== undefined ? { accent: optionalText(parsed, "accent", "Accent override") } : {}),
      brandName: optionalText(parsed, "brandName", "Brand name"),
      productName: requiredText(parsed, "productName", "Product name"),
      audience: context.audience ?? "",
      objective: context.objective ?? "",
      offer: requiredText(parsed, "offer", "Offer"),
      ...(parsed.offerPrice !== undefined
        ? { offerPrice: optionalText(parsed, "offerPrice", "Reviewed emphasis") }
        : {}),
      destinationUrl: requiredText(
        parsed,
        "destinationUrl",
        "Destination URL",
      ),
      facts: rawFacts.map(preparedFact),
      alt: requiredText(parsed, "alt", "Alt text"),
      rights: requiredText(parsed, "rights", "Usage rights"),
    };

    if (brief.accent && !/^#[a-f0-9]{6}$/i.test(brief.accent)) throw new Error("Accent override must be a six-digit hex color.");
    paletteTokens(resolveVisualDirection(brief.directionId).tokens, brief.brandKitSnapshot, brief.accent || undefined);
    const validation = validateBrowserOfferIntake({
      brandName: brief.brandName,
      productName: brief.productName,
      offer: brief.offer,
      offerPrice: brief.offerPrice,
      destinationUrl: brief.destinationUrl,
      facts: brief.facts,
      packshot: {
        src: "prepared-brief",
        width: 1,
        height: 1,
        contentHash: "",
        alt: brief.alt,
        rights: brief.rights,
      },
      reviewedOn: "",
    });
    if (!validation.valid) {
      return {
        ok: false,
        error: `Prepared brief is invalid: ${preparedValidationMessage(validation.errors)}`,
      };
    }

    return { ok: true, brief };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Prepared brief is invalid.",
    };
  }
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function readFact(value: unknown): BrowserOfferFactInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { label: "", value: "" };
  }
  const fact = value as Record<string, unknown>;
  return { label: text(fact.label), value: text(fact.value) };
}

export function parsePersistedOfferIntakeBrief(
  raw: string | null,
): PersistedOfferIntakeBrief | null {
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return null;
  }

  const record = parsed as Record<string, unknown>;
  if (record.schemaVersion !== 1) return null;

  let composition: OfferComposition | undefined;
  try { if (record.composition !== undefined) composition = parseOfferComposition(record.composition); } catch { return null; }
  let directionId: string;
  try { directionId = resolveVisualDirection(record.directionId).id; } catch { return null; }
  if (record.accent !== undefined && typeof record.accent !== "string") return null;
  let brandKitSnapshot: BrandKitSnapshot | undefined;
  try { if (record.brandKitSnapshot !== undefined) brandKitSnapshot = parseBrandSnapshot(record.brandKitSnapshot);
    if (brandKitSnapshot) paletteTokens(resolveVisualDirection(directionId).tokens, brandKitSnapshot, /^#[a-f0-9]{6}$/i.test(text(record.accent)) ? text(record.accent) : undefined);
  } catch { return null; }
  const rawFacts = Array.isArray(record.facts) ? record.facts : [];
  const facts = rawFacts
    .slice(0, BROWSER_OFFER_MAX_FACTS)
    .map((fact) => readFact(fact));
  while (facts.length < BROWSER_OFFER_MIN_FACTS) {
    facts.push({ label: "", value: "" });
  }

  return {
    schemaVersion: 1,
    ...(composition !== undefined ? { composition } : {}),
    ...(brandKitSnapshot ? { brandKitSnapshot } : {}),
    ...(record.directionId !== undefined ? { directionId } : {}),
    ...(record.accent !== undefined ? { accent: text(record.accent) } : {}),
    brandName: text(record.brandName),
    productName: text(record.productName),
    audience: text(record.audience),
    objective: text(record.objective),
    offer: text(record.offer),
    ...(record.offerPrice !== undefined
      ? { offerPrice: text(record.offerPrice) }
      : {}),
    destinationUrl: text(record.destinationUrl),
    facts,
    alt: text(record.alt),
    rights: text(record.rights),
  };
}

export function serializePersistedOfferIntakeBrief(
  brief: Omit<PersistedOfferIntakeBrief, "schemaVersion">,
): string {
  return JSON.stringify({ schemaVersion: 1, ...brief });
}

export function hasPersistedBriefContent(
  brief: PersistedOfferIntakeBrief,
): boolean {
  return Boolean(
    brief.brandName.trim() ||
      brief.productName.trim() ||
      brief.audience?.trim() ||
      brief.objective?.trim() ||
      brief.offer.trim() ||
      brief.offerPrice?.trim() ||
      brief.destinationUrl.trim() ||
      brief.alt.trim() ||
      brief.rights.trim() ||
      brief.facts.some((fact) => fact.label.trim() || fact.value.trim()),
  );
}
