import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { getOrCreateBusinessForUser } from "@/lib/db/businesses";
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

async function resolveBusinessForSessionUser(userId: string, email?: string | null) {
  try {
    return await getOrCreateBusinessForUser(userId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("Could not resolve user in public.users") && email) {
      return getOrCreateBusinessForUser(email);
    }
    throw error;
  }
}

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

    const business = await resolveBusinessForSessionUser(session.user.id, session.user.email);
    const text = await csvFile.text();
    const rows = parseCsv(text);

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
      const customerPhone = normalizeOptionalString(row.customer_phone);
      const serviceName = normalizeOptionalString(row.service_name);
      const visitedAt = normalizeOptionalString(row.visited_at);

      if (!visitedAt || !isValidDateInput(visitedAt)) {
        rowsSkipped += 1;
        errors.push({ row: rowNumber, message: "visited_at is required and must be a valid date" });
        continue;
      }

      if (!customerEmail && !customerPhone) {
        rowsSkipped += 1;
        errors.push({ row: rowNumber, message: "Either customer_email or customer_phone is required" });
        continue;
      }

      if (customerEmail && !isValidEmail(customerEmail)) {
        rowsSkipped += 1;
        errors.push({ row: rowNumber, message: "customer_email must be a valid email address" });
        continue;
      }

      const dedupeKey = `${customerEmail?.toLowerCase() ?? ""}|${customerPhone ?? ""}|${serviceName ?? ""}|${visitedAt}`;
      if (inFileDuplicateKeys.has(dedupeKey)) {
        rowsSkipped += 1;
        duplicatesSkipped += 1;
        continue;
      }
      inFileDuplicateKeys.add(dedupeKey);

      if (customerEmail) {
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
      }

      await createFollowupVisit({
        businessId: business.id,
        customerName,
        customerEmail,
        customerPhone,
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
    const message = error instanceof Error ? error.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
