-- Provenance: original 025 callback body at baseline e21249e, before A22 retention guards.
-- Used only to test migration 041 upgrading the markerless callback implementation.

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
