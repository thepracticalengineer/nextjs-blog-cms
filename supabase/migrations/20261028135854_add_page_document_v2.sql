BEGIN;
-- Keep the original version-1 contract exactly, including its original limits.
CREATE FUNCTION pages_private.valid_document_v1(value jsonb) RETURNS boolean
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
CREATE FUNCTION pages_private.safe_page_href(value text) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
 SELECT COALESCE(char_length(value) BETWEEN 1 AND 2048
   AND value !~ U&'[\0001-\0020\007F\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]'
   AND position(chr(92) in value) = 0
   AND value !~* '^https?://[^/?#]*@'
   AND (value ~ '^/([^/]|$)' OR value ~ '^#' OR value ~* '^https?://[^/?#]+' OR value ~* '^mailto:[^@]+@[^@]+'), false);
$$;
CREATE OR REPLACE FUNCTION pages_private.valid_document(value jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE
 queue jsonb[]; depths integer[]; parents text[]; head integer := 1;
 node jsonb; attrs jsonb; children jsonb; mark jsonb; item record;
 kind text; parent text; depth integer; count integer := 0; expected integer;
 allowed text[]; seen text[]; compact_bytes bigint;
BEGIN
 IF value->'version' = '1'::jsonb THEN RETURN pages_private.valid_document_v1(value); END IF;
 IF value IS NULL OR jsonb_typeof(value) <> 'object' OR value - ARRAY['version','content'] <> '{}'::jsonb
   OR value->'version' IS DISTINCT FROM '2'::jsonb OR NOT value ? 'content' THEN RETURN false; END IF;
 -- Hard cap before tokenization. Compact JSON removes only formatting spaces,
 -- preserving spaces inside strings, so it matches the application's UTF-8 budget.
 IF octet_length(value::text) > 1048576 THEN RETURN false; END IF;
 SELECT sum(octet_length(CASE WHEN left(token[1],1) = '"' THEN token[1] ELSE replace(token[1], ' ', '') END))
 INTO compact_bytes FROM regexp_matches(value::text, '"(?:[^"\\]|\\.)*"|[^" ]+| +', 'g') AS token;
 IF compact_bytes > 262144 THEN RETURN false; END IF;
 queue := ARRAY[value->'content']; depths := ARRAY[0]; parents := ARRAY[''];
 WHILE head <= cardinality(queue) LOOP
   node := queue[head]; depth := depths[head]; parent := parents[head]; head := head + 1; count := count + 1;
   IF count > 1500 OR depth > 12 OR jsonb_typeof(node) IS DISTINCT FROM 'object'
     OR node - ARRAY['type','attrs','content','text','marks'] <> '{}'::jsonb
     OR jsonb_typeof(node->'type') IS DISTINCT FROM 'string' THEN RETURN false; END IF;
   kind := node->>'type';
   IF kind <> ALL(ARRAY['doc','paragraph','heading','bulletList','orderedList','listItem','blockquote','codeBlock','horizontalRule','hardBreak','text','section','columns','column','button','image']) THEN RETURN false; END IF;
   IF (CASE WHEN parent = '' THEN kind <> 'doc'
     WHEN parent = 'columns' THEN kind <> 'column'
     WHEN parent IN ('paragraph','heading') THEN kind NOT IN ('text','hardBreak')
     WHEN parent = 'codeBlock' THEN kind <> 'text'
     WHEN parent IN ('bulletList','orderedList') THEN kind <> 'listItem'
     ELSE kind NOT IN ('paragraph','heading','bulletList','orderedList','blockquote','codeBlock','horizontalRule','image','section','columns','button') END) THEN RETURN false; END IF;
   attrs := COALESCE(node->'attrs','{}'::jsonb);
   IF jsonb_typeof(attrs) <> 'object' THEN RETURN false; END IF;
   allowed := CASE WHEN kind IN ('section','column') THEN ARRAY['width','background','padding','gap','align']
     WHEN kind = 'columns' THEN ARRAY['width','background','padding','gap','align','preset']
     WHEN kind = 'heading' THEN ARRAY['level'] WHEN kind = 'orderedList' THEN ARRAY['start','type']
     WHEN kind = 'codeBlock' THEN ARRAY['language'] WHEN kind = 'button' THEN ARRAY['label','href','variant','align']
     WHEN kind = 'image' THEN ARRAY['src','alt','title','width','height','assetId'] ELSE ARRAY[]::text[] END;
   IF attrs - allowed <> '{}'::jsonb THEN RETURN false; END IF;
   FOR item IN SELECT * FROM jsonb_each(attrs) LOOP
     IF kind = 'image' THEN
       IF item.key = 'src' THEN
         -- Host configuration is deployment-specific and checked by the app.
         IF jsonb_typeof(item.value) <> 'string' OR NOT pages_private.safe_page_href(item.value #>> '{}')
           OR (item.value #>> '{}') !~* '^(https?://|/)' THEN RETURN false; END IF;
       ELSIF item.key IN ('width','height') THEN
         IF item.value <> 'null'::jsonb AND (jsonb_typeof(item.value) <> 'number' OR (item.value::text)::numeric NOT BETWEEN 1 AND 10000 OR trunc((item.value::text)::numeric) <> (item.value::text)::numeric) THEN RETURN false; END IF;
       ELSIF item.key = 'assetId' THEN
         IF item.value <> 'null'::jsonb AND (jsonb_typeof(item.value) <> 'string' OR (item.value #>> '{}') !~* '^([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$') THEN RETURN false; END IF;
       ELSIF item.value <> 'null'::jsonb AND (jsonb_typeof(item.value) <> 'string' OR char_length(item.value #>> '{}') > 1000) THEN RETURN false; END IF;
     ELSIF item.key IN ('level','start') THEN
       IF jsonb_typeof(item.value) <> 'number' OR (item.value::text)::numeric < 1 OR trunc((item.value::text)::numeric) <> (item.value::text)::numeric
         OR (item.value::text)::numeric > (CASE WHEN item.key = 'level' THEN 6 ELSE 2147483647 END) THEN RETURN false; END IF;
     ELSIF item.key = 'type' THEN IF item.value <> 'null'::jsonb THEN RETURN false; END IF;
     ELSIF item.key = 'language' THEN
       IF item.value <> 'null'::jsonb AND (jsonb_typeof(item.value) <> 'string' OR char_length(item.value #>> '{}') > 100) THEN RETURN false; END IF;
     ELSE
       IF jsonb_typeof(item.value) <> 'string' THEN RETURN false; END IF;
       IF (CASE item.key
         WHEN 'width' THEN (item.value #>> '{}') NOT IN ('content','wide','full')
         WHEN 'background' THEN (item.value #>> '{}') NOT IN ('default','muted','accent')
         WHEN 'padding' THEN (item.value #>> '{}') NOT IN ('none','sm','md','lg')
         WHEN 'gap' THEN (item.value #>> '{}') NOT IN ('none','sm','md','lg')
         WHEN 'align' THEN (item.value #>> '{}') NOT IN ('left','center','right')
         WHEN 'preset' THEN (item.value #>> '{}') NOT IN ('one','equal-two','wide-left','wide-right','equal-three')
         WHEN 'variant' THEN (item.value #>> '{}') NOT IN ('solid','outline')
         WHEN 'label' THEN char_length(item.value #>> '{}') NOT BETWEEN 1 AND 200
         WHEN 'href' THEN NOT pages_private.safe_page_href(item.value #>> '{}') ELSE true END) THEN RETURN false; END IF;
     END IF;
   END LOOP;
   IF kind = 'image' AND NOT attrs ? 'src' OR kind = 'button' AND NOT (attrs ? 'label' AND attrs ? 'href') THEN RETURN false; END IF;
   IF kind = 'text' THEN
     IF jsonb_typeof(node->'text') IS DISTINCT FROM 'string' OR char_length(node->>'text') NOT BETWEEN 1 AND 10000 OR node ? 'content' THEN RETURN false; END IF;
   ELSIF node ? 'text' THEN RETURN false; END IF;
   IF node ? 'marks' THEN
     IF kind NOT IN ('text','hardBreak') OR parent = 'codeBlock' OR jsonb_typeof(node->'marks') <> 'array' THEN RETURN false; END IF;
     IF jsonb_array_length(node->'marks') > 6 THEN RETURN false; END IF;
     seen := ARRAY[]::text[];
     FOR mark IN SELECT * FROM jsonb_array_elements(node->'marks') LOOP
       IF jsonb_typeof(mark) <> 'object' OR mark - ARRAY['type','attrs'] <> '{}'::jsonb OR jsonb_typeof(mark->'type') IS DISTINCT FROM 'string'
         OR mark->>'type' <> ALL(ARRAY['bold','italic','strike','underline','code','link']) OR mark->>'type' = ANY(seen) THEN RETURN false; END IF;
       seen := array_append(seen, mark->>'type');
       attrs := COALESCE(mark->'attrs','{}'::jsonb);
       IF jsonb_typeof(attrs) <> 'object' THEN RETURN false; END IF;
       IF mark->>'type' = 'link' THEN
         IF attrs - ARRAY['href','title','target','rel','class'] <> '{}'::jsonb OR jsonb_typeof(attrs->'href') IS DISTINCT FROM 'string' OR NOT pages_private.safe_page_href(attrs->>'href') THEN RETURN false; END IF;
         IF attrs ? 'title' AND attrs->'title' <> 'null'::jsonb AND (jsonb_typeof(attrs->'title') <> 'string' OR char_length(attrs->>'title') > 1000) THEN RETURN false; END IF;
         IF attrs ? 'target' AND attrs->'target' <> 'null'::jsonb AND attrs->'target' NOT IN ('"_blank"'::jsonb,'"_self"'::jsonb) THEN RETURN false; END IF;
         IF attrs ? 'rel' AND attrs->'rel' <> 'null'::jsonb AND attrs->'rel' NOT IN ('"noopener noreferrer nofollow"'::jsonb,'"noopener noreferrer"'::jsonb,'"nofollow"'::jsonb) THEN RETURN false; END IF;
         IF attrs ? 'class' AND attrs->'class' <> 'null'::jsonb THEN RETURN false; END IF;
       ELSIF attrs <> '{}'::jsonb THEN RETURN false; END IF;
     END LOOP;
   END IF;
   children := COALESCE(node->'content','[]'::jsonb);
   IF jsonb_typeof(children) <> 'array' THEN RETURN false; END IF;
   IF kind IN ('text','hardBreak','horizontalRule','button','image') AND node ? 'content' THEN RETURN false; END IF;
   IF kind = 'columns' THEN
     expected := CASE COALESCE(node->'attrs'->>'preset','equal-two') WHEN 'one' THEN 1 WHEN 'equal-three' THEN 3 ELSE 2 END;
     IF jsonb_array_length(children) <> expected THEN RETURN false; END IF;
   END IF;
   IF kind IN ('bulletList','orderedList','listItem','blockquote','section','column') AND jsonb_array_length(children) = 0 THEN RETURN false; END IF;
   IF kind = 'listItem' AND children->0->>'type' IS DISTINCT FROM 'paragraph' THEN RETURN false; END IF;
   IF cardinality(queue) + jsonb_array_length(children) > 1500 THEN RETURN false; END IF;
   FOR node IN SELECT * FROM jsonb_array_elements(children) LOOP
     queue := array_append(queue,node); depths := array_append(depths,depth+1); parents := array_append(parents,kind);
   END LOOP;
 END LOOP;
 RETURN true;
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN RETURN false;
END;
$$;
REVOKE ALL ON FUNCTION pages_private.safe_page_href(text), pages_private.valid_document(jsonb), pages_private.valid_document_v1(jsonb) FROM PUBLIC, anon, authenticated, service_role;
-- Constraints refer to valid_values, which resolves the expanded validator by name.
-- No writes, grants, snapshots, revisions or idempotency behavior change.
COMMIT;
