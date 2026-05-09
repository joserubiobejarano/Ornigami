type SendEmailInput = {
  email_from_name?: string | null;
  business_name: string;
  customer_email: string;
  subject: string;
  body: string;
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
      text: input.body
    })
  });

  const data = (await response.json()) as ResendSendResponse;
  if (!response.ok) {
    throw new Error(data.message || `Resend request failed (${response.status})`);
  }

  return data.id || null;
}