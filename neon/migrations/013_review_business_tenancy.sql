-- Reconcile Review Replies tenancy with the business-scoped Review Booster model.
-- Keep user_id during the transition for backwards compatibility; business_id is
-- the canonical ownership key for all new reads and writes.

ALTER TABLE public.reviews
  ADD COLUMN IF NOT EXISTS business_id UUID REFERENCES public.businesses(id) ON DELETE CASCADE;

UPDATE public.reviews r
SET business_id = (
  SELECT b.id
  FROM public.businesses b
  WHERE b.owner_user_id = r.user_id
  ORDER BY created_at ASC
  LIMIT 1
)
WHERE r.business_id IS NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.reviews WHERE business_id IS NULL) THEN
    RAISE EXCEPTION 'Cannot reconcile reviews: one or more rows have no owning business';
  END IF;
END $$;

ALTER TABLE public.reviews
  ALTER COLUMN business_id SET NOT NULL;

ALTER TABLE public.reviews
  DROP CONSTRAINT IF EXISTS reviews_user_id_google_review_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS reviews_business_google_review_id_key
  ON public.reviews (business_id, google_review_id);

CREATE INDEX IF NOT EXISTS idx_reviews_business
  ON public.reviews (business_id);

CREATE INDEX IF NOT EXISTS idx_reviews_business_location
  ON public.reviews (business_id, location_name);

ALTER TABLE public.review_replies
  ADD COLUMN IF NOT EXISTS business_id UUID REFERENCES public.businesses(id) ON DELETE CASCADE;

UPDATE public.review_replies rr
SET business_id = r.business_id
FROM public.reviews r
WHERE rr.review_id = r.id
  AND rr.business_id IS NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.review_replies WHERE business_id IS NULL) THEN
    RAISE EXCEPTION 'Cannot reconcile review replies: one or more rows have no owning business';
  END IF;
END $$;

ALTER TABLE public.review_replies
  ALTER COLUMN business_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_review_replies_business
  ON public.review_replies (business_id);
