/** Existing approved cleanup windows. Keep this shape stable for compatibility. */
export const PRIVACY_RETENTION_DAYS = {
  leads: 90,
  feedback: 365,
  publicDemoEvents: 90,
  reviewLinkClicks: 90,
  followupIntegrationEvents: 90,
  followupIntegrationEventKeys: 365,
  contactContent: 90,
  rawDeliveryDiagnostics: 30,
  deliveryEvidence: 365,
  permissionEvidence: 365,
  resolvedOperationEvidence: 365,
  terminatedWorkspace: 90,
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
  "followup_integration_event_keys",
  "followup_integration_event_details",
  "booster_delivery_content",
  "booster_delivery_diagnostics",
  "booster_delivery_events",
  "booster_delivery_provider_correlations",
  "cron_runs",
  "followup_messages",
  "followup_visit_diagnostics",
  "followup_message_diagnostics",
  "followup_message_evidence",
  "followup_visits",
  "privacy_account_deletion_operations",
] as const;

export const PRIVACY_CLEANUP_TABLES = [
  ...PRIVACY_CLEANUP_OPERATIONS,
  "password_reset_tokens",
] as const;

export const PRIVACY_CLEANUP_BATCH_SIZE = 250;
export const PRIVACY_CLEANUP_MAX_BATCH_SIZE = 1000;
export const PUBLIC_DEMO_CHALLENGE_EXPIRY_GRACE_DAYS = 1;
/** Mutation needs deployment activation plus an explicit per-run choice. */
export const PRIVACY_RETENTION_ENABLED = process.env.PRIVACY_RETENTION_ENABLED === "true";
export const PRIVACY_RETENTION_DEFAULT_DRY_RUN = true;
export const PRIVACY_GUARDED_CLEANUP_OPERATIONS = [
  "review_link_clicks",
  "followup_integration_event_details",
  "followup_integration_event_keys",
  "followup_messages",
  "followup_message_diagnostics",
  "followup_message_evidence",
  "followup_visit_diagnostics",
  "followup_visits",
  "booster_delivery_content",
  "booster_delivery_diagnostics",
  "booster_delivery_events",
  "booster_delivery_provider_correlations",
  "privacy_account_deletion_operations",
] as const;

/**
 * These durable ledgers and eligibility fences are not removed by routine
 * content cleanup. Personal content may be scrubbed while keys and outcomes
 * remain. Unsubscribe and trial anti-abuse evidence has no automatic expiry.
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
