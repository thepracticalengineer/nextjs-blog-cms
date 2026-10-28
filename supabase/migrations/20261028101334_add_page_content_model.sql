BEGIN;
CREATE SCHEMA IF NOT EXISTS pages_private;
REVOKE ALL ON SCHEMA pages_private FROM PUBLIC, anon, authenticated, service_role;
GRANT USAGE ON SCHEMA pages_private TO authenticated;

CREATE FUNCTION pages_private.can_manage() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT auth.uid() IS NOT NULL
   AND auth_private.has_required_assurance()
   AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin');
$$;
REVOKE ALL ON FUNCTION pages_private.can_manage() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION pages_private.can_manage() TO authenticated;

-- ECMAScript trim whitespace, explicitly enumerated for validator parity.
CREATE FUNCTION pages_private.has_text(value text) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
 SELECT COALESCE(regexp_replace(value, U&'[\0009-\000D\0020\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]', '', 'g') <> '', false);
$$;
REVOKE ALL ON FUNCTION pages_private.has_text(text) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION pages_private.valid_document(value jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE block jsonb;
BEGIN
 IF value IS NULL OR jsonb_typeof(value) <> 'object'
   OR value - ARRAY['version','blocks'] <> '{}'::jsonb
   OR value->'version' IS DISTINCT FROM '1'::jsonb
   OR jsonb_typeof(value->'blocks') IS DISTINCT FROM 'array' THEN RETURN false; END IF;
 IF jsonb_array_length(value->'blocks') > 500 THEN RETURN false; END IF;
 FOR block IN SELECT * FROM jsonb_array_elements(value->'blocks') LOOP
   IF jsonb_typeof(block) <> 'object' OR block - ARRAY['type','text'] <> '{}'::jsonb
     OR block->>'type' IS DISTINCT FROM 'paragraph'
     OR jsonb_typeof(block->'text') IS DISTINCT FROM 'string'
     OR char_length(block->>'text') > 10000 THEN RETURN false; END IF;
 END LOOP;
 RETURN true;
END;
$$;
CREATE FUNCTION pages_private.valid_values(value jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
BEGIN
 IF value IS NULL OR jsonb_typeof(value) <> 'object'
   OR value - ARRAY['title','slug','seo_title','seo_description','document'] <> '{}'::jsonb
   OR jsonb_typeof(value->'title') IS DISTINCT FROM 'string'
   OR NOT pages_private.has_text(value->>'title') OR char_length(value->>'title') > 200
   OR jsonb_typeof(value->'slug') IS DISTINCT FROM 'string'
   OR char_length(value->>'slug') > 120 OR (value->>'slug') !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
   OR jsonb_typeof(value->'seo_title') IS DISTINCT FROM 'string' OR char_length(value->>'seo_title') > 200
   OR jsonb_typeof(value->'seo_description') IS DISTINCT FROM 'string' OR char_length(value->>'seo_description') > 500
   THEN RETURN false; END IF;
 RETURN pages_private.valid_document(value->'document');
END;
$$;
REVOKE ALL ON FUNCTION pages_private.valid_document(jsonb), pages_private.valid_values(jsonb) FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE public.pages (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 title text NOT NULL,
 slug text NOT NULL,
 seo_title text NOT NULL,
 seo_description text NOT NULL,
 document jsonb NOT NULL,
 status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')),
 revision uuid NOT NULL DEFAULT gen_random_uuid(),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
 updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
 published_at timestamptz,
 published_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
 CONSTRAINT pages_valid_values CHECK (pages_private.valid_values(jsonb_build_object(
   'title',title,'slug',slug,'seo_title',seo_title,'seo_description',seo_description,'document',document)))
);
CREATE INDEX pages_created_by_idx ON public.pages(created_by);
CREATE INDEX pages_updated_by_idx ON public.pages(updated_by);
CREATE INDEX pages_published_by_idx ON public.pages(published_by);
CREATE INDEX pages_updated_at_idx ON public.pages(updated_at DESC, id);

-- This table contains ONLY intentionally published fields, never working data.
CREATE TABLE public.page_snapshots (
 page_id uuid PRIMARY KEY REFERENCES public.pages(id) ON DELETE CASCADE,
 title text NOT NULL,
 slug text NOT NULL UNIQUE,
 seo_title text NOT NULL,
 seo_description text NOT NULL,
 document jsonb NOT NULL,
 revision uuid NOT NULL,
 published_at timestamptz NOT NULL,
 CONSTRAINT page_snapshots_valid_values CHECK (pages_private.valid_values(jsonb_build_object(
   'title',title,'slug',slug,'seo_title',seo_title,'seo_description',seo_description,'document',document)))
);
-- Reserve every claimed page slug. Post URL reservations remain independent.
CREATE TABLE public.page_slug_reservations (
 slug text PRIMARY KEY,
 page_id uuid NOT NULL REFERENCES public.pages(id) ON DELETE CASCADE
);
CREATE INDEX page_slug_reservations_page_idx ON public.page_slug_reservations(page_id);
CREATE TABLE public.page_write_requests (
 actor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 request_key text NOT NULL,
 request jsonb NOT NULL,
 page_id uuid NOT NULL REFERENCES public.pages(id) ON DELETE CASCADE,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(actor_id,request_key)
);
CREATE INDEX page_write_requests_page_idx ON public.page_write_requests(page_id);
ALTER TABLE public.pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.page_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.page_slug_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.page_write_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pages, public.page_snapshots, public.page_slug_reservations, public.page_write_requests FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.pages TO authenticated;
GRANT SELECT ON public.page_snapshots TO anon, authenticated;
CREATE POLICY "Admins read working pages" ON public.pages FOR SELECT TO authenticated
 USING ((SELECT pages_private.can_manage()));
CREATE POLICY "Published snapshots are public" ON public.page_snapshots FOR SELECT TO anon, authenticated USING (true);

-- The sole mutation boundary. Identity is derived from the authenticated caller,
-- never a client-supplied actor or a service-role parameter. Definer privileges
-- are needed because direct table mutation grants are deliberately absent.
CREATE FUNCTION public.write_page_atomic(
 p_operation text, p_request_key text, p_values jsonb DEFAULT NULL,
 p_page_id uuid DEFAULT NULL, p_expected_revision uuid DEFAULT NULL
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
 INSERT INTO public.page_write_requests(actor_id,request_key,request,page_id) VALUES(actor,p_request_key,request,page.id);
 RETURN jsonb_build_object('page',to_jsonb(page),'replayed',false);
END;
$$;
REVOKE ALL ON FUNCTION public.write_page_atomic(text,text,jsonb,uuid,uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.write_page_atomic(text,text,jsonb,uuid,uuid) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
