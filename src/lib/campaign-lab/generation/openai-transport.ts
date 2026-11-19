import type OpenAI from "openai";

import { OPENAI_MODEL } from "../../openai-config.ts";
import { buildOpenAIMessages } from "./prompt.ts";
import {
  invalidOutputDiagnostics,
  providerDiagnosticsFromError,
  sanitizeDiagnosticText,
} from "./provider-diagnostics.ts";
import type { ProviderDiagnostics } from "./provider-diagnostics.ts";
import type {
  GenerationRequest,
  ProviderCallOptions,
} from "./types.ts";

const MAX_RAW_CONTENT_LENGTH = 8_000;

export type OpenAITransportUsage = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number | null;
  cachedPromptTokens: number | null;
};

export type OpenAITransportTelemetry = {
  usage: OpenAITransportUsage | null;
  finishReason: string | null;
  providerRequestId: string | null;
  latencyMs: number;
  model: string;
  transport: "openai-chat-completions";
  /**
   * Bounded private response content for evaluation evidence. It must never be
   * copied into customer-facing diagnostics or fallback metadata.
   */
  rawContent: string;
};

export type OpenAITransportOutcome = OpenAITransportTelemetry & {
  value: unknown;
};

const invalidOutputTelemetry = new WeakMap<
  InvalidGenerationOutputError,
  OpenAITransportTelemetry
>();

export class InvalidGenerationOutputError extends Error {
  readonly diagnostics: ProviderDiagnostics;

  constructor(message: string, telemetry: OpenAITransportTelemetry) {
    super(message);
    this.name = "InvalidGenerationOutputError";
    // Keep raw response evidence out of the error's enumerable surface so a
    // generic logger cannot serialize it into customer-facing output.
    invalidOutputTelemetry.set(this, telemetry);
    this.diagnostics = invalidOutputDiagnostics(
      message,
      telemetry.providerRequestId,
    );
  }
}

/**
 * Returns private response telemetry retained for an invalid-output error.
 * Evaluation callers use this to account for usage and preserve evidence even
 * though the public fallback result deliberately omits the raw response.
 */
export function openAITransportTelemetryFromError(
  error: unknown,
): OpenAITransportTelemetry | null {
  if (!(error instanceof InvalidGenerationOutputError)) return null;
  return invalidOutputTelemetry.get(error) ?? null;
}

/**
 * Shared capture path for evaluation callers. Telemetry is reported for both
 * parsed and unparseable responses, then the original error still propagates so
 * the service can convert it into the generic customer fallback.
 */
export async function generateWithTelemetry(
  transport: OpenAIGenerationTransport,
  request: GenerationRequest,
  options: ProviderCallOptions,
  capture: (telemetry: OpenAITransportTelemetry) => void,
): Promise<unknown> {
  try {
    const outcome = await transport.generate(request, options);
    capture(outcome);
    return outcome.value;
  } catch (error) {
    const telemetry = openAITransportTelemetryFromError(error);
    if (telemetry) capture(telemetry);
    throw error;
  }
}

export class GenerationProviderError extends Error {
  readonly diagnostics: ProviderDiagnostics;

  constructor(diagnostics: ProviderDiagnostics) {
    super("The generation provider request failed.");
    this.name = "GenerationProviderError";
    this.diagnostics = diagnostics;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function usageFromResponse(value: unknown): OpenAITransportUsage | null {
  if (!isRecord(value)) return null;
  const promptTokens = numberOrNull(value.prompt_tokens);
  const completionTokens = numberOrNull(value.completion_tokens);
  if (promptTokens === null || completionTokens === null) return null;
  const details = isRecord(value.prompt_tokens_details)
    ? value.prompt_tokens_details
    : null;
  return {
    promptTokens,
    completionTokens,
    totalTokens: numberOrNull(value.total_tokens),
    cachedPromptTokens: details
      ? numberOrNull(details.cached_tokens)
      : null,
  };
}

function requestIdFromResponse(response: Record<string, unknown>): string | null {
  const direct = response._request_id ?? response.request_id;
  if (typeof direct === "string" && direct.trim()) {
    return sanitizeDiagnosticText(direct.trim(), 120);
  }
  const headers = response.headers;
  if (isRecord(headers)) {
    const header = headers["x-request-id"];
    if (typeof header === "string" && header.trim()) {
      return sanitizeDiagnosticText(header.trim(), 120);
    }
  }
  return null;
}

/**
 * Shared OpenAI chat-completions transport used by the production provider and
 * the evaluation runner. Request parameters, timeout, cancellation, retries, and
 * output parsing live here so the two paths cannot drift.
 */
export class OpenAIGenerationTransport {
  readonly model: string;
  private readonly client: OpenAI;

  constructor(client: OpenAI, model: string = OPENAI_MODEL) {
    this.client = client;
    this.model = model;
  }

  async generate(
    request: GenerationRequest,
    options: ProviderCallOptions,
  ): Promise<OpenAITransportOutcome> {
    const startedAt = Date.now();
    let response: Awaited<
      ReturnType<OpenAI["chat"]["completions"]["create"]>
    >;
    try {
      response = await this.client.chat.completions.create(
        {
          model: this.model,
          messages: buildOpenAIMessages(request),
          response_format: { type: "json_object" },
          max_tokens: 300,
          temperature: 0.2,
        },
        {
          timeout: Math.max(1, options.timeoutMs),
          maxRetries: 0,
          signal: options.signal,
        },
      );
    } catch (error) {
      const diagnostics = providerDiagnosticsFromError(error);
      if (options.signal.aborted) {
        diagnostics.category = "timeout";
        diagnostics.message = "The provider call was aborted.";
      }
      throw new GenerationProviderError(diagnostics);
    }

    const latencyMs = Date.now() - startedAt;
    const responseRecord = isRecord(response) ? response : {};
    const choices = Array.isArray(response.choices) ? response.choices : [];
    const firstChoice = isRecord(choices[0]) ? choices[0] : null;
    const message =
      firstChoice && isRecord(firstChoice.message)
        ? firstChoice.message
        : null;
    const content =
      message && typeof message.content === "string"
        ? message.content.trim()
        : "";

    // Capture response evidence before any parsing decision. Invalid or empty
    // model output must not discard usage, finish reason, or request identity.
    const telemetry: OpenAITransportTelemetry = {
      usage: usageFromResponse(response.usage),
      finishReason:
        firstChoice && typeof firstChoice.finish_reason === "string"
          ? firstChoice.finish_reason
          : null,
      providerRequestId: requestIdFromResponse(responseRecord),
      latencyMs,
      model: this.model,
      transport: "openai-chat-completions",
      rawContent: content.slice(0, MAX_RAW_CONTENT_LENGTH),
    };

    if (!content) {
      throw new InvalidGenerationOutputError(
        "The model returned an empty response.",
        telemetry,
      );
    }

    let value: unknown;
    try {
      value = JSON.parse(content) as unknown;
    } catch {
      throw new InvalidGenerationOutputError(
        "The model response was not valid JSON.",
        telemetry,
      );
    }

    return {
      ...telemetry,
      value,
    };
  }
}
