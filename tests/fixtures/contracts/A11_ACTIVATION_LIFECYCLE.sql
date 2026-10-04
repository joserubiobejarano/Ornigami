-- Proposed additive E03 activation contract. Do not apply this file until the
-- integration review assigns a migration number and composes it with 026.
-- One immutable row per external operation key. An expired `active` lease is
-- converted to `uncertain`; absence of a live lease is never treated as proof
-- that a provider side effect did not happen.
CREATE TABLE IF NOT EXISTS public.account_lifecycle_operations (
  token UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  actor_user_id UUID,
  business_id UUID,
  operation_kind TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active','done','uncertain','failed')),
  encrypted_provider_evidence TEXT,
  lease_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, operation_kind, idempotency_key),
  CHECK ((status='active') = (lease_until IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS account_lifecycle_operations_drain_idx
  ON public.account_lifecycle_operations(user_id,status,lease_until);

-- A03 persists the exact known provider customer ID when creation returned but
-- freeze prevented the ordinary local mapping finalizer.
ALTER TABLE public.billing_customer_provisioning
  ADD COLUMN IF NOT EXISTS provider_customer_id TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public'
      AND table_name='account_lifecycle_operations' AND column_name='token' AND data_type='uuid')
    OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public'
      AND table_name='account_lifecycle_operations' AND column_name='user_id' AND data_type='uuid')
    OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public'
      AND table_name='account_lifecycle_operations' AND column_name='actor_user_id' AND data_type='uuid')
    OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public'
      AND table_name='account_lifecycle_operations' AND column_name='business_id' AND data_type='uuid')
    OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public'
      AND table_name='account_lifecycle_operations' AND column_name='encrypted_provider_evidence' AND data_type='text')
    OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public'
      AND table_name='billing_customer_provisioning' AND column_name='provider_customer_id' AND data_type='text') THEN
    RAISE EXCEPTION 'A11 account lifecycle schema is incompatible';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public'
      AND tablename='account_lifecycle_operations' AND indexdef LIKE '%(user_id, operation_kind, idempotency_key)%') THEN
    RAISE EXCEPTION 'A11 account lifecycle idempotency constraint is missing';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.begin_account_lifecycle_operation(
  p_user_id UUID, p_actor_user_id UUID, p_business_id UUID,
  p_kind TEXT, p_idempotency_key TEXT, p_lease_ms INTEGER
) RETURNS TABLE(result TEXT, token UUID, lease_until TIMESTAMPTZ)
LANGUAGE plpgsql AS $$
DECLARE v_token UUID; v_status TEXT; v_lease TIMESTAMPTZ; v_frozen BOOLEAN;
BEGIN
  IF p_lease_ms IS NULL OR p_kind IS NULL OR length(p_kind) NOT BETWEEN 1 AND 80
    OR p_idempotency_key IS NULL OR length(p_idempotency_key) NOT BETWEEN 1 AND 200
    OR p_lease_ms NOT BETWEEN 1000 AND 120000 THEN
    RAISE EXCEPTION 'invalid lifecycle operation';
  END IF;
  -- Match workspace writers: business first, then affected users by UUID.
  IF p_business_id IS NOT NULL THEN
    PERFORM 1 FROM public.businesses WHERE id=p_business_id AND owner_user_id=p_user_id FOR UPDATE;
    IF NOT FOUND THEN RETURN QUERY SELECT 'frozen',NULL::uuid,NULL::timestamptz; RETURN; END IF;
  END IF;
  PERFORM 1 FROM public.users WHERE id IN (p_user_id,p_actor_user_id)
    ORDER BY id FOR UPDATE;
  SELECT EXISTS (
    SELECT 1 FROM public.users u WHERE u.id IN (p_user_id,p_actor_user_id)
      AND u.privacy_deletion_requested_at IS NOT NULL
  ) OR NOT EXISTS (SELECT 1 FROM public.users WHERE id=p_user_id)
    OR (p_actor_user_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.users WHERE id=p_actor_user_id))
  INTO v_frozen;
  IF p_business_id IS NOT NULL AND p_actor_user_id IS NOT NULL AND p_actor_user_id<>p_user_id
    AND NOT EXISTS (SELECT 1 FROM public.business_members WHERE business_id=p_business_id AND user_id=p_actor_user_id) THEN
    v_frozen := true;
  END IF;
  IF v_frozen THEN RETURN QUERY SELECT 'frozen',NULL::uuid,NULL::timestamptz; RETURN; END IF;

  UPDATE public.account_lifecycle_operations o
    SET status='uncertain',lease_until=NULL,updated_at=now()
    WHERE o.user_id=p_user_id AND o.operation_kind=p_kind
      AND o.idempotency_key=p_idempotency_key AND o.status='active' AND o.lease_until<=now();
  UPDATE public.account_lifecycle_operations o
    SET status='uncertain',lease_until=NULL,updated_at=now()
    WHERE o.user_id=p_user_id AND o.operation_kind=p_kind AND o.status='active' AND o.lease_until<=now();
  IF EXISTS (SELECT 1 FROM public.account_lifecycle_operations o WHERE o.user_id=p_user_id
      AND o.operation_kind=p_kind AND o.status='active' AND o.lease_until>now()) THEN
    RETURN QUERY SELECT 'busy',NULL::uuid,NULL::timestamptz; RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM public.account_lifecycle_operations o WHERE o.user_id=p_user_id
      AND o.operation_kind=p_kind AND o.status='uncertain') THEN
    RETURN QUERY SELECT 'uncertain',NULL::uuid,NULL::timestamptz; RETURN;
  END IF;
  SELECT o.token,o.status,o.lease_until INTO v_token,v_status,v_lease
    FROM public.account_lifecycle_operations o
    WHERE o.user_id=p_user_id AND o.operation_kind=p_kind AND o.idempotency_key=p_idempotency_key;
  IF FOUND THEN
    RETURN QUERY SELECT CASE WHEN v_status='active' THEN 'busy' WHEN v_status='uncertain' THEN 'uncertain' ELSE 'done' END,v_token,v_lease;
    RETURN;
  END IF;
  INSERT INTO public.account_lifecycle_operations(user_id,actor_user_id,business_id,operation_kind,idempotency_key,status,lease_until)
  VALUES (p_user_id,p_actor_user_id,p_business_id,p_kind,p_idempotency_key,'active',now()+p_lease_ms*interval '1 millisecond')
  RETURNING account_lifecycle_operations.token,account_lifecycle_operations.lease_until INTO v_token,v_lease;
  RETURN QUERY SELECT 'claimed',v_token,v_lease;
END $$;

CREATE OR REPLACE FUNCTION public.finish_account_lifecycle_operation(p_token UUID,p_outcome TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql AS $$
DECLARE n INTEGER;
BEGIN
  IF p_outcome NOT IN ('done','uncertain','failed') THEN RAISE EXCEPTION 'invalid lifecycle outcome'; END IF;
  UPDATE public.account_lifecycle_operations
    SET status=p_outcome,lease_until=NULL,
        encrypted_provider_evidence=CASE WHEN p_outcome IN ('done','failed') THEN NULL ELSE encrypted_provider_evidence END,
        updated_at=now()
    WHERE token=p_token AND (status='uncertain' OR (status='active' AND lease_until>now()));
  GET DIAGNOSTICS n=ROW_COUNT;
  RETURN n=1;
END $$;

CREATE OR REPLACE FUNCTION public.privacy_account_lifecycle_drained(p_user_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql AS $$
DECLARE v_native_pending BOOLEAN := false;
BEGIN
  UPDATE public.account_lifecycle_operations SET status='uncertain',lease_until=NULL,updated_at=now()
    WHERE (user_id=p_user_id OR actor_user_id=p_user_id) AND status='active' AND lease_until<=now();
  IF to_regclass('public.review_reply_draft_state') IS NOT NULL THEN
    EXECUTE 'SELECT EXISTS (SELECT 1 FROM public.review_reply_draft_state s
      JOIN public.businesses b ON b.id=s.business_id
      WHERE b.owner_user_id=$1 AND s.posting_token IS NOT NULL)'
      INTO v_native_pending USING p_user_id;
    IF v_native_pending THEN RETURN false; END IF;
  END IF;
  IF to_regclass('public.booster_followup_deliveries') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public'
      AND table_name='booster_followup_deliveries' AND column_name='actor_user_id') THEN
      EXECUTE 'SELECT EXISTS (SELECT 1 FROM public.booster_followup_deliveries d
        JOIN public.businesses b ON b.id=d.business_id
        WHERE (b.owner_user_id=$1 OR d.actor_user_id=$1)
          AND d.state IN (''unknown'',''reconciliation_required'',''sending''))'
        INTO v_native_pending USING p_user_id;
    ELSE
      EXECUTE 'SELECT EXISTS (SELECT 1 FROM public.booster_followup_deliveries d
        JOIN public.businesses b ON b.id=d.business_id
        WHERE b.owner_user_id=$1 AND d.state IN (''unknown'',''reconciliation_required'',''sending''))'
        INTO v_native_pending USING p_user_id;
    END IF;
    IF v_native_pending THEN RETURN false; END IF;
  END IF;
  RETURN NOT EXISTS (SELECT 1 FROM public.account_lifecycle_operations
    WHERE (user_id=p_user_id OR actor_user_id=p_user_id)
      AND (status='uncertain' OR (status='active' AND lease_until>now())));
END $$;

CREATE TABLE IF NOT EXISTS public.privacy_google_revocation_evidence (
  operation_id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  connection_version UUID,
  encrypted_refresh_token TEXT NOT NULL,
  encrypted_revoked_token TEXT,
  acknowledged_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS public.privacy_stripe_customer_erasure_evidence (
  operation_id UUID NOT NULL,
  customer_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('started','complete')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (operation_id,customer_id)
);

-- Additive replacement for the applied 026 finalizer. The original migration
-- remains immutable; integration must assign this proposal a new migration.
CREATE OR REPLACE FUNCTION public.privacy_finalize_account_deletion(
  p_operation_id UUID, p_fence UUID
) RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE d public.privacy_account_deletion_operations%ROWTYPE; v_actor UUID;
  v_prior_finalizer TEXT := current_setting('app.privacy_finalizer',true);
BEGIN
  SELECT actor_user_id INTO v_actor FROM public.privacy_account_deletion_operations WHERE id=p_operation_id;
  IF NOT FOUND THEN RETURN 'not_found'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('billing-customer:' || v_actor::TEXT, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended('billing-checkout-owner:' || v_actor::TEXT, 0));
  SELECT * INTO d FROM public.privacy_account_deletion_operations WHERE id=p_operation_id FOR UPDATE;
  IF NOT FOUND THEN RETURN 'not_found'; END IF;
  IF d.status='complete' THEN RETURN 'complete'; END IF;
  IF d.fence IS DISTINCT FROM p_fence OR d.status<>'frozen' OR d.lease_until IS NULL OR d.lease_until<=now() THEN RETURN 'stale_fence'; END IF;
  IF NOT d.billing_complete OR NOT d.google_complete THEN RETURN 'providers_incomplete'; END IF;
  IF EXISTS (SELECT 1 FROM public.billing_checkout_intents i WHERE i.owner_user_id=v_actor
    AND (i.status IN ('pending','uncertain')
      OR i.provider_create_state NOT IN ('idle','done','uncertain')
      OR (i.provider_create_state='active' AND (i.provider_create_lease_until IS NULL OR i.provider_create_lease_until>now()))
      OR i.updated_at>COALESCE(d.billing_checked_at,'-infinity'::timestamptz))) THEN
    RETURN 'billing_changed_during_finalize';
  END IF;
  IF EXISTS (SELECT 1 FROM public.billing_customer_provisioning p WHERE p.owner_user_id=v_actor
    AND (p.provider_create_state<>'done' OR p.provider_create_lease_until IS NOT NULL OR p.provider_customer_id IS NULL)) THEN
    RETURN 'customer_provisioning_unresolved';
  END IF;
  PERFORM 1 FROM public.businesses b WHERE b.owner_user_id=v_actor
    OR EXISTS (SELECT 1 FROM public.business_members bm WHERE bm.business_id=b.id AND bm.user_id=v_actor)
    ORDER BY b.id FOR UPDATE;
  PERFORM 1 FROM public.users WHERE id=v_actor AND privacy_deletion_requested_at IS NOT NULL FOR UPDATE;
  IF NOT FOUND THEN RETURN 'frozen_user_missing'; END IF;
  IF NOT public.privacy_account_lifecycle_drained(v_actor) THEN
    RETURN 'account_lifecycle_operations_unresolved';
  END IF;
  IF d.google_complete AND EXISTS (SELECT 1 FROM public.gbp_connections WHERE user_id=v_actor) THEN
    RETURN 'google_connection_reappeared';
  END IF;
  IF d.account_role='owner' AND NOT d.shared_workspace_confirmed AND EXISTS (
    SELECT 1 FROM public.business_members bm JOIN public.businesses b ON b.id=bm.business_id
      WHERE b.owner_user_id=v_actor AND bm.user_id<>v_actor
    UNION ALL
    SELECT 1 FROM public.team_invitations i JOIN public.businesses b ON b.id=i.business_id
      WHERE b.owner_user_id=v_actor AND i.status='pending' AND i.expires_at>now()
  ) THEN RETURN 'team_confirmation_required'; END IF;

  -- Let only the fenced deletion transaction perform the necessary team row
  -- cleanup guarded by the A05 team-admission triggers.
  PERFORM set_config('app.privacy_finalizer','on',true);
  UPDATE public.reviews r SET user_id=b.owner_user_id FROM public.businesses b
    WHERE r.user_id=v_actor AND r.business_id=b.id AND b.owner_user_id<>v_actor;
  UPDATE public.review_replies rr SET user_id=b.owner_user_id FROM public.businesses b
    WHERE rr.user_id=v_actor AND rr.business_id=b.id AND b.owner_user_id<>v_actor;
  UPDATE public.team_invitations i SET invited_by=b.owner_user_id,
      status=CASE WHEN i.status='pending' THEN 'revoked' ELSE i.status END,
      revoked_at=CASE WHEN i.status='pending' THEN now() ELSE i.revoked_at END
    FROM public.businesses b WHERE i.invited_by=v_actor AND i.business_id=b.id AND b.owner_user_id<>v_actor;
  DELETE FROM public.feedback WHERE user_id=v_actor;
  IF to_regclass('public.privacy_reply_post_outcomes') IS NOT NULL THEN
    EXECUTE 'DELETE FROM public.privacy_reply_post_outcomes o WHERE EXISTS (
      SELECT 1 FROM public.businesses b WHERE b.id=o.business_id AND b.owner_user_id=$1)
      OR EXISTS (SELECT 1 FROM public.account_lifecycle_operations op
        WHERE op.business_id=o.business_id AND op.operation_kind=''google_reply_post''
          AND op.idempotency_key=o.claim_token::text AND (op.user_id=$1 OR op.actor_user_id=$1))'
      USING v_actor;
  END IF;
  IF to_regclass('public.booster_followup_deliveries') IS NOT NULL
    AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public'
      AND table_name='booster_followup_deliveries' AND column_name='actor_user_id') THEN
    EXECUTE 'UPDATE public.booster_followup_deliveries SET actor_user_id=NULL
      WHERE actor_user_id=$1 AND state NOT IN (''sending'',''unknown'',''reconciliation_required'')'
      USING v_actor;
  END IF;
  DELETE FROM public.privacy_google_revocation_evidence WHERE user_id=v_actor;
  UPDATE public.account_lifecycle_operations SET encrypted_provider_evidence=NULL,updated_at=now()
    WHERE user_id=v_actor OR actor_user_id=v_actor;
  DELETE FROM public.users WHERE id=v_actor;
  PERFORM set_config('app.privacy_finalizer',COALESCE(v_prior_finalizer,''),true);
  UPDATE public.privacy_account_deletion_operations
    SET status='complete',lease_until=NULL,last_error_code=NULL,completed_at=now(),updated_at=now()
    WHERE id=p_operation_id AND fence=p_fence;
  RETURN 'complete';
END $$;

-- Expired operations become uncertain and stay blocking until provider- or
-- operator-authoritative reconciliation changes their status. The actual 026
-- migration is untouched; apply this replacement only from a reviewed new SQL.
