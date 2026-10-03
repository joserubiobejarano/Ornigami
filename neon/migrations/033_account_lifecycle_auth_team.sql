-- A00 canonical migration 033_account_lifecycle_auth_team.sql; deletion remains disabled until activation acceptance.
-- A11 reviewed shared contract owned by A04/A05/A02. Apply after migration 026.
-- This file is additive and registered by A00 for shared integration.
-- Account freeze takes billing-customer then billing-checkout-owner advisory
-- locks before its user lock. Auth token writers use the same order. Team
-- admission keeps the established business-before-user order and rechecks the
-- owner, actor, and invitee inside the mutating statement's transaction.

CREATE OR REPLACE FUNCTION public.auth_create_email_verification_token(
  p_user_id UUID, p_token_hash TEXT, p_callback_url TEXT
) RETURNS BOOLEAN LANGUAGE plpgsql AS $$
DECLARE changed INTEGER;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('billing-customer:' || p_user_id::TEXT, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended('billing-checkout-owner:' || p_user_id::TEXT, 0));
  PERFORM 1 FROM public.users WHERE id=p_user_id FOR UPDATE;
  IF NOT FOUND OR EXISTS (SELECT 1 FROM public.users WHERE id=p_user_id AND privacy_deletion_requested_at IS NOT NULL) THEN
    RETURN false;
  END IF;
  INSERT INTO public.email_verification_tokens(user_id,token_hash,expires_at,callback_url)
  VALUES(p_user_id,p_token_hash,now()+interval '24 hours',p_callback_url)
  ON CONFLICT(user_id) DO UPDATE SET token_hash=EXCLUDED.token_hash,
    expires_at=EXCLUDED.expires_at,callback_url=EXCLUDED.callback_url,created_at=now();
  GET DIAGNOSTICS changed=ROW_COUNT;
  RETURN changed=1;
END $$;

CREATE OR REPLACE FUNCTION public.auth_create_password_reset_token(
  p_user_id UUID, p_token_hash TEXT, p_callback_url TEXT
) RETURNS BOOLEAN LANGUAGE plpgsql AS $$
DECLARE changed INTEGER;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('billing-customer:' || p_user_id::TEXT, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended('billing-checkout-owner:' || p_user_id::TEXT, 0));
  PERFORM 1 FROM public.users WHERE id=p_user_id AND password_hash IS NOT NULL FOR UPDATE;
  IF NOT FOUND OR EXISTS (SELECT 1 FROM public.users WHERE id=p_user_id AND privacy_deletion_requested_at IS NOT NULL) THEN
    RETURN false;
  END IF;
  INSERT INTO public.password_reset_tokens(user_id,token_hash,expires_at,callback_url)
  VALUES(p_user_id,p_token_hash,now()+interval '1 hour',p_callback_url)
  ON CONFLICT(user_id) DO UPDATE SET token_hash=EXCLUDED.token_hash,
    expires_at=EXCLUDED.expires_at,callback_url=EXCLUDED.callback_url,created_at=now();
  GET DIAGNOSTICS changed=ROW_COUNT;
  RETURN changed=1;
END $$;

CREATE OR REPLACE FUNCTION public.auth_consume_email_verification_token(p_token_hash TEXT)
RETURNS TABLE(callback_url TEXT) LANGUAGE plpgsql AS $$
DECLARE v_user_id UUID; v_callback_url TEXT;
BEGIN
  SELECT user_id INTO v_user_id FROM public.email_verification_tokens
  WHERE token_hash=p_token_hash AND expires_at>now();
  IF NOT FOUND THEN RETURN; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('billing-customer:' || v_user_id::TEXT, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended('billing-checkout-owner:' || v_user_id::TEXT, 0));
  PERFORM 1 FROM public.users WHERE id=v_user_id FOR UPDATE;
  IF NOT FOUND OR EXISTS (SELECT 1 FROM public.users WHERE id=v_user_id AND privacy_deletion_requested_at IS NOT NULL) THEN
    RETURN;
  END IF;
  DELETE FROM public.email_verification_tokens WHERE user_id=v_user_id AND token_hash=p_token_hash AND expires_at>now()
    RETURNING email_verification_tokens.callback_url INTO v_callback_url;
  IF NOT FOUND THEN RETURN; END IF;
  UPDATE public.users SET email_verified=now(),updated_at=now() WHERE id=v_user_id AND privacy_deletion_requested_at IS NULL;
  IF NOT FOUND THEN RETURN; END IF;
  RETURN QUERY SELECT v_callback_url;
END $$;

CREATE OR REPLACE FUNCTION public.auth_consume_password_reset_token(p_token_hash TEXT,p_password_hash TEXT)
RETURNS TABLE(callback_url TEXT) LANGUAGE plpgsql AS $$
DECLARE v_user_id UUID; v_callback_url TEXT;
BEGIN
  SELECT user_id INTO v_user_id FROM public.password_reset_tokens
  WHERE token_hash=p_token_hash AND expires_at>now();
  IF NOT FOUND THEN RETURN; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('billing-customer:' || v_user_id::TEXT, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended('billing-checkout-owner:' || v_user_id::TEXT, 0));
  PERFORM 1 FROM public.users WHERE id=v_user_id AND password_hash IS NOT NULL FOR UPDATE;
  IF NOT FOUND OR EXISTS (SELECT 1 FROM public.users WHERE id=v_user_id AND privacy_deletion_requested_at IS NOT NULL) THEN
    RETURN;
  END IF;
  DELETE FROM public.password_reset_tokens WHERE user_id=v_user_id AND token_hash=p_token_hash AND expires_at>now()
    RETURNING password_reset_tokens.callback_url INTO v_callback_url;
  IF NOT FOUND THEN RETURN; END IF;
  UPDATE public.users SET password_hash=p_password_hash,auth_version=auth_version+1,updated_at=now()
  WHERE id=v_user_id AND privacy_deletion_requested_at IS NULL;
  IF NOT FOUND THEN RETURN; END IF;
  RETURN QUERY SELECT v_callback_url;
END $$;

CREATE OR REPLACE FUNCTION public.privacy_activation_assert_team_users(
  p_owner_user_id UUID,p_actor_user_id UUID,p_invitee_user_id UUID DEFAULT NULL
) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  PERFORM 1 FROM public.users
  WHERE id=ANY(ARRAY[p_owner_user_id,p_actor_user_id,p_invitee_user_id]::UUID[])
  ORDER BY id FOR UPDATE;
  IF p_owner_user_id IS NULL OR p_actor_user_id IS NULL
    OR NOT EXISTS(SELECT 1 FROM public.users WHERE id=p_owner_user_id)
    OR NOT EXISTS(SELECT 1 FROM public.users WHERE id=p_actor_user_id)
    OR EXISTS(SELECT 1 FROM public.users WHERE id=ANY(ARRAY[p_owner_user_id,p_actor_user_id,p_invitee_user_id]::UUID[])
      AND privacy_deletion_requested_at IS NOT NULL) THEN
    RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='privacy_account_frozen';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.privacy_activation_guard_team_row()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE v_business_id UUID; v_owner_id UUID; v_actor_id UUID; v_invitee_id UUID;
BEGIN
  IF current_setting('app.privacy_finalizer',true)='on' THEN
    IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;
  IF TG_TABLE_NAME='team_invitations' THEN
    v_business_id:=CASE WHEN TG_OP='DELETE' THEN OLD.business_id ELSE NEW.business_id END;
    v_actor_id:=CASE WHEN TG_OP='DELETE' THEN OLD.invited_by ELSE NEW.invited_by END;
    SELECT id INTO v_invitee_id FROM public.users WHERE lower(email)=lower(CASE WHEN TG_OP='DELETE' THEN OLD.email ELSE NEW.email END) LIMIT 1;
  ELSE
    v_business_id:=CASE WHEN TG_OP='DELETE' THEN OLD.business_id ELSE NEW.business_id END;
    v_actor_id:=CASE WHEN TG_OP='DELETE' THEN OLD.user_id ELSE NEW.user_id END;
  END IF;
  SELECT owner_user_id INTO v_owner_id FROM public.businesses WHERE id=v_business_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='workspace_unavailable'; END IF;
  IF TG_OP='DELETE' AND TG_TABLE_NAME='business_members' THEN
    PERFORM public.privacy_activation_assert_team_users(v_owner_id,v_owner_id,v_actor_id);
  ELSE
    PERFORM public.privacy_activation_assert_team_users(v_owner_id,v_actor_id,v_invitee_id);
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;

DROP TRIGGER IF EXISTS a11_team_invitation_lifecycle_guard ON public.team_invitations;
CREATE TRIGGER a11_team_invitation_lifecycle_guard BEFORE INSERT OR UPDATE OR DELETE ON public.team_invitations
FOR EACH ROW EXECUTE FUNCTION public.privacy_activation_guard_team_row();
DROP TRIGGER IF EXISTS a11_business_member_lifecycle_guard ON public.business_members;
CREATE TRIGGER a11_business_member_lifecycle_guard BEFORE INSERT OR UPDATE OR DELETE ON public.business_members
FOR EACH ROW EXECUTE FUNCTION public.privacy_activation_guard_team_row();

-- The email-provider failure cleanup path otherwise DELETE-locks an invitation
-- before its row trigger locks the business, reversing finalizer lock order.
CREATE OR REPLACE FUNCTION public.team_cleanup_invitation(p_invitation_id UUID,p_token_hash TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql AS $$
DECLARE v_business UUID; v_owner UUID; v_actor UUID; v_email TEXT; v_invitee UUID; v_changed INTEGER;
BEGIN
  SELECT i.business_id,i.invited_by,i.email INTO v_business,v_actor,v_email
    FROM public.team_invitations i WHERE i.id=p_invitation_id AND i.token_hash=p_token_hash AND i.status='pending';
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT owner_user_id INTO v_owner FROM public.businesses WHERE id=v_business;
  IF NOT FOUND THEN RETURN false; END IF;
  PERFORM 1 FROM public.businesses WHERE id=v_business FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT id INTO v_invitee FROM public.users WHERE lower(email)=lower(v_email) LIMIT 1;
  PERFORM public.privacy_activation_assert_team_users(v_owner,v_actor,v_invitee);
  DELETE FROM public.team_invitations WHERE id=p_invitation_id AND business_id=v_business
    AND token_hash=p_token_hash AND status='pending';
  GET DIAGNOSTICS v_changed=ROW_COUNT;
  RETURN v_changed=1;
END $$;

CREATE OR REPLACE FUNCTION public.privacy_activation_guard_business_row()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  PERFORM public.privacy_activation_assert_team_users(
    CASE WHEN TG_OP='UPDATE' THEN OLD.owner_user_id ELSE NEW.owner_user_id END,
    CASE WHEN TG_OP='UPDATE' THEN OLD.owner_user_id ELSE NEW.owner_user_id END,
    CASE WHEN TG_OP='UPDATE' THEN NEW.owner_user_id ELSE NULL END
  );
  PERFORM public.privacy_activation_assert_team_users(NEW.owner_user_id,NEW.owner_user_id,NULL);
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS a11_business_lifecycle_guard ON public.businesses;
CREATE TRIGGER a11_business_lifecycle_guard BEFORE INSERT OR UPDATE ON public.businesses
FOR EACH ROW EXECUTE FUNCTION public.privacy_activation_guard_business_row();

CREATE OR REPLACE FUNCTION public.privacy_activation_guard_agent_row()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE v_owner UUID;
BEGIN
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  SELECT owner_user_id INTO v_owner FROM public.businesses WHERE id=NEW.business_id FOR UPDATE;
  PERFORM public.privacy_activation_assert_team_users(v_owner,v_owner,NULL);
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS a11_business_agent_lifecycle_guard ON public.business_agents;
CREATE TRIGGER a11_business_agent_lifecycle_guard BEFORE INSERT OR UPDATE ON public.business_agents
FOR EACH ROW EXECUTE FUNCTION public.privacy_activation_guard_agent_row();

CREATE OR REPLACE FUNCTION public.privacy_ensure_business_defaults(
  p_business_id UUID,p_actor_user_id UUID,p_owner_user_id UUID,p_clear_placeholder BOOLEAN
) RETURNS BOOLEAN LANGUAGE plpgsql AS $$
DECLARE v_owner UUID; v_actor_frozen BOOLEAN; v_owner_frozen BOOLEAN;
BEGIN
  SELECT owner_user_id INTO v_owner FROM public.businesses WHERE id=p_business_id FOR UPDATE;
  IF NOT FOUND OR v_owner<>p_owner_user_id THEN RETURN false; END IF;
  PERFORM 1 FROM public.users WHERE id=ANY(ARRAY[p_actor_user_id,p_owner_user_id]::UUID[]) ORDER BY id FOR UPDATE;
  SELECT COALESCE(bool_or(id=p_actor_user_id AND privacy_deletion_requested_at IS NOT NULL),true),
    COALESCE(bool_or(id=p_owner_user_id AND privacy_deletion_requested_at IS NOT NULL),true)
    INTO v_actor_frozen,v_owner_frozen FROM public.users WHERE id=ANY(ARRAY[p_actor_user_id,p_owner_user_id]::UUID[]);
  IF v_actor_frozen OR v_owner_frozen THEN RETURN false; END IF;
  IF p_clear_placeholder THEN UPDATE public.businesses SET name='',updated_at=now() WHERE id=p_business_id; END IF;
  INSERT INTO public.business_members(business_id,user_id,role) VALUES(p_business_id,p_owner_user_id,'owner')
  ON CONFLICT(business_id,user_id) DO NOTHING;
  INSERT INTO public.business_agents(business_id,agent_id,status,activated_at,deactivated_at)
  VALUES (p_business_id,'review_replies','inactive',NULL,now()),
         (p_business_id,'review_booster','inactive',NULL,now()),
         (p_business_id,'speed_to_lead','inactive',NULL,now())
  ON CONFLICT(business_id,agent_id) DO NOTHING;
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.ensure_workspace_for_user(p_user_id UUID,p_business_name TEXT)
RETURNS SETOF public.businesses LANGUAGE plpgsql AS $$
DECLARE v_business public.businesses%ROWTYPE;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('billing-customer:' || p_user_id::TEXT,0));
  PERFORM pg_advisory_xact_lock(hashtextextended('billing-checkout-owner:' || p_user_id::TEXT,0));
  PERFORM 1 FROM public.users WHERE id=p_user_id AND privacy_deletion_requested_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  IF EXISTS (
    SELECT 1 FROM public.business_members bm
    JOIN public.businesses b ON b.id=bm.business_id
    JOIN public.users owner ON owner.id=b.owner_user_id
    WHERE bm.user_id=p_user_id AND owner.privacy_deletion_requested_at IS NOT NULL
  ) THEN RETURN; END IF;
  SELECT b.* INTO v_business FROM public.businesses b
  JOIN public.users owner ON owner.id=b.owner_user_id AND owner.privacy_deletion_requested_at IS NULL
  WHERE b.owner_user_id=p_user_id OR EXISTS(SELECT 1 FROM public.business_members bm WHERE bm.business_id=b.id AND bm.user_id=p_user_id)
  ORDER BY b.created_at ASC,b.id ASC LIMIT 1;
  IF FOUND THEN RETURN NEXT v_business; RETURN; END IF;
  INSERT INTO public.businesses(owner_user_id,name) VALUES(p_user_id,COALESCE(p_business_name,'')) RETURNING * INTO v_business;
  RETURN NEXT v_business;
END $$;
