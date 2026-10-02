export type DisconnectedAccessState = { hasGbp: boolean; hasRepliesAccess: boolean };

/** Recovery and settings stay reachable when the shared Google connection is absent. */
export function isGoogleDependentRepliesPath(pathname: string): boolean {
  if (pathname === "/reviews" || pathname.startsWith("/reviews/")) return true;
  const root = "/dashboard/agents/review-replies";
  if (pathname !== root && !pathname.startsWith(`${root}/`)) return false;
  for (const suffix of ["google-connection", "settings"]) {
    const path = `${root}/${suffix}`;
    if (pathname === path || pathname.startsWith(`${path}/`)) return false;
  }
  return true;
}

export function shouldRedirectToGoogleConnect(pathname: string, state: DisconnectedAccessState): boolean {
  return isGoogleDependentRepliesPath(pathname) && state.hasRepliesAccess && !state.hasGbp;
}

export function shouldRedirectAfterAccessResolutionError(pathname: string): boolean {
  return isGoogleDependentRepliesPath(pathname);
}
