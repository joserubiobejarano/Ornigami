const PRIVATE_STAGING_BRANCH = "codex/ornigami-staging-readiness-20261018";

/** Enable private staging behavior only for the explicitly selected Preview branch. */
export function isPrivatePreviewMode(env: Record<string, string | undefined> = process.env): boolean {
  return env.VERCEL_ENV === "preview"
    && env.ORNIGAMI_PRIVATE_STAGING_MODE === "true"
    && env.VERCEL_GIT_COMMIT_REF === PRIVATE_STAGING_BRANCH;
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
