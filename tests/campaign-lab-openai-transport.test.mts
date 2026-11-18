import assert from "node:assert/strict";
import test from "node:test";
import type OpenAI from "openai";

import {
  GenerationProviderError,
  OpenAIGenerationTransport,
} from "../src/lib/campaign-lab/generation/openai-transport.ts";
import {
  accountProviderUsage,
  providerCost,
} from "../src/lib/campaign-lab/generation/provider-accounting.ts";
import {
  shouldStopAfterFailure,
} from "../src/lib/campaign-lab/generation/provider-diagnostics.ts";
import { runCampaignGeneration } from "../src/lib/campaign-lab/generation/service.ts";
import {
  CAMPAIGN_FIXTURES,
  createFormValues,
} from "../src/lib/campaign-lab/fixtures.ts";
import type {
  CampaignGenerationProvider,
  GenerationRequest,
} from "../src/lib/campaign-lab/generation/types.ts";

const PRICING = { inputPerMillionTokens: 0.15, outputPerMillionTokens: 0.6 };
const VALID_PROPOSAL = {
  angle: "offer-led",
  layout: "offer-led-one-photo",
  sections: ["hero", "hero-facts", "close"],
  factIds: ["capacity", "closure"],
};

function fakeClient(create: (body: unknown, options: unknown) => Promise<unknown>): OpenAI {
  return {
    chat: {
      completions: {
        create,
      },
    },
  } as unknown as OpenAI;
}

function provider(transport: OpenAIGenerationTransport): CampaignGenerationProvider {
  return {
    id: "openai",
    label: "OpenAI",
    model: transport.model,
    async generate(request, options) {
      return (await transport.generate(request, options)).value;
    },
  };
}

function sparseInput() {
  const fixture = CAMPAIGN_FIXTURES.sparse;
  return {
    fixtureId: "sparse" as const,
    values: createFormValues(fixture),
  };
}

async function capturedSparseRequest(): Promise<GenerationRequest> {
  let captured: GenerationRequest | null = null;
  const result = await runCampaignGeneration(sparseInput(), {
    provider: {
      id: "capture",
      label: "Capture",
      async generate(request) {
        captured = request;
        return VALID_PROPOSAL;
      },
    },
  });
  assert.equal(result.ok, true);
  assert.ok(captured);
  return captured!;
}

function successResponse(usage = true) {
  return {
    _request_id: "req_success",
    choices: [
      {
        message: { content: JSON.stringify(VALID_PROPOSAL) },
        finish_reason: "stop",
      },
    ],
    ...(usage
      ? {
          usage: {
            prompt_tokens: 120,
            completion_tokens: 24,
            total_tokens: 144,
            prompt_tokens_details: { cached_tokens: 0 },
          },
        }
      : {}),
  };
}

function sdkError(properties: Record<string, unknown>) {
  return Object.assign(new Error(String(properties.message ?? "provider error")), properties);
}

test("successful transport records usage, request identity, settings, and no retry", async () => {
  let calls = 0;
  const seenBody: Record<string, unknown> = {};
  const seenOptions: Record<string, unknown> = {};
  const transport = new OpenAIGenerationTransport(
    fakeClient(async (body, options) => {
      calls += 1;
      Object.assign(seenBody, body as Record<string, unknown>);
      Object.assign(seenOptions, options as Record<string, unknown>);
      return successResponse();
    }),
    "gpt-test",
  );
  const captured: GenerationRequest[] = [];
  const result = await runCampaignGeneration(sparseInput(), {
    provider: {
      ...provider(transport),
      async generate(request, options) {
        captured.push(request);
        return provider(transport).generate(request, options);
      },
    },
    timeoutMs: 1234,
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.generation.status, "generated");
    assert.equal(result.generation.providerMode, "model");
  }
  assert.equal(calls, 1);
  assert.equal(captured.length, 1);
  assert.equal(seenBody?.model, "gpt-test");
  assert.equal(seenBody?.max_tokens, 300);
  assert.equal(seenBody?.temperature, 0.2);
  assert.deepEqual(seenBody?.response_format, { type: "json_object" });
  assert.equal(seenOptions?.timeout, 1234);
  assert.equal(seenOptions?.maxRetries, 0);
  assert.ok(seenOptions?.signal instanceof AbortSignal);
});

test("transport success exposes usage without inventing a request failure", async () => {
  const transport = new OpenAIGenerationTransport(
    fakeClient(async () => successResponse()),
    "gpt-test",
  );
  const request = await capturedSparseRequest();
  const outcome = await transport.generate(request, {
    signal: new AbortController().signal,
    timeoutMs: 100,
  });
  assert.deepEqual(outcome.usage, {
    promptTokens: 120,
    completionTokens: 24,
    totalTokens: 144,
    cachedPromptTokens: 0,
  });
  assert.equal(outcome.providerRequestId, "req_success");
  assert.equal(outcome.transport, "openai-chat-completions");
});

test("invalid output becomes a preserved invalid-output diagnostic", async () => {
  let calls = 0;
  const transport = new OpenAIGenerationTransport(
    fakeClient(async () => {
      calls += 1;
      return {
        choices: [{ message: { content: "not json" }, finish_reason: "stop" }],
      };
    }),
    "gpt-test",
  );
  const result = await runCampaignGeneration(sparseInput(), {
    provider: provider(transport),
  });
  assert.equal(calls, 1);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.generation.status, "fallback");
  assert.equal(result.generation.code, "invalid");
  assert.equal(result.generation.diagnostics?.category, "invalid-output");
  assert.match(result.generation.message ?? "", /could not be read/i);
});

test("authentication failures keep sanitized diagnostics through fallback and stop the run", async () => {
  const secret = "sk-proj-supersecret123456789";
  let calls = 0;
  const transport = new OpenAIGenerationTransport(
    fakeClient(async () => {
      calls += 1;
      throw sdkError({
        message: `Incorrect API key provided: ${secret}. Authorization: Bearer ${secret}. api_key=${secret}`,
        status: 401,
        code: "invalid_api_key",
        type: "invalid_request_error",
        request_id: "req_auth",
        headers: {
          authorization: `Bearer ${secret}`,
          "x-request-id": "req_auth_header",
        },
      });
    }),
    "gpt-test",
  );
  const result = await runCampaignGeneration(sparseInput(), {
    provider: provider(transport),
  });
  assert.equal(calls, 1);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.generation.status, "fallback");
  assert.equal(result.generation.code, "provider-error");
  const diagnostics = result.generation.diagnostics;
  assert.equal(diagnostics?.category, "authentication");
  assert.equal(diagnostics?.httpStatus, 401);
  assert.equal(diagnostics?.providerCode, "invalid_api_key");
  assert.equal(diagnostics?.providerType, "invalid_request_error");
  assert.equal(diagnostics?.providerRequestId, "req_auth");
  assert.ok(!diagnostics?.message.includes(secret));
  assert.ok(!JSON.stringify(diagnostics).includes(secret));
  assert.equal(shouldStopAfterFailure(diagnostics), true);
});

test("quota and rate-limit failures are distinguished", async () => {
  for (const [code, type, expected, stop] of [
    ["insufficient_quota", "insufficient_quota", "quota", true],
    ["rate_limit_exceeded", "requests", "rate-limit", false],
  ] as const) {
    const transport = new OpenAIGenerationTransport(
      fakeClient(async () => {
        throw sdkError({
          message: `Rejected with ${code}`,
          status: 429,
          code,
          type,
        });
      }),
      "gpt-test",
    );
    const outcome = transport.generate(
      await capturedSparseRequest(),
      { signal: new AbortController().signal, timeoutMs: 100 },
    );
    await assert.rejects(outcome, (error: unknown) => {
      assert.ok(error instanceof GenerationProviderError);
      assert.equal(error.diagnostics.category, expected);
      assert.equal(error.diagnostics.httpStatus, 429);
      assert.equal(error.diagnostics.providerCode, code);
      assert.equal(shouldStopAfterFailure(error.diagnostics), stop);
      return true;
    });
  }
});

test("invalid parameters preserve the parameter name and stop configuration failures", async () => {
  const transport = new OpenAIGenerationTransport(
    fakeClient(async () => {
      throw sdkError({
        message: "Unsupported parameter: 'max_tokens' is not supported with this model.",
        status: 400,
        code: "invalid_parameter",
        type: "invalid_request_error",
        param: "max_tokens",
      });
    }),
    "gpt-test",
  );
  await assert.rejects(
    transport.generate(
      await capturedSparseRequest(),
      { signal: new AbortController().signal, timeoutMs: 100 },
    ),
    (error: unknown) => {
      assert.ok(error instanceof GenerationProviderError);
      assert.equal(error.diagnostics.category, "configuration");
      assert.equal(error.diagnostics.httpStatus, 400);
      assert.equal(error.diagnostics.parameter, "max_tokens");
      assert.equal(shouldStopAfterFailure(error.diagnostics), true);
      return true;
    },
  );
});

test("connection and timeout failures keep categories without inventing status", async () => {
  for (const [properties, expected] of [
    [
      {
        name: "APIConnectionError",
        message: "Connection error.",
        code: "ECONNRESET",
      },
      "connection",
    ],
    [
      {
        name: "APIConnectionTimeoutError",
        message: "Request timed out.",
      },
      "timeout",
    ],
  ] as const) {
    const transport = new OpenAIGenerationTransport(
      fakeClient(async () => {
        throw sdkError(properties);
      }),
      "gpt-test",
    );
    await assert.rejects(
      transport.generate(
        await capturedSparseRequest(),
        { signal: new AbortController().signal, timeoutMs: 100 },
      ),
      (error: unknown) => {
        assert.ok(error instanceof GenerationProviderError);
        assert.equal(error.diagnostics.category, expected);
        assert.equal(error.diagnostics.httpStatus, null);
        assert.equal(shouldStopAfterFailure(error.diagnostics), false);
        return true;
      },
    );
  }
});

test("abort signal produces a timeout diagnostic and the SDK is called once", async () => {
  let calls = 0;
  const controller = new AbortController();
  controller.abort();
  const transport = new OpenAIGenerationTransport(
    fakeClient(async () => {
      calls += 1;
      throw sdkError({ name: "AbortError", message: "The operation was aborted." });
    }),
    "gpt-test",
  );
  await assert.rejects(
    transport.generate(
      await capturedSparseRequest(),
      { signal: controller.signal, timeoutMs: 100 },
    ),
    (error: unknown) => {
      assert.ok(error instanceof GenerationProviderError);
      assert.equal(error.diagnostics.category, "timeout");
      return true;
    },
  );
  assert.equal(calls, 1);
});

test("missing usage stays unknown instead of zero cost", () => {
  const unknown = accountProviderUsage(null, PRICING, 0.002);
  assert.deepEqual(unknown, {
    status: "unknown",
    promptTokens: null,
    completionTokens: null,
    costUsd: null,
    reservedExposureUsd: 0.002,
  });

  const known = accountProviderUsage(
    { promptTokens: 1000, completionTokens: 200 },
    PRICING,
    0.002,
  );
  assert.equal(known.status, "known");
  if (known.status === "known") {
    assert.equal(
      known.costUsd,
      providerCost(
        { promptTokens: 1000, completionTokens: 200 },
        PRICING,
      ),
    );
    assert.equal(known.reservedExposureUsd, 0);
  }
});
test("service timeout fallback includes a timeout diagnostic", async () => {
  const result = await runCampaignGeneration(sparseInput(), {
    timeoutMs: 30,
    provider: {
      id: "openai",
      label: "OpenAI",
      async generate() {
        await new Promise((resolve) => setTimeout(resolve, 100));
        return VALID_PROPOSAL;
      },
    },
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.generation.status, "fallback");
  assert.equal(result.generation.code, "timeout");
  assert.equal(result.generation.diagnostics?.category, "timeout");
});
test("credit balance exhaustion is classified as quota even with a 429 status", async () => {
  const transport = new OpenAIGenerationTransport(
    fakeClient(async () => {
      throw sdkError({
        message: "429 You have no credits remaining. Add credits to continue using the API.",
        status: 429,
        code: "credit_balance_exhausted",
        type: "insufficient_quota",
      });
    }),
    "gpt-test",
  );
  await assert.rejects(
    transport.generate(await capturedSparseRequest(), {
      signal: new AbortController().signal,
      timeoutMs: 100,
    }),
    (error: unknown) => {
      assert.ok(error instanceof GenerationProviderError);
      assert.equal(error.diagnostics.category, "quota");
      assert.equal(error.diagnostics.httpStatus, 429);
      assert.equal(error.diagnostics.providerCode, "credit_balance_exhausted");
      assert.equal(shouldStopAfterFailure(error.diagnostics), true);
      return true;
    },
  );
});
