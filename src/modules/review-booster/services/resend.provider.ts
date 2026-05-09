type SendEmailInput = {
  email_from_name?: string | null;
  business_name: string;
  customer_email: string;
  subject: string;
  body: string;
  google_review_url: string;
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

  const bodyHtml = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #0f172a;">
      <p>${safeBody.replace(/\n\n/g, "</p><p>").replace(/\n/g, "<br/>")}</p>
      <p style="margin-top: 16px;">
        <a href="${input.google_review_url}" style="display:inline-block;background:#0f172b;color:#ffffff;text-decoration:none;padding:10px 14px;border-radius:8px;font-weight:600;">
          Leave your review
        </a>
      </p>
    </div>
  `.trim();

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
      text: `${input.body}\n\nLeave your review: ${input.google_review_url}`,
      html: bodyHtml
    })
  });

  const data = (await response.json()) as ResendSendResponse;
  if (!response.ok) {
    throw new Error(data.message || `Resend request failed (${response.status})`);
  }

  return data.id || null;
}
