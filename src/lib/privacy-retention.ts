export const PRIVACY_RETENTION_DAYS = {
  leads: 90,
  feedback: 365,
  publicDemoEvents: 90,
  reviewLinkClicks: 365,
  followupIntegrationEvents: 365,
  cronRuns: 30,
  rateLimitState: 2,
} as const;

export const PRIVACY_CLEANUP_OPERATIONS = [
  "leads",
  "feedback",
  "public_demo_events",
  "public_demo_email_challenges",
  "api_rate_limits",
  "auth_login_attempts",
  "email_verification_tokens",
  "review_link_clicks",
  "followup_integration_events",
  "cron_runs",
] as const;

export function dateDaysAgo(days: number, now = Date.now()): Date {
  return new Date(now - days * 24 * 60 * 60 * 1000);
}
