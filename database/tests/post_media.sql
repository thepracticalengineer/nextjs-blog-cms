-- Disposable/local database only. Fixtures and mutations are rolled back.
BEGIN;
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('74000000-0000-4000-8000-000000000001', 'media-author@example.test', '{"full_name":"Media Author"}'),
  ('74000000-0000-4000-8000-000000000002', 'media-other@example.test', '{"full_name":"Other Author"}');
INSERT INTO public.post_media(path, owner_id, url, created_at)
SELECT '74000000-0000-4000-8000-000000000001/74000000-0000-4000-8000-' || lpad(n::text, 12, '0') || '.webp',
  '74000000-0000-4000-8000-000000000001',
  'https://test.supabase.co/storage/v1/object/public/post-media/74000000-0000-4000-8000-000000000001/74000000-0000-4000-8000-' || lpad(n::text, 12, '0') || '.webp',
  CASE WHEN n = 5 THEN now() ELSE now() - interval '8 days' END
FROM generate_series(1, 5) n;
SELECT set_config('request.jwt.claim.sub', '74000000-0000-4000-8000-000000000002', true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  BEGIN PERFORM * FROM public.post_media; RAISE EXCEPTION 'Registry exposed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM public.claim_abandoned_post_media(); RAISE EXCEPTION 'Cleanup exposed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
-- Recovery may reference another author's public image without gaining storage access.
INSERT INTO public.post_working_copies(user_id, document_id, values, revision)
VALUES ('74000000-0000-4000-8000-000000000002', gen_random_uuid(),
  '{"content":"https://test.supabase.co/storage/v1/object/public/post-media/74000000-0000-4000-8000-000000000001/74000000-0000-4000-8000-000000000002.webp"}', gen_random_uuid());
RESET ROLE;
INSERT INTO public.posts(id, title, slug, cover_image, author_id) VALUES
  ('74000000-0000-4000-8000-000000000010', 'Media fixture', 'issue74-media-fixture',
   'https://test.supabase.co/storage/v1/object/public/post-media/74000000-0000-4000-8000-000000000001/74000000-0000-4000-8000-000000000001.webp',
   '74000000-0000-4000-8000-000000000001');
INSERT INTO public.posts(title, slug, content, author_id) VALUES
  ('Shared image fixture', 'issue74-shared-image',
   '{"type":"doc","content":[{"type":"image","attrs":{"src":"https://test.supabase.co/storage/v1/object/public/post-media/74000000-0000-4000-8000-000000000001/74000000-0000-4000-8000-000000000001%2Ewebp?version=1"}}]}',
   '74000000-0000-4000-8000-000000000002');
INSERT INTO public.posts(title, slug, content, author_id) VALUES
  ('Encoded URL fixture', 'issue74-encoded-url',
   '<img src="https://test.supabase.co/storage/v1/object/public/post%2Dmedia/74000000%2D0000%2D4000%2D8000%2D000000000001/74000000-0000-4000-8000-000000000003%2Ewebp">',
   '74000000-0000-4000-8000-000000000002');
-- Removing the original reference must not expose shared media to deletion.
UPDATE public.posts SET cover_image = null WHERE id = '74000000-0000-4000-8000-000000000010';
SET LOCAL ROLE service_role;
DO $$ DECLARE claimed integer; BEGIN
  SELECT count(*) INTO claimed FROM public.claim_abandoned_post_media(100);
  ASSERT claimed = 1, 'Only old never-referenced uploads may be claimed';
  ASSERT (SELECT count(*) FROM public.post_media WHERE retained) = 3, 'Post and recovery references must both retain media';
  ASSERT (SELECT state FROM public.post_media WHERE path LIKE '%000000000005.webp') = 'active', 'Grace period must protect recent uploads';
  SELECT count(*) INTO claimed FROM public.claim_abandoned_post_media(100);
  ASSERT claimed = 1, 'Interrupted cleanup must be retryable';
END $$;
RESET ROLE;
DO $$ BEGIN
  BEGIN
    UPDATE public.posts SET cover_image = 'https://test.supabase.co/storage/v1/object/public/post-media/74000000-0000-4000-8000-000000000001/74000000-0000-4000-8000-000000000004.webp'
    WHERE id = '74000000-0000-4000-8000-000000000010';
    RAISE EXCEPTION 'Save reused deleting image';
  EXCEPTION WHEN check_violation THEN NULL; END;
  ASSERT (SELECT cover_image FROM public.posts WHERE id = '74000000-0000-4000-8000-000000000010') IS NULL, 'Failed save must preserve prior content';
END $$;
UPDATE public.post_media SET state = 'deleted' WHERE state = 'deleting';
SELECT set_config('request.jwt.claim.sub', '74000000-0000-4000-8000-000000000002', true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  BEGIN
    INSERT INTO public.post_working_copies(user_id, document_id, values, revision)
    VALUES ('74000000-0000-4000-8000-000000000002', gen_random_uuid(),
      '{"cover_image":"https://test.supabase.co/storage/v1/object/public/post-media/74000000-0000-4000-8000-000000000001/74000000-0000-4000-8000-000000000004.webp"}', gen_random_uuid());
    RAISE EXCEPTION 'Recovery restored expired media';
  EXCEPTION WHEN check_violation THEN NULL; END;
END $$;
RESET ROLE;
-- Atomic writes must preserve cover metadata on create and update.
DO $$ DECLARE saved jsonb; stamp timestamptz; BEGIN
  saved := public.save_post_atomic('74000000-0000-4000-8000-000000000001', '{"title":"Alt metadata","slug":"issue74-alt-metadata","cover_image_alt":"Circuit board with labeled test points"}');
  ASSERT saved->'post'->>'cover_image_alt' = 'Circuit board with labeled test points', 'Atomic create dropped alt text';
  stamp := (saved->'post'->>'updated_at')::timestamptz;
  saved := public.save_post_atomic('74000000-0000-4000-8000-000000000001', '{"cover_image_alt":"Updated circuit board description"}',
    (saved->'post'->>'id')::uuid, stamp, 'draft');
  ASSERT saved->'post'->>'cover_image_alt' = 'Updated circuit board description', 'Atomic update dropped alt text';
END $$;
ROLLBACK;
