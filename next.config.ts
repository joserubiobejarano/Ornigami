import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";
import {
  TRUSTED_TYPES_REPORT_ONLY_POLICY,
  TRUSTED_TYPES_REPORTING_ENDPOINT,
} from "./src/lib/security-headers";
import { isPrivatePreviewMode } from "./src/lib/private-preview";

const configuredAppUrl = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "");
const privatePreview = isPrivatePreviewMode();
const containerBuild = process.env.ORNIGAMI_CONTAINER_BUILD === "true";
const buildMemoryOptimizations =
  containerBuild && process.env.ORNIGAMI_BUILD_MEMORY_OPTIMIZATIONS === "true";
const buildWebpackWorker =
  containerBuild && process.env.ORNIGAMI_BUILD_WEBPACK_WORKER === "true";
const buildDisableSourceMaps =
  containerBuild &&
  process.env.ORNIGAMI_BUILD_DISABLE_SOURCEMAPS === "true" &&
  !process.env.SENTRY_AUTH_TOKEN;
if (process.env.VERCEL_ENV === "production" && configuredAppUrl !== "https://ornigami.com") {
  throw new Error("NEXT_PUBLIC_APP_URL must be https://ornigami.com in Vercel production.");
}

const nextConfig: NextConfig = {
  // Expose only a single non-secret disable bit in the exact private build;
  // the branch/ref settings remain server-side and ordinary builds add none.
  ...(privatePreview ? { env: { NEXT_PUBLIC_ORNIGAMI_SENTRY_DISABLED: "true" } } : {}),
  reactCompiler: true,
  experimental: {
    sri: { algorithm: "sha256" },
    ...(containerBuild
      ? {
          cpus: 1,
          ...(buildMemoryOptimizations ? { webpackMemoryOptimizations: true } : {}),
          ...(buildWebpackWorker ? { webpackBuildWorker: true } : {}),
        }
      : {}),
  },
  async headers() {
    const headers = [
      { key: "X-Frame-Options", value: "DENY" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
      { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains; preload" },
    ];

    if (process.env.NODE_ENV === "production") {
      headers.unshift(
        { key: "Reporting-Endpoints", value: TRUSTED_TYPES_REPORTING_ENDPOINT },
        {
          key: "Content-Security-Policy-Report-Only",
          value: TRUSTED_TYPES_REPORT_ONLY_POLICY,
        }
      );
    }

    return [
      {
        source: "/(.*)",
        headers,
      },
    ];
  },
};

const sentryConfig = {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: true,
  widenClientFileUpload: true,
  ...(buildDisableSourceMaps ? { sourcemaps: { disable: true } } : {}),
};

// Returning Next's config directly prevents the Sentry wrapper's build-time
// instrumentation, release hook, source-map upload and plugin telemetry.
export default privatePreview ? nextConfig : withSentryConfig(nextConfig, sentryConfig);
