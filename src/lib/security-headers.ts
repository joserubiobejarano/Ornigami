import { getOptionalEnv } from "./env.ts";

export const TRUSTED_TYPES_REPORTING_ENDPOINT = 'csp-endpoint="/api/csp-report"';
export const TRUSTED_TYPES_REPORT_ONLY_POLICY =
  "require-trusted-types-for 'script'; trusted-types default; report-to csp-endpoint";

export function buildContentSecurityPolicy(nonce: string): string {
  const developmentScriptPolicy = getOptionalEnv("NODE_ENV") !== "production" ? " 'unsafe-eval'" : "";
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data: https:",
    "style-src 'self' 'unsafe-inline' https:",
    `script-src 'self' 'nonce-${nonce}'${developmentScriptPolicy} https://js.stripe.com https://www.googletagmanager.com https://www.google.com https://www.gstatic.com`,
    "connect-src 'self' https://api.stripe.com https://checkout.stripe.com https://api.openai.com https://api.resend.com https://oauth2.googleapis.com https://mybusiness.googleapis.com https://businessprofileperformance.googleapis.com https://generativelanguage.googleapis.com https://*.neon.tech https://*.vercel.app https://*.sentry.io",
    "frame-src 'self' https://js.stripe.com https://hooks.stripe.com https://checkout.stripe.com https://www.google.com",
    "object-src 'none'",
  ].join("; ");
}
