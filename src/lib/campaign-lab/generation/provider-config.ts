import type { GenerationEnv } from "./types.ts";

export type LocalTestMode = "success" | "invalid" | "incomplete" | "timeout";

export type ProviderResolution =
  | {
      ok: true;
      id: "local-test" | "openai";
      label: string;
      model?: string;
      mode: LocalTestMode;
    }
  | {
      ok: false;
      id: string;
      label: string;
      reason: string;
    };

const DEFAULT_TIMEOUT_MS = 5_000;
const MIN_TIMEOUT_MS = 50;
const MAX_TIMEOUT_MS = 15_000;

export function resolveGenerationTimeoutMs(
  env: GenerationEnv = process.env,
): number {
  const raw = env.CAMPAIGN_LAB_GENERATION_TIMEOUT_MS?.trim();
  if (!raw) return DEFAULT_TIMEOUT_MS;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return DEFAULT_TIMEOUT_MS;
  return Math.min(MAX_TIMEOUT_MS, Math.max(MIN_TIMEOUT_MS, parsed));
}

function resolveLocalTestMode(env: GenerationEnv): LocalTestMode {
  const raw = env.CAMPAIGN_LAB_GENERATION_TEST_MODE?.trim().toLowerCase();
  if (raw === "invalid" || raw === "incomplete" || raw === "timeout" || raw === "success") return raw;
  return "success";
}

/**
 * Provider selection is deliberately explicit. The default is an offline
 * local test provider, and a paid provider needs three separate opt-ins.
 */
export function resolveGenerationProvider(
  env: GenerationEnv = process.env,
): ProviderResolution {
  const configured = env.CAMPAIGN_LAB_GENERATION_PROVIDER?.trim().toLowerCase();
  const provider = configured || "local-test";

  if (provider === "off" || provider === "none" || provider === "disabled") {
    return {
      ok: false,
      id: "none",
      label: "Generation off",
      reason: "Generation is switched off with CAMPAIGN_LAB_GENERATION_PROVIDER=off.",
    };
  }

  if (provider === "local-test") {
    return {
      ok: true,
      id: "local-test",
      label: "Local test provider",
      mode: resolveLocalTestMode(env),
    };
  }

  if (provider === "openai") {
    const missing: string[] = [];
    if (env.CAMPAIGN_LAB_GENERATION_LIVE !== "true") {
      missing.push("CAMPAIGN_LAB_GENERATION_LIVE=true");
    }
    if (env.OPENAI_ENABLED !== "true") missing.push("OPENAI_ENABLED=true");
    if (!env.OPENAI_API_KEY?.trim()) missing.push("OPENAI_API_KEY");
    if (missing.length > 0) {
      return {
        ok: false,
        id: "openai",
        label: "OpenAI",
        reason: `OpenAI generation requires explicit local configuration: ${missing.join(", ")}.`,
      };
    }
    return {
      ok: true,
      id: "openai",
      label: "OpenAI",
      model: env.CAMPAIGN_LAB_GENERATION_MODEL?.trim() || undefined,
      mode: "success",
    };
  }

  return {
    ok: false,
    id: provider,
    label: provider,
    reason: `Unknown generation provider "${provider}". Use local-test, openai, or off.`,
  };
}
