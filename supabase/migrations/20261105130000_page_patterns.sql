BEGIN;
-- Issue #291: starter layout placeholders and saved section patterns.
--
-- 1. Publication readiness additionally refuses starter-layout placeholder copy:
--    text or button labels containing "[[Replace" and button/link destinations
--    starting with "#replace-link" (ASCII, case-insensitive). This matches
--    features/pages/placeholders.ts. Existing snapshots are not withdrawn.
-- 2. page_patterns stores reusable block sequences. A pattern is only ever
--    copied into a page: pages hold no reference to it, so pattern writes cannot
--    change working pages, revisions or published snapshots. There are no
--    synced sections.
CREATE FUNCTION pages_private.has_placeholder(value jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
 WITH RECURSIVE nodes(n) AS (
   SELECT CASE WHEN value->>'version' = '2' THEN value->'content' END
   UNION ALL SELECT child FROM nodes CROSS JOIN LATERAL jsonb_array_elements(
     CASE WHEN jsonb_typeof(n->'content') = 'array' THEN n->'content' ELSE '[]'::jsonb END) child
 )
 SELECT EXISTS (SELECT 1 FROM jsonb_array_elements(CASE WHEN value->>'version' = '1' AND jsonb_typeof(value->'blocks') = 'array' THEN value->'blocks' ELSE '[]'::jsonb END) b
     WHERE strpos(lower(b->>'text'), '[[replace') > 0)
   OR EXISTS (SELECT 1 FROM nodes WHERE n IS NOT NULL AND (
     (n->>'type' = 'text' AND strpos(lower(n->>'text'), '[[replace') > 0)
     OR (n->>'type' = 'button' AND (strpos(lower(n->'attrs'->>'label'), '[[replace') > 0 OR left(lower(n->'attrs'->>'href'), 13) = '#replace-link'))
     OR (n->>'type' = 'text' AND jsonb_typeof(n->'marks') = 'array' AND EXISTS (
       SELECT 1 FROM jsonb_array_elements(n->'marks') m WHERE m->>'type' = 'link' AND left(lower(m->'attrs'->>'href'), 13) = '#replace-link'))));
$$;
REVOKE ALL ON FUNCTION pages_private.has_placeholder(jsonb) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION pages_private.publishable_document(value jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE node jsonb; meaningful boolean := false;
BEGIN
 IF NOT pages_private.valid_document(value) THEN RETURN false; END IF;
 IF pages_private.has_placeholder(value) THEN RETURN false; END IF;
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

-- Same document validator and limits as pages, restricted to version 2 with
-- 1–100 top-level blocks. Name 1–120 code points (not only whitespace),
-- description up to 500.
CREATE FUNCTION pages_private.valid_pattern(p_name text, p_description text, p_document jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
BEGIN
 IF p_name IS NULL OR NOT pages_private.has_text(p_name) OR char_length(p_name) > 120
   OR p_description IS NULL OR char_length(p_description) > 500
   OR p_document IS NULL OR jsonb_typeof(p_document) <> 'object'
   OR p_document->'version' IS DISTINCT FROM '2'::jsonb
   OR jsonb_typeof(p_document->'content'->'content') IS DISTINCT FROM 'array' THEN RETURN false; END IF;
 IF jsonb_array_length(p_document->'content'->'content') NOT BETWEEN 1 AND 100 THEN RETURN false; END IF;
 RETURN pages_private.valid_document(p_document);
END;
$$;
CREATE FUNCTION pages_private.valid_pattern_values(value jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
BEGIN
 IF value IS NULL OR jsonb_typeof(value) <> 'object'
   OR value - ARRAY['name','description','document'] <> '{}'::jsonb
   OR jsonb_typeof(value->'name') IS DISTINCT FROM 'string'
   OR jsonb_typeof(value->'description') IS DISTINCT FROM 'string' THEN RETURN false; END IF;
 RETURN pages_private.valid_pattern(value->>'name', value->>'description', value->'document');
END;
$$;
REVOKE ALL ON FUNCTION pages_private.valid_pattern(text,text,jsonb), pages_private.valid_pattern_values(jsonb) FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE public.page_patterns (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 name text NOT NULL,
 description text NOT NULL DEFAULT '',
 document jsonb NOT NULL,
 revision uuid NOT NULL DEFAULT gen_random_uuid(),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
 updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
 CONSTRAINT page_patterns_valid CHECK (pages_private.valid_pattern(name, description, document))
);
CREATE INDEX page_patterns_updated_idx ON public.page_patterns(updated_at DESC, id DESC);
CREATE INDEX page_patterns_created_by_idx ON public.page_patterns(created_by);
CREATE INDEX page_patterns_updated_by_idx ON public.page_patterns(updated_by);
-- Retry receipts outlive a deleted pattern, so pattern_id is not a foreign key.
CREATE TABLE public.page_pattern_write_requests (
 actor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 request_key text NOT NULL,
 request jsonb NOT NULL,
 pattern_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(actor_id, request_key)
);
ALTER TABLE public.page_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.page_pattern_write_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.page_patterns, public.page_pattern_write_requests FROM PUBLIC, anon, authenticated, service_role;
-- Shared, private library for page administrators. Writes only through the RPC.
GRANT SELECT ON public.page_patterns TO authenticated;
CREATE POLICY "Admins read page patterns" ON public.page_patterns FOR SELECT TO authenticated
 USING ((SELECT pages_private.can_manage()));

CREATE FUNCTION public.write_page_pattern(
 p_operation text, p_request_key text, p_values jsonb DEFAULT NULL,
 p_pattern_id uuid DEFAULT NULL, p_expected_revision uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
 actor uuid := auth.uid();
 request jsonb;
 receipt public.page_pattern_write_requests;
 pattern public.page_patterns;
 stamp timestamptz;
BEGIN
 IF NOT pages_private.can_manage() THEN RAISE EXCEPTION 'PAGE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF p_operation IS NULL OR p_operation NOT IN ('create','update','delete')
   OR p_request_key IS NULL OR NOT pages_private.has_text(p_request_key) OR char_length(p_request_key) > 200
   OR (p_operation = 'create' AND (p_pattern_id IS NOT NULL OR p_expected_revision IS NOT NULL))
   OR (p_operation <> 'create' AND (p_pattern_id IS NULL OR p_expected_revision IS NULL))
   OR (p_operation = 'delete' AND p_values IS NOT NULL) THEN
   RAISE EXCEPTION 'PAGE_INVALID_INPUT' USING ERRCODE='23514';
 END IF;
 IF p_operation IN ('create','update') AND NOT pages_private.valid_pattern_values(p_values) THEN
   RAISE EXCEPTION 'PAGE_PATTERN_INVALID' USING ERRCODE='23514';
 END IF;
 request := jsonb_build_object('operation',p_operation,'values',p_values,'pattern_id',p_pattern_id,'revision',p_expected_revision);
 PERFORM pg_advisory_xact_lock(hashtextextended(actor::text || ':' || p_request_key, 291));
 SELECT * INTO receipt FROM public.page_pattern_write_requests WHERE actor_id=actor AND request_key=p_request_key;
 IF FOUND THEN
   IF receipt.request <> request THEN RAISE EXCEPTION 'PAGE_RETRY_CONFLICT'; END IF;
   -- An exact replay returns the current pattern (null once deleted) without repeating the write.
   SELECT * INTO pattern FROM public.page_patterns WHERE id=receipt.pattern_id;
   RETURN jsonb_build_object('pattern',CASE WHEN FOUND THEN to_jsonb(pattern) END,'replayed',true);
 END IF;
 stamp := clock_timestamp();
 IF p_operation = 'create' THEN
   -- Serialize creates so the library cap cannot be exceeded concurrently.
   PERFORM pg_advisory_xact_lock(hashtextextended('page_patterns:create', 291));
   IF (SELECT count(*) FROM public.page_patterns) >= 200 THEN RAISE EXCEPTION 'PAGE_PATTERN_LIMIT'; END IF;
   INSERT INTO public.page_patterns(name,description,document,created_by,updated_by,created_at,updated_at)
   VALUES(p_values->>'name',p_values->>'description',p_values->'document',actor,actor,stamp,stamp)
   RETURNING * INTO pattern;
 ELSE
   SELECT * INTO pattern FROM public.page_patterns WHERE id=p_pattern_id FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'PAGE_PATTERN_NOT_FOUND' USING ERRCODE='P0002'; END IF;
   IF pattern.revision <> p_expected_revision THEN RAISE EXCEPTION 'PAGE_PATTERN_STALE'; END IF;
   IF p_operation = 'update' THEN
     UPDATE public.page_patterns SET name=p_values->>'name',description=p_values->>'description',document=p_values->'document',
       revision=gen_random_uuid(),updated_at=stamp,updated_by=actor
     WHERE id=pattern.id RETURNING * INTO pattern;
   ELSE
     DELETE FROM public.page_patterns WHERE id=pattern.id;
   END IF;
 END IF;
 INSERT INTO public.page_pattern_write_requests(actor_id,request_key,request,pattern_id) VALUES(actor,p_request_key,request,pattern.id);
 RETURN jsonb_build_object('pattern',CASE WHEN p_operation = 'delete' THEN NULL ELSE to_jsonb(pattern) END,'replayed',false);
END;
$$;
REVOKE ALL ON FUNCTION public.write_page_pattern(text,text,jsonb,uuid,uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.write_page_pattern(text,text,jsonb,uuid,uuid) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
