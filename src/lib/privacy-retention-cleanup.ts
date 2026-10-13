import { sql } from "@/lib/db/neon";
import { safeLogger } from "@/lib/safe-logger";
import {
  dateDaysAgo,
  PRIVACY_CLEANUP_BATCH_SIZE,
  PRIVACY_CLEANUP_MAX_BATCH_SIZE,
  PRIVACY_CLEANUP_TABLES,
  PRIVACY_GUARDED_CLEANUP_OPERATIONS,
  PRIVACY_RETENTION_DAYS,
  PRIVACY_RETENTION_ENABLED,
  PUBLIC_DEMO_CHALLENGE_EXPIRY_GRACE_DAYS,
} from "@/lib/privacy-retention";

export type PrivacyCleanupOperation = {
  table: typeof PRIVACY_CLEANUP_TABLES[number];
  deleted: number;
  candidates: number;
  changed: number;
  failed: boolean;
  fullBatch: boolean;
};

export type PrivacyCleanupStatus = "succeeded" | "partial" | "failed" | "no_work";

export type PrivacyCleanupResult = {
  attempted: number;
  deleted: number;
  changed: number;
  affected: number;
  candidates: number;
  failed: number;
  batchSize: number;
  status: PrivacyCleanupStatus;
  nextCursor: number;
  backlog: boolean;
  operations: PrivacyCleanupOperation[];
  dryRun: boolean;
  guardedDryRun: boolean;
  legacyDeleted: number;
};

async function deleteExpiredBatch(table: typeof PRIVACY_CLEANUP_TABLES[number], batchSize: number, now: Date, dryRun: boolean): Promise<{ deleted: number; candidates: number; changed: number }> {
  const nowMs = now.getTime();
  const leadsCutoff = dateDaysAgo(PRIVACY_RETENTION_DAYS.leads, nowMs);
  const feedbackCutoff = dateDaysAgo(PRIVACY_RETENTION_DAYS.feedback, nowMs);
  const demoEventsCutoff = dateDaysAgo(PRIVACY_RETENTION_DAYS.publicDemoEvents, nowMs);
  const clicksCutoff = dateDaysAgo(PRIVACY_RETENTION_DAYS.reviewLinkClicks, nowMs);
  const integrationCutoff = dateDaysAgo(PRIVACY_RETENTION_DAYS.followupIntegrationEventKeys, nowMs);
  const integrationDetailsCutoff = dateDaysAgo(PRIVACY_RETENTION_DAYS.followupIntegrationEvents, nowMs);
  const diagnosticCutoff = dateDaysAgo(PRIVACY_RETENTION_DAYS.rawDeliveryDiagnostics, nowMs);
  const cronRunsCutoff = dateDaysAgo(PRIVACY_RETENTION_DAYS.cronRuns, nowMs);
  const stateCutoff = dateDaysAgo(PRIVACY_RETENTION_DAYS.rateLimitState, nowMs);
  const contactCutoff = dateDaysAgo(PRIVACY_RETENTION_DAYS.contactContent, nowMs);
  const evidenceCutoff = dateDaysAgo(PRIVACY_RETENTION_DAYS.deliveryEvidence, nowMs);
  const permissionCutoff = dateDaysAgo(PRIVACY_RETENTION_DAYS.permissionEvidence, nowMs);
  const operationCutoff = dateDaysAgo(PRIVACY_RETENTION_DAYS.resolvedOperationEvidence, nowMs);
  let rows: Array<{ deleted?: number; candidates?: number; changed?: number }>;

  switch (table) {
    case "leads":
      rows = await sql`WITH candidates AS (SELECT ctid FROM public.leads WHERE created_at < ${leadsCutoff} ORDER BY created_at LIMIT ${batchSize}),
        deleted AS (DELETE FROM public.leads WHERE ${!dryRun} AND ctid IN (SELECT ctid FROM candidates) RETURNING 1)
        SELECT CASE WHEN ${dryRun} THEN 0 ELSE count(*)::int END AS deleted,(SELECT count(*)::int FROM candidates) AS candidates FROM deleted`;
      break;
    case "feedback":
      rows = await sql`WITH candidates AS (SELECT ctid FROM public.feedback WHERE created_at < ${feedbackCutoff} ORDER BY created_at LIMIT ${batchSize}),
        deleted AS (DELETE FROM public.feedback WHERE ${!dryRun} AND ctid IN (SELECT ctid FROM candidates) RETURNING 1)
        SELECT CASE WHEN ${dryRun} THEN 0 ELSE count(*)::int END AS deleted,(SELECT count(*)::int FROM candidates) AS candidates FROM deleted`;
      break;
    case "public_demo_events":
      rows = await sql`WITH candidates AS (SELECT ctid FROM public.public_demo_events WHERE event_date < ${demoEventsCutoff} ORDER BY event_date LIMIT ${batchSize}),
        deleted AS (DELETE FROM public.public_demo_events WHERE ${!dryRun} AND ctid IN (SELECT ctid FROM candidates) RETURNING 1)
        SELECT CASE WHEN ${dryRun} THEN 0 ELSE count(*)::int END AS deleted,(SELECT count(*)::int FROM candidates) AS candidates FROM deleted`;
      break;
    case "public_demo_email_challenges":
      rows = await sql`WITH candidates AS (SELECT ctid FROM public.public_demo_email_challenges
        WHERE expires_at < ${now}::timestamptz - make_interval(days => ${PUBLIC_DEMO_CHALLENGE_EXPIRY_GRACE_DAYS})
        ORDER BY expires_at LIMIT ${batchSize}),
        deleted AS (DELETE FROM public.public_demo_email_challenges WHERE ${!dryRun} AND ctid IN (SELECT ctid FROM candidates) RETURNING 1)
        SELECT CASE WHEN ${dryRun} THEN 0 ELSE count(*)::int END AS deleted,(SELECT count(*)::int FROM candidates) AS candidates FROM deleted`;
      break;
    case "api_rate_limits":
      rows = await sql`WITH candidates AS (SELECT ctid FROM public.api_rate_limits WHERE updated_at < ${stateCutoff} ORDER BY updated_at LIMIT ${batchSize}),
        deleted AS (DELETE FROM public.api_rate_limits WHERE ${!dryRun} AND ctid IN (SELECT ctid FROM candidates) RETURNING 1)
        SELECT CASE WHEN ${dryRun} THEN 0 ELSE count(*)::int END AS deleted,(SELECT count(*)::int FROM candidates) AS candidates FROM deleted`;
      break;
    case "auth_login_attempts":
      rows = await sql`WITH candidates AS (SELECT ctid FROM public.auth_login_attempts WHERE updated_at < ${stateCutoff} ORDER BY updated_at LIMIT ${batchSize}),
        deleted AS (DELETE FROM public.auth_login_attempts WHERE ${!dryRun} AND ctid IN (SELECT ctid FROM candidates) RETURNING 1)
        SELECT CASE WHEN ${dryRun} THEN 0 ELSE count(*)::int END AS deleted,(SELECT count(*)::int FROM candidates) AS candidates FROM deleted`;
      break;
    case "email_verification_tokens":
      rows = await sql`WITH candidates AS (SELECT ctid FROM public.email_verification_tokens WHERE expires_at < ${now}::timestamptz ORDER BY expires_at LIMIT ${batchSize}),
        deleted AS (DELETE FROM public.email_verification_tokens WHERE ${!dryRun} AND ctid IN (SELECT ctid FROM candidates) RETURNING 1)
        SELECT CASE WHEN ${dryRun} THEN 0 ELSE count(*)::int END AS deleted,(SELECT count(*)::int FROM candidates) AS candidates FROM deleted`;
      break;
    case "password_reset_tokens":
      rows = await sql`WITH candidates AS (SELECT ctid FROM public.password_reset_tokens WHERE expires_at < ${now}::timestamptz ORDER BY expires_at LIMIT ${batchSize}),
        deleted AS (DELETE FROM public.password_reset_tokens WHERE ${!dryRun} AND ctid IN (SELECT ctid FROM candidates) RETURNING 1)
        SELECT CASE WHEN ${dryRun} THEN 0 ELSE count(*)::int END AS deleted,(SELECT count(*)::int FROM candidates) AS candidates FROM deleted`;
      break;
    case "review_link_clicks":
      rows = await sql`WITH candidates AS (SELECT ctid FROM public.review_link_clicks WHERE clicked_at < ${clicksCutoff} ORDER BY clicked_at LIMIT ${batchSize}),
        deleted AS (DELETE FROM public.review_link_clicks WHERE ${!dryRun} AND ctid IN (SELECT ctid FROM candidates) RETURNING 1)
        SELECT CASE WHEN ${dryRun} THEN 0 ELSE count(*)::int END AS deleted,(SELECT count(*)::int FROM candidates) AS candidates FROM deleted`;
      break;
    case "followup_integration_event_details":
      rows = await sql`WITH candidates AS (SELECT e.ctid FROM public.followup_integration_events e
        WHERE e.created_at < ${integrationDetailsCutoff} AND e.raw_payload IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM public.privacy_retention_holds h WHERE h.record_id=e.id AND h.data_class='integration_event')
          AND NOT EXISTS (SELECT 1 FROM public.privacy_retention_holds h WHERE h.business_id=e.business_id AND h.data_class='integration_event')
          AND NOT EXISTS (SELECT 1 FROM public.followup_visits v
            WHERE v.business_id=e.business_id AND v.source=e.source AND v.external_id=e.external_id
              AND (v.terminal_at IS NULL OR EXISTS (SELECT 1 FROM public.booster_followup_deliveries d WHERE d.visit_id=v.id
                AND d.state IN ('claimed','prepared','sending','unknown','reconciliation_required'))))
        ORDER BY e.created_at LIMIT ${batchSize} FOR UPDATE OF e SKIP LOCKED),
        scrubbed AS (UPDATE public.followup_integration_events SET raw_payload=NULL
          WHERE ${!dryRun} AND ctid IN (SELECT ctid FROM candidates) AND raw_payload IS NOT NULL RETURNING 1)
        SELECT (SELECT count(*)::int FROM candidates) AS candidates,0::int AS deleted,(SELECT count(*)::int FROM scrubbed) AS changed`;
      break;
    case "followup_integration_event_keys":
      rows = await sql`WITH candidates AS (SELECT e.ctid FROM public.followup_integration_events e
        WHERE e.created_at < ${integrationCutoff}
          AND NOT EXISTS (SELECT 1 FROM public.privacy_retention_holds h WHERE h.record_id=e.id AND h.data_class='integration_event')
          AND NOT EXISTS (SELECT 1 FROM public.privacy_retention_holds h WHERE h.business_id=e.business_id AND h.data_class='integration_event')
          AND NOT EXISTS (SELECT 1 FROM public.followup_visits v
            WHERE v.business_id=e.business_id AND v.source=e.source AND v.external_id=e.external_id
              AND (v.terminal_at IS NULL OR EXISTS (SELECT 1 FROM public.booster_followup_deliveries d WHERE d.visit_id=v.id
                AND d.state IN ('claimed','prepared','sending','unknown','reconciliation_required'))))
        ORDER BY e.created_at LIMIT ${batchSize} FOR UPDATE OF e SKIP LOCKED),
        deleted AS (DELETE FROM public.followup_integration_events e WHERE ${!dryRun} AND e.ctid IN (SELECT ctid FROM candidates)
          AND NOT EXISTS (SELECT 1 FROM public.followup_visits v WHERE v.business_id=e.business_id AND v.source=e.source
            AND v.external_id=e.external_id AND (v.terminal_at IS NULL OR EXISTS (SELECT 1 FROM public.booster_followup_deliveries d
              WHERE d.visit_id=v.id AND d.state IN ('claimed','prepared','sending','unknown','reconciliation_required')))) RETURNING 1)
        SELECT (SELECT count(*)::int FROM candidates) AS candidates, (SELECT count(*)::int FROM deleted) AS deleted,0::int AS changed`;
      break;
    case "cron_runs":
      rows = await sql`WITH candidates AS (SELECT ctid FROM public.cron_runs WHERE status <> 'running' AND finished_at IS NOT NULL AND started_at < ${cronRunsCutoff} ORDER BY started_at LIMIT ${batchSize}),
        deleted AS (DELETE FROM public.cron_runs WHERE ${!dryRun} AND ctid IN (SELECT ctid FROM candidates) RETURNING 1)
        SELECT CASE WHEN ${dryRun} THEN 0 ELSE count(*)::int END AS deleted,(SELECT count(*)::int FROM candidates) AS candidates FROM deleted`;
      break;
    case "followup_messages":
      rows = await sql`WITH candidates AS (
        SELECT fm.ctid FROM public.followup_messages fm
        JOIN public.followup_visits v ON v.id=fm.visit_id
        WHERE fm.terminal_at < ${contactCutoff} AND (fm.subject IS NOT NULL OR fm.body IS NOT NULL)
          AND NOT EXISTS (SELECT 1 FROM public.booster_followup_deliveries d WHERE d.visit_id=v.id
            AND d.state IN ('claimed','prepared','sending','unknown','reconciliation_required'))
          AND NOT EXISTS (SELECT 1 FROM public.privacy_retention_holds h WHERE h.record_id=v.id AND h.data_class='booster_contact')
          AND NOT EXISTS (SELECT 1 FROM public.privacy_retention_holds h WHERE h.business_id=v.business_id AND h.data_class='booster_contact')
        ORDER BY v.terminal_at LIMIT ${batchSize} FOR UPDATE OF v SKIP LOCKED),
        scrubbed AS (UPDATE public.followup_messages SET subject=NULL,body=NULL
          WHERE ${!dryRun} AND ctid IN (SELECT ctid FROM candidates) AND (subject IS NOT NULL OR body IS NOT NULL) RETURNING 1)
        SELECT (SELECT count(*)::int FROM candidates) AS candidates,0::int AS deleted,(SELECT count(*)::int FROM scrubbed) AS changed`;
      break;
    case "followup_message_diagnostics":
      rows = await sql`WITH candidates AS (SELECT fm.ctid FROM public.followup_messages fm
        JOIN public.followup_visits v ON v.id=fm.visit_id
        WHERE fm.terminal_at < ${diagnosticCutoff} AND fm.error_message IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM public.booster_followup_deliveries d WHERE d.visit_id=v.id
            AND d.state IN ('claimed','prepared','sending','unknown','reconciliation_required'))
          AND NOT EXISTS (SELECT 1 FROM public.privacy_retention_holds h WHERE h.record_id=v.id AND h.data_class='booster_contact')
          AND NOT EXISTS (SELECT 1 FROM public.privacy_retention_holds h WHERE h.business_id=v.business_id AND h.data_class='booster_contact')
        ORDER BY fm.terminal_at LIMIT ${batchSize} FOR UPDATE OF fm,v SKIP LOCKED),
        scrubbed AS (UPDATE public.followup_messages SET error_message=NULL
          WHERE ${!dryRun} AND ctid IN (SELECT ctid FROM candidates) AND error_message IS NOT NULL RETURNING 1)
        SELECT (SELECT count(*)::int FROM candidates) AS candidates,0::int AS deleted,(SELECT count(*)::int FROM scrubbed) AS changed`;
      break;
    case "followup_visit_diagnostics":
      rows = await sql`WITH candidates AS (SELECT v.ctid FROM public.followup_visits v
        WHERE v.terminal_at < ${diagnosticCutoff} AND v.last_error IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM public.booster_followup_deliveries d WHERE d.visit_id=v.id
            AND d.state IN ('claimed','prepared','sending','unknown','reconciliation_required'))
          AND NOT EXISTS (SELECT 1 FROM public.privacy_retention_holds h WHERE (h.record_id=v.id OR h.business_id=v.business_id)
            AND h.data_class='booster_contact')
        ORDER BY v.terminal_at LIMIT ${batchSize} FOR UPDATE OF v SKIP LOCKED),
        scrubbed AS (UPDATE public.followup_visits v SET last_error=NULL
          WHERE ${!dryRun} AND v.ctid IN (SELECT ctid FROM candidates) AND v.terminal_at < ${diagnosticCutoff}
            AND lower(v.followup_status) IN ('sent','expired','skipped') AND v.last_error IS NOT NULL
            AND NOT EXISTS (SELECT 1 FROM public.booster_followup_deliveries d WHERE d.visit_id=v.id
              AND d.state IN ('claimed','prepared','sending','unknown','reconciliation_required'))
            AND NOT EXISTS (SELECT 1 FROM public.privacy_retention_holds h WHERE (h.record_id=v.id OR h.business_id=v.business_id)
              AND h.data_class='booster_contact') RETURNING 1)
        SELECT (SELECT count(*)::int FROM candidates) AS candidates,0::int AS deleted,(SELECT count(*)::int FROM scrubbed) AS changed`;
      break;
    case "followup_message_evidence":
      rows = await sql`WITH candidates AS (SELECT fm.ctid FROM public.followup_messages fm
        JOIN public.followup_visits v ON v.id=fm.visit_id
        WHERE fm.terminal_at < ${evidenceCutoff} AND fm.provider_message_id IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM public.booster_followup_deliveries d WHERE d.visit_id=v.id
            AND d.state IN ('claimed','prepared','sending','unknown','reconciliation_required'))
          AND NOT EXISTS (SELECT 1 FROM public.privacy_retention_holds h WHERE h.record_id=v.id AND h.data_class='delivery_evidence')
          AND NOT EXISTS (SELECT 1 FROM public.privacy_retention_holds h WHERE h.business_id=v.business_id AND h.data_class='delivery_evidence')
          AND NOT EXISTS (SELECT 1 FROM public.privacy_retention_holds h WHERE h.record_id=v.id AND h.data_class='booster_contact')
          AND NOT EXISTS (SELECT 1 FROM public.privacy_retention_holds h WHERE h.business_id=v.business_id AND h.data_class='booster_contact')
        ORDER BY fm.terminal_at LIMIT ${batchSize} FOR UPDATE OF fm,v SKIP LOCKED),
        scrubbed AS (UPDATE public.followup_messages SET provider_message_id=NULL
          WHERE ${!dryRun} AND ctid IN (SELECT ctid FROM candidates) AND provider_message_id IS NOT NULL RETURNING 1)
        SELECT (SELECT count(*)::int FROM candidates) AS candidates,0::int AS deleted,(SELECT count(*)::int FROM scrubbed) AS changed`;
      break;
    case "followup_visits":
      rows = await sql`WITH candidates AS (
        SELECT v.ctid FROM public.followup_visits v
        WHERE v.terminal_at < ${contactCutoff}
          AND (v.customer_name IS NOT NULL OR v.customer_email IS NOT NULL OR v.customer_phone IS NOT NULL
            OR v.service_name IS NOT NULL OR v.external_id IS NOT NULL OR v.last_error IS NOT NULL
              OR (GREATEST(v.permission_at,v.permission_withdrawn_at,v.terminal_at) < ${permissionCutoff}
              AND (v.permission_source IS NOT NULL OR v.permission_notice_version IS NOT NULL
                OR v.permission_recipient_email IS NOT NULL OR v.permission_scope IS NOT NULL)))
          AND NOT EXISTS (SELECT 1 FROM public.booster_followup_deliveries d WHERE d.visit_id=v.id
            AND d.state IN ('claimed','prepared','sending','unknown','reconciliation_required'))
          AND NOT EXISTS (SELECT 1 FROM public.privacy_retention_holds h WHERE h.record_id=v.id
            AND h.data_class IN ('booster_contact','permission_evidence'))
          AND NOT EXISTS (SELECT 1 FROM public.privacy_retention_holds h WHERE h.business_id=v.business_id
            AND h.data_class IN ('booster_contact','permission_evidence'))
        ORDER BY v.terminal_at LIMIT ${batchSize} FOR UPDATE OF v SKIP LOCKED),
        scrubbed AS (UPDATE public.followup_visits v SET customer_name=NULL, customer_email=NULL, customer_phone=NULL,
          service_name=NULL, external_id=NULL, last_error=NULL,
          permission_source=CASE WHEN GREATEST(v.permission_at,v.permission_withdrawn_at,v.terminal_at) < ${permissionCutoff} THEN NULL ELSE v.permission_source END,
          permission_notice_version=CASE WHEN GREATEST(v.permission_at,v.permission_withdrawn_at,v.terminal_at) < ${permissionCutoff} THEN NULL ELSE v.permission_notice_version END,
          permission_recipient_email=CASE WHEN GREATEST(v.permission_at,v.permission_withdrawn_at,v.terminal_at) < ${permissionCutoff} THEN NULL ELSE v.permission_recipient_email END,
          permission_scope=CASE WHEN GREATEST(v.permission_at,v.permission_withdrawn_at,v.terminal_at) < ${permissionCutoff} THEN NULL ELSE v.permission_scope END,
          permission_at=CASE WHEN GREATEST(v.permission_at,v.permission_withdrawn_at,v.terminal_at) < ${permissionCutoff} THEN NULL ELSE v.permission_at END,
          permission_withdrawn_at=CASE WHEN GREATEST(v.permission_at,v.permission_withdrawn_at,v.terminal_at) < ${permissionCutoff} THEN NULL ELSE v.permission_withdrawn_at END
          WHERE ${!dryRun} AND v.ctid IN (SELECT ctid FROM candidates) AND v.terminal_at < ${contactCutoff}
            AND lower(v.followup_status) IN ('sent','expired','skipped')
            AND NOT EXISTS (SELECT 1 FROM public.booster_followup_deliveries d WHERE d.visit_id=v.id
              AND d.state IN ('claimed','prepared','sending','unknown','reconciliation_required'))
            AND NOT EXISTS (SELECT 1 FROM public.privacy_retention_holds h WHERE h.record_id=v.id
              AND h.data_class IN ('booster_contact','permission_evidence'))
            AND NOT EXISTS (SELECT 1 FROM public.privacy_retention_holds h WHERE h.business_id=v.business_id
              AND h.data_class IN ('booster_contact','permission_evidence')) RETURNING 1)
        SELECT (SELECT count(*)::int FROM candidates) AS candidates,0::int AS deleted,(SELECT count(*)::int FROM scrubbed) AS changed`;
      break;
    case "booster_delivery_events":
      rows = await sql`WITH candidates AS (
        SELECT e.ctid FROM public.booster_delivery_events e
        JOIN public.booster_followup_deliveries d ON d.id=e.delivery_id
        WHERE d.terminal_at < ${evidenceCutoff} AND d.state IN ('accepted','expired','non_sendable')
          AND NOT EXISTS (SELECT 1 FROM public.privacy_retention_holds h WHERE h.record_id=d.id AND h.data_class='delivery_evidence')
          AND NOT EXISTS (SELECT 1 FROM public.privacy_retention_holds h WHERE h.business_id=d.business_id AND h.data_class='delivery_evidence')
        ORDER BY d.terminal_at LIMIT ${batchSize} FOR UPDATE OF d,e SKIP LOCKED),
        deleted AS (DELETE FROM public.booster_delivery_events WHERE ${!dryRun} AND ctid IN (SELECT ctid FROM candidates) RETURNING 1)
        SELECT (SELECT count(*)::int FROM candidates) AS candidates, (SELECT count(*)::int FROM deleted) AS deleted`;
      break;
    case "booster_delivery_content":
      rows = await sql`WITH candidates AS (SELECT d.ctid FROM public.booster_followup_deliveries d
        WHERE d.terminal_at < ${contactCutoff} AND d.state IN ('accepted','expired','non_sendable')
          AND (d.provider_payload IS NOT NULL OR d.review_url_snapshot IS NOT NULL)
          AND NOT EXISTS (SELECT 1 FROM public.privacy_retention_holds h WHERE h.record_id=d.id AND h.data_class='delivery_content')
          AND NOT EXISTS (SELECT 1 FROM public.privacy_retention_holds h WHERE h.business_id=d.business_id AND h.data_class='delivery_content')
        ORDER BY d.terminal_at LIMIT ${batchSize} FOR UPDATE OF d SKIP LOCKED),
        scrubbed AS (UPDATE public.booster_followup_deliveries d SET provider_payload=NULL,review_url_snapshot=NULL
          WHERE ${!dryRun} AND d.ctid IN (SELECT ctid FROM candidates) RETURNING 1)
        SELECT (SELECT count(*)::int FROM candidates) AS candidates,0::int AS deleted,(SELECT count(*)::int FROM scrubbed) AS changed`;
      break;
    case "booster_delivery_diagnostics":
      rows = await sql`WITH candidates AS (SELECT d.ctid FROM public.booster_followup_deliveries d
        WHERE d.terminal_at < ${diagnosticCutoff} AND d.state IN ('accepted','expired','non_sendable') AND d.error_message IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM public.privacy_retention_holds h WHERE h.record_id=d.id AND h.data_class='delivery_diagnostics')
          AND NOT EXISTS (SELECT 1 FROM public.privacy_retention_holds h WHERE h.business_id=d.business_id AND h.data_class='delivery_diagnostics')
        ORDER BY d.terminal_at LIMIT ${batchSize} FOR UPDATE OF d SKIP LOCKED),
        scrubbed AS (UPDATE public.booster_followup_deliveries d SET error_message=NULL
          WHERE ${!dryRun} AND d.ctid IN (SELECT ctid FROM candidates) RETURNING 1)
        SELECT (SELECT count(*)::int FROM candidates) AS candidates,0::int AS deleted,(SELECT count(*)::int FROM scrubbed) AS changed`;
      break;
    case "booster_delivery_provider_correlations":
      rows = await sql`WITH candidates AS (SELECT c.ctid,c.provider_message_id,c.delivery_id,d.business_id
        FROM public.booster_delivery_provider_correlations c
        JOIN public.booster_followup_deliveries d ON d.id=c.delivery_id
        WHERE d.terminal_at < ${evidenceCutoff} AND d.state IN ('accepted','expired','non_sendable')
          AND NOT EXISTS (SELECT 1 FROM public.privacy_retention_holds h WHERE h.record_id=d.id AND h.data_class='delivery_evidence')
          AND NOT EXISTS (SELECT 1 FROM public.privacy_retention_holds h WHERE h.business_id=d.business_id AND h.data_class='delivery_evidence')
        ORDER BY d.terminal_at LIMIT ${batchSize} FOR UPDATE OF c,d SKIP LOCKED),
        marked AS (UPDATE public.booster_followup_deliveries d
          SET evidence_disposed_at=COALESCE(d.evidence_disposed_at,${now}),provider_message_id=NULL,recipient_sha256=NULL
          WHERE ${!dryRun} AND d.id IN (SELECT delivery_id FROM candidates)
            AND d.state IN ('accepted','expired','non_sendable') AND d.terminal_at < ${evidenceCutoff}
            AND NOT EXISTS (SELECT 1 FROM public.privacy_retention_holds h WHERE h.record_id=d.id AND h.data_class='delivery_evidence')
            AND NOT EXISTS (SELECT 1 FROM public.privacy_retention_holds h WHERE h.business_id=d.business_id AND h.data_class='delivery_evidence')
          RETURNING d.id),
        tombstones AS (INSERT INTO public.booster_disposed_provider_correlations(provider_message_hash,disposed_at)
          SELECT encode(sha256(convert_to(c.provider_message_id,'UTF8')),'hex'),${now} FROM candidates c
          JOIN marked m ON m.id=c.delivery_id ON CONFLICT (provider_message_hash) DO NOTHING RETURNING 1),
        deleted AS (DELETE FROM public.booster_delivery_provider_correlations c
          WHERE ${!dryRun} AND c.ctid IN (SELECT c.ctid FROM candidates c JOIN marked m ON m.id=c.delivery_id) RETURNING 1)
        SELECT (SELECT count(*)::int FROM candidates) AS candidates, (SELECT count(*)::int FROM deleted) AS deleted`;
      break;
    case "privacy_account_deletion_operations":
      rows = await sql`WITH candidates AS (
        SELECT ctid FROM public.privacy_account_deletion_operations
        WHERE status='complete' AND completed_at IS NOT NULL AND completed_at < ${operationCutoff}
          AND NOT EXISTS (SELECT 1 FROM public.account_lifecycle_operations a
            WHERE (a.user_id=privacy_account_deletion_operations.actor_user_id OR a.actor_user_id=privacy_account_deletion_operations.actor_user_id)
              AND a.status IN ('active','uncertain'))
          AND NOT EXISTS (SELECT 1 FROM public.privacy_retention_holds h
            WHERE h.record_id=privacy_account_deletion_operations.id AND h.data_class='deletion_receipt')
        ORDER BY completed_at LIMIT ${batchSize}),
        deleted AS (DELETE FROM public.privacy_account_deletion_operations WHERE ${!dryRun} AND ctid IN (SELECT ctid FROM candidates) RETURNING 1)
        SELECT (SELECT count(*)::int FROM candidates) AS candidates, (SELECT count(*)::int FROM deleted) AS deleted`;
      break;
    default:
      throw new Error("unsupported_retention_operation");
  }
  return { deleted: Number(rows[0]?.deleted ?? 0), candidates: Number(rows[0]?.candidates ?? rows[0]?.deleted ?? 0), changed: Number(rows[0]?.changed ?? 0) };
}

/**
 * Remove one bounded batch per currently approved data class. Each statement
 * commits atomically and can be retried; failures are retained per table for
 * the cron health record and the next invocation resumes from remaining rows.
 */
export async function runPrivacyRetentionCleanup(input: {
  batchSize?: number;
  maxOperations?: number;
  cursor?: unknown;
  deadlineAt?: Date;
  now?: Date;
  apply?: boolean;
  dryRun?: boolean;
  checkpoint?: (cursor: number, processedCount: number) => Promise<void>;
} = {}): Promise<PrivacyCleanupResult> {
  const requestedBatch = input.batchSize ?? PRIVACY_CLEANUP_BATCH_SIZE;
  const batchSize = Number.isFinite(requestedBatch)
    ? Math.max(1, Math.min(Math.trunc(requestedBatch), PRIVACY_CLEANUP_MAX_BATCH_SIZE))
    : PRIVACY_CLEANUP_BATCH_SIZE;
  const now = input.now ?? new Date();
  const startCursor = typeof input.cursor === "number" && Number.isInteger(input.cursor)
    ? ((input.cursor % PRIVACY_CLEANUP_TABLES.length) + PRIVACY_CLEANUP_TABLES.length) % PRIVACY_CLEANUP_TABLES.length
    : 0;
  const maxOperations = Number.isFinite(input.maxOperations)
    ? Math.max(1, Math.min(Math.trunc(input.maxOperations!), PRIVACY_CLEANUP_TABLES.length))
    : PRIVACY_CLEANUP_TABLES.length;
  const operations: PrivacyCleanupOperation[] = [];

  let nextCursor = startCursor;
  let backlog = false;
  for (let offset = 0; offset < PRIVACY_CLEANUP_TABLES.length; offset += 1) {
    if (operations.length >= maxOperations || (input.deadlineAt && Date.now() >= input.deadlineAt.getTime())) {
      backlog = true;
      break;
    }
    const index = (startCursor + offset) % PRIVACY_CLEANUP_TABLES.length;
    const table = PRIVACY_CLEANUP_TABLES[index]!;
    try {
      const guarded = PRIVACY_GUARDED_CLEANUP_OPERATIONS.some((guardedTable) => guardedTable === table);
      const applyGuarded = input.apply === true && PRIVACY_RETENTION_ENABLED && input.dryRun !== true;
      const dryRun = input.dryRun === true || (guarded && !applyGuarded);
      const counts = await deleteExpiredBatch(table, batchSize, now, dryRun);
      operations.push({ table, deleted: counts.deleted, candidates: counts.candidates, changed: counts.changed, failed: false, fullBatch: counts.candidates >= batchSize });
    } catch {
      operations.push({ table, deleted: 0, candidates: 0, changed: 0, failed: true, fullBatch: false });
      safeLogger.error("privacy.retention.operation_failed", {
        table,
        error: "operation_failed",
      });
    }
    nextCursor = (index + 1) % PRIVACY_CLEANUP_TABLES.length;
    await input.checkpoint?.(nextCursor, operations.reduce((total, operation) => total + operation.deleted + operation.changed, 0));
    if (operations.at(-1)?.fullBatch) backlog = true;
    if (input.deadlineAt && Date.now() >= input.deadlineAt.getTime()) backlog = true;
  }

  if (operations.length < PRIVACY_CLEANUP_TABLES.length && operations.length >= maxOperations) backlog = true;
  const deleted = operations.reduce((total, operation) => total + operation.deleted, 0);
  const candidates = operations.reduce((total, operation) => total + operation.candidates, 0);
  const changed = operations.reduce((total, operation) => total + operation.changed, 0);
  const failed = operations.filter((operation) => operation.failed).length;
  const affected = deleted + changed;
  const status: PrivacyCleanupStatus = failed > 0
    ? (affected > 0 || operations.some((operation) => !operation.failed) ? "partial" : "failed")
    : backlog ? "partial" : affected === 0 ? "no_work" : "succeeded";
  const result = {
    attempted: operations.length,
    deleted,
    changed,
    affected: deleted + changed,
    candidates,
    failed,
    batchSize,
    status,
    nextCursor,
    backlog,
    operations,
    dryRun: input.dryRun === true,
    guardedDryRun: input.dryRun === true || !(input.apply === true && PRIVACY_RETENTION_ENABLED),
    legacyDeleted: operations.filter((operation) => !PRIVACY_GUARDED_CLEANUP_OPERATIONS.some((guardedTable) => guardedTable === operation.table))
      .reduce((total, operation) => total + operation.deleted, 0),
  };
  safeLogger.info("privacy.retention.completed", {
    attempted: result.attempted,
    deleted: result.deleted,
    changed: result.changed,
    failed: result.failed,
    batchSize: result.batchSize,
  });
  return result;
}
