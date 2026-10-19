-- Run only against a migrated disposable database. All mutations roll back.
BEGIN;
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
 ('74000168-0000-4000-8000-000000000001', 'media168-a@example.test', '{"full_name":"Media A"}'),
 ('74000168-0000-4000-8000-000000000002', 'media168-b@example.test', '{"full_name":"Media B"}');
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 BEGIN
  PERFORM public.reserve_post_media('74000168-0000-4000-8000-000000000001', repeat('a',64), '', '');
  RAISE EXCEPTION 'Reservation exposed';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SET LOCAL ROLE service_role;
DO $$ DECLARE first jsonb; second jsonb; other jsonb; renewed jsonb; BEGIN
 first := public.reserve_post_media('74000168-0000-4000-8000-000000000001', repeat('a',64),
  '74000168-0000-4000-8000-000000000001/74000168-0000-4000-8000-000000000010.webp', 'https://test/first');
 UPDATE public.post_media SET created_at = now() - interval '8 days' WHERE path = first->>'path';
 second := public.reserve_post_media('74000168-0000-4000-8000-000000000001', repeat('a',64),
  '74000168-0000-4000-8000-000000000001/74000168-0000-4000-8000-000000000011.webp', 'https://test/second');
 ASSERT first = second, 'Identical owner/content must reuse one reservation';
 ASSERT (SELECT created_at > now() - interval '1 minute' FROM public.post_media WHERE path = first->>'path'), 'Reuse must refresh grace period';
 ASSERT NOT EXISTS(SELECT 1 FROM public.claim_abandoned_post_media(100) WHERE path = first->>'path'), 'Cleanup claimed freshly reused image';
 other := public.reserve_post_media('74000168-0000-4000-8000-000000000002', repeat('a',64),
  '74000168-0000-4000-8000-000000000002/74000168-0000-4000-8000-000000000010.webp', 'https://test/other');
 ASSERT other <> first, 'Cross-owner content must never share private lookup results';
 UPDATE public.post_media SET state = 'deleting' WHERE path = first->>'path';
 renewed := public.reserve_post_media('74000168-0000-4000-8000-000000000001', repeat('a',64),
  '74000168-0000-4000-8000-000000000001/74000168-0000-4000-8000-000000000012.webp', 'https://test/renewed');
 ASSERT renewed <> first, 'Deleting objects must never be revived';
 ASSERT (SELECT state = 'deleting' FROM public.post_media WHERE path = first->>'path'), 'Old tombstone was changed';
 BEGIN
  PERFORM public.reserve_post_media('74000168-0000-4000-8000-000000000001', repeat('b',64),
   '74000168-0000-4000-8000-000000000002/74000168-0000-4000-8000-000000000013.webp', 'https://test/bad');
  RAISE EXCEPTION 'Mismatched owner path accepted';
 EXCEPTION WHEN check_violation THEN NULL; END;
END $$;
RESET ROLE;
ROLLBACK;
