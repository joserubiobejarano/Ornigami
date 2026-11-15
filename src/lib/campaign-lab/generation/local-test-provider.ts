import type { LayoutId, SectionId } from "../types.ts";
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

    const proposal = this.success(request);
    if (this.mode === "incomplete") {
      const requiredIds = request.allowed.requiredFactGroups.flatMap((group) => group.factIds);
      const omitted = proposal.factIds.find((id) => requiredIds.includes(id));
      if (omitted) proposal.factIds = proposal.factIds.filter((id) => id !== omitted);
    }
    return proposal;
  }

  private success(request: GenerationRequest): {
    angle: "offer-led" | "product-led" | "story-led";
    layout: LayoutId;
    sections: SectionId[];
    factIds: string[];
  } {
    const storyHeadline = request.campaign.storyHeadline?.trim();
    const angle = storyHeadline && request.allowed.angles.includes("story-led")
      ? "story-led"
      : "offer-led";

    const candidate: LayoutId = angle === "story-led" ||
      request.campaign.offer.length > 70 ||
      request.campaign.productName.length > 48
      ? "editorial-long-copy"
      : "offer-led-one-photo";
    const requiredIds = [...new Set(
      request.allowed.requiredFactGroups.flatMap((group) => group.factIds),
    )];
    const layouts: LayoutId[] = [candidate, ...request.allowed.layouts.filter((item) => item !== candidate)];
    const layout = layouts.find(
      (item) => request.allowed.layoutFactCapacity[item] >= requiredIds.length,
    ) ?? candidate;
    const capacity = request.allowed.layoutFactCapacity[layout];
    const factLimit = Math.max(
      requiredIds.length,
      layout === "editorial-long-copy" ? capacity : 2,
    );

    const emphasis = request.campaign.openingFocus
      ? OPENING_FACT_EMPHASIS[request.campaign.openingFocus] ?? []
      : [];
    const orderedFactIds = [
      ...requiredIds,
      ...emphasis.filter((id) => request.allowed.factIds.includes(id)),
      ...request.allowed.factIds.filter((id) => !emphasis.includes(id)),
    ];
    const factIds = [...new Set(orderedFactIds)].slice(0, factLimit);
    const sections: SectionId[] = factIds.length > 0
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
