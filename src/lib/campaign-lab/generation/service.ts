import {
  BASE_CATALOG,
  createCampaignBrief,
  getAsset,
  getBrand,
  resolveBrandTheme,
} from "../fixtures.ts";
import {
  SINGLE_PRODUCT_OFFER_TEMPLATE,
  assemblePlannedDraft,
  buildCampaignPreview,
  calculateDraftRevision,
  getAllowedAngles,
  layoutFactCapacity,
  validateCampaignForm,
  validateTemplateDraft,
} from "../template.ts";
import type { CampaignPreviewData } from "../template.ts";
import type { CampaignCatalog, LayoutId, SectionId } from "../types.ts";
import { LocalTestGenerationProvider } from "./local-test-provider.ts";
import { resolveGenerationProvider, resolveGenerationTimeoutMs } from "./provider-config.ts";
import type { ProviderResolution } from "./provider-config.ts";
import { validateGenerationProposal } from "./validate.ts";
import type {
  CampaignGenerationInput,
  CampaignGenerationProvider,
  CampaignGenerationResult,
  GenerationFailureCode,
  GenerationMetadata,
  GenerationOptions,
  GenerationRequest,
} from "./types.ts";

class GenerationTimeoutError extends Error {
  constructor() {
    super("The generation provider timed out.");
    this.name = "GenerationTimeoutError";
  }
}

function buildGenerationRequest(
  fixtureId: string,
  brief: ReturnType<typeof createCampaignBrief>,
  catalog: CampaignCatalog,
): GenerationRequest {
  const layouts = Object.keys(SINGLE_PRODUCT_OFFER_TEMPLATE.layouts) as LayoutId[];
  const sectionOrders = Object.fromEntries(
    layouts.map((layout) => [
      layout,
      SINGLE_PRODUCT_OFFER_TEMPLATE.layouts[layout].allowedSectionOrders.map(
        (order) => [...order] as SectionId[],
      ),
    ]),
  ) as Record<LayoutId, SectionId[][]>;
  const layoutCapacity = Object.fromEntries(
    layouts.map((layout) => [layout, layoutFactCapacity(layout)]),
  ) as Record<LayoutId, number>;
  const brand = getBrand(brief.brandId, catalog);

  return {
    template: {
      id: SINGLE_PRODUCT_OFFER_TEMPLATE.id,
      version: SINGLE_PRODUCT_OFFER_TEMPLATE.version,
    },
    brand: {
      id: brief.brandId,
      name: brand.name,
    },
    campaign: {
      fixtureId: fixtureId as GenerationRequest["campaign"]["fixtureId"],
      openingFocus: brief.openingFocus ?? null,
      productName: brief.productName,
      productNoun: brief.productNoun,
      offer: brief.offer,
      lede: brief.copy.lede,
      storyHeadline: brief.copy.headline ?? null,
      facts: brief.productFacts.map((fact) => ({
        ...fact,
        source: { ...fact.source },
      })),
    },
    allowed: {
      angles: getAllowedAngles(brief, brand),
      layouts,
      sectionOrders,
      layoutFactCapacity: layoutCapacity,
      factIds: brief.productFacts.map((fact) => fact.id),
      maxFacts: SINGLE_PRODUCT_OFFER_TEMPLATE.limits.maxFacts,
      requiredFactGroups: brief.requiredFactGroups ?? [],
    },
    limits: {
      headline: SINGLE_PRODUCT_OFFER_TEMPLATE.limits.headline,
      lede: SINGLE_PRODUCT_OFFER_TEMPLATE.limits.lede,
      factValue: SINGLE_PRODUCT_OFFER_TEMPLATE.limits.factValue,
    },
  };
}

async function withTimeout<T>(
  operation: Promise<T>,
  timeoutMs: number,
  controller: AbortController,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new GenerationTimeoutError());
    }, timeoutMs);
  });

  try {
    return await Promise.race([operation, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function createProvider(
  resolution: ProviderResolution,
): Promise<CampaignGenerationProvider | null> {
  if (!resolution.ok) return null;
  if (resolution.id === "local-test") {
    return new LocalTestGenerationProvider(resolution.mode);
  }

  const { createOpenAIGenerationProvider } = await import("./openai-provider.ts");
  return createOpenAIGenerationProvider(resolution.model);
}

function failure(
  preview: CampaignPreviewData,
  provider: string,
  providerLabel: string,
  code: GenerationFailureCode,
  message: string,
  extra: Partial<GenerationMetadata> = {},
): CampaignGenerationResult {
  return {
    ok: true,
    preview,
    generation: {
      status: "fallback",
      provider,
      providerLabel,
      code,
      message,
      ...extra,
    },
  };
}

function safeIssues(issues: string[]): string[] {
  return issues.slice(0, 8).map((issue) => issue.slice(0, 240));
}

/**
 * Executes the server generation path. The deterministic fallback is built
 * from the validated brief, so a failed, invalid, or timed-out provider can
 * never change identity, offer, destination, asset, or ALT text.
 */
export async function runCampaignGeneration(
  input: CampaignGenerationInput,
  options: GenerationOptions = {},
): Promise<CampaignGenerationResult> {
  const catalog = options.catalog ?? BASE_CATALOG;
  const fixture = catalog.fixtures[input.fixtureId];
  if (!fixture) {
    return {
      ok: false,
      issues: [{ field: "brandId", message: "Choose a supported campaign fixture." }],
    };
  }

  const formIssues = validateCampaignForm(input.values, catalog);
  if (formIssues.length > 0) {
    return { ok: false, issues: formIssues };
  }

  const deterministic = buildCampaignPreview(fixture, input.values, catalog);
  if (!deterministic.ok) {
    return deterministic;
  }

  const env = options.env ?? process.env;
  const resolution: ProviderResolution | null = options.provider
    ? null
    : resolveGenerationProvider(env);
  const providerId = options.provider?.id ?? resolution?.id ?? "none";
  const providerLabel = options.provider?.label ?? resolution?.label ?? "Generation";

  if (resolution && !resolution.ok) {
    return failure(
      deterministic.preview,
      resolution.id,
      resolution.label,
      "unavailable",
      resolution.reason,
    );
  }

  let provider: CampaignGenerationProvider | null = options.provider ?? null;
  if (!provider) {
    try {
      provider = resolution?.ok ? await createProvider(resolution) : null;
    } catch {
      return failure(
        deterministic.preview,
        providerId,
        providerLabel,
        "unavailable",
        "The generation provider could not be configured.",
      );
    }
  }

  if (!provider) {
    return failure(
      deterministic.preview,
      providerId,
      providerLabel,
      "unavailable",
      "No generation provider is available.",
    );
  }

  const brief = createCampaignBrief(fixture, input.values);
  const request = buildGenerationRequest(input.fixtureId, brief, catalog);
  const timeoutMs = options.timeoutMs ?? resolveGenerationTimeoutMs(env);
  const controller = new AbortController();

  let raw: unknown;
  try {
    raw = await withTimeout(
      provider.generate(request, { signal: controller.signal, timeoutMs }),
      timeoutMs,
      controller,
    );
  } catch (error) {
    if (error instanceof GenerationTimeoutError) {
      return failure(
        deterministic.preview,
        provider.id,
        provider.label,
        "timeout",
        `The generator did not respond within ${timeoutMs} ms.`,
      );
    }

    if (error instanceof Error && error.name === "InvalidGenerationOutputError") {
      return failure(
        deterministic.preview,
        provider.id,
        provider.label,
        "invalid",
        "The generator returned output that could not be read. The deterministic draft is shown.",
      );
    }

    return failure(
      deterministic.preview,
      provider.id,
      provider.label,
      "provider-error",
      "The generation provider failed before returning a proposal.",
    );
  }

  const validation = validateGenerationProposal(raw, request);
  if (!validation.ok) {
    return failure(
      deterministic.preview,
      provider.id,
      provider.label,
      "invalid",
      "The generator proposal did not match this template. The deterministic draft is shown.",
      { issues: safeIssues(validation.issues) },
    );
  }

  const planned = assemblePlannedDraft(brief, validation.plan);
  const draftIssues = [
    ...planned.issues,
    ...validateTemplateDraft(brief, planned.draft).map((issue) => issue.message),
  ];
  if (draftIssues.length > 0) {
    return failure(
      deterministic.preview,
      provider.id,
      provider.label,
      "invalid",
      "The generator proposal could not be rendered inside this template. The deterministic draft is shown.",
      { issues: safeIssues(draftIssues) },
    );
  }

  const asset = getAsset(input.values.assetId, catalog);
  if (!asset) {
    return failure(
      deterministic.preview,
      provider.id,
      provider.label,
      "invalid",
      "The approved image is missing. The deterministic draft is shown.",
    );
  }

  const theme = resolveBrandTheme(input.values.brandId, input.values.accent, catalog);
  const revision = calculateDraftRevision(brief, planned.draft, asset, theme);

  return {
    ok: true,
    preview: {
      brief,
      draft: planned.draft,
      asset,
      theme,
      revision,
    },
    generation: {
      status: "generated",
      provider: provider.id,
      providerLabel: provider.label,
      model: provider.model,
      angle: validation.plan.angle,
      layout: validation.plan.layout,
      sections: validation.plan.sections,
      factIds: validation.plan.factIds,
    },
  };
}

export type { CampaignGenerationResult, GenerationOptions } from "./types.ts";
