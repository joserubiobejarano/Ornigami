const PRIVATE_STAGING_BRANCH = "codex/ornigami-staging-readiness-20261018";
const COOLIFY_PRIVATE_STAGING_ORIGIN = "https://staging.ornigami.com";

/** Enable private staging behavior only for the exact Vercel branch or opted-in Coolify profile. */
export function isPrivatePreviewMode(env: Record<string, string | undefined> = process.env): boolean {
  const vercelPrivatePreview = env.VERCEL_ENV === "preview"
    && env.ORNIGAMI_PRIVATE_STAGING_MODE === "true"
    && env.VERCEL_GIT_COMMIT_REF === PRIVATE_STAGING_BRANCH;
  if (vercelPrivatePreview) return true;

  const coolifyPrivateStaging = env.ORNIGAMI_PRIVATE_STAGING_PLATFORM === "coolify"
    && env.ORNIGAMI_PRIVATE_STAGING_MODE === "true"
    && env.NODE_ENV === "production"
    && env.VERCEL !== "1"
    && env.VERCEL_ENV === undefined
    && env.VERCEL_GIT_COMMIT_REF === undefined
    && env.NEXT_PUBLIC_APP_URL === COOLIFY_PRIVATE_STAGING_ORIGIN
    && env.AUTH_URL === COOLIFY_PRIVATE_STAGING_ORIGIN;
  return coolifyPrivateStaging;
}

export type DashboardGoogleStep = {
  label: string;
  description: string;
  complete: boolean;
  href?: string;
  actionLabel?: string;
};

/** Keep the private synthetic dashboard usable without inviting a live GBP connection. */
export function getDashboardGoogleStep(input: {
  privatePreview: boolean;
  hasGbp: boolean;
  isWorkspaceOwner: boolean;
}): DashboardGoogleStep {
  if (input.privatePreview) {
    return {
      label: "Google profile disabled in private staging",
      description: "Google Business Profile operations are disabled for this private synthetic workspace.",
      complete: false,
    };
  }
  return {
    label: input.hasGbp ? "Google profile connected" : "Connect your Google profile",
    description: input.hasGbp
      ? "The workspace owner has connected Google Business Profile."
      : input.isWorkspaceOwner
        ? "Connect Google Business Profile so Review Replies can sync and draft replies."
        : "Ask the workspace owner to connect Google Business Profile so Review Replies can sync and draft replies.",
    complete: input.hasGbp,
    href: input.isWorkspaceOwner ? "/connect" : undefined,
    actionLabel: input.isWorkspaceOwner ? "Connect Google" : undefined,
  };
}
