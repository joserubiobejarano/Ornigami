import { buildSubject, generateFollowupEmailBody } from "@/modules/review-booster/services/followup-email-generator.service";
import {
  createFollowupMessage,
  hasSentMessageForVisit,
  listEligibleFollowupVisits,
  markVisitFailed,
  markVisitSent
} from "@/modules/review-booster/services/review-booster-db.service";
import { sendWithResend } from "@/modules/review-booster/services/resend.provider";
import { FollowupRunResult, FollowupVisit } from "@/modules/review-booster/types/followup.types";

export type FollowupRunnerDependencies = {
  listEligibleVisits: () => Promise<FollowupVisit[]>;
  hasSentMessageForVisit: (visitId: string) => Promise<boolean>;
  markVisitSent: (visitId: string) => Promise<void>;
  markVisitFailed: (visitId: string, errorMessage: string) => Promise<void>;
  recordSentMessage: (input: {
    visitId: string;
    businessId: string;
    subject: string;
    body: string;
    providerMessageId: string | null;
  }) => Promise<void>;
  recordFailedMessage: (input: {
    visitId: string;
    businessId: string;
    subject: string;
    body: string;
    errorMessage: string;
  }) => Promise<void>;
};

export async function runEligibleFollowups(deps: FollowupRunnerDependencies): Promise<FollowupRunResult> {
  const visits = await deps.listEligibleVisits();
  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const visit of visits) {
    const alreadySent = await deps.hasSentMessageForVisit(visit.id);
    if (alreadySent) {
      skipped += 1;
      continue;
    }

    if (!visit.google_review_url) {
      skipped += 1;
      const missingUrlError = "Missing google_review_url";
      await deps.markVisitFailed(visit.id, missingUrlError);
      await deps.recordFailedMessage({
        visitId: visit.id,
        businessId: visit.business_id,
        subject: buildSubject(visit.business_name || "your business"),
        body: "",
        errorMessage: missingUrlError
      });
      continue;
    }

    const subject = buildSubject(visit.business_name || "your business");
    const body = await generateFollowupEmailBody({
      business_name: visit.business_name || "Your Business",
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
        business_name: visit.business_name || "Your Business",
        customer_email: String(visit.customer_email || ""),
        subject,
        body
      });

      await deps.recordSentMessage({
        visitId: visit.id,
        businessId: visit.business_id,
        subject,
        body,
        providerMessageId
      });
      await deps.markVisitSent(visit.id);
      sent += 1;
    } catch (error) {
      const errorMessage = String(error);
      await deps.recordFailedMessage({
        visitId: visit.id,
        businessId: visit.business_id,
        subject,
        body,
        errorMessage
      });
      await deps.markVisitFailed(visit.id, errorMessage);
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

export function createFollowupRunnerDependencies(businessId: string): FollowupRunnerDependencies {
  // TODO: enforce caller/user permission checks for this businessId in route/action layer.
  return {
    listEligibleVisits: () => listEligibleFollowupVisits(businessId),
    hasSentMessageForVisit,
    markVisitSent,
    markVisitFailed,
    recordSentMessage: async (input) => {
      await createFollowupMessage({
        visitId: input.visitId,
        businessId: input.businessId,
        subject: input.subject,
        body: input.body,
        providerMessageId: input.providerMessageId,
        status: "sent",
        sentAt: new Date().toISOString()
      });
    },
    recordFailedMessage: async (input) => {
      await createFollowupMessage({
        visitId: input.visitId,
        businessId: input.businessId,
        subject: input.subject,
        body: input.body,
        status: "failed",
        errorMessage: input.errorMessage
      });
    }
  };
}
