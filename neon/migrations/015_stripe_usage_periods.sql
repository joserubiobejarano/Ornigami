ALTER TABLE public.business_agents
ADD COLUMN IF NOT EXISTS current_period_start TIMESTAMPTZ;

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS review_replies_usage_period_start TIMESTAMPTZ;
