-- A00/A12 canonical cron schema; privacy retains the existing daily 03:00 UTC Vercel schedule.
-- Older cron_runs.error_message values may contain raw exception/provider data.
UPDATE public.cron_runs SET error_message = NULL WHERE error_message IS NOT NULL
  AND error_message NOT IN ('job_failed', 'partial_failures', 'budget_exhausted', 'health_store_unavailable');

ALTER TABLE public.cron_runs DROP CONSTRAINT IF EXISTS cron_runs_status_check;
ALTER TABLE public.cron_runs ADD CONSTRAINT cron_runs_status_check
  CHECK (status IN ('running', 'succeeded', 'partial', 'failed', 'no_work'));
ALTER TABLE public.cron_runs ADD COLUMN IF NOT EXISTS fence BIGINT;
ALTER TABLE public.cron_runs ADD COLUMN IF NOT EXISTS budget_ms INT;
ALTER TABLE public.cron_runs ADD COLUMN IF NOT EXISTS batch_limit INT;
ALTER TABLE public.cron_runs ADD COLUMN IF NOT EXISTS outcomes JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS public.cron_job_state (
  job_name TEXT PRIMARY KEY CHECK (job_name IN ('review_booster', 'review_replies', 'privacy_retention')),
  fence BIGINT NOT NULL DEFAULT 0 CHECK (fence >= 0),
  lease_owner_run_id UUID,
  lease_until TIMESTAMPTZ,
  deadline_at TIMESTAMPTZ,
  lease_ms INT NOT NULL DEFAULT 90000 CHECK (lease_ms BETWEEN 5000 AND 300000),
  cursor JSONB,
  checkpoint_at TIMESTAMPTZ,
  heartbeat_at TIMESTAMPTZ,
  last_started_at TIMESTAMPTZ,
  last_finished_at TIMESTAMPTZ,
  last_success_at TIMESTAMPTZ,
  last_status TEXT CHECK (last_status IN ('succeeded', 'partial', 'failed', 'no_work')),
  budget_ms INT NOT NULL DEFAULT 45000 CHECK (budget_ms BETWEEN 1000 AND 240000),
  batch_limit INT NOT NULL DEFAULT 100 CHECK (batch_limit BETWEEN 1 AND 1000),
  CHECK ((lease_owner_run_id IS NULL) = (lease_until IS NULL)),
  CHECK ((lease_owner_run_id IS NULL) = (deadline_at IS NULL))
);

CREATE INDEX IF NOT EXISTS idx_cron_job_state_lease_until
  ON public.cron_job_state (lease_until) WHERE lease_until IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.cron_unit_state (
  job_name TEXT NOT NULL CHECK (job_name IN ('review_booster', 'review_replies', 'privacy_retention')),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  cursor JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (job_name, business_id)
);
CREATE INDEX IF NOT EXISTS idx_cron_unit_state_updated_at ON public.cron_unit_state (updated_at);

CREATE TABLE IF NOT EXISTS public.cron_alert_state (
  alert_key TEXT PRIMARY KEY,
  job_name TEXT NOT NULL CHECK (job_name IN ('review_booster', 'review_replies', 'privacy_retention')),
  reason TEXT NOT NULL CHECK (reason IN ('never_run', 'missed_schedule', 'stale_running', 'partial', 'failed')),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  last_sent_at TIMESTAMPTZ,
  transport_failures INT NOT NULL DEFAULT 0 CHECK (transport_failures >= 0),
  last_transport_error TEXT CHECK (last_transport_error IN ('sentry_dsn_missing', 'alert_transport_failed')),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_cron_alert_active_seen
  ON public.cron_alert_state (active, last_seen_at DESC);

-- Serialize candidate refreshes and claims so a stale evaluator cannot revive
-- an alert after a later successful run resolved it. Transport happens after
-- this function returns; the durable throttle still arbitrates retries.
CREATE OR REPLACE FUNCTION public.claim_cron_alerts()
RETURNS TABLE (alert_key TEXT, job_name TEXT, reason TEXT)
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
#variable_conflict use_column
DECLARE
  candidate RECORD;
  claimed_key TEXT;
  active_keys TEXT[] := ARRAY[]::TEXT[];
BEGIN
  PERFORM pg_advisory_xact_lock(74120931);
  FOR candidate IN
    WITH expected(job_name, cadence_minutes) AS (VALUES ('review_booster'::text, 60), ('review_replies'::text, 240), ('privacy_retention'::text, 1440)),
    latest AS (
      SELECT DISTINCT ON (job_name) job_name, status, started_at
      FROM public.cron_runs WHERE job_name IN ('review_booster','review_replies','privacy_retention')
      ORDER BY job_name, started_at DESC
    ), latest_terminal AS (
      SELECT DISTINCT ON (job_name) job_name, status, error_message
      FROM public.cron_runs WHERE job_name IN ('review_booster','review_replies','privacy_retention') AND status <> 'running'
      ORDER BY job_name, started_at DESC
    ), candidates AS (
      SELECT e.job_name, 'never_run'::text AS reason FROM expected e LEFT JOIN latest l USING (job_name) WHERE l.job_name IS NULL
      UNION ALL
      SELECT e.job_name, 'missed_schedule' FROM expected e JOIN latest l USING (job_name)
        WHERE l.started_at < clock_timestamp() - (e.cadence_minutes * 2 * interval '1 minute')
      UNION ALL
      SELECT s.job_name, 'stale_running' FROM public.cron_job_state s
        WHERE s.job_name IN ('review_booster','review_replies','privacy_retention')
          AND s.lease_owner_run_id IS NOT NULL AND s.lease_until < clock_timestamp()
      UNION ALL
      SELECT l.job_name, 'failed' FROM latest_terminal l WHERE l.status = 'failed'
      UNION ALL
      SELECT l.job_name, 'partial' FROM latest_terminal l
        WHERE l.status = 'partial' AND l.error_message IS DISTINCT FROM 'budget_exhausted'
    ) SELECT DISTINCT job_name, reason, job_name || ':' || reason AS alert_key FROM candidates
  LOOP
    active_keys := array_append(active_keys, candidate.alert_key);
    INSERT INTO public.cron_alert_state AS current_alert (alert_key, job_name, reason, first_seen_at, last_seen_at, last_sent_at, active)
      VALUES (candidate.alert_key, candidate.job_name, candidate.reason, clock_timestamp(), clock_timestamp(), clock_timestamp(), TRUE)
      ON CONFLICT (alert_key) DO UPDATE SET active = TRUE, last_seen_at = clock_timestamp(), reason = EXCLUDED.reason,
        resolved_at = NULL, last_sent_at = clock_timestamp(), transport_failures = 0, last_transport_error = NULL
      WHERE current_alert.active IS FALSE OR current_alert.last_sent_at IS NULL
        OR current_alert.last_sent_at < clock_timestamp() - interval '30 minutes'
      RETURNING current_alert.alert_key INTO claimed_key;
    IF FOUND THEN
      alert_key := candidate.alert_key; job_name := candidate.job_name; reason := candidate.reason;
      RETURN NEXT;
    ELSE
      UPDATE public.cron_alert_state SET active = TRUE, last_seen_at = clock_timestamp() WHERE cron_alert_state.alert_key = candidate.alert_key;
    END IF;
  END LOOP;
  UPDATE public.cron_alert_state SET active = FALSE, resolved_at = clock_timestamp()
    WHERE active IS TRUE AND NOT (cron_alert_state.alert_key = ANY(active_keys));
END;
$$;
