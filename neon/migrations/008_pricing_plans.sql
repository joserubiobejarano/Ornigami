ALTER TABLE public.business_agents ADD COLUMN IF NOT EXISTS plan_id TEXT;
ALTER TABLE public.business_agents ADD COLUMN IF NOT EXISTS billing_period TEXT;
ALTER TABLE public.business_agents ADD COLUMN IF NOT EXISTS price_locked_until TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS public.stripe_events (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_business_agents_plan_id ON public.business_agents(plan_id);