import type {
  EmailProvider,
  SendEmailParams,
  SendEmailResult,
} from "@/server/services/notifications/email/email-provider";

export class ResendEmailProvider implements EmailProvider {
  constructor(_input: { apiKey: string; from: string }) {}

  async send(params: SendEmailParams): Promise<SendEmailResult> {
    void params;
    throw new Error("Historical Contactor sender is disabled; use an enrolled mail authority adapter.");
  }
}

export function hasResendConfiguration(): boolean {
  return false;
}
