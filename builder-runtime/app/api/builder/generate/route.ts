import { readBoundedJsonBody } from "@/lib/campaign-lab/generation/request-body";
import {
  BUILDER_GENERATION_MAX_BODY_BYTES,
  parseBuilderGenerationRequest,
  runBuilderGeneration,
} from "@/lib/builder/generation";
import type { BuilderGenerationResponse } from "@/lib/builder/generation";

import { runLimitedBuilderGeneration } from "@builder/lib/generation-limits";
import type { BuilderLimitedGenerationFailure } from "@builder/lib/generation-limits";
import {
  BUILDER_SUBJECT_HEADER,
  lookupBuilderSessionRequest,
} from "@builder/lib/session";
import { isSameOriginRequest } from "@builder/lib/request-origin";
import { createBuilderTestProvider } from "@builder/lib/test-provider";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SESSION_CHANGED_MESSAGE = "Builder session changed.";

function headers(subjectId?: string): HeadersInit {
  return {
    "Cache-Control": "no-store",
    "X-Robots-Tag": "noindex, nofollow",
    ...(subjectId ? { "X-Builder-Subject": subjectId } : {}),
  };
}

function sessionChangedResponse(subjectId: string): Response {
  return Response.json(
    { ok: false, error: SESSION_CHANGED_MESSAGE },
    { status: 409, headers: headers(subjectId) },
  );
}

function sessionEndedResponse(subjectId: string): Response {
  return Response.json(
    {
      ok: false,
      error: "session_inactive",
      code: "session_changed",
      message:
        "Your builder session ended during generation. The result was discarded.",
    },
    { status: 401, headers: headers(subjectId) },
  );
}

function limitResponse(
  failure: BuilderLimitedGenerationFailure,
  subjectId: string,
): Response {
  const status =
    failure.code === "accounting_unavailable"
      ? 503
      : failure.code === "session_inactive"
        ? 401
        : failure.code === "invalid_request"
          ? 400
          : failure.code === "cancelled"
            ? 408
            : failure.code === "duplicate"
              ? 409
              : 429;
  const error =
    failure.code === "accounting_unavailable"
      ? "accounting_unavailable"
      : failure.code === "session_inactive"
        ? "session_inactive"
        : failure.code === "invalid_request"
          ? "invalid_request"
          : failure.code === "cancelled"
            ? "generation_cancelled"
            : failure.code === "duplicate"
              ? "request_already_submitted"
              : "generation_limit";
  const responseHeaders = new Headers(headers(subjectId));
  if (failure.retryAfterSeconds !== null) {
    responseHeaders.set("Retry-After", String(failure.retryAfterSeconds));
  }
  return Response.json(
    {
      ok: false,
      error,
      code: failure.code,
      message: failure.message,
      retryAfterSeconds: failure.retryAfterSeconds,
    },
    { status, headers: responseHeaders },
  );
}

function abortableDelay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new Error("Generation cancelled."));
      return;
    }
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, ms);
    const abort = () => {
      clearTimeout(timer);
      reject(new Error("Generation cancelled."));
    };
    signal.addEventListener("abort", abort, { once: true });
  });
}

export async function POST(request: Request) {
  const lookup = await lookupBuilderSessionRequest(request);
  if (lookup.status === "unavailable") {
    return Response.json(
      { ok: false, error: "Builder access is unavailable." },
      { status: 503, headers: headers() },
    );
  }
  if (lookup.status !== "active") {
    return Response.json(
      { ok: false, error: "Not found." },
      { status: 404, headers: headers() },
    );
  }
  if (!isSameOriginRequest(request, lookup.config)) {
    return new Response(null, { status: 403, headers: headers() });
  }
  if (request.headers.get(BUILDER_SUBJECT_HEADER) !== lookup.subject.id) {
    return sessionChangedResponse(lookup.subject.id);
  }

  const bounded = await readBoundedJsonBody(
    request,
    BUILDER_GENERATION_MAX_BODY_BYTES,
  );
  if (!bounded.ok) {
    return Response.json(
      { ok: false, message: bounded.message },
      { status: bounded.status, headers: headers(lookup.subject.id) },
    );
  }

  const parsed = parseBuilderGenerationRequest(bounded.value);
  if (!parsed.ok) {
    return Response.json(
      {
        ok: false,
        message: parsed.message,
        ...(parsed.issues ? { issues: parsed.issues } : {}),
        ...(parsed.requestId ? { requestId: parsed.requestId } : {}),
      },
      { status: parsed.status, headers: headers(lookup.subject.id) },
    );
  }

  const sessionId = lookup.session.id;
  const subjectId = lookup.subject.id;
  const limited = await runLimitedBuilderGeneration({
    config: lookup.config,
    subjectId,
    sessionId,
    requestKey: parsed.requestId,
    signal: request.signal,
    beforeDispatch: async (signal) => {
      if (lookup.config.testGenerationDelayMs > 0) {
        await abortableDelay(lookup.config.testGenerationDelayMs, signal);
      }
    },
    generate: async (signal) => {
      let dispatched = false;
      const baseProvider =
        lookup.config.testProvider === "none"
          ? null
          : createBuilderTestProvider(lookup.config.testProvider);
      const provider = baseProvider
        ? {
            ...baseProvider,
            generate: async (...args: Parameters<typeof baseProvider.generate>) => {
              dispatched = true;
              return baseProvider.generate(...args);
            },
          }
        : undefined;

      try {
        const result: BuilderGenerationResponse = await runBuilderGeneration(
          parsed,
          {
            ...(provider ? { provider } : {}),
            signal,
            timeoutMs: lookup.config.providerTimeoutMs,
          },
        );
        return {
          result,
          providerDispatched: dispatched,
          actualCostMicros:
            result.ok && result.generation.status === "generated"
              ? lookup.config.testProviderCostMicros
              : undefined,
        };
      } catch (error) {
        return {
          result: null,
          providerDispatched: dispatched,
          error,
        };
      }
    },
  });

  if (!limited.ok) {
    return limitResponse(limited.failure, subjectId);
  }

  const after = await lookupBuilderSessionRequest(request);
  if (
    after.status !== "active" ||
    after.session.id !== sessionId ||
    after.subject.id !== subjectId
  ) {
    return sessionEndedResponse(subjectId);
  }

  const response = Response.json(limited.result, {
    headers: headers(subjectId),
  });
  return response;
}
