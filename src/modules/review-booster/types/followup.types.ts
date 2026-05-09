export type FollowupStatus = "pending" | "sent" | "failed" | "skipped";

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
  followup_sent_at?: string | Date | null;
  google_review_url?: string | null;
  rebooking_url?: string | null;
  tone?: string | null;
  language?: string | null;
  email_from_name?: string | null;
};

export type FollowupRunResult = {
  ok: true;
  scanned: number;
  sent: number;
  failed: number;
  skipped: number;
};

export type FollowupStats = {
  pending: number;
  sent: number;
  failed: number;
  skipped: number;
};