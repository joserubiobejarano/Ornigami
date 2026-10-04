-- Run with psql against the explicitly approved Neon database as its owner/admin.
-- This script is intentionally idempotency-hostile: it aborts if the dedicated
-- login already exists, so it never silently repairs or broadens an old role.
\set ON_ERROR_STOP on

BEGIN;

DO $preflight$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'ornigami_support_reader') THEN
    RAISE EXCEPTION 'ornigami_support_reader already exists; inspect and resolve manually';
  END IF;
  IF pg_catalog.to_regclass('public.feedback') IS NULL THEN
    RAISE EXCEPTION 'public.feedback does not exist in the selected database';
  END IF;
END
$preflight$;

CREATE ROLE ornigami_support_reader
  NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
DO $grant_connect$
BEGIN
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO ornigami_support_reader', current_database());
END
$grant_connect$;
GRANT USAGE ON SCHEMA public TO ornigami_support_reader;
GRANT SELECT ON TABLE public.feedback TO ornigami_support_reader;

-- Prove the newly granted role has no effective access to another persistent
-- table/view/foreign table or sequence. This includes privileges PUBLIC may
-- have; fail the transaction rather than changing shared grants.
DO $permission_check$
BEGIN
  IF current_setting('server_version_num')::integer < 170000 THEN
    RAISE EXCEPTION 'PostgreSQL 17 or newer is required for the complete privilege audit';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class AS relation
    JOIN pg_catalog.pg_namespace AS schema ON schema.oid = relation.relnamespace
    WHERE relation.relkind IN ('r', 'p', 'v', 'm', 'f')
      AND schema.nspname NOT IN ('pg_catalog', 'information_schema')
      AND schema.nspname NOT LIKE 'pg_toast%'
      AND schema.nspname NOT LIKE 'pg_temp_%'
      AND relation.oid <> 'public.feedback'::regclass
      AND (
        has_table_privilege('ornigami_support_reader', relation.oid, 'SELECT')
        OR has_table_privilege('ornigami_support_reader', relation.oid, 'INSERT')
        OR has_table_privilege('ornigami_support_reader', relation.oid, 'UPDATE')
        OR has_table_privilege('ornigami_support_reader', relation.oid, 'DELETE')
        OR has_table_privilege('ornigami_support_reader', relation.oid, 'TRUNCATE')
        OR has_table_privilege('ornigami_support_reader', relation.oid, 'REFERENCES')
        OR has_table_privilege('ornigami_support_reader', relation.oid, 'TRIGGER')
        OR has_table_privilege('ornigami_support_reader', relation.oid, 'MAINTAIN')
        OR EXISTS (
          SELECT 1 FROM pg_catalog.pg_attribute AS column_info
          WHERE column_info.attrelid = relation.oid AND column_info.attnum > 0 AND NOT column_info.attisdropped
            AND (
              has_column_privilege('ornigami_support_reader', relation.oid, column_info.attnum, 'SELECT')
              OR has_column_privilege('ornigami_support_reader', relation.oid, column_info.attnum, 'INSERT')
              OR has_column_privilege('ornigami_support_reader', relation.oid, column_info.attnum, 'UPDATE')
              OR has_column_privilege('ornigami_support_reader', relation.oid, column_info.attnum, 'REFERENCES')
            )
        )
      )
  ) THEN
    RAISE EXCEPTION 'support role would have access to another persistent table; inspect PUBLIC/default grants';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class AS sequence
    JOIN pg_catalog.pg_namespace AS schema ON schema.oid = sequence.relnamespace
    WHERE sequence.relkind = 'S'
      AND schema.nspname NOT IN ('pg_catalog', 'information_schema')
      AND schema.nspname NOT LIKE 'pg_toast%'
      AND schema.nspname NOT LIKE 'pg_temp_%'
      AND (
        has_sequence_privilege('ornigami_support_reader', sequence.oid, 'USAGE')
        OR has_sequence_privilege('ornigami_support_reader', sequence.oid, 'SELECT')
        OR has_sequence_privilege('ornigami_support_reader', sequence.oid, 'UPDATE')
      )
  ) THEN
    RAISE EXCEPTION 'support role would have access to a sequence; inspect PUBLIC/default grants';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_attribute AS column_info
    WHERE column_info.attrelid = 'public.feedback'::regclass
      AND column_info.attnum > 0 AND NOT column_info.attisdropped
      AND (
        has_column_privilege('ornigami_support_reader', column_info.attrelid, column_info.attnum, 'INSERT')
        OR has_column_privilege('ornigami_support_reader', column_info.attrelid, column_info.attnum, 'UPDATE')
        OR has_column_privilege('ornigami_support_reader', column_info.attrelid, column_info.attnum, 'REFERENCES')
      )
  ) THEN
    RAISE EXCEPTION 'support role would have column-level mutation access to public.feedback';
  END IF;
  IF has_table_privilege('ornigami_support_reader', 'public.feedback', 'INSERT')
    OR has_table_privilege('ornigami_support_reader', 'public.feedback', 'UPDATE')
    OR has_table_privilege('ornigami_support_reader', 'public.feedback', 'DELETE')
    OR has_table_privilege('ornigami_support_reader', 'public.feedback', 'TRUNCATE')
    OR has_table_privilege('ornigami_support_reader', 'public.feedback', 'REFERENCES')
    OR has_table_privilege('ornigami_support_reader', 'public.feedback', 'TRIGGER')
    OR has_table_privilege('ornigami_support_reader', 'public.feedback', 'MAINTAIN') THEN
    RAISE EXCEPTION 'support role would have table-level mutation access to public.feedback';
  END IF;
  IF has_table_privilege('ornigami_support_reader', 'public.feedback', 'SELECT WITH GRANT OPTION') THEN
    RAISE EXCEPTION 'support role would have grantable SELECT on public.feedback';
  END IF;
  IF (SELECT relrowsecurity OR relforcerowsecurity FROM pg_catalog.pg_class WHERE oid = 'public.feedback'::regclass) THEN
    RAISE EXCEPTION 'public.feedback row security is enabled; unrestricted inbox visibility is not established';
  END IF;
  IF has_database_privilege('ornigami_support_reader', current_database(), 'CREATE') THEN
    RAISE EXCEPTION 'support role has database CREATE access';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_namespace AS schema
    WHERE schema.nspname NOT IN ('pg_catalog', 'information_schema')
      AND schema.nspname NOT LIKE 'pg_toast%' AND schema.nspname NOT LIKE 'pg_temp_%'
      AND has_schema_privilege('ornigami_support_reader', schema.oid, 'CREATE')
  ) THEN
    RAISE EXCEPTION 'support role has schema CREATE access';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS routine
    JOIN pg_catalog.pg_namespace AS schema ON schema.oid = routine.pronamespace
    WHERE routine.prosecdef
      AND schema.nspname NOT IN ('pg_catalog', 'information_schema')
      AND schema.nspname NOT LIKE 'pg_toast%'
      AND schema.nspname NOT LIKE 'pg_temp_%'
      AND has_function_privilege('ornigami_support_reader', routine.oid, 'EXECUTE')
  ) THEN
    RAISE EXCEPTION 'support role can execute a non-system SECURITY DEFINER routine; inspect routine exposure';
  END IF;
END
$permission_check$;

COMMIT;
