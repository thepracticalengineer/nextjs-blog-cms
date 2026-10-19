BEGIN;
-- No reactor list is exposed. Only the bounded aggregate/own-selection RPCs
-- below can read or mutate these rows, including through the direct Data API.
CREATE TABLE public.comment_reactions (
 comment_id uuid NOT NULL REFERENCES public.comments(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 reaction text NOT NULL CHECK (reaction IN ('like','love','celebrate','insightful')),
 PRIMARY KEY (comment_id,user_id)
);
CREATE INDEX comment_reactions_user_idx ON public.comment_reactions(user_id);
ALTER TABLE public.comment_reactions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.comment_reactions FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.comment_reactions TO service_role;

-- One bounded row per participant, removed with the account. No IP or request-body log.
CREATE TABLE auth_private.comment_reaction_budgets (
 user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
 window_start timestamptz NOT NULL,
 changes integer NOT NULL
);
ALTER TABLE auth_private.comment_reaction_budgets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON auth_private.comment_reaction_budgets FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.get_comment_reactions(p_post_id uuid, p_comment_id uuid DEFAULT NULL)
RETURNS TABLE(comment_id uuid, counts jsonb, selection text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 -- Match the existing public comment window; aggregate at most the displayed
 -- 1,000 comments rather than letting PostgREST truncate unrelated groups.
 WITH visible AS (
  SELECT c.id FROM public.comments c
  JOIN public.posts p ON p.id=c.post_id AND p.status='published'
  WHERE c.post_id=p_post_id AND (p_comment_id IS NULL OR c.id=p_comment_id)
  ORDER BY c.created_at,c.id LIMIT 1000
 )
 SELECT c.id,
  jsonb_build_object('like',count(*) FILTER (WHERE r.reaction='like'),
   'love',count(*) FILTER (WHERE r.reaction='love'),
   'celebrate',count(*) FILTER (WHERE r.reaction='celebrate'),
   'insightful',count(*) FILTER (WHERE r.reaction='insightful')),
  max(r.reaction) FILTER (WHERE r.user_id = (SELECT auth.uid())
    AND (SELECT auth_private.has_required_assurance()))
 FROM visible c
 LEFT JOIN public.comment_reactions r ON r.comment_id=c.id
 GROUP BY c.id
$$;
REVOKE ALL ON FUNCTION public.get_comment_reactions(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_comment_reactions(uuid,uuid) TO anon, authenticated;

-- Explicit desired state, never a toggle. Repeating a successful set/remove
-- changes nothing and consumes no additional budget. Latest committed set wins.
CREATE FUNCTION public.set_comment_reaction(p_comment_id uuid, p_reaction text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
 actor uuid := auth.uid();
 target_post uuid;
 previous text;
 used integer;
 result jsonb;
BEGIN
 IF actor IS NULL OR NOT auth_private.has_required_assurance()
   OR NOT EXISTS (SELECT FROM public.profiles WHERE id=actor) THEN
  RAISE EXCEPTION 'REACTION_AUTH_REQUIRED' USING ERRCODE='42501';
 END IF;
 IF p_reaction IS NOT NULL AND p_reaction NOT IN ('like','love','celebrate','insightful') THEN
  RAISE EXCEPTION 'REACTION_INVALID' USING ERRCODE='23514';
 END IF;
 SELECT post_id INTO target_post FROM public.comments WHERE id=p_comment_id;
 -- Lock publication first, matching post deletion's parent -> child order.
 PERFORM 1 FROM public.posts WHERE id=target_post AND status='published' FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'REACTION_UNAVAILABLE' USING ERRCODE='P0002'; END IF;
 PERFORM 1 FROM public.comments WHERE id=p_comment_id AND post_id=target_post FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'REACTION_UNAVAILABLE' USING ERRCODE='P0002'; END IF;
 -- Serialize the actor's budget and selection across tabs/server instances.
 PERFORM pg_advisory_xact_lock(hashtextextended('comment-reactions:' || actor::text,0));
 SELECT reaction INTO previous FROM public.comment_reactions WHERE comment_id=p_comment_id AND user_id=actor;
 IF previous IS DISTINCT FROM p_reaction THEN
  INSERT INTO auth_private.comment_reaction_budgets AS b(user_id,window_start,changes)
  VALUES(actor,clock_timestamp(),1)
  ON CONFLICT(user_id) DO UPDATE SET
   window_start=CASE WHEN b.window_start <= clock_timestamp()-interval '1 minute' THEN clock_timestamp() ELSE b.window_start END,
   changes=CASE WHEN b.window_start <= clock_timestamp()-interval '1 minute' THEN 1 ELSE b.changes+1 END
  RETURNING changes INTO used;
  IF used > 30 THEN RAISE EXCEPTION 'REACTION_RATE_LIMIT' USING ERRCODE='P0001'; END IF;
  IF p_reaction IS NULL THEN
   DELETE FROM public.comment_reactions WHERE comment_id=p_comment_id AND user_id=actor;
  ELSE
   INSERT INTO public.comment_reactions(comment_id,user_id,reaction) VALUES(p_comment_id,actor,p_reaction)
   ON CONFLICT(comment_id,user_id) DO UPDATE SET reaction=EXCLUDED.reaction;
  END IF;
 END IF;
 SELECT jsonb_build_object('counts',s.counts,'selection',s.selection) INTO result
 FROM public.get_comment_reactions(target_post,p_comment_id) s WHERE s.comment_id=p_comment_id;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.set_comment_reaction(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_comment_reaction(uuid,text) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
