import { Resend } from "resend";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

type SendEmailInput = {
  email_from_name?: string | null;
  business_name: string;
  customer_email: string;
  subject: string;
  body: string;
};

export async function sendWithResend(input: SendEmailInput) {
  if (!resend) {
    throw new Error("RESEND_API_KEY is not set");
  }

  if (!process.env.EMAIL_FROM) {
    throw new Error("EMAIL_FROM is not set");
  }

  const fromName = input.email_from_name || input.business_name;
  const from = `${fromName.replace(/[<>\r\n]/g, "").slice(0, 120)} <${process.env.EMAIL_FROM}>`;

  const result = await resend.emails.send({
    from,
    to: input.customer_email,
    subject: input.subject,
    text: input.body
  });

  if (result.error) {
    throw new Error(result.error.message);
  }

  return result.data?.id || null;
}
