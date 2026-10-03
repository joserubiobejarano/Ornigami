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

let sentryClientPromise: Promise<SentryClient | null> | undefined;

async function initializeSentryClient(dsn: string): Promise<SentryClient> {
  const Sentry = await import("@sentry/nextjs");
  if (Sentry.getClient()) return Sentry;

  Sentry.init({
    dsn,
    enabled: true,
    ...SENTRY_OPTIONS,
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
