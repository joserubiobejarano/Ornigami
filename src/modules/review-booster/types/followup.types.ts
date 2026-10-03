export type FollowupStatus = "pending" | "sent" | "failed" | "skipped" | "deferred_quota" | "expired" | "non_sendable" | "reconciliation_required";

export type FollowupVisit = {
  id: string;
  business_id: string;
  business_name?: string | null;
  business_type?: string | null;
  city?: string | null;
  customer_name?: string | null;
  customer_email?: string | null;
  customer_phone?: string | null;
  service_name?: string | null;
  visited_at: string | Date;
  source?: string | null;
  followup_status: FollowupStatus | string;
  /** Durable Resend delivery projection. `sent` means provider accepted the email, not delivered. */
  delivery_id?: string | null;
  delivery_status?: "pending" | "sent" | "delayed" | "delivered" | "failed" | "suppressed" | "bounced" | "complained" | string | null;
  delivery_status_at?: string | Date | null;
  followup_sent_at?: string | Date | null;
  google_review_url?: string | null;
  rebooking_url?: string | null;
  tone?: string | null;
  language?: string | null;
  email_from_name?: string | null;
  error_reason?: string | null;
  attempt_count?: number;
  next_attempt_at?: string | Date | null;
};

export type FollowupRunResult = {
  ok: true;
  scanned: number;
  sent: number;
  failed: number;
  skipped: number;
  unknown: number;
  deferred: number;
};

export type FollowupStats = {
  pending: number;
  sent: number;
  failed: number;
  skipped: number;
};
