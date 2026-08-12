import { buildUnsubscribeUrl } from "@/modules/review-booster/services/unsubscribe-token.service";

type SendEmailInput = {
  business_id?: string | null;
  email_from_name?: string | null;
  business_name: string;
  customer_email: string;
  subject: string;
  body: string;
  google_review_url: string;
  review_link_url?: string | null;
  reply_to_email?: string | null;
};

type ResendSendResponse = {
  id?: string;
  message?: string;
  name?: string;
  statusCode?: number;
};

export async function sendWithResend(input: SendEmailInput) {
  if (!process.env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY is not set");
  }

  if (!process.env.EMAIL_FROM) {
    throw new Error("EMAIL_FROM is not set");
  }

  const fromName = input.email_from_name || input.business_name;
  const from = `${fromName} <${process.env.EMAIL_FROM}>`;
  const safeBody = input.body
    .split("&")
    .join("&amp;")
    .split("<")
    .join("&lt;")
    .split(">")
    .join("&gt;");
  const reviewLinkUrl = (input.review_link_url || input.google_review_url || "").trim();
  if (!reviewLinkUrl) {
    throw new Error("Missing google review URL");
  }
  const unsubscribeUrl = input.business_id
    ? buildUnsubscribeUrl({
        businessId: input.business_id,
        customerEmail: input.customer_email,
      })
    : null;

  const bodyHtml = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #0f172a;">
      <p>${safeBody.replace(/\n\n/g, "</p><p>").replace(/\n/g, "<br/>")}</p>
      <p style="margin-top: 16px;">
        <a href="${reviewLinkUrl}" style="display:inline-block;background:#6d28d9;color:#ffffff;text-decoration:none;padding:10px 14px;border-radius:8px;font-weight:600;">
          Leave your review
        </a>
      </p>
      ${
        unsubscribeUrl
          ? `<p style="margin-top: 18px; font-size: 12px; color: #64748b;">Don't want future follow-up emails? <a href="${unsubscribeUrl}" style="color:#334155;">Unsubscribe</a>.</p>`
          : ""
      }
    </div>
  `.trim();

  const textUnsubscribe = unsubscribeUrl
    ? `\n\nDon't want future follow-up emails? Unsubscribe: ${unsubscribeUrl}`
    : "";

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from,
      to: input.customer_email,
      subject: input.subject,
      text: `${input.body}\n\nLeave your review: ${reviewLinkUrl}${textUnsubscribe}`,
      html: bodyHtml,
      reply_to: input.reply_to_email || process.env.REPLY_TO_EMAIL || process.env.EMAIL_FROM,
      ...(unsubscribeUrl ? {
        headers: {
          "List-Unsubscribe": `<${unsubscribeUrl}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click"
        }
      } : {})
    })
  });

  const data = (await response.json()) as ResendSendResponse;
  if (!response.ok) {
    throw new Error(data.message || `Resend request failed (${response.status})`);
  }

  return data.id || null;
}
