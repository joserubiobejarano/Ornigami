import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

const optionalNonEmptyString = z.preprocess(
  (value) => (typeof value === "string" && value.trim().length === 0 ? undefined : value),
  z.string().min(1).optional(),
);

export const env = createEnv({
  server: {
    DATABASE_URL: z.url(),
    OPENAI_API_KEY: z.string().min(1),
    OPENAI_MODEL: z.string().min(1).default("gpt-4.1-mini"),
    TWILIO_ACCOUNT_SID: z.string().min(1),
    TWILIO_AUTH_TOKEN: z.string().min(1),
    TWILIO_SMS_FROM: optionalNonEmptyString,
    TWILIO_WHATSAPP_FROM: optionalNonEmptyString,
    TWILIO_WEBHOOK_AUTH_TOKEN: z.string().min(1),
    TWILIO_WEBHOOK_BASE_URL: z.url().optional(),
    RESEND_API_KEY: optionalNonEmptyString,
    EMAIL_FROM: optionalNonEmptyString,
    TWILIO_VALIDATE_WEBHOOK_SIGNATURE: z
      .string()
      .transform((value) => value.toLowerCase() !== "false")
      .default(true),
    LOW_INTENT_MESSAGE_LIMIT: z.coerce.number().int().positive().default(5),
    OFF_TOPIC_MESSAGE_LIMIT: z.coerce.number().int().positive().default(3),
    INBOUND_BURST_WINDOW_SECONDS: z.coerce.number().int().positive().default(90),
    INBOUND_BURST_MESSAGE_LIMIT: z.coerce.number().int().positive().default(6),
    INBOUND_SPAM_MESSAGE_LIMIT: z.coerce.number().int().positive().default(9),
    FAST_REPLY_LATENCY_THRESHOLD_MS: z.coerce.number().int().positive().default(3000),
    FORM_RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().positive().default(600),
    FORM_RATE_LIMIT_MAX_SUBMISSIONS: z.coerce.number().int().positive().default(3),
    APP_BASE_URL: z.url().optional(),
    CRON_SECRET: optionalNonEmptyString,
  },
  client: {},
  runtimeEnv: {
    DATABASE_URL: process.env.DATABASE_URL,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    OPENAI_MODEL: process.env.OPENAI_MODEL,
    TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID,
    TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN,
    TWILIO_SMS_FROM: process.env.TWILIO_SMS_FROM,
    TWILIO_WHATSAPP_FROM: process.env.TWILIO_WHATSAPP_FROM,
    TWILIO_WEBHOOK_AUTH_TOKEN: process.env.TWILIO_WEBHOOK_AUTH_TOKEN,
    TWILIO_WEBHOOK_BASE_URL: process.env.TWILIO_WEBHOOK_BASE_URL,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    EMAIL_FROM: process.env.EMAIL_FROM,
    TWILIO_VALIDATE_WEBHOOK_SIGNATURE:
      process.env.TWILIO_VALIDATE_WEBHOOK_SIGNATURE,
    LOW_INTENT_MESSAGE_LIMIT: process.env.LOW_INTENT_MESSAGE_LIMIT,
    OFF_TOPIC_MESSAGE_LIMIT: process.env.OFF_TOPIC_MESSAGE_LIMIT,
    INBOUND_BURST_WINDOW_SECONDS: process.env.INBOUND_BURST_WINDOW_SECONDS,
    INBOUND_BURST_MESSAGE_LIMIT: process.env.INBOUND_BURST_MESSAGE_LIMIT,
    INBOUND_SPAM_MESSAGE_LIMIT: process.env.INBOUND_SPAM_MESSAGE_LIMIT,
    FAST_REPLY_LATENCY_THRESHOLD_MS: process.env.FAST_REPLY_LATENCY_THRESHOLD_MS,
    FORM_RATE_LIMIT_WINDOW_SECONDS: process.env.FORM_RATE_LIMIT_WINDOW_SECONDS,
    FORM_RATE_LIMIT_MAX_SUBMISSIONS: process.env.FORM_RATE_LIMIT_MAX_SUBMISSIONS,
    APP_BASE_URL: process.env.APP_BASE_URL,
    CRON_SECRET: process.env.CRON_SECRET,
  },
});
