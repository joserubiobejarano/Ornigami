-- Serialize first-workspace creation against invitation acceptance. Team
-- lifecycle code locks business rows before user rows, so this function locks
-- only the user row and performs workspace discovery without row locks.
CREATE OR REPLACE FUNCTION public.ensure_workspace_for_user(
  p_user_id UUID,
  p_business_name TEXT
)
RETURNS SETOF public.businesses
LANGUAGE plpgsql
AS $$
DECLARE
  v_business public.businesses%ROWTYPE;
BEGIN
  PERFORM 1 FROM public.users WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT b.* INTO v_business
  FROM public.businesses b
  WHERE b.owner_user_id = p_user_id
     OR EXISTS (
       SELECT 1 FROM public.business_members bm
       WHERE bm.business_id = b.id AND bm.user_id = p_user_id
     )
  ORDER BY b.created_at ASC, b.id ASC
  LIMIT 1;
  IF FOUND THEN
    RETURN NEXT v_business;
    RETURN;
  END IF;

  INSERT INTO public.businesses (owner_user_id, name)
  VALUES (p_user_id, COALESCE(p_business_name, ''))
  RETURNING * INTO v_business;

  RETURN NEXT v_business;
END;
$$;
