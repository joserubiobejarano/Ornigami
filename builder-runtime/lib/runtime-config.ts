import path from "node:path";

import { validateBuilderEnvironment } from "../../src/lib/builder/config.ts";

import { builderStoreIsWritable } from "./identity-store.ts";
import type { BuilderGenerationLimits } from "./usage-ledger.ts";

export type BuilderRuntimeMode = "closed" | "invite";
export type BuilderTestProviderMode =
  | "none"
  | "success"
  | "invalid"
  | "timeout"
  | "unknown";

export type BuilderRuntimeConfig = Readonly<{
  mode: BuilderRuntimeMode;
  storeDir: string | null;
  sessionTtlSeconds: number;
  cookieName: string;
  secureCookies: boolean;
  appUrl: string;
  testGenerationDelayMs: number;
  providerTimeoutMs: number;
  testProvider: BuilderTestProviderMode;
  testProviderCostMicros: number;
  limits: BuilderGenerationLimits;
  redeemWindowSeconds: number;
  redeemClientAttemptLimit: number;
  redeemGlobalAttemptLimit: number;
  trustProxyHeaders: boolean;
}>;

export class BuilderRuntimeConfigurationError extends Error {
  readonly errors: readonly string[];

  constructor(errors: readonly string[]) {
    super(`Builder runtime configuration is invalid: ${errors.join(" ")}`);
    this.name = "BuilderRuntimeConfigurationError";
    this.errors = errors;
  }
}

const DEFAULT_SESSION_TTL_SECONDS = 8 * 60 * 60;
const MAX_SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;
const MAX_TEST_DELAY_MS = 5_000;
export const BUILDER_SESSION_COOKIE = "ornigami_builder_session";

const DEFAULT_LIMITS: BuilderGenerationLimits = {
  windowSeconds: 24 * 60 * 60,
  reservationLeaseSeconds: 300,
  requestReserveMicros: 50_000,
  subjectRequests: 30,
  globalRequests: 300,
  subjectConcurrency: 2,
  globalConcurrency: 8,
  subjectSpendMicros: 5_000_000,
  globalSpendMicros: 50_000_000,
};

function parseInteger(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
  label: string,
  errors: string[],
): number {
  if (value === undefined || value.trim() === "") return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < minimum || parsed > maximum) {
    errors.push(`${label} must be an integer between ${minimum} and ${maximum}.`);
    return fallback;
  }
  return parsed;
}

function isLocalUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === "http:" &&
      (parsed.hostname === "127.0.0.1" ||
        parsed.hostname === "localhost" ||
        parsed.hostname === "::1")
    );
  } catch {
    return false;
  }
}

/**
 * Runtime-local access configuration. The shared builder config remains
 * default-closed and the legacy foundation never reads these values.
 */
export function readBuilderRuntimeConfig(
  env: Record<string, string | undefined> = process.env,
): BuilderRuntimeConfig {
  const errors: string[] = [];
  const shared = validateBuilderEnvironment(env);
  if (!shared.ok) errors.push(...shared.errors);

  const rawMode = env.BUILDER_RUNTIME_MODE?.trim().toLowerCase();
  const mode: BuilderRuntimeMode =
    rawMode === undefined || rawMode === "" || rawMode === "closed"
      ? "closed"
      : rawMode === "invite"
        ? "invite"
        : (errors.push('BUILDER_RUNTIME_MODE must be "closed" or "invite".'), "closed");

  const rawStore = env.BUILDER_RUNTIME_STORE_DIR?.trim();
  if (mode === "invite" && !rawStore) {
    errors.push("BUILDER_RUNTIME_STORE_DIR is required when invite access is enabled.");
  }

  const sessionTtlSeconds = parseInteger(
    env.BUILDER_RUNTIME_SESSION_TTL_SECONDS,
    DEFAULT_SESSION_TTL_SECONDS,
    1,
    MAX_SESSION_TTL_SECONDS,
    "BUILDER_RUNTIME_SESSION_TTL_SECONDS",
    errors,
  );

  const testHooks = env.BUILDER_RUNTIME_ALLOW_TEST_HOOKS === "1";
  const delayRaw = env.BUILDER_RUNTIME_TEST_GENERATION_DELAY_MS;
  let testGenerationDelayMs = 0;
  if (delayRaw !== undefined && delayRaw.trim() !== "") {
    if (!testHooks) {
      errors.push(
        "BUILDER_RUNTIME_TEST_GENERATION_DELAY_MS requires BUILDER_RUNTIME_ALLOW_TEST_HOOKS=1.",
      );
    } else {
      testGenerationDelayMs = parseInteger(
        delayRaw,
        0,
        0,
        MAX_TEST_DELAY_MS,
        "BUILDER_RUNTIME_TEST_GENERATION_DELAY_MS",
        errors,
      );
    }
  }

  const rawTestProvider = env.BUILDER_RUNTIME_TEST_PROVIDER?.trim().toLowerCase();
  let testProvider: BuilderTestProviderMode = "none";
  if (
    rawTestProvider !== undefined &&
    rawTestProvider !== "" &&
    rawTestProvider !== "none"
  ) {
    if (!testHooks) {
      errors.push(
        "BUILDER_RUNTIME_TEST_PROVIDER requires BUILDER_RUNTIME_ALLOW_TEST_HOOKS=1.",
      );
    }
    if (
      rawTestProvider === "success" ||
      rawTestProvider === "invalid" ||
      rawTestProvider === "timeout" ||
      rawTestProvider === "unknown"
    ) {
      testProvider = rawTestProvider;
    } else {
      errors.push(
        'BUILDER_RUNTIME_TEST_PROVIDER must be "none", "success", "invalid", "timeout" or "unknown".',
      );
    }
  }

  const testProviderCostMicros = parseInteger(
    env.BUILDER_RUNTIME_TEST_PROVIDER_COST_MICROS,
    0,
    0,
    1_000_000_000,
    "BUILDER_RUNTIME_TEST_PROVIDER_COST_MICROS",
    errors,
  );
  if (testProviderCostMicros > 0 && !testHooks) {
    errors.push(
      "BUILDER_RUNTIME_TEST_PROVIDER_COST_MICROS requires BUILDER_RUNTIME_ALLOW_TEST_HOOKS=1.",
    );
  }

  const providerTimeoutMs = parseInteger(
    env.BUILDER_RUNTIME_PROVIDER_TIMEOUT_MS,
    5_000,
    50,
    15_000,
    "BUILDER_RUNTIME_PROVIDER_TIMEOUT_MS",
    errors,
  );

  const limits: BuilderGenerationLimits = {
    windowSeconds: parseInteger(
      env.BUILDER_RUNTIME_LIMIT_WINDOW_SECONDS,
      DEFAULT_LIMITS.windowSeconds,
      60,
      604_800,
      "BUILDER_RUNTIME_LIMIT_WINDOW_SECONDS",
      errors,
    ),
    reservationLeaseSeconds: parseInteger(
      env.BUILDER_RUNTIME_RESERVATION_LEASE_SECONDS,
      DEFAULT_LIMITS.reservationLeaseSeconds,
      30,
      3_600,
      "BUILDER_RUNTIME_RESERVATION_LEASE_SECONDS",
      errors,
    ),
    requestReserveMicros: parseInteger(
      env.BUILDER_RUNTIME_REQUEST_RESERVE_MICROS,
      DEFAULT_LIMITS.requestReserveMicros,
      0,
      1_000_000_000,
      "BUILDER_RUNTIME_REQUEST_RESERVE_MICROS",
      errors,
    ),
    subjectRequests: parseInteger(
      env.BUILDER_RUNTIME_SUBJECT_REQUEST_LIMIT,
      DEFAULT_LIMITS.subjectRequests,
      1,
      10_000,
      "BUILDER_RUNTIME_SUBJECT_REQUEST_LIMIT",
      errors,
    ),
    globalRequests: parseInteger(
      env.BUILDER_RUNTIME_GLOBAL_REQUEST_LIMIT,
      DEFAULT_LIMITS.globalRequests,
      1,
      100_000,
      "BUILDER_RUNTIME_GLOBAL_REQUEST_LIMIT",
      errors,
    ),
    subjectConcurrency: parseInteger(
      env.BUILDER_RUNTIME_SUBJECT_CONCURRENCY_LIMIT,
      DEFAULT_LIMITS.subjectConcurrency,
      1,
      100,
      "BUILDER_RUNTIME_SUBJECT_CONCURRENCY_LIMIT",
      errors,
    ),
    globalConcurrency: parseInteger(
      env.BUILDER_RUNTIME_GLOBAL_CONCURRENCY_LIMIT,
      DEFAULT_LIMITS.globalConcurrency,
      1,
      100,
      "BUILDER_RUNTIME_GLOBAL_CONCURRENCY_LIMIT",
      errors,
    ),
    subjectSpendMicros: parseInteger(
      env.BUILDER_RUNTIME_SUBJECT_SPEND_LIMIT_MICROS,
      DEFAULT_LIMITS.subjectSpendMicros,
      0,
      1_000_000_000_000,
      "BUILDER_RUNTIME_SUBJECT_SPEND_LIMIT_MICROS",
      errors,
    ),
    globalSpendMicros: parseInteger(
      env.BUILDER_RUNTIME_GLOBAL_SPEND_LIMIT_MICROS,
      DEFAULT_LIMITS.globalSpendMicros,
      0,
      1_000_000_000_000,
      "BUILDER_RUNTIME_GLOBAL_SPEND_LIMIT_MICROS",
      errors,
    ),
  };

  const appUrl = env.NEXT_PUBLIC_APP_URL?.trim() || "http://127.0.0.1:3041";
  try {
    new URL(appUrl);
  } catch {
    errors.push("NEXT_PUBLIC_APP_URL must be an absolute URL.");
  }

  const redeemWindowSeconds = parseInteger(
    env.BUILDER_RUNTIME_REDEEM_WINDOW_SECONDS,
    60,
    10,
    3_600,
    "BUILDER_RUNTIME_REDEEM_WINDOW_SECONDS",
    errors,
  );
  const redeemClientAttemptLimit = parseInteger(
    env.BUILDER_RUNTIME_REDEEM_CLIENT_ATTEMPT_LIMIT,
    20,
    1,
    1_000,
    "BUILDER_RUNTIME_REDEEM_CLIENT_ATTEMPT_LIMIT",
    errors,
  );
  const redeemGlobalAttemptLimit = parseInteger(
    env.BUILDER_RUNTIME_REDEEM_GLOBAL_ATTEMPT_LIMIT,
    100,
    1,
    10_000,
    "BUILDER_RUNTIME_REDEEM_GLOBAL_ATTEMPT_LIMIT",
    errors,
  );
  if (redeemGlobalAttemptLimit < redeemClientAttemptLimit) {
    errors.push(
      "BUILDER_RUNTIME_REDEEM_GLOBAL_ATTEMPT_LIMIT must be at least BUILDER_RUNTIME_REDEEM_CLIENT_ATTEMPT_LIMIT.",
    );
  }
  const trustProxyHeaders = env.BUILDER_RUNTIME_TRUST_PROXY_HEADERS === "1";

  const storeHostId = env.BUILDER_RUNTIME_STORE_HOST_ID?.trim();
  if (storeHostId && storeHostId.length > 255) {
    errors.push("BUILDER_RUNTIME_STORE_HOST_ID must be at most 255 characters.");
  }

  if (errors.length > 0) throw new BuilderRuntimeConfigurationError(errors);

  return {
    mode,
    storeDir:
      mode === "invite" && rawStore ? path.resolve(process.cwd(), rawStore) : null,
    sessionTtlSeconds,
    cookieName: BUILDER_SESSION_COOKIE,
    secureCookies: !isLocalUrl(appUrl),
    appUrl,
    testGenerationDelayMs,
    providerTimeoutMs,
    testProvider,
    testProviderCostMicros,
    limits,
    redeemWindowSeconds,
    redeemClientAttemptLimit,
    redeemGlobalAttemptLimit,
    trustProxyHeaders,
  };
}

export async function assertBuilderRuntimeStartupConfiguration(
  env: Record<string, string | undefined> = process.env,
): Promise<BuilderRuntimeConfig> {
  const config = readBuilderRuntimeConfig(env);
  if (config.mode === "invite" && config.storeDir) {
    if (!(await builderStoreIsWritable(config.storeDir))) {
      throw new BuilderRuntimeConfigurationError([
        `Builder identity storage is not writable at ${config.storeDir}.`,
      ]);
    }
  }
  return config;
}
