BEGIN;
-- Validate readiness while holding the working-row lock. Empty SEO fields are
-- allowed (title fallback / omitted description); existing size checks apply.
CREATE FUNCTION pages_private.publishable_document(value jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE node jsonb; meaningful boolean := false;
BEGIN
 IF NOT pages_private.valid_document(value) THEN RETURN false; END IF;
 IF value->>'version' = '1' THEN
   RETURN EXISTS (SELECT 1 FROM jsonb_array_elements(value->'blocks') b WHERE pages_private.has_text(b->>'text'));
 END IF;
 FOR node IN WITH RECURSIVE nodes(n) AS (
   SELECT value->'content'
   UNION ALL SELECT child FROM nodes CROSS JOIN LATERAL jsonb_array_elements(COALESCE(n->'content','[]'::jsonb)) child
 ) SELECT n FROM nodes LOOP
   IF node->>'type' = 'text' AND pages_private.has_text(node->>'text') THEN meaningful := true; END IF;
   IF node->>'type' = 'image' THEN
     IF NOT pages_private.has_text(node->'attrs'->>'alt') THEN RETURN false; END IF;
     meaningful := true;
   END IF;
 END LOOP;
 RETURN meaningful;
END;
$$;
REVOKE ALL ON FUNCTION pages_private.publishable_document(jsonb) FROM PUBLIC, anon, authenticated, service_role;
-- Replace, rather than overload, the RPC; omitted review fails closed.
DROP FUNCTION public.write_page_atomic(text,text,jsonb,uuid,uuid);
CREATE FUNCTION public.write_page_atomic(
 p_operation text, p_request_key text, p_values jsonb DEFAULT NULL,
 p_page_id uuid DEFAULT NULL, p_expected_revision uuid DEFAULT NULL, p_reviewed boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
 actor uuid := auth.uid();
 request jsonb;
 receipt public.page_write_requests;
 page public.pages;
 stamp timestamptz;
BEGIN
 IF NOT pages_private.can_manage() THEN RAISE EXCEPTION 'PAGE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF p_operation = 'publish' AND p_reviewed IS DISTINCT FROM true THEN
   RAISE EXCEPTION 'PAGE_REVIEW_REQUIRED';
 END IF;
 IF p_operation IS NULL OR p_operation NOT IN ('create','save','publish','unpublish')
   OR p_request_key IS NULL OR NOT pages_private.has_text(p_request_key) OR char_length(p_request_key) > 200 THEN
   RAISE EXCEPTION 'PAGE_INVALID_INPUT' USING ERRCODE='23514';
 END IF;
 IF (p_operation = 'create' AND (p_page_id IS NOT NULL OR p_expected_revision IS NOT NULL))
   OR (p_operation <> 'create' AND (p_page_id IS NULL OR p_expected_revision IS NULL))
   OR (p_operation IN ('publish','unpublish') AND p_values IS NOT NULL) THEN
   RAISE EXCEPTION 'PAGE_INVALID_INPUT' USING ERRCODE='23514';
 END IF;
 IF p_operation IN ('create','save') AND NOT pages_private.valid_values(p_values) THEN
   RAISE EXCEPTION 'PAGE_INVALID_DOCUMENT' USING ERRCODE='23514';
 END IF;
 request := jsonb_build_object('operation',p_operation,'values',p_values,'page_id',p_page_id,'revision',p_expected_revision);
 -- Serialize identical request identities even before the first page exists.
 PERFORM pg_advisory_xact_lock(hashtextextended(actor::text || ':' || p_request_key, 286));
 SELECT * INTO receipt FROM public.page_write_requests WHERE actor_id=actor AND request_key=p_request_key;
 IF FOUND THEN
   IF receipt.request <> request THEN RAISE EXCEPTION 'PAGE_RETRY_CONFLICT'; END IF;
   SELECT * INTO STRICT page FROM public.pages WHERE id=receipt.page_id;
   RETURN jsonb_build_object('page',to_jsonb(page),'replayed',true);
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
   IF p_operation = 'publish' AND NOT pages_private.publishable_document(page.document) THEN
     RAISE EXCEPTION 'PAGE_NOT_READY';
   END IF;
   IF p_operation = 'save' THEN
     UPDATE public.pages SET title=p_values->>'title',slug=p_values->>'slug',seo_title=p_values->>'seo_title',
       seo_description=p_values->>'seo_description',document=p_values->'document'
     WHERE id=page.id RETURNING * INTO page;
   END IF;
   UPDATE public.pages SET revision=gen_random_uuid(),updated_at=stamp,updated_by=actor,
     status=CASE p_operation WHEN 'publish' THEN 'published' WHEN 'unpublish' THEN 'draft' ELSE status END,
     published_at=CASE WHEN p_operation='publish' THEN stamp ELSE published_at END,
     published_by=CASE WHEN p_operation='publish' THEN actor ELSE published_by END
   WHERE id=page.id RETURNING * INTO page;
 END IF;
 INSERT INTO public.page_slug_reservations(slug,page_id) VALUES(page.slug,page.id) ON CONFLICT DO NOTHING;
 IF NOT EXISTS (SELECT 1 FROM public.page_slug_reservations WHERE slug=page.slug AND page_id=page.id) THEN
   RAISE EXCEPTION 'PAGE_SLUG_CONFLICT' USING ERRCODE='23505';
 END IF;
 IF p_operation='publish' THEN
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
 WHERE r.page_id=page.id AND r.slug<>page.slug
   AND NOT EXISTS (SELECT 1 FROM public.page_snapshots s WHERE s.page_id=page.id AND s.slug=r.slug);
 INSERT INTO public.page_write_requests(actor_id,request_key,request,page_id) VALUES(actor,p_request_key,request,page.id);
 RETURN jsonb_build_object('page',to_jsonb(page),'replayed',false);
END;
$$;
REVOKE ALL ON FUNCTION public.write_page_atomic(text,text,jsonb,uuid,uuid,boolean) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.write_page_atomic(text,text,jsonb,uuid,uuid,boolean) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
