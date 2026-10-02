import { env } from "@/server/env";
import type {
  EmailProvider,
  SendEmailParams,
  SendEmailResult,
} from "@/server/services/notifications/email/email-provider";

type ResendSendResponse = {
  id?: string;
  error?: {
    name?: string;
    message?: string;
  };
};

export class ResendEmailProvider implements EmailProvider {
  private readonly apiKey: string;
  private readonly from: string;

  constructor(input: { apiKey: string; from: string }) {
    this.apiKey = input.apiKey;
    this.from = input.from;
  }

  async send(params: SendEmailParams): Promise<SendEmailResult> {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: this.from,
        to: [params.to],
        subject: params.subject,
        text: params.text,
      }),
      cache: "no-store",
    });

    const payload = (await response.json().catch(() => null)) as ResendSendResponse | null;

    if (!response.ok) {
      const providerError = payload?.error?.message?.trim();
      throw new Error(
        providerError
          ? `Resend API error (${response.status}): ${providerError}`
          : `Resend API error (${response.status}).`,
      );
    }

    const providerMessageId = payload?.id?.trim() || null;
    if (!providerMessageId) {
      throw new Error("Resend did not return a message id.");
    }

    return {
      provider: "resend",
      providerMessageId,
    };
  }
}

export function hasResendConfiguration(): boolean {
  return Boolean(env.RESEND_API_KEY?.trim() && env.EMAIL_FROM?.trim());
}