import type { CampaignPreviewData } from "../template.ts";

export type GenerationEnv = Record<string, string | undefined>;
import type {
  CampaignCatalog,
  CampaignFormValues,
  FixtureId,
  LayoutId,
  OpeningAngle,
  ProductFact,
  RequiredFactGroup,
  SectionId,
  ValidationIssue,
} from "../types.ts";

export type GenerationRequest = {
  template: {
    id: string;
    version: string;
  };
  brand: {
    id: string;
    name: string;
  };
  campaign: {
    fixtureId: FixtureId;
    openingFocus: string | null;
    productName: string;
    productNoun: string;
    offer: string;
    lede: string;
    storyHeadline: string | null;
    facts: ProductFact[];
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
  model?: string;
  code?: GenerationFailureCode;
  message?: string;
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

export type GenerationOptions = {
  provider?: CampaignGenerationProvider;
  timeoutMs?: number;
  env?: GenerationEnv;
  catalog?: CampaignCatalog;
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
