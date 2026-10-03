import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { requireActiveAgentAccess, safeApiErrorResponse } from "@/lib/api-security";
import { isSameOriginMutation } from "@/lib/team-lifecycle";
import { CsvParseError, parseCsv } from "@/modules/review-booster/services/csv-parsing.service";
import { createCsvFollowupVisit } from "@/modules/review-booster/services/review-booster-db.service";
import { isValidCustomerEmail, normalizeVisitedAt } from "@/modules/review-booster/services/intake-input.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type UploadError = { row: number; message: string };

function optionalString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return value.trim() || null;
}

function looksLikeTemplateExampleRow(input: {
  customerName: string | null;
  customerEmail: string | null;
  serviceName: string | null;
  visitedAt: string | null;
}): boolean {
  return input.customerName?.toLowerCase() === "jane doe"
    && input.customerEmail?.toLowerCase() === "jane@example.com"
    && input.serviceName?.toLowerCase() === "teeth cleaning"
    && input.visitedAt === "2026-05-25";
}

const MAX_CSV_BYTES = 1024 * 1024;
const MAX_MULTIPART_OVERHEAD_BYTES = 64 * 1024;
const MAX_REQUEST_BYTES = MAX_CSV_BYTES + MAX_MULTIPART_OVERHEAD_BYTES;
const MAX_CSV_ROWS = 500;

async function readBoundedRequest(request: Request): Promise<Request | null> {
  const declaredLength = request.headers.get("content-length");
  if (declaredLength && (!/^\d+$/.test(declaredLength) || Number(declaredLength) > MAX_REQUEST_BYTES)) return null;
  if (!request.body) {
    const headers = new Headers(request.headers);
    headers.set("content-length", "0");
    return new Request(request.url, { method: request.method, headers, body: Buffer.alloc(0) });
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_REQUEST_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const headers = new Headers(request.headers);
  headers.set("content-length", String(size));
  return new Request(request.url, {
    method: request.method,
    headers,
    body: Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))),
  });
}

export async function POST(req: Request) {
  const declaredLength = req.headers.get("content-length");
  if (declaredLength && (!/^\d+$/.test(declaredLength) || Number(declaredLength) > MAX_REQUEST_BYTES)) {
    return NextResponse.json({ error: "CSV request body is too large." }, { status: 413 });
  }
  if (!isSameOriginMutation(req)) {
    return NextResponse.json({ error: "Cross-origin request rejected." }, { status: 403 });
  }
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let boundedRequest: Request | null;
  try {
    boundedRequest = await readBoundedRequest(req);
  } catch {
    return NextResponse.json({ error: "Request body could not be read." }, { status: 400 });
  }
  if (!boundedRequest) return NextResponse.json({ error: "CSV request body is too large or missing." }, { status: 413 });

  let formData: FormData;
  try { formData = await boundedRequest.formData(); }
  catch { return NextResponse.json({ error: "Request must contain valid multipart form data." }, { status: 400 }); }
  const csvFile = formData.get("file");
  if (!(csvFile instanceof File)) {
    return NextResponse.json({ error: "CSV file is required (form-data key: file)" }, { status: 400 });
  }
  const mime = csvFile.type.toLowerCase();
  if (!csvFile.name.toLowerCase().endsWith(".csv") || (mime && !["text/csv", "application/vnd.ms-excel"].includes(mime) && !mime.includes("csv"))) {
    return NextResponse.json({ error: "Only CSV files are allowed" }, { status: 400 });
  }
  if (csvFile.size <= 0 || csvFile.size > MAX_CSV_BYTES) {
    return NextResponse.json({ error: "CSV file size must be between 1 byte and 1 MB" }, { status: 400 });
  }

  let rows;
  try {
    rows = parseCsv(await csvFile.text());
  } catch (error) {
    if (error instanceof CsvParseError) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ error: "CSV could not be read." }, { status: 400 });
  }
  if (rows.length > MAX_CSV_ROWS) {
    return NextResponse.json({ error: `CSV must contain at most ${MAX_CSV_ROWS} rows` }, { status: 400 });
  }

  try {
    // This canonical context check enforces the active agent entitlement for both
    // owners and business members before any row can be inserted.
    const business = await requireActiveAgentAccess(session.user.id, session.user.email, "review_booster");
    const errors: UploadError[] = [];
    let visitsInserted = 0;
    let rowsSkipped = 0;
    let duplicatesSkipped = 0;

    for (let index = 0; index < rows.length; index += 1) {
      const rowNumber = index + 2;
      const row = rows[index]!;
      const customerName = optionalString(row.customer_name);
      const customerEmail = optionalString(row.customer_email)?.toLowerCase() ?? null;
      const serviceName = optionalString(row.service_received) ?? optionalString(row.service_name);
      const rawVisitedAt = optionalString(row.visited_at);
      if ((customerName && customerName.length > 120)
        || (customerEmail && customerEmail.length > 254)
        || (serviceName && serviceName.length > 120)
        || (rawVisitedAt && rawVisitedAt.length > 40)) {
        rowsSkipped += 1;
        errors.push({ row: rowNumber, message: "Name and service are limited to 120 characters, email to 254, and visit time to 40" });
        continue;
      }
      if (looksLikeTemplateExampleRow({ customerName, customerEmail, serviceName, visitedAt: rawVisitedAt })) {
        rowsSkipped += 1;
        continue;
      }
      const visitedAt = normalizeVisitedAt(rawVisitedAt);
      if (!visitedAt) {
        rowsSkipped += 1;
        errors.push({ row: rowNumber, message: "visited_at must be YYYY-MM-DD (UTC) or an ISO timestamp with Z/an explicit offset" });
        continue;
      }
      if (!customerEmail) {
        rowsSkipped += 1;
        errors.push({ row: rowNumber, message: "customer_email is required for CSV follow-up delivery" });
        continue;
      }
      if (!isValidCustomerEmail(customerEmail)) {
        rowsSkipped += 1;
        errors.push({ row: rowNumber, message: "customer_email must be a valid email address" });
        continue;
      }

      try {
        const visit = await createCsvFollowupVisit({
          businessId: business.id,
          customerName,
          customerEmail,
          customerPhone: null,
          serviceName,
          visitedAt,
          source: "csv",
        }, session.user.id);
        if (visit) visitsInserted += 1;
        else {
          rowsSkipped += 1;
          duplicatesSkipped += 1;
        }
      } catch {
        rowsSkipped += 1;
        errors.push({ row: rowNumber, message: "Could not save this row. Retry the import; previously imported rows will count as duplicates." });
      }
    }

    return NextResponse.json({
      rows_processed: rows.length,
      visits_inserted: visitsInserted,
      rows_skipped: rowsSkipped,
      duplicates_skipped: duplicatesSkipped,
      errors,
    });
  } catch (error) {
    return safeApiErrorResponse(error, "review_booster.upload.post");
  }
}
