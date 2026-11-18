import "server-only";

import { OPENAI_MODEL, getClient } from "../../openai.ts";
import { buildOpenAIMessages } from "./prompt.ts";
import type {
  CampaignGenerationProvider,
  GenerationRequest,
  ProviderCallOptions,
} from "./types.ts";

export class InvalidGenerationOutputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidGenerationOutputError";
  }
}

export class OpenAIGenerationProvider implements CampaignGenerationProvider {
  readonly id = "openai";
  readonly label = "OpenAI";
  readonly model: string;

  constructor(model: string = OPENAI_MODEL) {
    this.model = model;
  }

  async generate(request: GenerationRequest, options: ProviderCallOptions): Promise<unknown> {
    const response = await getClient().chat.completions.create(
      {
        model: this.model,
        messages: buildOpenAIMessages(request),
        response_format: { type: "json_object" },
        max_tokens: 300,
        temperature: 0.2,
      },
      {
        timeout: Math.max(1, options.timeoutMs),
        maxRetries: 0,
      },
    );

    const content = response.choices[0]?.message?.content?.trim();
    if (!content) throw new InvalidGenerationOutputError("The model returned an empty response.");

    try {
      return JSON.parse(content) as unknown;
    } catch {
      throw new InvalidGenerationOutputError("The model response was not valid JSON.");
    }
  }
}

export function createOpenAIGenerationProvider(model?: string): CampaignGenerationProvider {
  return new OpenAIGenerationProvider(model);
}
