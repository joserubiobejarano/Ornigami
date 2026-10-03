-- Recoverable account deletion. The ledger deliberately has no user FK so a
-- completed operation remains as a minimal, non-email audit record.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS privacy_deletion_requested_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS public.privacy_account_deletion_operations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID NOT NULL UNIQUE,
  account_role TEXT NOT NULL CHECK (account_role IN ('owner', 'member')),
  shared_workspace_confirmed BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'frozen' CHECK (status IN ('frozen', 'complete')),
  billing_complete BOOLEAN NOT NULL DEFAULT false,
  google_complete BOOLEAN NOT NULL DEFAULT false,
  billing_checked_at TIMESTAMPTZ,
  fence UUID NOT NULL DEFAULT gen_random_uuid(),
  lease_until TIMESTAMPTZ,
  last_error_code TEXT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS privacy_deletion_retry_idx
  ON public.privacy_account_deletion_operations(status, updated_at)
  WHERE status = 'frozen';

ALTER TABLE public.billing_checkout_intents
  ADD COLUMN IF NOT EXISTS provider_create_state TEXT NOT NULL DEFAULT 'idle',
  ADD COLUMN IF NOT EXISTS provider_create_lease_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS provider_create_finished_at TIMESTAMPTZ;
DO $$ BEGIN
  ALTER TABLE public.billing_checkout_intents
    ADD CONSTRAINT billing_checkout_provider_create_state_check
    CHECK (provider_create_state IN ('idle','active','done','uncertain'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.billing_customer_provisioning
  ADD COLUMN IF NOT EXISTS provider_create_state TEXT NOT NULL DEFAULT 'idle',
  ADD COLUMN IF NOT EXISTS provider_create_lease_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS provider_create_finished_at TIMESTAMPTZ;
DO $$ BEGIN
  ALTER TABLE public.billing_customer_provisioning
    ADD CONSTRAINT billing_customer_provider_create_state_check
    CHECK (provider_create_state IN ('idle','active','done','uncertain'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.begin_billing_customer_provider_call(p_owner_user_id UUID,p_fence UUID)
RETURNS BOOLEAN LANGUAGE plpgsql AS $$
DECLARE changed BOOLEAN;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('billing-customer:' || p_owner_user_id::TEXT, 0));
  UPDATE public.billing_customer_provisioning p
  SET provider_create_state='active',provider_create_lease_until=now()+interval '45 seconds',
      provider_create_finished_at=NULL,updated_at=now()
  WHERE p.owner_user_id=p_owner_user_id AND p.fence=p_fence
    AND p.status IN ('pending','uncertain')
    AND ((p.provider_create_state='idle' AND p.provider_create_lease_until IS NULL AND p.provider_create_finished_at IS NULL)
      OR (p.provider_create_state='uncertain' AND p.provider_create_lease_until IS NULL AND p.provider_create_finished_at IS NOT NULL)
      OR (p.provider_create_state='active' AND p.provider_create_lease_until IS NOT NULL AND p.provider_create_lease_until<=now()))
    AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id=p_owner_user_id AND u.privacy_deletion_requested_at IS NOT NULL)
  RETURNING true INTO changed;
  RETURN COALESCE(changed,false);
END $$;

CREATE OR REPLACE FUNCTION public.finish_billing_customer_provider_call(p_owner_user_id UUID,p_fence UUID,p_outcome TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql AS $$
DECLARE changed INTEGER;
BEGIN
  IF p_outcome NOT IN ('done','uncertain') THEN RAISE EXCEPTION 'invalid customer provider outcome'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('billing-customer:' || p_owner_user_id::TEXT, 0));
  UPDATE public.billing_customer_provisioning
  SET provider_create_state=p_outcome,provider_create_lease_until=NULL,
      provider_create_finished_at=now(),updated_at=now()
  WHERE owner_user_id=p_owner_user_id AND fence=p_fence AND provider_create_state='active';
  GET DIAGNOSTICS changed=ROW_COUNT;
  RETURN changed=1;
END $$;

CREATE OR REPLACE FUNCTION public.begin_billing_checkout_provider_call(p_intent_id UUID,p_fence UUID)
RETURNS BOOLEAN LANGUAGE plpgsql AS $$
DECLARE v_owner UUID; v_changed BOOLEAN;
BEGIN
  SELECT owner_user_id INTO v_owner FROM public.billing_checkout_intents WHERE id=p_intent_id;
  IF NOT FOUND THEN RETURN false; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('billing-checkout-owner:' || v_owner::TEXT, 0));
  UPDATE public.billing_checkout_intents i
  SET provider_create_state='active', provider_create_lease_until=now()+interval '45 seconds',
      provider_create_finished_at=NULL, updated_at=now()
  WHERE i.id=p_intent_id AND i.fence=p_fence AND i.status IN ('pending','uncertain')
    AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id=v_owner AND u.privacy_deletion_requested_at IS NOT NULL)
    AND (i.provider_create_lease_until IS NULL OR i.provider_create_lease_until<=now())
  RETURNING true INTO v_changed;
  RETURN COALESCE(v_changed,false);
END $$;

CREATE OR REPLACE FUNCTION public.finish_billing_checkout_provider_call(p_intent_id UUID,p_fence UUID,p_outcome TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql AS $$
DECLARE v_owner UUID; v_changed INTEGER;
BEGIN
  IF p_outcome NOT IN ('done','uncertain') THEN RAISE EXCEPTION 'invalid checkout provider outcome'; END IF;
  SELECT owner_user_id INTO v_owner FROM public.billing_checkout_intents WHERE id=p_intent_id;
  IF NOT FOUND THEN RETURN false; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('billing-checkout-owner:' || v_owner::TEXT, 0));
  UPDATE public.billing_checkout_intents
  SET provider_create_state=p_outcome,provider_create_lease_until=NULL,provider_create_finished_at=now(),updated_at=now()
  WHERE id=p_intent_id AND fence=p_fence AND provider_create_state='active';
  GET DIAGNOSTICS v_changed=ROW_COUNT;
  RETURN v_changed=1;
END $$;

-- The owner identity is retained as a UUID pseudonym so a deleted account's
-- one-time trial history cannot be erased by account deletion.
DO $$
DECLARE fk_name TEXT;
BEGIN
  SELECT c.conname INTO fk_name
  FROM pg_constraint c
  WHERE c.conrelid = 'public.billing_trial_owner_history'::regclass
    AND c.contype = 'f'
    AND c.confrelid = 'public.users'::regclass;
  IF fk_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.billing_trial_owner_history DROP CONSTRAINT %I', fk_name);
  END IF;
END $$;

-- This lock name is shared with claim_billing_checkout_intent. A00/A03 must
-- retain that protocol and additionally deny claims once the deletion marker is set.
CREATE OR REPLACE FUNCTION public.privacy_begin_account_deletion(
  p_actor_user_id UUID,
  p_confirm_shared_workspace_data BOOLEAN
) RETURNS TABLE(result TEXT, operation_id UUID, account_role TEXT)
LANGUAGE plpgsql AS $$
DECLARE v_role TEXT; v_operation UUID; v_team_count INTEGER;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('billing-customer:' || p_actor_user_id::TEXT, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended('billing-checkout-owner:' || p_actor_user_id::TEXT, 0));
  PERFORM 1 FROM public.users WHERE id = p_actor_user_id FOR UPDATE;
  IF NOT FOUND THEN
    SELECT d.id, d.account_role INTO v_operation, v_role
    FROM public.privacy_account_deletion_operations d WHERE d.actor_user_id = p_actor_user_id;
    IF FOUND AND v_role IS NOT NULL THEN
      RETURN QUERY SELECT CASE WHEN EXISTS (SELECT 1 FROM public.privacy_account_deletion_operations WHERE id=v_operation AND status='complete') THEN 'complete' ELSE 'frozen' END, v_operation, v_role;
    ELSE
      RETURN QUERY SELECT 'not_found', NULL::UUID, NULL::TEXT;
    END IF;
    RETURN;
  END IF;

  SELECT d.id, d.account_role INTO v_operation, v_role
  FROM public.privacy_account_deletion_operations d
  WHERE d.actor_user_id = p_actor_user_id;
  IF FOUND THEN
    IF v_role='owner' AND p_confirm_shared_workspace_data THEN
      UPDATE public.privacy_account_deletion_operations
      SET shared_workspace_confirmed=true,updated_at=now()
      WHERE id=v_operation AND status='frozen';
    END IF;
    RETURN QUERY SELECT CASE WHEN EXISTS (SELECT 1 FROM public.privacy_account_deletion_operations WHERE id=v_operation AND status='complete') THEN 'complete' ELSE 'frozen' END, v_operation, v_role;
    RETURN;
  END IF;

  SELECT CASE WHEN EXISTS (SELECT 1 FROM public.businesses WHERE owner_user_id=p_actor_user_id) THEN 'owner' ELSE 'member' END INTO v_role;
  IF v_role = 'owner' THEN
    SELECT (
      (SELECT count(DISTINCT bm.user_id)::INTEGER FROM public.business_members bm
       JOIN public.businesses b ON b.id=bm.business_id
       WHERE b.owner_user_id=p_actor_user_id AND bm.user_id<>p_actor_user_id)
      +
      (SELECT count(*)::INTEGER FROM public.team_invitations i
       JOIN public.businesses b ON b.id=i.business_id
       WHERE b.owner_user_id=p_actor_user_id AND i.status='pending' AND i.expires_at>now())
    ) INTO v_team_count;
    IF v_team_count > 0 AND NOT p_confirm_shared_workspace_data THEN
      RETURN QUERY SELECT 'team_confirmation_required', NULL::UUID, v_role;
      RETURN;
    END IF;
  END IF;

  INSERT INTO public.privacy_account_deletion_operations(actor_user_id, account_role,shared_workspace_confirmed)
  VALUES (p_actor_user_id, v_role,(v_role='owner' AND p_confirm_shared_workspace_data))
  RETURNING id INTO v_operation;
  UPDATE public.users SET privacy_deletion_requested_at=now() WHERE id=p_actor_user_id;
  RETURN QUERY SELECT 'frozen', v_operation, v_role;
END $$;

CREATE OR REPLACE FUNCTION public.privacy_claim_account_deletion(
  p_operation_id UUID, p_lease_ms INTEGER DEFAULT 300000
) RETURNS TABLE(result TEXT, actor_user_id UUID, account_role TEXT, fence UUID)
LANGUAGE plpgsql AS $$
DECLARE d public.privacy_account_deletion_operations%ROWTYPE;
BEGIN
  SELECT * INTO d FROM public.privacy_account_deletion_operations WHERE id=p_operation_id FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'not_found',NULL::UUID,NULL::TEXT,NULL::UUID; RETURN; END IF;
  IF d.status='complete' THEN RETURN QUERY SELECT 'complete',d.actor_user_id,d.account_role,d.fence; RETURN; END IF;
  IF d.lease_until IS NOT NULL AND d.lease_until > now() THEN
    RETURN QUERY SELECT 'busy',d.actor_user_id,d.account_role,d.fence; RETURN;
  END IF;
  UPDATE public.privacy_account_deletion_operations
  SET fence=gen_random_uuid(), lease_until=now()+(LEAST(GREATEST(p_lease_ms,1000),900000) * interval '1 millisecond'),
      updated_at=now(), last_error_code=NULL
  WHERE id=p_operation_id
  RETURNING * INTO d;
  RETURN QUERY SELECT 'claimed',d.actor_user_id,d.account_role,d.fence;
END $$;

CREATE OR REPLACE FUNCTION public.privacy_record_account_deletion_step(
  p_operation_id UUID, p_fence UUID, p_step TEXT
) RETURNS BOOLEAN LANGUAGE plpgsql AS $$
DECLARE changed INTEGER;
BEGIN
  IF p_step NOT IN ('billing','google') THEN RAISE EXCEPTION 'invalid privacy deletion step'; END IF;
  UPDATE public.privacy_account_deletion_operations
  SET billing_complete=CASE WHEN p_step='billing' THEN true ELSE billing_complete END,
      google_complete=CASE WHEN p_step='google' THEN true ELSE google_complete END,
      billing_checked_at=CASE WHEN p_step='billing' THEN now() ELSE billing_checked_at END,
      updated_at=now()
  WHERE id=p_operation_id AND fence=p_fence AND status='frozen' AND lease_until > now();
  GET DIAGNOSTICS changed=ROW_COUNT;
  RETURN changed=1;
END $$;

CREATE OR REPLACE FUNCTION public.privacy_renew_account_deletion(
  p_operation_id UUID,p_fence UUID,p_lease_ms INTEGER DEFAULT 300000
) RETURNS BOOLEAN LANGUAGE plpgsql AS $$
DECLARE changed INTEGER;
BEGIN
  UPDATE public.privacy_account_deletion_operations
  SET lease_until=now()+(LEAST(GREATEST(p_lease_ms,1000),900000) * interval '1 millisecond'),updated_at=now()
  WHERE id=p_operation_id AND fence=p_fence AND status='frozen' AND lease_until>now();
  GET DIAGNOSTICS changed=ROW_COUNT;
  RETURN changed=1;
END $$;

CREATE OR REPLACE FUNCTION public.privacy_release_account_deletion(
  p_operation_id UUID, p_fence UUID, p_error_code TEXT
) RETURNS BOOLEAN LANGUAGE plpgsql AS $$
DECLARE changed INTEGER;
BEGIN
  UPDATE public.privacy_account_deletion_operations
  SET lease_until=NULL, last_error_code=left(COALESCE(p_error_code,'provider_or_storage_failure'),80), updated_at=now()
  WHERE id=p_operation_id AND fence=p_fence AND status='frozen';
  GET DIAGNOSTICS changed=ROW_COUNT;
  RETURN changed=1;
END $$;

CREATE OR REPLACE FUNCTION public.privacy_finalize_account_deletion(
  p_operation_id UUID, p_fence UUID
) RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE d public.privacy_account_deletion_operations%ROWTYPE; v_actor UUID;
BEGIN
  SELECT actor_user_id INTO v_actor FROM public.privacy_account_deletion_operations WHERE id=p_operation_id;
  IF NOT FOUND THEN RETURN 'not_found'; END IF;
  -- Match begin/provider admission lock order before taking the operation row.
  -- This avoids a cycle with a consent-upgrade retry that also updates the ledger.
  PERFORM pg_advisory_xact_lock(hashtextextended('billing-customer:' || v_actor::TEXT, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended('billing-checkout-owner:' || v_actor::TEXT, 0));
  SELECT * INTO d FROM public.privacy_account_deletion_operations WHERE id=p_operation_id FOR UPDATE;
  IF NOT FOUND THEN RETURN 'not_found'; END IF;
  IF d.status='complete' THEN RETURN 'complete'; END IF;
  IF d.fence<>p_fence OR d.lease_until IS NULL OR d.lease_until<=now() THEN RETURN 'stale_fence'; END IF;
  IF NOT d.billing_complete OR NOT d.google_complete THEN RETURN 'providers_incomplete'; END IF;
  IF EXISTS (SELECT 1 FROM public.billing_checkout_intents i WHERE i.owner_user_id=v_actor
    AND (i.status IN ('pending','uncertain')
      OR i.provider_create_state NOT IN ('idle','done','uncertain')
      OR (i.provider_create_state='active' AND (i.provider_create_lease_until IS NULL OR i.provider_create_lease_until>now()))
      OR i.updated_at>COALESCE(d.billing_checked_at,'-infinity'::timestamptz))) THEN
    RETURN 'billing_changed_during_finalize';
  END IF;
  IF EXISTS (SELECT 1 FROM public.billing_customer_provisioning p WHERE p.owner_user_id=v_actor) THEN
    RETURN 'customer_provisioning_unresolved';
  END IF;
  PERFORM 1 FROM public.businesses b WHERE b.owner_user_id=v_actor
    OR EXISTS (SELECT 1 FROM public.business_members bm WHERE bm.business_id=b.id AND bm.user_id=v_actor)
    ORDER BY b.id FOR UPDATE;
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id=v_actor AND privacy_deletion_requested_at IS NOT NULL FOR UPDATE) THEN
    RETURN 'frozen_user_missing';
  END IF;
  IF d.account_role='owner' AND NOT d.shared_workspace_confirmed AND EXISTS (
    SELECT 1 FROM public.business_members bm
    JOIN public.businesses b ON b.id=bm.business_id
    WHERE b.owner_user_id=v_actor AND bm.user_id<>v_actor
    UNION ALL
    SELECT 1 FROM public.team_invitations i
    JOIN public.businesses b ON b.id=i.business_id
    WHERE b.owner_user_id=v_actor AND i.status='pending' AND i.expires_at>now()
  ) THEN
    RETURN 'team_confirmation_required';
  END IF;

  -- Preserve attribution and workspace-owned content authored by a deleted member.
  -- Owner-owned workspace content is removed by the normal business cascade.
  UPDATE public.reviews r SET user_id=b.owner_user_id
  FROM public.businesses b
  WHERE r.user_id=v_actor AND r.business_id=b.id AND b.owner_user_id<>v_actor;
  UPDATE public.review_replies rr SET user_id=b.owner_user_id
  FROM public.businesses b
  WHERE rr.user_id=v_actor AND rr.business_id=b.id AND b.owner_user_id<>v_actor;
  UPDATE public.team_invitations i
  SET invited_by=b.owner_user_id,
      status=CASE WHEN i.status='pending' THEN 'revoked' ELSE i.status END,
      revoked_at=CASE WHEN i.status='pending' THEN now() ELSE i.revoked_at END
  FROM public.businesses b
  WHERE i.invited_by=v_actor AND i.business_id=b.id AND b.owner_user_id<>v_actor;
  DELETE FROM public.feedback WHERE user_id=v_actor;

  DELETE FROM public.users WHERE id=v_actor;
  UPDATE public.privacy_account_deletion_operations
  SET status='complete', lease_until=NULL, last_error_code=NULL, completed_at=now(), updated_at=now()
  WHERE id=p_operation_id AND fence=p_fence;
  RETURN 'complete';
END $$;
