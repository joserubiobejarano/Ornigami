-- A22 permission evidence for Review Booster review requests.
-- Existing rows intentionally stay incomplete and are ineligible for sends.
ALTER TABLE public.followup_visits
  ADD COLUMN IF NOT EXISTS permission_source TEXT,
  ADD COLUMN IF NOT EXISTS permission_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS permission_notice_version TEXT,
  ADD COLUMN IF NOT EXISTS permission_recipient_email TEXT,
  ADD COLUMN IF NOT EXISTS permission_scope TEXT,
  ADD COLUMN IF NOT EXISTS permission_withdrawn_at TIMESTAMPTZ;

ALTER TABLE public.followup_visits
  ADD CONSTRAINT followup_visits_permission_evidence_check CHECK (
    (permission_source IS NULL AND permission_at IS NULL AND permission_notice_version IS NULL
      AND permission_recipient_email IS NULL AND permission_scope IS NULL)
    OR (permission_source IS NOT NULL AND length(trim(permission_source)) BETWEEN 1 AND 120
      AND permission_source !~ '[[:cntrl:]]'
      AND permission_at IS NOT NULL AND permission_notice_version IS NOT NULL
      AND length(trim(permission_notice_version)) BETWEEN 1 AND 80
      AND permission_notice_version !~ '[[:cntrl:]]'
      AND permission_recipient_email IS NOT NULL AND permission_scope='review_request')
  );

CREATE OR REPLACE FUNCTION public.booster_visit_has_review_permission(p_visit_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.followup_visits v
    WHERE v.id=p_visit_id
      AND v.customer_email IS NOT NULL
      AND v.permission_source IS NOT NULL AND length(trim(v.permission_source)) BETWEEN 1 AND 120
      AND v.permission_at IS NOT NULL AND v.permission_at <= v.created_at
      AND v.permission_notice_version IS NOT NULL AND length(trim(v.permission_notice_version)) BETWEEN 1 AND 80
      AND v.permission_recipient_email=lower(trim(v.customer_email))
      AND v.permission_scope='review_request'
      AND v.permission_withdrawn_at IS NULL
  )
$$;

-- Put evidence filtering inside the bounded candidate query, before LIMIT, so
-- legacy rows cannot occupy every batch ahead of an eligible recipient. The
-- existing A06 aged-out and sent-reconciliation maintenance stays in place.
CREATE OR REPLACE FUNCTION public.list_booster_delivery_candidates_a06(p_business_id UUID,p_limit INTEGER DEFAULT 50)
RETURNS TABLE(
  visit_id UUID,business_id UUID,customer_name TEXT,customer_email TEXT,
  visited_at TIMESTAMPTZ,service_name TEXT,business_name TEXT,business_type TEXT,
  city TEXT,google_review_url TEXT,rebooking_url TEXT,tone TEXT,language TEXT,
  email_from_name TEXT,delivery_id UUID,delivery_state TEXT,
  provider_payload JSONB,idempotency_key TEXT,first_attempt_at TIMESTAMPTZ
) LANGUAGE sql VOLATILE AS $$
  WITH legacy_sent_reconciled AS (
    UPDATE public.followup_visits v SET followup_status='sent',
      followup_sent_at=COALESCE(v.followup_sent_at,(SELECT min(fm.sent_at) FROM public.followup_messages fm WHERE fm.visit_id=v.id AND lower(fm.status)='sent'),now()),
      last_error=NULL,updated_at=now()
    WHERE v.id IN (
      SELECT v2.id FROM public.followup_visits v2
      WHERE v2.business_id=p_business_id AND v2.followup_sent_at IS NULL
        AND EXISTS (SELECT 1 FROM public.followup_messages fm WHERE fm.visit_id=v2.id AND lower(fm.status)='sent')
      ORDER BY v2.visited_at ASC,v2.id ASC LIMIT 50 FOR UPDATE SKIP LOCKED
    ) RETURNING id
  ), aged_out AS (
    UPDATE public.followup_visits SET followup_status='expired',
      last_error='The seven-day follow-up window expired before delivery.',updated_at=now()
    WHERE id IN (
      SELECT v.id FROM public.followup_visits v
      WHERE v.business_id=p_business_id AND v.followup_sent_at IS NULL
        AND lower(v.followup_status) IN ('pending','failed','deferred_quota')
        AND v.visited_at<now()-interval '7 days'
      ORDER BY v.visited_at ASC,v.id ASC LIMIT 50 FOR UPDATE SKIP LOCKED
    ) RETURNING id
  )
  SELECT v.id,v.business_id,v.customer_name,v.customer_email,v.visited_at,NULL::text,
         b.name,b.business_type,b.city,b.google_review_url,b.rebooking_url,b.tone,b.language,b.email_from_name,
         d.id,d.state,d.provider_payload,d.idempotency_key,d.first_attempt_at
  FROM public.followup_visits v
  JOIN public.businesses b ON b.id=v.business_id
  LEFT JOIN public.business_agents ba ON ba.business_id=b.id AND ba.agent_id='review_booster'
  LEFT JOIN public.booster_followup_deliveries d ON d.business_id=v.business_id AND d.visit_id=v.id
  WHERE v.business_id=p_business_id AND v.followup_sent_at IS NULL
    AND ((lower(v.followup_status) IN ('pending','failed','deferred_quota')
      AND ba.status IN ('active','trialing') AND ba.plan_id IN ('booster','complete')
      AND coalesce(v.attempt_count,0)<3
      AND v.customer_email IS NOT NULL AND length(trim(v.customer_email))>0
      AND b.google_review_url IS NOT NULL AND length(trim(b.google_review_url))>0
      AND v.visited_at<=now()-interval '23 hours' AND v.visited_at>=now()-interval '7 days'
      AND NOT EXISTS (SELECT 1 FROM public.followup_unsubscribes u
        WHERE u.business_id=v.business_id AND u.customer_email_normalized=lower(trim(v.customer_email))))
      OR (d.state IN ('claimed','prepared','sending','unknown','rejected') AND d.lease_until<=now()))
    AND (d.id IS NULL OR d.state IN ('claimed','prepared','sending','unknown','deferred_quota','rejected'))
    AND (d.id IS NULL OR d.lease_until<=now())
    AND (v.next_attempt_at IS NULL OR v.next_attempt_at<=now())
    AND ((public.booster_visit_has_review_permission(v.id)
      AND NOT EXISTS (SELECT 1 FROM public.booster_delivery_suppressions s WHERE s.email_normalized=lower(trim(v.customer_email))))
      OR d.first_attempt_at IS NOT NULL)
  ORDER BY v.visited_at ASC,v.id ASC
  LIMIT LEAST(GREATEST(COALESCE(p_limit,50),1),50)
  FOR UPDATE OF v SKIP LOCKED
$$;

-- Replace the 038 admission contract with an email-only evidenced intake.
DROP FUNCTION IF EXISTS public.a11_admit_booster_followup_visit(UUID,UUID,TEXT,TEXT,TEXT,TEXT,TEXT,TIMESTAMPTZ,TEXT);
CREATE FUNCTION public.a11_admit_booster_followup_visit(
  p_business_id UUID, p_actor_user_id UUID, p_source TEXT, p_customer_name TEXT,
  p_customer_email TEXT, p_visited_at TIMESTAMPTZ, p_external_id TEXT,
  p_permission_source TEXT, p_permission_at TIMESTAMPTZ, p_permission_notice_version TEXT
) RETURNS TABLE(
  admission_status TEXT, id UUID, business_id UUID, customer_name TEXT,
  customer_email TEXT, customer_phone TEXT, service_name TEXT, visited_at TIMESTAMPTZ,
  source TEXT, followup_status TEXT, followup_sent_at TIMESTAMPTZ, error_reason TEXT
) LANGUAGE plpgsql VOLATILE AS $$
#variable_conflict use_column
DECLARE v_owner UUID; v_user_count INTEGER; v_agent public.business_agents%ROWTYPE;
        v_visit public.followup_visits%ROWTYPE;
BEGIN
  IF p_business_id IS NULL OR p_actor_user_id IS NULL OR p_visited_at IS NULL
    OR p_source NOT IN ('manual','csv') OR p_customer_email IS NULL OR length(trim(p_customer_email))=0
    OR p_permission_source IS NULL OR length(trim(p_permission_source)) NOT BETWEEN 1 AND 120
    OR p_permission_at IS NULL OR p_permission_at>now()
    OR p_permission_notice_version IS NULL OR length(trim(p_permission_notice_version)) NOT BETWEEN 1 AND 80 THEN
    RETURN QUERY SELECT 'denied'::TEXT,NULL::UUID,NULL::UUID,NULL::TEXT,NULL::TEXT,NULL::TEXT,
      NULL::TEXT,NULL::TIMESTAMPTZ,NULL::TEXT,NULL::TEXT,NULL::TIMESTAMPTZ,NULL::TEXT;
    RETURN;
  END IF;
  SELECT b.owner_user_id INTO v_owner FROM public.businesses b WHERE b.id=p_business_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'denied'::TEXT,NULL::UUID,NULL::UUID,NULL::TEXT,NULL::TEXT,NULL::TEXT,
      NULL::TEXT,NULL::TIMESTAMPTZ,NULL::TEXT,NULL::TEXT,NULL::TIMESTAMPTZ,NULL::TEXT;
    RETURN;
  END IF;
  PERFORM 1 FROM public.users u WHERE u.id IN (v_owner,p_actor_user_id) ORDER BY u.id FOR UPDATE;
  SELECT count(*) INTO v_user_count FROM public.users u WHERE u.id IN (v_owner,p_actor_user_id);
  IF v_user_count <> (CASE WHEN v_owner=p_actor_user_id THEN 1 ELSE 2 END)
    OR EXISTS (SELECT 1 FROM public.users u WHERE u.id IN (v_owner,p_actor_user_id) AND u.privacy_deletion_requested_at IS NOT NULL)
    OR NOT (v_owner=p_actor_user_id OR EXISTS (SELECT 1 FROM public.business_members bm WHERE bm.business_id=p_business_id AND bm.user_id=p_actor_user_id)) THEN
    RETURN QUERY SELECT 'denied'::TEXT,NULL::UUID,NULL::UUID,NULL::TEXT,NULL::TEXT,NULL::TEXT,
      NULL::TEXT,NULL::TIMESTAMPTZ,NULL::TEXT,NULL::TEXT,NULL::TIMESTAMPTZ,NULL::TEXT;
    RETURN;
  END IF;
  SELECT ba.* INTO v_agent FROM public.business_agents ba WHERE ba.business_id=p_business_id AND ba.agent_id='review_booster' FOR UPDATE;
  IF NOT FOUND OR NOT (v_agent.status IN ('active','trialing') OR (v_agent.status='past_due' AND v_agent.current_period_end>=now()-interval '7 days')) THEN
    RETURN QUERY SELECT 'denied'::TEXT,NULL::UUID,NULL::UUID,NULL::TEXT,NULL::TEXT,NULL::TEXT,
      NULL::TEXT,NULL::TIMESTAMPTZ,NULL::TEXT,NULL::TEXT,NULL::TIMESTAMPTZ,NULL::TEXT;
    RETURN;
  END IF;
  IF p_source='csv' THEN
    -- The legacy CSV partial unique index includes service_name. New intake no
    -- longer stores that field, so check the minimized identity under the
    -- business lock as well to prevent bypassing unresolved delivery fences.
    IF EXISTS (
      SELECT 1 FROM public.followup_visits existing
      WHERE existing.business_id=p_business_id AND existing.source='csv'
        AND lower(trim(existing.customer_email))=lower(trim(p_customer_email))
        AND existing.visited_at=p_visited_at
    ) THEN
      RETURN QUERY SELECT 'duplicate'::TEXT,NULL::UUID,NULL::UUID,NULL::TEXT,NULL::TEXT,NULL::TEXT,
        NULL::TEXT,NULL::TIMESTAMPTZ,NULL::TEXT,NULL::TEXT,NULL::TIMESTAMPTZ,NULL::TEXT;
      RETURN;
    END IF;
    INSERT INTO public.followup_visits(
      business_id,customer_name,customer_email,visited_at,source,followup_status,last_error,
      permission_source,permission_at,permission_notice_version,permission_recipient_email,permission_scope
    ) VALUES (
      p_business_id,p_customer_name,lower(trim(p_customer_email)),p_visited_at,'csv','pending',NULL,
      trim(p_permission_source),p_permission_at,trim(p_permission_notice_version),lower(trim(p_customer_email)),'review_request'
    ) ON CONFLICT (business_id,(lower(customer_email)),(coalesce(service_name,'')),visited_at)
      WHERE source='csv' AND customer_email IS NOT NULL DO NOTHING RETURNING * INTO v_visit;
    IF NOT FOUND THEN
      RETURN QUERY SELECT 'duplicate'::TEXT,NULL::UUID,NULL::UUID,NULL::TEXT,NULL::TEXT,NULL::TEXT,
        NULL::TEXT,NULL::TIMESTAMPTZ,NULL::TEXT,NULL::TEXT,NULL::TIMESTAMPTZ,NULL::TEXT;
      RETURN;
    END IF;
  ELSE
    INSERT INTO public.followup_visits(
      business_id,customer_name,customer_email,visited_at,source,external_id,followup_status,last_error,
      permission_source,permission_at,permission_notice_version,permission_recipient_email,permission_scope
    ) VALUES (
      p_business_id,p_customer_name,lower(trim(p_customer_email)),p_visited_at,'manual',p_external_id,'pending',NULL,
      trim(p_permission_source),p_permission_at,trim(p_permission_notice_version),lower(trim(p_customer_email)),'review_request'
    ) RETURNING * INTO v_visit;
  END IF;
  RETURN QUERY SELECT 'created'::TEXT,v_visit.id,v_visit.business_id,v_visit.customer_name,v_visit.customer_email,
    NULL::TEXT,NULL::TEXT,v_visit.visited_at,v_visit.source,v_visit.followup_status,v_visit.followup_sent_at,v_visit.last_error;
END $$;

-- Keep the legacy database arity explicit but fail closed for old callers.
CREATE FUNCTION public.a11_admit_booster_followup_visit(
  p_business_id UUID,p_actor_user_id UUID,p_source TEXT,p_customer_name TEXT,
  p_customer_email TEXT,p_customer_phone TEXT,p_service_name TEXT,
  p_visited_at TIMESTAMPTZ,p_external_id TEXT DEFAULT NULL
) RETURNS TABLE(
  admission_status TEXT,id UUID,business_id UUID,customer_name TEXT,customer_email TEXT,
  customer_phone TEXT,service_name TEXT,visited_at TIMESTAMPTZ,source TEXT,
  followup_status TEXT,followup_sent_at TIMESTAMPTZ,error_reason TEXT
) LANGUAGE sql VOLATILE AS $$
  SELECT 'denied'::TEXT,NULL::UUID,NULL::UUID,NULL::TEXT,NULL::TEXT,NULL::TEXT,
    NULL::TEXT,NULL::TIMESTAMPTZ,NULL::TEXT,NULL::TEXT,NULL::TIMESTAMPTZ,NULL::TEXT
$$;

-- Signed booking events are also permission evidence; old payloads fail closed.
DROP FUNCTION IF EXISTS public.admit_booster_booking_event(UUID,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TIMESTAMPTZ);
CREATE FUNCTION public.admit_booster_booking_event(
  p_credential_id UUID,p_source TEXT,p_event_type TEXT,p_external_id TEXT,
  p_customer_name TEXT,p_customer_email TEXT,p_visited_at TIMESTAMPTZ,
  p_permission_source TEXT,p_permission_at TIMESTAMPTZ,p_permission_notice_version TEXT
) RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE c public.booster_booking_credentials%ROWTYPE; b public.businesses%ROWTYPE;
        owner_row public.users%ROWTYPE; ba public.business_agents%ROWTYPE;
        v_event_id UUID; v_business_id UUID;
BEGIN
  SELECT cr.business_id INTO STRICT v_business_id FROM public.booster_booking_credentials cr WHERE cr.id=p_credential_id;
  SELECT * INTO b FROM public.businesses WHERE id=v_business_id FOR UPDATE;
  IF NOT FOUND THEN RETURN 'unauthorized'; END IF;
  SELECT * INTO owner_row FROM public.users WHERE id=b.owner_user_id FOR UPDATE;
  IF NOT FOUND OR to_jsonb(owner_row)->>'privacy_deletion_requested_at' IS NOT NULL THEN RETURN 'unauthorized'; END IF;
  SELECT * INTO c FROM public.booster_booking_credentials WHERE id=p_credential_id FOR UPDATE;
  IF NOT FOUND OR c.business_id<>b.id OR c.revoked_at IS NOT NULL THEN RETURN 'unauthorized'; END IF;
  SELECT * INTO ba FROM public.business_agents WHERE business_id=b.id AND agent_id='review_booster' FOR UPDATE;
  IF NOT FOUND OR coalesce(lower(ba.status),'') NOT IN ('active','trialing') OR coalesce(lower(ba.plan_id),'') NOT IN ('booster','complete') THEN RETURN 'inactive'; END IF;
  IF p_source IS NULL OR length(p_source) NOT BETWEEN 1 AND 40 OR p_event_type IS NULL
    OR length(p_event_type) NOT BETWEEN 1 AND 80 OR p_external_id IS NULL OR length(p_external_id) NOT BETWEEN 1 AND 200
    OR lower(p_event_type) NOT IN ('appointment.completed','booking.completed') OR p_visited_at IS NULL
    OR p_customer_email IS NULL OR length(trim(p_customer_email))=0
    OR p_permission_source IS NULL OR length(trim(p_permission_source)) NOT BETWEEN 1 AND 120
    OR p_permission_at IS NULL OR p_permission_at>now()
    OR p_permission_notice_version IS NULL OR length(trim(p_permission_notice_version)) NOT BETWEEN 1 AND 80 THEN RETURN 'invalid'; END IF;
  INSERT INTO public.followup_integration_events(business_id,source,event_type,external_id,raw_payload,processed_at)
    VALUES (b.id,p_source,p_event_type,p_external_id,NULL,now())
    ON CONFLICT (business_id,source,external_id) WHERE external_id IS NOT NULL DO NOTHING RETURNING id INTO v_event_id;
  IF v_event_id IS NULL THEN UPDATE public.booster_booking_credentials SET last_used_at=now() WHERE id=c.id; RETURN 'duplicate'; END IF;
  INSERT INTO public.followup_visits(
    business_id,customer_name,customer_email,visited_at,source,external_id,followup_status,last_error,
    permission_source,permission_at,permission_notice_version,permission_recipient_email,permission_scope
  ) VALUES (
    b.id,p_customer_name,lower(trim(p_customer_email)),p_visited_at,p_source,p_external_id,'pending',NULL,
    trim(p_permission_source),p_permission_at,trim(p_permission_notice_version),lower(trim(p_customer_email)),'review_request'
  );
  UPDATE public.booster_booking_credentials SET last_used_at=now() WHERE id=c.id;
  RETURN 'created';
EXCEPTION WHEN NO_DATA_FOUND THEN RETURN 'unauthorized';
END $$;

CREATE FUNCTION public.admit_booster_booking_event(
  p_credential_id UUID,p_source TEXT,p_event_type TEXT,p_external_id TEXT,
  p_customer_name TEXT,p_customer_email TEXT,p_customer_phone TEXT,
  p_service_name TEXT,p_visited_at TIMESTAMPTZ
) RETURNS TEXT LANGUAGE sql AS $$ SELECT 'invalid'::TEXT $$;

-- Candidate admission blocks legacy rows before AI generation and quota claims.
ALTER FUNCTION public.list_booster_delivery_candidates(UUID,INTEGER)
  RENAME TO list_booster_delivery_candidates_a22;
CREATE FUNCTION public.list_booster_delivery_candidates(p_business_id UUID,p_limit INTEGER DEFAULT 50)
RETURNS TABLE(
  visit_id UUID,business_id UUID,customer_name TEXT,customer_email TEXT,
  visited_at TIMESTAMPTZ,service_name TEXT,business_name TEXT,business_type TEXT,
  city TEXT,google_review_url TEXT,rebooking_url TEXT,tone TEXT,language TEXT,email_from_name TEXT,
  delivery_id UUID,delivery_state TEXT,provider_payload JSONB,idempotency_key TEXT,first_attempt_at TIMESTAMPTZ
) LANGUAGE plpgsql VOLATILE AS $$
DECLARE v_owner UUID;
BEGIN
  SELECT b.owner_user_id INTO v_owner FROM public.businesses b WHERE b.id=p_business_id FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  PERFORM 1 FROM public.users u WHERE u.id=v_owner FOR UPDATE;
  IF NOT FOUND OR EXISTS (SELECT 1 FROM public.users u WHERE u.id=v_owner AND u.privacy_deletion_requested_at IS NOT NULL) THEN RETURN; END IF;
  RETURN QUERY
    SELECT c.* FROM public.list_booster_delivery_candidates_a22(p_business_id,p_limit) c
    JOIN public.followup_visits v ON v.id=c.visit_id AND v.business_id=c.business_id
    WHERE (public.booster_visit_has_review_permission(v.id) AND NOT EXISTS (
        SELECT 1 FROM public.booster_delivery_suppressions s WHERE s.email_normalized=lower(trim(v.customer_email))))
      OR c.first_attempt_at IS NOT NULL;
END $$;

-- Claims use the same persisted evidence before they reserve quota or create a key.
ALTER FUNCTION public.claim_booster_delivery(UUID,UUID) RENAME TO claim_booster_delivery_a22;
CREATE FUNCTION public.claim_booster_delivery(p_business_id UUID,p_visit_id UUID)
RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE v_owner UUID; v public.followup_visits%ROWTYPE; d public.booster_followup_deliveries%ROWTYPE;
BEGIN
  SELECT b.owner_user_id INTO v_owner FROM public.businesses b WHERE b.id=p_business_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('kind','ineligible'); END IF;
  PERFORM 1 FROM public.users u WHERE u.id=v_owner FOR UPDATE;
  IF NOT FOUND OR EXISTS (SELECT 1 FROM public.users u WHERE u.id=v_owner AND u.privacy_deletion_requested_at IS NOT NULL) THEN
    RETURN jsonb_build_object('kind','ineligible');
  END IF;
  SELECT * INTO v FROM public.followup_visits WHERE id=p_visit_id AND business_id=p_business_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('kind','ineligible'); END IF;
  SELECT * INTO d FROM public.booster_followup_deliveries WHERE business_id=p_business_id AND visit_id=p_visit_id FOR UPDATE;
  IF d.id IS NOT NULL AND d.state IN ('accepted','expired','non_sendable','reconciliation_required') THEN
    RETURN jsonb_build_object('kind',CASE WHEN d.state='accepted' THEN 'existing' ELSE d.state END,'deliveryId',d.id,'state',d.state);
  END IF;
  IF v.followup_sent_at IS NOT NULL OR EXISTS (
    SELECT 1 FROM public.followup_messages fm WHERE fm.visit_id=v.id AND fm.business_id=v.business_id AND lower(fm.status)='sent'
  ) THEN RETURN public.claim_booster_delivery_a22(p_business_id,p_visit_id); END IF;
  IF NOT public.booster_visit_has_review_permission(v.id) THEN
    IF d.id IS NOT NULL AND d.first_attempt_at IS NOT NULL THEN
      UPDATE public.booster_followup_deliveries SET state='reconciliation_required',updated_at=now() WHERE id=d.id;
      RETURN jsonb_build_object('kind','reconciliation_required','deliveryId',d.id);
    END IF;
    IF d.id IS NOT NULL AND d.state NOT IN ('accepted','expired','non_sendable','reconciliation_required') THEN
      UPDATE public.booster_followup_deliveries SET state='non_sendable',updated_at=now() WHERE id=d.id;
    END IF;
    UPDATE public.followup_visits SET followup_status='skipped',updated_at=now()
      WHERE id=v.id AND followup_sent_at IS NULL AND lower(followup_status) IN ('pending','failed','deferred_quota');
    RETURN jsonb_build_object('kind','non_sendable');
  END IF;
  RETURN public.claim_booster_delivery_a22(p_business_id,p_visit_id);
END $$;

-- Send-time permission fence. Preserve the A25 provider suppression and A36
-- privacy/actor checks by delegating allowed sends to the prior canonical wrapper.
ALTER FUNCTION public.begin_booster_delivery_send(UUID,UUID,UUID)
  RENAME TO begin_booster_delivery_send_a22;
CREATE FUNCTION public.begin_booster_delivery_send(p_delivery_id UUID,p_fence UUID,p_actor_user_id UUID DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE v_business UUID; v_owner UUID; d public.booster_followup_deliveries%ROWTYPE;
        v public.followup_visits%ROWTYPE; v_result JSONB;
BEGIN
  SELECT delivery_row.business_id INTO v_business
    FROM public.booster_followup_deliveries delivery_row WHERE delivery_row.id=p_delivery_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('kind','stale'); END IF;
  SELECT b.owner_user_id INTO v_owner FROM public.businesses b WHERE b.id=v_business FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('kind','stale'); END IF;
  SELECT delivery_row.* INTO d FROM public.booster_followup_deliveries delivery_row WHERE delivery_row.id=p_delivery_id;
  PERFORM 1 FROM public.users u WHERE u.id IN (v_owner,p_actor_user_id,d.actor_user_id) ORDER BY u.id FOR UPDATE;
  IF NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id=v_owner AND u.privacy_deletion_requested_at IS NULL)
     OR (p_actor_user_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.users u WHERE u.id=p_actor_user_id AND u.privacy_deletion_requested_at IS NULL
     )) OR (d.actor_user_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.users u WHERE u.id=d.actor_user_id AND u.privacy_deletion_requested_at IS NULL
     )) THEN RETURN jsonb_build_object('kind','actor_denied'); END IF;
  SELECT * INTO d FROM public.booster_followup_deliveries WHERE id=p_delivery_id FOR UPDATE;
  IF NOT FOUND OR d.lease_token IS DISTINCT FROM p_fence OR d.lease_until IS NULL OR d.lease_until<=now() THEN
    RETURN jsonb_build_object('kind','stale');
  END IF;
  IF d.state NOT IN ('prepared','unknown') THEN RETURN jsonb_build_object('kind','stale'); END IF;
  SELECT * INTO v FROM public.followup_visits WHERE id=d.visit_id AND business_id=d.business_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('kind','stale'); END IF;
  IF NOT public.booster_visit_has_review_permission(v.id) THEN
    IF d.first_attempt_at IS NOT NULL THEN
      UPDATE public.booster_followup_deliveries SET state='reconciliation_required',updated_at=now() WHERE id=d.id;
      RETURN jsonb_build_object('kind','reconciliation_required');
    END IF;
    UPDATE public.booster_followup_deliveries SET state='non_sendable',updated_at=now() WHERE id=d.id;
    UPDATE public.followup_visits SET followup_status='skipped',updated_at=now() WHERE id=v.id AND followup_sent_at IS NULL;
    RETURN jsonb_build_object('kind','non_sendable');
  END IF;
  v_result := public.begin_booster_delivery_send_a22(p_delivery_id,p_fence,p_actor_user_id);
  RETURN v_result;
END $$;
