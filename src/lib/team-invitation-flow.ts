export function invitationEmailMatches(invitationEmail: string, sessionEmail: string | null | undefined): boolean {
  return Boolean(sessionEmail) && invitationEmail.trim().toLowerCase() === sessionEmail!.trim().toLowerCase();
}

export function resolveInvitationRedirect(redirectTo: unknown, origin: string): string | null {
  if (typeof redirectTo !== "string" || !redirectTo.startsWith("/") || redirectTo.startsWith("//") || /[\\\u0000-\u001f\u007f]/.test(redirectTo)) {
    return null;
  }
  try {
    const destination = new URL(redirectTo, origin);
    if (destination.origin !== new URL(origin).origin || destination.pathname.startsWith("//")) return null;
    return `${destination.pathname}${destination.search}${destination.hash}`;
  } catch {
    return null;
  }
}
