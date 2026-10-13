-- Read-only post-application verification for schema release 039–042.
-- Run after applying migrations and before deploying/resuming consumers. This
-- returns only check names and booleans; it does not expose row or customer data.
WITH funcs AS (
  SELECT signature, to_regprocedure(signature)::oid AS oid
  FROM (VALUES
    ('public.claim_billing_reconciliation_lease(uuid,text,text,integer)'),
    ('public.booster_visit_has_review_permission(uuid)'),
    ('public.list_booster_delivery_candidates_a06(uuid,integer)'),
    ('public.a11_admit_booster_followup_visit(uuid,uuid,text,text,text,timestamp with time zone,text,text,timestamp with time zone,text)'),
    ('public.a11_admit_booster_followup_visit(uuid,uuid,text,text,text,text,text,timestamp with time zone,text)'),
    ('public.admit_booster_booking_event(uuid,text,text,text,text,text,timestamp with time zone,text,timestamp with time zone,text)'),
    ('public.admit_booster_booking_event(uuid,text,text,text,text,text,text,text,timestamp with time zone)'),
    ('public.claim_booster_delivery(uuid,uuid)'),
    ('public.claim_booster_delivery_a22(uuid,uuid)'),
    ('public.claim_booster_delivery_a06(uuid,uuid)'),
    ('public.list_booster_delivery_candidates(uuid,integer)'),
    ('public.list_booster_delivery_candidates_a22(uuid,integer)'),
    ('public.list_booster_delivery_candidates_a06(uuid,integer)'),
    ('public.begin_booster_delivery_send(uuid,uuid,uuid)'),
    ('public.begin_booster_delivery_send_a22(uuid,uuid,uuid)'),
    ('public.booster_retention_evidence_disposed(uuid,text)'),
    ('public.capture_booster_delivery_correlation()'),
    ('public.set_retention_terminal_timestamp()'),
    ('public.apply_booster_delivery_event(jsonb)'),
    ('public.claim_cron_alerts(text[])'),
    ('public.claim_cron_alerts()')
  ) AS expected(signature)
), defs AS (
  SELECT signature, oid, CASE WHEN oid IS NULL THEN '' ELSE pg_get_functiondef(oid) END AS definition
  FROM funcs
), checks AS (
  SELECT '039 duplicate billing lease cleanup' AS check_name,
    EXISTS (SELECT 1 FROM defs WHERE signature LIKE 'public.claim_billing_reconciliation_lease%' AND definition LIKE '%existing_status IN (''completed'', ''ignored'')%' AND definition LIKE '%DELETE FROM public.billing_reconciliation_leases AS lease%' AND definition LIKE '%lease.fence=claimed.fence%') AS ready
  UNION ALL SELECT '040 permission evidence columns and constraint',
    (SELECT count(*) = 6 FROM information_schema.columns WHERE table_schema='public' AND table_name='followup_visits' AND column_name IN ('permission_source','permission_at','permission_notice_version','permission_recipient_email','permission_scope','permission_withdrawn_at'))
    AND EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.followup_visits'::regclass AND conname='followup_visits_permission_evidence_check')
  UNION ALL SELECT '040 permission candidate filtering',
    EXISTS (SELECT 1 FROM defs WHERE signature LIKE 'public.booster_visit_has_review_permission%' AND definition LIKE '%permission_withdrawn_at IS NULL%')
    AND EXISTS (SELECT 1 FROM defs WHERE signature LIKE 'public.list_booster_delivery_candidates_a06%' AND definition LIKE '%booster_visit_has_review_permission%')
  UNION ALL SELECT '040 evidence-bearing and fail-closed admission overloads',
    EXISTS (SELECT 1 FROM defs WHERE signature LIKE 'public.a11_admit_booster_followup_visit(uuid,uuid,text,text,text,timestamp%' AND definition LIKE '%permission_source%')
    AND EXISTS (SELECT 1 FROM defs WHERE signature LIKE 'public.a11_admit_booster_followup_visit(uuid,uuid,text,text,text,text,text,timestamp%' AND definition LIKE '%''denied''%')
    AND EXISTS (SELECT 1 FROM defs WHERE signature LIKE 'public.admit_booster_booking_event(uuid,text,text,text,text,text,timestamp%' AND definition LIKE '%permission_source%')
    AND EXISTS (SELECT 1 FROM defs WHERE signature LIKE 'public.admit_booster_booking_event(uuid,text,text,text,text,text,text,text,timestamp%' AND definition LIKE '%''invalid''%')
  UNION ALL SELECT '040 claim and send permission fences',
    EXISTS (SELECT 1 FROM defs WHERE signature LIKE 'public.claim_booster_delivery%' AND definition LIKE '%booster_visit_has_review_permission%')
    AND EXISTS (SELECT 1 FROM defs WHERE signature LIKE 'public.begin_booster_delivery_send%' AND definition LIKE '%booster_visit_has_review_permission%')
    AND EXISTS (SELECT 1 FROM defs WHERE signature LIKE 'public.claim_booster_delivery(uuid,uuid)' AND definition LIKE '%claim_booster_delivery_a22%')
    AND EXISTS (SELECT 1 FROM defs WHERE signature LIKE 'public.claim_booster_delivery_a22(uuid,uuid)' AND definition LIKE '%claim_booster_delivery_a06%')
    AND EXISTS (SELECT 1 FROM defs WHERE signature LIKE 'public.begin_booster_delivery_send(uuid,uuid,uuid)' AND definition LIKE '%begin_booster_delivery_send_a22%')
    AND EXISTS (SELECT 1 FROM defs WHERE signature LIKE 'public.begin_booster_delivery_send_a22(uuid,uuid,uuid)' AND definition LIKE '%begin_booster_delivery_send_a06%')
  UNION ALL SELECT '040 candidate wrapper preserves prior lifecycle and quota chain',
    EXISTS (SELECT 1 FROM defs WHERE signature LIKE 'public.list_booster_delivery_candidates(uuid,integer)' AND definition LIKE '%list_booster_delivery_candidates_a22%')
    AND EXISTS (SELECT 1 FROM defs WHERE signature LIKE 'public.list_booster_delivery_candidates_a22(uuid,integer)' AND definition LIKE '%list_booster_delivery_candidates_a06%')
  UNION ALL SELECT '041 retention columns and support tables',
    (SELECT count(*) = 4 FROM information_schema.columns WHERE table_schema='public' AND ((table_name IN ('followup_visits','followup_messages') AND column_name='terminal_at') OR (table_name='booster_followup_deliveries' AND column_name IN ('terminal_at','evidence_disposed_at'))))
    AND to_regclass('public.privacy_retention_holds') IS NOT NULL
    AND to_regclass('public.booster_disposed_provider_correlations') IS NOT NULL
  UNION ALL SELECT '041 enabled terminal timestamp triggers',
    (SELECT count(*) = 3 FROM pg_trigger WHERE NOT tgisinternal AND tgenabled <> 'D' AND tgname IN ('trg_followup_visits_retention_terminal','trg_followup_messages_retention_terminal','trg_booster_deliveries_retention_terminal'))
    AND EXISTS (SELECT 1 FROM defs WHERE signature LIKE 'public.set_retention_terminal_timestamp%' AND definition LIKE '%terminal_at%')
    AND (SELECT count(*) = 3 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_proc p ON p.oid=t.tgfoid WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND n.nspname='public' AND p.oid='public.set_retention_terminal_timestamp()'::regprocedure AND ((t.tgname='trg_followup_visits_retention_terminal' AND c.relname='followup_visits') OR (t.tgname='trg_followup_messages_retention_terminal' AND c.relname='followup_messages') OR (t.tgname='trg_booster_deliveries_retention_terminal' AND c.relname='booster_followup_deliveries')))
  UNION ALL SELECT '041 recipient fingerprint trigger remains attached',
    EXISTS (SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND t.tgname='trg_capture_booster_delivery_correlation' AND n.nspname='public' AND c.relname='booster_followup_deliveries' AND t.tgfoid='public.capture_booster_delivery_correlation()'::regprocedure)
  UNION ALL SELECT '041 provider correlation and callback guards',
    EXISTS (SELECT 1 FROM defs WHERE signature LIKE 'public.capture_booster_delivery_correlation%' AND definition LIKE '%evidence_disposed_at%')
    AND EXISTS (SELECT 1 FROM defs WHERE signature LIKE 'public.booster_retention_evidence_disposed%' AND definition LIKE '%booster_disposed_provider_correlations%')
    AND EXISTS (SELECT 1 FROM defs WHERE signature LIKE 'public.apply_booster_delivery_event%' AND definition LIKE '%RETENTION_DISPOSED_CALLBACK_UNMATCHED_GUARD%' AND definition LIKE '%RETENTION_DISPOSED_CALLBACK_LOCKED_GUARD%')
  UNION ALL SELECT '042 expected cron jobs and missed-cadence alerting',
    EXISTS (SELECT 1 FROM defs WHERE signature='public.claim_cron_alerts(text[])'
      AND definition LIKE '%expected_job_names @> ARRAY[''review_booster'', ''privacy_retention'']::TEXT[]%'
      AND definition LIKE '%''review_replies'' = ANY(expected_job_names)%'
      AND definition LIKE '%WHERE known.job_name = ANY(expected_job_names)%'
      AND definition LIKE '%SELECT e.job_name, ''never_run''::text AS reason FROM expected e%'
      AND definition LIKE '%SELECT e.job_name, ''missed_schedule''%'
      AND definition LIKE '%SELECT s.job_name, ''stale_running'' FROM public.cron_job_state s%'
      AND definition LIKE '%SELECT l.job_name, ''failed'' FROM latest_terminal l%'
      AND definition LIKE '%SELECT l.job_name, ''partial'' FROM latest_terminal l%')
    AND EXISTS (SELECT 1 FROM defs WHERE signature='public.claim_cron_alerts()'
      AND definition LIKE '%public.claim_cron_alerts(ARRAY[''review_booster'', ''review_replies'', ''privacy_retention'']::TEXT[])%')
)
SELECT check_name, ready
FROM checks
ORDER BY check_name;
