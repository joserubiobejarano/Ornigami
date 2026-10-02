-- A08 proposal only. Do not apply as part of the isolated route implementation.
-- One durable Google location selection per business; discovery never inserts here.
-- Rotate connection_version only when OAuth credentials are replaced. Token refresh
-- must preserve this value. A location row records the credential generation whose
-- provider response validated it; legacy rows remain NULL until a fresh discovery.
ALTER TABLE public.gbp_connections
  ADD COLUMN IF NOT EXISTS connection_version UUID NOT NULL DEFAULT gen_random_uuid();

ALTER TABLE public.gbp_locations
  ADD COLUMN IF NOT EXISTS connection_version UUID;

CREATE TABLE public.business_google_locations (
  business_id UUID PRIMARY KEY
    REFERENCES public.businesses (id) ON DELETE CASCADE,
  location_id UUID NOT NULL
    REFERENCES public.gbp_locations (id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX business_google_locations_location_id_idx
  ON public.business_google_locations (location_id);

-- Keep a selected location within the owning user's existing Google cache.
-- Runtime routes also validate owner and connected state before use.
CREATE OR REPLACE FUNCTION public.enforce_business_google_location_owner()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.businesses b
    INNER JOIN public.gbp_locations l ON l.id = NEW.location_id
    INNER JOIN public.gbp_connections c ON c.user_id = b.owner_user_id
    WHERE b.id = NEW.business_id
      AND b.owner_user_id = l.user_id
      AND l.connected IS TRUE
      AND l.connection_version = c.connection_version
  ) THEN
    RAISE EXCEPTION 'Selected Google location must belong to the business owner and be connected';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS business_google_locations_owner_check ON public.business_google_locations;
CREATE TRIGGER business_google_locations_owner_check
BEFORE INSERT OR UPDATE OF business_id, location_id
ON public.business_google_locations
FOR EACH ROW EXECUTE FUNCTION public.enforce_business_google_location_owner();

-- Integration review must decide whether deleting/disconnecting a provider location
-- should clear its selection or preserve it for recovery. The FK cascades on deletion;
-- disconnect alone leaves the mapping but runtime selected-location reads fail closed.
