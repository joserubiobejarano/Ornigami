import "server-only";

import { OPENAI_MODEL } from "../../openai-config.ts";
import { getClient } from "../../openai.ts";
import {
  InvalidGenerationOutputError,
  OpenAIGenerationTransport,
} from "./openai-transport.ts";
import type {
  CampaignGenerationProvider,
  GenerationRequest,
  ProviderCallOptions,
} from "./types.ts";

export { InvalidGenerationOutputError };

export class OpenAIGenerationProvider implements CampaignGenerationProvider {
  readonly id = "openai";
  readonly label = "OpenAI";
  readonly model: string;
  private readonly transport: OpenAIGenerationTransport;

  constructor(model: string = OPENAI_MODEL) {
    this.model = model;
    this.transport = new OpenAIGenerationTransport(getClient(), model);
  }

  async generate(request: GenerationRequest, options: ProviderCallOptions): Promise<unknown> {
    const outcome = await this.transport.generate(request, options);
    return outcome.value;
  }
}

export function createOpenAIGenerationProvider(model?: string): CampaignGenerationProvider {
  return new OpenAIGenerationProvider(model);
}
