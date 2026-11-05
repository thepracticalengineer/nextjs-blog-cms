BEGIN;
-- Recoverable trash, URL-safe permanent deletion and a bounded parent/child
-- hierarchy for pages. Public URLs stay flat: hierarchy never changes a slug,
-- a reservation or a public route. Requires 20261104110000_page_revisions.sql.
ALTER TABLE public.pages
 ADD COLUMN parent_id uuid REFERENCES public.pages(id) ON DELETE RESTRICT,
 ADD COLUMN position integer NOT NULL DEFAULT 0 CHECK (position >= 0),
 ADD COLUMN trashed_at timestamptz,
 ADD COLUMN trashed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
 ADD COLUMN purged_at timestamptz,
 ADD CONSTRAINT pages_not_own_parent CHECK (parent_id IS DISTINCT FROM id),
 ADD CONSTRAINT pages_purge_requires_trash CHECK (purged_at IS NULL OR trashed_at IS NOT NULL),
 ADD CONSTRAINT pages_trash_withdraws_publication CHECK (trashed_at IS NULL OR status = 'draft');
CREATE INDEX pages_parent_idx ON public.pages(parent_id, position, id) WHERE trashed_at IS NULL;
CREATE INDEX pages_trashed_idx ON public.pages(trashed_at DESC, id) WHERE trashed_at IS NOT NULL AND purged_at IS NULL;
CREATE INDEX pages_trashed_by_idx ON public.pages(trashed_by);
-- Existing pages become top-level siblings in their current list order.
UPDATE public.pages p SET position = ordered.n - 1
FROM (SELECT id, row_number() OVER (ORDER BY updated_at DESC, id) AS n FROM public.pages) ordered
WHERE ordered.id = p.id;

ALTER TABLE public.page_revisions DROP CONSTRAINT page_revisions_operation_check;
ALTER TABLE public.page_revisions ADD CONSTRAINT page_revisions_operation_check
 CHECK (operation IN ('baseline','create','save','publish','unpublish','restore','trash','recover','move','purge'));

-- Maximum hierarchy depth: a top-level page is depth 1.
CREATE FUNCTION pages_private.max_depth() RETURNS integer LANGUAGE sql IMMUTABLE SET search_path = '' AS $$ SELECT 3 $$;

-- Depth of a page counted from the top level (1), following parent links.
CREATE FUNCTION pages_private.depth(p_page uuid) RETURNS integer
LANGUAGE sql STABLE SET search_path = '' AS $$
 WITH RECURSIVE up(id, parent_id, n) AS (
   SELECT id, parent_id, 1 FROM public.pages WHERE id = p_page
   UNION ALL
   SELECT p.id, p.parent_id, up.n + 1 FROM public.pages p JOIN up ON p.id = up.parent_id WHERE up.n < 100
 ) SELECT COALESCE(max(n), 0) FROM up;
$$;

-- Levels in the subtree rooted at a page (1 for a leaf). Trashed descendants
-- count, so recovering them later can never exceed the depth bound.
CREATE FUNCTION pages_private.subtree_height(p_page uuid) RETURNS integer
LANGUAGE sql STABLE SET search_path = '' AS $$
 WITH RECURSIVE down(id, n) AS (
   SELECT id, 1 FROM public.pages WHERE id = p_page
   UNION ALL
   SELECT p.id, down.n + 1 FROM public.pages p JOIN down ON p.parent_id = down.id WHERE down.n < 100
 ) SELECT COALESCE(max(n), 0) FROM down;
$$;

CREATE FUNCTION pages_private.is_descendant(p_candidate uuid, p_ancestor uuid) RETURNS boolean
LANGUAGE sql STABLE SET search_path = '' AS $$
 WITH RECURSIVE up(id, parent_id, n) AS (
   SELECT id, parent_id, 0 FROM public.pages WHERE id = p_candidate
   UNION ALL
   SELECT p.id, p.parent_id, up.n + 1 FROM public.pages p JOIN up ON p.id = up.parent_id WHERE up.n < 100
 ) SELECT EXISTS (SELECT 1 FROM up WHERE id = p_ancestor);
$$;

-- Dense 0..n-1 order among active siblings, keeping their relative order.
CREATE FUNCTION pages_private.renumber_children(p_parent uuid) RETURNS void
LANGUAGE sql SET search_path = '' AS $$
 UPDATE public.pages p SET position = ordered.n - 1
 FROM (SELECT id, row_number() OVER (ORDER BY position, id) AS n FROM public.pages
       WHERE parent_id IS NOT DISTINCT FROM p_parent AND trashed_at IS NULL) ordered
 WHERE p.id = ordered.id AND p.position <> ordered.n - 1;
$$;
REVOKE ALL ON FUNCTION pages_private.max_depth(), pages_private.depth(uuid), pages_private.subtree_height(uuid),
 pages_private.is_descendant(uuid,uuid), pages_private.renumber_children(uuid) FROM PUBLIC, anon, authenticated, service_role;

DROP FUNCTION public.write_page_atomic(text,text,jsonb,uuid,uuid,boolean,boolean,uuid);
CREATE FUNCTION public.write_page_atomic(
 p_operation text, p_request_key text, p_values jsonb DEFAULT NULL,
 p_page_id uuid DEFAULT NULL, p_expected_revision uuid DEFAULT NULL, p_reviewed boolean DEFAULT false,
 p_confirm_url_change boolean DEFAULT false, p_source_revision uuid DEFAULT NULL, p_options jsonb DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
 actor uuid := auth.uid();
 request jsonb;
 receipt public.page_write_requests;
 page public.pages;
 source public.page_revisions;
 stamp timestamptz;
 old_parent uuid;
 new_parent uuid;
 new_position integer;
 parent_row public.pages;
BEGIN
 IF NOT pages_private.can_manage() THEN RAISE EXCEPTION 'PAGE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF p_operation = 'publish' AND p_reviewed IS DISTINCT FROM true THEN
   RAISE EXCEPTION 'PAGE_REVIEW_REQUIRED';
 END IF;
 IF p_operation IS NULL OR p_operation NOT IN ('create','save','publish','unpublish','restore','trash','recover','purge','move')
   OR p_request_key IS NULL OR NOT pages_private.has_text(p_request_key) OR char_length(p_request_key) > 200 THEN
   RAISE EXCEPTION 'PAGE_INVALID_INPUT' USING ERRCODE='23514';
 END IF;
 IF (p_operation = 'create' AND (p_page_id IS NOT NULL OR p_expected_revision IS NOT NULL))
   OR (p_operation <> 'create' AND (p_page_id IS NULL OR p_expected_revision IS NULL))
   OR (p_operation NOT IN ('create','save') AND p_values IS NOT NULL)
   OR ((p_operation = 'restore') <> (p_source_revision IS NOT NULL))
   OR ((p_operation IN ('move','purge')) <> (p_options IS NOT NULL)) THEN
   RAISE EXCEPTION 'PAGE_INVALID_INPUT' USING ERRCODE='23514';
 END IF;
 IF p_operation = 'move' AND (jsonb_typeof(p_options) <> 'object' OR p_options - ARRAY['parent_id','position'] <> '{}'::jsonb
   OR jsonb_typeof(p_options->'position') IS DISTINCT FROM 'number'
   OR jsonb_typeof(p_options->'parent_id') NOT IN ('string','null')) THEN
   RAISE EXCEPTION 'PAGE_INVALID_INPUT' USING ERRCODE='23514';
 END IF;
 IF p_operation = 'purge' AND (jsonb_typeof(p_options) <> 'object' OR p_options - ARRAY['confirm_slug'] <> '{}'::jsonb
   OR jsonb_typeof(p_options->'confirm_slug') IS DISTINCT FROM 'string') THEN
   RAISE EXCEPTION 'PAGE_INVALID_INPUT' USING ERRCODE='23514';
 END IF;
 IF p_operation = 'move' THEN
   BEGIN
     new_parent := (p_options->>'parent_id')::uuid;
     new_position := (p_options->>'position')::integer;
   EXCEPTION WHEN others THEN RAISE EXCEPTION 'PAGE_INVALID_INPUT' USING ERRCODE='23514';
   END;
   IF new_position IS NULL OR new_position < 0 OR new_position > 10000 OR (p_options->>'position') ~ '[.eE]' THEN
     RAISE EXCEPTION 'PAGE_INVALID_INPUT' USING ERRCODE='23514';
   END IF;
 END IF;
 IF p_operation IN ('create','save') AND NOT pages_private.valid_values(p_values) THEN
   RAISE EXCEPTION 'PAGE_INVALID_DOCUMENT' USING ERRCODE='23514';
 END IF;
 request := jsonb_build_object('operation',p_operation,'values',p_values,'page_id',p_page_id,'revision',p_expected_revision);
 IF p_confirm_url_change IS TRUE THEN request := request || jsonb_build_object('confirm_url_change',true); END IF;
 IF p_source_revision IS NOT NULL THEN request := request || jsonb_build_object('source_revision',p_source_revision); END IF;
 IF p_options IS NOT NULL THEN request := request || jsonb_build_object('options',p_options); END IF;
 -- Serialize identical request identities even before the first page exists.
 PERFORM pg_advisory_xact_lock(hashtextextended(actor::text || ':' || p_request_key, 286));
 SELECT * INTO receipt FROM public.page_write_requests WHERE actor_id=actor AND request_key=p_request_key;
 IF FOUND THEN
   IF receipt.request <> request THEN RAISE EXCEPTION 'PAGE_RETRY_CONFLICT'; END IF;
   SELECT * INTO STRICT page FROM public.pages WHERE id=receipt.page_id;
   RETURN jsonb_build_object('page',to_jsonb(page),'replayed',true);
 END IF;
 -- One global lock for structural changes: concurrent moves cannot create a
 -- cycle or exceed the depth bound by validating against stale ancestry.
 IF p_operation IN ('create','move','trash','recover','purge') THEN
   PERFORM pg_advisory_xact_lock(hashtextextended('pages-hierarchy', 290));
 END IF;
 IF p_operation IN ('create','save') AND NOT pages_private.available_slug(p_values->>'slug') THEN
   RAISE EXCEPTION 'PAGE_RESERVED_URL';
 END IF;
 stamp := clock_timestamp();
 IF p_operation = 'create' THEN
   INSERT INTO public.pages(title,slug,seo_title,seo_description,document,created_by,updated_by,created_at,updated_at,position)
   VALUES(p_values->>'title',p_values->>'slug',p_values->>'seo_title',p_values->>'seo_description',p_values->'document',actor,actor,stamp,stamp,
     (SELECT count(*) FROM public.pages WHERE parent_id IS NULL AND trashed_at IS NULL))
   RETURNING * INTO page;
 ELSE
   SELECT * INTO page FROM public.pages WHERE id=p_page_id FOR UPDATE;
   IF NOT FOUND OR page.purged_at IS NOT NULL THEN RAISE EXCEPTION 'PAGE_NOT_FOUND' USING ERRCODE='P0002'; END IF;
   IF page.revision <> p_expected_revision THEN RAISE EXCEPTION 'PAGE_STALE'; END IF;
   IF p_operation IN ('recover','purge') AND page.trashed_at IS NULL THEN RAISE EXCEPTION 'PAGE_NOT_TRASHED'; END IF;
   IF p_operation NOT IN ('recover','purge') AND page.trashed_at IS NOT NULL THEN RAISE EXCEPTION 'PAGE_TRASHED'; END IF;
   old_parent := page.parent_id;
   IF p_operation = 'publish' AND NOT pages_private.available_slug(page.slug) THEN
     RAISE EXCEPTION 'PAGE_RESERVED_URL';
   END IF;
   IF p_operation = 'publish' AND page.published_slug IS NOT NULL AND page.published_slug <> page.slug
      AND p_confirm_url_change IS DISTINCT FROM true THEN
     RAISE EXCEPTION 'PAGE_URL_CONFIRMATION_REQUIRED';
   END IF;
   IF p_operation = 'publish' AND NOT pages_private.publishable_document(page.document) THEN
     RAISE EXCEPTION 'PAGE_NOT_READY';
   END IF;
   IF p_operation = 'trash' AND EXISTS (SELECT 1 FROM public.pages WHERE parent_id=page.id AND trashed_at IS NULL) THEN
     -- Children are never silently trashed, deleted or orphaned.
     RAISE EXCEPTION 'PAGE_HAS_CHILDREN';
   END IF;
   IF p_operation = 'recover' AND page.parent_id IS NOT NULL THEN
     SELECT * INTO parent_row FROM public.pages WHERE id=page.parent_id;
     IF parent_row.trashed_at IS NOT NULL THEN RAISE EXCEPTION 'PAGE_PARENT_TRASHED'; END IF;
   END IF;
   IF p_operation = 'purge' AND p_options->>'confirm_slug' IS DISTINCT FROM page.slug THEN
     RAISE EXCEPTION 'PAGE_DELETE_CONFIRMATION_REQUIRED';
   END IF;
   IF p_operation = 'move' THEN
     IF new_parent IS NOT NULL THEN
       SELECT * INTO parent_row FROM public.pages WHERE id=new_parent;
       IF NOT FOUND OR parent_row.purged_at IS NOT NULL THEN RAISE EXCEPTION 'PAGE_PARENT_NOT_FOUND'; END IF;
       IF parent_row.trashed_at IS NOT NULL THEN RAISE EXCEPTION 'PAGE_PARENT_TRASHED'; END IF;
       IF new_parent = page.id OR pages_private.is_descendant(new_parent, page.id) THEN RAISE EXCEPTION 'PAGE_HIERARCHY_CYCLE'; END IF;
       IF pages_private.depth(new_parent) + pages_private.subtree_height(page.id) > pages_private.max_depth() THEN
         RAISE EXCEPTION 'PAGE_HIERARCHY_TOO_DEEP';
       END IF;
     END IF;
   END IF;
   IF p_operation = 'restore' THEN
     -- A revision restores only into its own page, and only as working content.
     SELECT * INTO source FROM public.page_revisions WHERE revision=p_source_revision AND page_id=page.id;
     IF NOT FOUND THEN RAISE EXCEPTION 'PAGE_REVISION_NOT_FOUND' USING ERRCODE='P0002'; END IF;
     IF NOT pages_private.available_slug(source.slug) THEN RAISE EXCEPTION 'PAGE_RESERVED_URL'; END IF;
     UPDATE public.pages SET title=source.title,slug=source.slug,seo_title=source.seo_title,
       seo_description=source.seo_description,document=source.document
     WHERE id=page.id RETURNING * INTO page;
   ELSIF p_operation = 'save' THEN
     UPDATE public.pages SET title=p_values->>'title',slug=p_values->>'slug',seo_title=p_values->>'seo_title',
       seo_description=p_values->>'seo_description',document=p_values->'document'
     WHERE id=page.id RETURNING * INTO page;
   ELSIF p_operation = 'move' THEN
     -- Leave the old slot, make room among the destination's active siblings,
     -- then compact both lists. new_position counts siblings excluding this page.
     UPDATE public.pages SET position=position-1
     WHERE parent_id IS NOT DISTINCT FROM old_parent AND trashed_at IS NULL AND id<>page.id AND position>page.position;
     UPDATE public.pages SET position=position+1
     WHERE parent_id IS NOT DISTINCT FROM new_parent AND trashed_at IS NULL AND id<>page.id AND position>=new_position;
     UPDATE public.pages SET parent_id=new_parent,position=new_position WHERE id=page.id RETURNING * INTO page;
   ELSIF p_operation = 'trash' THEN
     -- Withdraw publication; URL reservations stay so no other page can claim them.
     UPDATE public.pages SET trashed_at=stamp,trashed_by=actor,status='draft' WHERE id=page.id RETURNING * INTO page;
   ELSIF p_operation = 'recover' THEN
     -- Recovered pages return unpublished, at the end of their siblings.
     UPDATE public.pages SET trashed_at=NULL,trashed_by=NULL,
       position=(SELECT count(*) FROM public.pages WHERE parent_id IS NOT DISTINCT FROM page.parent_id AND trashed_at IS NULL)
     WHERE id=page.id RETURNING * INTO page;
   ELSIF p_operation = 'purge' THEN
     -- Permanent deletion erases content, history and retry payloads but keeps a
     -- tombstone row, so every URL this page ever reserved stays unclaimable.
     DELETE FROM public.page_revisions WHERE page_id=page.id;
     DELETE FROM public.page_write_requests WHERE page_id=page.id;
     UPDATE public.pages SET parent_id=NULL WHERE parent_id=page.id;
     UPDATE public.pages SET title='Deleted page',seo_title='',seo_description='',
       document='{"version":2,"content":{"type":"doc","content":[]}}'::jsonb,
       parent_id=NULL,purged_at=stamp
     WHERE id=page.id RETURNING * INTO page;
   END IF;
   -- Restore leaves status and the published snapshot untouched: the restored
   -- content goes live only through a separately reviewed publish.
   UPDATE public.pages SET revision=gen_random_uuid(),updated_at=stamp,updated_by=actor,
     status=CASE WHEN p_operation='publish' THEN 'published' WHEN p_operation IN ('unpublish','trash') THEN 'draft' ELSE status END,
     published_at=CASE WHEN p_operation='publish' THEN stamp ELSE published_at END,
     published_slug=CASE WHEN p_operation='publish' THEN slug ELSE published_slug END,
     published_by=CASE WHEN p_operation='publish' THEN actor ELSE published_by END
   WHERE id=page.id RETURNING * INTO page;
   IF p_operation IN ('move','trash','recover') THEN
     PERFORM pages_private.renumber_children(old_parent);
     IF page.parent_id IS DISTINCT FROM old_parent THEN PERFORM pages_private.renumber_children(page.parent_id); END IF;
     SELECT * INTO page FROM public.pages WHERE id=page.id;
   END IF;
 END IF;
 INSERT INTO public.page_slug_reservations(slug,page_id) VALUES(page.slug,page.id) ON CONFLICT DO NOTHING;
 IF NOT EXISTS (SELECT 1 FROM public.page_slug_reservations WHERE slug=page.slug AND page_id=page.id) THEN
   RAISE EXCEPTION 'PAGE_SLUG_CONFLICT' USING ERRCODE='23505';
 END IF;
 IF p_operation='publish' THEN
   UPDATE public.page_slug_reservations SET was_published=true WHERE page_id=page.id AND slug=page.slug;
   INSERT INTO public.page_snapshots(page_id,title,slug,seo_title,seo_description,document,revision,published_at)
   VALUES(page.id,page.title,page.slug,page.seo_title,page.seo_description,page.document,page.revision,stamp)
   ON CONFLICT(page_id) DO UPDATE SET title=EXCLUDED.title,slug=EXCLUDED.slug,seo_title=EXCLUDED.seo_title,
     seo_description=EXCLUDED.seo_description,document=EXCLUDED.document,revision=EXCLUDED.revision,published_at=EXCLUDED.published_at;
 ELSIF p_operation IN ('unpublish','trash','purge') THEN
   DELETE FROM public.page_snapshots WHERE page_id=page.id;
 END IF;
 -- Prune only after the snapshot transition, under the same page lock and
 -- transaction. A failed save cannot release the current working/live slug.
 DELETE FROM public.page_slug_reservations r
 WHERE r.page_id=page.id AND NOT r.was_published AND r.slug<>page.slug
   AND NOT EXISTS (SELECT 1 FROM public.page_snapshots s WHERE s.page_id=page.id AND s.slug=r.slug);
 INSERT INTO public.page_revisions(page_id,revision,operation,title,slug,seo_title,seo_description,document,status,restored_from,created_by,created_at)
 VALUES(page.id,page.revision,p_operation,page.title,page.slug,page.seo_title,page.seo_description,page.document,page.status,p_source_revision,actor,stamp);
 INSERT INTO public.page_write_requests(actor_id,request_key,request,page_id) VALUES(actor,p_request_key,request,page.id);
 RETURN jsonb_build_object('page',to_jsonb(page),'replayed',false);
END;
$$;
REVOKE ALL ON FUNCTION public.write_page_atomic(text,text,jsonb,uuid,uuid,boolean,boolean,uuid,jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.write_page_atomic(text,text,jsonb,uuid,uuid,boolean,boolean,uuid,jsonb) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
