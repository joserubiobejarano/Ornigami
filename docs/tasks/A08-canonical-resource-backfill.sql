-- A08 integration proposal only. Review the candidate output before running against
-- a shared database. This is intentionally not part of an automatic deployment.
-- It upgrades only legacy locations/{id} review rows whose business has an explicit
-- selected canonical account/location and whose owner's connected GBP cache has one
-- unambiguous account for that location id.
-- Running as written is a dry run and rolls back. Review the complete candidate
-- result, including ambiguous and eligible rows. To apply deliberately, replace the
-- final ROLLBACK with COMMIT after reviewing the output in the intended environment.

BEGIN;

CREATE TEMP TABLE a08_review_location_backfill_candidates ON COMMIT DROP AS
SELECT
  r.id AS review_id,
  r.business_id,
  r.google_review_id,
  r.location_name AS old_location_name,
  selected_location.location_name AS canonical_location_name,
  cache_count.matches AS owner_cache_matches
FROM public.reviews r
INNER JOIN public.businesses b ON b.id = r.business_id
INNER JOIN public.business_google_locations selection ON selection.business_id = b.id
INNER JOIN public.gbp_locations selected_location
  ON selected_location.id = selection.location_id
  AND selected_location.user_id = b.owner_user_id
  AND selected_location.connected IS TRUE
INNER JOIN public.gbp_connections connection ON connection.user_id = b.owner_user_id
  AND selected_location.connection_version = connection.connection_version
CROSS JOIN LATERAL (
  SELECT count(*)::integer AS matches
  FROM public.gbp_locations cached
  WHERE cached.user_id = b.owner_user_id
    AND cached.connected IS TRUE
    AND cached.connection_version = connection.connection_version
    AND cached.location_name ~ '^accounts/[A-Za-z0-9_-]+/locations/[A-Za-z0-9_-]+$'
    AND substring(cached.location_name FROM '^accounts/[A-Za-z0-9_-]+/locations/([A-Za-z0-9_-]+)$')
      = substring(r.location_name FROM '^locations/([A-Za-z0-9_-]+)$')
) cache_count
WHERE r.location_name ~ '^locations/[A-Za-z0-9_-]+$'
  AND r.location_name = 'locations/' || substring(selected_location.location_name FROM '^accounts/[A-Za-z0-9_-]+/locations/([A-Za-z0-9_-]+)$');

-- Review every candidate before deciding whether to apply. Rows with multiple
-- matching account resources stay unchanged because the old resource omitted account identity.
SELECT * FROM a08_review_location_backfill_candidates
ORDER BY business_id, review_id;

UPDATE public.reviews r
SET location_name = candidate.canonical_location_name,
    updated_at = now()
FROM a08_review_location_backfill_candidates candidate
WHERE r.id = candidate.review_id
  AND candidate.owner_cache_matches = 1
  AND r.location_name = candidate.old_location_name;

ROLLBACK;
