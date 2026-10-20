import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const FALSE_FLAGS = [
  "OPENAI_ENABLED",
  "ORNIGAMI_COOLIFY_CRON_ENABLED",
  "ORNIGAMI_COOLIFY_CRON_REVIEW_BOOSTER_ENABLED",
  "ORNIGAMI_COOLIFY_CRON_REVIEW_REPLIES_ENABLED",
  "ORNIGAMI_COOLIFY_CRON_PRIVACY_ENABLED",
  "ORNIGAMI_COOLIFY_REPLIES_ACCEPTED",
  "RESEND_RECONCILIATION_ENABLED",
  "PRIVACY_ACCOUNT_DELETION_ENABLED",
  "PRIVACY_RETENTION_ENABLED",
  "PRIVACY_RETENTION_APPLY",
];

const PROHIBITED_CREDENTIALS = [
  "DATABASE_URL",
  "OPENAI_API_KEY",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "RESEND_API_KEY",
  "RESEND_WEBHOOK_SECRET",
  "SENTRY_DSN",
  "NEXT_PUBLIC_SENTRY_DSN",
  "SENTRY_AUTH_TOKEN",
  "QR_MAIL_BOOSTER_AUTHORITY_TOKEN",
  "QR_MAIL_DIRECT_AUTHORITY_TOKEN",
];

const FIXED_SYNTHETIC_VALUES = {
  GOOGLE_CLIENT_ID: "rehearsal.invalid",
  GOOGLE_CLIENT_SECRET: "rehearsal-only-placeholder-not-a-provider-credential",
  AUTH_SECRET: "rehearsal-only-synthetic-auth-secret-not-for-use",
  CRON_SECRET: "rehearsal-only-synthetic-cron-secret-not-for-use",
  TOKEN_ENCRYPTION_KEY: "rehearsal-only-synthetic-token-key-not-for-use",
  REVIEW_BOOSTER_UNSUBSCRIBE_SECRET: "rehearsal-only-synthetic-unsubscribe-secret-not-for-use",
};

/** Return only a fixed exit status; never return or print environment data. */
export function verifyRuntimeConfiguration(env = process.env) {
  if (env.NODE_ENV !== "production"
    || env.ORNIGAMI_PRIVATE_STAGING_MODE !== "true"
    || env.ORNIGAMI_PRIVATE_STAGING_PLATFORM !== "coolify"
    || env.NEXT_PUBLIC_APP_URL !== "https://staging.ornigami.com"
    || env.AUTH_URL !== "https://staging.ornigami.com"
    || env.VERCEL === "1"
    || env.VERCEL_ENV !== undefined
    || env.VERCEL_GIT_COMMIT_REF !== undefined) return 4;
  if (env.ORNIGAMI_PREVIEW_DB_EXPECTED_ENDPOINT_SHA256 !== "96acb55ea0fc6bbf35fe992be70a05ee9ba87fceb4f5fa9b66be74be5be063d1"
    || env.ORNIGAMI_PREVIEW_DB_EXPECTED_NAME !== "ornigami_staging"
    || env.ORNIGAMI_PREVIEW_DB_EXPECTED_ROLE !== "ornigami_staging_owner") return 5;
  if (FALSE_FLAGS.some((name) => env[name] !== "false")) return 1;
  if (PROHIBITED_CREDENTIALS.some((name) => typeof env[name] === "string" && env[name] !== "")) return 2;
  if (Object.entries(FIXED_SYNTHETIC_VALUES).some(([name, value]) => env[name] !== value)) return 3;
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const status = verifyRuntimeConfiguration();
  if (status === 0) process.stdout.write("all_features_disabled;no_database_or_provider_secrets;synthetic_google_only\n");
  process.exitCode = status;
}
