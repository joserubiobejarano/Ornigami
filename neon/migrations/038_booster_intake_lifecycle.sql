-- A00 canonical migration 038_booster_intake_lifecycle.sql.
-- Serialize manual and CSV visit admission with account freeze, membership,
-- entitlement changes, and other business-scoped intake writes.
-- Lock order is business row, then owner/actor user rows in UUID order, then
-- the Booster entitlement row. Do not split this admission across statements.

CREATE OR REPLACE FUNCTION public.a11_admit_booster_followup_visit(
  p_business_id UUID,
  p_actor_user_id UUID,
  p_source TEXT,
  p_customer_name TEXT,
  p_customer_email TEXT,
  p_customer_phone TEXT,
  p_service_name TEXT,
  p_visited_at TIMESTAMPTZ,
  p_external_id TEXT DEFAULT NULL
) RETURNS TABLE(
  admission_status TEXT,
  id UUID,
  business_id UUID,
  customer_name TEXT,
  customer_email TEXT,
  customer_phone TEXT,
  service_name TEXT,
  visited_at TIMESTAMPTZ,
  source TEXT,
  followup_status TEXT,
  followup_sent_at TIMESTAMPTZ,
  error_reason TEXT
) LANGUAGE plpgsql VOLATILE AS $$
#variable_conflict use_column
DECLARE
  v_owner UUID;
  v_user_count INTEGER;
  v_agent public.business_agents%ROWTYPE;
  v_visit public.followup_visits%ROWTYPE;
BEGIN
  IF p_business_id IS NULL OR p_actor_user_id IS NULL OR p_visited_at IS NULL
    OR p_source IS NULL OR p_source NOT IN ('manual','csv')
    OR (p_source='csv' AND (p_customer_email IS NULL OR length(trim(p_customer_email))=0)) THEN
    RETURN QUERY SELECT 'denied'::TEXT,NULL::UUID,NULL::UUID,NULL::TEXT,NULL::TEXT,NULL::TEXT,
      NULL::TEXT,NULL::TIMESTAMPTZ,NULL::TEXT,NULL::TEXT,NULL::TIMESTAMPTZ,NULL::TEXT;
    RETURN;
  END IF;

  SELECT b.owner_user_id INTO v_owner
  FROM public.businesses b WHERE b.id=p_business_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'denied'::TEXT,NULL::UUID,NULL::UUID,NULL::TEXT,NULL::TEXT,NULL::TEXT,
      NULL::TEXT,NULL::TIMESTAMPTZ,NULL::TEXT,NULL::TEXT,NULL::TIMESTAMPTZ,NULL::TEXT;
    RETURN;
  END IF;

  -- Match A05/A11 business-first admission. Lock every identity involved so
  -- either actor or owner freeze commits before this write, or waits until it
  -- has completed; the marker is checked after acquiring both row locks.
  PERFORM 1 FROM public.users u
    WHERE u.id IN (v_owner,p_actor_user_id) ORDER BY u.id FOR UPDATE;
  SELECT count(*) INTO v_user_count FROM public.users u WHERE u.id IN (v_owner,p_actor_user_id);
  IF v_user_count <> (CASE WHEN v_owner=p_actor_user_id THEN 1 ELSE 2 END)
    OR EXISTS (SELECT 1 FROM public.users u WHERE u.id IN (v_owner,p_actor_user_id)
      AND u.privacy_deletion_requested_at IS NOT NULL)
    OR NOT (v_owner=p_actor_user_id OR EXISTS (
      SELECT 1 FROM public.business_members bm
      WHERE bm.business_id=p_business_id AND bm.user_id=p_actor_user_id
    )) THEN
    RETURN QUERY SELECT 'denied'::TEXT,NULL::UUID,NULL::UUID,NULL::TEXT,NULL::TEXT,NULL::TEXT,
      NULL::TEXT,NULL::TIMESTAMPTZ,NULL::TEXT,NULL::TEXT,NULL::TIMESTAMPTZ,NULL::TEXT;
    RETURN;
  END IF;

  SELECT ba.* INTO v_agent FROM public.business_agents ba
  WHERE ba.business_id=p_business_id AND ba.agent_id='review_booster' FOR UPDATE;
  IF NOT FOUND OR NOT (
    v_agent.status IN ('active','trialing') OR
    (v_agent.status='past_due' AND v_agent.current_period_end >= now()-interval '7 days')
  ) THEN
    RETURN QUERY SELECT 'denied'::TEXT,NULL::UUID,NULL::UUID,NULL::TEXT,NULL::TEXT,NULL::TEXT,
      NULL::TEXT,NULL::TIMESTAMPTZ,NULL::TEXT,NULL::TEXT,NULL::TIMESTAMPTZ,NULL::TEXT;
    RETURN;
  END IF;

  IF p_source='csv' THEN
    INSERT INTO public.followup_visits(
      business_id,customer_name,customer_email,customer_phone,service_name,visited_at,source,
      followup_status,last_error
    ) VALUES (
      p_business_id,p_customer_name,p_customer_email,p_customer_phone,p_service_name,p_visited_at,'csv',
      CASE WHEN length(trim(p_customer_email))>0 THEN 'pending' ELSE 'non_sendable' END,
      CASE WHEN length(trim(p_customer_email))>0 THEN NULL ELSE 'A valid email address is required for follow-up delivery.' END
    ) ON CONFLICT (business_id,(lower(customer_email)),(coalesce(service_name,'')),visited_at)
      WHERE source='csv' AND customer_email IS NOT NULL
      DO NOTHING
      RETURNING * INTO v_visit;
    IF NOT FOUND THEN
      RETURN QUERY SELECT 'duplicate'::TEXT,NULL::UUID,NULL::UUID,NULL::TEXT,NULL::TEXT,NULL::TEXT,
        NULL::TEXT,NULL::TIMESTAMPTZ,NULL::TEXT,NULL::TEXT,NULL::TIMESTAMPTZ,NULL::TEXT;
      RETURN;
    END IF;
  ELSE
    INSERT INTO public.followup_visits(
      business_id,customer_name,customer_email,customer_phone,service_name,visited_at,source,external_id,
      followup_status,last_error
    ) VALUES (
      p_business_id,p_customer_name,p_customer_email,p_customer_phone,p_service_name,p_visited_at,'manual',p_external_id,
      CASE WHEN p_customer_email IS NOT NULL AND length(trim(p_customer_email))>0 THEN 'pending' ELSE 'non_sendable' END,
      CASE WHEN p_customer_email IS NOT NULL AND length(trim(p_customer_email))>0 THEN NULL ELSE 'A valid email address is required for follow-up delivery.' END
    ) RETURNING * INTO v_visit;
  END IF;

  RETURN QUERY SELECT 'created'::TEXT,v_visit.id,v_visit.business_id,v_visit.customer_name,
    v_visit.customer_email,v_visit.customer_phone,v_visit.service_name,v_visit.visited_at,
    v_visit.source,v_visit.followup_status,v_visit.followup_sent_at,v_visit.last_error;
END $$;
