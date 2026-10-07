-- Run against a migrated disposable/local database:
-- psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f database/tests/public_author_profiles.sql
-- Fixtures and updates are rolled back. Never run against production.
BEGIN;
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('61000000-0000-4000-8000-000000000001', 'author-one@example.test', '{"full_name":"Same Name"}'),
  ('61000000-0000-4000-8000-000000000002', 'author-two@example.test', '{"full_name":"Same Name"}'),
  ('61000000-0000-4000-8000-000000000003', 'admin@example.test', '{"full_name":"Admin"}');
UPDATE public.profiles SET role = 'admin' WHERE id = '61000000-0000-4000-8000-000000000003';
INSERT INTO public.posts (id, title, slug, status, author_id) VALUES
  ('61000000-0000-4000-8000-000000000010', 'Public fixture', 'issue61-public-fixture', 'published', '61000000-0000-4000-8000-000000000001'),
  ('61000000-0000-4000-8000-000000000011', 'Draft fixture', 'issue61-draft-fixture', 'draft', '61000000-0000-4000-8000-000000000001');

SET LOCAL ROLE anon;
DO $$
DECLARE total integer;
BEGIN
  SELECT count(*) INTO total FROM public.public_author_profiles
    WHERE id IN ('61000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000002');
  ASSERT total = 2, 'Public view must expose separate authors with identical names';
  ASSERT (SELECT count(*) FROM public.posts WHERE id IN ('61000000-0000-4000-8000-000000000010', '61000000-0000-4000-8000-000000000011')) = 1,
    'Private-profile policies must preserve public post access and hide drafts';
  ASSERT NOT EXISTS (SELECT FROM information_schema.columns WHERE table_schema = 'public'
    AND table_name = 'public_author_profiles' AND column_name IN ('email','role','created_at','updated_at')),
    'Public view must never expose private fields';
  ASSERT (SELECT count(*) FROM public.profiles) = 0, 'Anonymous callers must see no private-profile rows';
  BEGIN
    UPDATE public.public_author_profiles SET full_name = 'Changed';
    RAISE EXCEPTION 'Anonymous view mutation succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '61000000-0000-4000-8000-000000000001', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE total integer;
BEGIN
  SELECT count(*) INTO total FROM public.profiles;
  ASSERT total = 1, 'Authenticated author must read only own private profile';
  ASSERT (SELECT email FROM public.profiles) = 'author-one@example.test', 'Own account email must remain readable';
  UPDATE public.profiles SET bio = 'Own biography' WHERE id = '61000000-0000-4000-8000-000000000001';
  ASSERT FOUND, 'Own public fields must remain editable';
  UPDATE public.profiles SET bio = 'Other biography' WHERE id = '61000000-0000-4000-8000-000000000002';
  ASSERT NOT FOUND, 'Cross-user profile update must be denied';
  BEGIN
    UPDATE public.profiles SET role = 'admin' WHERE id = '61000000-0000-4000-8000-000000000001';
    RAISE EXCEPTION 'Client role escalation succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    UPDATE public.profiles SET email = 'changed@example.test' WHERE id = '61000000-0000-4000-8000-000000000001';
    RAISE EXCEPTION 'Client account-email mutation succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '61000000-0000-4000-8000-000000000003', true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  ASSERT (SELECT role FROM public.profiles) = 'admin', 'Existing admin role checks must read the caller role without recursive RLS';
END $$;
RESET ROLE;
SET LOCAL ROLE service_role;
DO $$
BEGIN
  ASSERT (SELECT count(*) FROM public.profiles WHERE id::text LIKE '61000000-%') = 3,
    'Server admin queries must retain private-profile access';
  UPDATE public.profiles SET role = 'admin' WHERE id = '61000000-0000-4000-8000-000000000002';
  ASSERT FOUND, 'Server admin role updates must remain available';
END $$;
RESET ROLE;
ROLLBACK;
