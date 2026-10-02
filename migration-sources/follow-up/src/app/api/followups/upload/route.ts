import { NextResponse } from "next/server";
import { parseCsv } from "@/server/services/csv";
import { createVisit, findCsvVisitDuplicate, getFirstBusiness } from "@/server/services/followups";
import { safeErrorMessage, safeLoggerError } from "@/server/safe-logger";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NO_BUSINESS_MESSAGE = "Please save business settings before uploading visits.";

type ApiUploadError = {
  error: string;
  details?: string;
};

function jsonError(status: number, error: string, details?: string) {
  const body: ApiUploadError = details ? { error, details } : { error };
  return NextResponse.json(body, { status });
}

type UploadFile = FormDataEntryValue & { text: () => Promise<string>; name?: string; size?: number };

function isUploadFile(value: FormDataEntryValue | null): value is UploadFile {
  return !!value && typeof value === "object" && typeof value.text === "function";
}

export async function POST(request: Request) {
  try {
    const business = await getFirstBusiness();
    if (!business) {
      return jsonError(400, NO_BUSINESS_MESSAGE);
    }

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch (error) {
      return jsonError(400, "Invalid multipart form data.", String(error));
    }

    const file = formData.get("file");
    if (!isUploadFile(file)) {
      return jsonError(400, "CSV file is required.");
    }

    if (typeof file.size === "number" && file.size > 5 * 1024 * 1024) {
      return jsonError(413, "CSV file must be 5 MB or smaller.");
    }

    const fileName = String(file.name || "").toLowerCase();
    if (!fileName.endsWith(".csv")) {
      return jsonError(400, "File must be a CSV (.csv).");
    }

    let text = "";
    try {
      text = await file.text();
    } catch (error) {
      return jsonError(400, "Unable to read uploaded file.", String(error));
    }

    let rows;
    try {
      rows = parseCsv(text);
    } catch (error) {
      return jsonError(400, "Unable to parse CSV. Please check file format.", String(error));
    }

    const rowsProcessed = rows.length;
    if (rowsProcessed > 1000) return jsonError(413, "CSV file cannot contain more than 1000 rows.");
    let inserted = 0;
    let skipped = 0;
    let duplicates = 0;
    const errors: Array<{ row: number; reason: string }> = [];
    const seenInFile = new Set<string>();

    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];
      const rowNumber = i + 2;
      const visitedAt = row.visited_at?.trim();
      const customerEmail = row.customer_email?.trim();
      const customerPhone = row.customer_phone?.trim();
      const serviceName = row.service_name?.trim();
      const source = row.source?.trim().toLowerCase();

      if (source && source !== "csv") {
        skipped += 1;
        errors.push({ row: rowNumber, reason: "source must be csv" });
        continue;
      }

      if (!visitedAt) {
        skipped += 1;
        errors.push({ row: rowNumber, reason: "visited_at is required" });
        continue;
      }

      if (!customerEmail && !customerPhone) {
        skipped += 1;
        errors.push({ row: rowNumber, reason: "customer_email or customer_phone is required" });
        continue;
      }

      if (customerEmail && !EMAIL_REGEX.test(customerEmail)) {
        skipped += 1;
        errors.push({ row: rowNumber, reason: "customer_email is invalid" });
        continue;
      }

      if (customerEmail) {
        const dedupeKey = [
          business.id,
          customerEmail.toLowerCase(),
          serviceName || "",
          visitedAt
        ].join("|");

        if (seenInFile.has(dedupeKey)) {
          skipped += 1;
          duplicates += 1;
          errors.push({ row: rowNumber, reason: "duplicate row in CSV file" });
          continue;
        }
        seenInFile.add(dedupeKey);

        const existing = await findCsvVisitDuplicate({
          business_id: business.id,
          customer_email: customerEmail,
          service_name: serviceName,
          visited_at: visitedAt
        });

        if (existing) {
          skipped += 1;
          duplicates += 1;
          errors.push({ row: rowNumber, reason: "duplicate visit already imported" });
          continue;
        }
      }

      try {
        await createVisit({
          business_id: business.id,
          customer_name: row.customer_name?.trim(),
          customer_email: customerEmail,
          customer_phone: customerPhone,
          service_name: serviceName,
          visited_at: visitedAt,
          source: "csv"
        });
        inserted += 1;
      } catch (error) {
        skipped += 1;
        const errorText = safeErrorMessage(error);
        const reason = errorText.toLowerCase().includes("uniq_csv_visit_import")
          ? "duplicate visit already imported"
          : errorText;
        if (reason === "duplicate visit already imported") {
          duplicates += 1;
        }
        errors.push({ row: rowNumber, reason });
        continue;
      }
    }

    return NextResponse.json({
      rows_processed: rowsProcessed,
      visits_inserted: inserted,
      rows_skipped: skipped,
      duplicates_skipped: duplicates,
      errors
    });
  } catch (error) {
    safeLoggerError("followups.upload.failed", error);
    return jsonError(500, "Failed to process CSV upload");
  }
}
