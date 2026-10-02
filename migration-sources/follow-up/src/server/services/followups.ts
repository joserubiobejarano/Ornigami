import { sql } from "@/server/db";

export type BusinessSettingsInput = {
  name: string;
  business_type?: string;
  city?: string;
  google_review_url: string;
  rebooking_url?: string;
  tone?: string;
  language?: string;
  email_from_name?: string;
};

function isHttpsUrl(value: string | undefined): boolean {
  if (!value) return true;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function isGoogleReviewUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && (url.hostname === "g.page" || url.hostname.endsWith(".google.com") || url.hostname === "google.com");
  } catch {
    return false;
  }
}

export async function getFirstBusiness() {
  const rows = await sql`SELECT * FROM businesses ORDER BY created_at ASC LIMIT 1`;
  return rows[0] ?? null;
}

export async function upsertFirstBusiness(input: BusinessSettingsInput) {
  if (!isGoogleReviewUrl(input.google_review_url)) throw new Error("google_review_url must be a secure Google URL");
  if (!isHttpsUrl(input.rebooking_url)) throw new Error("rebooking_url must be a secure URL");
  const existing = await getFirstBusiness();
  if (!existing) {
    const created = await sql`
      INSERT INTO businesses (
        name, business_type, city, google_review_url, rebooking_url, tone, language, email_from_name
      )
      VALUES (
        ${input.name},
        ${input.business_type || null},
        ${input.city || null},
        ${input.google_review_url},
        ${input.rebooking_url || null},
        ${input.tone || "warm and friendly"},
        ${input.language || "en"},
        ${input.email_from_name || null}
      )
      RETURNING *
    `;
    return created[0];
  }

  const updated = await sql`
    UPDATE businesses
    SET
      name = ${input.name},
      business_type = ${input.business_type || null},
      city = ${input.city || null},
      google_review_url = ${input.google_review_url},
      rebooking_url = ${input.rebooking_url || null},
      tone = ${input.tone || "warm and friendly"},
      language = ${input.language || "en"},
      email_from_name = ${input.email_from_name || null},
      updated_at = now()
    WHERE id = ${existing.id}
    RETURNING *
  `;
  return updated[0];
}

export async function createVisit(input: {
  business_id: string;
  customer_name?: string;
  customer_email?: string;
  customer_phone?: string;
  service_name?: string;
  visited_at: string;
  source?: string;
  external_id?: string;
}) {
  const allowedSources = new Set(["manual", "csv", "square", "opentable", "fresha", "webhook", "api"]);
  if (!allowedSources.has(input.source || "manual")) throw new Error("Unsupported visit source");
  if (!input.customer_email && !input.customer_phone) throw new Error("A visit requires a contact method");
  const rows = await sql`
    INSERT INTO visits (
      business_id, customer_name, customer_email, customer_phone, service_name,
      visited_at, source, external_id, followup_status
    )
    VALUES (
      ${input.business_id},
      ${input.customer_name || null},
      ${input.customer_email || null},
      ${input.customer_phone || null},
      ${input.service_name || null},
      ${input.visited_at},
      ${input.source || "manual"},
      ${input.external_id || null},
      'pending'
    )
    RETURNING *
  `;
  return rows[0];
}

export async function findCsvVisitDuplicate(input: {
  business_id: string;
  customer_email: string;
  service_name?: string;
  visited_at: string;
}) {
  const rows = await sql`
    SELECT id
    FROM visits
    WHERE business_id = ${input.business_id}
      AND source = 'csv'
      AND lower(customer_email) = lower(${input.customer_email})
      AND coalesce(service_name, '') = coalesce(${input.service_name || null}, '')
      AND visited_at = ${input.visited_at}
    LIMIT 1
  `;

  return rows[0] ?? null;
}

export async function getFollowupStats(businessId?: string) {
  if (businessId) {
    const rows = await sql`
      SELECT
        COUNT(*) FILTER (WHERE followup_status = 'pending')::int AS pending,
        COUNT(*) FILTER (WHERE followup_status = 'sent')::int AS sent,
        COUNT(*) FILTER (WHERE followup_status = 'failed')::int AS failed,
        COUNT(*) FILTER (WHERE followup_status = 'skipped')::int AS skipped
      FROM visits
      WHERE business_id = ${businessId}
    `;
    return rows[0] || { pending: 0, sent: 0, failed: 0, skipped: 0 };
  }

  const rows = await sql`
    SELECT
      COUNT(*) FILTER (WHERE followup_status = 'pending')::int AS pending,
      COUNT(*) FILTER (WHERE followup_status = 'sent')::int AS sent,
      COUNT(*) FILTER (WHERE followup_status = 'failed')::int AS failed,
      COUNT(*) FILTER (WHERE followup_status = 'skipped')::int AS skipped
    FROM visits
  `;
  return rows[0] || { pending: 0, sent: 0, failed: 0, skipped: 0 };
}

export async function getRecentVisits(limit = 20, businessId?: string) {
  if (businessId) {
    return sql`
      SELECT
        v.*,
        b.name AS business_name,
        fm.error_message AS followup_error_reason
      FROM visits v
      LEFT JOIN businesses b ON b.id = v.business_id
      LEFT JOIN LATERAL (
        SELECT error_message
        FROM followup_messages
        WHERE visit_id = v.id AND status = 'failed'
        ORDER BY created_at DESC
        LIMIT 1
      ) fm ON true
      WHERE v.business_id = ${businessId}
      ORDER BY v.visited_at DESC
      LIMIT ${limit}
    `;
  }

  return sql`
    SELECT
      v.*,
      b.name AS business_name,
      fm.error_message AS followup_error_reason
    FROM visits v
    LEFT JOIN businesses b ON b.id = v.business_id
    LEFT JOIN LATERAL (
      SELECT error_message
      FROM followup_messages
      WHERE visit_id = v.id AND status = 'failed'
      ORDER BY created_at DESC
      LIMIT 1
    ) fm ON true
    ORDER BY v.visited_at DESC
    LIMIT ${limit}
  `;
}
