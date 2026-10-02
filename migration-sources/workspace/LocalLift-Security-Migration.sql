CREATE TABLE IF NOT EXISTS public.email_verification_tokens (
  user_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

UPDATE public.users SET email_verified = COALESCE(email_verified, created_at) WHERE email_verified IS NULL;
