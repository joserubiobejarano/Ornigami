import type { LocalTestMode } from "./provider-config.ts";
import type {
  CampaignGenerationProvider,
  GenerationRequest,
  ProviderCallOptions,
} from "./types.ts";

/**
 * Approved-evidence emphasis for known local pilot openings. The provider can
 * only return IDs; the server still resolves every claim from the validated
 * brief. Unknown openings fall back to the approved order.
 */
const OPENING_FACT_EMPHASIS: Record<string, readonly string[]> = {
  "mask-night": ["contents", "skin-types", "hyaluronic-acid"],
  "three-masks": ["vitamin-c", "deep-collagen", "hyaluronic-acid"],
  "routine": ["contents", "vitamin-c", "hyaluronic-acid"],
};

/**
 * Offline provider used to exercise the real server path in local development
 * and tests. It never performs network I/O and never returns campaign facts.
 */
export class LocalTestGenerationProvider implements CampaignGenerationProvider {
  readonly id = "local-test";
  readonly label = "Local test provider";
  private readonly mode: LocalTestMode;

  constructor(mode: LocalTestMode = "success") {
    this.mode = mode;
  }

  async generate(request: GenerationRequest, options: ProviderCallOptions): Promise<unknown> {
    if (this.mode === "timeout") {
      // Deliberately do not use the abort signal. The route's timeout wrapper
      // must stop waiting even when a provider ignores cancellation.
      await new Promise((resolve) => setTimeout(resolve, options.timeoutMs + 75));
      return this.success(request);
    }

    if (this.mode === "invalid") {
      return {
        angle: "claim-led",
        layout: "hero-collage",
        sections: ["hero", "testimonial", "close"],
        factIds: ["invented-fact"],
        productName: "Counterfeit product",
        offer: "90% off everything",
        destinationUrl: "https://example.invalid/not-approved",
        assetId: "not-approved-asset",
        alt: "An invented product in a different colour.",
      };
    }

    return this.success(request);
  }

  private success(request: GenerationRequest): unknown {
    const storyHeadline = request.campaign.storyHeadline?.trim();
    const angle = storyHeadline && request.allowed.angles.includes("story-led")
      ? "story-led"
      : "offer-led";

    const layout = angle === "story-led" ||
      request.campaign.offer.length > 70 ||
      request.campaign.productName.length > 48
      ? "editorial-long-copy"
      : "offer-led-one-photo";

    const factLimit = layout === "editorial-long-copy" ? request.allowed.maxFacts : 2;
    const emphasis = request.campaign.openingFocus
      ? OPENING_FACT_EMPHASIS[request.campaign.openingFocus] ?? []
      : [];
    const orderedFactIds = [
      ...emphasis.filter((id) => request.allowed.factIds.includes(id)),
      ...request.allowed.factIds.filter((id) => !emphasis.includes(id)),
    ];
    const factIds = [...new Set(orderedFactIds)].slice(0, factLimit);
    const sections = factIds.length > 0
      ? layout === "editorial-long-copy"
        ? ["hero", "detail", "close"]
        : ["hero", "hero-facts", "close"]
      : ["hero", "close"];

    return {
      angle,
      layout,
      sections,
      factIds,
    };
  }
}
