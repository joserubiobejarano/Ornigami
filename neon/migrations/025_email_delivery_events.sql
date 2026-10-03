-- A10: provider delivery events, verified event idempotency and global suppression.
-- 025 runs after 022 and before the A11 lifecycle wrappers in 036. Keep the
-- admission check in this base function so 036 carries it forward as *_a06.

ALTER TABLE public.booster_followup_deliveries
  ADD COLUMN IF NOT EXISTS delivery_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (delivery_status IN ('pending','sent','delayed','delivered','failed','suppressed','bounced','complained')),
  ADD COLUMN IF NOT EXISTS delivery_status_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS delivery_status_event_id TEXT,
  ADD COLUMN IF NOT EXISTS recipient_sha256 TEXT;

-- Keep minimal correlation evidence after privacy cleanup clears the frozen
-- payload or removes the delivery row, so a late authenticated bounce can still
-- suppress its verified recipient. This table intentionally has no delivery FK.
CREATE TABLE IF NOT EXISTS public.booster_delivery_provider_correlations (
  provider_message_id TEXT PRIMARY KEY,
  delivery_id UUID NOT NULL,
  recipient_sha256 TEXT NOT NULL CHECK (recipient_sha256 ~ '^[0-9a-f]{64}$'),
  linked_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

UPDATE public.booster_followup_deliveries
SET recipient_sha256=encode(sha256(convert_to(lower(trim(
  CASE WHEN jsonb_typeof(provider_payload->'to')='array' THEN provider_payload->'to'->>0 ELSE provider_payload->>'to' END
)),'UTF8')),'hex')
WHERE recipient_sha256 IS NULL AND provider_payload IS NOT NULL;

INSERT INTO public.booster_delivery_provider_correlations(provider_message_id,delivery_id,recipient_sha256)
SELECT provider_message_id,id,recipient_sha256 FROM public.booster_followup_deliveries
WHERE provider_message_id IS NOT NULL AND recipient_sha256 IS NOT NULL
ON CONFLICT (provider_message_id) DO NOTHING;

CREATE UNIQUE INDEX IF NOT EXISTS idx_booster_delivery_provider_message_id
  ON public.booster_followup_deliveries(provider_message_id)
  WHERE provider_message_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.booster_delivery_events (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL CHECK (event_type IN ('email.sent','email.delivered','email.delivery_delayed','email.bounced','email.complained','email.failed','email.suppressed')),
  event_created_at TIMESTAMPTZ NOT NULL,
  provider_message_id TEXT NOT NULL,
  delivery_id UUID,
  recipients JSONB NOT NULL CHECK (jsonb_typeof(recipients)='array'),
  evidence_source TEXT NOT NULL CHECK (evidence_source IN ('webhook','provider_lookup')),
  event_data JSONB NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_booster_delivery_events_delivery
  ON public.booster_delivery_events(delivery_id,event_created_at DESC);
CREATE INDEX IF NOT EXISTS idx_booster_delivery_events_provider_message
  ON public.booster_delivery_events(provider_message_id,event_created_at DESC);

CREATE OR REPLACE FUNCTION public.capture_booster_delivery_correlation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE v_to JSONB; v_email TEXT; v_hash TEXT;
BEGIN
  IF TG_OP <> 'DELETE' AND NEW.provider_payload IS NOT NULL THEN
    v_to := CASE WHEN jsonb_typeof(NEW.provider_payload->'to')='array'
      THEN NEW.provider_payload->'to' ELSE jsonb_build_array(NEW.provider_payload->>'to') END;
    IF jsonb_array_length(v_to)=1 THEN
      v_email := lower(trim(v_to->>0));
      v_hash := encode(sha256(convert_to(v_email,'UTF8')),'hex');
      IF NEW.recipient_sha256 IS NOT NULL AND NEW.recipient_sha256<>v_hash THEN
        RAISE EXCEPTION 'booster delivery recipient is immutable';
      END IF;
      NEW.recipient_sha256 := v_hash;
    END IF;
  END IF;
  IF TG_OP='UPDATE' AND OLD.recipient_sha256 IS NOT NULL AND NEW.recipient_sha256 IS DISTINCT FROM OLD.recipient_sha256 THEN
    RAISE EXCEPTION 'booster delivery recipient fingerprint is immutable';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_capture_booster_delivery_correlation ON public.booster_followup_deliveries;
CREATE TRIGGER trg_capture_booster_delivery_correlation
BEFORE INSERT OR UPDATE OF provider_payload,recipient_sha256 ON public.booster_followup_deliveries
FOR EACH ROW EXECUTE FUNCTION public.capture_booster_delivery_correlation();

CREATE OR REPLACE FUNCTION public.link_booster_delivery_provider_id()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.provider_message_id IS NOT NULL AND NEW.recipient_sha256 IS NOT NULL THEN
    INSERT INTO public.booster_delivery_provider_correlations(provider_message_id,delivery_id,recipient_sha256)
    VALUES(NEW.provider_message_id,NEW.id,NEW.recipient_sha256)
    ON CONFLICT (provider_message_id) DO UPDATE SET
      delivery_id=CASE WHEN public.booster_delivery_provider_correlations.delivery_id=EXCLUDED.delivery_id
        AND public.booster_delivery_provider_correlations.recipient_sha256=EXCLUDED.recipient_sha256
        THEN EXCLUDED.delivery_id ELSE public.booster_delivery_provider_correlations.delivery_id END;
    IF NOT EXISTS (SELECT 1 FROM public.booster_delivery_provider_correlations c
      WHERE c.provider_message_id=NEW.provider_message_id AND c.delivery_id=NEW.id
        AND c.recipient_sha256=NEW.recipient_sha256) THEN
      RAISE EXCEPTION 'provider message id is already correlated to another booster delivery';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_link_booster_delivery_provider_id ON public.booster_followup_deliveries;
CREATE TRIGGER trg_link_booster_delivery_provider_id
AFTER INSERT OR UPDATE OF provider_message_id,recipient_sha256 ON public.booster_followup_deliveries
FOR EACH ROW EXECUTE FUNCTION public.link_booster_delivery_provider_id();

-- Suppression is global by normalized address. Unlike unsubscribe state, it is
-- provider evidence and has no business scope or automatic expiry.
CREATE TABLE IF NOT EXISTS public.booster_delivery_suppressions (
  email_normalized TEXT PRIMARY KEY CHECK (email_normalized=lower(trim(email_normalized))),
  reason TEXT NOT NULL CHECK (reason IN ('bounce','complaint','provider_suppressed')),
  provider_message_id TEXT NOT NULL,
  -- Retain suppression if privacy cleanup removes delivery/event evidence.
  event_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The event function resolves once to discover the business, then takes locks in
-- the same order as A11's admission wrapper: business, agent, delivery, visit.
CREATE OR REPLACE FUNCTION public.apply_booster_delivery_event(p_event JSONB)
RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE
  v_event_id TEXT := nullif(trim(p_event->>'eventId'),'');
  v_event_type TEXT := p_event->>'type';
  v_created_at TIMESTAMPTZ;
  v_provider_id TEXT := nullif(trim(p_event->>'providerMessageId'),'');
  v_delivery_id UUID;
  v_source TEXT := p_event->>'evidenceSource';
  v_recipients JSONB := p_event->'recipients';
  v_event_data JSONB;
  d public.booster_followup_deliveries%ROWTYPE;
  b public.businesses%ROWTYPE;
  ba public.business_agents%ROWTYPE;
  v public.followup_visits%ROWTYPE;
  prior public.booster_delivery_events%ROWTYPE;
  v_payload_to JSONB;
  v_payload_recipient TEXT;
  v_payload_tag TEXT;
  v_recipient TEXT;
  v_recipient_hash TEXT;
  v_changed INTEGER;
  v_new_status TEXT;
  v_new_rank INTEGER;
  v_old_rank INTEGER;
  v_status_wins BOOLEAN;
  v_suppression_reason TEXT;
  v_owner_id UUID;
  v_actor_id UUID;
  v_lifecycle_frozen BOOLEAN := FALSE;
  v_correlation public.booster_delivery_provider_correlations%ROWTYPE;
BEGIN
  IF jsonb_typeof(p_event) <> 'object'
     OR v_event_id IS NULL OR length(v_event_id)>255
     OR v_event_type IS NULL
     OR v_event_type NOT IN ('email.sent','email.delivered','email.delivery_delayed','email.bounced','email.complained','email.failed','email.suppressed')
     OR v_provider_id IS NULL OR length(v_provider_id)>500
     OR v_source IS NULL OR v_source NOT IN ('webhook','provider_lookup')
     OR jsonb_typeof(v_recipients) <> 'array' OR jsonb_array_length(v_recipients) <> 1
     OR nullif(trim(v_recipients->>0),'') IS NULL
     OR (p_event->>'deliveryId' IS NOT NULL AND nullif(trim(p_event->>'deliveryId'),'') IS NULL) THEN
    RETURN jsonb_build_object('kind','invalid');
  END IF;
  BEGIN
    v_created_at := (p_event->>'createdAt')::timestamptz;
    IF p_event->>'deliveryId' IS NOT NULL THEN v_delivery_id := (p_event->>'deliveryId')::uuid; END IF;
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('kind','invalid');
  END;
  IF v_created_at IS NULL THEN RETURN jsonb_build_object('kind','invalid'); END IF;

  IF v_delivery_id IS NOT NULL THEN
    SELECT * INTO d FROM public.booster_followup_deliveries WHERE id=v_delivery_id;
  ELSE
    SELECT * INTO d FROM public.booster_followup_deliveries WHERE provider_message_id=v_provider_id;
  END IF;
  IF NOT FOUND THEN
    IF v_source='provider_lookup' THEN RETURN jsonb_build_object('kind','conflict'); END IF;
    SELECT * INTO v_correlation FROM public.booster_delivery_provider_correlations WHERE provider_message_id=v_provider_id;
    IF NOT FOUND THEN RETURN jsonb_build_object('kind','unmatched'); END IF;
    v_recipient := lower(trim(v_recipients->>0));
    IF encode(sha256(convert_to(v_recipient,'UTF8')),'hex')<>v_correlation.recipient_sha256
       OR (p_event->>'deliveryId' IS NOT NULL AND (p_event->>'deliveryId')::uuid<>v_correlation.delivery_id) THEN
      RETURN jsonb_build_object('kind','conflict','deliveryId',v_correlation.delivery_id);
    END IF;
    v_recipient_hash := 'sha256:'||v_correlation.recipient_sha256;
    PERFORM pg_advisory_xact_lock(hashtextextended(v_recipient,0));
    v_event_data := jsonb_build_object('eventId',v_event_id,'type',v_event_type,'createdAt',v_created_at,
      'providerMessageId',v_provider_id,'deliveryId',v_correlation.delivery_id::text,
      'recipients',jsonb_build_array(v_recipient_hash),'evidenceSource',v_source);
    SELECT * INTO prior FROM public.booster_delivery_events WHERE event_id=v_event_id;
    IF FOUND THEN
      IF prior.event_data=v_event_data THEN RETURN jsonb_build_object('kind','duplicate','deliveryId',v_correlation.delivery_id,'state','deleted'); END IF;
      RETURN jsonb_build_object('kind','conflict','deliveryId',v_correlation.delivery_id);
    END IF;
    INSERT INTO public.booster_delivery_events(event_id,event_type,event_created_at,provider_message_id,delivery_id,recipients,evidence_source,event_data)
      VALUES(v_event_id,v_event_type,v_created_at,v_provider_id,v_correlation.delivery_id,jsonb_build_array(v_recipient_hash),v_source,v_event_data)
      ON CONFLICT (event_id) DO NOTHING;
    GET DIAGNOSTICS v_changed=ROW_COUNT;
    IF v_changed=0 THEN
      SELECT * INTO prior FROM public.booster_delivery_events WHERE event_id=v_event_id;
      IF prior.event_data=v_event_data THEN
        RETURN jsonb_build_object('kind','duplicate','deliveryId',v_correlation.delivery_id,'state','deleted');
      END IF;
      RETURN jsonb_build_object('kind','conflict','deliveryId',v_correlation.delivery_id);
    END IF;
    IF v_event_type IN ('email.bounced','email.complained','email.suppressed') THEN
      v_suppression_reason := CASE v_event_type WHEN 'email.complained' THEN 'complaint'
        WHEN 'email.bounced' THEN 'bounce' ELSE 'provider_suppressed' END;
      INSERT INTO public.booster_delivery_suppressions(email_normalized,reason,provider_message_id,event_id)
        VALUES(v_recipient,v_suppression_reason,v_provider_id,v_event_id)
        ON CONFLICT (email_normalized) DO UPDATE SET
          reason=CASE WHEN (CASE EXCLUDED.reason WHEN 'complaint' THEN 3 WHEN 'bounce' THEN 2 ELSE 1 END)
            > (CASE public.booster_delivery_suppressions.reason WHEN 'complaint' THEN 3 WHEN 'bounce' THEN 2 ELSE 1 END)
            THEN EXCLUDED.reason ELSE public.booster_delivery_suppressions.reason END,
          provider_message_id=CASE WHEN (CASE EXCLUDED.reason WHEN 'complaint' THEN 3 WHEN 'bounce' THEN 2 ELSE 1 END)
            > (CASE public.booster_delivery_suppressions.reason WHEN 'complaint' THEN 3 WHEN 'bounce' THEN 2 ELSE 1 END)
            THEN EXCLUDED.provider_message_id ELSE public.booster_delivery_suppressions.provider_message_id END,
          event_id=CASE WHEN (CASE EXCLUDED.reason WHEN 'complaint' THEN 3 WHEN 'bounce' THEN 2 ELSE 1 END)
            > (CASE public.booster_delivery_suppressions.reason WHEN 'complaint' THEN 3 WHEN 'bounce' THEN 2 ELSE 1 END)
            THEN EXCLUDED.event_id ELSE public.booster_delivery_suppressions.event_id END;
    END IF;
    RETURN jsonb_build_object('kind','applied','deliveryId',v_correlation.delivery_id,'state','deleted',
      'deliveryStatus',CASE v_event_type WHEN 'email.delivery_delayed' THEN 'delayed' ELSE replace(v_event_type,'email.','') END,
      'providerMessageId',v_provider_id,'deliveryStatusAt',v_created_at);
  END IF;
  IF d.business_id IS NULL THEN RETURN jsonb_build_object('kind','unmatched'); END IF;

  SELECT * INTO b FROM public.businesses WHERE id=d.business_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('kind','unmatched'); END IF;
  v_owner_id := b.owner_user_id;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public'
      AND table_name='booster_followup_deliveries' AND column_name='actor_user_id') THEN
    EXECUTE 'SELECT actor_user_id FROM public.booster_followup_deliveries WHERE id=$1' INTO v_actor_id USING d.id;
  END IF;
  PERFORM 1 FROM public.users u WHERE u.id IN (v_owner_id,v_actor_id) ORDER BY u.id FOR UPDATE;
  SELECT EXISTS (SELECT 1 FROM public.users u WHERE u.id IN (v_owner_id,v_actor_id)
    AND u.privacy_deletion_requested_at IS NOT NULL) INTO v_lifecycle_frozen;
  SELECT * INTO ba FROM public.business_agents WHERE business_id=d.business_id AND agent_id='review_booster' FOR UPDATE;
  SELECT * INTO d FROM public.booster_followup_deliveries WHERE id=d.id FOR UPDATE;
  SELECT * INTO v FROM public.followup_visits WHERE id=d.visit_id AND business_id=d.business_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('kind','conflict','deliveryId',d.id); END IF;

  IF (p_event->>'deliveryId' IS NOT NULL AND d.id<>v_delivery_id)
     OR (d.provider_message_id IS NOT NULL AND d.provider_message_id<>v_provider_id)
     OR EXISTS (SELECT 1 FROM public.booster_followup_deliveries other
                WHERE other.provider_message_id=v_provider_id AND other.id<>d.id) THEN
    RETURN jsonb_build_object('kind','conflict','deliveryId',d.id,'state',d.state,'deliveryStatus',d.delivery_status);
  END IF;
  IF v_source='provider_lookup' AND (d.state NOT IN ('unknown','reconciliation_required') OR d.lease_until>now()) THEN
    RETURN jsonb_build_object('kind','conflict','deliveryId',d.id,'state',d.state,'deliveryStatus',d.delivery_status);
  END IF;

  v_recipient := lower(trim(v_recipients->>0));
  v_recipient_hash := 'sha256:'||encode(sha256(convert_to(v_recipient,'UTF8')),'hex');
  IF d.provider_payload IS NOT NULL THEN
    v_payload_to := CASE WHEN jsonb_typeof(d.provider_payload->'to')='array'
      THEN d.provider_payload->'to' ELSE jsonb_build_array(d.provider_payload->>'to') END;
    IF jsonb_typeof(d.provider_payload) <> 'object' OR jsonb_typeof(v_payload_to)<>'array'
       OR jsonb_array_length(v_payload_to)<>1 THEN
      RETURN jsonb_build_object('kind','conflict','deliveryId',d.id,'state',d.state,'deliveryStatus',d.delivery_status);
    END IF;
    v_payload_recipient := lower(trim(v_payload_to->>0));
    SELECT tag->>'value' INTO v_payload_tag
      FROM jsonb_array_elements(CASE WHEN jsonb_typeof(d.provider_payload->'tags')='array' THEN d.provider_payload->'tags' ELSE '[]'::jsonb END) tag
      WHERE tag->>'name'='ornigami_delivery_id' LIMIT 1;
    IF v_payload_recipient IS NULL OR v_recipient<>v_payload_recipient OR v_payload_tag IS DISTINCT FROM d.id::text THEN
      RETURN jsonb_build_object('kind','conflict','deliveryId',d.id,'state',d.state,'deliveryStatus',d.delivery_status);
    END IF;
  ELSIF d.recipient_sha256 IS NULL OR encode(sha256(convert_to(v_recipient,'UTF8')),'hex')<>d.recipient_sha256
     OR NOT EXISTS (SELECT 1 FROM public.booster_delivery_provider_correlations c
       WHERE c.provider_message_id=v_provider_id AND c.delivery_id=d.id AND c.recipient_sha256=d.recipient_sha256) THEN
    RETURN jsonb_build_object('kind','conflict','deliveryId',d.id,'state',d.state,'deliveryStatus',d.delivery_status);
  END IF;
  -- Serialize global suppression with send admission across all workspaces.
  PERFORM pg_advisory_xact_lock(hashtextextended(v_recipient,0));
  IF d.first_attempt_at IS NULL OR d.state IN ('claimed','prepared','deferred_quota','expired','non_sendable') THEN
    RETURN jsonb_build_object('kind','conflict','deliveryId',d.id,'state',d.state,'deliveryStatus',d.delivery_status);
  END IF;

  v_event_data := jsonb_build_object(
    'eventId',v_event_id,'type',v_event_type,'createdAt',v_created_at,
    'providerMessageId',v_provider_id,'deliveryId',d.id::text,
    'recipients',jsonb_build_array(v_recipient_hash),'evidenceSource',v_source
  );
  SELECT * INTO prior FROM public.booster_delivery_events WHERE event_id=v_event_id;
  IF FOUND THEN
    IF prior.event_data=v_event_data THEN
      RETURN jsonb_build_object('kind','duplicate','deliveryId',d.id,'state',d.state,
        'deliveryStatus',d.delivery_status,'providerMessageId',d.provider_message_id,'deliveryStatusAt',d.delivery_status_at);
    END IF;
    RETURN jsonb_build_object('kind','conflict','deliveryId',d.id,'state',d.state,'deliveryStatus',d.delivery_status);
  END IF;

  INSERT INTO public.booster_delivery_events(event_id,event_type,event_created_at,provider_message_id,delivery_id,recipients,evidence_source,event_data)
    VALUES(v_event_id,v_event_type,v_created_at,v_provider_id,d.id,jsonb_build_array(v_recipient_hash),v_source,v_event_data)
    ON CONFLICT (event_id) DO NOTHING;
  GET DIAGNOSTICS v_changed=ROW_COUNT;
  IF v_changed=0 THEN
    SELECT * INTO prior FROM public.booster_delivery_events WHERE event_id=v_event_id;
    IF prior.event_data=v_event_data THEN
      RETURN jsonb_build_object('kind','duplicate','deliveryId',d.id,'state',d.state,
        'deliveryStatus',d.delivery_status,'providerMessageId',d.provider_message_id,'deliveryStatusAt',d.delivery_status_at);
    END IF;
    RETURN jsonb_build_object('kind','conflict','deliveryId',d.id,'state',d.state,'deliveryStatus',d.delivery_status);
  END IF;

  IF v_event_type IN ('email.bounced','email.complained','email.suppressed') THEN
    v_suppression_reason := CASE v_event_type WHEN 'email.complained' THEN 'complaint'
      WHEN 'email.bounced' THEN 'bounce' ELSE 'provider_suppressed' END;
    INSERT INTO public.booster_delivery_suppressions(email_normalized,reason,provider_message_id,event_id)
    VALUES(v_recipient,v_suppression_reason,v_provider_id,v_event_id)
    ON CONFLICT (email_normalized) DO UPDATE SET
      reason=CASE WHEN (CASE EXCLUDED.reason WHEN 'complaint' THEN 3 WHEN 'bounce' THEN 2 ELSE 1 END)
        > (CASE public.booster_delivery_suppressions.reason WHEN 'complaint' THEN 3 WHEN 'bounce' THEN 2 ELSE 1 END)
        THEN EXCLUDED.reason ELSE public.booster_delivery_suppressions.reason END,
      provider_message_id=CASE WHEN (CASE EXCLUDED.reason WHEN 'complaint' THEN 3 WHEN 'bounce' THEN 2 ELSE 1 END)
        > (CASE public.booster_delivery_suppressions.reason WHEN 'complaint' THEN 3 WHEN 'bounce' THEN 2 ELSE 1 END)
        THEN EXCLUDED.provider_message_id ELSE public.booster_delivery_suppressions.provider_message_id END,
      event_id=CASE WHEN (CASE EXCLUDED.reason WHEN 'complaint' THEN 3 WHEN 'bounce' THEN 2 ELSE 1 END)
        > (CASE public.booster_delivery_suppressions.reason WHEN 'complaint' THEN 3 WHEN 'bounce' THEN 2 ELSE 1 END)
        THEN EXCLUDED.event_id ELSE public.booster_delivery_suppressions.event_id END;
  END IF;

  v_new_status := CASE v_event_type WHEN 'email.sent' THEN 'sent' WHEN 'email.delivery_delayed' THEN 'delayed'
    WHEN 'email.delivered' THEN 'delivered' WHEN 'email.failed' THEN 'failed'
    WHEN 'email.suppressed' THEN 'suppressed' WHEN 'email.bounced' THEN 'bounced' ELSE 'complained' END;
  v_new_rank := CASE v_new_status WHEN 'sent' THEN 1 WHEN 'delayed' THEN 2 WHEN 'delivered' THEN 3
    WHEN 'failed' THEN 4 WHEN 'suppressed' THEN 5 WHEN 'bounced' THEN 6 ELSE 7 END;
  v_old_rank := CASE d.delivery_status WHEN 'sent' THEN 1 WHEN 'delayed' THEN 2 WHEN 'delivered' THEN 3
    WHEN 'failed' THEN 4 WHEN 'suppressed' THEN 5 WHEN 'bounced' THEN 6 WHEN 'complained' THEN 7 ELSE 0 END;
  v_status_wins := v_new_rank>v_old_rank OR (v_new_rank=v_old_rank AND (d.delivery_status_at IS NULL OR v_created_at>d.delivery_status_at));

  -- Any signed provider outcome proves provider acceptance. Preserve the A06
  -- quota reservation even for bounce, complaint, or provider-side failure.
  UPDATE public.booster_followup_deliveries SET state='accepted',
    provider_message_id=COALESCE(provider_message_id,v_provider_id),
    reservation_month=COALESCE(reservation_month,date_trunc('month',COALESCE(first_attempt_at,v_created_at) AT TIME ZONE 'UTC')::date),
    accepted_at=COALESCE(accepted_at,first_attempt_at,v_created_at),
    delivery_status=CASE WHEN v_status_wins THEN v_new_status ELSE delivery_status END,
    delivery_status_at=CASE WHEN v_status_wins THEN v_created_at ELSE delivery_status_at END,
    delivery_status_event_id=CASE WHEN v_status_wins THEN v_event_id ELSE delivery_status_event_id END,
    provider_payload=CASE WHEN v_lifecycle_frozen THEN NULL ELSE provider_payload END,
    review_url_snapshot=CASE WHEN v_lifecycle_frozen THEN NULL ELSE review_url_snapshot END,
    error_message=NULL,updated_at=now()
  WHERE id=d.id;
  IF NOT v_lifecycle_frozen
     AND NOT EXISTS (SELECT 1 FROM public.followup_messages fm WHERE fm.visit_id=d.visit_id
       AND fm.business_id=d.business_id AND lower(fm.status)='sent') THEN
    INSERT INTO public.followup_messages(visit_id,business_id,channel,subject,body,provider,provider_message_id,status,sent_at)
    VALUES(d.visit_id,d.business_id,'email',COALESCE(d.provider_payload->>'subject',''),
      COALESCE(d.provider_payload->>'text',d.provider_payload->>'html',''),'resend',v_provider_id,'sent',
      COALESCE(d.first_attempt_at,v_created_at));
  END IF;
  UPDATE public.followup_visits SET followup_status='sent',followup_sent_at=COALESCE(followup_sent_at,d.first_attempt_at,v_created_at),
    next_attempt_at=NULL,last_error=NULL,updated_at=now()
  WHERE id=v.id AND followup_sent_at IS NULL;

  SELECT * INTO d FROM public.booster_followup_deliveries WHERE id=d.id;
  RETURN jsonb_build_object('kind','applied','deliveryId',d.id,'state',d.state,
    'deliveryStatus',d.delivery_status,'providerMessageId',d.provider_message_id,'deliveryStatusAt',d.delivery_status_at);
END $$;

-- Update the A06 base admission path. Migration 036 wraps this function and
-- renames it to *_a06; this guard therefore survives that later replacement.
DO $begin_migration$
DECLARE v_function_name TEXT;
BEGIN
  v_function_name := CASE
    WHEN to_regprocedure('public.begin_booster_delivery_send_a06(uuid,uuid,uuid)') IS NOT NULL
      THEN 'begin_booster_delivery_send_a06'
    ELSE 'begin_booster_delivery_send' END;
  EXECUTE replace($begin_body$
CREATE OR REPLACE FUNCTION public.begin_booster_delivery_send(p_delivery_id UUID,p_fence UUID,p_actor_user_id UUID DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE d public.booster_followup_deliveries%ROWTYPE; v public.followup_visits%ROWTYPE;
        b public.businesses%ROWTYPE; ba public.business_agents%ROWTYPE; q RECORD; v_recipient TEXT;
BEGIN
  SELECT * INTO d FROM public.booster_followup_deliveries WHERE id=p_delivery_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('kind','stale'); END IF;
  SELECT * INTO b FROM public.businesses WHERE id=d.business_id FOR UPDATE;
  SELECT * INTO ba FROM public.business_agents WHERE business_id=d.business_id AND agent_id='review_booster' FOR UPDATE;
  SELECT * INTO d FROM public.booster_followup_deliveries WHERE id=p_delivery_id FOR UPDATE;
  IF d.lease_token<>p_fence OR d.lease_until<=now() OR d.state NOT IN ('prepared','unknown') THEN RETURN jsonb_build_object('kind','stale'); END IF;
  SELECT * INTO v FROM public.followup_visits WHERE id=d.visit_id FOR UPDATE;
  IF v.id IS NULL THEN RETURN jsonb_build_object('kind','stale'); END IF;
  IF p_actor_user_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.business_members bm WHERE bm.business_id=d.business_id AND bm.user_id=p_actor_user_id
  ) THEN RETURN jsonb_build_object('kind','actor_denied'); END IF;
  IF d.first_attempt_at IS NOT NULL AND d.first_attempt_at<=now()-interval '23 hours' THEN
    UPDATE public.booster_followup_deliveries SET state='reconciliation_required',updated_at=now() WHERE id=d.id;
    RETURN jsonb_build_object('kind','reconciliation_required');
  END IF;
  IF ba.id IS NULL OR coalesce(ba.status,'') NOT IN ('active','trialing') OR coalesce(ba.plan_id,'') NOT IN ('booster','complete')
     OR v.followup_sent_at IS NOT NULL OR v.visited_at>now()-interval '23 hours' OR v.visited_at<now()-interval '7 days'
     OR v.customer_email IS NULL OR length(trim(v.customer_email))=0 OR b.google_review_url IS NULL OR length(trim(b.google_review_url))=0
     OR NOT EXISTS (
       SELECT 1 FROM jsonb_array_elements_text(
         CASE WHEN jsonb_typeof(d.provider_payload->'to')='array' THEN d.provider_payload->'to'
              ELSE jsonb_build_array(d.provider_payload->>'to') END
       ) AS recipient(email) WHERE lower(trim(recipient.email))=lower(trim(v.customer_email))
     )
     OR d.review_url_snapshot IS DISTINCT FROM b.google_review_url
     OR EXISTS (SELECT 1 FROM public.followup_unsubscribes u WHERE u.business_id=d.business_id AND u.customer_email_normalized=lower(trim(v.customer_email))) THEN
    UPDATE public.booster_followup_deliveries SET state=CASE WHEN d.first_attempt_at IS NULL THEN 'non_sendable' ELSE 'reconciliation_required' END,updated_at=now()
      WHERE id=d.id;
    IF d.first_attempt_at IS NULL THEN
      UPDATE public.followup_visits SET followup_status='skipped',updated_at=now() WHERE id=v.id AND followup_sent_at IS NULL;
    END IF;
    RETURN jsonb_build_object('kind',CASE WHEN d.first_attempt_at IS NULL THEN 'non_sendable' ELSE 'reconciliation_required' END);
  END IF;
  -- Serialize this admission against bounce/complaint insertion for the same
  -- normalized address in any business.
  v_recipient := lower(trim(CASE WHEN jsonb_typeof(d.provider_payload->'to')='array'
    THEN d.provider_payload->'to'->>0 ELSE d.provider_payload->>'to' END));
  PERFORM pg_advisory_xact_lock(hashtextextended(v_recipient,0));
  IF EXISTS (SELECT 1 FROM public.booster_delivery_suppressions s
    WHERE s.email_normalized IN (lower(trim(v.customer_email)),
      lower(trim(CASE WHEN jsonb_typeof(d.provider_payload->'to')='array' THEN d.provider_payload->'to'->>0 ELSE d.provider_payload->>'to' END)))) THEN
    IF d.first_attempt_at IS NULL THEN
      UPDATE public.booster_followup_deliveries SET state='non_sendable',updated_at=now() WHERE id=d.id;
      UPDATE public.followup_visits SET followup_status='skipped',last_error='Recipient suppressed by provider delivery feedback.',updated_at=now()
        WHERE id=v.id AND followup_sent_at IS NULL;
      RETURN jsonb_build_object('kind','non_sendable');
    END IF;
    UPDATE public.booster_followup_deliveries SET state='reconciliation_required',updated_at=now() WHERE id=d.id;
    RETURN jsonb_build_object('kind','reconciliation_required');
  END IF;
  IF d.provider_payload IS NULL THEN RETURN jsonb_build_object('kind','payload_missing'); END IF;
  IF d.first_attempt_at IS NULL THEN
    IF d.reservation_month IS DISTINCT FROM date_trunc('month',now() AT TIME ZONE 'UTC')::date THEN
      SELECT * INTO q FROM public.booster_monthly_quota(d.business_id,date_trunc('month',now() AT TIME ZONE 'UTC')::date);
      IF q.usage>=q.allowance THEN
        UPDATE public.booster_followup_deliveries SET state='deferred_quota',reservation_month=NULL,updated_at=now() WHERE id=d.id;
        UPDATE public.followup_visits SET followup_status='deferred_quota',updated_at=now() WHERE id=v.id;
        RETURN jsonb_build_object('kind','quota_exhausted');
      END IF;
      UPDATE public.booster_followup_deliveries SET reservation_month=date_trunc('month',now() AT TIME ZONE 'UTC')::date WHERE id=d.id;
      d.reservation_month := date_trunc('month',now() AT TIME ZONE 'UTC')::date;
    END IF;
    SELECT * INTO q FROM public.booster_monthly_quota(d.business_id,d.reservation_month);
    IF q.allowance=0 THEN RETURN jsonb_build_object('kind','non_sendable'); END IF;
    IF q.usage>q.allowance THEN
      UPDATE public.booster_followup_deliveries SET state='deferred_quota',reservation_month=NULL,updated_at=now() WHERE id=d.id;
      UPDATE public.followup_visits SET followup_status='deferred_quota',updated_at=now() WHERE id=v.id;
      RETURN jsonb_build_object('kind','quota_exhausted');
    END IF;
    UPDATE public.booster_followup_deliveries SET first_attempt_at=now(),send_attempt_count=send_attempt_count+1,state='sending',updated_at=now() WHERE id=d.id RETURNING * INTO d;
  ELSE
    UPDATE public.booster_followup_deliveries SET send_attempt_count=send_attempt_count+1,state='sending',updated_at=now() WHERE id=d.id RETURNING * INTO d;
  END IF;
  RETURN jsonb_build_object('kind','send','payload',d.provider_payload,'idempotencyKey',d.idempotency_key,
    'firstAttemptAt',d.first_attempt_at);
END $$;
 $begin_body$,'public.begin_booster_delivery_send(','public.'||v_function_name||'(');
END
$begin_migration$;
