import { getOrInitializeSentryClient, isProtectedSentryPath } from "@/lib/sentry-client";

if (typeof window !== "undefined" && isProtectedSentryPath(window.location.pathname)) {
  void getOrInitializeSentryClient().catch(() => undefined);
}

export function onRouterTransitionStart(href: string, navigationType: string) {
  if (typeof window === "undefined") return;
  const nextPath = new URL(href, window.location.href).pathname;
  if (!isProtectedSentryPath(nextPath)) return;
  void getOrInitializeSentryClient()
    .then((Sentry) => Sentry?.captureRouterTransitionStart(href, navigationType))
    .catch(() => undefined);
}
