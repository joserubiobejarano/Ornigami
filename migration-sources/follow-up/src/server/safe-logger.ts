const SENSITIVE_KEY = /token|secret|password|authorization|cookie|email|phone|raw.?payload|body/i;
const MAX_STRING_LENGTH = 500;

function redact(value: unknown, depth = 0): unknown {
  if (depth > 3) return "[truncated]";
  if (typeof value === "string") return value.length > MAX_STRING_LENGTH ? `${value.slice(0, MAX_STRING_LENGTH)}…` : value;
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => redact(item, depth + 1));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).slice(0, 30).map(([key, item]) => [key, SENSITIVE_KEY.test(key) ? "[redacted]" : redact(item, depth + 1)]));
  }
  return value;
}

export function safeErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return String(redact(message)).slice(0, MAX_STRING_LENGTH);
}

export function safeLoggerError(event: string, error: unknown, context: Record<string, unknown> = {}): void {
  const sanitized = redact(context);
  const safeContext = sanitized && typeof sanitized === "object" && !Array.isArray(sanitized) ? sanitized : {};
  console.error(JSON.stringify({ event, error: safeErrorMessage(error), ...safeContext }));
}
