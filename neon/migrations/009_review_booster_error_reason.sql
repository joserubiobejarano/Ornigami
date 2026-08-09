ALTER TABLE public.followup_visits
ADD COLUMN IF NOT EXISTS last_error TEXT;