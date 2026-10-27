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
-- Literal searches, display-name ordering, stable pages and service-only access.
DO $$ DECLARE a uuid := '74000256-0000-4000-8000-000000000001'; b uuid := '74000256-0000-4000-8000-000000000002'; result jsonb; symbol text; n integer; BEGIN
 FOR n IN 1..30 LOOP
  INSERT INTO public.post_media(id,path,url,owner_id,upload_status,title,original_filename,uploaded_at)
  VALUES (('74000256-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
   a::text||'/'||('74000256-0000-4000-8000-'||lpad((n+100)::text,12,'0'))||'.webp',
   'https://test/list-256-'||n,a,'ready',case when n=1 then '   ' when n=2 then '' when n=3 then 'A title' else 'Z title' end,
   case when n=1 then 'B filename' when n=2 then null else 'original.png' end,
   case when n=2 then null else '2026-01-01'::timestamptz end);
 END LOOP;
 result := public.list_media_library(a,'',1,'title','active');
 ASSERT result->>'total'='30' AND jsonb_array_length(result->'assets')=24, 'Pagination count or size incorrect';
 ASSERT result->'assets'->0->>'title'='A title', 'Title should sort first';
 ASSERT result->'assets'->1->>'original_filename'='B filename', 'Blank title must use filename';
 ASSERT NOT (result->'assets'->0 ?| array['owner_id','content_sha256','search_text','display_name','position','path']), 'Private fields leaked';
 ASSERT result->'assets'->2->>'id'='74000256-0000-4000-8000-000000000004', 'Equal display names must sort by stable ID';
 result := public.list_media_library(a,'',2,'title','active');
 ASSERT jsonb_array_length(result->'assets')=6 AND result->'assets'->5->>'id'='74000256-0000-4000-8000-000000000002', 'Unknown names must sort last across pages';
 ASSERT public.list_media_library(a,'',3,'title','active')->'assets'='[]'::jsonb, 'Beyond last page must be empty';
 UPDATE public.post_media SET uploaded_at='2025-01-01' WHERE id='74000256-0000-4000-8000-000000000001';
 UPDATE public.post_media SET uploaded_at='2026-10-01' WHERE id='74000256-0000-4000-8000-000000000003';
 ASSERT public.list_media_library(a,'',1,'oldest','active')->'assets'->0->>'id'='74000256-0000-4000-8000-000000000001', 'Oldest date ordering incorrect';
 ASSERT public.list_media_library(a,'',1,'newest','active')->'assets'->0->>'id'='74000256-0000-4000-8000-000000000003', 'Newest date ordering incorrect';
 ASSERT public.list_media_library(a,'',2,'newest','active')->'assets'->5->>'id'='74000256-0000-4000-8000-000000000002', 'Unknown dates must sort last';
 FOREACH symbol IN ARRAY array['%','_',chr(92),'*'] LOOP
  UPDATE public.post_media SET description='literal'||symbol||'token' WHERE id='74000256-0000-4000-8000-000000000003';
  result := public.list_media_library(a,symbol,1,'newest','active');
  ASSERT result->>'total'='1' AND result->'assets'->0->>'id'='74000256-0000-4000-8000-000000000003', 'Search interpreted literal as wildcard';
 END LOOP;
 ASSERT public.list_media_library(a,'LITERAL',1,'oldest','active')->>'total'='1', 'Search must be case insensitive';
 ASSERT public.list_media_library(b,'',1,'title','active')->>'total'='0', 'Cross-owner list exposure';
 UPDATE public.post_media SET archived_at=now() WHERE id='74000256-0000-4000-8000-000000000003';
 ASSERT public.list_media_library(a,'',1,'title','archived')->>'total'='1', 'Archive filter incorrect';
 ASSERT public.list_media_library(a,'',1,'title','active')->>'total'='29', 'Active filter includes archive';
 BEGIN
  PERFORM public.list_media_library(a,'',0,'title','active');
  RAISE EXCEPTION 'Invalid page allowed';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
END $$;
RESET ROLE;
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 BEGIN
  PERFORM public.list_media_library('74000256-0000-4000-8000-000000000001');
  RAISE EXCEPTION 'List RPC exposed to authenticated callers';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
ROLLBACK;
