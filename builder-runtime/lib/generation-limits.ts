import type { BuilderGenerationResponse } from "../../src/lib/builder/generation.ts";

import type { BuilderRuntimeConfig } from "./runtime-config.ts";
import {
  readBuilderAdmissionStatus,
  type BuilderUsageRecord,
} from "./identity-store.ts";
import {
  logBuilderGenerationSignal,
  builderSubjectRef,
} from "./operational-signals.ts";
import {
  reserveBuilderUsage,
  settleBuilderUsage,
  type BuilderUsageDenialCode,
} from "./usage-ledger.ts";

export type BuilderGenerationExecution =
  | {
      result: BuilderGenerationResponse;
      providerDispatched: boolean;
      actualCostMicros?: number;
    }
  | {
      result: null;
      providerDispatched: boolean;
      error: unknown;
    };

export type BuilderLimitedGenerationFailure =
  | {
      code:
        | "accounting_unavailable"
        | "cancelled"
        | "invalid_request"
        | "session_inactive";
      message: string;
      retryAfterSeconds: null;
    }
  | {
      code: BuilderUsageDenialCode;
      message: string;
      retryAfterSeconds: number | null;
    };

export type BuilderLimitedGenerationResult =
  | {
      ok: true;
      result: BuilderGenerationResponse;
      usage: BuilderUsageRecord;
    }
  | {
      ok: false;
      failure: BuilderLimitedGenerationFailure;
    };

const DENIAL_MESSAGES: Record<BuilderUsageDenialCode, string> = {
  session_inactive:
    "Your builder session ended before generation started. No provider request was made.",
  duplicate:
    "This generation request was already submitted. Start a new generation or wait for the earlier attempt to settle.",
  subject_requests:
    "You have reached the generation request limit for this private beta period. Try again after the retry window.",
  global_requests:
    "The private beta has reached its shared generation request limit. Try again after the retry window.",
  subject_concurrency:
    "Another generation is already running for this account. Wait for it to finish before starting another.",
  global_concurrency:
    "The private beta is currently handling the maximum number of generations. Try again shortly.",
  subject_spend:
    "This account has reached its private beta generation spend limit. Contact the operator before starting another generation.",
  global_spend:
    "The private beta generation budget is exhausted. Contact the operator before starting another generation.",
};

function failure(
  code: BuilderUsageDenialCode,
  retryAfterSeconds: number | null,
): BuilderLimitedGenerationFailure {
  return {
    code,
    message: DENIAL_MESSAGES[code],
    retryAfterSeconds,
  };
}

function classifyExecution(
  execution: BuilderGenerationExecution,
): {
  outcome: "succeeded" | "failed" | "unknown";
  costMicros: number | null;
  reason: string;
} {
  if (!execution.providerDispatched) {
    return { outcome: "failed", costMicros: 0, reason: "not_dispatched" };
  }
  if (execution.result === null) {
    return { outcome: "unknown", costMicros: null, reason: "provider_threw" };
  }
  if (!execution.result.ok) {
    return { outcome: "failed", costMicros: 0, reason: "invalid_brief" };
  }
  const { generation } = execution.result;
  if (generation.status === "generated") {
    return {
      outcome: "succeeded",
      costMicros: execution.actualCostMicros ?? 0,
      reason: "generated",
    };
  }
  if (generation.code === "unavailable") {
    return { outcome: "failed", costMicros: 0, reason: "provider_unavailable" };
  }
  return {
    outcome: "unknown",
    costMicros: null,
    reason: generation.code ?? "ambiguous",
  };
}

export async function runLimitedBuilderGeneration(input: {
  config: BuilderRuntimeConfig;
  subjectId: string;
  sessionId: string;
  requestKey: string;
  signal: AbortSignal;
  /** Test-only bounded delay, executed before the final admission recheck. */
  beforeDispatch?: (signal: AbortSignal) => Promise<void>;
  generate: (signal: AbortSignal) => Promise<BuilderGenerationExecution>;
}): Promise<BuilderLimitedGenerationResult> {
  const storeDir = input.config.storeDir;
  if (!storeDir) {
    return {
      ok: false,
      failure: {
        code: "accounting_unavailable",
        message:
          "Generation is unavailable because usage accounting is not configured. No provider request was made.",
        retryAfterSeconds: null,
      },
    };
  }
  if (input.signal.aborted) {
    return {
      ok: false,
      failure: {
        code: "cancelled",
        message: "The generation request was cancelled before it started.",
        retryAfterSeconds: null,
      },
    };
  }

  const requestKey = input.requestKey.trim().slice(0, 160);
  if (!requestKey) {
    return {
      ok: false,
      failure: {
        code: "invalid_request",
        message: "A valid generation request id is required.",
        retryAfterSeconds: null,
      },
    };
  }

  let reservation;
  try {
    reservation = await reserveBuilderUsage({
      storeDir,
      subjectId: input.subjectId,
      sessionId: input.sessionId,
      requestKey,
      limits: input.config.limits,
    });
  } catch {
    logBuilderGenerationSignal({
      event: "settlement_unavailable",
      subjectRef: builderSubjectRef(input.subjectId),
      code: "reservation_store_unavailable",
    });
    return {
      ok: false,
      failure: {
        code: "accounting_unavailable",
        message:
          "Generation is temporarily unavailable because usage accounting cannot be verified. No provider request was made.",
        retryAfterSeconds: null,
      },
    };
  }

  if (!reservation.ok) {
    logBuilderGenerationSignal({
      event: "reservation_denied",
      subjectRef: builderSubjectRef(input.subjectId),
      code: reservation.code,
      retryAfterSeconds: reservation.retryAfterSeconds,
    });
    return { ok: false, failure: failure(reservation.code, reservation.retryAfterSeconds) };
  }

  logBuilderGenerationSignal({
    event: "reservation_created",
    subjectRef: builderSubjectRef(input.subjectId),
    usageId: reservation.record.id,
    costMicros: reservation.record.reservedCostMicros ?? undefined,
  });

  const releaseBeforeDispatch = async (reason: string): Promise<boolean> => {
    try {
      await settleBuilderUsage({
        storeDir,
        usageId: reservation.record.id,
        outcome: "failed",
        reason,
      });
      return true;
    } catch {
      return false;
    }
  };

  if (input.signal.aborted) {
    if (!(await releaseBeforeDispatch("cancelled_before_dispatch"))) {
      return {
        ok: false,
        failure: {
          code: "accounting_unavailable",
          message:
            "The generation was cancelled, but usage accounting could not record the release. No provider request was made.",
          retryAfterSeconds: null,
        },
      };
    }
    logBuilderGenerationSignal({
      event: "cancelled",
      subjectRef: builderSubjectRef(input.subjectId),
      usageId: reservation.record.id,
      code: "before_dispatch",
    });
    return {
      ok: false,
      failure: {
        code: "cancelled",
        message: "The generation request was cancelled before dispatch.",
        retryAfterSeconds: null,
      },
    };
  }

  if (input.beforeDispatch) {
    try {
      await input.beforeDispatch(input.signal);
    } catch {
      if (!(await releaseBeforeDispatch("cancelled_before_dispatch"))) {
        return {
          ok: false,
          failure: {
            code: "accounting_unavailable",
            message:
              "The generation was cancelled, but usage accounting could not record the release. No provider request was made.",
            retryAfterSeconds: null,
          },
        };
      }
      return {
        ok: false,
        failure: {
          code: "cancelled",
          message: "The generation request was cancelled before dispatch.",
          retryAfterSeconds: null,
        },
      };
    }
  }

  const admission = await readBuilderAdmissionStatus({
    storeDir,
    subjectId: input.subjectId,
    sessionId: input.sessionId,
  });
  if (admission === "unavailable") {
    logBuilderGenerationSignal({
      event: "settlement_unavailable",
      subjectRef: builderSubjectRef(input.subjectId),
      usageId: reservation.record.id,
      code: "admission_recheck_unavailable",
    });
    return {
      ok: false,
      failure: {
        code: "accounting_unavailable",
        message:
          "Generation is unavailable because the builder session could not be verified before dispatch. The reservation remains held and no provider request was made.",
        retryAfterSeconds: null,
      },
    };
  }
  if (admission === "inactive") {
    if (!(await releaseBeforeDispatch("session_revoked_before_dispatch"))) {
      return {
        ok: false,
        failure: {
          code: "accounting_unavailable",
          message:
            "The builder session ended before dispatch, but usage accounting could not record the release. No provider request was made.",
          retryAfterSeconds: null,
        },
      };
    }
    logBuilderGenerationSignal({
      event: "cancelled",
      subjectRef: builderSubjectRef(input.subjectId),
      usageId: reservation.record.id,
      code: "session_inactive_before_dispatch",
    });
    return {
      ok: false,
      failure: {
        code: "session_inactive",
        message:
          "Your builder session ended before generation started. No provider request was made.",
        retryAfterSeconds: null,
      },
    };
  }

  let execution: BuilderGenerationExecution;
  try {
    execution = await input.generate(input.signal);
  } catch (error) {
    execution = { result: null, providerDispatched: true, error };
  }

  const settlement = classifyExecution(execution);
  try {
    const settled = await settleBuilderUsage({
      storeDir,
      usageId: reservation.record.id,
      outcome: settlement.outcome,
      costMicros: settlement.costMicros,
      reason: input.signal.aborted ? "cancelled_after_dispatch" : settlement.reason,
    });
    logBuilderGenerationSignal({
      event: "settled",
      subjectRef: builderSubjectRef(input.subjectId),
      usageId: settled.record.id,
      outcome: settled.record.state,
      providerDispatched: execution.providerDispatched,
      costMicros: settled.record.costMicros ?? undefined,
    });
    if (execution.result === null) {
      return {
        ok: false,
        failure: {
          code: "accounting_unavailable",
          message:
            "The generation outcome could not be confirmed. The usage reservation remains held while the operator reconciles it.",
          retryAfterSeconds: null,
        },
      };
    }
    return { ok: true, result: execution.result, usage: settled.record };
  } catch {
    logBuilderGenerationSignal({
      event: "settlement_unavailable",
      subjectRef: builderSubjectRef(input.subjectId),
      usageId: reservation.record.id,
      outcome: settlement.outcome,
      providerDispatched: execution.providerDispatched,
    });
    return {
      ok: false,
      failure: {
        code: "accounting_unavailable",
        message:
          "The generation finished, but usage accounting could not be verified. The reservation remains held; do not retry immediately.",
        retryAfterSeconds: null,
      },
    };
  }
}
