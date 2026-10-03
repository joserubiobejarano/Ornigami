-- A07: scoped, revocable credentials and atomic generic booking event admission.
-- The secret is AES-GCM encrypted by the application with the existing
-- TOKEN_ENCRYPTION_KEY / AUTH_SECRET key hierarchy and is never returned again.
CREATE TABLE IF NOT EXISTS public.booster_booking_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  label TEXT NOT NULL CHECK (length(label) BETWEEN 1 AND 80),
  encrypted_secret TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS booster_booking_credentials_business_idx
  ON public.booster_booking_credentials (business_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.create_booster_booking_credential(
  p_business_id UUID, p_actor_user_id UUID, p_label TEXT, p_encrypted_secret TEXT
) RETURNS UUID LANGUAGE plpgsql AS $$
DECLARE b public.businesses%ROWTYPE; owner_row public.users%ROWTYPE; v_id UUID;
BEGIN
  SELECT * INTO b FROM public.businesses WHERE id=p_business_id FOR UPDATE;
  IF NOT FOUND OR b.owner_user_id<>p_actor_user_id THEN RETURN NULL; END IF;
  SELECT * INTO owner_row FROM public.users WHERE id=b.owner_user_id FOR UPDATE;
  IF NOT FOUND OR to_jsonb(owner_row)->>'privacy_deletion_requested_at' IS NOT NULL THEN RETURN NULL; END IF;
  IF p_label IS NULL OR length(p_label) NOT BETWEEN 1 AND 80 OR p_encrypted_secret IS NULL THEN RETURN NULL; END IF;
  INSERT INTO public.booster_booking_credentials(business_id,label,encrypted_secret)
  VALUES(p_business_id,trim(p_label),p_encrypted_secret) RETURNING id INTO v_id;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.revoke_booster_booking_credential(
  p_business_id UUID, p_actor_user_id UUID, p_credential_id UUID
) RETURNS BOOLEAN LANGUAGE plpgsql AS $$
DECLARE b public.businesses%ROWTYPE; owner_row public.users%ROWTYPE;
BEGIN
  SELECT * INTO b FROM public.businesses WHERE id=p_business_id FOR UPDATE;
  IF NOT FOUND OR b.owner_user_id<>p_actor_user_id THEN RETURN false; END IF;
  SELECT * INTO owner_row FROM public.users WHERE id=b.owner_user_id FOR UPDATE;
  IF NOT FOUND OR to_jsonb(owner_row)->>'privacy_deletion_requested_at' IS NOT NULL THEN RETURN false; END IF;
  UPDATE public.booster_booking_credentials SET revoked_at=now()
  WHERE id=p_credential_id AND business_id=p_business_id AND revoked_at IS NULL;
  RETURN FOUND;
END $$;

CREATE OR REPLACE FUNCTION public.admit_booster_booking_event(
  p_credential_id UUID, p_source TEXT, p_event_type TEXT, p_external_id TEXT,
  p_customer_name TEXT, p_customer_email TEXT, p_customer_phone TEXT,
  p_service_name TEXT, p_visited_at TIMESTAMPTZ
) RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE c public.booster_booking_credentials%ROWTYPE; b public.businesses%ROWTYPE;
        owner_row public.users%ROWTYPE; ba public.business_agents%ROWTYPE;
  v_event_id UUID; v_business_id UUID;
BEGIN
  -- Admission locks business before owner. Coordinate this order with A11 before
  -- activating privacy freeze; this predicate alone is not deletion-race proof.
  SELECT cr.business_id INTO STRICT v_business_id
    FROM public.booster_booking_credentials cr WHERE cr.id=p_credential_id;
  SELECT * INTO b FROM public.businesses WHERE id=v_business_id FOR UPDATE;
  IF NOT FOUND THEN RETURN 'unauthorized'; END IF;
  SELECT * INTO owner_row FROM public.users WHERE id=b.owner_user_id FOR UPDATE;
  IF NOT FOUND OR to_jsonb(owner_row)->>'privacy_deletion_requested_at' IS NOT NULL THEN RETURN 'unauthorized'; END IF;
  SELECT * INTO c FROM public.booster_booking_credentials WHERE id=p_credential_id FOR UPDATE;
  IF NOT FOUND OR c.business_id<>b.id OR c.revoked_at IS NOT NULL THEN RETURN 'unauthorized'; END IF;
  SELECT * INTO ba FROM public.business_agents WHERE business_id=b.id AND agent_id='review_booster' FOR UPDATE;
  IF NOT FOUND OR coalesce(lower(ba.status),'') NOT IN ('active','trialing') OR coalesce(lower(ba.plan_id),'') NOT IN ('booster','complete') THEN
    RETURN 'inactive';
  END IF;
  IF p_source IS NULL OR length(p_source) NOT BETWEEN 1 AND 40
     OR p_event_type IS NULL OR length(p_event_type) NOT BETWEEN 1 AND 80
     OR p_external_id IS NULL OR length(p_external_id) NOT BETWEEN 1 AND 200 THEN
    RETURN 'invalid';
  END IF;
  IF lower(p_event_type) NOT IN ('appointment.completed','booking.completed')
     OR p_visited_at IS NULL OR (nullif(trim(p_customer_email),'') IS NULL AND nullif(trim(p_customer_phone),'') IS NULL) THEN
    RETURN 'invalid';
  END IF;
  INSERT INTO public.followup_integration_events(
    business_id,source,event_type,external_id,raw_payload,processed_at
  ) VALUES (b.id,p_source,p_event_type,p_external_id,NULL,now())
  ON CONFLICT (business_id,source,external_id) WHERE external_id IS NOT NULL DO NOTHING
  RETURNING id INTO v_event_id;
  IF v_event_id IS NULL THEN
    UPDATE public.booster_booking_credentials SET last_used_at=now() WHERE id=c.id;
    RETURN 'duplicate';
  END IF;
  INSERT INTO public.followup_visits(
    business_id,customer_name,customer_email,customer_phone,service_name,visited_at,source,external_id,
    followup_status,last_error
  ) VALUES (
    b.id,p_customer_name,p_customer_email,p_customer_phone,p_service_name,p_visited_at,p_source,p_external_id,
    CASE WHEN p_customer_email IS NOT NULL AND length(trim(p_customer_email))>0 THEN 'pending' ELSE 'non_sendable' END,
    CASE WHEN p_customer_email IS NOT NULL AND length(trim(p_customer_email))>0 THEN NULL
         ELSE 'A valid email address is required for follow-up delivery.' END
  );
  UPDATE public.booster_booking_credentials SET last_used_at=now() WHERE id=c.id;
  RETURN 'created';
EXCEPTION WHEN NO_DATA_FOUND THEN
  RETURN 'unauthorized';
END $$;
