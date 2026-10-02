ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS auth_version INT NOT NULL DEFAULT 0;

ALTER TABLE public.email_verification_tokens
  ADD COLUMN IF NOT EXISTS callback_url TEXT;

CREATE TABLE IF NOT EXISTS public.password_reset_tokens (
  user_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  callback_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_expiry
  ON public.password_reset_tokens (expires_at);
