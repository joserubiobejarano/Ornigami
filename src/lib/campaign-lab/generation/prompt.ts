import type { GenerationRequest } from "./types.ts";

/**
 * Pure prompt assembly for the model-backed provider. Keeping this separate
 * lets the verification runner capture the exact provider-facing context
 * without making a paid call.
 */
export const OPENAI_SYSTEM_PROMPT = `You are a campaign-page art director working inside one fixed, reviewed template.
Return only a JSON object with exactly these keys: angle, layout, sections, factIds.

The request includes runtime design guidance:
- guidance.hard contains enforceable template and identity constraints. Follow every one.
- guidance.advisory contains design judgment. Use it only when it does not conflict with the hard rules, approved brand, or approved evidence.
- Treat audience, objective, brand character, tokens, assets, template capabilities, campaign copy, and approved evidence as read-only context.

Rules:
- Choose one angle from allowed.angles.
- Choose one layout from allowed.layouts.
- Copy one complete section order from allowed.sectionOrders[layout].
- Choose fact IDs only from allowed.factIds. Never invent a fact, claim, quote, rating, price, deadline, product name, destination, or image.
- If the section order includes hero-facts or detail, select at least one approved fact. Otherwise select none.
- Keep the proposal useful for the campaign: lead with the campaign angle, use the approved facts that support the offer and objective, and do not add sections the material cannot fill.
- Do not return any other fields.`;

export function buildOpenAIUserPrompt(request: GenerationRequest): string {
  return JSON.stringify(
    {
      task: "Choose the opening angle, section arrangement, and approved facts for this single-product offer page.",
      harness: request.harness,
      guidance: request.guidance,
      template: request.template,
      brand: request.brand,
      campaign: {
        fixtureId: request.campaign.fixtureId,
        audience: request.campaign.audience,
        objective: request.campaign.objective,
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
          evidence: {
            document: fact.source.document,
            quote: fact.source.quote,
            reviewedBy: fact.source.reviewedBy,
            reviewedOn: fact.source.reviewedOn,
          },
        })),
      },
      assets: request.assets,
      allowed: request.allowed,
      limits: request.limits,
    },
    null,
    2,
  );
}

export function buildOpenAIMessages(request: GenerationRequest): Array<{
  role: "system" | "user";
  content: string;
}> {
  return [
    { role: "system", content: OPENAI_SYSTEM_PROMPT },
    { role: "user", content: buildOpenAIUserPrompt(request) },
  ];
}
