import { buildBrowserOfferCatalog } from "../campaign-lab/browser-offer.ts";
import { createFormValues } from "../campaign-lab/fixtures.ts";
import { parseBrowserOfferBriefRequest } from "../campaign-lab/browser-offer-brief.ts";
import type { BrowserOfferBriefParseResult } from "../campaign-lab/browser-offer-brief.ts";
import { readBoundedJsonBody } from "../campaign-lab/generation/request-body.ts";
import { runCampaignGeneration } from "../campaign-lab/generation/service.ts";
import type {
  CampaignGenerationResult,
  GenerationOptions,
} from "../campaign-lab/generation/types.ts";
import type { ValidationIssue } from "../campaign-lab/types.ts";
import {
  builderClosedResponse,
  getBuilderAccessDecision,
  type BuilderAccessDecision,
} from "./access.ts";

export const BUILDER_GENERATION_MAX_BODY_BYTES = 32_768;
export const BUILDER_GENERATION_REQUEST_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const BODY_KEYS = new Set(["browserBrief", "requestId"]);

type ParsedBrowserBrief = Extract<BrowserOfferBriefParseResult, { ok: true }>;

export type ParsedBuilderGenerationRequest =
  | {
      ok: true;
      requestId: string;
      brief: ParsedBrowserBrief;
    }
  | {
      ok: false;
      status: 400 | 422;
      message: string;
      requestId?: string;
      issues?: ValidationIssue[];
    };

export type BuilderGenerationResponse = CampaignGenerationResult & {
  requestId?: string;
  browserBrief?: ParsedBrowserBrief["context"];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * The production builder accepts only the bounded browser offer contract. It
 * deliberately rejects fixture IDs, form values, format/layout overrides and
 * every other Campaign Lab request shape.
 */
export function parseBuilderGenerationRequest(
  body: unknown,
): ParsedBuilderGenerationRequest {
  if (!isRecord(body)) {
    return { ok: false, status: 400, message: "Send a JSON object." };
  }

  const requestId =
    typeof body.requestId === "string" ? body.requestId.trim() : "";
  if (!BUILDER_GENERATION_REQUEST_ID_PATTERN.test(requestId)) {
    return {
      ok: false,
      status: 400,
      message: "A valid UUID requestId is required.",
    };
  }
  const unsupported = Object.keys(body).filter((key) => !BODY_KEYS.has(key));
  if (unsupported.length > 0) {
    return {
      ok: false,
      status: 400,
      message: `Unsupported request field "${unsupported[0]}".`,
      requestId,
    };
  }

  if (body.browserBrief === undefined) {
    return {
      ok: false,
      status: 400,
      message: "browserBrief is required.",
      requestId,
    };
  }

  const parsed = parseBrowserOfferBriefRequest(body.browserBrief);
  if (!parsed.ok) {
    return {
      ok: false,
      status: 422,
      message: "The builder brief did not pass validation.",
      requestId,
      issues: parsed.issues,
    };
  }

  return { ok: true, requestId, brief: parsed };
}

/**
 * Runs the existing validated generation service with an explicitly disabled
 * provider decision. It never reads CAMPAIGN_LAB_GENERATION_* values, so the
 * laboratory provider configuration cannot silently become a production
 * builder provider.
 */
export async function runBuilderGeneration(
  request: Extract<ParsedBuilderGenerationRequest, { ok: true }>,
  options: GenerationOptions = {},
): Promise<BuilderGenerationResponse> {
  const built = buildBrowserOfferCatalog(request.brief.input);
  const values = createFormValues(built.fixture, built.catalog);
  if (request.brief.accent) values.accent = request.brief.accent;
  // The production surface is offer-only; ignore any laboratory format field.
  values.format = "offer";
  delete values.advertorialLayout;

  const result = await runCampaignGeneration(
    { fixtureId: built.fixture.id, values, requestId: request.requestId },
    {
      catalog: built.catalog,
      providerResolution: null,
      ...options,
    },
  );

  return {
    ...result,
    requestId: request.requestId,
    browserBrief: request.brief.context,
  };
}

export type BuilderGenerateHandlerDependencies = {
  access?: () => BuilderAccessDecision;
  generate?: (
    request: Extract<ParsedBuilderGenerationRequest, { ok: true }>,
    options?: GenerationOptions,
  ) => Promise<BuilderGenerationResponse>;
};

function json(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}

/**
 * The access decision is taken before the request body is read, before any
 * catalog or provider module is selected, and before any generative work.
 */
export function createBuilderGenerateHandler(
  dependencies: BuilderGenerateHandlerDependencies = {},
): (request: Request) => Promise<Response> {
  return async function POST(request: Request): Promise<Response> {
    const access = (dependencies.access ?? (() => getBuilderAccessDecision()))();
    if (!access.allowed) return builderClosedResponse();

    const bounded = await readBoundedJsonBody(
      request,
      BUILDER_GENERATION_MAX_BODY_BYTES,
    );
    if (!bounded.ok) {
      return json({ ok: false, message: bounded.message }, bounded.status);
    }

    const parsed = parseBuilderGenerationRequest(bounded.value);
    if (!parsed.ok) {
      return json(
        {
          ok: false,
          message: parsed.message,
          ...(parsed.issues ? { issues: parsed.issues } : {}),
          ...(parsed.requestId ? { requestId: parsed.requestId } : {}),
        },
        parsed.status,
      );
    }

    try {
      const result = await (dependencies.generate ?? runBuilderGeneration)(
        parsed,
      );
      return json(result, result.ok ? 200 : 422);
    } catch {
      return json(
        {
          ok: false,
          message: "The preview could not be generated.",
          ...(parsed.requestId ? { requestId: parsed.requestId } : {}),
        },
        500,
      );
    }
  };
}
