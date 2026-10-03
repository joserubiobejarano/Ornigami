-- A00 canonical migration 036_account_lifecycle_booster.sql; deletion remains disabled until activation acceptance.
-- Proposed additive A11 overlay for A06 Review Booster delivery.
-- Requires 022_booster_delivery_quotas.sql and A11_ACTIVATION_LIFECYCLE.sql.
-- Do not apply until integration assigns this proposal a migration number.
ALTER TABLE public.booster_followup_deliveries
  ADD COLUMN IF NOT EXISTS actor_user_id UUID;

DO $$ BEGIN
  IF to_regprocedure('public.list_booster_delivery_candidates_a06(uuid,integer)') IS NULL THEN
    ALTER FUNCTION public.list_booster_delivery_candidates(uuid,integer) RENAME TO list_booster_delivery_candidates_a06;
  END IF;
  IF to_regprocedure('public.claim_booster_delivery_a06(uuid,uuid)') IS NULL THEN
    ALTER FUNCTION public.claim_booster_delivery(uuid,uuid) RENAME TO claim_booster_delivery_a06;
  END IF;
  IF to_regprocedure('public.prepare_booster_delivery_a06(uuid,uuid,jsonb,text)') IS NULL THEN
    ALTER FUNCTION public.prepare_booster_delivery(uuid,uuid,jsonb,text) RENAME TO prepare_booster_delivery_a06;
  END IF;
  IF to_regprocedure('public.release_booster_delivery_a06(uuid,uuid,text,text)') IS NULL THEN
    ALTER FUNCTION public.release_booster_delivery(uuid,uuid,text,text) RENAME TO release_booster_delivery_a06;
  END IF;
  IF to_regprocedure('public.mark_booster_delivery_unknown_a06(uuid,uuid,text)') IS NULL THEN
    ALTER FUNCTION public.mark_booster_delivery_unknown(uuid,uuid,text) RENAME TO mark_booster_delivery_unknown_a06;
  END IF;
  IF to_regprocedure('public.begin_booster_delivery_send_a06(uuid,uuid,uuid)') IS NULL THEN
    ALTER FUNCTION public.begin_booster_delivery_send(uuid,uuid,uuid) RENAME TO begin_booster_delivery_send_a06;
  END IF;
  IF to_regprocedure('public.finish_booster_delivery_accepted_a06(uuid,uuid,text,text,text,text)') IS NULL THEN
    ALTER FUNCTION public.finish_booster_delivery_accepted(uuid,uuid,text,text,text,text) RENAME TO finish_booster_delivery_accepted_a06;
  END IF;
END $$;

-- Lock business then owner, matching the A11 freeze/finalizer lock order. The
-- original candidate query reads customer name/email and must not run once the
-- owner has frozen deletion.
CREATE OR REPLACE FUNCTION public.list_booster_delivery_candidates(p_business_id UUID,p_limit INTEGER DEFAULT 50)
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
  RETURN QUERY SELECT * FROM public.list_booster_delivery_candidates_a06(p_business_id,p_limit);
END $$;

-- Claim/reservation writes are frozen-admission points too. Lock owner before
-- delegating to the unchanged A06 quota/fencing implementation.
CREATE OR REPLACE FUNCTION public.claim_booster_delivery(p_business_id UUID,p_visit_id UUID)
RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE v_owner UUID;
BEGIN
  SELECT b.owner_user_id INTO v_owner FROM public.businesses b WHERE b.id=p_business_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('kind','ineligible'); END IF;
  PERFORM 1 FROM public.users u WHERE u.id=v_owner FOR UPDATE;
  IF NOT FOUND OR EXISTS (SELECT 1 FROM public.users u WHERE u.id=v_owner AND u.privacy_deletion_requested_at IS NOT NULL) THEN
    RETURN jsonb_build_object('kind','ineligible');
  END IF;
  RETURN public.claim_booster_delivery_a06(p_business_id,p_visit_id);
END $$;

-- Generation may complete concurrently with freeze. Payload persistence is a
-- fresh admission boundary; pre-freeze stored payloads remain deletable locally.
CREATE OR REPLACE FUNCTION public.prepare_booster_delivery(p_delivery_id UUID,p_fence UUID,p_payload JSONB,p_review_url TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql AS $$
DECLARE v_business UUID; v_owner UUID; d public.booster_followup_deliveries%ROWTYPE;
BEGIN
  SELECT delivery_row.business_id INTO v_business FROM public.booster_followup_deliveries delivery_row WHERE delivery_row.id=p_delivery_id;
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT b.owner_user_id INTO v_owner FROM public.businesses b WHERE b.id=v_business FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  PERFORM 1 FROM public.users u WHERE u.id=v_owner FOR UPDATE;
  IF NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id=v_owner AND u.privacy_deletion_requested_at IS NULL) THEN RETURN false; END IF;
  SELECT * INTO d FROM public.booster_followup_deliveries WHERE id=p_delivery_id FOR UPDATE;
  IF NOT FOUND OR d.lease_token IS DISTINCT FROM p_fence OR d.lease_until IS NULL OR d.lease_until<=now() THEN RETURN false; END IF;
  RETURN public.prepare_booster_delivery_a06(p_delivery_id,p_fence,p_payload,p_review_url);
END $$;

CREATE OR REPLACE FUNCTION public.prepare_booster_delivery(
  p_delivery_id UUID,p_fence UUID,p_payload JSONB,p_review_url TEXT,p_actor_user_id UUID
) RETURNS BOOLEAN LANGUAGE plpgsql AS $$
DECLARE v_business UUID; v_owner UUID; d public.booster_followup_deliveries%ROWTYPE;
BEGIN
  SELECT delivery_row.business_id INTO v_business FROM public.booster_followup_deliveries delivery_row WHERE delivery_row.id=p_delivery_id;
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT b.owner_user_id INTO v_owner FROM public.businesses b WHERE b.id=v_business FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  PERFORM 1 FROM public.users u WHERE u.id IN (v_owner,p_actor_user_id) ORDER BY u.id FOR UPDATE;
  IF NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id=v_owner AND u.privacy_deletion_requested_at IS NULL)
     OR (p_actor_user_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.users u WHERE u.id=p_actor_user_id AND u.privacy_deletion_requested_at IS NULL
     )) THEN RETURN false; END IF;
  SELECT * INTO d FROM public.booster_followup_deliveries WHERE id=p_delivery_id FOR UPDATE;
  IF NOT FOUND OR d.lease_token IS DISTINCT FROM p_fence OR d.lease_until IS NULL OR d.lease_until<=now() THEN RETURN false; END IF;
  RETURN public.prepare_booster_delivery_a06(p_delivery_id,p_fence,p_payload,p_review_url);
END $$;

-- Resend uses A06's immutable request/idempotency key and durable send lease.
-- The owner and optional actor marker are checked under the same business-first
-- lock order as deletion freeze before begin-send admits provider I/O.
CREATE OR REPLACE FUNCTION public.begin_booster_delivery_send(p_delivery_id UUID,p_fence UUID,p_actor_user_id UUID DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE v_business UUID; v_owner UUID; d public.booster_followup_deliveries%ROWTYPE; v_result JSONB;
BEGIN
  SELECT delivery_row.business_id INTO v_business FROM public.booster_followup_deliveries delivery_row WHERE delivery_row.id=p_delivery_id;
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
     )) THEN
    RETURN jsonb_build_object('kind','actor_denied');
  END IF;
  SELECT * INTO d FROM public.booster_followup_deliveries WHERE id=p_delivery_id FOR UPDATE;
  IF NOT FOUND OR d.lease_token IS DISTINCT FROM p_fence OR d.lease_until IS NULL OR d.lease_until<=now() THEN
    RETURN jsonb_build_object('kind','stale');
  END IF;
  v_result := public.begin_booster_delivery_send_a06(p_delivery_id,p_fence,p_actor_user_id);
  IF v_result->>'kind'='send' THEN
    UPDATE public.booster_followup_deliveries SET actor_user_id=COALESCE(actor_user_id,p_actor_user_id) WHERE id=p_delivery_id;
  END IF;
  RETURN v_result;
END $$;

-- A send admitted before freeze may return after freeze. Persist only the
-- provider's minimal terminal evidence; do not add subject/body history then.
CREATE OR REPLACE FUNCTION public.finish_booster_delivery_accepted(
  p_delivery_id UUID,p_fence UUID,p_provider_message_id TEXT,p_subject TEXT,p_body TEXT,p_provider TEXT DEFAULT 'resend'
) RETURNS BOOLEAN LANGUAGE plpgsql AS $$
DECLARE v_business UUID; v_owner UUID; v_actor UUID; d public.booster_followup_deliveries%ROWTYPE;
BEGIN
  SELECT business_id,actor_user_id INTO v_business,v_actor FROM public.booster_followup_deliveries WHERE id=p_delivery_id;
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT b.owner_user_id INTO v_owner FROM public.businesses b WHERE b.id=v_business FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  PERFORM 1 FROM public.users u WHERE u.id IN (v_owner,v_actor) ORDER BY u.id FOR UPDATE;
  SELECT * INTO d FROM public.booster_followup_deliveries WHERE id=p_delivery_id FOR UPDATE;
  IF NOT FOUND OR d.lease_token IS DISTINCT FROM p_fence OR d.lease_until IS NULL OR d.state NOT IN ('sending','unknown') OR d.lease_until<=now() THEN RETURN false; END IF;
  IF EXISTS (SELECT 1 FROM public.users u WHERE u.id IN (v_owner,v_actor) AND u.privacy_deletion_requested_at IS NOT NULL) THEN
    UPDATE public.booster_followup_deliveries SET state='accepted',provider_message_id=p_provider_message_id,
      provider_payload=NULL,review_url_snapshot=NULL,accepted_at=COALESCE(accepted_at,now()),error_message=NULL,updated_at=now()
      WHERE id=d.id;
    UPDATE public.followup_visits SET followup_status='sent',followup_sent_at=COALESCE(followup_sent_at,now()),
      next_attempt_at=NULL,last_error=NULL,updated_at=now() WHERE id=d.visit_id AND business_id=d.business_id;
    RETURN true;
  END IF;
  RETURN public.finish_booster_delivery_accepted_a06(p_delivery_id,p_fence,p_provider_message_id,p_subject,p_body,p_provider);
END $$;

-- Known pre-send rejection/generation failure may close a reservation after
-- freeze, but the error text and prepared payload are removed as PII.
CREATE OR REPLACE FUNCTION public.release_booster_delivery(p_delivery_id UUID,p_fence UUID,p_reason TEXT,p_error TEXT DEFAULT NULL)
RETURNS BOOLEAN LANGUAGE plpgsql AS $$
DECLARE v_business UUID; v_owner UUID; v_actor UUID; d public.booster_followup_deliveries%ROWTYPE;
BEGIN
  SELECT business_id,actor_user_id INTO v_business,v_actor FROM public.booster_followup_deliveries WHERE id=p_delivery_id;
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT b.owner_user_id INTO v_owner FROM public.businesses b WHERE b.id=v_business FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  PERFORM 1 FROM public.users u WHERE u.id IN (v_owner,v_actor) ORDER BY u.id FOR UPDATE;
  IF EXISTS (SELECT 1 FROM public.users u WHERE u.id IN (v_owner,v_actor) AND u.privacy_deletion_requested_at IS NOT NULL) THEN
    SELECT * INTO d FROM public.booster_followup_deliveries WHERE id=p_delivery_id FOR UPDATE;
    IF NOT FOUND OR d.lease_token IS DISTINCT FROM p_fence OR d.lease_until IS NULL OR d.lease_until<=now() OR d.state NOT IN ('claimed','prepared','sending')
       OR (d.first_attempt_at IS NOT NULL AND d.send_attempt_count>1) THEN RETURN false; END IF;
    UPDATE public.booster_followup_deliveries SET state=CASE WHEN p_reason='non_sendable' THEN 'non_sendable' ELSE 'rejected' END,
      provider_payload=NULL,review_url_snapshot=NULL,error_message=NULL,updated_at=now() WHERE id=d.id;
    UPDATE public.followup_visits SET followup_status=CASE WHEN p_reason='non_sendable' THEN 'skipped' ELSE 'failed' END,
      last_error=NULL,next_attempt_at=NULL,attempt_count=coalesce(attempt_count,0)+1,updated_at=now()
      WHERE id=d.visit_id AND followup_sent_at IS NULL;
    RETURN true;
  END IF;
  RETURN public.release_booster_delivery_a06(p_delivery_id,p_fence,p_reason,p_error);
END $$;

-- Unknown provider outcomes retain the immutable payload/key for A06 replay or
-- operator reconciliation, but discard potentially sensitive error text.
CREATE OR REPLACE FUNCTION public.mark_booster_delivery_unknown(p_delivery_id UUID,p_fence UUID,p_error TEXT DEFAULT NULL)
RETURNS BOOLEAN LANGUAGE plpgsql AS $$
DECLARE v_business UUID; v_owner UUID; v_actor UUID; v_frozen BOOLEAN; n INTEGER;
BEGIN
  IF p_fence IS NULL THEN RETURN false; END IF;
  SELECT business_id,actor_user_id INTO v_business,v_actor FROM public.booster_followup_deliveries WHERE id=p_delivery_id;
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT b.owner_user_id INTO v_owner FROM public.businesses b WHERE b.id=v_business FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  PERFORM 1 FROM public.users u WHERE u.id IN (v_owner,v_actor) ORDER BY u.id FOR UPDATE;
  SELECT coalesce(bool_or(u.privacy_deletion_requested_at IS NOT NULL),true) INTO v_frozen
    FROM public.users u WHERE u.id IN (v_owner,v_actor);
  UPDATE public.booster_followup_deliveries SET state='unknown',error_message=CASE WHEN v_frozen THEN NULL ELSE left(p_error,1000) END,
    updated_at=now(),lease_until=now()+interval '5 minutes'
    WHERE id=p_delivery_id AND lease_token=p_fence AND lease_until>now() AND state='sending';
  GET DIAGNOSTICS n=ROW_COUNT;
  RETURN n=1;
END $$;

COMMENT ON FUNCTION public.list_booster_delivery_candidates(uuid,integer) IS
  'A11 proposal: serializes candidate PII reads against account freeze.';
COMMENT ON FUNCTION public.claim_booster_delivery(uuid,uuid) IS
  'A11 proposal: denies new delivery/quota claims after owner freeze.';
COMMENT ON FUNCTION public.prepare_booster_delivery(uuid,uuid,jsonb,text) IS
  'A11 proposal: denies newly generated payload persistence after owner freeze.';
COMMENT ON FUNCTION public.prepare_booster_delivery(uuid,uuid,jsonb,text,uuid) IS
  'A11 proposal: denies newly generated payload persistence after owner or actor freeze.';
COMMENT ON FUNCTION public.begin_booster_delivery_send(uuid,uuid,uuid) IS
  'A11 proposal: denies Resend admission after owner or actor freeze; A06 ledger remains the native send lease.';
COMMENT ON FUNCTION public.finish_booster_delivery_accepted(uuid,uuid,text,text,text,text) IS
  'A11 proposal: post-freeze accepted delivery records only minimal provider and sent-status evidence.';
COMMENT ON FUNCTION public.release_booster_delivery(uuid,uuid,text,text) IS
  'A11 proposal: closes known no-send outcomes after freeze without retaining error or payload PII.';
COMMENT ON FUNCTION public.mark_booster_delivery_unknown(uuid,uuid,text) IS
  'A11 proposal: retains unknown provider request for reconciliation, omitting post-freeze error text.';
