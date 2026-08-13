const protectedPrefixes = ["/dashboard", "/reviews", "/content", "/audit", "/settings", "/connect"];

function isProtectedPath(pathname: string): boolean {
  return protectedPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

async function initializeSentry() {
  const Sentry = await import("@sentry/nextjs");
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    enabled: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 0,
    sendDefaultPii: false,
  });
  return Sentry;
}

let sentryPromise: ReturnType<typeof initializeSentry> | null = null;

function loadSentry() {
  sentryPromise ??= initializeSentry();
  return sentryPromise;
}

if (typeof window !== "undefined" && isProtectedPath(window.location.pathname)) {
  void loadSentry();
}

export function onRouterTransitionStart(href: string, navigationType: string) {
  if (typeof window === "undefined") return;
  const nextPath = new URL(href, window.location.href).pathname;
  if (!isProtectedPath(nextPath)) return;
  void loadSentry().then(({ captureRouterTransitionStart }) => {
    captureRouterTransitionStart(href, navigationType);
  });
}
