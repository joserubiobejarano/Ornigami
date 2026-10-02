import { NextResponse } from "next/server";
import { getFirstBusiness, upsertFirstBusiness } from "@/server/services/followups";
import { safeLoggerError } from "@/server/safe-logger";

export async function GET() {
  const business = await getFirstBusiness();
  return NextResponse.json({ business });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!body?.name || !body?.google_review_url) {
      return NextResponse.json(
        { error: "name and google_review_url are required" },
        { status: 400 }
      );
    }

    const business = await upsertFirstBusiness({
      name: body.name,
      business_type: body.business_type,
      city: body.city,
      google_review_url: body.google_review_url,
      rebooking_url: body.rebooking_url,
      tone: body.tone,
      language: body.language,
      email_from_name: body.email_from_name
    });

    return NextResponse.json({ business });
  } catch (error) {
    safeLoggerError("followups.settings.failed", error);
    return NextResponse.json({ error: "Failed to update settings" }, { status: 500 });
  }
}
