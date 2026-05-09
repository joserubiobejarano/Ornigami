ALTER TABLE public.businesses
ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;

ALTER TABLE public.business_agents
ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;

ALTER TABLE public.business_agents
ADD COLUMN IF NOT EXISTS stripe_price_id TEXT;

ALTER TABLE public.business_agents
ADD COLUMN IF NOT EXISTS current_period_end TIMESTAMPTZ;
