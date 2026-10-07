-- Disposable/local database only. Fixtures and mutations are rolled back.
BEGIN;
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('68000000-0000-4000-8000-000000000001', 'draft-author@example.test', '{"full_name":"Draft Author"}'),
  ('68000000-0000-4000-8000-000000000002', 'other-author@example.test', '{"full_name":"Other Author"}'),
  ('68000000-0000-4000-8000-000000000003', 'draft-admin@example.test', '{"full_name":"Draft Admin"}');
UPDATE public.profiles SET role = 'admin' WHERE id = '68000000-0000-4000-8000-000000000003';
INSERT INTO public.posts (id, title, slug, content, status, author_id) VALUES
  ('68000000-0000-4000-8000-000000000010', 'Published fixture', 'issue68-published-fixture', 'Unchanged live content', 'published', '68000000-0000-4000-8000-000000000001');
SELECT set_config('request.jwt.claim.sub', '68000000-0000-4000-8000-000000000001', true);
SET LOCAL ROLE authenticated;
INSERT INTO public.post_working_copies (user_id, document_id, post_id, values, revision) VALUES
  ('68000000-0000-4000-8000-000000000001', '68000000-0000-4000-8000-000000000010', '68000000-0000-4000-8000-000000000010', '{"content":"Private working copy"}', '68000000-0000-4000-8000-000000000020'),
  ('68000000-0000-4000-8000-000000000001', '68000000-0000-4000-8000-000000000011', null, '{"content":"New draft"}', '68000000-0000-4000-8000-000000000020');
DO $$
BEGIN
  ASSERT (SELECT content FROM public.posts WHERE id = '68000000-0000-4000-8000-000000000010') = 'Unchanged live content', 'Autosave must never change published content';
  UPDATE public.post_working_copies SET values = '{"content":"Winning tab"}', revision = '68000000-0000-4000-8000-000000000021'
    WHERE document_id = '68000000-0000-4000-8000-000000000010' AND revision = '68000000-0000-4000-8000-000000000020';
  ASSERT FOUND, 'Current revision must save';
  UPDATE public.post_working_copies SET values = '{"content":"Stale tab"}'
    WHERE document_id = '68000000-0000-4000-8000-000000000010' AND revision = '68000000-0000-4000-8000-000000000020';
  ASSERT NOT FOUND, 'Stale revision must not overwrite newer text';
  DELETE FROM public.post_working_copies WHERE document_id = '68000000-0000-4000-8000-000000000010' AND revision = '68000000-0000-4000-8000-000000000020';
  ASSERT NOT FOUND, 'Stale cleanup must preserve newer copy';
  BEGIN
    UPDATE public.post_working_copies SET user_id = '68000000-0000-4000-8000-000000000002';
    RAISE EXCEPTION 'Working-copy owner reassignment succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '68000000-0000-4000-8000-000000000002', true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  ASSERT (SELECT count(*) FROM public.post_working_copies WHERE user_id = '68000000-0000-4000-8000-000000000001') = 0, 'Other authors must not read recovery';
  UPDATE public.post_working_copies SET values = '{}' WHERE user_id = '68000000-0000-4000-8000-000000000001';
  ASSERT NOT FOUND, 'Other authors must not modify recovery';
  BEGIN
    INSERT INTO public.post_working_copies (user_id, document_id, post_id, values, revision) VALUES
      ('68000000-0000-4000-8000-000000000002', '68000000-0000-4000-8000-000000000010', '68000000-0000-4000-8000-000000000010', '{}', gen_random_uuid());
    RAISE EXCEPTION 'Other-author post working-copy insert succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '68000000-0000-4000-8000-000000000003', true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  ASSERT (SELECT count(*) FROM public.post_working_copies WHERE user_id = '68000000-0000-4000-8000-000000000001') = 0, 'Admins must not read another editor''s private recovery';
END $$;
INSERT INTO public.post_working_copies (user_id, document_id, post_id, values, revision) VALUES
  ('68000000-0000-4000-8000-000000000003', '68000000-0000-4000-8000-000000000010', '68000000-0000-4000-8000-000000000010', '{"content":"Admin working copy"}', gen_random_uuid());
RESET ROLE;
SET LOCAL ROLE anon;
DO $$
BEGIN
  BEGIN
    PERFORM * FROM public.post_working_copies;
    RAISE EXCEPTION 'Anonymous draft access succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
RESET ROLE;
ROLLBACK;
