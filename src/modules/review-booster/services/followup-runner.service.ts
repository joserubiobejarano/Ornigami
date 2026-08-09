import { buildSubject, generateFollowupEmailBody } from "@/modules/review-booster/services/followup-email-generator.service";
import {
  createFollowupMessage,
  hasSentMessageForVisit,
  listEligibleFollowupVisits,
  markVisitFailed,
  markVisitSent,
  markVisitSkipped,
  getReviewBoosterMonthlyUsage
} from "@/modules/review-booster/services/review-booster-db.service";
import { sendWithResend } from "@/modules/review-booster/services/resend.provider";
import { buildReviewLinkUrl } from "@/lib/review-link-token";
import { FollowupRunResult, FollowupVisit } from "@/modules/review-booster/types/followup.types";
import { hasReachedMonthlyAllowance } from "@/modules/review-booster/services/fair-use";

export const MAX_FOLLOWUPS_PER_RUN = 50;

export type FollowupRunnerDependencies = {
  listEligibleVisits: () => Promise<FollowupVisit[]>;
  hasSentMessageForVisit: (visitId: string) => Promise<boolean>;
  markVisitSent: (visitId: string) => Promise<void>;
  markVisitFailed: (visitId: string, errorMessage: string) => Promise<void>;
  markVisitSkipped: (visitId: string, reason: string) => Promise<void>;
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
  getMonthlyUsage: () => Promise<{ sent: number; allowance: number }>;
};

export async function runEligibleFollowups(deps: FollowupRunnerDependencies): Promise<FollowupRunResult> {
  const eligibleVisits = await deps.listEligibleVisits();
  const visits = eligibleVisits.slice(0, MAX_FOLLOWUPS_PER_RUN);
  let sent = 0;
  let failed = 0;
  let skipped = 0;
  const monthlyUsage = await deps.getMonthlyUsage();
  const fairUseLimitReached = hasReachedMonthlyAllowance(monthlyUsage.sent, sent, monthlyUsage.allowance);

  for (const visit of visits) {
    if (fairUseLimitReached) {
      await deps.markVisitSkipped(visit.id, "fair_use_limit");
      skipped += 1;
      continue;
    }

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
        subject: buildSubject(visit.business_name || "your business", visit.language),
        body: "",
        errorMessage: missingUrlError
      });
      continue;
    }

    const subject = buildSubject(visit.business_name || "your business", visit.language);
    const body = await generateFollowupEmailBody({
      business_name: visit.business_name || "Your Business",
      business_type: visit.business_type,
      city: visit.city,
      customer_name: visit.customer_name,
      service_name: visit.service_name,
      google_review_url: visit.google_review_url,
      tone_setting: visit.tone,
      language: visit.language
    });

    try {
      const reviewLinkUrl = buildReviewLinkUrl({ businessId: visit.business_id, visitId: visit.id, reviewUrl: visit.google_review_url });
      const providerMessageId = await sendWithResend({
        business_id: visit.business_id,
        email_from_name: visit.email_from_name,
        business_name: visit.business_name || "Your Business",
        customer_email: String(visit.customer_email || ""),
        subject,
        body,
        google_review_url: visit.google_review_url,
        review_link_url: reviewLinkUrl
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
    markVisitSkipped,
    getMonthlyUsage: () => getReviewBoosterMonthlyUsage(businessId),
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
