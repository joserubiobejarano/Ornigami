export const CSP_REPORT_POLICY = {
  maxBodyBytes: 16_384,
  maxReportsPerRequest: 5,
  maxFieldLength: 500,
  rateLimit: 30,
} as const;

type CspReport = Record<string, unknown>;

function boundedString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized ? normalized.slice(0, CSP_REPORT_POLICY.maxFieldLength) : undefined;
}

function urlPath(value: unknown): string | undefined {
  const text = boundedString(value);
  if (!text) return undefined;
  try {
    const parsed = new URL(text);
    return `${parsed.origin}${parsed.pathname}`.slice(0, CSP_REPORT_POLICY.maxFieldLength);
  } catch {
    return text;
  }
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function extractCspReports(payload: unknown): CspReport[] {
  if (Array.isArray(payload)) {
    return payload
      .slice(0, CSP_REPORT_POLICY.maxReportsPerRequest)
      .map((entry) => {
        if (!entry || typeof entry !== "object") return null;
        const record = entry as CspReport;
        const body = record.body;
        return body && typeof body === "object" ? (body as CspReport) : record;
      })
      .filter((report): report is CspReport => report !== null);
  }

  if (!payload || typeof payload !== "object") return [];
  const record = payload as CspReport;
  const legacy = record["csp-report"];
  if (legacy && typeof legacy === "object") return [legacy as CspReport];
  return [record];
}

export function normalizeCspReport(report: CspReport) {
  return {
    documentPath: urlPath(report.documentURL ?? report.documentUri),
    blockedUri: urlPath(report.blockedURL ?? report.blockedUri),
    sourcePath: urlPath(report.sourceFile),
    effectiveDirective: boundedString(report.effectiveDirective),
    violatedDirective: boundedString(report.violatedDirective),
    disposition: boundedString(report.disposition),
    statusCode: numberValue(report.statusCode),
    lineNumber: numberValue(report.lineNumber),
    columnNumber: numberValue(report.columnNumber),
  };
}
