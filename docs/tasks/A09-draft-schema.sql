-- Proposed A09 migration 024. Apply only after review; this file is not wired
-- into or applied by this branch. Existing reply rows are retained verbatim.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS review_replies_reserved INTEGER NOT NULL DEFAULT 0
    CHECK (review_replies_reserved >= 0);

CREATE TABLE IF NOT EXISTS public.review_reply_draft_state (
  review_id BIGINT PRIMARY KEY REFERENCES public.reviews(id) ON DELETE CASCADE,
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  reply_id BIGINT REFERENCES public.review_replies(id) ON DELETE SET NULL,
  state TEXT NOT NULL DEFAULT 'new'
    CHECK (state IN ('new', 'ai_drafted', 'human_edited', 'approved', 'posted')),
  version INTEGER NOT NULL DEFAULT 0 CHECK (version >= 0),
  generation_fence BIGINT NOT NULL DEFAULT 0,
  generation_token UUID,
  generation_lease_until TIMESTAMPTZ,
  posting_token UUID,
  posting_lease_until TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (business_id, review_id),
  CHECK ((generation_token IS NULL) = (generation_lease_until IS NULL)),
  CHECK ((posting_token IS NULL) = (posting_lease_until IS NULL))
);

CREATE INDEX IF NOT EXISTS idx_review_reply_draft_state_business
  ON public.review_reply_draft_state (business_id, state, updated_at DESC);

-- Keep every legacy reply row. Point policy state at the newest unposted row
-- and conservatively classify it as a human edit; never treat it as AI output.
INSERT INTO public.review_reply_draft_state
  (review_id, business_id, reply_id, state, version, updated_at)
SELECT DISTINCT ON (r.id)
  r.id, r.business_id, rr.id,
  CASE WHEN lower(COALESCE(r.status, '')) = 'replied' OR r.reply_comment IS NOT NULL OR rr.posted
    THEN 'posted' ELSE 'human_edited' END,
  1, rr.updated_at
FROM public.reviews r
JOIN public.review_replies rr ON rr.review_id = r.id
  AND rr.business_id = r.business_id
ORDER BY r.id,
  CASE WHEN lower(COALESCE(r.status, '')) = 'replied' OR r.reply_comment IS NOT NULL
    THEN rr.posted ELSE NOT rr.posted END DESC,
  rr.updated_at DESC, rr.id DESC
ON CONFLICT (review_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.review_reply_usage_reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL UNIQUE,
  actor_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  owner_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  review_id BIGINT REFERENCES public.reviews(id) ON DELETE SET NULL,
  usage_period_start TIMESTAMPTZ NOT NULL,
  state TEXT NOT NULL DEFAULT 'reserved'
    CHECK (state IN ('reserved', 'committed', 'released')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT now() + INTERVAL '15 minutes',
  finalized_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_reply_usage_reservations_owner_period
  ON public.review_reply_usage_reservations (owner_user_id, usage_period_start, state);

CREATE INDEX IF NOT EXISTS idx_reply_usage_reservations_expiry
  ON public.review_reply_usage_reservations (expires_at)
  WHERE state = 'reserved';

-- These functions keep each read-check-write operation in one PostgreSQL
-- transaction and lock the review/profile rows that serialize competing work.
CREATE OR REPLACE FUNCTION public.a09_save_human_reply_draft(
  p_business_id UUID, p_google_review_id TEXT, p_markdown TEXT, p_expected_version INTEGER
) RETURNS TABLE(ok BOOLEAN, code TEXT, reply_id BIGINT, google_review_id TEXT,
  draft_markdown TEXT, state TEXT, version INTEGER, updated_at TIMESTAMPTZ)
LANGUAGE plpgsql AS $$
DECLARE v_review public.reviews%ROWTYPE; v_owner UUID; v_state public.review_reply_draft_state%ROWTYPE; v_reply BIGINT;
BEGIN
  IF p_business_id IS NULL OR p_google_review_id IS NULL OR p_expected_version IS NULL OR p_expected_version < 0
    OR p_markdown IS NULL OR btrim(p_markdown) = '' OR octet_length(btrim(p_markdown)) > 4096 THEN
    RETURN QUERY SELECT false, 'invalid', NULL::bigint, p_google_review_id, NULL::text, NULL::text, NULL::integer, NULL::timestamptz; RETURN;
  END IF;
  SELECT r.* INTO v_review FROM public.reviews r
    WHERE r.business_id = p_business_id AND r.google_review_id = p_google_review_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'not-found', NULL::bigint, p_google_review_id, NULL::text, NULL::text, NULL::integer, NULL::timestamptz; RETURN;
  END IF;
  SELECT b.owner_user_id INTO v_owner FROM public.businesses b WHERE b.id = p_business_id;
  INSERT INTO public.review_reply_draft_state(review_id,business_id,state,version)
    VALUES(v_review.id,p_business_id,'new',0) ON CONFLICT(review_id) DO NOTHING;
  SELECT s.* INTO v_state FROM public.review_reply_draft_state s WHERE s.review_id=v_review.id FOR UPDATE;
  IF p_expected_version <> v_state.version OR v_state.state = 'posted'
    OR v_state.posting_token IS NOT NULL OR lower(COALESCE(v_review.status,'')) = 'replied'
    OR v_review.reply_comment IS NOT NULL THEN
    RETURN QUERY SELECT false, 'conflict', v_state.reply_id, p_google_review_id, NULL::text,
      v_state.state, v_state.version, v_state.updated_at; RETURN;
  END IF;
  INSERT INTO public.review_replies(user_id,business_id,review_id,draft_markdown,posted,posted_at)
    VALUES(v_owner,p_business_id,v_review.id,btrim(p_markdown),false,NULL) RETURNING id INTO v_reply;
  UPDATE public.review_reply_draft_state s SET reply_id=v_reply,state='human_edited',version=s.version+1,
    generation_token=NULL,generation_lease_until=NULL,updated_at=now() WHERE s.review_id=v_review.id;
  RETURN QUERY SELECT true, NULL::text, rr.id, p_google_review_id, rr.draft_markdown,
    s.state, s.version, s.updated_at FROM public.review_reply_draft_state s
    JOIN public.review_replies rr ON rr.id=s.reply_id WHERE s.review_id=v_review.id;
END $$;

CREATE OR REPLACE FUNCTION public.a09_claim_reply_generation(
  p_business_id UUID,p_google_review_id TEXT,p_token UUID
) RETURNS TABLE(ok BOOLEAN,reason TEXT,token UUID,fence BIGINT,version INTEGER)
LANGUAGE plpgsql AS $$
DECLARE v_review public.reviews%ROWTYPE; v_state public.review_reply_draft_state%ROWTYPE;
BEGIN
  IF p_business_id IS NULL OR p_google_review_id IS NULL OR p_token IS NULL THEN
    RETURN QUERY SELECT false,'not-found',NULL::uuid,NULL::bigint,NULL::integer; RETURN;
  END IF;
  SELECT r.* INTO v_review FROM public.reviews r WHERE r.business_id=p_business_id
    AND r.google_review_id=p_google_review_id FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT false,'not-found',NULL::uuid,NULL::bigint,NULL::integer; RETURN; END IF;
  IF lower(COALESCE(v_review.status,''))='replied' OR v_review.reply_comment IS NOT NULL OR EXISTS (
    SELECT 1 FROM public.review_replies rr WHERE rr.review_id=v_review.id AND rr.posted IS FALSE
  ) THEN RETURN QUERY SELECT false,'existing-draft',NULL::uuid,NULL::bigint,NULL::integer; RETURN; END IF;
  INSERT INTO public.review_reply_draft_state(review_id,business_id,state,version)
    VALUES(v_review.id,p_business_id,'new',0) ON CONFLICT(review_id) DO NOTHING;
  SELECT s.* INTO v_state FROM public.review_reply_draft_state s WHERE s.review_id=v_review.id FOR UPDATE;
  IF v_state.state<>'new' OR v_state.version<>0 OR v_state.reply_id IS NOT NULL OR v_state.posting_token IS NOT NULL
    OR (v_state.generation_lease_until IS NOT NULL AND v_state.generation_lease_until>now()) THEN
    RETURN QUERY SELECT false,'busy',NULL::uuid,NULL::bigint,NULL::integer; RETURN;
  END IF;
  UPDATE public.review_reply_draft_state s SET generation_fence=s.generation_fence+1,
    generation_token=p_token,generation_lease_until=now()+INTERVAL '2 minutes',updated_at=now()
    WHERE s.review_id=v_review.id RETURNING s.* INTO v_state;
  RETURN QUERY SELECT true,NULL::text,p_token,v_state.generation_fence,v_state.version;
END $$;

CREATE OR REPLACE FUNCTION public.a09_reserve_reply_usage(
  p_actor UUID,p_business UUID,p_request UUID,p_review BIGINT DEFAULT NULL,
  p_claim_token UUID DEFAULT NULL,p_claim_fence BIGINT DEFAULT NULL
) RETURNS TABLE(ok BOOLEAN,reservation_id UUID,reason TEXT)
LANGUAGE plpgsql AS $$
DECLARE v_owner UUID; v_period TIMESTAMPTZ; v_business_period TIMESTAMPTZ; v_used INTEGER; v_reserved INTEGER;
  v_existing public.review_reply_usage_reservations%ROWTYPE;
BEGIN
  IF p_actor IS NULL OR p_business IS NULL OR p_request IS NULL THEN
    RETURN QUERY SELECT false,NULL::uuid,'not-found'; RETURN;
  END IF;
  SELECT owner_user_id INTO v_owner FROM public.businesses WHERE id=p_business;
  IF v_owner IS NULL THEN RETURN QUERY SELECT false,NULL::uuid,'not-found'; RETURN; END IF;
  IF p_claim_token IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.review_reply_draft_state s JOIN public.reviews r ON r.id=s.review_id
    WHERE s.business_id=p_business AND r.id=p_review AND s.generation_token=p_claim_token
      AND s.generation_fence=p_claim_fence AND s.generation_lease_until>now() AND s.version=0
  ) THEN RETURN QUERY SELECT false,NULL::uuid,'stale-claim'; RETURN; END IF;
  SELECT p.review_replies_used,p.review_replies_reserved,p.review_replies_usage_period_start
    INTO v_used,v_reserved,v_period FROM public.profiles p WHERE p.id=v_owner FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT false,NULL::uuid,'not-found'; RETURN; END IF;
  SELECT u.* INTO v_existing FROM public.review_reply_usage_reservations u WHERE u.request_id=p_request FOR UPDATE;
  IF FOUND THEN
    IF v_existing.state='reserved' AND v_existing.expires_at>now()
      AND v_existing.business_id=p_business AND v_existing.actor_user_id=p_actor THEN
      RETURN QUERY SELECT true,v_existing.id,NULL::text;
      RETURN;
    ELSIF v_existing.state<>'reserved' OR v_existing.business_id IS DISTINCT FROM p_business
      OR v_existing.actor_user_id IS DISTINCT FROM p_actor THEN
      RETURN QUERY SELECT false,NULL::uuid,'duplicate'; RETURN;
    ELSE
      UPDATE public.review_reply_usage_reservations SET state='released',finalized_at=now() WHERE id=v_existing.id;
      IF v_period=v_existing.usage_period_start THEN
        v_reserved:=GREATEST(0,COALESCE(v_reserved,0)-1);
        UPDATE public.profiles SET review_replies_reserved=v_reserved WHERE id=v_owner;
      END IF;
      RETURN QUERY SELECT false,NULL::uuid,'expired'; RETURN;
    END IF;
  END IF;
  -- This read occurs only after FOR UPDATE so concurrent first reservations
  -- with no billing metadata share the first stored period anchor.
  SELECT COALESCE(ba.current_period_start,
    CASE WHEN ba.current_period_end IS NOT NULL AND ba.billing_period='annual' THEN ba.current_period_end-INTERVAL '1 year'
      WHEN ba.current_period_end IS NOT NULL THEN ba.current_period_end-INTERVAL '1 month'
      ELSE ba.activated_at END,p.review_replies_usage_period_start,now()) INTO v_business_period
    FROM public.profiles p LEFT JOIN public.business_agents ba ON ba.business_id=p_business AND ba.agent_id='review_replies'
    WHERE p.id=v_owner;
  IF v_period IS NOT NULL AND v_business_period>v_period THEN v_period:=v_business_period; v_used:=0;
  ELSIF v_period IS NULL THEN v_period:=v_business_period; v_used:=COALESCE(v_used,0);
  ELSE v_used:=COALESCE(v_used,0); END IF;
  UPDATE public.review_reply_usage_reservations u SET state='released',finalized_at=now()
    WHERE u.owner_user_id=v_owner AND u.usage_period_start=v_period AND u.state='reserved' AND u.expires_at<=now();
  -- The ledger is authoritative. Recomputing under the owner profile lock
  -- recovers safely from expired rows and cascaded/manual ledger cleanup.
  SELECT count(*) INTO v_reserved FROM public.review_reply_usage_reservations u
    WHERE u.owner_user_id=v_owner AND u.usage_period_start=v_period AND u.state='reserved' AND u.expires_at>now();
  IF v_used+v_reserved>=2000 THEN
    UPDATE public.profiles SET review_replies_used=v_used,review_replies_reserved=v_reserved,
      review_replies_usage_period_start=v_period WHERE id=v_owner;
    RETURN QUERY SELECT false,NULL::uuid,'limit'; RETURN;
  END IF;
  UPDATE public.profiles SET review_replies_used=v_used,review_replies_reserved=v_reserved+1,
    review_replies_usage_period_start=v_period,updated_at=now() WHERE id=v_owner;
  INSERT INTO public.review_reply_usage_reservations(request_id,actor_user_id,owner_user_id,business_id,review_id,usage_period_start)
    VALUES(p_request,p_actor,v_owner,p_business,p_review,v_period) RETURNING id INTO reservation_id;
  ok:=true; reason:=NULL; RETURN NEXT;
END $$;

CREATE OR REPLACE FUNCTION public.a09_finish_reply_usage(p_reservation UUID,p_commit BOOLEAN)
RETURNS BOOLEAN LANGUAGE plpgsql AS $$
DECLARE v_u public.review_reply_usage_reservations%ROWTYPE; v_period TIMESTAMPTZ; v_owner UUID;
BEGIN
  IF p_reservation IS NULL OR p_commit IS NULL THEN RETURN false; END IF;
  SELECT owner_user_id INTO v_owner FROM public.review_reply_usage_reservations WHERE id=p_reservation;
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT review_replies_usage_period_start INTO v_period FROM public.profiles WHERE id=v_owner FOR UPDATE;
  SELECT * INTO v_u FROM public.review_reply_usage_reservations WHERE id=p_reservation FOR UPDATE;
  IF NOT FOUND OR v_u.state<>'reserved' OR (p_commit AND (v_u.expires_at<=now() OR v_period IS DISTINCT FROM v_u.usage_period_start)) THEN RETURN false; END IF;
  UPDATE public.review_reply_usage_reservations SET state=CASE WHEN p_commit THEN 'committed' ELSE 'released' END,
    finalized_at=now() WHERE id=p_reservation;
  IF v_period=v_u.usage_period_start THEN
    UPDATE public.profiles SET review_replies_reserved=GREATEST(0,review_replies_reserved-1),
      review_replies_used=COALESCE(review_replies_used,0)+CASE WHEN p_commit THEN 1 ELSE 0 END,
      updated_at=now() WHERE id=v_u.owner_user_id;
  END IF;
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.a09_save_generated_reply(
  p_business UUID,p_google_review_id TEXT,p_markdown TEXT,p_token UUID,p_fence BIGINT,p_reservation UUID
) RETURNS TABLE(ok BOOLEAN,reason TEXT,reply_id BIGINT,google_review_id TEXT,draft_markdown TEXT,
  state TEXT,version INTEGER,updated_at TIMESTAMPTZ)
LANGUAGE plpgsql AS $$
DECLARE v_review public.reviews%ROWTYPE; v_state public.review_reply_draft_state%ROWTYPE;
  v_u public.review_reply_usage_reservations%ROWTYPE; v_owner UUID; v_profile_period TIMESTAMPTZ; v_reply BIGINT;
BEGIN
  IF p_business IS NULL OR p_google_review_id IS NULL OR p_token IS NULL OR p_fence IS NULL OR p_reservation IS NULL THEN
    RETURN QUERY SELECT false,'stale-claim',NULL::bigint,p_google_review_id,NULL::text,NULL::text,NULL::integer,NULL::timestamptz; RETURN;
  END IF;
  IF p_markdown IS NULL OR btrim(p_markdown)='' OR octet_length(btrim(p_markdown))>4096 THEN
    RETURN QUERY SELECT false,'empty',NULL::bigint,p_google_review_id,NULL::text,NULL::text,NULL::integer,NULL::timestamptz; RETURN;
  END IF;
  SELECT r.* INTO v_review FROM public.reviews r WHERE r.business_id=p_business AND r.google_review_id=p_google_review_id FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT false,'stale-claim',NULL::bigint,p_google_review_id,NULL::text,NULL::text,NULL::integer,NULL::timestamptz; RETURN; END IF;
  SELECT s.* INTO v_state FROM public.review_reply_draft_state s WHERE s.review_id=v_review.id FOR UPDATE;
  IF NOT FOUND OR v_state.generation_token IS DISTINCT FROM p_token OR v_state.generation_fence IS DISTINCT FROM p_fence
    OR v_state.generation_lease_until<=now() OR v_state.version<>0 OR v_state.state<>'new'
    OR v_state.reply_id IS NOT NULL OR lower(COALESCE(v_review.status,''))='replied'
    OR v_review.reply_comment IS NOT NULL OR EXISTS(SELECT 1 FROM public.review_replies rr WHERE rr.review_id=v_review.id AND rr.posted IS FALSE) THEN
    RETURN QUERY SELECT false,'stale-claim',NULL::bigint,p_google_review_id,NULL::text,NULL::text,NULL::integer,NULL::timestamptz; RETURN;
  END IF;
  SELECT owner_user_id INTO v_owner FROM public.review_reply_usage_reservations WHERE id=p_reservation;
  IF NOT FOUND THEN RETURN QUERY SELECT false,'stale-claim',NULL::bigint,p_google_review_id,NULL::text,NULL::text,NULL::integer,NULL::timestamptz; RETURN; END IF;
  SELECT p.review_replies_usage_period_start INTO v_profile_period FROM public.profiles p WHERE p.id=v_owner FOR UPDATE;
  SELECT * INTO v_u FROM public.review_reply_usage_reservations u WHERE u.id=p_reservation FOR UPDATE;
  IF NOT FOUND OR v_u.state<>'reserved' OR v_u.business_id IS DISTINCT FROM p_business OR v_u.review_id IS DISTINCT FROM v_review.id
    OR v_u.expires_at<=now() OR v_profile_period IS DISTINCT FROM v_u.usage_period_start THEN
    RETURN QUERY SELECT false,'stale-claim',NULL::bigint,p_google_review_id,NULL::text,NULL::text,NULL::integer,NULL::timestamptz; RETURN;
  END IF;
  SELECT b.owner_user_id INTO v_owner FROM public.businesses b WHERE b.id=p_business;
  IF v_u.owner_user_id<>v_owner THEN
    RETURN QUERY SELECT false,'stale-claim',NULL::bigint,p_google_review_id,NULL::text,NULL::text,NULL::integer,NULL::timestamptz; RETURN;
  END IF;
  UPDATE public.review_reply_usage_reservations SET state=
    CASE WHEN v_profile_period=v_u.usage_period_start THEN 'committed' ELSE 'released' END, finalized_at=now()
    WHERE id=p_reservation;
  IF v_profile_period=v_u.usage_period_start THEN
    UPDATE public.profiles SET review_replies_reserved=GREATEST(0,review_replies_reserved-1),
      review_replies_used=COALESCE(review_replies_used,0)+1,updated_at=now() WHERE id=v_owner;
  END IF;
  INSERT INTO public.review_replies(user_id,business_id,review_id,draft_markdown,posted,posted_at)
    VALUES(v_owner,p_business,v_review.id,btrim(p_markdown),false,NULL) RETURNING id INTO v_reply;
  UPDATE public.review_reply_draft_state s SET reply_id=v_reply,state='ai_drafted',version=1,
    generation_token=NULL,generation_lease_until=NULL,updated_at=now() WHERE s.review_id=v_review.id RETURNING s.* INTO v_state;
  RETURN QUERY SELECT true,NULL::text,rr.id,p_google_review_id,rr.draft_markdown,v_state.state,v_state.version,v_state.updated_at
    FROM public.review_replies rr WHERE rr.id=v_reply;
END $$;

CREATE OR REPLACE FUNCTION public.a09_approve_reply_draft(
  p_business UUID,p_google_review_id TEXT,p_version INTEGER,p_text TEXT
) RETURNS TABLE(ok BOOLEAN,reply_id BIGINT,google_review_id TEXT,draft_markdown TEXT,state TEXT,version INTEGER,updated_at TIMESTAMPTZ)
LANGUAGE plpgsql AS $$
DECLARE v_review_id BIGINT; v_state public.review_reply_draft_state%ROWTYPE; v_reply public.review_replies%ROWTYPE;
BEGIN
  IF p_business IS NULL OR p_google_review_id IS NULL OR p_version IS NULL OR p_version<0 OR p_text IS NULL THEN
    RETURN QUERY SELECT false,NULL::bigint,p_google_review_id,NULL::text,NULL::text,NULL::integer,NULL::timestamptz; RETURN;
  END IF;
  SELECT id INTO v_review_id FROM public.reviews WHERE business_id=p_business AND google_review_id=p_google_review_id FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT false,NULL::bigint,p_google_review_id,NULL::text,NULL::text,NULL::integer,NULL::timestamptz; RETURN; END IF;
  SELECT * INTO v_state FROM public.review_reply_draft_state WHERE review_id=v_review_id FOR UPDATE;
  IF NOT FOUND OR v_state.version<>p_version OR v_state.state NOT IN ('ai_drafted','human_edited')
    OR v_state.posting_token IS NOT NULL THEN
    RETURN QUERY SELECT false,NULL::bigint,p_google_review_id,NULL::text,NULL::text,NULL::integer,NULL::timestamptz; RETURN;
  END IF;
  SELECT * INTO v_reply FROM public.review_replies WHERE id=v_state.reply_id AND posted IS FALSE FOR UPDATE;
  IF NOT FOUND OR v_reply.draft_markdown<>p_text THEN
    RETURN QUERY SELECT false,NULL::bigint,p_google_review_id,NULL::text,NULL::text,NULL::integer,NULL::timestamptz; RETURN;
  END IF;
  UPDATE public.review_reply_draft_state SET state='approved',updated_at=now()
    WHERE review_id=v_review_id RETURNING * INTO v_state;
  RETURN QUERY SELECT true,v_reply.id,p_google_review_id,v_reply.draft_markdown,v_state.state,v_state.version,v_state.updated_at;
END $$;

CREATE OR REPLACE FUNCTION public.a09_claim_reply_post(
  p_business UUID,p_google_review_id TEXT,p_text TEXT,p_version INTEGER,p_intent TEXT,p_token UUID
) RETURNS TABLE(ok BOOLEAN,reason TEXT,token UUID)
LANGUAGE plpgsql AS $$
DECLARE v_review public.reviews%ROWTYPE; v_state public.review_reply_draft_state%ROWTYPE; v_owner UUID;
  v_auto BOOLEAN; v_entitled BOOLEAN;
BEGIN
  IF p_business IS NULL OR p_google_review_id IS NULL OR p_text IS NULL OR p_version IS NULL OR p_intent IS NULL OR p_token IS NULL THEN
    RETURN QUERY SELECT false,'approval-required',NULL::uuid; RETURN;
  END IF;
  SELECT r.* INTO v_review FROM public.reviews r WHERE r.business_id=p_business AND r.google_review_id=p_google_review_id FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT false,'not-found',NULL::uuid; RETURN; END IF;
  IF lower(COALESCE(v_review.status,''))='replied' OR v_review.reply_comment IS NOT NULL THEN
    RETURN QUERY SELECT false,'conflict',NULL::uuid; RETURN;
  END IF;
  SELECT b.owner_user_id INTO v_owner FROM public.businesses b WHERE b.id=p_business;
  IF p_intent NOT IN ('manual','automatic') OR (p_intent='automatic' AND
      (v_review.star_rating IS NULL OR v_review.star_rating NOT IN (4,5))) THEN
    RETURN QUERY SELECT false,'approval-required',NULL::uuid; RETURN;
  END IF;
  IF p_intent='automatic' THEN
    SELECT COALESCE(auto_reply_all_reviews,false) INTO v_auto FROM public.profiles WHERE id=v_owner FOR SHARE;
    SELECT (lower(status) IN ('active','trialing') OR
        (lower(status)='past_due' AND current_period_end IS NOT NULL
          AND now()<=current_period_end+INTERVAL '7 days')) INTO v_entitled
      FROM public.business_agents WHERE business_id=p_business AND agent_id='review_replies' FOR SHARE;
    IF NOT COALESCE(v_auto,false) OR NOT COALESCE(v_entitled,false) THEN RETURN QUERY SELECT false,'approval-required',NULL::uuid; RETURN; END IF;
  END IF;
  SELECT * INTO v_state FROM public.review_reply_draft_state WHERE review_id=v_review.id FOR UPDATE;
  IF NOT FOUND OR v_state.version<>p_version
    OR NOT ((p_intent='manual' AND v_state.state IN ('ai_drafted','human_edited','approved'))
      OR (p_intent='automatic' AND v_state.state='ai_drafted'))
    OR v_state.posting_token IS NOT NULL
    OR NOT EXISTS(SELECT 1 FROM public.review_replies rr WHERE rr.id=v_state.reply_id AND rr.posted IS FALSE AND rr.draft_markdown=p_text) THEN
    RETURN QUERY SELECT false,'conflict',NULL::uuid; RETURN;
  END IF;
  UPDATE public.review_reply_draft_state SET state='approved',
    posting_token=p_token,posting_lease_until=now()+INTERVAL '10 minutes',updated_at=now()
    WHERE review_id=v_review.id;
  RETURN QUERY SELECT true,NULL::text,p_token;
END $$;

CREATE OR REPLACE FUNCTION public.a09_finish_reply_post(
  p_business UUID,p_google_review_id TEXT,p_text TEXT,p_token UUID,p_success BOOLEAN
) RETURNS BOOLEAN LANGUAGE plpgsql AS $$
DECLARE v_review public.reviews%ROWTYPE; v_state public.review_reply_draft_state%ROWTYPE;
BEGIN
  IF p_business IS NULL OR p_google_review_id IS NULL OR p_text IS NULL OR p_token IS NULL OR p_success IS NULL THEN RETURN false; END IF;
  SELECT r.* INTO v_review FROM public.reviews r WHERE r.business_id=p_business AND r.google_review_id=p_google_review_id FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT * INTO v_state FROM public.review_reply_draft_state WHERE review_id=v_review.id FOR UPDATE;
  IF NOT FOUND OR v_state.posting_token IS DISTINCT FROM p_token OR NOT EXISTS(
    SELECT 1 FROM public.review_replies rr WHERE rr.id=v_state.reply_id AND rr.posted IS FALSE AND rr.draft_markdown=p_text
  ) THEN RETURN false; END IF;
  IF p_success THEN
    UPDATE public.review_replies SET posted=true,posted_at=now(),updated_at=now() WHERE id=v_state.reply_id;
    UPDATE public.reviews SET status='replied',reply_comment=p_text,reply_update_time=now(),updated_at=now() WHERE id=v_review.id;
    UPDATE public.review_reply_draft_state SET state='posted',posting_token=NULL,posting_lease_until=NULL,updated_at=now()
      WHERE review_id=v_review.id;
  ELSE
    UPDATE public.review_reply_draft_state SET posting_token=NULL,posting_lease_until=NULL,updated_at=now()
      WHERE review_id=v_review.id;
  END IF;
  RETURN true;
END $$;
