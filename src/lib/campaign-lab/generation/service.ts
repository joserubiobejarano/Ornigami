import { resolveCampaignComposition } from "../composition.ts";
import {
  BASE_CATALOG,
  createCampaignBrief,
  getAsset,
  getBrand,
  resolveBrandTheme,
} from "../fixtures.ts";
import {
  SINGLE_PRODUCT_OFFER_TEMPLATE,
  CAMPAIGN_REVISION_IDENTITY_VERSION,
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
import {
  DESIGN_GUIDANCE_PACK_ID,
  DESIGN_GUIDANCE_PACK_VERSION,
  DESIGN_HARNESS_VERSION,
} from "./harness.ts";
import { LocalTestGenerationProvider } from "./local-test-provider.ts";
import { resolveGenerationProvider, resolveGenerationTimeoutMs } from "./provider-config.ts";
import type { ProviderResolution } from "./provider-config.ts";
import { diagnosticsFromUnknownError } from "./provider-diagnostics.ts";
import { validateGenerationProposal } from "./validate.ts";
import type {
  CampaignGenerationInput,
  CampaignGenerationProvider,
  CampaignGenerationResult,
  GenerationAssetContext,
  GenerationFailureCode,
  GenerationMetadata,
  GenerationOptions,
  GenerationRequest,
  ProviderMode,
  RuntimeDesignGuidance,
} from "./types.ts";

class GenerationTimeoutError extends Error {
  constructor() {
    super("The generation provider timed out.");
    this.name = "GenerationTimeoutError";
  }
}

function assetContext(
  asset: ReturnType<typeof getAsset>,
): GenerationAssetContext {
  if (!asset) throw new Error("The approved campaign asset is missing.");
  return {
    id: asset.id,
    role: asset.role,
    width: asset.width,
    height: asset.height,
    ...(asset.crop ? { crop: asset.crop } : {}),
    ...(asset.caption ? { caption: asset.caption } : {}),
  };
}

function buildGenerationRequest(
  fixtureId: string,
  brief: ReturnType<typeof createCampaignBrief>,
  values: { accent: string },
  catalog: CampaignCatalog,
): Omit<GenerationRequest, "guidance"> {
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
  const theme = resolveBrandTheme(brief.brandId, values.accent, catalog);
  const selectedAsset = getAsset(brief.assetId, catalog);
  const approvedAssets = catalog.assets
    .filter((asset) => asset.brandId === brief.brandId && asset.reviewed)
    .map(assetContext);

  return {
    harness: {
      version: DESIGN_HARNESS_VERSION,
      guidancePack: {
        id: DESIGN_GUIDANCE_PACK_ID,
        version: DESIGN_GUIDANCE_PACK_VERSION,
      },
    },
    template: {
      id: SINGLE_PRODUCT_OFFER_TEMPLATE.id,
      version: SINGLE_PRODUCT_OFFER_TEMPLATE.version,
      name: SINGLE_PRODUCT_OFFER_TEMPLATE.name,
      format: SINGLE_PRODUCT_OFFER_TEMPLATE.format,
      capabilities: {
        layouts: SINGLE_PRODUCT_OFFER_TEMPLATE.layouts,
        angles: SINGLE_PRODUCT_OFFER_TEMPLATE.angles,
        profileHeadlineModes: SINGLE_PRODUCT_OFFER_TEMPLATE.profileHeadlineModes,
        sections: SINGLE_PRODUCT_OFFER_TEMPLATE.sections,
      },
      constraints: {
        requiredInputs: SINGLE_PRODUCT_OFFER_TEMPLATE.requiredInputs,
        allowedAssetRoles: SINGLE_PRODUCT_OFFER_TEMPLATE.allowedAssetRoles,
        limits: SINGLE_PRODUCT_OFFER_TEMPLATE.limits,
      },
    },
    brand: {
      ...(brand.visualDirection ? { visualDirection: { ...brand.visualDirection } } : {}),
      id: brief.brandId,
      name: brand.name,
      wordmark: brand.wordmark,
      character: {
        descriptor: brand.descriptor,
        headlineMode: brand.headlineMode,
        detailTitle: brand.detailTitle,
      },
      tokens: { ...theme.tokens },
    },
    campaign: {
      fixtureId: fixtureId as GenerationRequest["campaign"]["fixtureId"],
      openingFocus: brief.openingFocus ?? null,
      ...(brief.composition ? { composition: brief.composition } : {}),
      audience: brief.audience?.trim() || null,
      objective: brief.objective?.trim() || null,
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
    assets: {
      selected: assetContext(selectedAsset),
      approved: approvedAssets,
      allowedRoles: SINGLE_PRODUCT_OFFER_TEMPLATE.allowedAssetRoles,
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

function providerModeFor(provider: string): ProviderMode {
  if (provider === "local-test") return "local-test";
  if (provider === "none" || provider === "deterministic") return "none";
  return "model";
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
      providerMode: providerModeFor(provider),
      harnessVersion: DESIGN_HARNESS_VERSION,
      guidancePackVersion: DESIGN_GUIDANCE_PACK_VERSION,
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
    : options.providerResolution !== undefined
      ? options.providerResolution
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
  const baseRequest = buildGenerationRequest(
    input.fixtureId,
    brief,
    input.values,
    catalog,
  );

  let guidance: RuntimeDesignGuidance;
  try {
    const guidanceLoader =
      options.guidanceLoader ??
      (async (context: Omit<GenerationRequest, "guidance">) => {
        const pack = await import("./guidance/pack.ts");
        return pack.buildRuntimeGuidance(context);
      });
    guidance = await guidanceLoader(baseRequest);
  } catch {
    return failure(
      deterministic.preview,
      provider.id,
      provider.label,
      "unavailable",
      "The runtime design guidance could not be loaded. The deterministic draft is shown.",
    );
  }

  const request: GenerationRequest = {
    ...baseRequest,
    guidance,
  };
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
    const diagnostics = diagnosticsFromUnknownError(error);
    if (error instanceof GenerationTimeoutError) {
      return failure(
        deterministic.preview,
        provider.id,
        provider.label,
        "timeout",
        `The generator did not respond within ${timeoutMs} ms.`,
        {
          diagnostics: {
            category: "timeout",
            httpStatus: null,
            providerCode: null,
            providerType: null,
            parameter: null,
            providerRequestId: null,
            message: `The provider did not respond within ${timeoutMs} ms.`,
          },
        },
      );
    }

    if (error instanceof Error && error.name === "InvalidGenerationOutputError") {
      return failure(
        deterministic.preview,
        provider.id,
        provider.label,
        "invalid",
        "The generator returned output that could not be read. The deterministic draft is shown.",
        diagnostics ? { diagnostics } : {},
      );
    }

    return failure(
      deterministic.preview,
      provider.id,
      provider.label,
      "provider-error",
      "The generation provider failed before returning a proposal.",
      diagnostics ? { diagnostics } : {},
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
      ...(resolveCampaignComposition(brief, asset) ? { composition: resolveCampaignComposition(brief, asset) } : {}),
      brief,
      draft: planned.draft,
      asset,
      theme,
      revision,
      revisionIdentityVersion: CAMPAIGN_REVISION_IDENTITY_VERSION,
    },
    generation: {
      status: "generated",
      provider: provider.id,
      providerLabel: provider.label,
      providerMode: providerModeFor(provider.id),
      harnessVersion: DESIGN_HARNESS_VERSION,
      guidancePackVersion: DESIGN_GUIDANCE_PACK_VERSION,
      model: provider.model,
      angle: validation.plan.angle,
      layout: validation.plan.layout,
      sections: validation.plan.sections,
      factIds: validation.plan.factIds,
    },
  };
}

export type { CampaignGenerationResult, GenerationOptions } from "./types.ts";
