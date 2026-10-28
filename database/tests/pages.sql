-- Run only against an isolated migrated database. All fixtures roll back.
BEGIN;
INSERT INTO auth.users (id,email) VALUES
 ('28600000-0000-4000-8000-000000000001','pages-admin@example.test'),
 ('28600000-0000-4000-8000-000000000002','pages-author@example.test');
UPDATE public.profiles SET role='admin' WHERE id='28600000-0000-4000-8000-000000000001';
SELECT set_config('request.jwt.claims','{"sub":"28600000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}',true);
SET LOCAL ROLE authenticated;
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
RESET ROLE;
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
