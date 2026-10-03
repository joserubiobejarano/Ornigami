import { NextResponse } from "next/server";

import { checkPublicWriteRateLimit } from "@/lib/public-write-limiter";
import { safeLogger } from "@/lib/safe-logger";
import { getTrustedRequestIp } from "@/lib/trusted-request-ip";
import {
  CSP_REPORT_POLICY,
  extractCspReports,
  normalizeCspReport,
  readBoundedCspBody,
} from "@/lib/csp-report-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const contentLength = request.headers.get("content-length");
  if (contentLength && (!/^\d+$/.test(contentLength) || Number(contentLength) > CSP_REPORT_POLICY.maxBodyBytes)) {
    if (/^\d+$/.test(contentLength) && Number(contentLength) > CSP_REPORT_POLICY.maxBodyBytes) {
      return NextResponse.json({ error: "Report too large" }, { status: 413 });
    }
    return NextResponse.json({ error: "Invalid report" }, { status: 400 });
  }

  const contentType = request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
  if (contentType && !["application/json", "application/csp-report", "application/reports+json"].includes(contentType)) {
    return NextResponse.json({ error: "Unsupported report type" }, { status: 415 });
  }

  const ip = getTrustedRequestIp(request.headers);
  let allowed: boolean;
  try {
    allowed = await checkPublicWriteRateLimit(
      `csp-report:ip:${ip ?? "unknown"}`,
      CSP_REPORT_POLICY.rateLimit
    );
  } catch {
    safeLogger.warn("csp.report.limiter_unavailable");
    return NextResponse.json({ error: "Report service unavailable" }, { status: 503 });
  }
  if (!allowed) return NextResponse.json({ error: "Too many reports" }, { status: 429 });

  let body: Awaited<ReturnType<typeof readBoundedCspBody>>;
  try {
    body = await readBoundedCspBody(request);
  } catch {
    safeLogger.warn("csp.report.invalid", { reason: "body_read_failed" });
    return NextResponse.json({ error: "Invalid report" }, { status: 400 });
  }
  if (body.kind === "too_large") {
    return NextResponse.json({ error: "Report too large" }, { status: 413 });
  }
  if (body.kind === "invalid") {
    safeLogger.warn("csp.report.invalid", { reason: "body_read_failed" });
    return NextResponse.json({ error: "Invalid report" }, { status: 400 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(body.body);
  } catch {
    safeLogger.warn("csp.report.invalid", { reason: "invalid_json" });
    return NextResponse.json({ error: "Invalid report" }, { status: 400 });
  }

  const reports = extractCspReports(payload);
  if (reports.length === 0) {
    safeLogger.warn("csp.report.invalid", { reason: "empty_report" });
    return NextResponse.json({ error: "Invalid report" }, { status: 400 });
  }

  for (const report of reports) {
    safeLogger.warn("csp.report.violation", normalizeCspReport(report));
  }

  return new Response(null, { status: 204 });
}
