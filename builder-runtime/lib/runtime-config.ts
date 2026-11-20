import path from "node:path";

import { validateBuilderEnvironment } from "../../src/lib/builder/config.ts";

import { builderStoreIsWritable } from "./identity-store.ts";

export type BuilderRuntimeMode = "closed" | "invite";

export type BuilderRuntimeConfig = Readonly<{
  mode: BuilderRuntimeMode;
  storeDir: string | null;
  sessionTtlSeconds: number;
  cookieName: string;
  secureCookies: boolean;
  appUrl: string;
  testGenerationDelayMs: number;
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

  const appUrl = env.NEXT_PUBLIC_APP_URL?.trim() || "http://127.0.0.1:3041";
  try {
    new URL(appUrl);
  } catch {
    errors.push("NEXT_PUBLIC_APP_URL must be an absolute URL.");
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
