type SafeLogMeta = Record<string, unknown> | undefined;

function redact(value: unknown): unknown {
  if (typeof value === "string") return value.length > 300 ? `${value.slice(0, 300)}...(truncated)` : value;
  if (Array.isArray(value)) return value.slice(0, 20).map(redact);
  if (!value || typeof value !== "object") return value;

  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    result[key] = /(token|secret|password|authorization|cookie|key|email|payload|phone|body)/i.test(key)
      ? "[REDACTED]"
      : redact(item);
  }
  return result;
}

function write(level: "info" | "warn" | "error", event: string, meta?: SafeLogMeta) {
  const output = meta ? redact(meta) : "";
  if (level === "info") console.info(`[${event}]`, output);
  else if (level === "warn") console.warn(`[${event}]`, output);
  else console.error(`[${event}]`, output);
}

export const safeLogger = {
  info: (event: string, meta?: SafeLogMeta) => write("info", event, meta),
  warn: (event: string, meta?: SafeLogMeta) => write("warn", event, meta),
  error: (event: string, meta?: SafeLogMeta) => write("error", event, meta),
};
