import { z } from "zod";

const ServerEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().url().optional(),
  OPENAI_API_KEY: z.string().min(1).optional(),
  STRIPE_SECRET_KEY: z.string().min(1).optional(),
  STRIPE_WEBHOOK_SECRET: z.string().min(1).optional(),
  GOOGLE_CLIENT_ID: z.string().min(1).optional(),
  GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
  AUTH_SECRET: z.string().min(1).optional(),
  NEXTAUTH_SECRET: z.string().min(1).optional(),
  CRON_SECRET: z.string().min(1).optional(),
  RESEND_API_KEY: z.string().min(1).optional(),
  EMAIL_FROM: z.string().email().optional(),
  REPLY_TO_EMAIL: z.string().email().optional(),
  TOKEN_ENCRYPTION_KEY: z.string().min(1).optional(),
  REVIEW_BOOSTER_UNSUBSCRIBE_SECRET: z.string().min(1).optional(),
  ALLOW_DASHBOARD_WITHOUT_GBP: z.string().optional(),
  STRIPE_PRICE_REPLIES_MONTHLY: z.string().min(1).optional(),
  STRIPE_PRICE_REPLIES_ANNUAL: z.string().min(1).optional(),
  STRIPE_PRICE_BOOSTER_MONTHLY: z.string().min(1).optional(),
  STRIPE_PRICE_BOOSTER_ANNUAL: z.string().min(1).optional(),
  STRIPE_PRICE_COMPLETE_MONTHLY: z.string().min(1).optional(),
  STRIPE_PRICE_COMPLETE_ANNUAL: z.string().min(1).optional(),
  NEXT_PUBLIC_APP_URL: z.string().url().optional(),
});

export type ServerEnv = z.infer<typeof ServerEnvSchema>;

export function getServerEnv(): ServerEnv {
  return ServerEnvSchema.parse(process.env);
}

export function getRequiredEnv<K extends keyof ServerEnv>(key: K): NonNullable<ServerEnv[K]> {
  const value = getServerEnv()[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${String(key)}`);
  }
  return value as NonNullable<ServerEnv[K]>;
}

export function getOptionalEnv<K extends keyof ServerEnv>(key: K): ServerEnv[K] {
  return getServerEnv()[key];
}

export function getEnvValue(key: string): string | undefined {
  const values = getServerEnv() as Record<string, unknown>;
  const value = values[key];
  return typeof value === "string" ? value : undefined;
}

/**
 * Normalize app base URL: trim whitespace and remove trailing slashes.
 * Prevents double slashes when joining paths (e.g. OAuth `redirect_uri`).
 */
export function normalizeAppBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

function resolveServerAppBaseUrl(): string {
  const raw = getOptionalEnv("NEXT_PUBLIC_APP_URL")?.trim();
  if (raw) return normalizeAppBaseUrl(raw);
  return "http://localhost:3000";
}

/**
 * Get the application base URL.
 * Falls back to localhost:3000 for local development if NEXT_PUBLIC_APP_URL is not set.
 */
export function getAppUrl(): string {
  if (typeof window !== "undefined") {
    // Client-side: use the current origin
    return window.location.origin;
  }

  return resolveServerAppBaseUrl();
}

/**
 * Get the application base URL for server-side use only.
 * Use this when you need the URL in API routes or server components.
 */
export function getServerAppUrl(): string {
  return resolveServerAppBaseUrl();
}

