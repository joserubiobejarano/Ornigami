import type { ApprovedAsset } from "./types.ts";

export type OfferComposition = "direction-default" | "product-focus";
export type CampaignCompositionPresentation = {
  id: "product-focus";
  version: "1.0.0";
  narrowOrder: "headline-product-offer-action-facts";
  containedPackshot: boolean;
};

/** Scalar app-owned input. Models and HTTP clients cannot supply a recipe. */
export function parseOfferComposition(value: unknown): OfferComposition {
  if (value === undefined || value === "direction-default") return "direction-default";
  if (value === "product-focus") return value;
  throw new Error("Composition must be Direction default or Product focus.");
}

/** Applies to both supported direct-offer layouts; detail/close stay intact.
 * Omitted/default produces no new identity metadata, preserving old revisions. */
export function resolveCampaignComposition(
  brief: { composition?: OfferComposition },
  asset: Partial<Pick<ApprovedAsset, "role" | "imageFit">>,
): CampaignCompositionPresentation | undefined {
  if (parseOfferComposition(brief.composition) === "direction-default") return undefined;
  return {
    id: "product-focus", version: "1.0.0",
    narrowOrder: "headline-product-offer-action-facts",
    containedPackshot: asset.role === "product-hero" && (asset.imageFit ?? "contain") === "contain",
  };
}
