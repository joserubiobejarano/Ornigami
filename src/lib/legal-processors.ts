export const LEGAL_PROCESSORS = [
  "Google",
  "OpenAI",
  "Resend",
  "Stripe",
  "Sentry",
  "Neon",
] as const;

export const LEGAL_PROCESSOR_LIST = LEGAL_PROCESSORS.join(", ");
