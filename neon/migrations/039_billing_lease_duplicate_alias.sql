-- The OUT column `fence` is also a PL/pgSQL variable, so qualify the table
-- column in the duplicate-event cleanup predicate.
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
    DELETE FROM public.billing_reconciliation_leases AS lease
      WHERE lease.owner_user_id=p_owner_user_id AND lease.fence=claimed.fence;
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
