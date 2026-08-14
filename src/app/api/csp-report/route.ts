import { NextResponse } from "next/server";

import { checkPublicWriteRateLimit } from "@/lib/public-write-limiter";
import { safeLogger } from "@/lib/safe-logger";
import { getTrustedRequestIp } from "@/lib/trusted-request-ip";
import {
  CSP_REPORT_POLICY,
  extractCspReports,
  normalizeCspReport,
} from "@/lib/csp-report-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > CSP_REPORT_POLICY.maxBodyBytes) {
    return NextResponse.json({ error: "Report too large" }, { status: 413 });
  }

  const ip = getTrustedRequestIp(request.headers);
  const allowed = await checkPublicWriteRateLimit(
    `csp-report:ip:${ip ?? "unknown"}`,
    CSP_REPORT_POLICY.rateLimit
  );
  if (!allowed) return NextResponse.json({ error: "Too many reports" }, { status: 429 });

  const body = await request.text();
  if (new TextEncoder().encode(body).byteLength > CSP_REPORT_POLICY.maxBodyBytes) {
    return NextResponse.json({ error: "Report too large" }, { status: 413 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(body);
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
