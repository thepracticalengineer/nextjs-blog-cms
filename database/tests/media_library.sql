-- Disposable local database only. All fixtures roll back.
BEGIN;
INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES
 ('74000256-0000-4000-8000-000000000001','media256-a@example.test','{"full_name":"Media A"}'),
 ('74000256-0000-4000-8000-000000000002','media256-b@example.test','{"full_name":"Media B"}');
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 BEGIN
  PERFORM public.mutate_media_library('74000256-0000-4000-8000-000000000001',gen_random_uuid());
  RAISE EXCEPTION 'Library RPC exposed';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SET LOCAL ROLE service_role;
DO $$ DECLARE a uuid := '74000256-0000-4000-8000-000000000001'; b uuid := '74000256-0000-4000-8000-000000000002'; r jsonb; m public.post_media; stamp timestamptz; BEGIN
 r := public.reserve_post_media(a,repeat('a',64),a::text||'/74000256-0000-4000-8000-000000000010.webp','https://test/256-a');
 SELECT * INTO m FROM public.post_media WHERE path = r->>'path';
 ASSERT m.upload_status = 'pending', 'Reservations must not appear ready';
 ASSERT public.mutate_media_library(a,m.id,'{}',true) IS NULL, 'Pending image selectable';
 ASSERT NOT public.complete_post_media(b,m.path,'wrong.png',10,10,100,true), 'Cross-owner completion allowed';
 ASSERT public.complete_post_media(a,m.path,'first.png',10,20,100,false), 'Completion failed';
 SELECT * INTO m FROM public.post_media WHERE id = m.id;
 stamp := m.uploaded_at;
 ASSERT m.upload_status = 'ready' AND NOT m.library_retained, 'Editor uploads must remain transient';
 ASSERT public.mutate_media_library(b,m.id,'{"title":"foreign"}',false) IS NULL, 'Foreign mutation allowed';
 PERFORM public.mutate_media_library(a,m.id,'{"title":"custom","alt_text":"description"}',false);
 ASSERT (SELECT library_retained AND NOT retained FROM public.post_media WHERE id=m.id), 'Metadata edit must preserve intentional library asset';
 PERFORM public.mutate_media_library(a,m.id,'{"archived":true}',false);
 ASSERT public.mutate_media_library(a,m.id,'{}',true) IS NULL, 'Archived selection allowed';
 PERFORM public.complete_post_media(a,m.path,'renamed.png',99,99,999,true);
 SELECT * INTO m FROM public.post_media WHERE id = m.id;
 ASSERT m.title = 'custom' AND m.original_filename = 'first.png' AND m.width = 10 AND m.uploaded_at = stamp, 'Duplicate overwrote stable metadata';
 ASSERT m.archived_at IS NOT NULL AND m.library_retained AND NOT m.retained, 'Archive/dedup lost retention or restored silently';
 UPDATE public.post_media SET created_at = now()-interval '8 days' WHERE id = m.id;
 ASSERT NOT EXISTS(SELECT 1 FROM public.claim_abandoned_post_media(100) WHERE id = m.id), 'Cleanup claimed library image';
 PERFORM public.mutate_media_library(a,m.id,'{"archived":false}',false);
 ASSERT public.mutate_media_library(a,m.id,'{}',true) IS NOT NULL, 'Restored image not selectable';
 UPDATE public.post_media SET state = 'deleting' WHERE id = m.id;
 ASSERT public.mutate_media_library(a,m.id,'{}',true) IS NULL, 'Claimed image selectable';
 ASSERT NOT public.complete_post_media(a,m.path,'retry.png',10,20,100,true), 'Completion revived cleanup tombstone';
END $$;
RESET ROLE;
ROLLBACK;
