export type SendEmailParams = {
  to: string;
  subject: string;
  text: string;
  metadata?: Record<string, unknown>;
};

export type SendEmailResult = {
  provider: "mock" | "resend";
  providerMessageId: string | null;
};

export interface EmailProvider {
  send(params: SendEmailParams): Promise<SendEmailResult>;
}
