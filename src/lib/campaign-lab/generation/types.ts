import type { OfferComposition } from "../composition.ts";
import type { CampaignPreviewData } from "../template.ts";
import type { ProviderDiagnostics } from "./provider-diagnostics.ts";
import type { ProviderResolution } from "./provider-config.ts";

export type GenerationEnv = Record<string, string | undefined>;
import type {
  AssetRole,
  BrandTokens,
  CampaignCatalog,
  CampaignFormValues,
  FixtureId,
  LayoutId,
  OpeningAngle,
  ProductFact,
  RequiredFactGroup,
  SectionId,
  TemplateManifest,
  ValidationIssue,
} from "../types.ts";

export type ProviderMode = "model" | "local-test" | "none";

export type GuidanceSource = {
  id: string;
  label: string;
  version?: string;
  revision?: string;
  license: string;
  licensePath?: string;
  url?: string;
  usage: string;
};

export type GuidanceRuleSet = {
  owner: "ornigami" | "adapted-taste-skill";
  label: string;
  rules: readonly string[];
};

/**
 * Runtime guidance is supplied with the provider request. Hard rules are the
 * enforceable template constraints; advisory rules are design judgment only.
 */
export type RuntimeDesignGuidance = {
  harnessVersion: string;
  pack: {
    id: string;
    version: string;
  };
  hard: GuidanceRuleSet;
  advisory: GuidanceRuleSet;
  sources: readonly GuidanceSource[];
};

export type GenerationAssetContext = {
  id: string;
  role: AssetRole;
  width: number;
  height: number;
  crop?: string;
  caption?: string;
};

export type GenerationRequest = {
  harness: {
    version: string;
    guidancePack: {
      id: string;
      version: string;
    };
  };
  template: {
    id: string;
    version: string;
    name: string;
    format: string;
    capabilities: {
      layouts: TemplateManifest["layouts"];
      angles: TemplateManifest["angles"];
      profileHeadlineModes: TemplateManifest["profileHeadlineModes"];
      sections: TemplateManifest["sections"];
    };
    constraints: {
      requiredInputs: TemplateManifest["requiredInputs"];
      allowedAssetRoles: TemplateManifest["allowedAssetRoles"];
      limits: TemplateManifest["limits"];
    };
  };
  brand: {
    visualDirection?: { id: string; version: string };
    id: string;
    name: string;
    wordmark: string;
    /** Approved brand character, not copy for the provider to rewrite. */
    character: {
      descriptor: string;
      headlineMode: string;
      detailTitle: string;
    };
    /** Fully resolved tokens, including the selected accent and accent ink. */
    tokens: BrandTokens;
  };
  campaign: {
    fixtureId: FixtureId;
    openingFocus: string | null;
    composition?: OfferComposition;
    audience: string | null;
    objective: string | null;
    productName: string;
    productNoun: string;
    offer: string;
    lede: string;
    storyHeadline: string | null;
    facts: ProductFact[];
  };
  assets: {
    selected: GenerationAssetContext;
    approved: GenerationAssetContext[];
    allowedRoles: readonly AssetRole[];
  };
  allowed: {
    angles: OpeningAngle[];
    layouts: LayoutId[];
    sectionOrders: Record<LayoutId, SectionId[][]>;
    layoutFactCapacity: Record<LayoutId, number>;
    factIds: string[];
    maxFacts: number;
    requiredFactGroups: readonly RequiredFactGroup[];
  };
  limits: {
    headline: number;
    lede: number;
    factValue: number;
  };
  guidance: RuntimeDesignGuidance;
};

export type NullableSelection = {
  angle: OpeningAngle;
  layout: LayoutId;
  sections: SectionId[];
  factIds: string[];
} | null;

/**
 * The boundary a model-backed generator must satisfy. It receives only
 * campaign material that is safe to rewrite and returns an unchecked value.
 * The server validates and assembles the renderer slots afterwards.
 */
export interface CampaignGenerationProvider {
  readonly id: string;
  readonly label: string;
  readonly model?: string;
  generate(request: GenerationRequest, options: ProviderCallOptions): Promise<unknown>;
}

export type ProviderCallOptions = {
  signal: AbortSignal;
  timeoutMs: number;
};

export type GenerationFailureCode =
  | "unavailable"
  | "invalid"
  | "timeout"
  | "provider-error";

export type GenerationMetadata = {
  status: "generated" | "fallback";
  provider: string;
  providerLabel: string;
  providerMode: ProviderMode;
  harnessVersion: string;
  guidancePackVersion: string;
  model?: string;
  code?: GenerationFailureCode;
  message?: string;
  /** Sanitized provider failure details. Absent when no diagnostic was available. */
  diagnostics?: ProviderDiagnostics;
  angle?: OpeningAngle;
  layout?: LayoutId;
  sections?: SectionId[];
  factIds?: string[];
  issues?: string[];
};

export type CampaignGenerationInput = {
  fixtureId: FixtureId;
  values: CampaignFormValues;
  requestId?: string;
};

export type GuidanceLoader = (
  request: Omit<GenerationRequest, "guidance">,
) => Promise<RuntimeDesignGuidance>;

export type GenerationOptions = {
  provider?: CampaignGenerationProvider;
  /**
   * Explicit provider decision for surfaces that must not read the Campaign Lab
   * environment. `null` means no provider is available and no provider config
   * is consulted.
   */
  providerResolution?: ProviderResolution | null;
  timeoutMs?: number;
  /** Caller cancellation is linked to the provider timeout controller. */
  signal?: AbortSignal;
  env?: GenerationEnv;
  catalog?: CampaignCatalog;
  /** Test seam; production uses the app-owned runtime guidance pack. */
  guidanceLoader?: GuidanceLoader;
};

export type CampaignGenerationResult =
  | {
      ok: true;
      preview: CampaignPreviewData;
      generation: GenerationMetadata;
    }
  | {
      ok: false;
      issues: ValidationIssue[];
    };
