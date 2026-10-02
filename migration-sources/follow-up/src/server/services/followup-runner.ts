import { sql } from "@/server/db";
import { buildSubject, generateFollowupEmailBody } from "@/server/services/followup-email-generator";
import { sendWithResend } from "@/server/services/email/resend-provider";
import { safeErrorMessage, safeLoggerError } from "@/server/safe-logger";

export type FollowupRunResult = {
  ok: true;
  scanned: number;
  sent: number;
  failed: number;
  skipped: number;
};

export async function runEligibleFollowups(): Promise<FollowupRunResult> {
  const visits = await sql`
    SELECT v.*, b.name AS business_name, b.business_type, b.city, b.google_review_url, b.rebooking_url, b.tone, b.language, b.email_from_name
    FROM visits v
    JOIN businesses b ON b.id = v.business_id
    WHERE (
      (
        v.source IN ('square', 'opentable', 'fresha', 'webhook', 'api')
        AND v.visited_at BETWEEN now() - interval '25 hours' AND now() - interval '23 hours'
      )
      OR
      (
        v.source IN ('manual', 'csv')
        AND v.visited_at <= now() - interval '23 hours'
        AND v.visited_at >= now() - interval '7 days'
        AND v.followup_status = 'pending'
        AND v.followup_sent_at IS NULL
      )
    )
      AND v.followup_status = 'pending'
      AND v.followup_sent_at IS NULL
      AND v.customer_email IS NOT NULL
      AND trim(v.customer_email) <> ''
    ORDER BY v.visited_at ASC
  `;

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const visit of visits) {
    const alreadySent = await sql`
      SELECT id
      FROM followup_messages
      WHERE visit_id = ${visit.id} AND status = 'sent'
      LIMIT 1
    `;
    if (alreadySent.length > 0) {
      skipped += 1;
      continue;
    }

    if (!visit.google_review_url) {
      skipped += 1;
      await sql`
        UPDATE visits
        SET followup_status = 'failed', updated_at = now()
        WHERE id = ${visit.id}
      `;
      await sql`
        INSERT INTO followup_messages (visit_id, business_id, subject, body, status, error_message)
        VALUES (
          ${visit.id},
          ${visit.business_id},
          ${buildSubject(visit.business_name)},
          '',
          'failed',
          'Missing google_review_url'
        )
      `;
      continue;
    }

    const subject = buildSubject(visit.business_name);
    const body = await generateFollowupEmailBody({
      business_name: visit.business_name,
      business_type: visit.business_type,
      city: visit.city,
      customer_name: visit.customer_name,
      service_name: visit.service_name,
      google_review_url: visit.google_review_url,
      rebooking_url: visit.rebooking_url,
      tone_setting: visit.tone,
      language: visit.language
    });

    try {
      const providerMessageId = await sendWithResend({
        email_from_name: visit.email_from_name,
        business_name: visit.business_name,
        customer_email: visit.customer_email,
        subject,
        body
      });

      await sql`
        INSERT INTO followup_messages (
          visit_id, business_id, subject, body, provider_message_id, status, sent_at
        )
        VALUES (
          ${visit.id},
          ${visit.business_id},
          ${subject},
          ${body},
          ${providerMessageId},
          'sent',
          now()
        )
      `;

      await sql`
        UPDATE visits
        SET followup_status = 'sent', followup_sent_at = now(), updated_at = now()
        WHERE id = ${visit.id}
      `;
      sent += 1;
    } catch (error) {
      const errorMessage = safeErrorMessage(error);
      safeLoggerError("followups.send.failed", error, { visitId: visit.id, businessId: visit.business_id });
      await sql`
        INSERT INTO followup_messages (
          visit_id, business_id, subject, body, status, error_message
        )
        VALUES (
          ${visit.id},
          ${visit.business_id},
          ${subject},
          ${body},
          'failed',
          ${errorMessage}
        )
      `;
      await sql`
        UPDATE visits
        SET followup_status = 'failed', updated_at = now()
        WHERE id = ${visit.id}
      `;
      failed += 1;
    }
  }

  return {
    ok: true,
    scanned: visits.length,
    sent,
    failed,
    skipped
  };
}
