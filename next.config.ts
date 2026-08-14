import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";
import {
  TRUSTED_TYPES_REPORT_ONLY_POLICY,
  TRUSTED_TYPES_REPORTING_ENDPOINT,
} from "./src/lib/security-headers";

const configuredAppUrl = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "");
if (process.env.VERCEL_ENV === "production" && configuredAppUrl !== "https://ornigami.com") {
  throw new Error("NEXT_PUBLIC_APP_URL must be https://ornigami.com in Vercel production.");
}

const nextConfig: NextConfig = {
  reactCompiler: true,
  experimental: {
    sri: { algorithm: "sha256" },
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

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: true,
  widenClientFileUpload: true,
});
