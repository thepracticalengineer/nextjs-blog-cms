BEGIN;
-- Private, append-only page history. Every successful write records the exact
-- working state it produced. History starts here: earlier saves were never
-- stored, so each existing page receives one 'baseline' row for its current
-- working state. Snapshots, reservations and post tables are unchanged.
CREATE TABLE public.page_revisions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 page_id uuid NOT NULL REFERENCES public.pages(id) ON DELETE CASCADE,
 revision uuid NOT NULL UNIQUE,
 operation text NOT NULL CHECK (operation IN ('baseline','create','save','publish','unpublish','restore')),
 title text NOT NULL,
 slug text NOT NULL,
 seo_title text NOT NULL,
 seo_description text NOT NULL,
 document jsonb NOT NULL,
 status text NOT NULL CHECK (status IN ('draft','published')),
 restored_from uuid,
 created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CONSTRAINT page_revisions_restore_source CHECK ((operation = 'restore') = (restored_from IS NOT NULL)),
 CONSTRAINT page_revisions_valid_values CHECK (pages_private.valid_values(jsonb_build_object(
   'title',title,'slug',slug,'seo_title',seo_title,'seo_description',seo_description,'document',document)))
);
CREATE INDEX page_revisions_page_idx ON public.page_revisions(page_id, created_at DESC, id DESC);
CREATE INDEX page_revisions_created_by_idx ON public.page_revisions(created_by);
ALTER TABLE public.page_revisions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.page_revisions FROM PUBLIC, anon, authenticated, service_role;
-- Read-only for administrators; writes happen only inside write_page_atomic.
GRANT SELECT ON public.page_revisions TO authenticated;
CREATE POLICY "Admins read page revisions" ON public.page_revisions FOR SELECT TO authenticated
 USING ((SELECT pages_private.can_manage()));

INSERT INTO public.page_revisions(page_id,revision,operation,title,slug,seo_title,seo_description,document,status,created_by,created_at)
SELECT id,revision,'baseline',title,slug,seo_title,seo_description,document,status,updated_by,updated_at FROM public.pages;

DROP FUNCTION public.write_page_atomic(text,text,jsonb,uuid,uuid,boolean,boolean);
CREATE FUNCTION public.write_page_atomic(
 p_operation text, p_request_key text, p_values jsonb DEFAULT NULL,
 p_page_id uuid DEFAULT NULL, p_expected_revision uuid DEFAULT NULL, p_reviewed boolean DEFAULT false,
 p_confirm_url_change boolean DEFAULT false, p_source_revision uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
 actor uuid := auth.uid();
 request jsonb;
 receipt public.page_write_requests;
 page public.pages;
 source public.page_revisions;
 stamp timestamptz;
BEGIN
 IF NOT pages_private.can_manage() THEN RAISE EXCEPTION 'PAGE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF p_operation = 'publish' AND p_reviewed IS DISTINCT FROM true THEN
   RAISE EXCEPTION 'PAGE_REVIEW_REQUIRED';
 END IF;
 IF p_operation IS NULL OR p_operation NOT IN ('create','save','publish','unpublish','restore')
   OR p_request_key IS NULL OR NOT pages_private.has_text(p_request_key) OR char_length(p_request_key) > 200 THEN
   RAISE EXCEPTION 'PAGE_INVALID_INPUT' USING ERRCODE='23514';
 END IF;
 IF (p_operation = 'create' AND (p_page_id IS NOT NULL OR p_expected_revision IS NOT NULL))
   OR (p_operation <> 'create' AND (p_page_id IS NULL OR p_expected_revision IS NULL))
   OR (p_operation IN ('publish','unpublish','restore') AND p_values IS NOT NULL)
   OR ((p_operation = 'restore') <> (p_source_revision IS NOT NULL)) THEN
   RAISE EXCEPTION 'PAGE_INVALID_INPUT' USING ERRCODE='23514';
 END IF;
 IF p_operation IN ('create','save') AND NOT pages_private.valid_values(p_values) THEN
   RAISE EXCEPTION 'PAGE_INVALID_DOCUMENT' USING ERRCODE='23514';
 END IF;
 request := jsonb_build_object('operation',p_operation,'values',p_values,'page_id',p_page_id,'revision',p_expected_revision);
 IF p_confirm_url_change IS TRUE THEN request := request || jsonb_build_object('confirm_url_change',true); END IF;
 IF p_source_revision IS NOT NULL THEN request := request || jsonb_build_object('source_revision',p_source_revision); END IF;
 -- Serialize identical request identities even before the first page exists.
 PERFORM pg_advisory_xact_lock(hashtextextended(actor::text || ':' || p_request_key, 286));
 SELECT * INTO receipt FROM public.page_write_requests WHERE actor_id=actor AND request_key=p_request_key;
 IF FOUND THEN
   IF receipt.request <> request THEN RAISE EXCEPTION 'PAGE_RETRY_CONFLICT'; END IF;
   SELECT * INTO STRICT page FROM public.pages WHERE id=receipt.page_id;
   RETURN jsonb_build_object('page',to_jsonb(page),'replayed',true);
 END IF;
 IF p_operation IN ('create','save') AND NOT pages_private.available_slug(p_values->>'slug') THEN
   RAISE EXCEPTION 'PAGE_RESERVED_URL';
 END IF;
 stamp := clock_timestamp();
 IF p_operation = 'create' THEN
   INSERT INTO public.pages(title,slug,seo_title,seo_description,document,created_by,updated_by,created_at,updated_at)
   VALUES(p_values->>'title',p_values->>'slug',p_values->>'seo_title',p_values->>'seo_description',p_values->'document',actor,actor,stamp,stamp)
   RETURNING * INTO page;
 ELSE
   SELECT * INTO page FROM public.pages WHERE id=p_page_id FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'PAGE_NOT_FOUND' USING ERRCODE='P0002'; END IF;
   IF page.revision <> p_expected_revision THEN RAISE EXCEPTION 'PAGE_STALE'; END IF;
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
   END IF;
   -- Restore leaves status and the published snapshot untouched: the restored
   -- content goes live only through a separately reviewed publish.
   UPDATE public.pages SET revision=gen_random_uuid(),updated_at=stamp,updated_by=actor,
     status=CASE p_operation WHEN 'publish' THEN 'published' WHEN 'unpublish' THEN 'draft' ELSE status END,
     published_at=CASE WHEN p_operation='publish' THEN stamp ELSE published_at END,
     published_slug=CASE WHEN p_operation='publish' THEN slug ELSE published_slug END,
     published_by=CASE WHEN p_operation='publish' THEN actor ELSE published_by END
   WHERE id=page.id RETURNING * INTO page;
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
 ELSIF p_operation='unpublish' THEN
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
REVOKE ALL ON FUNCTION public.write_page_atomic(text,text,jsonb,uuid,uuid,boolean,boolean,uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.write_page_atomic(text,text,jsonb,uuid,uuid,boolean,boolean,uuid) TO authenticated;

-- Summary listing without documents. Author names come from private profiles,
-- so the join runs with definer rights only after the administrator check.
CREATE FUNCTION public.list_page_revisions(p_page_id uuid, p_limit integer DEFAULT 50) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
 IF NOT pages_private.can_manage() THEN RAISE EXCEPTION 'PAGE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF p_page_id IS NULL OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 THEN
   RAISE EXCEPTION 'PAGE_INVALID_INPUT' USING ERRCODE='23514';
 END IF;
 RETURN COALESCE((SELECT jsonb_agg(item ORDER BY created_at DESC, id DESC) FROM (
   SELECT r.id, r.created_at, jsonb_build_object('id',r.id,'revision',r.revision,'operation',r.operation,
     'title',r.title,'slug',r.slug,'status',r.status,'restored_from',r.restored_from,
     'created_by',r.created_by,'author_name',p.full_name,'created_at',r.created_at) AS item
   FROM public.page_revisions r LEFT JOIN public.profiles p ON p.id=r.created_by
   WHERE r.page_id=p_page_id ORDER BY r.created_at DESC, r.id DESC LIMIT p_limit) listed), '[]'::jsonb);
END;
$$;
REVOKE ALL ON FUNCTION public.list_page_revisions(uuid,integer) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_page_revisions(uuid,integer) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
