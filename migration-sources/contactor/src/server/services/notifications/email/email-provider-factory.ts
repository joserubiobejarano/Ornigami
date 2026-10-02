import type { EmailProvider } from "@/server/services/notifications/email/email-provider";
import { MockEmailProvider } from "@/server/services/notifications/email/mock-email.provider";
import {
  hasResendConfiguration,
  ResendEmailProvider,
} from "@/server/services/notifications/email/resend-email.provider";
import { env } from "@/server/env";

export type EmailProviderKind = "mock" | "resend" | "disabled";

export type EmailProviderStatus = {
  kind: EmailProviderKind;
  configured: boolean;
  operational: boolean;
  reason: string | null;
};

type ResolvedEmailProvider = {
  provider: EmailProvider;
  status: EmailProviderStatus;
};

class DisabledEmailProvider implements EmailProvider {
  private readonly reason: string;

  constructor(reason: string) {
    this.reason = reason;
  }

  async send(): Promise<never> {
    throw new Error(this.reason);
  }
}

let cachedProvider: ResolvedEmailProvider | null = null;

export function getEmailProviderStatus(): EmailProviderStatus {
  return resolveEmailProvider().status;
}

export function getEmailProvider(): ResolvedEmailProvider {
  return resolveEmailProvider();
}

function resolveEmailProvider(): ResolvedEmailProvider {
  if (cachedProvider) return cachedProvider;

  const hasResendConfig = hasResendConfiguration();

  if (hasResendConfig) {
    cachedProvider = {
      provider: new ResendEmailProvider({
        apiKey: env.RESEND_API_KEY!.trim(),
        from: env.EMAIL_FROM!.trim(),
      }),
      status: {
        kind: "resend",
        configured: true,
        operational: true,
        reason: null,
      },
    };

    return cachedProvider;
  }

  if (process.env.NODE_ENV !== "production") {
    cachedProvider = {
      provider: new MockEmailProvider(),
      status: {
        kind: "mock",
        configured: false,
        operational: true,
        reason: "RESEND_API_KEY or EMAIL_FROM missing; using mock provider in non-production.",
      },
    };

    return cachedProvider;
  }

  const reason =
    "Email provider is not configured in production. Set RESEND_API_KEY and EMAIL_FROM.";

  cachedProvider = {
    provider: new DisabledEmailProvider(reason),
    status: {
      kind: "disabled",
      configured: false,
      operational: false,
      reason,
    },
  };

  return cachedProvider;
}
