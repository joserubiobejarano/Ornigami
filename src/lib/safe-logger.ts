type SafeLogMeta = Record<string, unknown> | undefined;

function redactValue(value: unknown): unknown {
  if (typeof value === "string") {
    if (value.length > 300) return `${value.slice(0, 300)}...(truncated)`;
    return value;
  }
  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => redactValue(item));
  }
  if (!value || typeof value !== "object") {
    return value;
  }

  const redacted: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (/(token|secret|password|authorization|cookie|key|email|payload)/i.test(k)) {
      redacted[k] = "[REDACTED]";
      continue;
    }
    redacted[k] = redactValue(v);
  }
  return redacted;
}

function write(level: "info" | "warn" | "error", event: string, meta?: SafeLogMeta): void {
  const body = meta ? redactValue(meta) : undefined;
  if (level === "info") {
    console.info(`[${event}]`, body ?? "");
    return;
  }
  if (level === "warn") {
    console.warn(`[${event}]`, body ?? "");
    return;
  }
  console.error(`[${event}]`, body ?? "");
}

export const safeLogger = {
  info: (event: string, meta?: SafeLogMeta) => write("info", event, meta),
  warn: (event: string, meta?: SafeLogMeta) => write("warn", event, meta),
  error: (event: string, meta?: SafeLogMeta) => write("error", event, meta),
};

