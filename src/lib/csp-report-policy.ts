export const CSP_REPORT_POLICY = {
  maxBodyBytes: 16_384,
  maxReportsPerRequest: 5,
  maxFieldLength: 500,
  maxBodyChunks: 64,
  maxReadMs: 5_000,
  rateLimit: 30,
} as const;

type CspReport = Record<string, unknown>;

/** Retain at most maxBytes while stopping at the first chunk that crosses the limit. */
export type CspBodyReadResult =
  | { kind: "ok"; body: string }
  | { kind: "too_large" }
  | { kind: "invalid" };

export async function readBoundedCspBody(
  request: Request,
  maxBytes: number = CSP_REPORT_POLICY.maxBodyBytes,
  maxChunks: number = CSP_REPORT_POLICY.maxBodyChunks,
  maxReadMs: number = CSP_REPORT_POLICY.maxReadMs,
): Promise<CspBodyReadResult> {
  const reader = request.body?.getReader();
  if (!reader) return { kind: "ok", body: "" };

  const chunks: Uint8Array[] = [];
  let total = 0;
  let completed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = Date.now() + maxReadMs;
  try {
    while (true) {
      const remainingMs = deadline - Date.now();
      if (remainingMs <= 0) {
        void reader.cancel("body read timed out").catch(() => undefined);
        return { kind: "invalid" };
      }
      const readResult = await Promise.race([
        reader.read().then((result) => ({ kind: "read" as const, result })),
        new Promise<{ kind: "timeout" }>((resolve) => {
          timer = setTimeout(() => resolve({ kind: "timeout" }), remainingMs);
        }),
      ]);
      if (timer) clearTimeout(timer);
      if (readResult.kind === "timeout") {
        void reader.cancel("body read timed out").catch(() => undefined);
        return { kind: "invalid" };
      }
      const { done, value } = readResult.result;
      if (done) { completed = true; break; }
      if (chunks.length >= maxChunks) {
        void reader.cancel("too many body chunks").catch(() => undefined);
        return { kind: "invalid" };
      }
      total += value.byteLength;
      if (total > maxBytes) {
        void reader.cancel("body too large").catch(() => undefined);
        return { kind: "too_large" };
      }
      chunks.push(value);
    }
  } catch {
    return { kind: "invalid" };
  } finally {
    if (timer) clearTimeout(timer);
    if (completed) reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return { kind: "ok", body: new TextDecoder("utf-8", { fatal: true }).decode(bytes) };
  } catch {
    return { kind: "invalid" };
  }
}

function boundedString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  return normalized ? normalized.slice(0, CSP_REPORT_POLICY.maxFieldLength) : undefined;
}

const TRUSTED_TYPES_BLOCKED_MARKERS = new Set([
  "inline", "eval", "trusted-types-sink", "trusted-types-policy",
]);

function safeScheme(value: unknown, allowTrustedTypesMarker = false): string | undefined {
  const text = boundedString(value);
  if (!text) return undefined;
  if (allowTrustedTypesMarker && TRUSTED_TYPES_BLOCKED_MARKERS.has(text.toLowerCase())) {
    return text.toLowerCase();
  }
  try {
    const parsed = new URL(text);
    if (!["http:", "https:"].includes(parsed.protocol) || parsed.origin === "null") return "opaque";
    // Hosts can carry attacker-controlled labels too, so telemetry records only the scheme.
    return parsed.protocol.slice(0, -1);
  } catch {
    return "unparseable";
  }
}

const CSP_DIRECTIVES = new Set([
  "child-src", "connect-src", "default-src", "font-src", "form-action", "frame-ancestors", "frame-src",
  "img-src", "manifest-src", "media-src", "object-src", "prefetch-src", "report-to", "sandbox",
  "script-src", "script-src-attr", "script-src-elem", "style-src", "style-src-attr", "style-src-elem",
  "base-uri", "plugin-types", "worker-src", "navigate-to", "require-trusted-types-for",
  "trusted-types", "upgrade-insecure-requests", "block-all-mixed-content", "require-sri-for",
]);

function directiveValue(value: unknown): string | undefined {
  const text = boundedString(value);
  if (!text) return undefined;
  const directive = text.toLowerCase().split(/[\s;]+/, 1)[0];
  return CSP_DIRECTIVES.has(directive) ? directive : undefined;
}

function numberValue(value: unknown, maximum = Number.MAX_SAFE_INTEGER): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= maximum ? value : undefined;
}

function recordOf(value: unknown): CspReport | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value as CspReport;
}

function hasCspFields(record: CspReport): boolean {
  return ["documentURL", "documentUri", "document-uri", "blockedURL", "blockedUri", "blocked-uri", "sourceFile", "source-file", "effectiveDirective", "effective-directive", "violatedDirective", "violated-directive"]
    .some((key) => typeof record[key] === "string");
}

export function extractCspReports(payload: unknown): CspReport[] {
  if (Array.isArray(payload)) {
    return payload.slice(0, CSP_REPORT_POLICY.maxReportsPerRequest).flatMap((entry) => {
      const envelope = recordOf(entry);
      if (envelope?.type !== undefined && envelope.type !== "csp-violation") return [];
      const report = recordOf(envelope?.body) ?? envelope;
      return report && hasCspFields(report) ? [report] : [];
    });
  }

  const record = recordOf(payload);
  if (!record) return [];
  if (Object.hasOwn(record, "csp-report")) {
    const legacy = recordOf(record["csp-report"]);
    return legacy && hasCspFields(legacy) ? [legacy] : [];
  }
  return hasCspFields(record) ? [record] : [];
}

export function normalizeCspReport(report: CspReport) {
  return {
    documentScheme: safeScheme(report.documentURL ?? report.documentUri ?? report["document-uri"]),
    blockedScheme: safeScheme(report.blockedURL ?? report.blockedUri ?? report["blocked-uri"], true),
    sourceScheme: safeScheme(report.sourceFile ?? report["source-file"]),
    effectiveDirective: directiveValue(report.effectiveDirective ?? report["effective-directive"]),
    violatedDirective: directiveValue(report.violatedDirective ?? report["violated-directive"]),
    disposition: report.disposition === "report" || report.disposition === "enforce"
      ? report.disposition
      : report.disposition === undefined ? undefined : "unknown",
    statusCode: numberValue(report.statusCode ?? report["status-code"], 599),
    lineNumber: numberValue(report.lineNumber ?? report["line-number"], 10_000_000),
    columnNumber: numberValue(report.columnNumber ?? report["column-number"], 10_000_000),
  };
}
