import "server-only";

import { OPENAI_MODEL, getClient } from "../../openai.ts";
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

const SYSTEM_PROMPT = `You are a campaign-page art director working inside one fixed template.
Return only a JSON object with exactly these keys: angle, layout, sections, factIds.

Rules:
- Choose one angle from allowed.angles.
- Choose one layout from allowed.layouts.
- Copy one complete section order from allowed.sectionOrders[layout].
- Choose fact IDs only from allowed.factIds. Never invent a fact, claim, quote, rating, price, deadline, product name, destination, or image.
- If the section order includes hero-facts or detail, select at least one approved fact. Otherwise select none.
- Keep the proposal useful for the campaign: lead with the campaign angle, use the approved facts that support the offer, and do not add sections the material cannot fill.
- Do not return any other fields.`;

function buildUserPrompt(request: GenerationRequest): string {
  return JSON.stringify(
    {
      task: "Choose the opening angle, section arrangement, and approved facts for this campaign page.",
      template: request.template,
      brand: request.brand,
      campaign: {
        openingFocus: request.campaign.openingFocus,
        productName: request.campaign.productName,
        productNoun: request.campaign.productNoun,
        offer: request.campaign.offer,
        lede: request.campaign.lede,
        storyHeadline: request.campaign.storyHeadline,
        approvedFacts: request.campaign.facts.map((fact) => ({
          id: fact.id,
          label: fact.label,
          value: fact.value,
        })),
      },
      allowed: request.allowed,
      limits: request.limits,
    },
    null,
    2,
  );
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
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: buildUserPrompt(request) },
        ],
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
