/** Existing approved cleanup windows. Keep this shape stable for compatibility. */
export const PRIVACY_RETENTION_DAYS = {
  leads: 90,
  feedback: 365,
  publicDemoEvents: 90,
  reviewLinkClicks: 365,
  followupIntegrationEvents: 365,
  cronRuns: 30,
  rateLimitState: 2,
} as const;

/** Legacy list retained for existing callers; the cleanup service also removes expired reset tokens. */
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

export const PRIVACY_CLEANUP_TABLES = [
  ...PRIVACY_CLEANUP_OPERATIONS,
  "password_reset_tokens",
] as const;

export const PRIVACY_CLEANUP_BATCH_SIZE = 250;
export const PRIVACY_CLEANUP_MAX_BATCH_SIZE = 1000;
export const PUBLIC_DEMO_CHALLENGE_EXPIRY_GRACE_DAYS = 1;

/**
 * Retention is deliberately undefined for these histories. They remain intact
 * until account/workspace deletion removes them or an approved product/legal
 * policy supplies a duration. Unsubscribe and trial anti-abuse records are
 * preserved even through ordinary retention cleanup.
 */
export const PRIVACY_PRESERVED_HISTORY_CLASSES = [
  "followup_visits",
  "followup_messages",
  "booster_followup_deliveries",
  "booster_delivery_events",
  "booster_delivery_provider_correlations",
  "booster_delivery_suppressions",
  "booster_quota_legacy_usage",
  "reviews",
  "review_replies",
  "review_reply_draft_state",
  "review_reply_usage_reservations",
  "privacy_reply_post_outcomes",
  "billing_checkout_intents",
  "billing_customer_provisioning",
  "billing_reconciliation_leases",
  "billing_webhook_events",
  "billing_trial_reservations",
  "billing_owner_customers",
  "business_agents",
  "subscriptions",
  "user_billing",
  "billing_trial_business_history",
  "billing_trial_owner_history",
  "team_invitations",
  "booster_booking_credentials",
  "unsubscribe_suppressions",
  "privacy_account_deletion_operations",
] as const;

export function dateDaysAgo(days: number, now = Date.now()): Date {
  return new Date(now - days * 24 * 60 * 60 * 1000);
}
