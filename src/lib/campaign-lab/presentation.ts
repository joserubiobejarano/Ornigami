import type { ApprovedAsset, BrandTokens, CampaignBrief, TemplateDraft } from "./types.ts";

export type CampaignImagePresentation = {
  fit: "contain" | "cover";
  frame: "natural-arch" | "compact";
};

/** Approved image policy, independent of motion. A portrait product hero in an
 * arch keeps its natural aspect at tablet widths instead of clipping the
 * product or leaving a narrow image floating inside a wide empty arch. */
export function resolveCampaignImage(
  asset: Pick<ApprovedAsset, "imageFit"> & Partial<Pick<ApprovedAsset, "role">>,
  tokens: Pick<BrandTokens, "heroImage">,
): CampaignImagePresentation {
  const fit = asset.imageFit ?? (asset.role === "product-hero" ? "contain" : "cover");
  return { fit, frame: tokens.heroImage === "arch" && asset.role === "product-hero" && fit === "contain" ? "natural-arch" : "compact" };
}

const ASCII_WHITESPACE = /[ \t\n\r\f]+/g;
const EDGE_ASCII_WHITESPACE = /^[ \t\n\r\f]+|[ \t\n\r\f]+$/g;
const COMPACT_COPY_LIMIT = 320;

/**
 * Matches the whitespace HTML collapses when rendering text. Ordinary ASCII
 * whitespace is normalized, but meaningful Unicode whitespace such as a
 * nonbreaking space is preserved. The source campaign strings are never
 * mutated; this is only for presentation decisions and revision identity.
 */
export function presentationText(value: string): string {
  return value
    .replace(EDGE_ASCII_WHITESPACE, "")
    .replace(ASCII_WHITESPACE, " ");
}

export function visibleLede(brief: CampaignBrief, draft: TemplateDraft): string {
  return brief.copy.hideLede ? "" : presentationText(draft.lede);
}

export function showsProductLabel(
  brief: CampaignBrief,
  draft: TemplateDraft,
): boolean {
  return !presentationText(draft.headline)
    .toLowerCase()
    .includes(presentationText(brief.productName).toLowerCase());
}

export function renderedCopyLength(
  brief: CampaignBrief,
  draft: TemplateDraft,
): number {
  return (
    presentationText(draft.headline).length +
    visibleLede(brief, draft).length +
    presentationText(brief.offer).length +
    draft.facts.reduce(
      (total, fact) =>
        total +
        presentationText(fact.label).length +
        presentationText(fact.value).length,
      0,
    )
  );
}

/** One shared decision for the optional closing CTA. */
export function shouldShowClose(
  brief: CampaignBrief,
  draft: TemplateDraft,
): boolean {
  return (
    draft.sections.includes("close") &&
    (draft.layout === "editorial-long-copy" ||
      renderedCopyLength(brief, draft) >= COMPACT_COPY_LIMIT)
  );
}
