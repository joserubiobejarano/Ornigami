import {
  DESIGN_GUIDANCE_PACK_ID,
  DESIGN_GUIDANCE_PACK_VERSION,
  DESIGN_HARNESS_VERSION,
} from "../harness.ts";
import type {
  GenerationRequest,
  GuidanceSource,
  RuntimeDesignGuidance,
} from "../types.ts";

type RequestContext = Omit<GenerationRequest, "guidance">;

/**
 * App-owned advisory guidance for the reviewed single-product offer template.
 *
 * These are design judgments, not executable checks. They are adapted from
 * Ornigami's design rules and a small set of principles from Taste Skill 2.5.1
 * (MIT, revision f6b76575f949707b4e3c37cd86cb44b0b98643e8). No Taste scripts,
 * assets, CSS, components, or checkers are bundled or executed here.
 */
const ADVISORY_RULES = [
  "Use the audience and objective to choose the opening angle. Lead with the promise that brought this visitor to the page, not with a generic product introduction.",
  "When the approved material is sparse, keep the page short. Choose a layout and section order the supplied evidence can fill without inventing proof or filler.",
  "Give each selected section a clear job: identify the product, explain the approved value, supply approved evidence, or make the action and offer terms easy to find.",
  "Prefer the product-led or offer-led opening when the campaign is a direct offer. Prefer story-led only when approved campaign headline or story copy exists.",
  "Use the approved facts that support the campaign objective, without repeating the same fact or stacking claims the brief does not contain.",
  "Treat the product image as recognition, use, detail, or evidence according to its approved role. Preserve the product and any visible label; do not imply a crop or image the template cannot render.",
  "Keep one primary action and place the offer terms near it. Do not propose competing actions, decorative badges, extra navigation, or sections without a job.",
  "Respect the brand character and resolved tokens. Do not substitute a palette, type pairing, radius, or editorial tone that the approved brand did not supply.",
  "Aim for a composition the brand would recognise with the logo hidden, using hierarchy and section rhythm rather than decoration or motion.",
] as const;

const SOURCES: readonly GuidanceSource[] = [
  {
    id: "ornigami-template",
    label: "Ornigami single-product offer template",
    version: "1.0.0",
    license: "Ornigami proprietary",
    usage:
      "Owns the enforceable template options, protected campaign identity, approved evidence, and server-side validation.",
  },
  {
    id: "ornigami-design-rules",
    label: "Ornigami design rules and campaign workflow",
    license: "Ornigami proprietary",
    usage:
      "Source for the hard content, evidence, accessibility, and one-action expectations reflected in the advisory rules.",
  },
  {
    id: "taste-skill",
    label: "Taste Skill 2.5.1",
    version: "2.5.1",
    revision: "f6b76575f949707b4e3c37cd86cb44b0b98643e8",
    license: "MIT",
    licensePath:
      "src/lib/campaign-lab/generation/guidance/TASTE-SKILL-LICENSE.txt",
    url: "https://github.com/Leonxlnx/taste-skill",
    usage:
      "Advisory principles only: product visibility, one section per job, restrained composition, and avoiding generic template treatment. No skill files are loaded at runtime.",
  },
];

function protectedIdentityRules(): string[] {
  return [
    "Return only the keys angle, layout, sections, and factIds.",
    "Never return productName, product, offer, price, destinationUrl, assetId, alt, actionLabel, brandId, audience, objective, brand, tokens, assets, guidance, template, or limits. Those values are read-only campaign facts.",
    "Use only the approved brand identity, commercial copy, destination, asset, and facts in this request. Do not invent, rewrite, or add claims, quotes, ratings, prices, deadlines, assets, or destinations.",
  ];
}

function selectionRules(context: RequestContext): string[] {
  const { allowed, limits } = context;
  const requiredGroups = allowed.requiredFactGroups.length
    ? allowed.requiredFactGroups
        .map((group) => `${group.label || group.id}: ${group.factIds.join(", ")}`)
        .join("; ")
    : "none";
  const capacity = allowed.layouts
    .map((layout) => `${layout}=${allowed.layoutFactCapacity[layout]}`)
    .join(", ");

  return [
    `Choose angle from: ${allowed.angles.join(", ")}.`,
    `Choose layout from: ${allowed.layouts.join(", ")}.`,
    "Copy one complete section order from allowed.sectionOrders for the chosen layout. Do not reorder or drop a section.",
    `Choose fact IDs only from: ${allowed.factIds.join(", ")}.`,
    `Select at most ${allowed.maxFacts} facts and never exceed the chosen layout capacity (${capacity}).`,
    `Include every fact in each required fact group: ${requiredGroups}.`,
    "If the section order contains hero-facts or detail, select at least one approved fact. If it contains neither, select no facts.",
    `Headline, lede, and fact limits remain ${limits.headline}, ${limits.lede}, and ${limits.factValue} characters; the server assembles and checks those values.`,
  ];
}

/**
 * Builds the small runtime pack from the same validated request the provider
 * receives. The hard rules mirror the template manifest and proposal validator;
 * they do not replace either.
 */
export function buildRuntimeGuidance(
  context: RequestContext,
): RuntimeDesignGuidance {
  return {
    harnessVersion: DESIGN_HARNESS_VERSION,
    pack: {
      id: DESIGN_GUIDANCE_PACK_ID,
      version: DESIGN_GUIDANCE_PACK_VERSION,
    },
    hard: {
      owner: "ornigami",
      label: "Enforceable template and identity constraints",
      rules: [
        ...protectedIdentityRules(),
        ...selectionRules(context),
      ],
    },
    advisory: {
      owner: "adapted-taste-skill",
      label: "Advisory design judgment",
      rules: ADVISORY_RULES,
    },
    sources: SOURCES.map((source) => ({ ...source })),
  };
}

export {
  ADVISORY_RULES,
  DESIGN_GUIDANCE_PACK_ID,
  DESIGN_GUIDANCE_PACK_VERSION,
  DESIGN_HARNESS_VERSION,
};
