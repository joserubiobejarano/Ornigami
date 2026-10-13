-- Retention clocks are explicit outcome timestamps. Unknown and unresolved
-- provider states intentionally have no terminal_at and remain ineligible.
ALTER TABLE public.followup_visits
  ADD COLUMN IF NOT EXISTS terminal_at TIMESTAMPTZ;
ALTER TABLE public.followup_messages
  ADD COLUMN IF NOT EXISTS terminal_at TIMESTAMPTZ;
ALTER TABLE public.booster_followup_deliveries
  ADD COLUMN IF NOT EXISTS terminal_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS evidence_disposed_at TIMESTAMPTZ;

-- Owner/operator recorded exceptions are scoped to a record or workspace and
-- must be reviewed at least every 30 days. No application-facing grants.
CREATE TABLE IF NOT EXISTS public.privacy_retention_holds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  data_class TEXT NOT NULL CHECK (data_class IN (
    'booster_contact','permission_evidence','delivery_content','delivery_diagnostics',
    'delivery_evidence','integration_event','deletion_receipt','workspace_configuration'
  )),
  record_id UUID,
  business_id UUID REFERENCES public.businesses(id) ON DELETE CASCADE,
  reason TEXT NOT NULL CHECK (length(trim(reason)) BETWEEN 1 AND 1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  next_review_at TIMESTAMPTZ NOT NULL DEFAULT (now()+interval '30 days'),
  CHECK (record_id IS NOT NULL OR business_id IS NOT NULL),
  CHECK (next_review_at >= reviewed_at AND next_review_at <= reviewed_at + interval '30 days')
);
CREATE INDEX IF NOT EXISTS privacy_retention_holds_record_idx
  ON public.privacy_retention_holds(data_class,record_id) WHERE record_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS privacy_retention_holds_business_idx
  ON public.privacy_retention_holds(data_class,business_id) WHERE business_id IS NOT NULL;
REVOKE ALL ON public.privacy_retention_holds FROM PUBLIC;

-- Hash-only provider tombstones let verified late callbacks be acknowledged
-- after the original provider identifier is removed. No recipient is retained.
CREATE TABLE IF NOT EXISTS public.booster_disposed_provider_correlations (
  provider_message_hash TEXT PRIMARY KEY CHECK (provider_message_hash ~ '^[0-9a-f]{64}$'),
  disposed_at TIMESTAMPTZ NOT NULL
);
REVOKE ALL ON public.booster_disposed_provider_correlations FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.booster_retention_evidence_disposed(p_delivery_id UUID,p_provider_message_id TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
  SELECT (p_delivery_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.booster_followup_deliveries d
      WHERE d.id=p_delivery_id AND d.evidence_disposed_at IS NOT NULL))
    OR (p_provider_message_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.booster_disposed_provider_correlations c
      WHERE c.provider_message_hash=encode(sha256(convert_to(p_provider_message_id,'UTF8')),'hex')))
$$;
REVOKE ALL ON FUNCTION public.booster_retention_evidence_disposed(UUID,TEXT) FROM PUBLIC;

-- Preserve the immutable recipient fingerprint except for the one guarded
-- terminal disposal transition. JSON field access also keeps 025 reapplication
-- valid before this migration adds retention columns.
CREATE OR REPLACE FUNCTION public.capture_booster_delivery_correlation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE v_to JSONB; v_email TEXT; v_hash TEXT; v_disposal_allowed BOOLEAN := FALSE;
BEGIN
  IF TG_OP='UPDATE' AND OLD.recipient_sha256 IS NOT NULL AND NEW.recipient_sha256 IS NULL THEN
    -- Validate an attempted clear before payload capture can silently restore it.
    v_disposal_allowed := NEW.provider_payload IS NULL AND NEW.provider_message_id IS NULL
      AND NEW.state=OLD.state AND NEW.state IN ('accepted','expired','non_sendable')
      AND NEW.id=OLD.id AND NEW.business_id=OLD.business_id AND NEW.visit_id=OLD.visit_id
      AND NEW.idempotency_key=OLD.idempotency_key AND NEW.reservation_month IS NOT DISTINCT FROM OLD.reservation_month
      AND NEW.accepted_at IS NOT DISTINCT FROM OLD.accepted_at
      AND OLD.evidence_disposed_at IS NULL AND NEW.evidence_disposed_at IS NOT NULL
      AND OLD.terminal_at IS NOT NULL AND NEW.terminal_at IS NOT NULL
      AND NEW.terminal_at IS NOT DISTINCT FROM OLD.terminal_at
      AND NEW.terminal_at < now()-interval '365 days';
    IF v_disposal_allowed IS NOT TRUE THEN
      RAISE EXCEPTION 'booster delivery recipient fingerprint is immutable';
    END IF;
    RETURN NEW;
  END IF;
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

-- The provider callback and cleanup use the delivery row lock as a fence. A
-- callback that reaches a disposed delivery is acknowledged as a no-op, while
-- genuinely unmatched callbacks remain unresolved for retry/reconciliation.
DO $$
DECLARE v_definition TEXT; v_patched TEXT;
BEGIN
  v_definition := pg_get_functiondef('public.apply_booster_delivery_event(jsonb)'::regprocedure);
  IF position('RETENTION_DISPOSED_CALLBACK_UNMATCHED_GUARD' IN v_definition)>0
     AND position('RETENTION_DISPOSED_CALLBACK_LOCKED_GUARD' IN v_definition)>0 THEN RETURN; END IF;
  v_patched := replace(v_definition,
    'SELECT * INTO v_correlation FROM public.booster_delivery_provider_correlations WHERE provider_message_id=v_provider_id;' || E'\n    IF NOT FOUND THEN RETURN jsonb_build_object(''kind'',''unmatched''); END IF;',
    'SELECT * INTO v_correlation FROM public.booster_delivery_provider_correlations WHERE provider_message_id=v_provider_id;' || E'\n    IF NOT FOUND THEN' || E'\n      -- RETENTION_DISPOSED_CALLBACK_UNMATCHED_GUARD' || E'\n      IF public.booster_retention_evidence_disposed(v_delivery_id,v_provider_id) THEN RETURN jsonb_build_object(''kind'',''duplicate'',''deliveryId'',v_delivery_id); END IF;' || E'\n      RETURN jsonb_build_object(''kind'',''unmatched'');' || E'\n    END IF;');
  v_patched := replace(v_patched,
    'SELECT * INTO d FROM public.booster_followup_deliveries WHERE id=d.id FOR UPDATE;' || E'\n  SELECT * INTO v FROM public.followup_visits',
    'SELECT * INTO d FROM public.booster_followup_deliveries WHERE id=d.id FOR UPDATE;' || E'\n  -- RETENTION_DISPOSED_CALLBACK_LOCKED_GUARD' || E'\n  IF public.booster_retention_evidence_disposed(d.id,v_provider_id) THEN RETURN jsonb_build_object(''kind'',''duplicate'',''deliveryId'',d.id); END IF;' || E'\n  SELECT * INTO v FROM public.followup_visits');
  IF position('RETENTION_DISPOSED_CALLBACK_UNMATCHED_GUARD' IN v_patched)=0
     OR position('RETENTION_DISPOSED_CALLBACK_LOCKED_GUARD' IN v_patched)=0 THEN
    RAISE EXCEPTION 'could not install both disposed callback guards';
  END IF;
  EXECUTE v_patched;
END $$;

-- Safe historical values are backfilled only when the original outcome time
-- exists. updated_at/created_at are not substituted for terminal evidence.
UPDATE public.followup_visits
SET terminal_at=followup_sent_at
WHERE terminal_at IS NULL AND lower(followup_status)='sent' AND followup_sent_at IS NOT NULL;
UPDATE public.followup_messages
SET terminal_at=sent_at
WHERE terminal_at IS NULL AND lower(status)='sent' AND sent_at IS NOT NULL;
UPDATE public.booster_followup_deliveries
SET terminal_at=accepted_at
WHERE terminal_at IS NULL AND state='accepted' AND accepted_at IS NOT NULL;

CREATE OR REPLACE FUNCTION public.set_retention_terminal_timestamp()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME='followup_visits' THEN
    IF lower(NEW.followup_status) IN ('sent','expired','skipped') THEN
      IF TG_OP='INSERT' OR OLD.followup_status IS DISTINCT FROM NEW.followup_status THEN
        NEW.terminal_at := COALESCE(CASE WHEN lower(NEW.followup_status)='sent' THEN NEW.followup_sent_at END,now());
      ELSE
        NEW.terminal_at := COALESCE(NEW.terminal_at,CASE WHEN lower(NEW.followup_status)='sent' THEN NEW.followup_sent_at END,now());
      END IF;
    ELSE
      NEW.terminal_at := NULL;
    END IF;
  ELSIF TG_TABLE_NAME='followup_messages' THEN
    IF lower(NEW.status) IN ('sent','bounced','complained','suppressed') THEN
      IF TG_OP='INSERT' OR OLD.status IS DISTINCT FROM NEW.status THEN
        NEW.terminal_at := COALESCE(NEW.sent_at,now());
      ELSE
        NEW.terminal_at := COALESCE(NEW.terminal_at,NEW.sent_at,now());
      END IF;
    ELSE
      NEW.terminal_at := NULL;
    END IF;
  ELSIF TG_TABLE_NAME='booster_followup_deliveries' THEN
    IF NEW.state IN ('accepted','expired','non_sendable') THEN
      IF TG_OP='INSERT' OR OLD.state IS DISTINCT FROM NEW.state THEN
        NEW.terminal_at := COALESCE(NEW.accepted_at,now());
      ELSIF OLD.delivery_status IS DISTINCT FROM NEW.delivery_status
        AND NEW.delivery_status IN ('delivered','failed','suppressed','bounced','complained') THEN
        NEW.terminal_at := GREATEST(COALESCE(NEW.terminal_at,NEW.accepted_at,now()),COALESCE(NEW.delivery_status_at,now()));
      ELSE
        NEW.terminal_at := COALESCE(NEW.terminal_at,NEW.accepted_at,now());
      END IF;
    ELSE
      NEW.terminal_at := NULL;
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_followup_visits_retention_terminal ON public.followup_visits;
CREATE TRIGGER trg_followup_visits_retention_terminal
BEFORE INSERT OR UPDATE OF followup_status,followup_sent_at ON public.followup_visits
FOR EACH ROW EXECUTE FUNCTION public.set_retention_terminal_timestamp();

DROP TRIGGER IF EXISTS trg_followup_messages_retention_terminal ON public.followup_messages;
CREATE TRIGGER trg_followup_messages_retention_terminal
BEFORE INSERT OR UPDATE OF status,sent_at ON public.followup_messages
FOR EACH ROW EXECUTE FUNCTION public.set_retention_terminal_timestamp();

DROP TRIGGER IF EXISTS trg_booster_deliveries_retention_terminal ON public.booster_followup_deliveries;
CREATE TRIGGER trg_booster_deliveries_retention_terminal
BEFORE INSERT OR UPDATE OF state,accepted_at,delivery_status,delivery_status_at ON public.booster_followup_deliveries
FOR EACH ROW EXECUTE FUNCTION public.set_retention_terminal_timestamp();

CREATE INDEX IF NOT EXISTS idx_followup_visits_retention_terminal
  ON public.followup_visits(terminal_at) WHERE terminal_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_booster_deliveries_retention_terminal
  ON public.booster_followup_deliveries(terminal_at) WHERE terminal_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_privacy_deletion_completed_retention
  ON public.privacy_account_deletion_operations(completed_at) WHERE status='complete';
