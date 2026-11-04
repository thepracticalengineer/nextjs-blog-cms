-- Run only against an isolated migrated database. All fixtures roll back.
BEGIN;
INSERT INTO auth.users (id,email) VALUES
 ('29000000-0000-4000-8000-000000000001','revisions-admin@example.test'),
 ('29000000-0000-4000-8000-000000000002','revisions-author@example.test'),
 ('29000000-0000-4000-8000-000000000003','revisions-second-admin@example.test');
UPDATE public.profiles SET role='admin', full_name='Revision Admin' WHERE id='29000000-0000-4000-8000-000000000001';
UPDATE public.profiles SET role='admin', full_name='Second Admin' WHERE id='29000000-0000-4000-8000-000000000003';
SELECT set_config('request.jwt.claims','{"sub":"29000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}',true);
SET LOCAL ROLE authenticated;
DO $$ DECLARE
 v1 jsonb := '{"title":"History","slug":"revisions-page","seo_title":"First SEO","seo_description":"","document":{"version":2,"content":{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"First live words"}]}]}}}';
 v2 jsonb; v3 jsonb; page jsonb; first_revision uuid; live_revision uuid; restored jsonb; listed jsonb; other jsonb;
BEGIN
 page := public.write_page_atomic('create','rev-create',v1)->'page';
 first_revision := (page->>'revision')::uuid;
 ASSERT (SELECT operation='create' AND created_by='29000000-0000-4000-8000-000000000001' AND document=v1->'document' AND status='draft'
   FROM public.page_revisions WHERE revision=first_revision), 'Create revision not recorded with author';
 page := public.write_page_atomic('publish','rev-publish',NULL,(page->>'id')::uuid,first_revision,true)->'page';
 live_revision := (page->>'revision')::uuid;
 ASSERT (SELECT operation='publish' AND status='published' FROM public.page_revisions WHERE revision=live_revision);

 -- Newer working draft with a changed URL and content; the snapshot stays on v1.
 v2 := jsonb_set(jsonb_set(v1,'{slug}','"revisions-renamed"'),'{document,content,content,0,content,0,text}','"Second draft words"');
 page := public.write_page_atomic('save','rev-save',v2,(page->>'id')::uuid,live_revision)->'page';
 ASSERT (SELECT count(*) FROM public.page_revisions WHERE page_id=(page->>'id')::uuid)=3, 'Every write must append one revision';

 -- Stale restore is rejected: it cannot overwrite a newer working copy.
 BEGIN
   PERFORM public.write_page_atomic('restore','rev-stale',NULL,(page->>'id')::uuid,live_revision,false,false,first_revision);
   RAISE EXCEPTION 'Stale restore accepted';
 EXCEPTION WHEN raise_exception THEN ASSERT SQLERRM='PAGE_STALE'; END;
 -- Restore requires a source and refuses values.
 BEGIN
   PERFORM public.write_page_atomic('restore','rev-no-source',NULL,(page->>'id')::uuid,(page->>'revision')::uuid);
   RAISE EXCEPTION 'Restore without source accepted';
 EXCEPTION WHEN check_violation THEN ASSERT SQLERRM='PAGE_INVALID_INPUT'; END;
 BEGIN
   PERFORM public.write_page_atomic('save','rev-save-source',v1,(page->>'id')::uuid,(page->>'revision')::uuid,false,false,first_revision);
   RAISE EXCEPTION 'Save with source accepted';
 EXCEPTION WHEN check_violation THEN ASSERT SQLERRM='PAGE_INVALID_INPUT'; END;
 BEGIN
   PERFORM public.write_page_atomic('restore','rev-values',v1,(page->>'id')::uuid,(page->>'revision')::uuid,false,false,first_revision);
   RAISE EXCEPTION 'Restore with values accepted';
 EXCEPTION WHEN check_violation THEN ASSERT SQLERRM='PAGE_INVALID_INPUT'; END;

 -- A revision from another page is never restorable here.
 other := public.write_page_atomic('create','rev-other',jsonb_set(v1,'{slug}','"revisions-other"'))->'page';
 BEGIN
   PERFORM public.write_page_atomic('restore','rev-foreign',NULL,(page->>'id')::uuid,(page->>'revision')::uuid,false,false,(other->>'revision')::uuid);
   RAISE EXCEPTION 'Foreign revision restored';
 EXCEPTION WHEN no_data_found THEN ASSERT SQLERRM='PAGE_REVISION_NOT_FOUND'; END;

 -- Restoring the first revision changes the working copy only.
 restored := public.write_page_atomic('restore','rev-restore',NULL,(page->>'id')::uuid,(page->>'revision')::uuid,false,false,first_revision);
 ASSERT restored->>'replayed'='false';
 ASSERT restored->'page'->>'slug'='revisions-page' AND restored->'page'->'document'=v1->'document', 'Restored content mismatch';
 ASSERT restored->'page'->>'status'='published', 'Restore changed publication status';
 ASSERT restored->'page'->>'revision' <> page->>'revision', 'Restore must produce a new revision';
 ASSERT (SELECT revision=live_revision FROM public.page_snapshots WHERE page_id=(page->>'id')::uuid), 'Restore changed the live snapshot';
 ASSERT (SELECT operation='restore' AND restored_from=first_revision FROM public.page_revisions WHERE revision=(restored->'page'->>'revision')::uuid);
 -- The old draft is still in history and can be restored back.
 ASSERT EXISTS (SELECT FROM public.page_revisions WHERE page_id=(page->>'id')::uuid AND slug='revisions-renamed');
 -- Exact retry replays; a changed source under the same key conflicts.
 ASSERT public.write_page_atomic('restore','rev-restore',NULL,(page->>'id')::uuid,(page->>'revision')::uuid,false,false,first_revision)->>'replayed'='true';
 BEGIN
   PERFORM public.write_page_atomic('restore','rev-restore',NULL,(page->>'id')::uuid,(page->>'revision')::uuid,false,false,live_revision);
   RAISE EXCEPTION 'Retry identity ignored source revision';
 EXCEPTION WHEN raise_exception THEN ASSERT SQLERRM='PAGE_RETRY_CONFLICT'; END;

 -- Restored content still needs explicit review to publish.
 BEGIN
   PERFORM public.write_page_atomic('publish','rev-unreviewed',NULL,(page->>'id')::uuid,(restored->'page'->>'revision')::uuid);
   RAISE EXCEPTION 'Restored revision published without review';
 EXCEPTION WHEN raise_exception THEN ASSERT SQLERRM='PAGE_REVIEW_REQUIRED'; END;

 -- Restoring a slug now claimed by another page fails atomically.
 v3 := jsonb_set(v1,'{slug}','"revisions-claimed"');
 page := public.write_page_atomic('save','rev-claim',v3,(page->>'id')::uuid,(restored->'page'->>'revision')::uuid)->'page';
 PERFORM public.write_page_atomic('save','rev-other-take',jsonb_set(v1,'{slug}','"revisions-renamed"'),(other->>'id')::uuid,(other->>'revision')::uuid);
 BEGIN
   PERFORM public.write_page_atomic('restore','rev-collide',NULL,(page->>'id')::uuid,(page->>'revision')::uuid,false,false,
     (SELECT revision FROM public.page_revisions WHERE page_id=(page->>'id')::uuid AND operation='save' AND slug='revisions-renamed'));
   RAISE EXCEPTION 'Colliding restore accepted';
 EXCEPTION WHEN unique_violation THEN ASSERT SQLERRM='PAGE_SLUG_CONFLICT'; END;
 ASSERT (SELECT slug='revisions-claimed' AND revision=(page->>'revision')::uuid FROM public.pages WHERE id=(page->>'id')::uuid), 'Failed restore left partial changes';
 ASSERT NOT EXISTS (SELECT FROM public.page_revisions WHERE page_id=(page->>'id')::uuid AND created_at > (SELECT updated_at FROM public.pages WHERE id=(page->>'id')::uuid)), 'Failed restore recorded history';

 -- Listing is newest first, has author names and never returns documents.
 listed := public.list_page_revisions((page->>'id')::uuid);
 ASSERT jsonb_array_length(listed) = (SELECT count(*) FROM public.page_revisions WHERE page_id=(page->>'id')::uuid);
 ASSERT listed->0->>'revision' = page->>'revision', 'Listing is not newest first';
 ASSERT listed->0->>'author_name' = 'Revision Admin';
 ASSERT NOT (listed->0 ? 'document'), 'Listing leaked documents';
 ASSERT jsonb_array_length(public.list_page_revisions((page->>'id')::uuid, 2)) = 2;
 BEGIN PERFORM public.list_page_revisions((page->>'id')::uuid, 101); RAISE EXCEPTION 'Unbounded listing'; EXCEPTION WHEN check_violation THEN NULL; END;
 -- History is append-only for clients.
 BEGIN UPDATE public.page_revisions SET title='Forged'; RAISE EXCEPTION 'Direct revision update'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN DELETE FROM public.page_revisions; RAISE EXCEPTION 'Direct revision delete'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN INSERT INTO public.page_revisions(page_id,revision,operation,title,slug,seo_title,seo_description,document,status)
   VALUES((page->>'id')::uuid,gen_random_uuid(),'save','x','x','','',v1->'document','draft'); RAISE EXCEPTION 'Direct revision insert';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
-- Another administrator's restore is attributed to them.
SELECT set_config('request.jwt.claims','{"sub":"29000000-0000-4000-8000-000000000003","role":"authenticated","aal":"aal1"}',true);
SET LOCAL ROLE authenticated;
DO $$ DECLARE page public.pages; source uuid; result jsonb;
BEGIN
 SELECT * INTO page FROM public.pages WHERE slug='revisions-claimed';
 SELECT revision INTO source FROM public.page_revisions WHERE page_id=page.id AND operation='create';
 result := public.write_page_atomic('restore','second-admin-restore',NULL,page.id,page.revision,false,false,source);
 ASSERT public.list_page_revisions(page.id)->0->>'author_name' = 'Second Admin';
END $$;
RESET ROLE;
SET LOCAL ROLE anon;
DO $$ BEGIN
 BEGIN PERFORM * FROM public.page_revisions; RAISE EXCEPTION 'Anonymous revision read'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.list_page_revisions(gen_random_uuid()); RAISE EXCEPTION 'Anonymous listing'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims','{"sub":"29000000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal1"}',true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 ASSERT NOT EXISTS (SELECT FROM public.page_revisions), 'Author revision leak';
 BEGIN PERFORM public.list_page_revisions(gen_random_uuid()); RAISE EXCEPTION 'Author listing'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.write_page_atomic('restore','author-restore',NULL,gen_random_uuid(),gen_random_uuid(),false,false,gen_random_uuid());
   RAISE EXCEPTION 'Author restore'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
-- Administrators with verified MFA need AAL2 to read history.
INSERT INTO auth.mfa_factors(id,user_id,friendly_name,factor_type,status,secret,created_at,updated_at) VALUES
 ('29000000-0000-4000-8000-000000000090','29000000-0000-4000-8000-000000000001','Test','totp','verified','test',now(),now());
SELECT set_config('request.jwt.claims','{"sub":"29000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}',true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 ASSERT NOT EXISTS (SELECT FROM public.page_revisions), 'AAL1 revision leak';
 BEGIN PERFORM public.list_page_revisions(gen_random_uuid()); RAISE EXCEPTION 'AAL1 listing'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
ROLLBACK;
