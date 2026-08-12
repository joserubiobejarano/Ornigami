export const PRIVACY_RETENTION_DAYS = {
  leads: 90,
  feedback: 365,
  publicDemoEvents: 90,
  reviewLinkClicks: 365,
  followupIntegrationEvents: 365,
  cronRuns: 30,
  rateLimitState: 2,
} as const;

export function dateDaysAgo(days: number, now = Date.now()): Date {
  return new Date(now - days * 24 * 60 * 60 * 1000);
}
