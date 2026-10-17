type SendEmailInput = {
  email_from_name?: string | null;
  business_name: string;
  customer_email: string;
  subject: string;
  body: string;
};

/** Historical migration source is not an enrolled runtime sender. */
export async function sendWithResend(_input: SendEmailInput): Promise<never> {
  throw new Error("Historical follow-up sender is disabled; use the enrolled Review Booster transport.");
}
