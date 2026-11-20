import { LocalTestGenerationProvider } from "@/lib/campaign-lab/generation/local-test-provider";
import type {
  CampaignGenerationProvider,
  GenerationRequest,
  ProviderCallOptions,
} from "@/lib/campaign-lab/generation/types";

import type { BuilderTestProviderMode } from "./runtime-config.ts";

/**
 * Test-only provider injection. It is created only when the runtime test-hook
 * flag is explicitly enabled; production keeps the live provider disabled.
 */
export function createBuilderTestProvider(
  mode: BuilderTestProviderMode,
): CampaignGenerationProvider | null {
  if (mode === "none") return null;
  const delegate =
    mode === "unknown" ? null : new LocalTestGenerationProvider(mode);

  return {
    id: "test-stub",
    label: "Injected test provider",
    async generate(
      request: GenerationRequest,
      options: ProviderCallOptions,
    ): Promise<unknown> {
      if (!delegate) {
        await new Promise((resolve) => setTimeout(resolve, 10));
        throw new Error("Synthetic ambiguous provider outcome.");
      }
      return delegate.generate(request, options);
    },
  };
}
