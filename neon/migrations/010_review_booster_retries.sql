ALTER TABLE public.followup_visits ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.followup_visits ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMPTZ;