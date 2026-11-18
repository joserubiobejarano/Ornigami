/**
 * Shared campaign-context limits and normalization. Missing values stay
 * compatible with older briefs; present values must be text and are never
 * truncated.
 */
export const CAMPAIGN_AUDIENCE_MAX_LENGTH = 240;
export const CAMPAIGN_OBJECTIVE_MAX_LENGTH = 240;

export type CampaignContextField = "audience" | "objective";

export type CampaignContextIssue = {
  field: CampaignContextField;
  message: string;
};

export type CampaignContextResult =
  | {
      ok: true;
      audience?: string;
      objective?: string;
    }
  | {
      ok: false;
      issues: CampaignContextIssue[];
    };

type ContextInput = {
  audience?: unknown;
  objective?: unknown;
};

function readContextText(
  value: unknown,
  field: CampaignContextField,
): { value?: string; issue?: CampaignContextIssue } {
  if (value === undefined || value === null) return {};
  const label = field === "audience" ? "Audience" : "Campaign objective";
  if (typeof value !== "string") {
    return {
      issue: { field, message: `${label} must be text.` },
    };
  }
  const text = value.trim();
  if (!text) return {};
  const limit =
    field === "audience"
      ? CAMPAIGN_AUDIENCE_MAX_LENGTH
      : CAMPAIGN_OBJECTIVE_MAX_LENGTH;
  if (text.length > limit) {
    return {
      issue: {
        field,
        message: `${label} must be ${limit} characters or fewer.`,
      },
    };
  }
  return { value: text };
}

export function parseCampaignContext(input: ContextInput): CampaignContextResult {
  const audience = readContextText(input.audience, "audience");
  const objective = readContextText(input.objective, "objective");
  const issues = [audience.issue, objective.issue].filter(
    (issue): issue is CampaignContextIssue => Boolean(issue),
  );
  if (issues.length > 0) return { ok: false, issues };
  return {
    ok: true,
    ...(audience.value ? { audience: audience.value } : {}),
    ...(objective.value ? { objective: objective.value } : {}),
  };
}
