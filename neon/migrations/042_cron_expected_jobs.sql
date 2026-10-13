-- Keep cadence expectations aligned with intentionally disabled paid-AI jobs.
-- Alertable outcomes and stale leases remain monitored for every known job.
CREATE OR REPLACE FUNCTION public.claim_cron_alerts(expected_job_names TEXT[])
RETURNS TABLE (alert_key TEXT, job_name TEXT, reason TEXT)
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
#variable_conflict use_column
DECLARE
  candidate RECORD;
  claimed_key TEXT;
  active_keys TEXT[] := ARRAY[]::TEXT[];
  expected_job_count INT;
BEGIN
  IF expected_job_names IS NULL
    OR cardinality(expected_job_names) NOT BETWEEN 2 AND 3
    OR NOT expected_job_names @> ARRAY['review_booster', 'privacy_retention']::TEXT[]
    OR (('review_replies' = ANY(expected_job_names)) IS DISTINCT FROM (cardinality(expected_job_names) = 3))
  THEN
    RAISE EXCEPTION 'invalid expected cron job set' USING ERRCODE = '22023';
  END IF;

  SELECT count(DISTINCT job_name) INTO expected_job_count FROM unnest(expected_job_names) AS jobs(job_name);
  IF expected_job_count <> cardinality(expected_job_names) THEN
    RAISE EXCEPTION 'invalid expected cron job set' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(74120931);
  FOR candidate IN
    WITH expected(job_name, cadence_minutes) AS (
      SELECT known.job_name, known.cadence_minutes
      FROM (VALUES
        ('review_booster'::text, 60),
        ('review_replies'::text, 240),
        ('privacy_retention'::text, 1440)
      ) AS known(job_name, cadence_minutes)
      WHERE known.job_name = ANY(expected_job_names)
    ), latest AS (
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

-- Preserve existing direct callers with the previous all-jobs expectation.
CREATE OR REPLACE FUNCTION public.claim_cron_alerts()
RETURNS TABLE (alert_key TEXT, job_name TEXT, reason TEXT)
LANGUAGE SQL
SET search_path = pg_catalog, public
AS $$
  SELECT * FROM public.claim_cron_alerts(ARRAY['review_booster', 'review_replies', 'privacy_retention']::TEXT[])
$$;
