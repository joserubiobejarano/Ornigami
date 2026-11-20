/**
 * Production builder configuration.
 *
 * This module is intentionally independent of the Campaign Lab environment.
 * The lab is a development-only operator surface; the builder is a separate
 * customer-facing boundary whose access, ownership and budget policies do not
 * exist yet. Until they do, every switch that could open the builder is
 * rejected at startup rather than silently ignored.
 */

export const BUILDER_FIRST_BETA_SCOPE = Object.freeze({
  formats: ["single-product-offer"],
  directions: ["clear", "editorial"],
  compositions: ["direction-default", "product-focus"],
  assetInput: "manual-approved",
  preview: "static",
  approval: "exact-revision-local",
  export: "zip",
  durableProjects: false,
  hostedPublishing: false,
  billing: false,
  customDomains: false,
  publicUrlImport: false,
  advertorial: false,
  motion: false,
} as const);

export const BUILDER_ROUTES = Object.freeze({
  page: "/builder",
  generateApi: "/api/builder/generate",
});

export type BuilderRuntimeConfig = Readonly<{
  /** Access stays closed until builder-specific authorization exists. */
  accessMode: "closed";
  /** No paid provider is configured for the foundation slice. */
  generationProvider: "disabled";
  legacyReputationAuthReused: false;
  legacyReputationBillingReused: false;
  legacyReputationDatabaseReused: false;
}>;

export type BuilderEnvironmentValidation =
  | { ok: true; config: BuilderRuntimeConfig }
  | { ok: false; errors: string[] };

const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);
const OUT_OF_SCOPE_SWITCHES = [
  "BUILDER_BETA_ENABLED",
  "BUILDER_BETA_PUBLISHING",
  "BUILDER_BETA_BILLING",
  "BUILDER_BETA_DURABLE_PROJECTS",
  "BUILDER_BETA_URL_IMPORT",
  "BUILDER_BETA_CUSTOM_DOMAINS",
  "BUILDER_BETA_ADVERTORIAL",
  "BUILDER_BETA_MOTION",
] as const;
const LEGACY_REUSE_SWITCHES = [
  "BUILDER_BETA_LEGACY_AUTH",
  "BUILDER_BETA_LEGACY_BILLING",
  "BUILDER_BETA_LEGACY_DATABASE",
  "BUILDER_BETA_LEGACY_JOBS",
] as const;

function wasEnabled(value: string | undefined): boolean {
  return Boolean(value && TRUE_VALUES.has(value.trim().toLowerCase()));
}

/**
 * Validates the builder environment once at server startup and again before a
 * builder request is served. Invalid configuration fails closed.
 */
export function validateBuilderEnvironment(
  env: Record<string, string | undefined> = process.env,
): BuilderEnvironmentValidation {
  const errors: string[] = [];
  const accessMode = env.BUILDER_BETA_ACCESS_MODE?.trim().toLowerCase();
  if (accessMode && accessMode !== "closed") {
    errors.push(
      `BUILDER_BETA_ACCESS_MODE=${accessMode} is not implemented. Builder-specific authorization must be added before access can open.`,
    );
  }

  const provider = env.BUILDER_GENERATION_PROVIDER?.trim().toLowerCase();
  if (provider && provider !== "disabled") {
    errors.push(
      `BUILDER_GENERATION_PROVIDER=${provider} is not implemented. The foundation slice has no builder provider or budget policy.`,
    );
  }

  for (const key of OUT_OF_SCOPE_SWITCHES) {
    if (wasEnabled(env[key])) {
      errors.push(`${key} is outside the first-beta scope and must remain false.`);
    }
  }
  for (const key of LEGACY_REUSE_SWITCHES) {
    if (wasEnabled(env[key])) {
      errors.push(
        `${key} is not accepted. Reputation authentication, billing, database records and jobs do not establish builder authorization, ownership or budget.`,
      );
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    config: {
      accessMode: "closed",
      generationProvider: "disabled",
      legacyReputationAuthReused: false,
      legacyReputationBillingReused: false,
      legacyReputationDatabaseReused: false,
    },
  };
}

export class BuilderConfigurationError extends Error {
  readonly errors: readonly string[];

  constructor(errors: readonly string[]) {
    super(`Builder configuration is invalid: ${errors.join(" ")}`);
    this.name = "BuilderConfigurationError";
    this.errors = errors;
  }
}

/**
 * Call once from the Node.js instrumentation hook. A process that claims to
 * open unsupported builder behavior must not start and serve requests.
 */
export function assertBuilderStartupConfiguration(
  env: Record<string, string | undefined> = process.env,
): BuilderRuntimeConfig {
  const result = validateBuilderEnvironment(env);
  if (!result.ok) throw new BuilderConfigurationError(result.errors);
  return result.config;
}

export function readBuilderRuntimeConfig(
  env: Record<string, string | undefined> = process.env,
): BuilderRuntimeConfig {
  return assertBuilderStartupConfiguration(env);
}
