BEGIN;

-- Deliberately owner-executed: the public projection must remain readable while
-- private profiles are protected by RLS. Only explicitly listed public fields
-- belong here. Never add email, role, or account timestamps to this view.
CREATE VIEW public.public_author_profiles WITH (security_barrier = true) AS
SELECT id, full_name, avatar_url, bio, website,
       twitter_url, linkedin_url, github_url, instagram_url,
       facebook_url, youtube_url, tiktok_url
FROM public.profiles;
REVOKE ALL ON public.public_author_profiles FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.public_author_profiles TO anon, authenticated, service_role;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Profiles are publicly readable" ON public.profiles;
CREATE POLICY "Users can read own private profile"
  ON public.profiles FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = id);

-- Account role changes use the server-only service client. Column privileges
-- prevent clients from escalating their own role or modifying account email.
REVOKE ALL ON public.profiles FROM PUBLIC, anon, authenticated;
-- Anonymous SELECT has no matching RLS policy and returns zero rows. The
-- grant is required by existing post/taxonomy policies that check caller role.
GRANT SELECT ON public.profiles TO anon, authenticated;
GRANT UPDATE (full_name, avatar_url, bio, pronouns, company, location, website,
              twitter_url, linkedin_url, github_url, instagram_url,
              facebook_url, youtube_url, tiktok_url)
  ON public.profiles TO authenticated;

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = id)
  WITH CHECK ((SELECT auth.uid()) = id);

-- Administrative profile edits/deletes use the service client. Removing the
-- old self-referencing policies also avoids recursion during profile updates.
DROP POLICY IF EXISTS "Admins can update any profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can delete profiles" ON public.profiles;
NOTIFY pgrst, 'reload schema';
COMMIT;
