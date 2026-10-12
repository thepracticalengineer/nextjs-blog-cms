BEGIN;
-- Not exposed through PostgREST. No caller-supplied user ID; enrollment comes
-- from Auth's authoritative table, so pre-enrollment JWTs cannot bypass MFA.
CREATE SCHEMA IF NOT EXISTS auth_private;
REVOKE ALL ON SCHEMA auth_private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA auth_private TO authenticated;
CREATE FUNCTION auth_private.has_required_assurance() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT auth.uid() IS NOT NULL AND (
    (auth.jwt()->>'aal') = 'aal2'
    OR NOT EXISTS (
      SELECT 1 FROM auth.mfa_factors
      WHERE user_id = auth.uid() AND status = 'verified'
    )
  );
$$;
REVOKE ALL ON FUNCTION auth_private.has_required_assurance() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION auth_private.has_required_assurance() TO authenticated;

-- Restrictive policies AND with the existing ownership/role policies. They do
-- not grant access, change ownership rules, or affect service-only capabilities.
DO $$
DECLARE relation_name text;
BEGIN
  FOREACH relation_name IN ARRAY ARRAY[
    'profiles', 'api_keys', 'llm_provider_keys', 'ai_books', 'ai_chats',
    'ai_messages', 'ai_generated_posts', 'post_working_copies'
  ] LOOP
    EXECUTE format('CREATE POLICY "MFA required for private access" ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING ((SELECT auth_private.has_required_assurance())) WITH CHECK ((SELECT auth_private.has_required_assurance()))', relation_name);
  END LOOP;
  FOREACH relation_name IN ARRAY ARRAY['posts', 'post_tags', 'comments', 'categories', 'tags', 'post_slug_routes'] LOOP
    EXECUTE format('CREATE POLICY "MFA required for insert" ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK ((SELECT auth_private.has_required_assurance()))', relation_name);
    EXECUTE format('CREATE POLICY "MFA required for update" ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated USING ((SELECT auth_private.has_required_assurance())) WITH CHECK ((SELECT auth_private.has_required_assurance()))', relation_name);
    EXECUTE format('CREATE POLICY "MFA required for delete" ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated USING ((SELECT auth_private.has_required_assurance()))', relation_name);
  END LOOP;
END $$;

-- Public reads remain available even to an enrolled AAL1 session. Drafts and
-- their tag relationships do not acquire a public-read exception.
CREATE POLICY "MFA required for private posts" ON public.posts AS RESTRICTIVE
FOR SELECT TO authenticated
USING (status = 'published' OR (SELECT auth_private.has_required_assurance()));
CREATE POLICY "MFA required for private post tags" ON public.post_tags AS RESTRICTIVE
FOR SELECT TO authenticated
USING ((SELECT auth_private.has_required_assurance()) OR EXISTS (
  SELECT 1 FROM public.posts WHERE id = post_id AND status = 'published'
));

-- Authenticated object metadata and mutations are private operations; public
-- avatar/post-media URLs continue to use the public buckets' download path.
CREATE POLICY "MFA required for storage access" ON storage.objects AS RESTRICTIVE
FOR ALL TO authenticated
USING ((SELECT auth_private.has_required_assurance()))
WITH CHECK ((SELECT auth_private.has_required_assurance()));

-- public_author_profiles deliberately remains an owner-executed limited view.
-- Recovery grants, post-media registry, creation receipts and newsletter tables
-- retain their service-only permissions. Service-role callers must use the app
-- guard (or their separate cron/webhook/API-key capability) before accessing them.
NOTIFY pgrst, 'reload schema';
COMMIT;
