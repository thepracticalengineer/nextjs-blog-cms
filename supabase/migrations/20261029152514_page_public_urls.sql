BEGIN;
-- Existing reserved-name drafts remain editable: choose a new available slug.
-- Never rewrite content or silently withdraw snapshots during upgrade.
CREATE FUNCTION pages_private.available_slug(value text) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
 SELECT value IS NOT NULL AND char_length(value) BETWEEN 1 AND 120
 AND value ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
 AND value <> ALL(ARRAY['blog','dashboard','authors','api','auth','login','register','mfa',
 'forgot-password','reset-password','confirm-email','onboarding-unavailable','newsletter',
 'screenshots','sitemap','robots','favicon']);
$$;
REVOKE ALL ON FUNCTION pages_private.available_slug(text) FROM PUBLIC, anon, authenticated, service_role;
ALTER TABLE public.pages ADD COLUMN published_slug text;
ALTER TABLE public.page_slug_reservations ADD COLUMN was_published boolean NOT NULL DEFAULT false;
UPDATE public.pages p SET published_slug=s.slug FROM public.page_snapshots s WHERE s.page_id=p.id;
UPDATE public.page_slug_reservations r SET was_published=true FROM public.page_snapshots s
 WHERE s.page_id=r.page_id AND s.slug=r.slug;
DROP FUNCTION public.write_page_atomic(text,text,jsonb,uuid,uuid,boolean);
CREATE FUNCTION public.write_page_atomic(
 p_operation text, p_request_key text, p_values jsonb DEFAULT NULL,
 p_page_id uuid DEFAULT NULL, p_expected_revision uuid DEFAULT NULL, p_reviewed boolean DEFAULT false, p_confirm_url_change boolean DEFAULT false
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
 IF p_confirm_url_change IS TRUE THEN request := request || jsonb_build_object('confirm_url_change',true); END IF;
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
   IF p_operation = 'save' THEN
     UPDATE public.pages SET title=p_values->>'title',slug=p_values->>'slug',seo_title=p_values->>'seo_title',
       seo_description=p_values->>'seo_description',document=p_values->'document'
     WHERE id=page.id RETURNING * INTO page;
   END IF;
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
 INSERT INTO public.page_write_requests(actor_id,request_key,request,page_id) VALUES(actor,p_request_key,request,page.id);
 RETURN jsonb_build_object('page',to_jsonb(page),'replayed',false);
END;
$$;
REVOKE ALL ON FUNCTION public.write_page_atomic(text,text,jsonb,uuid,uuid,boolean,boolean) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.write_page_atomic(text,text,jsonb,uuid,uuid,boolean,boolean) TO authenticated;

-- Only a formerly published claim joined to a CURRENT snapshot is public.
-- No working titles, pending slugs or withdrawn destinations can escape.
CREATE FUNCTION public.resolve_page_path(p_slug text) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT to_jsonb(s) FROM public.page_slug_reservations r
 JOIN public.page_snapshots s ON s.page_id=r.page_id
 WHERE r.slug=lower(p_slug) AND r.was_published
 AND pages_private.available_slug(lower(p_slug)) AND pages_private.available_slug(s.slug);
$$;
REVOKE ALL ON FUNCTION public.resolve_page_path(text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.resolve_page_path(text) TO anon, authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
