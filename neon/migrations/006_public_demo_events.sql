CREATE TABLE IF NOT EXISTS public.public_demo_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_date date NOT NULL DEFAULT CURRENT_DATE,
  key_type text NOT NULL CHECK (key_type IN ('email', 'ip')),
  key_hash text NOT NULL,
  count integer NOT NULL DEFAULT 1 CHECK (count >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_date, key_type, key_hash)
);

CREATE INDEX IF NOT EXISTS idx_public_demo_events_date_type
  ON public.public_demo_events (event_date, key_type);
