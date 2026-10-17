import { safeLogger } from "@/lib/safe-logger";
import { getOptionalEnv } from "@/lib/env";
import { createHash } from "node:crypto";
import { beginAccountLifecycleOperation, finishAccountLifecycleOperation } from "@/lib/account-lifecycle";
import { qrMailConfigured, sendAuthorizedResend } from "@/lib/qr-mail";

type NewReviewAlertReview = {
  eventId?: string;
  reviewerName: string | null;
  starRating: number | null;
  comment: string | null;
};

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export async function sendNewReviewAlert(input: {
  ownerUserId: string;
  actorUserId?: string;
  businessId: string;
  recipientEmail: string;
  businessName: string;
  locationName: string;
  reviews: NewReviewAlertReview[];
  signal?: AbortSignal;
  required?: boolean;
}): Promise<void> {
  if (input.reviews.length === 0) return;
  if (!qrMailConfigured("review_alert")) {
    safeLogger.warn("review.alert.skipped_mail_authority_unavailable", { count: input.reviews.length });
    if (input.required) throw new Error("Review alert mail authorization is unavailable");
    return;
  }
  const resendApiKey = getOptionalEnv("RESEND_API_KEY");
  const emailFrom = getOptionalEnv("EMAIL_FROM");
  const replyToEmail = getOptionalEnv("REPLY_TO_EMAIL");
  if (!resendApiKey || !emailFrom) {
    safeLogger.warn("review.alert.skipped_missing_email_config", { count: input.reviews.length });
    if (input.required) throw new Error("Review alert email configuration is unavailable");
    return;
  }

  const operation = await beginAccountLifecycleOperation({
    userId: input.ownerUserId, actorUserId: input.actorUserId, businessId: input.businessId,
    kind: "resend_review_alert", idempotencyKey: `review-alert:${createHash("sha256").update(input.reviews.map((review) => review.eventId ?? "").sort().join("\n") || JSON.stringify(input.reviews)).digest("hex")}`, leaseMs: 25_000,
  });
  if (operation.result !== "claimed" || !operation.token) {
    if (input.required) throw new Error("Review alert lifecycle admission is unavailable");
    return;
  }

  const subject = input.reviews.length === 1
    ? `New Google review for ${input.businessName}`
    : `${input.reviews.length} new Google reviews for ${input.businessName}`;
  const reviewLines = input.reviews.map((review) => {
    const rating = review.starRating ? `${review.starRating}/5` : "Rating unavailable";
    const reviewer = escapeHtml(review.reviewerName || "A customer");
    const comment = review.comment ? escapeHtml(review.comment) : "No written comment";
    return `<li style="margin-bottom:16px;"><strong>${reviewer}</strong> — ${rating}<br/><span>${comment}</span></li>`;
  }).join("");
  const text = input.reviews.map((review) => {
    const rating = review.starRating ? `${review.starRating}/5` : "Rating unavailable";
    return `${review.reviewerName || "A customer"} — ${rating}\n${review.comment || "No written comment"}`;
  }).join("\n\n");

  try {
    const payload = JSON.stringify({
        from: `Ornigami <${emailFrom}>`,
        to: input.recipientEmail,
        subject,
        text: `${text}\n\nLocation: ${input.locationName}`,
        html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#0f172a;"><h2>${escapeHtml(subject)}</h2><p>Location: ${escapeHtml(input.locationName)}</p><ul>${reviewLines}</ul></div>`,
        reply_to: replyToEmail || emailFrom,
    });
    const sourceEvents = input.reviews.map((review) => review.eventId).filter((id): id is string => Boolean(id)).sort();
    const workKey = `review-alert:${createHash("sha256").update(sourceEvents.length ? sourceEvents.join("\n") : payload).digest("hex")}`;
    await sendAuthorizedResend(payload, {
      purpose: "review_alert", businessId: input.businessId, candidateId: workKey, workKey,
      idempotencyKey: workKey, transportContext: { event_count: input.reviews.length },
    }, input.signal);
  } catch (error) {
    const unknown = error instanceof Error && error.name === "QrMailOutcomeUnknownError";
    await finishAccountLifecycleOperation(operation.token, unknown ? "uncertain" : "failed").catch(() => false);
    if (unknown) throw new Error("Review alert provider outcome is unknown; do not resend it.");
    throw new Error("Review alert mail authorization or provider request failed");
  }
  if (!await finishAccountLifecycleOperation(operation.token, "done")) {
    throw new Error("Review alert lifecycle completion could not be confirmed");
  }
}
