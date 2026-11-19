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
const REDACTED_DIAGNOSTIC = "[redacted diagnostic]";
const GENERIC_PROVIDER_MESSAGE = "The provider request failed.";

const CREDENTIAL_KEYS =
  "(?:proxy[-_ ]?authorization|authorization|x[-_ ]?api[-_ ]?key|openai[-_ ]?api[-_ ]?key|api[-_ ]?key|apikey|access[-_ ]?token|refresh[-_ ]?token|id[-_ ]?token|auth[-_ ]?token|client[-_ ]?secret|private[-_ ]?key|password|passwd|credentials?|secret|session[-_ ]?key|token|auth)";

const QUOTED_OR_ESCAPED_VALUE =
  '(?:"(?:[^"\\\\]|\\\\.)*"|\'(?:[^\'\\\\]|\\\\.)*\'|\\\\"(?:[^"\\\\]|\\\\.)*\\\\"|\\\\\'(?:[^\'\\\\]|\\\\.)*\\\\\')';

const CREDENTIAL_ASSIGNMENT = new RegExp(
  `((?:\\\\?["']?)${CREDENTIAL_KEYS}(?:\\\\?["']?)\\s*[:=]\\s*)(?:${QUOTED_OR_ESCAPED_VALUE}|[^,;]+)`,
  "gi",
);

// Free-form provider messages often say "Incorrect API key provided: ...".
const CREDENTIAL_PROVIDED_PHRASE = new RegExp(
  `((?:${CREDENTIAL_KEYS})\\s+(?:provided|supplied|value)\\s*(?:[:=]\\s*)?)(?:${QUOTED_OR_ESCAPED_VALUE}|[^,;]+)`,
  "gi",
);

const RESIDUAL_CREDENTIAL_ASSIGNMENT = new RegExp(
  `(?:${CREDENTIAL_KEYS})(?:\\\\?["']?)\\s*[:=](?!\\s*\\[redacted\\])`,
  "i",
);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * Removes credentials and credential-like assignments from free-form text.
 * The complete input is sanitized before any caller truncates it, so a secret
 * cannot survive by being split at the length boundary. If a credential-looking
 * assignment still remains after replacement, the text is withheld entirely.
 */
export function redactDiagnosticText(value: string): string {
  const redacted = value
    .replace(
      /-----BEGIN [^-]+-----[\s\S]*?-----END [^-]+-----/g,
      "[redacted-key]",
    )
    .replace(/\bsk-[A-Za-z0-9_-]{8,}/g, "[redacted-key]")
    .replace(
      /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|xox[abprs]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{30,}|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,})\b/g,
      "[redacted-key]",
    )
    .replace(
      /\bBearer\s+(?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\\"(?:[^"\\]|\\.)*\\"|\\'(?:[^'\\]|\\.)*\\'|[^\s,;}\]\)"']+)/gi,
      "Bearer [redacted]",
    )
    .replace(/\b(https?:\/\/)[^\s/@]+@/gi, "$1[redacted]@")
    .replace(CREDENTIAL_ASSIGNMENT, "$1[redacted]")
    .replace(CREDENTIAL_PROVIDED_PHRASE, "$1[redacted]");

  return RESIDUAL_CREDENTIAL_ASSIGNMENT.test(redacted)
    ? REDACTED_DIAGNOSTIC
    : redacted;
}

/**
 * Compacts, redacts, then truncates diagnostic text. Redaction always happens
 * before truncation, and this helper is the only path used for diagnostic
 * messages and structured provider strings.
 */
export function sanitizeDiagnosticText(
  value: string,
  maxLength = MAX_MESSAGE_LENGTH,
): string | null {
  const compact = value.replace(/\s+/g, " ").trim();
  if (!compact) return null;
  return redactDiagnosticText(compact).slice(0, maxLength).trim() || null;
}

function safeText(
  value: unknown,
  maxLength = MAX_MESSAGE_LENGTH,
): string | null {
  if (typeof value !== "string") return null;
  return sanitizeDiagnosticText(value, maxLength);
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
  if (
    code === "insufficient_quota" ||
    /quota|credit[_ -]?balance|no credits/.test(`${code} ${type} ${message}`)
  ) {
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
    /connection|socket|fetch failed|network/.test(`${name} ${code} ${message}`)
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
    GENERIC_PROVIDER_MESSAGE;
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

export function invalidOutputDiagnostics(
  message: string,
  providerRequestId: string | null = null,
): ProviderDiagnostics {
  return {
    category: "invalid-output",
    httpStatus: null,
    providerCode: null,
    providerType: null,
    parameter: null,
    providerRequestId: providerRequestId
      ? safeText(providerRequestId, MAX_CODE_LENGTH)
      : null,
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
    message: safeText(diagnostics.message) ?? GENERIC_PROVIDER_MESSAGE,
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
