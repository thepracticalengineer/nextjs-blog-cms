-- Run only against an isolated migrated database. All fixtures roll back.
BEGIN;
INSERT INTO auth.users (id,email) VALUES
 ('29010000-0000-4000-8000-000000000001','hierarchy-admin@example.test'),
 ('29010000-0000-4000-8000-000000000002','hierarchy-author@example.test');
UPDATE public.profiles SET role='admin' WHERE id='29010000-0000-4000-8000-000000000001';
SELECT set_config('request.jwt.claims','{"sub":"29010000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}',true);
SET LOCAL ROLE authenticated;
CREATE TEMP TABLE ids(name text PRIMARY KEY, id uuid) ON COMMIT DROP;
DO $$ DECLARE
 base jsonb := '{"title":"T","slug":"x","seo_title":"","seo_description":"","document":{"version":2,"content":{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Body"}]}]}}}';
 name text; created jsonb;
BEGIN
 FOREACH name IN ARRAY ARRAY['a','b','c','d','e'] LOOP
   created := public.write_page_atomic('create','h-create-'||name,jsonb_set(jsonb_set(base,'{slug}',to_jsonb('hier-'||name)),'{title}',to_jsonb(upper(name))))->'page';
   INSERT INTO ids VALUES(name,(created->>'id')::uuid);
 END LOOP;
END $$;
CREATE TEMP VIEW tree AS SELECT i.name, p.parent_id, (SELECT name FROM ids WHERE id=p.parent_id) AS parent, p.position, p.revision, p.trashed_at, p.purged_at, p.status, p.slug, p.title
 FROM ids i JOIN public.pages p ON p.id=i.id;
CREATE TEMP TABLE step(id integer) ON COMMIT DROP;

CREATE FUNCTION pg_temp.move(n text, parent text, pos integer, key text) RETURNS jsonb LANGUAGE sql AS $$
 SELECT public.write_page_atomic('move',key,NULL,(SELECT id FROM ids WHERE name=n),(SELECT revision FROM tree WHERE name=n),false,false,NULL,
   jsonb_build_object('parent_id',(SELECT id FROM ids WHERE name=parent),'position',pos))->'page';
$$;
CREATE FUNCTION pg_temp.op(o text, n text, key text, options jsonb DEFAULT NULL) RETURNS jsonb LANGUAGE sql AS $$
 SELECT public.write_page_atomic(o,key,NULL,(SELECT id FROM ids WHERE name=n),(SELECT revision FROM tree WHERE name=n),false,false,NULL,options)->'page';
$$;

DO $$ DECLARE moved jsonb; BEGIN
 ASSERT (SELECT array_agg(name ORDER BY position) FROM tree WHERE parent_id IS NULL) = ARRAY['a','b','c','d','e'], 'Creates append to top level';
 -- Nest b and c under a; d under b (depth 3).
 PERFORM pg_temp.move('b','a',0,'m1');
 PERFORM pg_temp.move('c','a',1,'m2');
 PERFORM pg_temp.move('d','b',0,'m3');
 ASSERT (SELECT array_agg(name ORDER BY position) FROM tree WHERE parent_id IS NULL) = ARRAY['a','e'], 'Top level not compacted';
 ASSERT (SELECT array_agg(name||':'||position ORDER BY position) FROM tree WHERE parent='a') = ARRAY['b:0','c:1'];
 ASSERT (SELECT operation FROM public.page_revisions WHERE revision=(SELECT revision FROM tree WHERE name='d'))='move', 'Move not recorded';
 -- Reorder within a parent: moving b to the end.
 PERFORM pg_temp.move('b','a',1,'m4');
 ASSERT (SELECT array_agg(name ORDER BY position) FROM tree WHERE parent='a') = ARRAY['c','b'], 'Same-parent reorder wrong';
 PERFORM pg_temp.move('b','a',0,'m5');
 ASSERT (SELECT array_agg(name ORDER BY position) FROM tree WHERE parent='a') = ARRAY['b','c'];
 -- Out-of-range positions append.
 PERFORM pg_temp.move('e','a',99,'m6');
 ASSERT (SELECT array_agg(name||':'||position ORDER BY position) FROM tree WHERE parent='a') = ARRAY['b:0','c:1','e:2'];
 PERFORM pg_temp.move('e',NULL,0,'m7');
 ASSERT (SELECT array_agg(name ORDER BY position) FROM tree WHERE parent_id IS NULL) = ARRAY['e','a'];

 -- Cycles are impossible, including through descendants.
 BEGIN PERFORM pg_temp.move('a','d',0,'cycle-desc'); RAISE EXCEPTION 'Descendant cycle accepted';
 EXCEPTION WHEN raise_exception THEN ASSERT SQLERRM='PAGE_HIERARCHY_CYCLE'; END;
 BEGIN PERFORM pg_temp.move('a','a',0,'cycle-self'); RAISE EXCEPTION 'Self parent accepted';
 EXCEPTION WHEN raise_exception THEN ASSERT SQLERRM='PAGE_HIERARCHY_CYCLE'; END;
 -- Depth is bounded at three levels, counting the moved subtree.
 BEGIN PERFORM pg_temp.move('e','d',0,'too-deep'); RAISE EXCEPTION 'Depth 4 accepted';
 EXCEPTION WHEN raise_exception THEN ASSERT SQLERRM='PAGE_HIERARCHY_TOO_DEEP'; END;
 BEGIN PERFORM pg_temp.move('b','c',0,'too-deep-subtree'); RAISE EXCEPTION 'Subtree depth 4 accepted';
 EXCEPTION WHEN raise_exception THEN ASSERT SQLERRM='PAGE_HIERARCHY_TOO_DEEP'; END;
 -- Unknown parents and malformed options fail closed.
 BEGIN PERFORM public.write_page_atomic('move','bad-parent',NULL,(SELECT id FROM ids WHERE name='e'),(SELECT revision FROM tree WHERE name='e'),false,false,NULL,
   jsonb_build_object('parent_id',gen_random_uuid(),'position',0)); RAISE EXCEPTION 'Unknown parent accepted';
 EXCEPTION WHEN raise_exception THEN ASSERT SQLERRM='PAGE_PARENT_NOT_FOUND'; END;
 BEGIN PERFORM pg_temp.op('move','e','bad-options','{"parent_id":null,"position":1.5}'); RAISE EXCEPTION 'Fractional position accepted';
 EXCEPTION WHEN check_violation THEN ASSERT SQLERRM='PAGE_INVALID_INPUT'; END;
 BEGIN PERFORM pg_temp.op('move','e','extra-options','{"parent_id":null,"position":0,"slug":"x"}'); RAISE EXCEPTION 'Extra option accepted';
 EXCEPTION WHEN check_violation THEN ASSERT SQLERRM='PAGE_INVALID_INPUT'; END;
 BEGIN PERFORM pg_temp.op('move','e','missing-options'); RAISE EXCEPTION 'Missing options accepted';
 EXCEPTION WHEN check_violation THEN ASSERT SQLERRM='PAGE_INVALID_INPUT'; END;
 -- Stale moves are rejected; exact retries replay.
 moved := pg_temp.move('c','a',0,'m8');
 BEGIN PERFORM public.write_page_atomic('move','stale-move',NULL,(SELECT id FROM ids WHERE name='c'),(SELECT id FROM ids WHERE name='c'),false,false,NULL,'{"parent_id":null,"position":0}');
   RAISE EXCEPTION 'Stale move accepted';
 EXCEPTION WHEN raise_exception THEN ASSERT SQLERRM='PAGE_STALE'; END;
 ASSERT (SELECT array_agg(name ORDER BY position) FROM tree WHERE parent='a') = ARRAY['c','b'];
 -- Hierarchy never changes URLs.
 ASSERT (SELECT slug FROM tree WHERE name='d')='hier-d', 'Hierarchy changed a slug';
END $$;

-- Publication, trash and recovery.
DO $$ BEGIN
 PERFORM public.write_page_atomic('publish','pub-d',NULL,(SELECT id FROM ids WHERE name='d'),(SELECT revision FROM tree WHERE name='d'),true);
 PERFORM public.write_page_atomic('publish','pub-b',NULL,(SELECT id FROM ids WHERE name='b'),(SELECT revision FROM tree WHERE name='b'),true);
 ASSERT public.resolve_page_path('hier-d') IS NOT NULL;
 -- A parent with active children cannot be trashed.
 BEGIN PERFORM pg_temp.op('trash','b','trash-parent'); RAISE EXCEPTION 'Parent with children trashed';
 EXCEPTION WHEN raise_exception THEN ASSERT SQLERRM='PAGE_HAS_CHILDREN'; END;
 ASSERT (SELECT trashed_at IS NULL FROM tree WHERE name='b');
 -- Trashing withdraws publication but keeps every URL reservation.
 PERFORM pg_temp.op('trash','d','trash-d');
 ASSERT (SELECT trashed_at IS NOT NULL AND status='draft' FROM tree WHERE name='d');
 ASSERT public.resolve_page_path('hier-d') IS NULL, 'Trashed page still public';
 ASSERT NOT EXISTS (SELECT FROM public.page_snapshots WHERE page_id=(SELECT id FROM ids WHERE name='d'));
 BEGIN PERFORM public.write_page_atomic('create','claim-d','{"title":"Claim","slug":"hier-d","seo_title":"","seo_description":"","document":{"version":2,"content":{"type":"doc","content":[]}}}');
   RAISE EXCEPTION 'Trashed URL claimed';
 EXCEPTION WHEN unique_violation THEN ASSERT SQLERRM='PAGE_SLUG_CONFLICT'; END;
 ASSERT (SELECT operation FROM public.page_revisions WHERE revision=(SELECT revision FROM tree WHERE name='d'))='trash';
 -- Trashed pages cannot be edited, published, moved or restored from history.
 BEGIN PERFORM public.write_page_atomic('save','save-trashed','{"title":"X","slug":"hier-d","seo_title":"","seo_description":"","document":{"version":2,"content":{"type":"doc","content":[]}}}',
   (SELECT id FROM ids WHERE name='d'),(SELECT revision FROM tree WHERE name='d')); RAISE EXCEPTION 'Trashed save accepted';
 EXCEPTION WHEN raise_exception THEN ASSERT SQLERRM='PAGE_TRASHED'; END;
 BEGIN PERFORM public.write_page_atomic('publish','publish-trashed',NULL,(SELECT id FROM ids WHERE name='d'),(SELECT revision FROM tree WHERE name='d'),true);
   RAISE EXCEPTION 'Trashed publish accepted';
 EXCEPTION WHEN raise_exception THEN ASSERT SQLERRM='PAGE_TRASHED'; END;
 BEGIN PERFORM pg_temp.move('d',NULL,0,'move-trashed'); RAISE EXCEPTION 'Trashed move accepted';
 EXCEPTION WHEN raise_exception THEN ASSERT SQLERRM='PAGE_TRASHED'; END;
 BEGIN PERFORM pg_temp.move('e','d',0,'under-trashed'); RAISE EXCEPTION 'Move under trashed parent accepted';
 EXCEPTION WHEN raise_exception THEN ASSERT SQLERRM='PAGE_PARENT_TRASHED'; END;
 -- With its only child trashed, b can be trashed; the child cannot be recovered first.
 PERFORM pg_temp.op('trash','b','trash-b');
 ASSERT public.resolve_page_path('hier-b') IS NULL;
 ASSERT (SELECT array_agg(name ORDER BY position) FROM tree WHERE parent='a' AND trashed_at IS NULL) = ARRAY['c'], 'Siblings not compacted after trash';
 BEGIN PERFORM pg_temp.op('recover','d','recover-d-early'); RAISE EXCEPTION 'Recovered under trashed parent';
 EXCEPTION WHEN raise_exception THEN ASSERT SQLERRM='PAGE_PARENT_TRASHED'; END;
 BEGIN PERFORM pg_temp.op('recover','c','recover-active'); RAISE EXCEPTION 'Recovered an active page';
 EXCEPTION WHEN raise_exception THEN ASSERT SQLERRM='PAGE_NOT_TRASHED'; END;
 -- Recovery returns pages unpublished, in place, at the end of their siblings.
 PERFORM pg_temp.op('recover','b','recover-b');
 PERFORM pg_temp.op('recover','d','recover-d');
 ASSERT (SELECT trashed_at IS NULL AND status='draft' AND parent='a' FROM tree WHERE name='b');
 ASSERT (SELECT array_agg(name ORDER BY position) FROM tree WHERE parent='a') = ARRAY['c','b'];
 ASSERT (SELECT parent='b' FROM tree WHERE name='d');
 ASSERT public.resolve_page_path('hier-d') IS NULL, 'Recovery republished without review';
 ASSERT (SELECT operation FROM public.page_revisions WHERE revision=(SELECT revision FROM tree WHERE name='d'))='recover';
END $$;

-- Permanent deletion.
DO $$ DECLARE purged jsonb; before_purge uuid; d_id uuid := (SELECT id FROM ids WHERE name='d'); BEGIN
 BEGIN PERFORM pg_temp.op('purge','d','purge-active','{"confirm_slug":"hier-d"}'); RAISE EXCEPTION 'Active page purged';
 EXCEPTION WHEN raise_exception THEN ASSERT SQLERRM='PAGE_NOT_TRASHED'; END;
 PERFORM pg_temp.op('trash','d','trash-d-again');
 BEGIN PERFORM pg_temp.op('purge','d','purge-unconfirmed','{"confirm_slug":"wrong"}'); RAISE EXCEPTION 'Unconfirmed purge accepted';
 EXCEPTION WHEN raise_exception THEN ASSERT SQLERRM='PAGE_DELETE_CONFIRMATION_REQUIRED'; END;
 BEGIN PERFORM pg_temp.op('purge','d','purge-no-options'); RAISE EXCEPTION 'Purge without confirmation accepted';
 EXCEPTION WHEN check_violation THEN ASSERT SQLERRM='PAGE_INVALID_INPUT'; END;
 before_purge := (SELECT revision FROM tree WHERE name='d');
 purged := pg_temp.op('purge','d','purge-d','{"confirm_slug":"hier-d"}');
 ASSERT purged->>'purged_at' IS NOT NULL AND purged->>'title'='Deleted page';
 ASSERT purged->'document' = '{"version":2,"content":{"type":"doc","content":[]}}'::jsonb, 'Content survived purge';
 ASSERT (SELECT count(*) FROM public.page_revisions WHERE page_id=d_id)=1, 'History survived purge';
 ASSERT (SELECT operation='purge' AND title='Deleted page' FROM public.page_revisions WHERE page_id=d_id), 'Purge audit row missing';
 ASSERT public.resolve_page_path('hier-d') IS NULL;
 -- Exact retry still replays; a purged page accepts no further operation.
 ASSERT public.write_page_atomic('purge','purge-d',NULL,d_id,before_purge,false,false,NULL,'{"confirm_slug":"hier-d"}')->>'replayed'='true';
 BEGIN PERFORM public.write_page_atomic('recover','recover-purged',NULL,d_id,(purged->>'revision')::uuid); RAISE EXCEPTION 'Purged page recovered';
 EXCEPTION WHEN no_data_found THEN ASSERT SQLERRM='PAGE_NOT_FOUND'; END;
END $$;

-- Purging a trashed parent detaches its trashed children instead of orphaning them.
DO $$ BEGIN
 PERFORM pg_temp.move('e','c',0,'e-under-c');
 PERFORM pg_temp.op('trash','e','trash-e');
 PERFORM pg_temp.op('trash','c','trash-c');
 PERFORM pg_temp.op('purge','c','purge-c','{"confirm_slug":"hier-c"}');
 ASSERT (SELECT parent_id IS NULL FROM tree WHERE name='e'), 'Child of purged parent not detached';
 PERFORM pg_temp.op('recover','e','recover-e');
 ASSERT (SELECT trashed_at IS NULL AND parent_id IS NULL FROM tree WHERE name='e');
END $$;
RESET ROLE;
-- Trash and permanent deletion keep every reservation (checked with owner rights).
DO $$ BEGIN
 ASSERT EXISTS (SELECT FROM public.page_slug_reservations WHERE slug='hier-d' AND was_published), 'Purge released a published URL';
 ASSERT EXISTS (SELECT FROM public.page_slug_reservations WHERE slug='hier-c'), 'Purge released a draft URL';
 ASSERT EXISTS (SELECT FROM public.page_slug_reservations WHERE slug='hier-b' AND was_published), 'Trash released a published URL';
 ASSERT NOT EXISTS (SELECT FROM public.page_write_requests WHERE page_id=(SELECT id FROM ids WHERE name='d') AND request_key<>'purge-d'), 'Retry payloads survived purge';
 ASSERT EXISTS (SELECT FROM public.page_write_requests WHERE page_id=(SELECT id FROM ids WHERE name='b') AND request_key='pub-b'), 'Unrelated receipts removed';
END $$;
-- Direct writes to hierarchy columns are still denied.
SELECT set_config('request.jwt.claims','{"sub":"29010000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}',true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 BEGIN UPDATE public.pages SET parent_id=NULL; RAISE EXCEPTION 'Direct hierarchy write'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN UPDATE public.pages SET trashed_at=now(); RAISE EXCEPTION 'Direct trash write'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims','{"sub":"29010000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal1"}',true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 BEGIN PERFORM public.write_page_atomic('trash','author-trash',NULL,gen_random_uuid(),gen_random_uuid()); RAISE EXCEPTION 'Author trash';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.write_page_atomic('move','author-move',NULL,gen_random_uuid(),gen_random_uuid(),false,false,NULL,'{"parent_id":null,"position":0}');
   RAISE EXCEPTION 'Author move'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
ROLLBACK;
