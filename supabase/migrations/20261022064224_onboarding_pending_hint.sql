BEGIN;
-- Use the authoritative getUser response already fetched by the proxy to avoid
-- progress queries for completed/exempt accounts. This hint is not a permission.
CREATE FUNCTION auth_private.sync_onboarding_pending_hint() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE owner_id uuid; pending boolean;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.completed_at IS NOT DISTINCT FROM OLD.completed_at THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN
    owner_id := OLD.user_id;
    pending := false;
  ELSE
    owner_id := NEW.user_id;
    pending := NEW.completed_at IS NULL;
  END IF;
  UPDATE auth.users SET raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
    || jsonb_build_object('onboarding_pending', pending), updated_at = now()
    WHERE id = owner_id;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
REVOKE ALL ON FUNCTION auth_private.sync_onboarding_pending_hint() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER sync_onboarding_pending_hint
  AFTER INSERT OR UPDATE OF completed_at OR DELETE ON public.onboarding_progress
  FOR EACH ROW EXECUTE FUNCTION auth_private.sync_onboarding_pending_hint();

-- Preserve any progress created between the initial migration and this one.
-- Accounts without progress are still exempt; preserve unrelated app metadata.
UPDATE auth.users u SET raw_app_meta_data = coalesce(u.raw_app_meta_data, '{}'::jsonb)
  || jsonb_build_object('onboarding_pending', p.completed_at IS NULL), updated_at = now()
  FROM public.onboarding_progress p WHERE p.user_id = u.id;
COMMIT;
