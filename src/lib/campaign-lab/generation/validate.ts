import type { LayoutId, SectionId, TemplatePlan } from "../types.ts";
import type { GenerationRequest } from "./types.ts";

export type ProposalValidationResult =
  | { ok: true; plan: TemplatePlan }
  | { ok: false; issues: string[] };

const ALLOWED_KEYS = new Set(["angle", "layout", "sections", "factIds"]);
const PROTECTED_KEYS = new Set([
  "productName",
  "product",
  "offer",
  "price",
  "destinationUrl",
  "destination",
  "assetId",
  "asset",
  "image",
  "alt",
  "actionLabel",
  "brandId",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * Validates model output against the versioned template contract before any
 * renderer slot is assembled. Only template identifiers and approved fact IDs
 * survive; campaign identity cannot be supplied by the model.
 */
export function validateGenerationProposal(
  raw: unknown,
  request: GenerationRequest,
): ProposalValidationResult {
  const issues: string[] = [];

  if (!isRecord(raw)) {
    return { ok: false, issues: ["The generator response must be a JSON object."] };
  }

  for (const key of Object.keys(raw)) {
    if (PROTECTED_KEYS.has(key)) {
      issues.push(`The generator may not set "${key}"; campaign facts stay in the validated brief.`);
    } else if (!ALLOWED_KEYS.has(key)) {
      issues.push(`The generator returned an unsupported field "${key}".`);
    }
  }

  const angle = raw.angle;
  if (typeof angle !== "string" || !request.allowed.angles.includes(angle as never)) {
    issues.push("The opening angle is not supported for this campaign.");
  }

  const layout = raw.layout;
  if (typeof layout !== "string" || !request.allowed.layouts.includes(layout as LayoutId)) {
    issues.push("The layout is not a supported template variant.");
  }

  const sections = raw.sections;
  let validSections: SectionId[] | null = null;
  if (!Array.isArray(sections) || sections.some((section) => typeof section !== "string")) {
    issues.push("Sections must be an ordered list of section names.");
  } else {
    validSections = sections as SectionId[];
    if (typeof layout === "string" && request.allowed.layouts.includes(layout as LayoutId)) {
      const orders = request.allowed.sectionOrders[layout as LayoutId];
      const supported = orders.some(
        (order) =>
          order.length === validSections!.length &&
          order.every((section, index) => section === validSections![index]),
      );
      if (!supported) {
        issues.push("The section order is not supported by the selected layout.");
      }
    }
  }

  const factIds = raw.factIds;
  let validFactIds: string[] | null = null;
  if (!Array.isArray(factIds) || factIds.some((id) => typeof id !== "string")) {
    issues.push("Fact IDs must be a list of strings.");
  } else {
    validFactIds = factIds as string[];
    const seen = new Set<string>();
    for (const id of validFactIds) {
      if (seen.has(id)) issues.push(`Fact "${id}" was selected more than once.`);
      seen.add(id);
      if (!request.allowed.factIds.includes(id)) {
        issues.push(`Fact "${id}" is not approved for this campaign.`);
      }
    }
    if (validFactIds.length > request.allowed.maxFacts) {
      issues.push(`At most ${request.allowed.maxFacts} approved facts may be selected.`);
    }
    if (typeof layout === "string" && request.allowed.layouts.includes(layout as LayoutId)) {
      const capacity = request.allowed.layoutFactCapacity[layout as LayoutId];
      if (validFactIds.length > capacity) {
        issues.push(
          `The selected layout accepts at most ${capacity} facts; the proposal selected ${validFactIds.length}.`,
        );
      }
    }
    for (const group of request.allowed.requiredFactGroups) {
      const missing = group.factIds.filter((id) => !validFactIds!.includes(id));
      if (missing.length > 0) {
        issues.push(
          `Required fact group "${group.label || group.id}" is incomplete; missing ${missing.join(", ")}.`,
        );
      }
    }
    if (validSections?.includes("hero-facts") || validSections?.includes("detail")) {
      if (validFactIds.length === 0) {
        issues.push("The selected facts section needs at least one approved fact.");
      }
    } else if (validFactIds.length > 0) {
      issues.push("Selected facts need a supported facts section.");
    }
  }

  if (issues.length > 0 || validSections === null || validFactIds === null) {
    return { ok: false, issues };
  }

  return {
    ok: true,
    plan: {
      angle: angle as TemplatePlan["angle"],
      layout: layout as LayoutId,
      sections: validSections,
      factIds: validFactIds,
    },
  };
}
