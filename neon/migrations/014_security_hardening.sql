CREATE TABLE IF NOT EXISTS public.email_verification_tokens (
  user_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

UPDATE public.users SET email_verified = COALESCE(email_verified, created_at) WHERE email_verified IS NULL;

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS review_replies_used INT NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.auth_login_attempts (
  key_hash TEXT PRIMARY KEY,
  failures INT NOT NULL DEFAULT 0,
  window_started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  locked_until TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.api_rate_limits (
  key_hash TEXT PRIMARY KEY,
  window_started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  hits INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.public_demo_email_challenges (
  token_hash TEXT PRIMARY KEY,
  recipient_email TEXT NOT NULL,
  payload JSONB NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  confirmed_at TIMESTAMPTZ,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_public_demo_email_challenges_expiry ON public.public_demo_email_challenges (expires_at);
