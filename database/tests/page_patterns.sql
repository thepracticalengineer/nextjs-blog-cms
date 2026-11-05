-- Run only against an isolated migrated database. All fixtures roll back.
BEGIN;
INSERT INTO auth.users (id,email) VALUES
 ('29100000-0000-4000-8000-000000000001','patterns-admin@example.test'),
 ('29100000-0000-4000-8000-000000000002','patterns-author@example.test'),
 ('29100000-0000-4000-8000-000000000003','patterns-second-admin@example.test');
UPDATE public.profiles SET role='admin' WHERE id IN ('29100000-0000-4000-8000-000000000001','29100000-0000-4000-8000-000000000003');
SELECT set_config('request.jwt.claims','{"sub":"29100000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}',true);
SET LOCAL ROLE authenticated;
DO $$ DECLARE
 hero jsonb := '{"type":"section","attrs":{"background":"muted"},"content":[{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Shared hero"}]},{"type":"button","attrs":{"label":"Contact","href":"/contact"}}]}';
 pattern_values jsonb; created jsonb; updated jsonb; page jsonb; page_values jsonb; result jsonb; live jsonb;
BEGIN
 pattern_values := jsonb_build_object('name','Hero','description','Muted hero','document',jsonb_build_object('version',2,'content',jsonb_build_object('type','doc','content',jsonb_build_array(hero))));
 created := public.write_page_pattern('create','pattern-create',pattern_values);
 ASSERT created->>'replayed'='false' AND created->'pattern'->>'name'='Hero', 'Pattern not created';
 ASSERT created->'pattern'->>'created_by'='29100000-0000-4000-8000-000000000001', 'Pattern author not recorded';
 -- Exact retry replays; changed input under the same key conflicts.
 ASSERT public.write_page_pattern('create','pattern-create',pattern_values)->>'replayed'='true';
 ASSERT (SELECT count(*) FROM public.page_patterns)=1, 'Replay duplicated the pattern';
 BEGIN
   PERFORM public.write_page_pattern('create','pattern-create',jsonb_set(pattern_values,'{name}','"Other"'));
   RAISE EXCEPTION 'Changed retry accepted';
 EXCEPTION WHEN raise_exception THEN ASSERT SQLERRM='PAGE_RETRY_CONFLICT'; END;

 -- Validation shares page rules: unsupported versions, empty, oversized, invalid nesting and links are refused.
 BEGIN PERFORM public.write_page_pattern('create','bad-version',jsonb_set(pattern_values,'{document}','{"version":1,"blocks":[{"type":"paragraph","text":"x"}]}'));
   RAISE EXCEPTION 'Version 1 pattern accepted'; EXCEPTION WHEN check_violation THEN ASSERT SQLERRM='PAGE_PATTERN_INVALID'; END;
 BEGIN PERFORM public.write_page_pattern('create','bad-empty',jsonb_set(pattern_values,'{document,content,content}','[]'));
   RAISE EXCEPTION 'Empty pattern accepted'; EXCEPTION WHEN check_violation THEN ASSERT SQLERRM='PAGE_PATTERN_INVALID'; END;
 BEGIN PERFORM public.write_page_pattern('create','bad-many',jsonb_set(pattern_values,'{document,content,content}',(SELECT jsonb_agg('{"type":"horizontalRule"}'::jsonb) FROM generate_series(1,101))));
   RAISE EXCEPTION 'Oversized pattern accepted'; EXCEPTION WHEN check_violation THEN ASSERT SQLERRM='PAGE_PATTERN_INVALID'; END;
 BEGIN PERFORM public.write_page_pattern('create','bad-column',jsonb_set(pattern_values,'{document,content,content}','[{"type":"column","content":[{"type":"paragraph"}]}]'));
   RAISE EXCEPTION 'Bare column accepted'; EXCEPTION WHEN check_violation THEN ASSERT SQLERRM='PAGE_PATTERN_INVALID'; END;
 BEGIN PERFORM public.write_page_pattern('create','bad-link',jsonb_set(pattern_values,'{document,content,content,0,content,1,attrs,href}','"javascript:alert(1)"'));
   RAISE EXCEPTION 'Unsafe link accepted'; EXCEPTION WHEN check_violation THEN ASSERT SQLERRM='PAGE_PATTERN_INVALID'; END;
 BEGIN PERFORM public.write_page_pattern('create','bad-name',jsonb_set(pattern_values,'{name}','"   "'));
   RAISE EXCEPTION 'Blank name accepted'; EXCEPTION WHEN check_violation THEN ASSERT SQLERRM='PAGE_PATTERN_INVALID'; END;
 BEGIN PERFORM public.write_page_pattern('create','bad-key',pattern_values || '{"extra":true}');
   RAISE EXCEPTION 'Extra key accepted'; EXCEPTION WHEN check_violation THEN ASSERT SQLERRM='PAGE_PATTERN_INVALID'; END;
 BEGIN PERFORM public.write_page_pattern('delete','bad-delete',pattern_values,(created->'pattern'->>'id')::uuid,(created->'pattern'->>'revision')::uuid);
   RAISE EXCEPTION 'Delete with values accepted'; EXCEPTION WHEN check_violation THEN ASSERT SQLERRM='PAGE_INVALID_INPUT'; END;

 -- Independent copies: a page built from the pattern holds its own content.
 page_values := jsonb_build_object('title','Pattern page','slug','pattern-page','seo_title','','seo_description','',
   'document',jsonb_build_object('version',2,'content',jsonb_build_object('type','doc','content',(created->'pattern'->'document'->'content'->'content'))));
 page := public.write_page_atomic('create','pattern-page-create',page_values)->'page';
 page := public.write_page_atomic('publish','pattern-page-publish',NULL,(page->>'id')::uuid,(page->>'revision')::uuid,true)->'page';
 live := (SELECT to_jsonb(s) FROM public.page_snapshots s WHERE page_id=(page->>'id')::uuid);

 updated := public.write_page_pattern('update','pattern-update',jsonb_set(pattern_values,'{document,content,content,0,content,0,content,0,text}','"Changed hero"'),
   (created->'pattern'->>'id')::uuid,(created->'pattern'->>'revision')::uuid);
 ASSERT updated->'pattern'->>'revision' <> created->'pattern'->>'revision', 'Update must produce a new revision';
 ASSERT (SELECT document=page_values->'document' AND revision=(page->>'revision')::uuid FROM public.pages WHERE id=(page->>'id')::uuid), 'Pattern update changed a working page';
 ASSERT (SELECT to_jsonb(s)=live FROM public.page_snapshots s WHERE page_id=(page->>'id')::uuid), 'Pattern update changed a published snapshot';
 -- Stale updates/deletes are refused.
 BEGIN PERFORM public.write_page_pattern('update','pattern-stale',pattern_values,(created->'pattern'->>'id')::uuid,(created->'pattern'->>'revision')::uuid);
   RAISE EXCEPTION 'Stale update accepted'; EXCEPTION WHEN raise_exception THEN ASSERT SQLERRM='PAGE_PATTERN_STALE'; END;
 BEGIN PERFORM public.write_page_pattern('delete','pattern-stale-delete',NULL,(created->'pattern'->>'id')::uuid,(created->'pattern'->>'revision')::uuid);
   RAISE EXCEPTION 'Stale delete accepted'; EXCEPTION WHEN raise_exception THEN ASSERT SQLERRM='PAGE_PATTERN_STALE'; END;

 result := public.write_page_pattern('delete','pattern-delete',NULL,(updated->'pattern'->>'id')::uuid,(updated->'pattern'->>'revision')::uuid);
 ASSERT result->'pattern'='null'::jsonb AND result->>'replayed'='false';
 ASSERT NOT EXISTS (SELECT FROM public.page_patterns), 'Pattern not deleted';
 ASSERT EXISTS (SELECT FROM public.pages WHERE id=(page->>'id')::uuid AND document=page_values->'document'), 'Pattern deletion changed a page';
 ASSERT EXISTS (SELECT FROM public.page_snapshots WHERE page_id=(page->>'id')::uuid), 'Pattern deletion withdrew a snapshot';
 ASSERT public.write_page_pattern('delete','pattern-delete',NULL,(updated->'pattern'->>'id')::uuid,(updated->'pattern'->>'revision')::uuid)->>'replayed'='true';
 BEGIN PERFORM public.write_page_pattern('update','pattern-missing',pattern_values,(updated->'pattern'->>'id')::uuid,(updated->'pattern'->>'revision')::uuid);
   RAISE EXCEPTION 'Missing pattern updated'; EXCEPTION WHEN no_data_found THEN ASSERT SQLERRM='PAGE_PATTERN_NOT_FOUND'; END;

 -- Direct writes are revoked even for administrators.
 BEGIN INSERT INTO public.page_patterns(name,document) VALUES('Forged',pattern_values->'document'); RAISE EXCEPTION 'Direct pattern insert';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM * FROM public.page_pattern_write_requests; RAISE EXCEPTION 'Receipt read'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;

 -- Starter placeholders block publication through the RPC.
 page_values := jsonb_set(jsonb_set(page_values,'{slug}','"placeholder-page"'),'{document,content,content,0,content,0,content,0,text}','"[[Replace: headline]]"');
 page := public.write_page_atomic('create','placeholder-create',page_values)->'page';
 BEGIN PERFORM public.write_page_atomic('publish','placeholder-publish',NULL,(page->>'id')::uuid,(page->>'revision')::uuid,true);
   RAISE EXCEPTION 'Placeholder text published'; EXCEPTION WHEN raise_exception THEN ASSERT SQLERRM='PAGE_NOT_READY'; END;
 page_values := jsonb_set(jsonb_set(page_values,'{document,content,content,0,content,0,content,0,text}','"Real headline"'),'{document,content,content,0,content,1,attrs,href}','"#REPLACE-LINK"');
 page := public.write_page_atomic('save','placeholder-href',page_values,(page->>'id')::uuid,(page->>'revision')::uuid)->'page';
 BEGIN PERFORM public.write_page_atomic('publish','placeholder-publish-href',NULL,(page->>'id')::uuid,(page->>'revision')::uuid,true);
   RAISE EXCEPTION 'Placeholder link published'; EXCEPTION WHEN raise_exception THEN ASSERT SQLERRM='PAGE_NOT_READY'; END;
 page_values := jsonb_set(page_values,'{document,content,content,0,content,1,attrs,href}','"/contact"');
 page := public.write_page_atomic('save','placeholder-fixed',page_values,(page->>'id')::uuid,(page->>'revision')::uuid)->'page';
 ASSERT public.write_page_atomic('publish','placeholder-publish-fixed',NULL,(page->>'id')::uuid,(page->>'revision')::uuid,true)->'page'->>'status'='published';
END $$;
RESET ROLE;
-- Placeholder detection matches features/pages/placeholders.ts (private helper, owner-only).
DO $$ BEGIN
 ASSERT pages_private.has_placeholder('{"version":1,"blocks":[{"type":"paragraph","text":"[[replace me]]"}]}');
 ASSERT pages_private.has_placeholder('{"version":2,"content":{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"x","marks":[{"type":"link","attrs":{"href":"#replace-link-2"}}]}]}]}}');
 ASSERT NOT pages_private.has_placeholder('{"version":2,"content":{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Replace your old site"}]}]}}');
 BEGIN SET LOCAL ROLE authenticated; PERFORM pages_private.has_placeholder('{}'); RAISE EXCEPTION 'Helper exposed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
-- Another administrator shares the library.
SELECT set_config('request.jwt.claims','{"sub":"29100000-0000-4000-8000-000000000003","role":"authenticated","aal":"aal1"}',true);
SET LOCAL ROLE authenticated;
DO $$ DECLARE created jsonb; BEGIN
 created := public.write_page_pattern('create','second-admin-create','{"name":"Quote","description":"","document":{"version":2,"content":{"type":"doc","content":[{"type":"blockquote","content":[{"type":"paragraph"}]}]}}}');
 ASSERT (SELECT count(*) FROM public.page_patterns)=1, 'Admin cannot read shared patterns';
 -- Request keys are scoped per actor: the first admin's key does not replay here.
 ASSERT public.write_page_pattern('create','pattern-create','{"name":"Rule","description":"","document":{"version":2,"content":{"type":"doc","content":[{"type":"horizontalRule"}]}}}')->>'replayed'='false';
END $$;
RESET ROLE;
SET LOCAL ROLE anon;
DO $$ BEGIN
 BEGIN PERFORM * FROM public.page_patterns; RAISE EXCEPTION 'Anonymous pattern read'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.write_page_pattern('create','anon','{}'); RAISE EXCEPTION 'Anonymous write'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims','{"sub":"29100000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal1"}',true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 ASSERT NOT EXISTS (SELECT FROM public.page_patterns), 'Author pattern leak';
 BEGIN PERFORM public.write_page_pattern('create','author-create','{"name":"x","description":"","document":{"version":2,"content":{"type":"doc","content":[{"type":"horizontalRule"}]}}}');
   RAISE EXCEPTION 'Author pattern write'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
-- Administrators with verified MFA need AAL2.
INSERT INTO auth.mfa_factors(id,user_id,friendly_name,factor_type,status,secret,created_at,updated_at) VALUES
 ('29100000-0000-4000-8000-000000000090','29100000-0000-4000-8000-000000000001','Test','totp','verified','test',now(),now());
SELECT set_config('request.jwt.claims','{"sub":"29100000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}',true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 ASSERT NOT EXISTS (SELECT FROM public.page_patterns), 'AAL1 pattern leak';
END $$;
RESET ROLE;
ROLLBACK;
