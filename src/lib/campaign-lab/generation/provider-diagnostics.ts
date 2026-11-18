export type ProviderFailureCategory =
  | "authentication"
  | "configuration"
  | "quota"
  | "rate-limit"
  | "connection"
  | "timeout"
  | "invalid-output"
  | "provider-error";

export type ProviderDiagnostics = {
  category: ProviderFailureCategory;
  httpStatus: number | null;
  providerCode: string | null;
  providerType: string | null;
  parameter: string | null;
  providerRequestId: string | null;
  /** Bounded, redacted diagnostic text. Never raw headers or environment values. */
  message: string;
};

const MAX_MESSAGE_LENGTH = 500;
const MAX_CODE_LENGTH = 120;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function safeText(value: unknown, maxLength = MAX_MESSAGE_LENGTH): string | null {
  if (typeof value !== "string") return null;
  const compact = value.replace(/\s+/g, " ").trim();
  if (!compact) return null;
  return redactDiagnosticText(compact).slice(0, maxLength);
}

export function redactDiagnosticText(value: string): string {
  return value
    .replace(/sk-[A-Za-z0-9_-]{8,}/g, "[redacted-key]")
    .replace(
      /-----BEGIN [^-]+-----[\s\S]*?-----END [^-]+-----/g,
      "[redacted-key]",
    )
    .replace(/\bBearer\s+[^\s,;]+/gi, "Bearer [redacted]")
    .replace(
      /\b(authorization|api[-_ ]?key|access[-_ ]?token|secret)\b\s*[:=]\s*[^\s,;]+/gi,
      "$1: [redacted]",
    );
}

function safeNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function providerRequestId(error: Record<string, unknown>): string | null {
  const direct = safeText(error.request_id, MAX_CODE_LENGTH);
  if (direct) return direct;
  const headers = error.headers;
  if (!isRecord(headers)) return null;
  return safeText(headers["x-request-id"], MAX_CODE_LENGTH);
}

function categoryFor(error: Record<string, unknown>): ProviderFailureCategory {
  const status = safeNumber(error.status);
  const code = typeof error.code === "string" ? error.code.toLowerCase() : "";
  const type = typeof error.type === "string" ? error.type.toLowerCase() : "";
  const name = typeof error.name === "string" ? error.name.toLowerCase() : "";
  const message =
    typeof error.message === "string" ? error.message.toLowerCase() : "";

  if (status === 401 || status === 403) return "authentication";
  if (code === "insufficient_quota" || /quota/.test(code) || /quota/.test(message)) {
    return "quota";
  }
  if (status === 429) return "rate-limit";
  if (
    status === 400 ||
    status === 404 ||
    status === 422 ||
    code === "invalid_parameter" ||
    code === "model_not_found" ||
    /invalid[_ -]?parameter|unsupported[_ -]?parameter|configuration/.test(
      `${code} ${type} ${message}`,
    )
  ) {
    return "configuration";
  }
  if (
    name.includes("timeout") ||
    code === "etimedout" ||
    code === "und_err_connect_timeout" ||
    /timed? out|timeout/.test(message)
  ) {
    return "timeout";
  }
  if (
    name.includes("connection") ||
    code.startsWith("econn") ||
    code === "enotfound" ||
    code === "und_err_socket" ||
    /connection|socket|fetch failed|network/.test(
      `${name} ${code} ${message}`,
    )
  ) {
    return "connection";
  }
  return "provider-error";
}

/**
 * Reduces an SDK error to bounded, safe diagnostic fields. The raw error object,
 * headers, request body, and environment values are intentionally discarded.
 */
export function providerDiagnosticsFromError(
  error: unknown,
): ProviderDiagnostics {
  const record = isRecord(error) ? error : {};
  const message =
    safeText(record.message) ??
    (typeof error === "string" ? safeText(error) : null) ??
    "The provider request failed.";
  const category = categoryFor(record);
  return {
    category,
    httpStatus: safeNumber(record.status),
    providerCode: safeText(record.code, MAX_CODE_LENGTH),
    providerType: safeText(record.type, MAX_CODE_LENGTH),
    parameter: safeText(record.param, MAX_CODE_LENGTH),
    providerRequestId: providerRequestId(record),
    message,
  };
}

export function invalidOutputDiagnostics(message: string): ProviderDiagnostics {
  return {
    category: "invalid-output",
    httpStatus: null,
    providerCode: null,
    providerType: null,
    parameter: null,
    providerRequestId: null,
    message: safeText(message) ?? "The provider returned unreadable output.",
  };
}

export function diagnosticsFromUnknownError(
  error: unknown,
): ProviderDiagnostics | undefined {
  if (!isRecord(error)) return undefined;
  const diagnostics = error.diagnostics;
  if (!isRecord(diagnostics)) return undefined;
  const category = diagnostics.category;
  if (
    category !== "authentication" &&
    category !== "configuration" &&
    category !== "quota" &&
    category !== "rate-limit" &&
    category !== "connection" &&
    category !== "timeout" &&
    category !== "invalid-output" &&
    category !== "provider-error"
  ) {
    return undefined;
  }
  return {
    category,
    httpStatus: safeNumber(diagnostics.httpStatus),
    providerCode: safeText(diagnostics.providerCode, MAX_CODE_LENGTH),
    providerType: safeText(diagnostics.providerType, MAX_CODE_LENGTH),
    parameter: safeText(diagnostics.parameter, MAX_CODE_LENGTH),
    providerRequestId: safeText(
      diagnostics.providerRequestId,
      MAX_CODE_LENGTH,
    ),
    message:
      safeText(diagnostics.message) ?? "The provider request failed.",
  };
}

export function shouldStopAfterFailure(
  diagnostics: ProviderDiagnostics | undefined,
): boolean {
  return (
    diagnostics?.category === "authentication" ||
    diagnostics?.category === "configuration" ||
    diagnostics?.category === "quota"
  );
}
