-- Durable billing operation state.  Provider calls happen outside SQL transactions;
-- these rows preserve the exact request and fence local writes after a retry/crash.
ALTER TABLE public.business_agents ADD COLUMN IF NOT EXISTS plan_id TEXT;
ALTER TABLE public.business_agents ADD COLUMN IF NOT EXISTS billing_period TEXT;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS current_period_start TIMESTAMPTZ;
CREATE TABLE IF NOT EXISTS public.billing_migration_receipts (
  migration_id TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.billing_checkout_intents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  owner_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  plan_id TEXT NOT NULL,
  billing_period TEXT NOT NULL CHECK (billing_period IN ('monthly', 'annual')),
  customer_id TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  stripe_payload JSONB NOT NULL,
  provider_intent_token TEXT,
  idempotency_key TEXT NOT NULL UNIQUE,
  fence UUID NOT NULL DEFAULT gen_random_uuid(),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'uncertain', 'completed', 'expired', 'retired')),
  stripe_session_id TEXT UNIQUE,
  stripe_subscription_id TEXT,
  checkout_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE,
  FOREIGN KEY (owner_user_id) REFERENCES public.users(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS billing_checkout_one_unresolved_per_business
  ON public.billing_checkout_intents (business_id)
  WHERE status IN ('pending', 'uncertain');
CREATE INDEX IF NOT EXISTS billing_checkout_owner_history
  ON public.billing_checkout_intents (owner_user_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.prevent_billing_checkout_request_mutation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.business_id IS DISTINCT FROM OLD.business_id OR NEW.owner_user_id IS DISTINCT FROM OLD.owner_user_id
    OR NEW.plan_id IS DISTINCT FROM OLD.plan_id OR NEW.billing_period IS DISTINCT FROM OLD.billing_period
    OR NEW.customer_id IS DISTINCT FROM OLD.customer_id OR NEW.request_hash IS DISTINCT FROM OLD.request_hash
    OR NEW.stripe_payload IS DISTINCT FROM OLD.stripe_payload OR NEW.provider_intent_token IS DISTINCT FROM OLD.provider_intent_token
    OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key OR NEW.fence IS DISTINCT FROM OLD.fence THEN
    RAISE EXCEPTION 'billing checkout request is immutable' USING ERRCODE = '23000';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS billing_checkout_request_immutable ON public.billing_checkout_intents;
CREATE TRIGGER billing_checkout_request_immutable BEFORE UPDATE ON public.billing_checkout_intents
  FOR EACH ROW EXECUTE FUNCTION public.prevent_billing_checkout_request_mutation();

-- Customer creation uses a stable provider key and a durable owner-level reservation.
CREATE TABLE IF NOT EXISTS public.billing_owner_customers (
  owner_user_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  stripe_customer_id TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.billing_customer_provisioning (
  owner_user_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  owner_email TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  fence UUID NOT NULL DEFAULT gen_random_uuid(),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'uncertain')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Track each policy identity independently. Business history survives ownership
-- transfer; owner history survives business deletion. User deletion cascades only
-- the personal history, while business deletion cascades only business history.
CREATE TABLE IF NOT EXISTS public.billing_trial_business_history (
  business_id UUID PRIMARY KEY REFERENCES public.businesses(id) ON DELETE CASCADE,
  state TEXT NOT NULL CHECK (state IN ('consumed', 'legacy_unknown')),
  source TEXT NOT NULL,
  stripe_subscription_id TEXT,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.billing_trial_owner_history (
  owner_user_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  state TEXT NOT NULL CHECK (state IN ('consumed', 'legacy_unknown')),
  source TEXT NOT NULL,
  stripe_subscription_id TEXT,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.billing_trial_reservations (
  owner_user_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  business_id UUID NOT NULL,
  intent_id UUID NOT NULL UNIQUE REFERENCES public.billing_checkout_intents(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.claim_billing_checkout_intent(
  p_business_id UUID, p_owner_user_id UUID, p_plan_id TEXT, p_billing_period TEXT,
  p_customer_id TEXT, p_request_hash TEXT, p_stripe_payload JSONB, p_trial_requested BOOLEAN
) RETURNS TABLE(kind TEXT,intent_id UUID,idempotency_key TEXT,fence UUID,stripe_payload JSONB,status TEXT,
  session_id TEXT,checkout_url TEXT,created_at TIMESTAMPTZ) LANGUAGE plpgsql AS $$
DECLARE old_intent public.billing_checkout_intents%ROWTYPE; new_intent public.billing_checkout_intents%ROWTYPE;
DECLARE reserved_business UUID; history_state TEXT; legacy_customer TEXT; canonical_customer TEXT;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('billing-checkout-owner:' || p_owner_user_id::TEXT, 0));
  IF NOT EXISTS (SELECT 1 FROM public.businesses WHERE id=p_business_id AND owner_user_id=p_owner_user_id) THEN
    RETURN QUERY SELECT 'blocked',NULL::UUID,NULL::TEXT,NULL::UUID,NULL::JSONB,NULL::TEXT,NULL::TEXT,NULL::TEXT,NULL::TIMESTAMPTZ; RETURN;
  END IF;
  SELECT c.stripe_customer_id INTO canonical_customer FROM public.billing_owner_customers c WHERE c.owner_user_id=p_owner_user_id;
  SELECT b.stripe_customer_id INTO legacy_customer FROM public.businesses b WHERE b.id=p_business_id;
  IF (canonical_customer IS NOT NULL AND canonical_customer<>p_customer_id)
    OR (legacy_customer IS NOT NULL AND legacy_customer<>p_customer_id)
    OR EXISTS(SELECT 1 FROM public.user_billing WHERE user_id=p_owner_user_id AND stripe_customer_id<>p_customer_id) THEN
    RETURN QUERY SELECT 'blocked',NULL::UUID,NULL::TEXT,NULL::UUID,NULL::JSONB,NULL::TEXT,NULL::TEXT,NULL::TEXT,NULL::TIMESTAMPTZ; RETURN;
  END IF;
  SELECT * INTO old_intent FROM public.billing_checkout_intents i WHERE i.business_id=p_business_id
    AND i.status IN ('pending','uncertain','completed') ORDER BY i.created_at DESC LIMIT 1 FOR UPDATE;
  IF FOUND THEN
    IF old_intent.status='completed' THEN
      RETURN QUERY SELECT 'blocked',old_intent.id,old_intent.idempotency_key,old_intent.fence,old_intent.stripe_payload,
        old_intent.status,old_intent.stripe_session_id,old_intent.checkout_url,old_intent.created_at; RETURN;
    ELSIF old_intent.request_hash<>p_request_hash THEN
      RETURN QUERY SELECT 'conflict',old_intent.id,old_intent.idempotency_key,old_intent.fence,old_intent.stripe_payload,
        old_intent.status,old_intent.stripe_session_id,old_intent.checkout_url,old_intent.created_at; RETURN;
    ELSE
      RETURN QUERY SELECT 'existing',old_intent.id,old_intent.idempotency_key,old_intent.fence,old_intent.stripe_payload,
        old_intent.status,old_intent.stripe_session_id,old_intent.checkout_url,old_intent.created_at; RETURN;
    END IF;
  END IF;
  IF p_trial_requested THEN
    SELECT state INTO history_state FROM (
      SELECT state FROM public.billing_trial_business_history WHERE business_id=p_business_id
      UNION ALL SELECT state FROM public.billing_trial_owner_history WHERE owner_user_id=p_owner_user_id
    ) trial_states ORDER BY CASE state WHEN 'legacy_unknown' THEN 0 ELSE 1 END LIMIT 1;
    IF history_state IS NOT NULL THEN
      RETURN QUERY SELECT CASE history_state WHEN 'legacy_unknown' THEN 'legacy_unknown' ELSE 'used' END,
        NULL::UUID,NULL::TEXT,NULL::UUID,NULL::JSONB,NULL::TEXT,NULL::TEXT,NULL::TEXT,NULL::TIMESTAMPTZ; RETURN;
    END IF;
    SELECT r.business_id INTO reserved_business FROM public.billing_trial_reservations r WHERE r.owner_user_id=p_owner_user_id FOR UPDATE;
    IF FOUND THEN
      RETURN QUERY SELECT 'trial_reserved',NULL::UUID,NULL::TEXT,NULL::UUID,NULL::JSONB,NULL::TEXT,NULL::TEXT,NULL::TEXT,NULL::TIMESTAMPTZ; RETURN;
    END IF;
  END IF;
  INSERT INTO public.billing_checkout_intents(business_id,owner_user_id,plan_id,billing_period,customer_id,
    request_hash,stripe_payload,provider_intent_token,idempotency_key)
    VALUES(p_business_id,p_owner_user_id,p_plan_id,p_billing_period,p_customer_id,p_request_hash,p_stripe_payload,
      COALESCE(p_stripe_payload->'metadata'->>'billing_intent_token',p_stripe_payload->'subscription_data'->'metadata'->>'billing_intent_token'),
      'ornigami-checkout-'||gen_random_uuid()::TEXT) RETURNING * INTO new_intent;
  IF p_trial_requested THEN
    INSERT INTO public.billing_trial_reservations(owner_user_id,business_id,intent_id)
      VALUES(p_owner_user_id,p_business_id,new_intent.id);
  END IF;
  RETURN QUERY SELECT 'claimed',new_intent.id,new_intent.idempotency_key,new_intent.fence,new_intent.stripe_payload,
    new_intent.status,new_intent.stripe_session_id,new_intent.checkout_url,new_intent.created_at;
END $$;

CREATE OR REPLACE FUNCTION public.finish_billing_checkout_intent(
  p_intent_id UUID,p_fence UUID,p_session_id TEXT,p_url TEXT,p_status TEXT
) RETURNS BOOLEAN LANGUAGE plpgsql AS $$
DECLARE updated_count INTEGER;
BEGIN
  IF p_status NOT IN ('pending','uncertain','completed','expired') THEN RAISE EXCEPTION 'invalid checkout intent status'; END IF;
  UPDATE public.billing_checkout_intents SET status=p_status,stripe_session_id=COALESCE(p_session_id,stripe_session_id),
    checkout_url=COALESCE(p_url,checkout_url),updated_at=now(),
    completed_at=CASE WHEN p_status='completed' THEN COALESCE(completed_at,now()) ELSE completed_at END
    WHERE id=p_intent_id AND fence=p_fence AND status IN ('pending','uncertain')
      AND (p_status <> 'expired' OR stripe_session_id IS NULL OR stripe_session_id=p_session_id);
  GET DIAGNOSTICS updated_count=ROW_COUNT;
  IF updated_count=1 AND p_status='expired' THEN DELETE FROM public.billing_trial_reservations WHERE intent_id=p_intent_id; END IF;
  RETURN updated_count=1;
END $$;

CREATE OR REPLACE FUNCTION public.claim_billing_customer_provisioning(p_owner_user_id UUID)
RETURNS TABLE(kind TEXT,customer_id TEXT,email TEXT,idempotency_key TEXT,fence UUID,status TEXT,created_at TIMESTAMPTZ) LANGUAGE plpgsql AS $$
DECLARE canonical TEXT; legacy TEXT; provision public.billing_customer_provisioning%ROWTYPE; owner_email TEXT;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('billing-customer:'||p_owner_user_id::TEXT,0));
  SELECT u.email INTO owner_email FROM public.users u WHERE u.id=p_owner_user_id;
  IF NOT FOUND THEN RETURN QUERY SELECT 'missing_owner',NULL::TEXT,NULL::TEXT,NULL::TEXT,NULL::UUID,NULL::TEXT,NULL::TIMESTAMPTZ; RETURN; END IF;
  SELECT stripe_customer_id INTO canonical FROM public.billing_owner_customers WHERE owner_user_id=p_owner_user_id;
  SELECT min(stripe_customer_id) INTO legacy FROM (
    SELECT stripe_customer_id FROM public.businesses WHERE owner_user_id=p_owner_user_id AND stripe_customer_id IS NOT NULL
    UNION ALL SELECT stripe_customer_id FROM public.user_billing WHERE user_id=p_owner_user_id
  ) customer_mappings;
  IF canonical IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.businesses WHERE owner_user_id=p_owner_user_id AND stripe_customer_id IS NOT NULL AND stripe_customer_id<>canonical)
       OR EXISTS (SELECT 1 FROM public.user_billing WHERE user_id=p_owner_user_id AND stripe_customer_id<>canonical) THEN
      RETURN QUERY SELECT 'mapping_conflict',canonical,owner_email,NULL::TEXT,NULL::UUID,NULL::TEXT,NULL::TIMESTAMPTZ; RETURN;
    END IF;
    RETURN QUERY SELECT 'mapped',canonical,owner_email,NULL::TEXT,NULL::UUID,NULL::TEXT,NULL::TIMESTAMPTZ; RETURN;
  END IF;
  IF legacy IS NOT NULL AND (EXISTS (SELECT 1 FROM public.businesses WHERE owner_user_id=p_owner_user_id AND stripe_customer_id IS NOT NULL AND stripe_customer_id<>legacy)
    OR EXISTS (SELECT 1 FROM public.user_billing WHERE user_id=p_owner_user_id AND stripe_customer_id<>legacy)) THEN
    RETURN QUERY SELECT 'mapping_conflict',NULL::TEXT,owner_email,NULL::TEXT,NULL::UUID,NULL::TEXT,NULL::TIMESTAMPTZ; RETURN;
  END IF;
  IF legacy IS NOT NULL THEN
    INSERT INTO public.billing_owner_customers(owner_user_id,stripe_customer_id) VALUES(p_owner_user_id,legacy)
      ON CONFLICT(owner_user_id) DO NOTHING;
    RETURN QUERY SELECT 'mapped',legacy,owner_email,NULL::TEXT,NULL::UUID,NULL::TEXT,NULL::TIMESTAMPTZ; RETURN;
  END IF;
  SELECT * INTO provision FROM public.billing_customer_provisioning WHERE owner_user_id=p_owner_user_id FOR UPDATE;
  IF FOUND THEN
    RETURN QUERY SELECT 'existing',NULL::TEXT,provision.owner_email,provision.idempotency_key,provision.fence,provision.status,provision.created_at; RETURN;
  END IF;
  INSERT INTO public.billing_customer_provisioning(owner_user_id,owner_email,idempotency_key)
    VALUES(p_owner_user_id,owner_email,'ornigami-customer-'||p_owner_user_id::TEXT) RETURNING * INTO provision;
  RETURN QUERY SELECT 'claimed',NULL::TEXT,provision.owner_email,provision.idempotency_key,provision.fence,provision.status,provision.created_at;
END $$;

CREATE OR REPLACE FUNCTION public.finalize_billing_customer_provisioning(p_owner_user_id UUID,p_fence UUID,p_customer_id TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql AS $$
DECLARE changed INTEGER;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.billing_customer_provisioning WHERE owner_user_id=p_owner_user_id AND fence=p_fence) THEN
    RETURN false;
  END IF;
  INSERT INTO public.billing_owner_customers(owner_user_id,stripe_customer_id)
    SELECT p_owner_user_id,p_customer_id WHERE EXISTS(SELECT 1 FROM public.billing_customer_provisioning WHERE owner_user_id=p_owner_user_id AND fence=p_fence)
    ON CONFLICT(owner_user_id) DO NOTHING;
  IF NOT EXISTS(SELECT 1 FROM public.billing_owner_customers WHERE owner_user_id=p_owner_user_id AND stripe_customer_id=p_customer_id) THEN
    RAISE EXCEPTION 'canonical customer mapping conflict' USING ERRCODE = '23505';
  END IF;
  UPDATE public.billing_customer_provisioning SET status='pending',updated_at=now()
    WHERE owner_user_id=p_owner_user_id AND fence=p_fence;
  GET DIAGNOSTICS changed=ROW_COUNT;
  IF changed=0 THEN RETURN false; END IF;
  INSERT INTO public.user_billing(user_id,stripe_customer_id)
    VALUES(p_owner_user_id,p_customer_id) ON CONFLICT(user_id) DO NOTHING;
  IF NOT EXISTS(SELECT 1 FROM public.user_billing WHERE user_id=p_owner_user_id AND stripe_customer_id=p_customer_id) THEN
    RAISE EXCEPTION 'legacy customer mapping conflicts with canonical owner mapping' USING ERRCODE = '23505';
  END IF;
  UPDATE public.businesses SET stripe_customer_id=p_customer_id,updated_at=now()
    WHERE owner_user_id=p_owner_user_id AND stripe_customer_id IS NULL;
  DELETE FROM public.billing_customer_provisioning WHERE owner_user_id=p_owner_user_id AND fence=p_fence;
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.release_billing_reconciliation_lease(p_owner_user_id UUID,p_event_id TEXT,p_fence UUID)
RETURNS BOOLEAN LANGUAGE plpgsql AS $$
DECLARE changed INTEGER;
BEGIN
  DELETE FROM public.billing_reconciliation_leases WHERE owner_user_id=p_owner_user_id AND event_id=p_event_id AND fence=p_fence;
  GET DIAGNOSTICS changed=ROW_COUNT; RETURN changed=1;
END $$;

CREATE OR REPLACE FUNCTION public.renew_billing_reconciliation_lease(p_owner_user_id UUID,p_event_id TEXT,p_fence UUID,p_lease_ms INTEGER)
RETURNS BOOLEAN LANGUAGE plpgsql AS $$
DECLARE changed INTEGER;
BEGIN
  UPDATE public.billing_reconciliation_leases SET lease_until=clock_timestamp()+make_interval(secs=>p_lease_ms/1000.0),updated_at=now()
    WHERE owner_user_id=p_owner_user_id AND event_id=p_event_id AND fence=p_fence AND lease_until>clock_timestamp();
  GET DIAGNOSTICS changed=ROW_COUNT; RETURN changed=1;
END $$;

CREATE OR REPLACE FUNCTION public.get_billing_trial_eligibility(p_business_id UUID,p_owner_user_id UUID)
RETURNS TEXT LANGUAGE plpgsql STABLE AS $$
DECLARE history_state TEXT;
BEGIN
  SELECT state INTO history_state FROM (
    SELECT state FROM public.billing_trial_business_history WHERE business_id=p_business_id
    UNION ALL SELECT state FROM public.billing_trial_owner_history WHERE owner_user_id=p_owner_user_id
  ) trial_states ORDER BY CASE state WHEN 'legacy_unknown' THEN 0 ELSE 1 END LIMIT 1;
  IF FOUND THEN RETURN CASE history_state WHEN 'legacy_unknown' THEN 'legacy_unknown' ELSE 'used' END; END IF;
  IF EXISTS(SELECT 1 FROM public.billing_trial_reservations WHERE owner_user_id=p_owner_user_id) THEN RETURN 'reserved'; END IF;
  RETURN 'eligible';
END $$;
-- Run legacy discovery once. On migration replay, mappings created by A03 checkout
-- after rollout must not be mistaken for unknown pre-existing Stripe history.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.billing_migration_receipts WHERE migration_id='019_billing_lifecycle_legacy_seed') THEN
    INSERT INTO public.billing_owner_customers(owner_user_id, stripe_customer_id)
    SELECT mapping.owner_user_id, min(mapping.stripe_customer_id)
    FROM (
      SELECT b.owner_user_id, b.stripe_customer_id FROM public.businesses b WHERE b.stripe_customer_id IS NOT NULL
      UNION ALL SELECT ub.user_id, ub.stripe_customer_id FROM public.user_billing ub
    ) mapping
    GROUP BY mapping.owner_user_id HAVING count(DISTINCT mapping.stripe_customer_id)=1
    ON CONFLICT (owner_user_id) DO NOTHING;
    INSERT INTO public.billing_trial_business_history (business_id,state,source,stripe_subscription_id)
    SELECT DISTINCT b.id,'legacy_unknown','migration_019_existing_subscription',ba.stripe_subscription_id
    FROM public.businesses b JOIN public.business_agents ba ON ba.business_id=b.id
    WHERE ba.stripe_subscription_id IS NOT NULL ON CONFLICT (business_id) DO NOTHING;
    INSERT INTO public.billing_trial_owner_history(owner_user_id,state,source,stripe_subscription_id)
    SELECT DISTINCT b.owner_user_id,'legacy_unknown','migration_019_existing_subscription',ba.stripe_subscription_id
    FROM public.businesses b JOIN public.business_agents ba ON ba.business_id=b.id
    WHERE ba.stripe_subscription_id IS NOT NULL ON CONFLICT (owner_user_id) DO NOTHING;
    INSERT INTO public.billing_trial_business_history (business_id,state,source,stripe_subscription_id)
    SELECT DISTINCT b.id,'legacy_unknown','migration_019_existing_subscription',s.id
    FROM public.businesses b JOIN public.subscriptions s ON s.user_id=b.owner_user_id
    WHERE s.id IS NOT NULL ON CONFLICT (business_id) DO NOTHING;
    INSERT INTO public.billing_trial_owner_history(owner_user_id,state,source,stripe_subscription_id)
    SELECT DISTINCT b.owner_user_id,'legacy_unknown','migration_019_existing_subscription',s.id
    FROM public.businesses b JOIN public.subscriptions s ON s.user_id=b.owner_user_id
    WHERE s.id IS NOT NULL ON CONFLICT(owner_user_id) DO NOTHING;
    INSERT INTO public.billing_trial_business_history (business_id,state,source)
    SELECT b.id,'legacy_unknown','migration_019_existing_customer_mapping'
    FROM public.businesses b
    WHERE b.stripe_customer_id IS NOT NULL OR EXISTS(SELECT 1 FROM public.user_billing ub WHERE ub.user_id=b.owner_user_id)
    ON CONFLICT (business_id) DO NOTHING;
    INSERT INTO public.billing_trial_owner_history(owner_user_id,state,source)
    SELECT DISTINCT b.owner_user_id,'legacy_unknown','migration_019_existing_customer_mapping'
    FROM public.businesses b
    WHERE b.stripe_customer_id IS NOT NULL OR EXISTS(SELECT 1 FROM public.user_billing ub WHERE ub.user_id=b.owner_user_id)
    ON CONFLICT(owner_user_id) DO NOTHING;
    INSERT INTO public.billing_trial_owner_history(owner_user_id,state,source)
    SELECT ub.user_id,'legacy_unknown','migration_019_existing_customer_mapping'
    FROM public.user_billing ub ON CONFLICT(owner_user_id) DO NOTHING;
    INSERT INTO public.billing_trial_owner_history(owner_user_id,state,source,stripe_subscription_id)
    SELECT s.user_id,'legacy_unknown','migration_019_existing_subscription',s.id
    FROM public.subscriptions s ON CONFLICT(owner_user_id) DO NOTHING;
    INSERT INTO public.billing_trial_owner_history(owner_user_id,state,source)
    SELECT c.owner_user_id,'legacy_unknown','migration_019_existing_customer_mapping'
    FROM public.billing_owner_customers c ON CONFLICT(owner_user_id) DO NOTHING;
    INSERT INTO public.billing_migration_receipts(migration_id) VALUES('019_billing_lifecycle_legacy_seed');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.billing_reconciliation_leases (
  owner_user_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  event_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  fence UUID NOT NULL,
  lease_until TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.billing_webhook_events (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('processing', 'completed', 'ignored')),
  owner_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.claim_billing_reconciliation_lease(
  p_owner_user_id UUID, p_event_id TEXT, p_event_type TEXT, p_lease_ms INTEGER DEFAULT 60000
) RETURNS TABLE(kind TEXT, fence UUID, lease_until TIMESTAMPTZ)
LANGUAGE plpgsql AS $$
DECLARE existing_status TEXT; claimed RECORD;
BEGIN
  SELECT * INTO claimed FROM public.billing_reconciliation_leases
    WHERE owner_user_id=p_owner_user_id FOR UPDATE;
  IF FOUND AND claimed.lease_until > now() THEN
    RETURN QUERY SELECT 'busy'::TEXT, NULL::UUID, NULL::TIMESTAMPTZ; RETURN;
  END IF;
  IF FOUND THEN
    UPDATE public.billing_reconciliation_leases SET event_id=p_event_id, event_type=p_event_type,
      fence=gen_random_uuid(), lease_until=now()+make_interval(secs => p_lease_ms / 1000.0), updated_at=now()
      WHERE owner_user_id=p_owner_user_id RETURNING public.billing_reconciliation_leases.fence,
      public.billing_reconciliation_leases.lease_until INTO claimed;
  ELSE
    INSERT INTO public.billing_reconciliation_leases(owner_user_id,event_id,event_type,fence,lease_until)
      VALUES(p_owner_user_id,p_event_id,p_event_type,gen_random_uuid(),now()+make_interval(secs => p_lease_ms / 1000.0))
      ON CONFLICT(owner_user_id) DO NOTHING
      RETURNING public.billing_reconciliation_leases.fence,public.billing_reconciliation_leases.lease_until INTO claimed;
    IF NOT FOUND THEN RETURN QUERY SELECT 'busy'::TEXT,NULL::UUID,NULL::TIMESTAMPTZ; RETURN; END IF;
  END IF;
  SELECT e.status INTO existing_status FROM public.billing_webhook_events e WHERE e.event_id = p_event_id;
  IF existing_status IN ('completed', 'ignored') THEN
    DELETE FROM public.billing_reconciliation_leases WHERE owner_user_id=p_owner_user_id AND fence=claimed.fence;
    RETURN QUERY SELECT 'duplicate'::TEXT, NULL::UUID, NULL::TIMESTAMPTZ; RETURN;
  END IF;
  INSERT INTO public.billing_webhook_events(event_id, event_type, status, owner_user_id)
    VALUES (p_event_id, p_event_type, 'processing', p_owner_user_id)
    ON CONFLICT (event_id) DO UPDATE SET updated_at = now()
      WHERE public.billing_webhook_events.status = 'processing';
  SELECT l.fence,l.lease_until INTO claimed FROM public.billing_reconciliation_leases l WHERE l.owner_user_id=p_owner_user_id;
  IF NOT FOUND THEN RETURN QUERY SELECT 'busy'::TEXT, NULL::UUID, NULL::TIMESTAMPTZ; RETURN; END IF;
  RETURN QUERY SELECT 'claimed'::TEXT, claimed.fence, claimed.lease_until;
END $$;

CREATE OR REPLACE FUNCTION public.apply_stripe_webhook_snapshot(
  p_event_id TEXT, p_event_type TEXT, p_owner_user_id UUID, p_business_id UUID, p_customer_id TEXT,
  p_subscription JSONB, p_plan_id TEXT, p_billing_period TEXT,
  p_trial_start TIMESTAMPTZ, p_fence UUID, p_agents JSONB DEFAULT '[]'::JSONB,
  p_expected_previous_subscription_id TEXT DEFAULT NULL, p_previous_subscription_status TEXT DEFAULT NULL
) RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE lease_row public.billing_reconciliation_leases%ROWTYPE;
DECLARE agent JSONB; subscription_id TEXT; subscription_status TEXT;
DECLARE subscription_price TEXT; period_start TIMESTAMPTZ; period_end TIMESTAMPTZ;
BEGIN
  SELECT * INTO lease_row FROM public.billing_reconciliation_leases
    WHERE owner_user_id = p_owner_user_id FOR UPDATE;
  IF NOT FOUND OR lease_row.event_id <> p_event_id OR lease_row.fence <> p_fence OR lease_row.lease_until <= clock_timestamp() THEN
    RAISE EXCEPTION 'stale billing reconciliation fence' USING ERRCODE = '40001';
  END IF;
  -- Team admission uses this same mutex before checking Complete entitlement.
  PERFORM 1 FROM public.businesses WHERE id = p_business_id AND owner_user_id = p_owner_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'billing owner/business mapping conflict' USING ERRCODE = '23503';
  END IF;
  IF EXISTS(SELECT 1 FROM public.billing_owner_customers WHERE owner_user_id=p_owner_user_id AND stripe_customer_id<>p_customer_id)
    OR EXISTS(SELECT 1 FROM public.user_billing WHERE user_id=p_owner_user_id AND stripe_customer_id<>p_customer_id)
    OR EXISTS(SELECT 1 FROM public.businesses WHERE id=p_business_id AND stripe_customer_id IS NOT NULL AND stripe_customer_id<>p_customer_id) THEN
    RAISE EXCEPTION 'billing customer mapping changed during reconciliation' USING ERRCODE = '40001';
  END IF;
  INSERT INTO public.billing_owner_customers(owner_user_id,stripe_customer_id) VALUES(p_owner_user_id,p_customer_id)
    ON CONFLICT(owner_user_id) DO NOTHING;
  INSERT INTO public.user_billing(user_id,stripe_customer_id) VALUES(p_owner_user_id,p_customer_id)
    ON CONFLICT(user_id) DO NOTHING;
  IF NOT EXISTS(SELECT 1 FROM public.user_billing WHERE user_id=p_owner_user_id AND stripe_customer_id=p_customer_id) THEN
    RAISE EXCEPTION 'legacy billing customer mapping changed during reconciliation' USING ERRCODE = '40001';
  END IF;
  UPDATE public.businesses SET stripe_customer_id=p_customer_id WHERE id=p_business_id AND stripe_customer_id IS NULL;
  subscription_id := p_subscription->>'id';
  subscription_status := p_subscription->>'status';
  subscription_price := p_subscription->>'priceId';
  period_start := NULLIF(p_subscription->>'currentPeriodStart', '')::TIMESTAMPTZ;
  period_end := NULLIF(p_subscription->>'currentPeriodEnd', '')::TIMESTAMPTZ;
  IF subscription_id IS NULL OR subscription_status IS NULL THEN
    RAISE EXCEPTION 'incomplete authoritative subscription snapshot' USING ERRCODE = '22023';
  END IF;
  IF p_plan_id NOT IN ('replies','booster','complete') OR p_billing_period NOT IN ('monthly','annual')
    OR jsonb_typeof(p_agents) <> 'array' OR jsonb_array_length(p_agents) <> 2
    OR (SELECT count(DISTINCT a->>'agentId') FROM jsonb_array_elements(p_agents) a) <> 2
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_agents) a
      WHERE a->>'agentId' NOT IN ('review_replies','review_booster')
         OR a->>'status' NOT IN ('active','trialing','past_due','unpaid','canceled','inactive')) THEN
    RAISE EXCEPTION 'invalid plan, period, or billing agent state' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.business_agents WHERE business_id=p_business_id
      AND stripe_subscription_id IS NOT NULL
      AND stripe_subscription_id IS DISTINCT FROM p_expected_previous_subscription_id) THEN
    RAISE EXCEPTION 'billing subscription changed during reconciliation' USING ERRCODE = '40001';
  END IF;
  IF p_expected_previous_subscription_id IS NOT NULL AND p_expected_previous_subscription_id<>subscription_id THEN
    IF p_previous_subscription_status IS NULL OR p_previous_subscription_status NOT IN ('canceled','incomplete_expired') THEN
      RAISE EXCEPTION 'subscription replacement requires an authoritative terminal predecessor' USING ERRCODE = '22023';
    END IF;
    UPDATE public.subscriptions SET status=p_previous_subscription_status,updated_at=now()
      WHERE id=p_expected_previous_subscription_id AND user_id=p_owner_user_id;
  END IF;
  INSERT INTO public.subscriptions(id, user_id, status, price_id, current_period_start, current_period_end, updated_at)
    VALUES (subscription_id, p_owner_user_id, subscription_status, subscription_price, period_start, period_end, now())
    ON CONFLICT (id) DO UPDATE SET user_id = EXCLUDED.user_id, status = EXCLUDED.status,
      price_id = EXCLUDED.price_id, current_period_start=EXCLUDED.current_period_start,
      current_period_end = EXCLUDED.current_period_end, updated_at = now()
    WHERE public.subscriptions.user_id=EXCLUDED.user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Stripe subscription is already mapped to another owner' USING ERRCODE = '23505'; END IF;
  FOR agent IN SELECT value FROM jsonb_array_elements(p_agents) LOOP
    INSERT INTO public.business_agents(business_id, agent_id, status, activated_at, deactivated_at, plan_id, billing_period,
      stripe_subscription_id, stripe_price_id, current_period_start, current_period_end, updated_at)
    VALUES (p_business_id, agent->>'agentId', agent->>'status',
      NULLIF(agent->>'activatedAt','')::TIMESTAMPTZ, NULLIF(agent->>'deactivatedAt','')::TIMESTAMPTZ,
      p_plan_id, p_billing_period, subscription_id, subscription_price, period_start, period_end, now())
    ON CONFLICT (business_id, agent_id) DO UPDATE SET status = EXCLUDED.status,
      activated_at = EXCLUDED.activated_at, deactivated_at = EXCLUDED.deactivated_at,
      stripe_subscription_id = EXCLUDED.stripe_subscription_id, stripe_price_id = EXCLUDED.stripe_price_id,
      current_period_start = EXCLUDED.current_period_start, current_period_end = EXCLUDED.current_period_end,
      plan_id = p_plan_id, billing_period = p_billing_period,
      updated_at = now();
  END LOOP;
  IF NULLIF(p_subscription->>'billingIntentToken','') IS NOT NULL THEN
    UPDATE public.billing_checkout_intents SET status='completed', stripe_subscription_id=subscription_id,
      completed_at=COALESCE(completed_at,now()),updated_at=now()
      WHERE business_id=p_business_id AND owner_user_id=p_owner_user_id
        AND provider_intent_token=p_subscription->>'billingIntentToken' AND status IN ('pending','uncertain','completed');
  END IF;
  UPDATE public.profiles p SET
    plan_type = COALESCE((SELECT ax.plan_id FROM public.businesses bx JOIN public.business_agents ax ON ax.business_id=bx.id
      WHERE bx.owner_user_id=p_owner_user_id AND ax.status IN ('active','trialing','past_due')
      ORDER BY CASE ax.status WHEN 'active' THEN 1 WHEN 'trialing' THEN 2 ELSE 3 END,
        CASE ax.plan_id WHEN 'complete' THEN 1 ELSE 2 END, ax.updated_at DESC LIMIT 1),'free'),
    plan_status = COALESCE((SELECT ax.status FROM public.businesses bx JOIN public.business_agents ax ON ax.business_id=bx.id
      WHERE bx.owner_user_id=p_owner_user_id AND ax.status IN ('active','trialing','past_due')
      ORDER BY CASE ax.status WHEN 'active' THEN 1 WHEN 'trialing' THEN 2 ELSE 3 END,
        CASE ax.plan_id WHEN 'complete' THEN 1 ELSE 2 END, ax.updated_at DESC LIMIT 1),subscription_status),
    plan_current_period_end = (SELECT ax.current_period_end FROM public.businesses bx JOIN public.business_agents ax ON ax.business_id=bx.id
      WHERE bx.owner_user_id=p_owner_user_id AND ax.status IN ('active','trialing','past_due')
      ORDER BY CASE ax.status WHEN 'active' THEN 1 WHEN 'trialing' THEN 2 ELSE 3 END,
        CASE ax.plan_id WHEN 'complete' THEN 1 ELSE 2 END, ax.updated_at DESC LIMIT 1),
    updated_at=now() WHERE p.id=p_owner_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'billing owner profile missing' USING ERRCODE = '23503'; END IF;
  IF p_trial_start IS NOT NULL THEN
    INSERT INTO public.billing_trial_business_history(business_id,state,source,stripe_subscription_id,consumed_at,updated_at)
      VALUES(p_business_id,'consumed','stripe_authoritative_trial',subscription_id,p_trial_start,now())
      ON CONFLICT(business_id) DO UPDATE SET state='consumed',source='stripe_authoritative_trial',
        stripe_subscription_id=EXCLUDED.stripe_subscription_id,consumed_at=COALESCE(public.billing_trial_business_history.consumed_at,EXCLUDED.consumed_at),updated_at=now();
    INSERT INTO public.billing_trial_owner_history(owner_user_id,state,source,stripe_subscription_id,consumed_at,updated_at)
      VALUES(p_owner_user_id,'consumed','stripe_authoritative_trial',subscription_id,p_trial_start,now())
      ON CONFLICT(owner_user_id) DO UPDATE SET state='consumed',source='stripe_authoritative_trial',
        stripe_subscription_id=EXCLUDED.stripe_subscription_id,consumed_at=COALESCE(public.billing_trial_owner_history.consumed_at,EXCLUDED.consumed_at),updated_at=now();
    DELETE FROM public.billing_trial_reservations WHERE owner_user_id=p_owner_user_id;
  END IF;
  IF subscription_status IN ('canceled','incomplete_expired') THEN
    UPDATE public.billing_checkout_intents SET status='retired', updated_at=now()
      WHERE business_id=p_business_id AND status='completed'
       AND (stripe_subscription_id=subscription_id OR provider_intent_token=p_subscription->>'billingIntentToken');
    DELETE FROM public.billing_trial_reservations r WHERE r.owner_user_id=p_owner_user_id
      AND r.business_id=p_business_id AND EXISTS (SELECT 1 FROM public.billing_checkout_intents i WHERE i.id=r.intent_id AND i.status='retired');
  END IF;
  UPDATE public.billing_webhook_events SET status='completed', owner_user_id=p_owner_user_id,
    completed_at=now(), updated_at=now() WHERE event_id=p_event_id AND status='processing';
  IF NOT FOUND THEN RAISE EXCEPTION 'billing webhook event claim missing' USING ERRCODE = '40001'; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.mark_stripe_event_ignored(p_event_id TEXT, p_event_type TEXT)
RETURNS VOID LANGUAGE SQL AS $$
  INSERT INTO public.billing_webhook_events(event_id,event_type,status,completed_at)
    VALUES (p_event_id,p_event_type,'ignored',now())
    ON CONFLICT (event_id) DO UPDATE SET status='ignored',completed_at=now(),updated_at=now()
      WHERE public.billing_webhook_events.status <> 'completed';
$$;
