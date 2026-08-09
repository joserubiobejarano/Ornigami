-- Review Booster attribution: record clicks on signed review-request links.
CREATE TABLE IF NOT EXISTS public.review_link_clicks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses (id) ON DELETE CASCADE,
  visit_id UUID NOT NULL REFERENCES public.followup_visits (id) ON DELETE CASCADE,
  clicked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_agent TEXT
);

CREATE INDEX IF NOT EXISTS idx_review_link_clicks_visit ON public.review_link_clicks (visit_id, clicked_at DESC);
CREATE INDEX IF NOT EXISTS idx_review_link_clicks_business ON public.review_link_clicks (business_id, clicked_at DESC);