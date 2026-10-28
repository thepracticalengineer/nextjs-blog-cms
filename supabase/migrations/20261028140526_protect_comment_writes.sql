BEGIN;
-- ECMAScript trim whitespace, with CRLF/CR normalized to LF. PostgreSQL counts
-- Unicode code points, matching Array.from(normalized).length in the UI/action.
CREATE FUNCTION public.normalize_comment_content(content text)
RETURNS text LANGUAGE sql IMMUTABLE STRICT SET search_path = '' AS $$
 SELECT btrim(replace(replace(content, E'\r\n', E'\n'), E'\r', E'\n'),
   U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF')
$$;
REVOKE ALL ON FUNCTION public.normalize_comment_content(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.normalize_comment_content(text) TO authenticated, service_role;
-- Do not rewrite or delete historical comments. NOT VALID still enforces every
-- new insert/update, including privileged import paths.
ALTER TABLE public.comments ADD CONSTRAINT comments_normalized_content
 CHECK (content = public.normalize_comment_content(content)
   AND char_length(public.normalize_comment_content(content)) BETWEEN 1 AND 2000) NOT VALID;

-- All untrusted creates go through the transaction below. Deletes retain their
-- ownership/admin + MFA RLS; deleting never refunds a budget or receipt.
REVOKE ALL ON public.comments FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.comments TO anon, authenticated;
GRANT DELETE ON public.comments TO authenticated;
DROP POLICY "Authenticated users can create comments" ON public.comments;

CREATE TABLE auth_private.comment_write_budgets (
 user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
 minute_start timestamptz NOT NULL,
 minute_used integer NOT NULL,
 hour_start timestamptz NOT NULL,
 hour_used integer NOT NULL
);
ALTER TABLE auth_private.comment_write_budgets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON auth_private.comment_write_budgets FROM PUBLIC, anon, authenticated;
-- Retain minimal receipts after comment/post deletion so a delayed retry cannot
-- recreate moderated content. No content or public request IDs are stored here.
CREATE TABLE auth_private.comment_write_receipts (
 user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 request_id uuid NOT NULL,
 post_id uuid NOT NULL,
 content_hash bytea NOT NULL,
 comment_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY (user_id, request_id)
);
ALTER TABLE auth_private.comment_write_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON auth_private.comment_write_receipts FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.create_comment(p_post_id uuid, p_content text, p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
 actor uuid := auth.uid();
 normalized text := public.normalize_comment_content(p_content);
 fingerprint bytea;
 receipt auth_private.comment_write_receipts%ROWTYPE;
 budget auth_private.comment_write_budgets%ROWTYPE;
 instant timestamptz;
 retry_seconds integer;
 comment_id uuid;
BEGIN
 IF actor IS NULL OR NOT auth_private.has_required_assurance()
   OR NOT EXISTS (SELECT FROM public.profiles WHERE id=actor) THEN
  RAISE EXCEPTION 'COMMENT_AUTH_REQUIRED' USING ERRCODE='42501';
 END IF;
 IF p_request_id IS NULL OR p_post_id IS NULL OR normalized IS NULL
   OR char_length(normalized) NOT BETWEEN 1 AND 2000 THEN
  RAISE EXCEPTION 'COMMENT_INVALID' USING ERRCODE='23514';
 END IF;
 fingerprint := sha256(convert_to(normalized,'UTF8'));
 -- Parent first, matching post deletion. A share lock keeps publication stable
 -- until commit. A successful receipt can still be acknowledged after deletion.
 PERFORM 1 FROM public.posts WHERE id=p_post_id FOR SHARE;
 PERFORM pg_advisory_xact_lock(hashtextextended('comment-writes:' || actor::text,0));
 SELECT * INTO receipt FROM auth_private.comment_write_receipts
 WHERE user_id=actor AND request_id=p_request_id;
 IF FOUND THEN
  IF receipt.post_id <> p_post_id OR receipt.content_hash <> fingerprint THEN
   RAISE EXCEPTION 'COMMENT_REQUEST_CONFLICT' USING ERRCODE='23514';
  END IF;
  RETURN jsonb_build_object('id',receipt.comment_id);
 END IF;
 IF NOT EXISTS (SELECT FROM public.posts WHERE id=p_post_id AND status='published') THEN
  RAISE EXCEPTION 'COMMENT_UNAVAILABLE' USING ERRCODE='P0002';
 END IF;
 instant := clock_timestamp();
 INSERT INTO auth_private.comment_write_budgets(user_id,minute_start,minute_used,hour_start,hour_used)
 VALUES(actor,instant,0,instant,0) ON CONFLICT DO NOTHING;
 SELECT * INTO budget FROM auth_private.comment_write_budgets WHERE user_id=actor FOR UPDATE;
 IF budget.minute_start <= instant-interval '1 minute' THEN
  budget.minute_start := instant; budget.minute_used := 0;
 END IF;
 IF budget.hour_start <= instant-interval '1 hour' THEN
  budget.hour_start := instant; budget.hour_used := 0;
 END IF;
 retry_seconds := greatest(
  CASE WHEN budget.minute_used >= 5 THEN ceil(extract(epoch FROM budget.minute_start+interval '1 minute'-instant))::integer ELSE 0 END,
  CASE WHEN budget.hour_used >= 30 THEN ceil(extract(epoch FROM budget.hour_start+interval '1 hour'-instant))::integer ELSE 0 END);
 IF retry_seconds > 0 THEN
  RAISE EXCEPTION 'COMMENT_RATE_LIMIT' USING ERRCODE='P0001', DETAIL=retry_seconds::text;
 END IF;
 UPDATE auth_private.comment_write_budgets SET minute_start=budget.minute_start,
  minute_used=budget.minute_used+1,hour_start=budget.hour_start,hour_used=budget.hour_used+1
 WHERE user_id=actor;
 INSERT INTO public.comments(post_id,author_id,content) VALUES(p_post_id,actor,normalized) RETURNING id INTO comment_id;
 INSERT INTO auth_private.comment_write_receipts(user_id,request_id,post_id,content_hash,comment_id)
 VALUES(actor,p_request_id,p_post_id,fingerprint,comment_id);
 RETURN jsonb_build_object('id',comment_id);
END $$;
REVOKE ALL ON FUNCTION public.create_comment(uuid,text,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_comment(uuid,text,uuid) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
