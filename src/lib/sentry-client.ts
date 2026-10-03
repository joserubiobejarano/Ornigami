"use client";

import { SENTRY_OPTIONS } from "@/lib/sentry-options";

const protectedPrefixes = ["/dashboard", "/reviews", "/content", "/audit", "/settings", "/connect"];

export function isProtectedSentryPath(pathname: string): boolean {
  return protectedPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function currentPathname(): string {
  try {
    return typeof window === "undefined" ? "" : window.location.pathname;
  } catch {
    return "";
  }
}

type SentryClient = typeof import("@sentry/nextjs");
const BOUNDARY_NAMES = ["route", "global"] as const;

function safeBoundaryEvent(event: Parameters<NonNullable<Parameters<SentryClient["init"]>[0]["beforeSend"]>>[0]) {
  const boundary = event.tags?.error_boundary;
  if (boundary !== BOUNDARY_NAMES[0] && boundary !== BOUNDARY_NAMES[1]) return null;

  const fixedMessage = `Ornigami ${boundary} error boundary caught an error`;
  if (!event.exception?.values?.some((value) => value.value === fixedMessage)) return null;

  const digest = event.tags?.error_digest;
  return {
    event_id: event.event_id,
    timestamp: event.timestamp,
    platform: event.platform,
    sdk: event.sdk,
    release: event.release,
    environment: event.environment,
    type: undefined,
    level: "error" as const,
    exception: { values: [{ type: "Error", value: fixedMessage }] },
    tags: {
      error_boundary: boundary,
      ...(typeof digest === "string" && /^\d{1,20}$/.test(digest) ? { error_digest: digest } : {}),
    },
    fingerprint: ["ornigami-error-boundary", boundary, typeof digest === "string" && /^\d{1,20}$/.test(digest) ? digest : "no-digest"],
  };
}

let sentryClientPromise: Promise<SentryClient | null> | undefined;

async function initializeSentryClient(dsn: string): Promise<SentryClient> {
  const Sentry = await import("@sentry/nextjs");
  if (Sentry.getClient()) return Sentry;

  Sentry.init({
    dsn,
    enabled: true,
    ...SENTRY_OPTIONS,
    integrations: (integrations) => integrations.filter((integration) => integration.name !== "BrowserSession"),
    beforeSend: (event) => {
      const boundary = safeBoundaryEvent(event);
      if (boundary) return boundary;
      if (event.tags?.error_boundary === BOUNDARY_NAMES[0] || event.tags?.error_boundary === BOUNDARY_NAMES[1]) return null;
      return isProtectedSentryPath(currentPathname()) ? event : null;
    },
    beforeSendTransaction: (event) => isProtectedSentryPath(currentPathname()) ? event : null,
    beforeBreadcrumb: (breadcrumb) => isProtectedSentryPath(currentPathname()) ? breadcrumb : null,
    // Read the active route at sampling time. A client bootstrapped by a
    // public boundary can later serve protected routes without enabling
    // tracing for public pages.
    tracesSampler: () => process.env.NODE_ENV === "production" && isProtectedSentryPath(currentPathname())
      ? 0.1
      : 0,
  });
  return Sentry;
}

/** Load and initialize the browser SDK once, shared by boundaries and router instrumentation. */
export function getOrInitializeSentryClient(): Promise<SentryClient | null> {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn) return Promise.resolve(null);

  if (!sentryClientPromise) {
    sentryClientPromise = initializeSentryClient(dsn).catch((error: unknown) => {
      // A transient import/init failure should not disable later capture or navigation attempts.
      sentryClientPromise = undefined;
      throw error;
    });
  }
  return sentryClientPromise;
}
