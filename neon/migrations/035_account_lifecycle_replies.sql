-- A00 canonical migration 035_account_lifecycle_replies.sql; deletion remains disabled until activation acceptance.
-- Additive A11 guards for the A09 native reply functions from migration 024.
-- Install after 024 and 026. Existing public signatures remain unchanged.

CREATE TABLE IF NOT EXISTS public.privacy_reply_post_outcomes (
  claim_token UUID PRIMARY KEY,
  business_id UUID NOT NULL,
  review_id BIGINT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('accepted','rejected')),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS privacy_reply_post_outcomes_business_idx
  ON public.privacy_reply_post_outcomes(business_id, recorded_at);

CREATE OR REPLACE FUNCTION public.a11_reply_lifecycle_admit(p_business UUID,p_actor UUID DEFAULT NULL)
RETURNS BOOLEAN LANGUAGE plpgsql AS $$
DECLARE v_owner UUID; v_user UUID;
BEGIN
  IF p_business IS NULL THEN RETURN false; END IF;
  SELECT b.owner_user_id INTO v_owner FROM public.businesses b WHERE b.id=p_business;
  IF NOT FOUND THEN RETURN false; END IF;
  -- Match deletion-start and generic provider-operation order.
  PERFORM pg_advisory_xact_lock(hashtextextended('billing-customer:'||v_owner::text,0));
  PERFORM pg_advisory_xact_lock(hashtextextended('billing-checkout-owner:'||v_owner::text,0));
  -- Re-read after advisory locks, then lock workspace before user rows.
  SELECT b.owner_user_id INTO v_owner FROM public.businesses b WHERE b.id=p_business FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  FOR v_user IN SELECT DISTINCT x FROM unnest(ARRAY[v_owner,p_actor]) AS t(x)
    WHERE x IS NOT NULL ORDER BY x
  LOOP
    PERFORM 1 FROM public.users u WHERE u.id=v_user FOR UPDATE;
    IF NOT FOUND OR EXISTS (SELECT 1 FROM public.users u WHERE u.id=v_user AND u.privacy_deletion_requested_at IS NOT NULL) THEN
      RETURN false;
    END IF;
  END LOOP;
  RETURN true;
END $$;

-- Patch the actual 024 PL/pgSQL definitions in place. This retains their
-- SECURITY INVOKER privileges and business rules, has no unfenced side API,
-- and is safe to reapply after deployment or in disposable integration tests.
DO $$
DECLARE v_signature TEXT; v_guard TEXT; v_definition TEXT; v_patched TEXT; v_begin INTEGER;
BEGIN
  FOR v_signature,v_guard IN
    SELECT * FROM (VALUES
      ('public.a09_save_human_reply_draft(uuid,text,text,integer)', $g$-- A11_FREEZE_GUARD
  IF NOT public.a11_reply_lifecycle_admit(p_business_id) THEN
    RETURN QUERY SELECT false,'conflict',NULL::bigint,p_google_review_id,NULL::text,NULL::text,NULL::integer,NULL::timestamptz; RETURN;
  END IF;$g$),
      ('public.a09_claim_reply_generation(uuid,text,uuid)', $g$-- A11_FREEZE_GUARD
  IF NOT public.a11_reply_lifecycle_admit(p_business_id) THEN
    RETURN QUERY SELECT false,'frozen',NULL::uuid,NULL::bigint,NULL::integer; RETURN;
  END IF;$g$),
      ('public.a09_reserve_reply_usage(uuid,uuid,uuid,bigint,uuid,bigint)', $g$-- A11_FREEZE_GUARD
  IF NOT public.a11_reply_lifecycle_admit(p_business,p_actor) THEN
    RETURN QUERY SELECT false,NULL::uuid,'frozen'; RETURN;
  END IF;$g$),
      ('public.a09_finish_reply_usage(uuid,boolean)', $g$-- A11_FREEZE_GUARD
  IF NOT EXISTS (SELECT 1 FROM public.review_reply_usage_reservations WHERE id=p_reservation) THEN RETURN false; END IF;
  IF NOT public.a11_reply_lifecycle_admit(
      (SELECT business_id FROM public.review_reply_usage_reservations WHERE id=p_reservation),
      (SELECT actor_user_id FROM public.review_reply_usage_reservations WHERE id=p_reservation))
      AND COALESCE(p_commit,false) THEN RETURN false; END IF;$g$),
      ('public.a09_save_generated_reply(uuid,text,text,uuid,bigint,uuid)', $g$-- A11_FREEZE_GUARD
  IF NOT EXISTS (SELECT 1 FROM public.review_reply_usage_reservations WHERE id=p_reservation)
      OR NOT public.a11_reply_lifecycle_admit(p_business,
        (SELECT actor_user_id FROM public.review_reply_usage_reservations WHERE id=p_reservation)) THEN
    RETURN QUERY SELECT false,'frozen',NULL::bigint,p_google_review_id,NULL::text,NULL::text,NULL::integer,NULL::timestamptz; RETURN;
  END IF;$g$),
      ('public.a09_approve_reply_draft(uuid,text,integer,text)', $g$-- A11_FREEZE_GUARD
  IF NOT public.a11_reply_lifecycle_admit(p_business) THEN
    RETURN QUERY SELECT false,NULL::bigint,p_google_review_id,NULL::text,NULL::text,NULL::integer,NULL::timestamptz; RETURN;
  END IF;$g$),
      ('public.a09_claim_reply_post(uuid,text,text,integer,text,uuid)', $g$-- A11_FREEZE_GUARD
  IF NOT public.a11_reply_lifecycle_admit(p_business) THEN
    RETURN QUERY SELECT false,'frozen',NULL::uuid; RETURN;
  END IF;$g$),
      ('public.a09_finish_reply_post(uuid,text,text,uuid,boolean)', $g$-- A11_FREEZE_GUARD
  IF p_business IS NULL OR p_google_review_id IS NULL OR p_text IS NULL OR p_token IS NULL OR p_success IS NULL THEN RETURN false; END IF;
  IF NOT public.a11_reply_lifecycle_admit(p_business) THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.reviews r JOIN public.review_reply_draft_state s ON s.review_id=r.id
      JOIN public.review_replies rr ON rr.id=s.reply_id
      WHERE r.business_id=p_business AND r.google_review_id=p_google_review_id
        AND s.posting_token=p_token AND rr.posted IS FALSE AND rr.draft_markdown=p_text
    ) THEN RETURN false; END IF;
    INSERT INTO public.privacy_reply_post_outcomes(claim_token,business_id,review_id,outcome)
    SELECT p_token,p_business,r.id,CASE WHEN p_success THEN 'accepted' ELSE 'rejected' END
    FROM public.reviews r WHERE r.business_id=p_business AND r.google_review_id=p_google_review_id
    ON CONFLICT(claim_token) DO NOTHING;
    UPDATE public.review_reply_draft_state s SET posting_token=NULL,posting_lease_until=NULL,updated_at=now()
    FROM public.reviews r WHERE r.id=s.review_id AND r.business_id=s.business_id
      AND r.business_id=p_business AND r.google_review_id=p_google_review_id AND s.posting_token=p_token;
    RETURN FOUND;
  END IF;$g$)
    ) AS guards(signature,guard)
  LOOP
    v_definition:=pg_get_functiondef(v_signature::regprocedure);
    IF position('-- A11_FREEZE_GUARD' IN v_definition)=0 THEN
      v_begin:=position('BEGIN' IN v_definition);
      IF v_begin=0 THEN RAISE EXCEPTION 'Could not find body for %',v_signature; END IF;
      v_patched:=overlay(v_definition PLACING E'\n  '||v_guard||E'\n' FROM v_begin+5 FOR 0);
      IF v_patched=v_definition THEN RAISE EXCEPTION 'Could not inject A11 guard into %',v_signature; END IF;
      EXECUTE v_patched;
    END IF;
  END LOOP;
END $$;

COMMENT ON TABLE public.privacy_reply_post_outcomes IS
  'Minimal A11 provider outcome receipts; no reply text or provider payload. Purge during account deletion finalization after lifecycle operations drain.';
COMMENT ON FUNCTION public.a09_finish_reply_post(UUID,TEXT,TEXT,UUID,BOOLEAN) IS
  'TRUE means the provider result was durably applied to review state or, during freeze, recorded in the private minimal outcome ledger.';
