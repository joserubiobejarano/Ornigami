import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { requireActiveAgentAccess, safeApiErrorResponse } from "@/lib/api-security";
import { parseCsv } from "@/modules/review-booster/services/csv-parsing.service";
import { createFollowupVisit, findCsvVisitDuplicate } from "@/modules/review-booster/services/review-booster-db.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type UploadError = {
  row: number;
  message: string;
};

function normalizeOptionalString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidDateInput(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && !Number.isNaN(Date.parse(value));
}

function looksLikeTemplateExampleRow(input: {
  customerName: string | null;
  customerEmail: string | null;
  serviceName: string | null;
  visitedAt: string | null;
}): boolean {
  const name = input.customerName?.toLowerCase() ?? "";
  const email = input.customerEmail?.toLowerCase() ?? "";
  const service = input.serviceName?.toLowerCase() ?? "";
  const visited = input.visitedAt?.toLowerCase() ?? "";

  return (
    name === "jane doe" &&
    email === "jane@example.com" &&
    service === "teeth cleaning" &&
    visited === "2026-05-25"
  );
}

const MAX_CSV_BYTES = 1024 * 1024;
const MAX_CSV_ROWS = 500;

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const formData = await req.formData();
    const csvFile = formData.get("file");

    if (!(csvFile instanceof File)) {
      return NextResponse.json({ error: "CSV file is required (form-data key: file)" }, { status: 400 });
    }
    const hasCsvExtension = csvFile.name.toLowerCase().endsWith(".csv");
    const hasCsvMime =
      csvFile.type.length === 0 ||
      csvFile.type === "text/csv" ||
      csvFile.type === "application/vnd.ms-excel" ||
      csvFile.type.includes("csv");
    if (!hasCsvExtension || !hasCsvMime) {
      return NextResponse.json({ error: "Only CSV files are allowed" }, { status: 400 });
    }
    if (csvFile.size <= 0 || csvFile.size > MAX_CSV_BYTES) {
      return NextResponse.json({ error: "CSV file size must be between 1 byte and 1 MB" }, { status: 400 });
    }

    const business = await requireActiveAgentAccess(session.user.id, session.user.email, "review_booster");
    const text = await csvFile.text();
    const rows = parseCsv(text);
    if (rows.length > MAX_CSV_ROWS) {
      return NextResponse.json({ error: `CSV must contain at most ${MAX_CSV_ROWS} rows` }, { status: 400 });
    }

    const inFileDuplicateKeys = new Set<string>();
    const errors: UploadError[] = [];
    let visitsInserted = 0;
    let rowsSkipped = 0;
    let duplicatesSkipped = 0;

    for (let index = 0; index < rows.length; index += 1) {
      const rowNumber = index + 2;
      const row = rows[index];

      const customerName = normalizeOptionalString(row.customer_name);
      const customerEmail = normalizeOptionalString(row.customer_email);
      const serviceName = normalizeOptionalString(row.service_received ?? row.service_name);
      const visitedAt = normalizeOptionalString(row.visited_at);

      if (looksLikeTemplateExampleRow({ customerName, customerEmail, serviceName, visitedAt })) {
        rowsSkipped += 1;
        continue;
      }

      if (!visitedAt || !isValidDateInput(visitedAt)) {
        rowsSkipped += 1;
        errors.push({ row: rowNumber, message: "visited_at is required and must be a valid date" });
        continue;
      }

      if (!customerEmail) {
        rowsSkipped += 1;
        errors.push({ row: rowNumber, message: "customer_email is required" });
        continue;
      }

      if (!isValidEmail(customerEmail)) {
        rowsSkipped += 1;
        errors.push({ row: rowNumber, message: "customer_email must be a valid email address" });
        continue;
      }

      const dedupeKey = `${customerEmail.toLowerCase()}|${serviceName ?? ""}|${visitedAt}`;
      if (inFileDuplicateKeys.has(dedupeKey)) {
        rowsSkipped += 1;
        duplicatesSkipped += 1;
        continue;
      }
      inFileDuplicateKeys.add(dedupeKey);

      const duplicateInDb = await findCsvVisitDuplicate({
        businessId: business.id,
        customerEmail,
        serviceName,
        visitedAt
      });
      if (duplicateInDb) {
        rowsSkipped += 1;
        duplicatesSkipped += 1;
        continue;
      }

      await createFollowupVisit({
        businessId: business.id,
        customerName,
        customerEmail,
        customerPhone: null,
        serviceName,
        visitedAt,
        source: "csv"
      });
      visitsInserted += 1;
    }

    return NextResponse.json({
      rows_processed: rows.length,
      visits_inserted: visitsInserted,
      rows_skipped: rowsSkipped,
      duplicates_skipped: duplicatesSkipped,
      errors
    });
  } catch (error) {
    return safeApiErrorResponse(error, "review_booster.upload.post");
  }
}
