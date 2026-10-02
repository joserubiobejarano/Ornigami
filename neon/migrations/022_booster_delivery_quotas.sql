-- A06: durable, fenced delivery attempts and UTC calendar-month quota reservations.
-- Keep the legacy baseline separate so sent visits are never counted twice after
-- the delivery table starts recording accepted sends.
CREATE TABLE IF NOT EXISTS public.booster_quota_legacy_usage (
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  month_start DATE NOT NULL,
  accepted_count INTEGER NOT NULL CHECK (accepted_count >= 0),
  PRIMARY KEY (business_id, month_start)
);

CREATE TABLE IF NOT EXISTS public.booster_followup_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  visit_id UUID NOT NULL REFERENCES public.followup_visits(id) ON DELETE CASCADE,
  state TEXT NOT NULL CHECK (state IN (
    'claimed','prepared','sending','unknown','accepted','rejected',
    'deferred_quota','expired','non_sendable','reconciliation_required'
  )),
  provider_payload JSONB,
  review_url_snapshot TEXT,
  idempotency_key TEXT NOT NULL UNIQUE,
  lease_token UUID NOT NULL DEFAULT gen_random_uuid(),
  lease_until TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '5 minutes'),
  first_attempt_at TIMESTAMPTZ,
  send_attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (send_attempt_count >= 0),
  reservation_month DATE,
  provider_message_id TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  accepted_at TIMESTAMPTZ,
  UNIQUE (business_id, visit_id)
);

-- Exclude A06 rows on reapplication: A06 message/visit mirrors are accounted
-- through their durable delivery reservation, not the frozen legacy baseline.
INSERT INTO public.booster_quota_legacy_usage (business_id, month_start, accepted_count)
SELECT business_id, date_trunc('month', sent_at AT TIME ZONE 'UTC')::date, count(*)::integer
FROM (
  SELECT v.id, v.business_id, min(COALESCE(fm.sent_at,v.followup_sent_at,fm.created_at)) AS sent_at
  FROM public.followup_messages fm JOIN public.followup_visits v ON v.id=fm.visit_id
  WHERE lower(fm.status)='sent'
    AND NOT EXISTS (SELECT 1 FROM public.booster_followup_deliveries d WHERE d.visit_id=v.id)
  GROUP BY v.id,v.business_id
  UNION ALL
  SELECT v.id,v.business_id,v.followup_sent_at AS sent_at
  FROM public.followup_visits v
  WHERE lower(v.followup_status)='sent' AND v.followup_sent_at IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.followup_messages fm WHERE fm.visit_id=v.id AND lower(fm.status)='sent')
    AND NOT EXISTS (SELECT 1 FROM public.booster_followup_deliveries d WHERE d.visit_id=v.id)
) legacy
GROUP BY business_id, date_trunc('month', sent_at AT TIME ZONE 'UTC')::date
ON CONFLICT (business_id, month_start) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_booster_delivery_claimable
  ON public.booster_followup_deliveries (business_id, state, lease_until, created_at);
CREATE INDEX IF NOT EXISTS idx_booster_delivery_quota
  ON public.booster_followup_deliveries (business_id, reservation_month, state);

CREATE OR REPLACE FUNCTION public.booster_monthly_quota(p_business_id UUID, p_month DATE DEFAULT date_trunc('month', now() AT TIME ZONE 'UTC')::date)
RETURNS TABLE(usage INTEGER, allowance INTEGER) LANGUAGE sql STABLE AS $$
  SELECT
    COALESCE((SELECT accepted_count FROM public.booster_quota_legacy_usage WHERE business_id=p_business_id AND month_start=p_month),0)
      + (SELECT count(*)::integer FROM public.booster_followup_deliveries d
         WHERE d.business_id=p_business_id AND d.reservation_month=p_month AND d.state IN ('claimed','prepared','sending','unknown','accepted','reconciliation_required')) AS usage,
    CASE WHEN ba.plan_id='booster' THEN 500 WHEN ba.plan_id='complete' THEN 1500 ELSE 0 END AS allowance
  FROM public.business_agents ba
  WHERE ba.business_id=p_business_id AND ba.agent_id='review_booster'
  LIMIT 1
$$;

-- Returns only due, currently sendable candidates. The hard SQL limit prevents
-- a caller from loading an unbounded business queue; visit locks reduce duplicate
-- work when multiple cron workers scan the same workspace concurrently.
CREATE OR REPLACE FUNCTION public.list_booster_delivery_candidates(p_business_id UUID, p_limit INTEGER DEFAULT 50)
RETURNS TABLE(
  visit_id UUID, business_id UUID, customer_name TEXT, customer_email TEXT,
  visited_at TIMESTAMPTZ, service_name TEXT, business_name TEXT, business_type TEXT,
  city TEXT, google_review_url TEXT, rebooking_url TEXT, tone TEXT, language TEXT,
  email_from_name TEXT, delivery_id UUID, delivery_state TEXT,
  provider_payload JSONB, idempotency_key TEXT, first_attempt_at TIMESTAMPTZ
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
  SELECT v.id,v.business_id,v.customer_name,v.customer_email,v.visited_at,v.service_name,
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
      AND v.visited_at <= now()-interval '23 hours' AND v.visited_at >= now()-interval '7 days'
      AND NOT EXISTS (SELECT 1 FROM public.followup_unsubscribes u
        WHERE u.business_id=v.business_id AND u.customer_email_normalized=lower(trim(v.customer_email))))
      OR (d.state IN ('claimed','prepared','sending','unknown','rejected') AND d.lease_until<=now()))
    AND (d.id IS NULL OR d.state IN ('claimed','prepared','sending','unknown','deferred_quota','rejected'))
    AND (d.id IS NULL OR d.lease_until<=now())
    AND (v.next_attempt_at IS NULL OR v.next_attempt_at<=now())
  ORDER BY v.visited_at ASC,v.id ASC
  LIMIT LEAST(GREATEST(COALESCE(p_limit,50),1),50)
  FOR UPDATE OF v SKIP LOCKED
$$;

-- Claims serialize on business first, matching billing webhook workspace lock
-- order; then plan row and visit. Existing payload/key are never replaced.
CREATE OR REPLACE FUNCTION public.claim_booster_delivery(p_business_id UUID,p_visit_id UUID)
RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE v public.followup_visits%ROWTYPE; d public.booster_followup_deliveries%ROWTYPE;
        ba public.business_agents%ROWTYPE; b public.businesses%ROWTYPE; q RECORD;
        month_utc DATE := date_trunc('month', now() AT TIME ZONE 'UTC')::date;
BEGIN
  SELECT * INTO b FROM public.businesses WHERE id=p_business_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('kind','ineligible'); END IF;
  SELECT * INTO ba FROM public.business_agents WHERE business_id=p_business_id AND agent_id='review_booster' FOR UPDATE;
  SELECT * INTO v FROM public.followup_visits WHERE id=p_visit_id AND business_id=p_business_id FOR UPDATE;
  IF v.id IS NULL THEN RETURN jsonb_build_object('kind','ineligible'); END IF;
  SELECT * INTO d FROM public.booster_followup_deliveries WHERE business_id=p_business_id AND visit_id=p_visit_id FOR UPDATE;
  IF EXISTS (SELECT 1 FROM public.followup_messages fm WHERE fm.visit_id=p_visit_id AND fm.business_id=p_business_id AND lower(fm.status)='sent') THEN
    UPDATE public.followup_visits SET followup_status='sent',
      followup_sent_at=COALESCE(followup_sent_at,(SELECT min(fm.sent_at) FROM public.followup_messages fm WHERE fm.visit_id=p_visit_id AND fm.business_id=p_business_id AND lower(fm.status)='sent'),now()),
      next_attempt_at=NULL,last_error=NULL,updated_at=now() WHERE id=p_visit_id AND business_id=p_business_id;
    IF d.id IS NOT NULL THEN
      UPDATE public.booster_followup_deliveries SET state='accepted',accepted_at=COALESCE(accepted_at,now()),updated_at=now() WHERE id=d.id;
    END IF;
    RETURN jsonb_build_object('kind','existing','deliveryId',d.id,'state','accepted');
  END IF;
  IF d.id IS NOT NULL THEN
    IF d.state IN ('accepted','expired','non_sendable','reconciliation_required') THEN
      RETURN jsonb_build_object('kind',CASE WHEN d.state='accepted' THEN 'existing' ELSE d.state END,'deliveryId',d.id,'state',d.state);
    END IF;
    IF d.lease_until > now() THEN RETURN jsonb_build_object('kind','busy'); END IF;
    IF d.first_attempt_at IS NOT NULL AND d.first_attempt_at <= now()-interval '23 hours' THEN
      UPDATE public.booster_followup_deliveries SET state='reconciliation_required',updated_at=now()
        WHERE id=d.id;
      RETURN jsonb_build_object('kind','reconciliation_required','deliveryId',d.id);
    END IF;
    IF d.state='rejected' AND coalesce(v.attempt_count,0)>=3 THEN
      UPDATE public.booster_followup_deliveries SET state='expired',updated_at=now() WHERE id=d.id;
      RETURN jsonb_build_object('kind','expired','deliveryId',d.id);
    END IF;
    IF d.first_attempt_at IS NOT NULL AND (ba.id IS NULL OR coalesce(ba.status,'') NOT IN ('active','trialing') OR coalesce(ba.plan_id,'') NOT IN ('booster','complete')
       OR v.followup_sent_at IS NOT NULL OR v.visited_at>now()-interval '23 hours' OR v.visited_at<now()-interval '7 days'
       OR v.customer_email IS NULL OR length(trim(v.customer_email))=0 OR b.google_review_url IS NULL OR length(trim(b.google_review_url))=0
       OR EXISTS (SELECT 1 FROM public.followup_unsubscribes u WHERE u.business_id=p_business_id AND u.customer_email_normalized=lower(trim(v.customer_email)))) THEN
      UPDATE public.booster_followup_deliveries SET state='reconciliation_required',updated_at=now() WHERE id=d.id;
      RETURN jsonb_build_object('kind','reconciliation_required','deliveryId',d.id);
    END IF;
    IF d.state='rejected' THEN
      SELECT * INTO q FROM public.booster_monthly_quota(p_business_id,month_utc);
      IF q.usage >= q.allowance THEN
        UPDATE public.followup_visits SET followup_status='deferred_quota',updated_at=now() WHERE id=p_visit_id;
        RETURN jsonb_build_object('kind','quota_exhausted','usage',q.usage,'allowance',q.allowance);
      END IF;
    END IF;
    IF d.first_attempt_at IS NULL AND d.reservation_month IS DISTINCT FROM month_utc THEN
      SELECT * INTO q FROM public.booster_monthly_quota(p_business_id,month_utc);
      IF q.usage >= q.allowance THEN
        UPDATE public.booster_followup_deliveries SET state='deferred_quota',reservation_month=NULL,updated_at=now() WHERE id=d.id;
        UPDATE public.followup_visits SET followup_status='deferred_quota',updated_at=now() WHERE id=p_visit_id;
        RETURN jsonb_build_object('kind','quota_exhausted','usage',q.usage,'allowance',q.allowance);
      END IF;
    END IF;
    UPDATE public.booster_followup_deliveries SET lease_token=gen_random_uuid(),lease_until=now()+interval '5 minutes',
      reservation_month=CASE WHEN state='rejected' OR first_attempt_at IS NULL THEN month_utc ELSE reservation_month END,
      state=CASE WHEN provider_payload IS NULL THEN 'claimed' ELSE 'unknown' END,updated_at=now()
      WHERE id=d.id RETURNING * INTO d;
    RETURN jsonb_build_object('kind',CASE WHEN d.provider_payload IS NULL THEN 'claimed' ELSE 'recovery' END,'deliveryId',d.id,'fence',d.lease_token,
      'payload',d.provider_payload,'idempotencyKey',d.idempotency_key,'firstAttemptAt',d.first_attempt_at,'state',d.state);
  END IF;
  IF v.id IS NULL OR coalesce(v.attempt_count,0)>=3 OR ba.id IS NULL OR coalesce(ba.status,'') NOT IN ('active','trialing') OR coalesce(ba.plan_id,'') NOT IN ('booster','complete')
     OR v.followup_sent_at IS NOT NULL OR lower(v.followup_status) NOT IN ('pending','failed','deferred_quota')
     OR v.visited_at > now()-interval '23 hours' OR v.visited_at < now()-interval '7 days'
     OR v.customer_email IS NULL OR length(trim(v.customer_email))=0 OR b.google_review_url IS NULL OR length(trim(b.google_review_url))=0
     OR EXISTS (SELECT 1 FROM public.followup_unsubscribes u WHERE u.business_id=p_business_id AND u.customer_email_normalized=lower(trim(v.customer_email))) THEN
    RETURN jsonb_build_object('kind','ineligible');
  END IF;
  SELECT * INTO q FROM public.booster_monthly_quota(p_business_id,month_utc);
  IF q.usage >= q.allowance THEN
    UPDATE public.followup_visits SET followup_status='deferred_quota',updated_at=now() WHERE id=p_visit_id;
    RETURN jsonb_build_object('kind','quota_exhausted','usage',q.usage,'allowance',q.allowance);
  END IF;
  INSERT INTO public.booster_followup_deliveries(business_id,visit_id,state,idempotency_key,reservation_month)
    VALUES(p_business_id,p_visit_id,'claimed','ornigami-booster-'||gen_random_uuid()::text,month_utc) RETURNING * INTO d;
  RETURN jsonb_build_object('kind','claimed','deliveryId',d.id,'fence',d.lease_token,
    'payload',NULL,'idempotencyKey',d.idempotency_key,'firstAttemptAt',NULL,'state',d.state);
END $$;

CREATE OR REPLACE FUNCTION public.prepare_booster_delivery(p_delivery_id UUID,p_fence UUID,p_payload JSONB,p_review_url TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql AS $$
DECLARE d public.booster_followup_deliveries%ROWTYPE;
BEGIN
  SELECT * INTO d FROM public.booster_followup_deliveries WHERE id=p_delivery_id FOR UPDATE;
  IF NOT FOUND OR d.lease_token<>p_fence OR d.lease_until<=now() OR d.state NOT IN ('claimed','prepared') THEN RETURN false; END IF;
  IF d.provider_payload IS NOT NULL AND d.provider_payload<>p_payload THEN
    RAISE EXCEPTION 'booster payload is immutable once prepared';
  END IF;
  UPDATE public.booster_followup_deliveries SET provider_payload=p_payload,review_url_snapshot=p_review_url,state='prepared',updated_at=now() WHERE id=d.id;
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.begin_booster_delivery_send(p_delivery_id UUID,p_fence UUID,p_actor_user_id UUID DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE d public.booster_followup_deliveries%ROWTYPE; v public.followup_visits%ROWTYPE;
        b public.businesses%ROWTYPE; ba public.business_agents%ROWTYPE; q RECORD;
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
    -- A claimed reservation counts towards usage, so the quota remains reserved;
    -- only fail closed if the entitlement was changed or the baseline invalidated it.
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

CREATE OR REPLACE FUNCTION public.finish_booster_delivery_accepted(
  p_delivery_id UUID,p_fence UUID,p_provider_message_id TEXT,p_subject TEXT,p_body TEXT,p_provider TEXT DEFAULT 'resend'
) RETURNS BOOLEAN LANGUAGE plpgsql AS $$
DECLARE d public.booster_followup_deliveries%ROWTYPE; v public.followup_visits%ROWTYPE; bid UUID;
BEGIN
  SELECT business_id INTO bid FROM public.booster_followup_deliveries WHERE id=p_delivery_id;
  IF NOT FOUND THEN RETURN false; END IF;
  PERFORM 1 FROM public.businesses WHERE id=bid FOR UPDATE;
  SELECT * INTO d FROM public.booster_followup_deliveries WHERE id=p_delivery_id FOR UPDATE;
  IF d.lease_token<>p_fence OR d.state NOT IN ('sending','unknown') OR d.lease_until<=now() THEN RETURN false; END IF;
  SELECT * INTO v FROM public.followup_visits WHERE id=d.visit_id AND business_id=d.business_id FOR UPDATE;
  IF EXISTS (SELECT 1 FROM public.followup_messages WHERE visit_id=d.visit_id AND business_id=d.business_id AND lower(status)='sent') THEN
    UPDATE public.booster_followup_deliveries SET state='accepted',accepted_at=COALESCE(accepted_at,now()),updated_at=now() WHERE id=d.id;
    RETURN true;
  END IF;
  INSERT INTO public.followup_messages(visit_id,business_id,channel,subject,body,provider,provider_message_id,status,sent_at)
    VALUES(d.visit_id,d.business_id,'email',p_subject,p_body,p_provider,p_provider_message_id,'sent',now());
  UPDATE public.followup_visits SET followup_status='sent',followup_sent_at=now(),next_attempt_at=NULL,updated_at=now(),last_error=NULL
    WHERE id=d.visit_id;
  UPDATE public.booster_followup_deliveries SET state='accepted',provider_message_id=p_provider_message_id,
    accepted_at=COALESCE(accepted_at,now()),error_message=NULL,updated_at=now() WHERE id=d.id;
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.release_booster_delivery(p_delivery_id UUID,p_fence UUID,p_reason TEXT,p_error TEXT DEFAULT NULL)
RETURNS BOOLEAN LANGUAGE plpgsql AS $$
DECLARE d public.booster_followup_deliveries%ROWTYPE;
        bid UUID;
BEGIN
  SELECT business_id INTO bid FROM public.booster_followup_deliveries WHERE id=p_delivery_id;
  IF NOT FOUND THEN RETURN false; END IF;
  PERFORM 1 FROM public.businesses WHERE id=bid FOR UPDATE;
  SELECT * INTO d FROM public.booster_followup_deliveries WHERE id=p_delivery_id FOR UPDATE;
  IF NOT FOUND OR d.lease_token<>p_fence OR d.lease_until<=now() OR d.state NOT IN ('claimed','prepared','sending') THEN RETURN false; END IF;
  IF d.first_attempt_at IS NOT NULL AND d.send_attempt_count > 1 THEN RETURN false; END IF;
  UPDATE public.booster_followup_deliveries SET state=CASE WHEN p_reason='non_sendable' THEN 'non_sendable' ELSE 'rejected' END,
    error_message=left(p_error,1000),updated_at=now() WHERE id=d.id;
  UPDATE public.followup_visits SET followup_status=CASE WHEN p_reason='non_sendable' THEN 'skipped' ELSE 'failed' END,
    last_error=left(p_error,1000),attempt_count=coalesce(attempt_count,0)+1,
    next_attempt_at=CASE WHEN p_reason='non_sendable' THEN NULL ELSE now()+(least(power(2,coalesce(attempt_count,0)),8)*interval '15 minutes') END,updated_at=now()
    WHERE id=d.visit_id AND followup_sent_at IS NULL;
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.mark_booster_delivery_unknown(p_delivery_id UUID,p_fence UUID,p_error TEXT DEFAULT NULL)
RETURNS BOOLEAN LANGUAGE plpgsql AS $$
DECLARE changed INTEGER;
BEGIN
  UPDATE public.booster_followup_deliveries SET state='unknown',error_message=left(p_error,1000),updated_at=now(),
    lease_until=now()+interval '5 minutes'
  WHERE id=p_delivery_id AND lease_token=p_fence AND lease_until>now() AND state='sending';
  GET DIAGNOSTICS changed=ROW_COUNT;
  RETURN changed=1;
END $$;
