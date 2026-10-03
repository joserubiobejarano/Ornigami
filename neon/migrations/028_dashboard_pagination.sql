-- A13 dashboard read paths: stable business-scoped keyset pagination.
-- Additive indexes only; no live environment has been modified by this change.

CREATE INDEX IF NOT EXISTS reviews_business_location_page_idx
  ON public.reviews (
    business_id, location_name,
    (COALESCE(review_update_time, '-infinity'::timestamptz)) DESC,
    id DESC
  );

CREATE INDEX IF NOT EXISTS followup_visits_business_page_idx
  ON public.followup_visits (business_id, visited_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS followup_visits_business_eligible_page_idx
  ON public.followup_visits (business_id, visited_at ASC, id ASC)
  WHERE followup_sent_at IS NULL;

CREATE INDEX IF NOT EXISTS review_replies_business_posted_idx
  ON public.review_replies (business_id, posted);

CREATE INDEX IF NOT EXISTS followup_visits_business_status_idx
  ON public.followup_visits (business_id, lower(followup_status));
