import { NextResponse } from "next/server";

import { checkPublicWriteRateLimit } from "@/lib/public-write-limiter";
import { safeLogger } from "@/lib/safe-logger";
import { getTrustedRequestIp } from "@/lib/trusted-request-ip";

const MAX_BODY_BYTES = 16_384;
const MAX_REPORTS_PER_REQUEST = 5;
const MAX_FIELD_LENGTH = 500;

type CspReport = Record<string, unknown>;

function boundedString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized ? normalized.slice(0, MAX_FIELD_LENGTH) : undefined;
}

function urlPath(value: unknown): string | undefined {
  const text = boundedString(value);
  if (!text) return undefined;
  try {
    const parsed = new URL(text);
    return `${parsed.origin}${parsed.pathname}`.slice(0, MAX_FIELD_LENGTH);
  } catch {
    return text;
  }
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function extractReports(payload: unknown): CspReport[] {
  if (Array.isArray(payload)) {
    return payload
      .slice(0, MAX_REPORTS_PER_REQUEST)
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

function normalizeReport(report: CspReport) {
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

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Report too large" }, { status: 413 });
  }

  const ip = getTrustedRequestIp(request.headers);
  const allowed = await checkPublicWriteRateLimit(`csp-report:ip:${ip ?? "unknown"}`, 30);
  if (!allowed) return NextResponse.json({ error: "Too many reports" }, { status: 429 });

  const body = await request.text();
  if (new TextEncoder().encode(body).byteLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Report too large" }, { status: 413 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    safeLogger.warn("csp.report.invalid", { reason: "invalid_json" });
    return NextResponse.json({ error: "Invalid report" }, { status: 400 });
  }

  const reports = extractReports(payload);
  if (reports.length === 0) {
    safeLogger.warn("csp.report.invalid", { reason: "empty_report" });
    return NextResponse.json({ error: "Invalid report" }, { status: 400 });
  }

  for (const report of reports) {
    safeLogger.warn("csp.report.violation", normalizeReport(report));
  }

  return new Response(null, { status: 204 });
}
