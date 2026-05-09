import { FollowupStats, FollowupVisit } from "@/modules/review-booster/types/followup.types";

export type BusinessSettingsInput = {
  name: string;
  business_type?: string;
  city?: string;
  google_review_url: string;
  rebooking_url?: string;
  tone?: string;
  language?: string;
  email_from_name?: string;
};

export type CsvDuplicateLookupInput = {
  business_id: string;
  customer_email: string;
  service_name?: string;
  visited_at: string;
};

export function emptyFollowupStats(): FollowupStats {
  return { pending: 0, sent: 0, failed: 0, skipped: 0 };
}

export function computeFollowupStats(visits: Array<Pick<FollowupVisit, "followup_status">>): FollowupStats {
  return visits.reduce<FollowupStats>((acc, visit) => {
    const status = String(visit.followup_status || "").toLowerCase();
    if (status === "pending") acc.pending += 1;
    else if (status === "sent") acc.sent += 1;
    else if (status === "failed") acc.failed += 1;
    else if (status === "skipped") acc.skipped += 1;
    return acc;
  }, emptyFollowupStats());
}

export function isVisitEligibleForFollowup(visit: Pick<FollowupVisit, "followup_status" | "followup_sent_at" | "customer_email">): boolean {
  const status = String(visit.followup_status || "").toLowerCase();
  if (status !== "pending") return false;
  if (visit.followup_sent_at) return false;
  return Boolean(visit.customer_email && String(visit.customer_email).trim().length > 0);
}

export function normalizeBusinessSettings(input: BusinessSettingsInput): BusinessSettingsInput {
  return {
    ...input,
    name: input.name.trim(),
    business_type: input.business_type?.trim() || undefined,
    city: input.city?.trim() || undefined,
    google_review_url: input.google_review_url.trim(),
    rebooking_url: input.rebooking_url?.trim() || undefined,
    tone: input.tone?.trim() || "warm and friendly",
    language: input.language?.trim() || "en",
    email_from_name: input.email_from_name?.trim() || undefined
  };
}

// DB-bound helpers now live in review-booster-db.service.ts and require explicit business scoping.
