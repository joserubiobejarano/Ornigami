import type {
  EmailProvider,
  SendEmailParams,
  SendEmailResult,
} from "@/server/services/notifications/email/email-provider";
import { safeLogger } from "@/lib/safe-logger";

export class MockEmailProvider implements EmailProvider {
  async send(params: SendEmailParams): Promise<SendEmailResult> {
    const providerMessageId = `mock-email-${Date.now()}`;

    safeLogger.info("Mock email notification sent.", {
      to: params.to,
      subject: params.subject,
      metadata: params.metadata,
      providerMessageId,
      bodyPreview: params.text.slice(0, 200),
    });

    return {
      provider: "mock",
      providerMessageId,
    };
  }
}
