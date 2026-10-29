-- Run only against an isolated migrated database. All fixtures roll back.
BEGIN;
DO $$ DECLARE
 good jsonb := '{"version":2,"content":{"type":"doc","content":[{"type":"section","attrs":{"width":"wide","background":"muted"},"content":[{"type":"columns","attrs":{"preset":"equal-two"},"content":[{"type":"column","content":[{"type":"paragraph","content":[{"type":"text","text":"Hello 😀","marks":[{"type":"link","attrs":{"href":"/about","title":null,"target":"_blank","rel":"noopener noreferrer nofollow","class":null}}]}]}]},{"type":"column","content":[{"type":"image","attrs":{"src":"/test.png","alt":null,"title":null,"width":null,"height":null,"assetId":null}},{"type":"button","attrs":{"label":"Read","href":"https://example.test","variant":"outline"}}]}]}]}]}}';
 bad jsonb; deep jsonb := '{"type":"paragraph"}'; i integer;
BEGIN
 ASSERT pages_private.valid_document(good), 'Valid v2 layout rejected';
 ASSERT pages_private.valid_document(jsonb_set(good,'{content,content,0,content,0,content,0,content,0,content,0,marks,0,attrs,title}',to_jsonb(repeat('😀',1000))));
 ASSERT NOT pages_private.valid_document(jsonb_set(good,'{content,content,0,content,0,content,0,content,0,content,0,marks,0,attrs,title}',to_jsonb(repeat('😀',1001))));
 ASSERT pages_private.valid_document('{"version":2,"content":{"type":"doc","content":[]}}');
 ASSERT pages_private.valid_document('{"version":2,"content":{"type":"doc","content":[{"type":"paragraph","content":[{"type":"hardBreak","marks":[{"type":"bold"}]}]}]}}');
 ASSERT pages_private.valid_document('{"version":2,"content":{"type":"doc","content":[{"type":"orderedList","attrs":{"start":1,"type":null},"content":[{"type":"listItem","content":[{"type":"paragraph"}]}]},{"type":"codeBlock","attrs":{"language":null},"content":[{"type":"text","text":"x"}]}]}}');
 FOR bad IN SELECT value FROM jsonb_array_elements('[
 {"type":"column"}, {"type":"text","text":"x"}, {"type":"html"},
 {"type":"paragraph","attrs":{"style":"color:red"}},
 {"type":"columns","content":[{"type":"column"}]},
 {"type":"section","content":[{"type":"column"}]},
 {"type":"heading","attrs":{"level":7}},
 {"type":"paragraph","content":[{"type":"text","text":"x","marks":[{"type":"link","attrs":{"href":"javascript:alert(1)"}}]}]},
 {"type":"image","attrs":{"src":"data:image/png;base64,ABC"}},
 {"type":"image","attrs":{"src":"/ok.png","width":"10"}},
 {"type":"paragraph","content":[{"type":"section"}]},
 {"type":"orderedList","content":[]},
 {"type":"button","attrs":{"label":"Read","href":"//evil.test"}},
 {"type":"button","attrs":{"label":"Read","href":"/ok","onclick":"x"}}
 ]') LOOP
   ASSERT NOT pages_private.valid_document(jsonb_build_object('version',2,'content',jsonb_build_object('type','doc','content',jsonb_build_array(bad)))), 'Invalid node accepted: ' || bad::text;
 END LOOP;
 FOR i IN 1..13 LOOP deep := jsonb_build_object('type','section','content',jsonb_build_array(deep)); END LOOP;
 ASSERT NOT pages_private.valid_document(jsonb_build_object('version',2,'content',jsonb_build_object('type','doc','content',jsonb_build_array(deep)))), 'Deep document accepted';
 SELECT jsonb_build_object('version',2,'content',jsonb_build_object('type','doc','content',jsonb_agg(jsonb_build_object('type','paragraph')))) INTO bad FROM generate_series(1,1500);
 ASSERT NOT pages_private.valid_document(bad), 'Excess node count accepted';
 SELECT jsonb_build_object('version',2,'content',jsonb_build_object('type','doc','content',jsonb_agg(jsonb_build_object('type','paragraph','content',jsonb_build_array(jsonb_build_object('type','text','text',repeat(' ',10000))))))) INTO bad FROM generate_series(1,27);
 ASSERT NOT pages_private.valid_document(bad), 'Oversize whitespace text accepted';
 SELECT jsonb_build_object('version',2,'content',jsonb_build_object('type','doc','content',jsonb_agg(jsonb_build_object('type','paragraph','content',jsonb_build_array(jsonb_build_object('type','text','text',repeat('😀',10000))))))) INTO bad FROM generate_series(1,7);
 ASSERT NOT pages_private.valid_document(bad), 'Oversize UTF-8 accepted';
END $$;
INSERT INTO auth.users (id,email) VALUES
 ('28600000-0000-4000-8000-000000000001','pages-admin@example.test'),
 ('28600000-0000-4000-8000-000000000002','pages-author@example.test');
UPDATE public.profiles SET role='admin' WHERE id='28600000-0000-4000-8000-000000000001';
SELECT set_config('request.jwt.claims','{"sub":"28600000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}',true);
SET LOCAL ROLE authenticated;
DO $$ DECLARE
 payload jsonb := '{"title":"Canvas","slug":"pages-v2","seo_title":"","seo_description":"","document":{"version":2,"content":{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Published 😀"}]}]}}}';
 original jsonb; published jsonb; saved jsonb; replay jsonb;
BEGIN
 original := public.write_page_atomic('create','v2-create',payload)->'page';
 ASSERT original->'document' = payload->'document';
 published := public.write_page_atomic('publish','v2-publish',NULL,(original->>'id')::uuid,(original->>'revision')::uuid)->'page';
 ASSERT (SELECT document = payload->'document' FROM public.page_snapshots WHERE page_id=(original->>'id')::uuid);
 saved := public.write_page_atomic('save','v2-save',jsonb_set(payload,'{document,content,content}','[]'),(original->>'id')::uuid,(published->>'revision')::uuid)->'page';
 ASSERT (SELECT document = payload->'document' FROM public.page_snapshots WHERE page_id=(original->>'id')::uuid), 'v2 save changed snapshot';
 replay := public.write_page_atomic('create','v2-create',payload);
 ASSERT replay->'page' = saved AND replay->>'replayed' = 'true';
 PERFORM public.write_page_atomic('unpublish','v2-unpublish',NULL,(saved->>'id')::uuid,(saved->>'revision')::uuid);
END $$;
DO $$ DECLARE
 payload jsonb := '{"title":"About","slug":"pages-about","seo_title":"","seo_description":"","document":{"version":1,"blocks":[{"type":"paragraph","text":"Live"}]}}';
 invalid jsonb; result jsonb; original jsonb; saved jsonb; published jsonb; current_page jsonb;
BEGIN
 -- Both SQL and TypeScript count astral Unicode as one character.
 result := public.write_page_atomic('create','unicode',jsonb_set(jsonb_set(payload,'{title}',to_jsonb(repeat('😀',200))),'{slug}','"pages-unicode"'));
 ASSERT result->'page'->>'title' = repeat('😀',200);
 BEGIN
  PERFORM public.write_page_atomic('create','blank-title',jsonb_set(payload,'{title}',to_jsonb(E'\n\t' || chr(160) || chr(65279))));
  RAISE EXCEPTION 'Whitespace title accepted';
 EXCEPTION WHEN check_violation THEN NULL; END;
 result := public.write_page_atomic('create','create-1',payload);
 ASSERT result->>'replayed' = 'false';
 original := result->'page';
 FOR invalid IN SELECT value FROM jsonb_array_elements('[null,{}, {"version":2,"blocks":[]}, {"version":1,"blocks":{}}, {"version":1,"blocks":[{"type":"html","html":"x"}]}, {"version":1,"blocks":[{"type":"paragraph","text":42}]}, {"version":1,"blocks":[],"extra":true}]') LOOP
  BEGIN
   PERFORM public.write_page_atomic('create','invalid-doc',jsonb_set(payload,'{document}',invalid));
   RAISE EXCEPTION 'Invalid document accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
 END LOOP;
 ASSERT original->>'status' = 'draft';
 ASSERT original->>'created_by' = auth.uid()::text;
 result := public.write_page_atomic('create','create-1',payload);
 ASSERT result->>'replayed' = 'true' AND result->'page' = original;
 BEGIN
  PERFORM public.write_page_atomic('create','create-1',jsonb_set(payload,'{title}','"Changed"'));
  RAISE EXCEPTION 'Changed retry accepted';
 EXCEPTION WHEN SQLSTATE 'P0001' THEN ASSERT SQLERRM = 'PAGE_RETRY_CONFLICT'; END;
 ASSERT NOT EXISTS (SELECT FROM public.page_snapshots), 'Draft exposed';
 result := public.write_page_atomic('publish','publish-1',NULL,(original->>'id')::uuid,(original->>'revision')::uuid);
 published := result->'page';
 ASSERT published->>'status' = 'published';
 ASSERT (SELECT title = 'About' FROM public.page_snapshots WHERE page_id=(original->>'id')::uuid);
 result := public.write_page_atomic('save','save-1',jsonb_set(payload,'{title}','"Private edit"'),(original->>'id')::uuid,(published->>'revision')::uuid);
 saved := result->'page';
 ASSERT saved->>'status' = 'published';
 ASSERT (SELECT title = 'About' FROM public.page_snapshots WHERE page_id=(original->>'id')::uuid), 'Draft edit changed live snapshot';
 BEGIN
  PERFORM public.write_page_atomic('save','stale',payload,(original->>'id')::uuid,(published->>'revision')::uuid);
  RAISE EXCEPTION 'Stale save accepted';
 EXCEPTION WHEN SQLSTATE 'P0001' THEN ASSERT SQLERRM = 'PAGE_STALE'; END;
 BEGIN
  PERFORM public.write_page_atomic('publish','stale-publish',NULL,(original->>'id')::uuid,(published->>'revision')::uuid);
  RAISE EXCEPTION 'Stale publish accepted';
 EXCEPTION WHEN SQLSTATE 'P0001' THEN ASSERT SQLERRM = 'PAGE_STALE'; END;
 BEGIN
  PERFORM public.write_page_atomic('save','bad-version',jsonb_set(payload,'{document,version}','2'),(original->>'id')::uuid,(saved->>'revision')::uuid);
  RAISE EXCEPTION 'Unsupported version accepted';
 EXCEPTION WHEN check_violation THEN NULL; END;
 ASSERT (SELECT to_jsonb(p) = saved FROM public.pages p WHERE id=(original->>'id')::uuid), 'Rejected write mutated state';
 result := public.write_page_atomic('create','create-1',payload);
 ASSERT result->'page' = saved AND result->>'replayed' = 'true', 'Create replay overwrote later edit';
 result := public.write_page_atomic('unpublish','unpublish-1',NULL,(original->>'id')::uuid,(saved->>'revision')::uuid);
 current_page := result->'page';
 ASSERT NOT EXISTS (SELECT FROM public.page_snapshots), 'Unpublish left live row';
 result := public.write_page_atomic('publish','publish-1',NULL,(original->>'id')::uuid,(original->>'revision')::uuid);
 ASSERT result->>'replayed' = 'true';
 ASSERT NOT EXISTS (SELECT FROM public.page_snapshots), 'Old publish retry republished page';
 result := public.write_page_atomic('publish','publish-2',NULL,(original->>'id')::uuid,(current_page->>'revision')::uuid);
 current_page := result->'page';
 ASSERT (SELECT title = 'Private edit' FROM public.page_snapshots WHERE page_id=(original->>'id')::uuid);
 -- Rename working copy; live slug and its reservation must survive.
 result := public.write_page_atomic('save','rename',jsonb_set(payload,'{slug}','"pages-renamed"'),(original->>'id')::uuid,(current_page->>'revision')::uuid);
 ASSERT EXISTS (SELECT FROM public.page_snapshots WHERE slug='pages-about');
 BEGIN
  PERFORM public.write_page_atomic('create','steal-slug',payload);
  RAISE EXCEPTION 'Live slug stolen';
 EXCEPTION WHEN unique_violation THEN NULL; END;
 BEGIN
  UPDATE public.pages SET title='Bypass' WHERE id=(original->>'id')::uuid;
  RAISE EXCEPTION 'Direct admin write accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  DELETE FROM public.page_snapshots;
  RAISE EXCEPTION 'Direct snapshot write accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
-- A page reserves only its current working and live slugs, not typing history.
DO $$ DECLARE
 values jsonb := '{"title":"Slug lifecycle","slug":"lifecycle-a","seo_title":"","seo_description":"","document":{"version":1,"blocks":[]}}';
 page jsonb; live jsonb; replay jsonb;
BEGIN
 page := public.write_page_atomic('create','life-create',values)->'page';
 page := public.write_page_atomic('save','life-b',jsonb_set(values,'{slug}','"lifecycle-b"'),(page->>'id')::uuid,(page->>'revision')::uuid)->'page';
 PERFORM public.write_page_atomic('create','reuse-a',values);
 page := public.write_page_atomic('publish','life-publish-b',NULL,(page->>'id')::uuid,(page->>'revision')::uuid)->'page';
 live := page;
 page := public.write_page_atomic('save','life-c',jsonb_set(values,'{slug}','"lifecycle-c"'),(page->>'id')::uuid,(page->>'revision')::uuid)->'page';
 page := public.write_page_atomic('save','life-d',jsonb_set(values,'{slug}','"lifecycle-d"'),(page->>'id')::uuid,(page->>'revision')::uuid)->'page';
 PERFORM public.write_page_atomic('create','reuse-c',jsonb_set(values,'{slug}','"lifecycle-c"'));
 replay := public.write_page_atomic('save','life-c',jsonb_set(values,'{slug}','"lifecycle-c"'),(live->>'id')::uuid,(live->>'revision')::uuid);
 ASSERT replay->>'replayed' = 'true' AND replay->'page' = page, 'Retry reclaimed released slug';
 BEGIN
  PERFORM public.write_page_atomic('create','steal-live-b',jsonb_set(values,'{slug}','"lifecycle-b"'));
  RAISE EXCEPTION 'Live slug released before publication';
 EXCEPTION WHEN unique_violation THEN NULL; END;
 page := public.write_page_atomic('publish','life-publish-d',NULL,(page->>'id')::uuid,(page->>'revision')::uuid)->'page';
 PERFORM public.write_page_atomic('create','reuse-b',jsonb_set(values,'{slug}','"lifecycle-b"'));
 page := public.write_page_atomic('save','life-e',jsonb_set(values,'{slug}','"lifecycle-e"'),(page->>'id')::uuid,(page->>'revision')::uuid)->'page';
 page := public.write_page_atomic('unpublish','life-unpublish',NULL,(page->>'id')::uuid,(page->>'revision')::uuid)->'page';
 PERFORM public.write_page_atomic('create','reuse-d',jsonb_set(values,'{slug}','"lifecycle-d"'));
 BEGIN
  PERFORM public.write_page_atomic('create','steal-working-e',jsonb_set(values,'{slug}','"lifecycle-e"'));
  RAISE EXCEPTION 'Current working slug released';
 EXCEPTION WHEN unique_violation THEN NULL; END;
END $$;
RESET ROLE;
DO $$ BEGIN
 ASSERT NOT EXISTS (SELECT page_id FROM public.page_slug_reservations GROUP BY page_id HAVING count(*) > 2), 'Reservation history leaked';
END $$;
SET LOCAL ROLE anon;
DO $$ BEGIN
 ASSERT (SELECT count(*) FROM public.page_snapshots WHERE slug='pages-about') = 1;
 BEGIN PERFORM * FROM public.pages; RAISE EXCEPTION 'Anonymous draft read'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.write_page_atomic('create','anon','{}'); RAISE EXCEPTION 'Anonymous write'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM * FROM public.page_write_requests; RAISE EXCEPTION 'Receipt leak'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims','{"sub":"28600000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal1"}',true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 ASSERT NOT EXISTS (SELECT FROM public.pages), 'Author draft leak';
 ASSERT EXISTS (SELECT FROM public.page_snapshots WHERE slug='pages-about');
 BEGIN PERFORM public.write_page_atomic('create','author','{}'); RAISE EXCEPTION 'Author write'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM * FROM public.page_write_requests; RAISE EXCEPTION 'Author receipt leak'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
INSERT INTO auth.mfa_factors(id,user_id,friendly_name,factor_type,status,secret,created_at,updated_at) VALUES
 ('28600000-0000-4000-8000-000000000090','28600000-0000-4000-8000-000000000001','Test','totp','verified','test',now(),now());
SELECT set_config('request.jwt.claims','{"sub":"28600000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}',true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 ASSERT NOT EXISTS (SELECT FROM public.pages), 'AAL1 draft leak';
 ASSERT EXISTS (SELECT FROM public.page_snapshots WHERE slug='pages-about');
 BEGIN PERFORM public.write_page_atomic('create','mfa','{}'); RAISE EXCEPTION 'AAL1 write'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims','{"sub":"28600000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}',true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN ASSERT EXISTS (SELECT FROM public.pages), 'AAL2 access denied'; END $$;
RESET ROLE;
ROLLBACK;
