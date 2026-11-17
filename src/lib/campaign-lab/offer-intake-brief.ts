import {
  BROWSER_OFFER_MAX_FACTS,
  BROWSER_OFFER_MIN_FACTS,
} from "./browser-offer.ts";
import type { BrowserOfferFactInput } from "./browser-offer.ts";

export const OFFER_INTAKE_BRIEF_STORAGE_KEY =
  "ornigami.campaign-lab.offer-intake.brief.v1";

export type PersistedOfferIntakeBrief = {
  schemaVersion: 1;
  brandName: string;
  productName: string;
  offer: string;
  destinationUrl: string;
  facts: BrowserOfferFactInput[];
  alt: string;
  rights: string;
};

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

  const rawFacts = Array.isArray(record.facts) ? record.facts : [];
  const facts = rawFacts
    .slice(0, BROWSER_OFFER_MAX_FACTS)
    .map((fact) => readFact(fact));
  while (facts.length < BROWSER_OFFER_MIN_FACTS) {
    facts.push({ label: "", value: "" });
  }

  return {
    schemaVersion: 1,
    brandName: text(record.brandName),
    productName: text(record.productName),
    offer: text(record.offer),
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
      brief.offer.trim() ||
      brief.destinationUrl.trim() ||
      brief.alt.trim() ||
      brief.rights.trim() ||
      brief.facts.some((fact) => fact.label.trim() || fact.value.trim()),
  );
}
