import { safeLogger } from "@/lib/safe-logger";
import { getOptionalEnv } from "@/lib/env";

type NewReviewAlertReview = {
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
  recipientEmail: string;
  businessName: string;
  locationName: string;
  reviews: NewReviewAlertReview[];
  signal?: AbortSignal;
  required?: boolean;
}): Promise<void> {
  if (input.reviews.length === 0) return;
  const resendApiKey = getOptionalEnv("RESEND_API_KEY");
  const emailFrom = getOptionalEnv("EMAIL_FROM");
  const replyToEmail = getOptionalEnv("REPLY_TO_EMAIL");
  if (!resendApiKey || !emailFrom) {
    safeLogger.warn("review.alert.skipped_missing_email_config", { count: input.reviews.length });
    if (input.required) throw new Error("Review alert email configuration is unavailable");
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

  let response: Response;
  try {
    response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `Ornigami <${emailFrom}>`,
        to: input.recipientEmail,
        subject,
        text: `${text}\n\nLocation: ${input.locationName}`,
        html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#0f172a;"><h2>${escapeHtml(subject)}</h2><p>Location: ${escapeHtml(input.locationName)}</p><ul>${reviewLines}</ul></div>`,
        reply_to: replyToEmail || emailFrom,
      }),
      signal: input.signal ? AbortSignal.any([input.signal, AbortSignal.timeout(10_000)]) : AbortSignal.timeout(10_000),
    });
  } catch {
    throw new Error("Review alert provider request failed or timed out");
  }

  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    safeLogger.warn("review.alert.send_failed", { status: response.status });
    throw new Error("Review alert provider rejected the request");
  }
  await response.body?.cancel().catch(() => undefined);
}
