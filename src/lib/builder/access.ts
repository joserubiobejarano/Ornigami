import { readBuilderRuntimeConfig } from "./config.ts";

/**
 * The first-beta production builder has no authorization implementation yet.
 * This decision deliberately never consults the reputation app's Auth.js
 * session: a legacy account or plan does not grant builder access, ownership or
 * generation budget.
 */
export type BuilderAccessDecision =
  | {
      allowed: true;
      reason: "authorized";
      subject: string;
    }
  | {
      allowed: false;
      reason: "closed";
      message: string;
    };

export const BUILDER_CLOSED_MESSAGE =
  "The private builder is not open. Builder-specific invite access, ownership and generation budgets have not been implemented.";

export function getBuilderAccessDecision(
  env: Record<string, string | undefined> = process.env,
): BuilderAccessDecision {
  try {
    // Validate first so a misconfigured process cannot accidentally look open.
    readBuilderRuntimeConfig(env);
  } catch {
    return {
      allowed: false,
      reason: "closed",
      message: "The private builder configuration is invalid, so access stays closed.",
    };
  }
  return {
    allowed: false,
    reason: "closed",
    message: BUILDER_CLOSED_MESSAGE,
  };
}

/**
 * Closed builder routes return 404 rather than a login redirect or an
 * entitlement error. That keeps the surface indistinguishable from an absent
 * route and avoids implying that a reputation account can sign in.
 */
export function builderClosedResponse(): Response {
  return Response.json(
    { ok: false, error: "Not found." },
    {
      status: 404,
      headers: {
        "Cache-Control": "no-store",
        "X-Robots-Tag": "noindex, nofollow",
      },
    },
  );
}
