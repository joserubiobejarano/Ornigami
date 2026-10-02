ALTER TABLE public.team_invitations
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ;

UPDATE public.team_invitations
SET status = 'accepted'
WHERE status = 'pending' AND accepted_at IS NOT NULL;

ALTER TABLE public.team_invitations
  DROP CONSTRAINT IF EXISTS team_invitations_status_check;
ALTER TABLE public.team_invitations
  ADD CONSTRAINT team_invitations_status_check
  CHECK (status IN ('pending', 'accepted', 'revoked'));
ALTER TABLE public.team_invitations
  DROP CONSTRAINT IF EXISTS team_invitations_lifecycle_fields_check;
ALTER TABLE public.team_invitations
  ADD CONSTRAINT team_invitations_lifecycle_fields_check CHECK (
    (status = 'pending' AND accepted_at IS NULL AND revoked_at IS NULL)
    OR (status = 'accepted' AND accepted_at IS NOT NULL)
    OR (status = 'revoked' AND revoked_at IS NOT NULL)
  );

DROP INDEX IF EXISTS public.idx_team_invitations_pending_email;
CREATE UNIQUE INDEX IF NOT EXISTS idx_team_invitations_pending_email
  ON public.team_invitations (business_id, lower(email))
  WHERE status = 'pending';

CREATE OR REPLACE FUNCTION public.team_has_complete_access(p_business_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
AS $$
  SELECT
    EXISTS (
      SELECT 1 FROM public.business_agents complete
      WHERE complete.business_id = p_business_id
        AND complete.plan_id = 'complete'
        AND (
          complete.status IN ('active', 'trialing')
          OR (complete.status = 'past_due' AND complete.current_period_end IS NOT NULL
              AND complete.current_period_end + INTERVAL '7 days' >= clock_timestamp())
        )
    )
    AND EXISTS (
      SELECT 1 FROM public.business_agents replies
      WHERE replies.business_id = p_business_id AND replies.agent_id = 'review_replies'
        AND (replies.status IN ('active', 'trialing')
          OR (replies.status = 'past_due' AND replies.current_period_end IS NOT NULL
              AND replies.current_period_end + INTERVAL '7 days' >= clock_timestamp()))
    )
    AND EXISTS (
      SELECT 1 FROM public.business_agents booster
      WHERE booster.business_id = p_business_id AND booster.agent_id = 'review_booster'
        AND (booster.status IN ('active', 'trialing')
          OR (booster.status = 'past_due' AND booster.current_period_end IS NOT NULL
              AND booster.current_period_end + INTERVAL '7 days' >= clock_timestamp()))
    )
$$;

-- All team lifecycle mutations lock the business row first. Acceptance and
-- member removal then lock the user row, serializing workspace admission for
-- one account across otherwise independent businesses. Checks below are new
-- PL/pgSQL statements, so READ COMMITTED sees commits after a lock wait.
CREATE OR REPLACE FUNCTION public.team_reserve_invitation(
  p_actor_id UUID,
  p_business_id UUID,
  p_email TEXT,
  p_token_hash TEXT,
  p_lifetime_days INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_owner_id UUID;
  v_invitation_id UUID;
  v_existing_user_id UUID;
  v_member_count INTEGER;
  v_pending_count INTEGER;
  v_now TIMESTAMPTZ;
  v_expires_at TIMESTAMPTZ;
BEGIN
  SELECT owner_user_id INTO v_owner_id
  FROM public.businesses WHERE id = p_business_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'business_missing'); END IF;

  PERFORM 1 FROM public.users WHERE id = p_actor_id FOR UPDATE;
  IF NOT FOUND OR v_owner_id <> p_actor_id THEN
    RETURN jsonb_build_object('status', 'forbidden');
  END IF;
  IF NOT public.team_has_complete_access(p_business_id) THEN
    RETURN jsonb_build_object('status', 'no_entitlement');
  END IF;
  v_now := clock_timestamp();
  v_expires_at := v_now + make_interval(days => greatest(1, least(p_lifetime_days, 30)));

  SELECT id INTO v_existing_user_id FROM public.users WHERE lower(email) = lower(p_email) LIMIT 1;
  IF v_existing_user_id IS NOT NULL THEN
    IF v_existing_user_id = v_owner_id OR EXISTS (
      SELECT 1 FROM public.business_members WHERE business_id = p_business_id AND user_id = v_existing_user_id
    ) THEN RETURN jsonb_build_object('status', 'already_member'); END IF;
    IF EXISTS (
      SELECT 1 FROM public.business_members bm WHERE bm.user_id = v_existing_user_id AND bm.business_id <> p_business_id
    ) OR EXISTS (
      SELECT 1 FROM public.businesses b WHERE b.owner_user_id = v_existing_user_id AND b.id <> p_business_id
    ) THEN RETURN jsonb_build_object('status', 'another_workspace'); END IF;
  END IF;

  SELECT id INTO v_invitation_id
  FROM public.team_invitations
  WHERE business_id = p_business_id AND lower(email) = lower(p_email) AND status = 'pending'
  FOR UPDATE;
  IF v_invitation_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.team_invitations
    WHERE id = v_invitation_id AND expires_at > v_now
  ) THEN RETURN jsonb_build_object('status', 'already_pending'); END IF;

  SELECT 1 + count(DISTINCT bm.user_id)::INTEGER INTO v_member_count
  FROM public.businesses b
  LEFT JOIN public.business_members bm ON bm.business_id = b.id AND bm.user_id <> b.owner_user_id
  WHERE b.id = p_business_id
  GROUP BY b.owner_user_id;
  SELECT count(*)::INTEGER INTO v_pending_count
  FROM public.team_invitations
  WHERE business_id = p_business_id AND status = 'pending' AND expires_at > v_now
    AND id IS DISTINCT FROM v_invitation_id;
  IF v_member_count + v_pending_count >= 3 THEN
    RETURN jsonb_build_object('status', 'seats_full');
  END IF;

  IF v_invitation_id IS NULL THEN
    INSERT INTO public.team_invitations (business_id, invited_by, email, role, token_hash, expires_at, status)
    VALUES (p_business_id, p_actor_id, lower(p_email), 'member', p_token_hash, v_expires_at, 'pending')
    RETURNING id INTO v_invitation_id;
  ELSE
    UPDATE public.team_invitations
    SET invited_by = p_actor_id, email = lower(p_email), role = 'member', token_hash = p_token_hash,
        expires_at = v_expires_at, created_at = v_now, accepted_at = NULL, revoked_at = NULL, status = 'pending'
    WHERE id = v_invitation_id;
  END IF;
  RETURN jsonb_build_object('status', 'reserved', 'invitationId', v_invitation_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.team_accept_invitation(p_user_id UUID, p_token_hash TEXT)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_business_id UUID;
  v_owner_id UUID;
  v_user_email TEXT;
  v_user_verified TIMESTAMPTZ;
  v_invitation_id UUID;
  v_invitation_email TEXT;
  v_member_count INTEGER;
  v_pending_count INTEGER;
  v_now TIMESTAMPTZ;
BEGIN
  SELECT business_id INTO v_business_id
  FROM public.team_invitations WHERE token_hash = p_token_hash AND status = 'pending';
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'invalid'); END IF;

  SELECT owner_user_id INTO v_owner_id
  FROM public.businesses WHERE id = v_business_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'invalid'); END IF;

  SELECT lower(email), email_verified INTO v_user_email, v_user_verified
  FROM public.users WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'unauthorized'); END IF;
  v_now := clock_timestamp();

  SELECT id, lower(email) INTO v_invitation_id, v_invitation_email
  FROM public.team_invitations
  WHERE token_hash = p_token_hash AND business_id = v_business_id AND status = 'pending'
    AND expires_at > v_now
  FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
  IF v_user_verified IS NULL OR v_user_email <> v_invitation_email THEN
    RETURN jsonb_build_object('status', 'email_mismatch');
  END IF;
  IF NOT public.team_has_complete_access(v_business_id) THEN
    RETURN jsonb_build_object('status', 'no_entitlement');
  END IF;
  IF (SELECT owner_user_id FROM public.businesses WHERE id = v_business_id) = p_user_id THEN
    RETURN jsonb_build_object('status', 'already_member');
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.business_members WHERE user_id = p_user_id AND business_id <> v_business_id
  ) OR EXISTS (
    SELECT 1 FROM public.businesses WHERE owner_user_id = p_user_id AND id <> v_business_id
  ) THEN RETURN jsonb_build_object('status', 'another_workspace'); END IF;

  SELECT 1 + count(DISTINCT bm.user_id)::INTEGER INTO v_member_count
  FROM public.businesses b
  LEFT JOIN public.business_members bm ON bm.business_id = b.id AND bm.user_id <> b.owner_user_id
  WHERE b.id = v_business_id GROUP BY b.owner_user_id;
  SELECT count(*)::INTEGER INTO v_pending_count
  FROM public.team_invitations
  WHERE business_id = v_business_id AND status = 'pending' AND expires_at > v_now;
  IF NOT EXISTS (SELECT 1 FROM public.business_members WHERE business_id = v_business_id AND user_id = p_user_id)
    AND v_member_count + v_pending_count > 3 THEN
    RETURN jsonb_build_object('status', 'seats_full');
  END IF;

  INSERT INTO public.business_members (business_id, user_id, role)
  VALUES (v_business_id, p_user_id, 'member')
  ON CONFLICT (business_id, user_id) DO NOTHING;
  UPDATE public.team_invitations
  SET status = 'accepted', accepted_at = now(), revoked_at = NULL
  WHERE id = v_invitation_id AND status = 'pending' AND token_hash = p_token_hash;
  RETURN jsonb_build_object('status', 'accepted', 'businessId', v_business_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.team_revoke_invitation(p_actor_id UUID, p_invitation_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_business_id UUID;
  v_owner_id UUID;
  v_changed INTEGER;
BEGIN
  SELECT business_id INTO v_business_id FROM public.team_invitations WHERE id = p_invitation_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'not_found'); END IF;
  SELECT owner_user_id INTO v_owner_id FROM public.businesses WHERE id = v_business_id FOR UPDATE;
  IF NOT FOUND OR v_owner_id <> p_actor_id THEN RETURN jsonb_build_object('status', 'forbidden'); END IF;
  UPDATE public.team_invitations
  SET status = 'revoked', revoked_at = now()
  WHERE id = p_invitation_id AND business_id = v_business_id AND status = 'pending';
  GET DIAGNOSTICS v_changed = ROW_COUNT;
  IF v_changed = 0 THEN RETURN jsonb_build_object('status', 'not_pending'); END IF;
  RETURN jsonb_build_object('status', 'revoked');
END;
$$;

CREATE OR REPLACE FUNCTION public.team_remove_member(p_actor_id UUID, p_business_id UUID, p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_owner_id UUID;
  v_member_email TEXT;
  v_changed INTEGER;
BEGIN
  SELECT owner_user_id INTO v_owner_id FROM public.businesses WHERE id = p_business_id FOR UPDATE;
  IF NOT FOUND OR v_owner_id <> p_actor_id THEN RETURN jsonb_build_object('status', 'forbidden'); END IF;
  IF p_user_id = v_owner_id THEN RETURN jsonb_build_object('status', 'owner_protected'); END IF;
  SELECT lower(email) INTO v_member_email FROM public.users WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'not_found'); END IF;
  DELETE FROM public.business_members WHERE business_id = p_business_id AND user_id = p_user_id;
  GET DIAGNOSTICS v_changed = ROW_COUNT;
  IF v_changed = 0 THEN RETURN jsonb_build_object('status', 'not_found'); END IF;
  UPDATE public.team_invitations
  SET status = 'revoked', revoked_at = now()
  WHERE business_id = p_business_id AND lower(email) = v_member_email AND status = 'pending';
  RETURN jsonb_build_object('status', 'removed');
END;
$$;

CREATE OR REPLACE FUNCTION public.team_cleanup_invitation(p_invitation_id UUID, p_token_hash TEXT)
RETURNS BOOLEAN
LANGUAGE SQL
AS $$
  WITH deleted AS (
    DELETE FROM public.team_invitations
    WHERE id = p_invitation_id AND token_hash = p_token_hash AND status = 'pending'
    RETURNING 1
  )
  SELECT EXISTS (SELECT 1 FROM deleted)
$$;
