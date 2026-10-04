-- A11 billing activation integration proposal. Replaces selected migration 019
-- functions after migration 026; do not renumber or edit historical migrations.
-- Provider leases and privacy deletion locks use customer then checkout-owner order.
ALTER TABLE public.billing_customer_provisioning
  ADD COLUMN IF NOT EXISTS provider_customer_id TEXT;
CREATE OR REPLACE FUNCTION public.claim_billing_checkout_intent(
  p_business_id UUID, p_owner_user_id UUID, p_plan_id TEXT, p_billing_period TEXT,
  p_customer_id TEXT, p_request_hash TEXT, p_stripe_payload JSONB, p_trial_requested BOOLEAN
) RETURNS TABLE(kind TEXT,intent_id UUID,idempotency_key TEXT,fence UUID,stripe_payload JSONB,status TEXT,
  session_id TEXT,checkout_url TEXT,created_at TIMESTAMPTZ) LANGUAGE plpgsql AS $$
DECLARE old_intent public.billing_checkout_intents%ROWTYPE; new_intent public.billing_checkout_intents%ROWTYPE;
DECLARE reserved_business UUID; history_state TEXT; legacy_customer TEXT; canonical_customer TEXT;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('billing-customer:' || p_owner_user_id::TEXT, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended('billing-checkout-owner:' || p_owner_user_id::TEXT, 0));
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id=p_owner_user_id AND privacy_deletion_requested_at IS NULL) THEN
    RETURN QUERY SELECT 'blocked',NULL::UUID,NULL::TEXT,NULL::UUID,NULL::JSONB,NULL::TEXT,NULL::TEXT,NULL::TEXT,NULL::TIMESTAMPTZ; RETURN;
  END IF;
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

CREATE OR REPLACE FUNCTION public.claim_billing_customer_provisioning(p_owner_user_id UUID)
RETURNS TABLE(kind TEXT,customer_id TEXT,email TEXT,idempotency_key TEXT,fence UUID,status TEXT,created_at TIMESTAMPTZ) LANGUAGE plpgsql AS $$
DECLARE canonical TEXT; legacy TEXT; provision public.billing_customer_provisioning%ROWTYPE; owner_email TEXT;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('billing-customer:'||p_owner_user_id::TEXT,0));
  SELECT u.email INTO owner_email FROM public.users u WHERE u.id=p_owner_user_id AND u.privacy_deletion_requested_at IS NULL FOR UPDATE;
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
    IF provision.provider_create_state='done' AND provision.provider_create_lease_until IS NULL AND provision.provider_customer_id IS NOT NULL THEN
      RETURN QUERY SELECT 'mapped',provision.provider_customer_id,provision.owner_email,provision.idempotency_key,provision.fence,provision.status,provision.created_at; RETURN;
    END IF;
    RETURN QUERY SELECT 'existing',NULL::TEXT,provision.owner_email,provision.idempotency_key,provision.fence,provision.status,provision.created_at; RETURN;
  END IF;
  INSERT INTO public.billing_customer_provisioning(owner_user_id,owner_email,idempotency_key)
    VALUES(p_owner_user_id,owner_email,'ornigami-customer-'||p_owner_user_id::TEXT) RETURNING * INTO provision;
  RETURN QUERY SELECT 'claimed',NULL::TEXT,provision.owner_email,provision.idempotency_key,provision.fence,provision.status,provision.created_at;
END $$;

CREATE OR REPLACE FUNCTION public.record_billing_customer_provider_result(p_owner_user_id UUID,p_fence UUID,p_customer_id TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql AS $$
DECLARE changed INTEGER;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('billing-customer:'||p_owner_user_id::TEXT,0));
  PERFORM pg_advisory_xact_lock(hashtextextended('billing-checkout-owner:'||p_owner_user_id::TEXT,0));
  UPDATE public.billing_customer_provisioning
    SET provider_customer_id=p_customer_id,updated_at=now()
    WHERE owner_user_id=p_owner_user_id AND fence=p_fence AND provider_create_state='active'
      AND (provider_customer_id IS NULL OR provider_customer_id=p_customer_id);
  GET DIAGNOSTICS changed=ROW_COUNT;
  RETURN changed=1;
END $$;

CREATE OR REPLACE FUNCTION public.finalize_billing_customer_provisioning(p_owner_user_id UUID,p_fence UUID,p_customer_id TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql AS $$
DECLARE changed INTEGER; v_customer TEXT;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('billing-customer:'||p_owner_user_id::TEXT,0));
  PERFORM pg_advisory_xact_lock(hashtextextended('billing-checkout-owner:'||p_owner_user_id::TEXT,0));
  SELECT provider_customer_id INTO v_customer FROM public.billing_customer_provisioning
    WHERE owner_user_id=p_owner_user_id AND fence=p_fence AND provider_create_state='done'
      AND provider_create_lease_until IS NULL FOR UPDATE;
  IF NOT FOUND OR v_customer IS DISTINCT FROM p_customer_id THEN RETURN false; END IF;
  PERFORM 1 FROM public.businesses WHERE owner_user_id=p_owner_user_id ORDER BY id FOR UPDATE;
  PERFORM 1 FROM public.users WHERE id=p_owner_user_id AND privacy_deletion_requested_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF EXISTS (SELECT 1 FROM public.billing_owner_customers WHERE owner_user_id=p_owner_user_id AND stripe_customer_id<>p_customer_id)
    OR EXISTS (SELECT 1 FROM public.user_billing WHERE user_id=p_owner_user_id AND stripe_customer_id<>p_customer_id)
    OR EXISTS (SELECT 1 FROM public.businesses WHERE owner_user_id=p_owner_user_id AND stripe_customer_id IS NOT NULL AND stripe_customer_id<>p_customer_id) THEN
    RAISE EXCEPTION 'customer mapping conflicts with recorded provider result' USING ERRCODE='23505';
  END IF;
  INSERT INTO public.billing_owner_customers(owner_user_id,stripe_customer_id) VALUES(p_owner_user_id,p_customer_id)
    ON CONFLICT(owner_user_id) DO NOTHING;
  INSERT INTO public.user_billing(user_id,stripe_customer_id) VALUES(p_owner_user_id,p_customer_id)
    ON CONFLICT(user_id) DO NOTHING;
  IF NOT EXISTS (SELECT 1 FROM public.billing_owner_customers WHERE owner_user_id=p_owner_user_id AND stripe_customer_id=p_customer_id)
    OR NOT EXISTS (SELECT 1 FROM public.user_billing WHERE user_id=p_owner_user_id AND stripe_customer_id=p_customer_id) THEN
    RAISE EXCEPTION 'canonical customer mapping could not be persisted' USING ERRCODE='23505';
  END IF;
  PERFORM 1 FROM public.businesses WHERE owner_user_id=p_owner_user_id ORDER BY id FOR UPDATE;
  UPDATE public.businesses SET stripe_customer_id=p_customer_id,updated_at=now()
    WHERE owner_user_id=p_owner_user_id AND stripe_customer_id IS NULL;
  DELETE FROM public.billing_customer_provisioning WHERE owner_user_id=p_owner_user_id AND fence=p_fence
    AND provider_create_state='done' AND provider_customer_id=p_customer_id;
  GET DIAGNOSTICS changed=ROW_COUNT;
  RETURN changed=1;
END $$;

CREATE OR REPLACE FUNCTION public.set_billing_business_customer(p_business_id UUID,p_customer_id TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql AS $$
DECLARE v_owner UUID; changed INTEGER;
BEGIN
  SELECT owner_user_id INTO v_owner FROM public.businesses WHERE id=p_business_id;
  IF NOT FOUND THEN RETURN false; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('billing-customer:'||v_owner::TEXT,0));
  PERFORM pg_advisory_xact_lock(hashtextextended('billing-checkout-owner:'||v_owner::TEXT,0));
  PERFORM 1 FROM public.businesses WHERE id=p_business_id AND owner_user_id=v_owner
    AND (stripe_customer_id IS NULL OR stripe_customer_id=p_customer_id) FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  PERFORM 1 FROM public.users WHERE id=v_owner AND privacy_deletion_requested_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  UPDATE public.businesses SET stripe_customer_id=p_customer_id,updated_at=now()
    WHERE id=p_business_id AND owner_user_id=v_owner AND (stripe_customer_id IS NULL OR stripe_customer_id=p_customer_id);
  GET DIAGNOSTICS changed=ROW_COUNT;
  RETURN changed=1;
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
  IF NOT FOUND OR p_fence IS NULL OR lease_row.fence IS DISTINCT FROM p_fence
    OR lease_row.lease_until IS NULL OR lease_row.lease_until <= clock_timestamp() THEN
    RAISE EXCEPTION 'stale billing reconciliation fence' USING ERRCODE = '40001';
  END IF;
-- Team admission uses this same mutex before checking Complete entitlement.
  PERFORM 1 FROM public.businesses WHERE id = p_business_id AND owner_user_id = p_owner_user_id FOR UPDATE;
  IF NOT FOUND THEN
    -- Final deletion removes both rows. A late event for that exact owner is terminally ignored.
    PERFORM 1 FROM public.users WHERE id=p_owner_user_id AND privacy_deletion_requested_at IS NULL FOR UPDATE;
    IF NOT FOUND THEN
      UPDATE public.billing_webhook_events SET status='ignored', completed_at=now(), updated_at=now()
        WHERE event_id=p_event_id AND status='processing';
      RETURN;
    END IF;
    RAISE EXCEPTION 'billing owner/business mapping conflict' USING ERRCODE = '23503';
  END IF;
  -- Match the workspace writer business-then-user lock order. The freeze transaction
  -- either commits first and this snapshot is ignored, or waits until this snapshot ends.
  PERFORM 1 FROM public.users WHERE id=p_owner_user_id AND privacy_deletion_requested_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN
    UPDATE public.billing_webhook_events SET status='ignored', completed_at=now(), updated_at=now()
      WHERE event_id=p_event_id AND status='processing';
    RETURN;
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
