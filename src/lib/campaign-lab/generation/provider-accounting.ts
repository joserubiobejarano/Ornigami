export type TokenPricing = {
  inputPerMillionTokens: number;
  outputPerMillionTokens: number;
};

export type ProviderUsage = {
  promptTokens: number;
  completionTokens: number;
};

export type ProviderUsageAccounting =
  | {
      status: "known";
      promptTokens: number;
      completionTokens: number;
      costUsd: number;
      reservedExposureUsd: 0;
    }
  | {
      status: "unknown";
      promptTokens: null;
      completionTokens: null;
      costUsd: null;
      reservedExposureUsd: number;
    };

export function providerCost(usage: ProviderUsage, pricing: TokenPricing): number {
  return (
    (usage.promptTokens / 1_000_000) * pricing.inputPerMillionTokens +
    (usage.completionTokens / 1_000_000) * pricing.outputPerMillionTokens
  );
}

/**
 * Missing usage stays unknown. A failed request without usage keeps its full
 * reservation as unresolved exposure rather than being treated as free.
 */
export function accountProviderUsage(
  usage: ProviderUsage | null | undefined,
  pricing: TokenPricing,
  reservedCostUsd: number,
): ProviderUsageAccounting {
  if (
    !usage ||
    !Number.isFinite(usage.promptTokens) ||
    !Number.isFinite(usage.completionTokens)
  ) {
    return {
      status: "unknown",
      promptTokens: null,
      completionTokens: null,
      costUsd: null,
      reservedExposureUsd: Math.max(0, reservedCostUsd),
    };
  }
  return {
    status: "known",
    promptTokens: usage.promptTokens,
    completionTokens: usage.completionTokens,
    costUsd: providerCost(usage, pricing),
    reservedExposureUsd: 0,
  };
}
