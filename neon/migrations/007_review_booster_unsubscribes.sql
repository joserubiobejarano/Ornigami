CREATE TABLE IF NOT EXISTS public.followup_unsubscribes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  customer_email TEXT NOT NULL,
  customer_email_normalized TEXT GENERATED ALWAYS AS (lower(customer_email)) STORED,
  reason TEXT,
  unsubscribed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_followup_unsubscribes_business_email
  ON public.followup_unsubscribes (business_id, customer_email_normalized);

CREATE INDEX IF NOT EXISTS idx_followup_unsubscribes_business_id
  ON public.followup_unsubscribes (business_id);
