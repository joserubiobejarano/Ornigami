export const PRIVACY_RETENTION_DAYS = {
  operationalRecords: 365,
  rateLimitState: 2,
} as const;

export function dateDaysAgo(days: number, now = Date.now()): Date {
  return new Date(now - days * 24 * 60 * 60 * 1000);
}
